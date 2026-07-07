"""
api/recording/routes.py
────────────────────────
REST endpoints for call recording retrieval.

Endpoints:
  GET /recordings                         → list all stored recordings
  GET /recordings/{recording_id}          → fetch recording (hits Telnyx API live)
  GET /recordings/call/{call_session_id}  → all recordings for a call session
"""

from fastapi import APIRouter, HTTPException
from schemas.call import RecordingRecord, RecordingListResponse, DownloadUrls
from services.recording_service import fetch_recording
from database.recording_store import (
    list_all_recordings,
    get_recordings_by_session,
    get_recording,
    recording_count,
)

router = APIRouter()


def _dict_to_record(r: dict) -> RecordingRecord:
    """Convert a raw store dict into a RecordingRecord Pydantic model."""
    raw_urls = r.get("download_urls") or {}
    return RecordingRecord(
        recording_id=r["recording_id"],
        call_session_id=r.get("call_session_id"),
        status=r.get("status", "initiated"),
        duration_secs=r.get("duration_secs"),
        created_at=r.get("created_at"),
        from_number=r.get("from_number"),
        to_number=r.get("to_number"),
        download_urls=DownloadUrls(
            mp3=raw_urls.get("mp3"),
            wav=raw_urls.get("wav"),
        ),
        fetched_at=r.get("fetched_at"),
    )


# ── 1. List all recordings ────────────────────────────────────────────────────
@router.get(
    "/recordings",
    response_model=RecordingListResponse,
    summary="List all stored recordings",
    description="Returns all call recordings that have been captured from webhooks or fetched from the Telnyx API.",
)
async def list_recordings():
    records = list_all_recordings()
    return RecordingListResponse(
        count=len(records),
        recordings=[_dict_to_record(r) for r in records],
    )


# ── 2. Get recording by call_session_id (must come BEFORE /{recording_id}) ───
@router.get(
    "/recordings/call/{call_session_id}",
    response_model=RecordingListResponse,
    summary="Get recordings by call session",
    description="Returns all recordings associated with a specific call session ID.",
)
async def get_recordings_by_call(call_session_id: str):
    records = get_recordings_by_session(call_session_id)
    if not records:
        raise HTTPException(
            status_code=404,
            detail=f"No recordings found for call session '{call_session_id}'.",
        )
    return RecordingListResponse(
        count=len(records),
        recordings=[_dict_to_record(r) for r in records],
    )


# ── 3. Get recording by recording_id (fetches live from Telnyx) ───────────────
@router.get(
    "/recordings/{recording_id}",
    response_model=RecordingRecord,
    summary="Get recording by ID",
    description=(
        "Fetches full recording metadata (including MP3/WAV download URLs) from the "
        "Telnyx Recording API. Also updates the in-memory store with the latest data."
    ),
)
async def get_recording_by_id(recording_id: str):
    # fetch_recording() handles 404 / 502 / 503 internally via HTTPException
    return await fetch_recording(recording_id)
