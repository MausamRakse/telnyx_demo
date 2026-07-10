"""
services/assistant_service.py
──────────────────────────────
Proxy to Telnyx /ai/assistants API.
After each successful Telnyx operation, mirrors the result to
the local Supabase `assistants` table for queryability.
"""

from datetime import datetime, timezone
from fastapi import HTTPException
from schemas.assistant import CreateAssistantRequest, UpdateAssistantRequest
from utils.telnyx_client import telnyx
from utils.supabase_client import supabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _telnyx_to_db_row(telnyx_data: dict) -> dict:
    """Map Telnyx API response fields to the local assistants table schema."""
    return {
        "telnyx_assistant_id":   telnyx_data.get("id", ""),
        "name":                  telnyx_data.get("name", ""),
        "instructions":          telnyx_data.get("instructions"),
        "model":                 telnyx_data.get("model"),
        "greeting":              telnyx_data.get("greeting"),
        "voice_settings":        telnyx_data.get("voice_settings") or {},
        "transcription_settings": telnyx_data.get("transcription") or {},
        "tags":                  telnyx_data.get("tags") or [],
        "is_active":             True,
        "updated_at":            _now_iso(),
    }


async def create_assistant(payload: CreateAssistantRequest) -> dict:
    """Create a new AI assistant on Telnyx, then mirror to Supabase."""
    data = payload.model_dump(exclude_none=True)
    r = await telnyx.post("/ai/assistants", json=data)

    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.json())

    result = r.json()
    telnyx_data = result.get("data", result)

    # Mirror to Supabase
    try:
        row = _telnyx_to_db_row(telnyx_data)
        row["created_at"] = _now_iso()
        supabase.table("assistants").upsert(
            row, on_conflict="telnyx_assistant_id"
        ).execute()
        print(f"   💾 Assistant '{row['name']}' saved to Supabase")
    except Exception as e:
        print(f"   ⚠️  assistants DB upsert failed (non-fatal): {e}")

    return result


async def list_assistants() -> dict:
    """List all AI assistants from Telnyx."""
    r = await telnyx.get("/ai/assistants")

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.json())

    return r.json()


async def get_assistant(
    assistant_id: str,
    fetch_dynamic_variables_from_webhook: bool = False,
    from_number: str = None,
    to_number: str = None,
    call_control_id: str = None,
) -> dict:
    """Get a specific AI assistant from Telnyx."""
    params = {}
    if fetch_dynamic_variables_from_webhook:
        params["fetch_dynamic_variables_from_webhook"] = "true"
    if from_number:
        params["from"] = from_number
    if to_number:
        params["to"] = to_number
    if call_control_id:
        params["call_control_id"] = call_control_id

    r = await telnyx.get(f"/ai/assistants/{assistant_id}", params=params)

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.json())

    return r.json()


async def update_assistant(assistant_id: str, payload: UpdateAssistantRequest) -> dict:
    """Update a specific AI assistant on Telnyx, then mirror to Supabase."""
    data = payload.model_dump(exclude_none=True)
    r = await telnyx.post(f"/ai/assistants/{assistant_id}", json=data)

    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.json())

    result = r.json()
    telnyx_data = result.get("data", result)

    # Mirror update to Supabase
    try:
        row = _telnyx_to_db_row(telnyx_data)
        supabase.table("assistants").update(row).eq(
            "telnyx_assistant_id", assistant_id
        ).execute()
        print(f"   💾 Assistant '{assistant_id}' updated in Supabase")
    except Exception as e:
        print(f"   ⚠️  assistants DB update failed (non-fatal): {e}")

    return result


async def delete_assistant(assistant_id: str) -> dict:
    """
    Delete a specific AI assistant from Telnyx.
    Soft-deletes the local Supabase row (is_active=False) to preserve
    FK integrity with the calls table.
    """
    r = await telnyx.delete(f"/ai/assistants/{assistant_id}")

    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)

    # Soft-delete in Supabase (preserve FK from calls.assistant_id)
    try:
        supabase.table("assistants").update({
            "is_active":  False,
            "updated_at": _now_iso(),
        }).eq("telnyx_assistant_id", assistant_id).execute()
        print(f"   💾 Assistant '{assistant_id}' soft-deleted in Supabase")
    except Exception as e:
        print(f"   ⚠️  assistants DB soft-delete failed (non-fatal): {e}")

    try:
        return r.json()
    except Exception:
        return {"status": "success", "id": assistant_id}
