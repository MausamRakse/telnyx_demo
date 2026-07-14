"""
api/campaign/routes.py
───────────────────────
All HTTP endpoints for the Calling Campaign feature.
Mounted at /api/campaigns/ via api/router.py.

Follows the same pattern as api/call/routes.py:
  - FastAPI APIRouter
  - Thin route handlers that delegate to service functions
  - Consistent JSON error responses via HTTPException
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from schemas.campaign import (
    CampaignCreate,
    CampaignResponse,
    ContactUploadResult,
    CampaignProgress,
    CDRReconcileResult,
)
from services import campaign_service, dialer_service

router = APIRouter()


# ── Create a campaign ─────────────────────────────────────────────────────────

@router.post("/", response_model=dict, summary="Create a new campaign (status: draft)")
async def create_campaign(body: CampaignCreate):
    """
    Create a new calling campaign in 'draft' status.
    Contacts are uploaded separately via POST /campaigns/{id}/upload.
    """
    try:
        row = campaign_service.create_campaign(body)
        return {"success": True, "campaign": row}
    except Exception as e:
        err = str(e)
        # PGRST204 = column missing from DB schema cache → migration not run
        if "PGRST204" in err or "assistant_id" in err and "column" in err.lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Database migration not applied: the 'assistant_id' column is "
                    "missing from the 'campaigns' table. "
                    "Please run migration 0003_campaign_assistant.sql in the "
                    "Supabase Dashboard → SQL Editor, then run: "
                    "NOTIFY pgrst, 'reload schema';"
                )
            )
        raise HTTPException(status_code=500, detail=err)


# ── List campaigns ────────────────────────────────────────────────────────────

@router.get("/", summary="List all campaigns with aggregate progress")
async def list_campaigns():
    """Return all campaigns including real-time contact progress counts."""
    try:
        campaigns = campaign_service.list_campaigns()
        return {"campaigns": campaigns, "count": len(campaigns)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Single campaign detail ────────────────────────────────────────────────────

@router.get("/{campaign_id}", summary="Get a single campaign")
async def get_campaign(campaign_id: str):
    """Return campaign details + aggregate progress."""
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        return {"campaign": campaign}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Upload contacts ───────────────────────────────────────────────────────────

@router.post("/{campaign_id}/upload", response_model=ContactUploadResult,
             summary="Upload CSV/XLSX contact list")
async def upload_contacts(
    campaign_id: str,
    file: UploadFile = File(..., description="CSV or XLSX file with phone_number column"),
):
    """
    Parse a CSV or XLSX file, validate phone numbers to E.164, and store
    valid contacts linked to this campaign.

    Returns ContactUploadResult with success_count and details of any failed rows.
    Supports columns: phone_number (required), name / full_name / participant_identity (optional).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    allowed_exts = {".csv", ".xlsx", ".xls"}
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Upload a .csv, .xlsx, or .xls file."
        )

    try:
        file_bytes = await file.read()
        result = campaign_service.upload_contacts(campaign_id, file_bytes, file.filename)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Start campaign ────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/start", summary="Start or resume a campaign")
async def start_campaign(campaign_id: str):
    """
    Transition campaign draft→running or paused→running.
    Launches the async dialer engine in the background.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        current_status = campaign.get("status", "")

        # Validate state machine transition
        campaign_service.validate_transition(current_status, "running")

        # Guard: campaign must have an AI Assistant — prevent silent calls
        campaign_service.validate_ready_to_run(campaign)

        # Update DB status
        campaign_service._set_campaign_status(
            campaign_id, "running",
            started_at=campaign_service._now_iso() if current_status == "draft" else None,
        )

        # Launch background dialer task
        await dialer_service.start_campaign_dialer(campaign_id)

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "running",
            "message": "Campaign started. Dialer is running in the background.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Pause campaign ────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/pause", summary="Pause a running campaign")
async def pause_campaign(campaign_id: str):
    """
    Stop the dialer from placing new calls.
    In-flight calls continue until they complete naturally.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        campaign_service.validate_transition(campaign.get("status", ""), "paused")

        # Cancel the background dialer task first, then update status
        await dialer_service.stop_campaign_dialer(campaign_id)
        campaign_service._set_campaign_status(campaign_id, "paused")

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "paused",
            "message": "Campaign paused. In-flight calls will complete naturally.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stop campaign ─────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/stop", summary="Stop a campaign permanently")
async def stop_campaign(campaign_id: str):
    """
    Permanently stop the campaign. Remaining pending/queued contacts
    are left as-is (not dialed). Cannot be resumed.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        campaign_service.validate_transition(campaign.get("status", ""), "stopped")

        await dialer_service.stop_campaign_dialer(campaign_id)
        campaign_service._set_campaign_status(campaign_id, "stopped")

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "stopped",
            "message": "Campaign stopped permanently.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Real-time progress ────────────────────────────────────────────────────────

@router.get("/{campaign_id}/progress", response_model=CampaignProgress,
            summary="Get real-time campaign progress")
async def get_campaign_progress(campaign_id: str):
    """
    Return real-time counts of contacts by status.
    Frontend polls this every 5 seconds while campaign is running.
    """
    try:
        return campaign_service.get_campaign_progress(campaign_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Contact list ──────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/contacts", summary="Get paginated contact list")
async def get_campaign_contacts(
    campaign_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Contacts per page"),
):
    """Return paginated contacts with their current call statuses."""
    try:
        return campaign_service.get_campaign_contacts(campaign_id, page, page_size)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── CDR Reconciliation ────────────────────────────────────────────────────────

@router.post("/{campaign_id}/reconcile", response_model=CDRReconcileResult,
             summary="Reconcile contact statuses against Telnyx CDR API")
async def reconcile_campaign(campaign_id: str):
    """
    Query the Telnyx Detail Records (CDR) API for each contact that has a
    call_session_id and correct any discrepancies in the local call_status.

    Recommended to run once after a campaign reaches 'completed' status
    for authoritative final reporting.
    """
    try:
        result = await campaign_service.reconcile_cdr(campaign_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── On-demand transcript fetch for a specific contact ─────────────────────────

@router.get(
    "/{campaign_id}/contacts/{contact_id}/transcript",
    summary="Fetch or refresh transcript for a specific campaign contact",
)
async def get_contact_transcript(campaign_id: str, contact_id: str):
    """
    Fetch the AI conversation transcript for a specific campaign contact.

    Looks up the contact's call_session_id, then returns transcript messages
    from the database. If none are found, attempts a live fetch from Telnyx
    AI Conversations API (with up to 3 retries) and stores the result.

    Returns:
        {
            "contact_id": str,
            "call_session_id": str | None,
            "transcript": str | None,   ← formatted "Speaker: text\\n" lines
            "messages": [...],          ← structured message objects
        }
    """
    from utils.supabase_client import supabase
    from services.transcript_service import fetch_transcript_with_retries
    from database.transcript_store import get_transcript

    # 1. Look up contact
    try:
        contact_res = (
            supabase.table("campaign_contacts")
            .select("id, campaign_id, call_session_id, call_status")
            .eq("id", contact_id)
            .eq("campaign_id", campaign_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found in this campaign")

    contact = contact_res.data[0]
    session_id = contact.get("call_session_id")

    if not session_id:
        return {
            "contact_id":      contact_id,
            "call_session_id": None,
            "transcript":      None,
            "messages":        [],
            "note":            "No call_session_id recorded — call may not have been answered yet",
        }

    # 2. Try to get from DB first (fast path)
    record = get_transcript(session_id)
    if not record or not record.get("messages"):
        # 3. Not in DB — fetch live from Telnyx with retries
        record = await fetch_transcript_with_retries(
            call_session_id=session_id,
            retries=3,
            delay_secs=2.0,
            campaign_id=campaign_id,
            contact_id=contact_id,
        )

    if not record or not record.get("messages"):
        return {
            "contact_id":      contact_id,
            "call_session_id": session_id,
            "transcript":      None,
            "messages":        [],
            "note":            "No transcript available yet — it may still be processing",
        }

    # 4. Build formatted text
    lines = [
        f"{m['speaker']}: {m['text']}"
        for m in record["messages"]
        if (m.get("text") or "").strip()
    ]
    formatted = "\n".join(lines) if lines else None

    return {
        "contact_id":      contact_id,
        "call_session_id": session_id,
        "transcript":      formatted,
        "messages":        record["messages"],
    }

