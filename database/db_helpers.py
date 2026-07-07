"""
database/db_helpers.py
───────────────────────
Shared helpers used by recording_store and transcript_store.

The Supabase tables use an internal UUID `calls.id` as FK,
but the application identifies calls by `call_session_id` (text).
These helpers resolve that mapping.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException
from utils.supabase_client import supabase


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_call_id_from_session(call_session_id: str) -> Optional[str]:
    """
    Look up the internal UUID (calls.id) for a given call_session_id text.
    Returns None if no matching row exists.
    """
    try:
        result = (
            supabase.table("calls")
            .select("id")
            .eq("call_session_id", call_session_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["id"]
        return None
    except Exception as e:
        print(f"⚠️  db_helpers.get_call_id_from_session error: {e}")
        return None


def ensure_call_row(
    call_session_id: str,
    call_control_id: Optional[str] = None,
    from_number: Optional[str] = None,
    to_number: Optional[str] = None,
    direction: Optional[str] = None,
) -> Optional[str]:
    """
    Upsert a minimal calls row and return its UUID.
    Used when a recording/transcript arrives before the call row was created
    (e.g. if the server restarted between call.initiated and call.recording.saved).
    Returns the call UUID or None on failure.
    """
    try:
        result = (
            supabase.table("calls")
            .upsert(
                {
                    "call_session_id": call_session_id,
                    "call_control_id": call_control_id,
                    "from_number":     from_number,
                    "to_number":       to_number,
                    "direction":       direction,
                    "status":          "initiated",
                    "created_at":      now_iso(),
                },
                on_conflict="call_session_id",
            )
            .execute()
        )
        if result.data:
            return result.data[0]["id"]
        return None
    except Exception as e:
        print(f"⚠️  db_helpers.ensure_call_row error: {e}")
        return None


def get_or_create_call_id(call_session_id: str, **kwargs) -> Optional[str]:
    """
    Get call UUID if exists, otherwise create a stub row.
    Pass any known fields as kwargs (call_control_id, from_number, etc.).
    """
    call_id = get_call_id_from_session(call_session_id)
    if call_id:
        return call_id
    return ensure_call_row(call_session_id, **kwargs)
