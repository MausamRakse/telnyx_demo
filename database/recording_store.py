"""
database/recording_store.py
────────────────────────────
Supabase-backed recording store.

All function signatures are identical to the old in-memory version,
so services/recording_service.py requires zero changes.

Table: public.recordings
  recording_id (text, unique) — Telnyx recording UUID
  call_id      (uuid, FK → calls.id)
  status       — 'initiated' | 'completed' | 'failed'
  mp3_url, wav_url, duration_secs, created_at, fetched_at
"""

from typing import Optional
from fastapi import HTTPException
from utils.supabase_client import supabase
from database.db_helpers import get_or_create_call_id, now_iso


# ─────────────────────────────────────────────────────────────────────────────
# Internal: map the app's flat dict ↔ Supabase row schema
# ─────────────────────────────────────────────────────────────────────────────

def _row_to_record(row: dict, call_session_id: Optional[str] = None) -> dict:
    """Convert a Supabase recordings row back to the app-facing dict shape."""
    # Resolve call_session_id from nested calls join if available
    calls_join = row.get("calls") or {}
    session_id = call_session_id or calls_join.get("call_session_id")

    return {
        "recording_id":    row.get("recording_id"),
        "call_session_id": session_id,
        "status":          row.get("status", "initiated"),
        "duration_secs":   row.get("duration_secs"),
        "created_at":      row.get("created_at"),
        "from_number":     calls_join.get("from_number"),
        "to_number":       calls_join.get("to_number"),
        "download_urls":   {
            "mp3": row.get("mp3_url"),
            "wav": row.get("wav_url"),
        },
        "fetched_at": row.get("fetched_at"),
    }


def _record_to_row(record: dict) -> dict:
    """Convert an app-facing dict to a Supabase recordings row."""
    urls = record.get("download_urls") or {}
    return {
        "recording_id": record["recording_id"],
        "status":       record.get("status", "initiated"),
        "duration_secs": record.get("duration_secs"),
        "mp3_url":      urls.get("mp3"),
        "wav_url":      urls.get("wav"),
        "created_at":   record.get("created_at"),
        "fetched_at":   record.get("fetched_at") or now_iso(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public API (same signatures as the old in-memory store)
# ─────────────────────────────────────────────────────────────────────────────

def upsert_recording(record: dict) -> dict:
    """
    Insert or update a recording entry by recording_id.
    Resolves call_session_id → call_id UUID via the calls table.
    """
    call_session_id = record.get("call_session_id")
    call_id = None

    if call_session_id:
        call_id = get_or_create_call_id(
            call_session_id,
            from_number=record.get("from_number"),
            to_number=record.get("to_number"),
        )

    row = _record_to_row(record)
    if call_id:
        row["call_id"] = call_id

    try:
        result = (
            supabase.table("recordings")
            .upsert(row, on_conflict="recording_id")
            .execute()
        )
        if result.data:
            saved = result.data[0]
            saved["calls"] = {"call_session_id": call_session_id}
            return _row_to_record(saved, call_session_id=call_session_id)
        return record
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (upsert_recording): {e}")


def get_recording(recording_id: str) -> Optional[dict]:
    """Fetch a single recording by its recording_id. Returns None if not found."""
    try:
        result = (
            supabase.table("recordings")
            .select("*, calls(call_session_id, from_number, to_number)")
            .eq("recording_id", recording_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return _row_to_record(result.data[0])
        return None
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (get_recording): {e}")


def get_recordings_by_session(call_session_id: str) -> list:
    """Return all recordings associated with a given call_session_id."""
    try:
        # Join through calls to filter by call_session_id
        result = (
            supabase.table("recordings")
            .select("*, calls!inner(call_session_id, from_number, to_number)")
            .eq("calls.call_session_id", call_session_id)
            .execute()
        )
        return [_row_to_record(r) for r in (result.data or [])]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (get_recordings_by_session): {e}")


def list_all_recordings() -> list:
    """Return all recordings, most recent first."""
    try:
        result = (
            supabase.table("recordings")
            .select("*, calls(call_session_id, from_number, to_number)")
            .order("created_at", desc=True)
            .execute()
        )
        return [_row_to_record(r) for r in (result.data or [])]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (list_all_recordings): {e}")


def recording_count() -> int:
    """Return total number of stored recordings."""
    try:
        result = (
            supabase.table("recordings")
            .select("id", count="exact")
            .execute()
        )
        return result.count or 0
    except Exception:
        return 0
