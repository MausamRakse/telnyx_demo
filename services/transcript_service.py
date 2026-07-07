"""
services/transcript_service.py
────────────────────────────────
Handles all transcript-related logic:

  Approach A (Real-time webhook):
    start_transcription()         → POST transcription_start to Telnyx call
    handle_transcription_event()  → process call.transcription webhook

  Approach B (Post-call AI Conversations API):
    fetch_ai_conversation_transcript() → GET /v2/ai/conversations + /messages
                                         called on call.hangup
"""

from typing import Optional
from fastapi import HTTPException

from utils.telnyx_client import telnyx
from database.transcript_store import (
    store_leg_role,
    append_transcript_line,
    upsert_full_transcript,
    get_transcript,
)


# ─────────────────────────────────────────────────────────────────────────────
# Approach A — Real-time webhook transcription
# ─────────────────────────────────────────────────────────────────────────────

async def start_transcription(
    call_control_id: str,
    call_leg_id: Optional[str],
    call_session_id: Optional[str],
    direction: Optional[str],
) -> bool:
    """
    Start real-time transcription for a call leg by calling Telnyx
    transcription_start action. Also registers the leg role in the store.

    Returns True if started successfully, False otherwise.
    """
    if not call_control_id:
        print("   ⚠️  No call_control_id — cannot start transcription")
        return False

    # Determine speaker role from call direction
    # incoming → the external party is speaking = "User"
    # outgoing → our AI / agent leg = "Agent"
    role = "User" if direction == "incoming" else "Agent"

    if call_leg_id and call_session_id:
        store_leg_role(call_session_id, call_leg_id, role)
        print(f"   📋 Leg role registered: {call_leg_id} → {role}")

    # Call Telnyx transcription_start action
    try:
        resp = await telnyx.post(
            f"/calls/{call_control_id}/actions/transcription_start",
            json={
                "language":             "en",
                "transcription_engine": "B",   # Deepgram (fast, accurate)
                "interim_results":      False,  # only fire when is_final=True
            },
        )
        if resp.status_code in (200, 201):
            print(f"   ✅ Transcription started for {call_control_id}")
            return True
        else:
            print(f"   ⚠️  Transcription start failed: HTTP {resp.status_code} | {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"   ⚠️  Transcription start error: {e}")
        return False


async def handle_transcription_event(payload: dict) -> None:
    """
    Process a call.transcription webhook event (Approach A).

    Equivalent to the JS pattern:
        if (transcription_data.is_final) {
            const speaker = legRoles[call_leg_id] || "Unknown";
            transcripts[call_session_id].push({ speaker, text, time });
        }
    """
    call_leg_id     = payload.get("call_leg_id", "")
    call_session_id = payload.get("call_session_id", "")
    occurred_at     = payload.get("occurred_at", "")
    tx_data         = payload.get("transcription_data", {})

    is_final    = tx_data.get("is_final", False)
    transcript  = (tx_data.get("transcript") or "").strip()
    confidence  = tx_data.get("confidence")

    # Only store final results (matches the JS is_final guard)
    if not is_final or not transcript:
        return

    msg = append_transcript_line(
        call_session_id=call_session_id,
        call_leg_id=call_leg_id,
        text=transcript,
        time=occurred_at,
        confidence=confidence,
        is_final=True,
        source="webhook",
    )

    speaker = msg["speaker"]
    print(f"   💬 Transcript [{speaker}]: {transcript}")


# ─────────────────────────────────────────────────────────────────────────────
# Approach B — Post-call AI Conversations API fetch
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_ai_conversation_transcript(call_session_id: str) -> Optional[dict]:
    """
    After a call hangs up, fetch the full conversation transcript from
    the Telnyx AI Conversations API (GET /v2/ai/conversations + /messages).

    Finds the conversation by matching call_session_id in metadata,
    then fetches all messages, maps roles to User/Agent/System,
    and upserts into the in-memory transcript store.
    """
    if not call_session_id:
        return None

    print(f"   📜 Fetching AI conversation transcript for session: {call_session_id}")

    # ── 1. Find the conversation_id for this call_session_id ─────────────────
    conversation_id = None
    try:
        resp = await telnyx.get("/ai/conversations", params={"page[size]": 50})
        if resp.status_code == 200:
            conversations = resp.json().get("data", [])
            for conv in conversations:
                meta = conv.get("metadata") or {}
                if meta.get("call_session_id") == call_session_id:
                    conversation_id = conv["id"]
                    break
    except Exception as e:
        print(f"   ⚠️  Failed to list AI conversations: {e}")
        return None

    if not conversation_id:
        print(f"   ⚠️  No AI conversation found for session {call_session_id}")
        return None

    print(f"   🔗 Found conversation_id: {conversation_id}")

    # ── 2. Fetch messages for that conversation ───────────────────────────────
    try:
        resp = await telnyx.get(f"/ai/conversations/{conversation_id}/messages")
        if resp.status_code != 200:
            print(f"   ⚠️  Messages fetch failed: HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"   ⚠️  Failed to fetch messages: {e}")
        return None

    raw_messages = resp.json().get("data", [])

    # ── 3. Map to our internal message schema ─────────────────────────────────
    ROLE_MAP = {
        "user":      "User",
        "assistant": "Agent",
        "system":    "System",
    }

    messages = []
    for m in raw_messages:
        role = m.get("role", "")
        text = (m.get("text") or "").strip()
        if not text:
            continue
        messages.append({
            "speaker":     ROLE_MAP.get(role, role.capitalize()),
            "text":        text,
            "time":        m.get("sent_at") or m.get("created_at") or "",
            "confidence":  None,
            "is_final":    True,
            "call_leg_id": None,
            "source":      "api",
        })

    # Sort by time ascending
    messages.sort(key=lambda m: m.get("time") or "")

    # ── 4. Upsert into the store ──────────────────────────────────────────────
    record = upsert_full_transcript(call_session_id, messages)
    print(f"   ✅ Transcript stored: {len(messages)} messages for session {call_session_id}")
    return record


# ─────────────────────────────────────────────────────────────────────────────
# Fetch transcript for API endpoint (live + store lookup)
# ─────────────────────────────────────────────────────────────────────────────

async def get_or_fetch_transcript(call_session_id: str) -> dict:
    """
    Get transcript from store. If not found, try fetching from Telnyx
    AI Conversations API live. Raises HTTPException(404) if unavailable.
    """
    record = get_transcript(call_session_id)
    if record and record.get("messages"):
        return record

    # Try a live fetch from Telnyx
    record = await fetch_ai_conversation_transcript(call_session_id)
    if not record or not record.get("messages"):
        raise HTTPException(
            status_code=404,
            detail=f"No transcript found for call session '{call_session_id}'. "
                   "The call may not have used an AI Assistant or recording is not available yet.",
        )
    return record
