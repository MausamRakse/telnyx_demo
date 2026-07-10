"""
services/campaign_service.py
─────────────────────────────
Campaign CRUD, contact upload/validation, and CDR reconciliation.

Database access: uses the same `supabase` singleton from utils/supabase_client.py.
No ORM — raw Supabase Python client calls, matching existing project conventions.
"""

import csv
import io
import asyncio
from datetime import datetime, timezone
from typing import Optional

import phonenumbers

from config import settings
from utils.supabase_client import supabase
from utils.telnyx_client import telnyx
from schemas.campaign import (
    CampaignCreate,
    ContactUploadResult,
    FailedRow,
    CampaignProgress,
    CDRReconcileResult,
    CDRRecord,
)


# ── Valid state-machine transitions ───────────────────────────────────────────
_VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft":     ["running"],
    "running":   ["paused", "stopped", "completed"],
    "paused":    ["running", "stopped"],
    "completed": [],   # terminal — no further transitions
    "stopped":   [],   # terminal — no further transitions
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_e164(raw: str) -> Optional[str]:
    """
    Try to parse `raw` as an E.164 phone number.
    Returns the normalized E.164 string or None if invalid.
    Handles numbers with/without leading '+', spaces, dashes, parens.
    """
    if not raw:
        return None
    raw = str(raw).strip()
    # If no leading '+', assume international (try as-is, then prepend '+')
    for attempt in [raw, f"+{raw}"]:
        try:
            parsed = phonenumbers.parse(attempt, None)
            if phonenumbers.is_valid_number(parsed):
                return phonenumbers.format_number(
                    parsed, phonenumbers.PhoneNumberFormat.E164
                )
        except phonenumbers.NumberParseException:
            continue
    return None


def _validate_campaign_exists(campaign_id: str) -> dict:
    """Fetch campaign row or raise ValueError."""
    result = (
        supabase.table("campaigns")
        .select("*")
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Campaign {campaign_id} not found")
    return result.data[0]


# ── Campaign CRUD ─────────────────────────────────────────────────────────────

def create_campaign(data: CampaignCreate) -> dict:
    """Insert a new campaign row with status='draft'."""
    row = {
        "name":             data.name,
        "status":           "draft",
        "connection_id":    data.connection_id,
        "from_number":      data.from_number,
        "max_concurrent":   data.max_concurrent,
        "calls_per_second": data.calls_per_second,
        "created_at":       _now_iso(),
    }
    result = supabase.table("campaigns").insert(row).execute()
    if not result.data:
        raise RuntimeError("Failed to insert campaign row")
    return result.data[0]


def list_campaigns() -> list[dict]:
    """
    Return all campaigns from the campaigns table, merged with progress stats
    from the campaign_progress view in Python.
    """
    camp_res = supabase.table("campaigns").select("*").order("created_at", desc=True).execute()
    camps = camp_res.data or []
    if not camps:
        return []

    # Fetch progress stats
    prog_res = supabase.table("campaign_progress").select("*").execute()
    prog_map = {p["campaign_id"]: p for p in (prog_res.data or [])}

    # Merge progress stats into campaign dicts
    for c in camps:
        p = prog_map.get(c["id"]) or {}
        c["total_contacts"] = p.get("total_contacts", 0)
        c["pending"]        = p.get("pending", 0)
        c["queued"]         = p.get("queued", 0)
        c["calling"]        = p.get("calling", 0)
        c["answered"]       = p.get("answered", 0)
        c["no_answer"]      = p.get("no_answer", 0)
        c["voicemail"]      = p.get("voicemail", 0)
        c["busy"]           = p.get("busy", 0)
        c["failed"]         = p.get("failed", 0)
        c["total_dialed"]   = p.get("total_dialed", 0)

    return camps



def get_campaign(campaign_id: str) -> dict:
    """Return a single campaign with its progress aggregate."""
    campaign = _validate_campaign_exists(campaign_id)
    # Fetch progress from view
    prog = (
        supabase.table("campaign_progress")
        .select("*")
        .eq("campaign_id", campaign_id)
        .limit(1)
        .execute()
    )
    if prog.data:
        campaign.update(prog.data[0])
    return campaign


def get_campaign_progress(campaign_id: str) -> CampaignProgress:
    """Return real-time progress counts from the campaign_progress view."""
    _validate_campaign_exists(campaign_id)  # 404 guard
    result = (
        supabase.table("campaign_progress")
        .select("*")
        .eq("campaign_id", campaign_id)
        .limit(1)
        .execute()
    )
    row = result.data[0] if result.data else {}
    total_dialed = int(row.get("total_dialed", 0))
    answered     = int(row.get("answered", 0))
    answer_rate  = round((answered / total_dialed * 100), 1) if total_dialed else 0.0
    return CampaignProgress(
        campaign_id     = campaign_id,
        campaign_name   = row.get("campaign_name", ""),
        campaign_status = row.get("campaign_status", ""),
        total_contacts  = int(row.get("total_contacts", 0)),
        pending         = int(row.get("pending", 0)),
        queued          = int(row.get("queued", 0)),
        calling         = int(row.get("calling", 0)),
        answered        = answered,
        no_answer       = int(row.get("no_answer", 0)),
        voicemail       = int(row.get("voicemail", 0)),
        busy            = int(row.get("busy", 0)),
        failed          = int(row.get("failed", 0)),
        total_dialed    = total_dialed,
        answer_rate_pct = answer_rate,
    )


def get_campaign_contacts(campaign_id: str, page: int = 1, page_size: int = 50) -> dict:
    """Return a paginated list of contacts for a campaign."""
    _validate_campaign_exists(campaign_id)
    offset = (page - 1) * page_size
    result = (
        supabase.table("campaign_contacts")
        .select("*")
        .eq("campaign_id", campaign_id)
        .order("created_at", desc=False)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    # Count total
    count_result = (
        supabase.table("campaign_contacts")
        .select("id", count="exact")
        .eq("campaign_id", campaign_id)
        .execute()
    )
    total = count_result.count if count_result.count is not None else len(result.data or [])
    return {
        "campaign_id": campaign_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "contacts": result.data or [],
    }


# ── State Machine ─────────────────────────────────────────────────────────────

def validate_transition(current: str, target: str) -> None:
    """
    Raise ValueError if target_status is not reachable from current_status.
    Only the backend can set 'completed' — external callers use start/pause/stop.
    """
    allowed = _VALID_TRANSITIONS.get(current, [])
    if target not in allowed:
        raise ValueError(
            f"Invalid campaign status transition: '{current}' → '{target}'. "
            f"Allowed from '{current}': {allowed or ['(none — terminal state)']}"
        )


def _set_campaign_status(campaign_id: str, status: str, **extra_fields) -> dict:
    """Update campaign status and any extra timestamp fields."""
    payload = {"status": status, **extra_fields}
    result = (
        supabase.table("campaigns")
        .update(payload)
        .eq("id", campaign_id)
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"Failed to update campaign {campaign_id} to status={status}")
    return result.data[0]


# ── Contact Upload ────────────────────────────────────────────────────────────

def _parse_file_to_rows(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Parse CSV or XLSX bytes into a list of dicts.
    Supports .csv, .xlsx, .xls.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    if ext == "csv":
        text = file_bytes.decode("utf-8-sig", errors="replace")  # handle BOM
        reader = csv.DictReader(io.StringIO(text))
        return [dict(row) for row in reader]

    elif ext in ("xlsx", "xls"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
        result = []
        for row in rows[1:]:
            if all(cell is None for cell in row):
                continue  # skip blank rows
            result.append({headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)})
        return result

    raise ValueError(f"Unsupported file type: .{ext}. Use .csv, .xlsx, or .xls")


def upload_contacts(campaign_id: str, file_bytes: bytes, filename: str) -> ContactUploadResult:
    """
    Parse CSV/XLSX bytes, validate phone numbers to E.164, and bulk-insert
    valid contacts into campaign_contacts table.

    Returns ContactUploadResult with success_count and failed_rows details.

    Common CSV column names accepted for phone: phone_number, phone, number, mobile
    Common CSV column names accepted for name: name, full_name, contact_name, participant_identity
    """
    _validate_campaign_exists(campaign_id)

    rows = _parse_file_to_rows(file_bytes, filename)
    if not rows:
        raise ValueError("File is empty or could not be parsed — no data rows found")

    # Normalise column names (lowercase, stripped)
    PHONE_COLS = {"phone_number", "phone", "number", "mobile", "tel", "contact_number"}
    NAME_COLS  = {"name", "full_name", "contact_name", "participant_identity", "customer_name"}

    success_rows: list[dict] = []
    failed_rows:  list[FailedRow] = []

    for idx, raw_row in enumerate(rows, start=2):  # row 1 = header
        # Find phone column (case-insensitive)
        phone_raw = None
        for col_key in raw_row:
            if col_key.strip().lower() in PHONE_COLS:
                phone_raw = raw_row[col_key]
                break

        if not phone_raw:
            failed_rows.append(FailedRow(
                row_number=idx,
                data=raw_row,
                reason="No phone number column found. Expected: phone_number, phone, mobile, number, or tel",
            ))
            continue

        # Validate/normalise to E.164
        e164 = _normalize_e164(str(phone_raw))
        if not e164:
            failed_rows.append(FailedRow(
                row_number=idx,
                data=raw_row,
                reason=f"Invalid phone number '{phone_raw}' — could not parse as E.164 (include country code, e.g. +1...)",
            ))
            continue

        # Find optional name column
        name_val = None
        for col_key in raw_row:
            if col_key.strip().lower() in NAME_COLS:
                name_val = raw_row[col_key] or None
                break

        success_rows.append({
            "campaign_id":  campaign_id,
            "phone_number": e164,
            "name":         name_val,
            "call_status":  "pending",
            "retry_count":  0,
            "created_at":   _now_iso(),
        })

    # Bulk insert in batches of 100 to stay within Supabase payload limits
    inserted = 0
    BATCH = 100
    for i in range(0, len(success_rows), BATCH):
        batch = success_rows[i:i + BATCH]
        result = supabase.table("campaign_contacts").insert(batch).execute()
        inserted += len(result.data or [])

    print(f"✅ Campaign {campaign_id}: uploaded {inserted} contacts, {len(failed_rows)} failed")

    return ContactUploadResult(
        campaign_id   = campaign_id,
        success_count = inserted,
        failed_count  = len(failed_rows),
        failed_rows   = failed_rows,
    )


# ── CDR Reconciliation ────────────────────────────────────────────────────────

# Maps Telnyx CDR status strings to our internal call_status enum values
_CDR_STATUS_MAP = {
    "answered": "answered",
    "completed": "answered",
    "no-answer": "no_answer",
    "no_answer": "no_answer",
    "busy": "busy",
    "failed": "failed",
    "cancel": "no_answer",
    "machine": "voicemail",
}


async def reconcile_cdr(campaign_id: str) -> CDRReconcileResult:
    """
    For each completed/ended contact that has a call_session_id, query the
    Telnyx Detail Records API and correct any local status discrepancies.

    Only updates contacts where CDR status differs from local status.
    """
    _validate_campaign_exists(campaign_id)

    # Get all contacts that have a call_session_id (i.e., we got past dialing)
    contacts_result = (
        supabase.table("campaign_contacts")
        .select("id, call_session_id, call_status")
        .eq("campaign_id", campaign_id)
        .not_.is_("call_session_id", "null")
        .execute()
    )
    contacts = contacts_result.data or []

    if not contacts:
        return CDRReconcileResult(
            campaign_id=campaign_id,
            contacts_checked=0,
            contacts_updated=0,
        )

    records_out: list[CDRRecord] = []
    updated    = 0
    errors     : list[str] = []

    for contact in contacts:
        session_id = contact.get("call_session_id")
        if not session_id:
            continue
        try:
            resp = await telnyx.get(
                "/detail_records",
                params={"filter[call_session_id]": session_id, "page[size]": 5},
            )
            if resp.status_code != 200:
                errors.append(f"CDR fetch failed for session {session_id}: HTTP {resp.status_code}")
                continue

            cdr_data = resp.json().get("data", [])
            if not cdr_data:
                continue

            # Use the first record (most recent leg)
            r = cdr_data[0].get("attributes", cdr_data[0])
            cdr_status_raw = (r.get("status") or r.get("call_status") or "").lower()
            cdr_status     = _CDR_STATUS_MAP.get(cdr_status_raw, "failed")

            records_out.append(CDRRecord(
                call_session_id = session_id,
                call_leg_id     = r.get("call_leg_id"),
                from_number     = r.get("from") or r.get("from_number"),
                to_number       = r.get("to") or r.get("to_number"),
                direction       = r.get("direction"),
                duration_secs   = r.get("duration_secs") or r.get("duration"),
                status          = cdr_status,
                hangup_cause    = r.get("hangup_cause"),
                start_time      = r.get("start_time"),
                end_time        = r.get("end_time"),
                answered_at     = r.get("answered_at"),
            ))

            # Only update if status differs
            if cdr_status != contact.get("call_status"):
                supabase.table("campaign_contacts").update({
                    "call_status":  cdr_status,
                    "hangup_cause": r.get("hangup_cause") or contact.get("hangup_cause"),
                }).eq("id", contact["id"]).execute()
                updated += 1
                print(f"   🔄 CDR reconcile: contact {contact['id']} "
                      f"{contact['call_status']} → {cdr_status}")

        except Exception as e:
            errors.append(f"Error reconciling session {session_id}: {e}")
            print(f"   ⚠️  CDR reconcile error for {session_id}: {e}")

        # Brief pause between CDR requests to avoid hitting rate limits
        await asyncio.sleep(0.1)

    return CDRReconcileResult(
        campaign_id       = campaign_id,
        contacts_checked  = len(contacts),
        contacts_updated  = updated,
        records           = records_out,
        errors            = errors,
    )
