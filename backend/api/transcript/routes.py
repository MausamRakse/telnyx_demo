"""
api/transcript/routes.py
─────────────────────────
REST endpoints for call transcript retrieval.

Endpoints:
  GET /transcripts                          → list all stored session transcripts
  GET /transcripts/{call_session_id}        → full transcript (fetches live if not cached)
  GET /transcripts/{call_session_id}/text   → plain text formatted transcript
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from schemas.call import TranscriptMessage, TranscriptRecord, TranscriptListResponse
from services.transcript_service import get_or_fetch_transcript
from database.transcript_store import list_all_transcripts, transcript_count

router = APIRouter()


def _dict_to_record(r: dict) -> TranscriptRecord:
    """Convert a raw store dict into a TranscriptRecord Pydantic model."""
    messages = [
        TranscriptMessage(
            speaker=m.get("speaker", "Unknown"),
            text=m.get("text", ""),
            time=m.get("time"),
            confidence=m.get("confidence"),
            is_final=m.get("is_final", True),
            call_leg_id=m.get("call_leg_id"),
            source=m.get("source", "api"),
        )
        for m in r.get("messages", [])
        if m.get("text", "").strip()
    ]
    return TranscriptRecord(
        call_session_id=r["call_session_id"],
        total_messages=len(messages),
        messages=messages,
        formatted_transcript=r.get("formatted_transcript", ""),
    )


# ── 1. List all stored transcripts ────────────────────────────────────────────
@router.get(
    "/transcripts",
    response_model=TranscriptListResponse,
    summary="List all stored transcripts",
    description=(
        "Returns transcripts for all call sessions captured since server start. "
        "Transcripts are populated automatically on call.hangup via the AI Conversations API."
    ),
)
async def list_transcripts():
    records = list_all_transcripts()
    return TranscriptListResponse(
        count=len(records),
        transcripts=[_dict_to_record(r) for r in records],
    )


# ── 2. Get full transcript by call_session_id ─────────────────────────────────
@router.get(
    "/transcripts/{call_session_id}",
    response_model=TranscriptRecord,
    summary="Get full transcript by call session ID",
    description=(
        "Returns the full structured transcript for a call session with speaker labels "
        "(User / Agent). If not cached, fetches live from the Telnyx AI Conversations API. "
        "Works for any historical call that used a Telnyx AI Assistant."
    ),
)
async def get_transcript(call_session_id: str):
    record = await get_or_fetch_transcript(call_session_id)
    return _dict_to_record(record)


# ── 3. Get plain-text formatted transcript ────────────────────────────────────
@router.get(
    "/transcripts/{call_session_id}/text",
    response_class=PlainTextResponse,
    summary="Get plain text transcript",
    description=(
        "Returns the transcript as a plain readable text string:\n"
        "Agent: Hi, how can I help you today?\n"
        "User: I want to build a website...\n"
        "..."
    ),
)
async def get_transcript_text(call_session_id: str):
    record = await get_or_fetch_transcript(call_session_id)
    formatted = record.get("formatted_transcript", "")
    if not formatted:
        raise HTTPException(
            status_code=404,
            detail=f"No formatted transcript available for session '{call_session_id}'.",
        )
    return formatted
