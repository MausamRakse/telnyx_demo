"""
database/transcript_store.py
─────────────────────────────
Supabase-backed transcript store.

All function signatures are identical to the old in-memory version,
so services/transcript_service.py requires zero changes.

Tables used:
  public.call_legs          — stores call_leg_id → role mapping
  public.transcript_messages — append-only utterances per call
  public.call_transcripts_formatted — view: formatted_transcript per call_id
"""

from typing import Optional
from fastapi import HTTPException
from utils.supabase_client import supabase
from database.db_helpers import get_or_create_call_id, get_call_id_from_session, now_iso


# ─────────────────────────────────────────────────────────────────────────────
# Leg Role Registry (replaces _leg_roles dict)
# ─────────────────────────────────────────────────────────────────────────────

def store_leg_role(call_session_id: str, call_leg_id: str, role: str) -> None:
    """
    Register a call leg's speaker role in the call_legs table.
    Equivalent to: legRoles[call_leg_id] = role (JS pattern).
    Upserts on call_leg_id so re-registering is safe.
    """
    call_id = get_or_create_call_id(call_session_id)
    if not call_id:
        print(f"⚠️  store_leg_role: could not resolve call_id for session {call_session_id}")
        return
    try:
        supabase.table("call_legs").upsert(
            {"call_id": call_id, "call_leg_id": call_leg_id, "role": role},
            on_conflict="call_leg_id",
        ).execute()
    except Exception as e:
        print(f"⚠️  store_leg_role DB error: {e}")


def get_leg_role(call_leg_id: str) -> str:
    """
    Return the speaker label for a leg ('User' | 'Agent' | 'System' | 'Unknown').
    Equivalent to: legRoles[call_leg_id] || "Unknown" (JS pattern).
    """
    try:
        result = (
            supabase.table("call_legs")
            .select("role")
            .eq("call_leg_id", call_leg_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["role"]
    except Exception:
        pass
    return "Unknown"


# ─────────────────────────────────────────────────────────────────────────────
# Transcript Messages (append-only)
# ─────────────────────────────────────────────────────────────────────────────

def append_transcript_line(
    call_session_id: str,
    call_leg_id: str,
    text: str,
    time: str,
    confidence: Optional[float] = None,
    is_final: bool = True,
    source: str = "webhook",
) -> dict:
    """
    Append a single transcribed utterance to transcript_messages.
    Called for every final call.transcription webhook event.
    """
    call_id = get_or_create_call_id(call_session_id)
    speaker = get_leg_role(call_leg_id)
    text = text.strip()

    row = {
        "call_id":    call_id,
        "call_leg_id": call_leg_id,
        "speaker":    speaker,
        "text":       text,
        "occurred_at": time,
        "confidence": confidence,
        "is_final":   is_final,
        "source":     source,
        "created_at": now_iso(),
    }

    try:
        supabase.table("transcript_messages").insert(row).execute()
    except Exception as e:
        print(f"⚠️  append_transcript_line DB error: {e}")

    return {
        "speaker":     speaker,
        "text":        text,
        "time":        time,
        "confidence":  confidence,
        "is_final":    is_final,
        "call_leg_id": call_leg_id,
        "source":      source,
    }


def upsert_full_transcript(call_session_id: str, messages: list) -> dict:
    """
    Insert messages not already present (deduped by text within the call).
    Used by post-call AI Conversations API fetch (Approach B).
    """
    call_id = get_or_create_call_id(call_session_id)
    if not call_id:
        return {}

    # Fetch existing texts for this call_id to dedup
    try:
        existing = (
            supabase.table("transcript_messages")
            .select("text")
            .eq("call_id", call_id)
            .execute()
        )
        existing_texts = {r["text"] for r in (existing.data or [])}
    except Exception:
        existing_texts = set()

    # Insert only new messages
    new_rows = []
    for m in messages:
        text = (m.get("text") or "").strip()
        if text and text not in existing_texts:
            new_rows.append({
                "call_id":    call_id,
                "call_leg_id": m.get("call_leg_id"),
                "speaker":    m.get("speaker", "Unknown"),
                "text":       text,
                "occurred_at": m.get("time"),
                "confidence": m.get("confidence"),
                "is_final":   m.get("is_final", True),
                "source":     m.get("source", "api"),
                "created_at": now_iso(),
            })
            existing_texts.add(text)

    if new_rows:
        try:
            supabase.table("transcript_messages").insert(new_rows).execute()
        except Exception as e:
            print(f"⚠️  upsert_full_transcript DB error: {e}")

    return get_transcript(call_session_id) or {}


# ─────────────────────────────────────────────────────────────────────────────
# Query Functions
# ─────────────────────────────────────────────────────────────────────────────

def get_transcript(call_session_id: str) -> Optional[dict]:
    """
    Return the full transcript record for a session.
    Shape: { call_session_id, messages: [...], call_leg_roles: {...}, formatted_transcript }
    Exactly the same dict shape as the old in-memory store.
    """
    call_id = get_call_id_from_session(call_session_id)
    if not call_id:
        return None

    # 1. Fetch messages ordered by time
    try:
        msg_result = (
            supabase.table("transcript_messages")
            .select("*")
            .eq("call_id", call_id)
            .order("occurred_at", desc=False)
            .execute()
        )
        raw_messages = msg_result.data or []
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (get_transcript messages): {e}")

    # 2. Fetch call_leg_roles for this call
    try:
        legs_result = (
            supabase.table("call_legs")
            .select("call_leg_id, role")
            .eq("call_id", call_id)
            .execute()
        )
        call_leg_roles = {
            r["call_leg_id"]: r["role"]
            for r in (legs_result.data or [])
        }
    except Exception:
        call_leg_roles = {}

    # 3. Fetch formatted transcript from view
    try:
        view_result = (
            supabase.table("call_transcripts_formatted")
            .select("formatted_transcript")
            .eq("call_id", call_id)
            .limit(1)
            .execute()
        )
        formatted = ""
        if view_result.data:
            formatted = view_result.data[0].get("formatted_transcript", "")
    except Exception:
        # Fallback: build formatted string from messages
        formatted = "\n".join(
            f"{m.get('speaker', 'Unknown')}: {m.get('text', '')}"
            for m in raw_messages if m.get("text")
        )

    # 4. Build messages list in the app-facing shape
    messages = [
        {
            "speaker":     m.get("speaker", "Unknown"),
            "text":        m.get("text", ""),
            "time":        m.get("occurred_at"),
            "confidence":  m.get("confidence"),
            "is_final":    m.get("is_final", True),
            "call_leg_id": m.get("call_leg_id"),
            "source":      m.get("source", "api"),
        }
        for m in raw_messages if m.get("text", "").strip()
    ]

    return {
        "call_session_id":    call_session_id,
        "messages":           messages,
        "call_leg_roles":     call_leg_roles,
        "formatted_transcript": formatted,
    }


def list_all_transcripts() -> list:
    """Return transcripts for all call sessions that have messages."""
    try:
        result = (
            supabase.table("transcript_messages")
            .select("call_id, calls(call_session_id)")
            .execute()
        )
        # Collect unique (call_id → call_session_id) pairs
        seen = {}
        for r in (result.data or []):
            cid = r.get("call_id")
            session = (r.get("calls") or {}).get("call_session_id")
            if cid and session and session not in seen:
                seen[session] = cid
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error (list_all_transcripts): {e}")

    records = []
    for session_id in seen:
        rec = get_transcript(session_id)
        if rec:
            records.append(rec)

    # Sort by most recent message time descending
    records.sort(
        key=lambda r: max((m.get("time") or "" for m in r["messages"]), default=""),
        reverse=True,
    )
    return records


def transcript_count() -> int:
    """Return the number of distinct call sessions with transcripts."""
    try:
        result = (
            supabase.table("transcript_messages")
            .select("call_id", count="exact")
            .execute()
        )
        return result.count or 0
    except Exception:
        return 0
