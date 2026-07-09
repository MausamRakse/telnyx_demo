"""
services/recording_service.py
─────────────────────────────
Handles all recording-related logic:
  - store_recording_id()  → called when webhook fires, saves a stub entry
  - fetch_recording()     → calls GET /v2/recordings/{id} on Telnyx, upserts full metadata
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException

from utils.telnyx_client import telnyx
from database.recording_store import upsert_recording, get_recording
from schemas.call import RecordingRecord, DownloadUrls


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def start_recording(call_control_id: str) -> bool:
    """
    Start recording dynamically during the call using the Call Control API.
    """
    if not call_control_id:
        return False
        
    try:
        resp = await telnyx.post(
            f"/calls/{call_control_id}/actions/record_start",
            json={
                "format": "wav",
                "channels": "single"
            }
        )
        if resp.status_code in (200, 201):
            print(f"   ✅ Recording started for {call_control_id}")
            return True
        else:
            print(f"   ⚠️  Recording start failed: HTTP {resp.status_code} | {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"   ⚠️  Recording start error: {e}")
        return False


async def store_recording_id(
    recording_id: str,
    call_session_id: Optional[str],
    from_num: str,
    to_num: str,
) -> dict:
    """
    Save a minimal recording stub when the webhook fires.
    Status starts as 'initiated' until we fetch full metadata from Telnyx.
    """
    record = {
        "recording_id":    recording_id,
        "call_session_id": call_session_id,
        "status":          "initiated",
        "from_number":     from_num,
        "to_number":       to_num,
        "download_urls":   {"mp3": None, "wav": None},
        "duration_secs":   None,
        "created_at":      None,
        "fetched_at":      None,
    }
    return upsert_recording(record)


async def fetch_recording(recording_id: str) -> RecordingRecord:
    """
    Fetch full recording metadata from Telnyx API (GET /v2/recordings/{id}).
    Upserts the result into the in-memory store and returns a RecordingRecord.

    Error handling:
        404  → HTTPException 404 (recording not found)
        503  → HTTPException 503 (Telnyx unreachable)
        other→ HTTPException 502 with Telnyx error detail
    """
    # ── 1. Call Telnyx Recording API ─────────────────────────────────────────
    try:
        resp = await telnyx.get(f"/recordings/{recording_id}")
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Telnyx API unreachable: {e}",
        )

    # ── 2. Handle non-200 responses ──────────────────────────────────────────
    if resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Recording '{recording_id}' not found on Telnyx.",
        )

    if resp.status_code not in (200, 201):
        try:
            err_detail = resp.json().get("errors", [{}])[0].get("detail", resp.text[:300])
        except Exception:
            err_detail = resp.text[:300]
        raise HTTPException(
            status_code=502,
            detail=f"Telnyx API error ({resp.status_code}): {err_detail}",
        )

    # ── 3. Parse the response ─────────────────────────────────────────────────
    payload = resp.json().get("data", resp.json())

    # Extract download URLs (Telnyx returns them nested under download_urls)
    raw_urls = payload.get("download_urls") or {}
    if isinstance(raw_urls, list):
        # Some versions return a list of {format, url} objects
        url_map = {item.get("format"): item.get("url") for item in raw_urls}
    else:
        url_map = raw_urls  # already a dict {mp3: ..., wav: ...}

    download_urls = DownloadUrls(
        mp3=url_map.get("mp3"),
        wav=url_map.get("wav"),
    )

    # ── 4. Build the record dict ──────────────────────────────────────────────
    # Preserve call_session_id / from/to if we already have them from the webhook stub
    existing = get_recording(recording_id) or {}

    record = {
        "recording_id":    recording_id,
        "call_session_id": payload.get("call_session_id") or existing.get("call_session_id"),
        "status":          payload.get("status", "completed"),
        "duration_secs":   payload.get("duration_secs"),
        "created_at":      payload.get("created_at"),
        "from_number":     payload.get("from") or existing.get("from_number"),
        "to_number":       payload.get("to") or existing.get("to_number"),
        "download_urls":   {"mp3": download_urls.mp3, "wav": download_urls.wav},
        "fetched_at":      _now_iso(),
    }

    upsert_recording(record)

    # ── 5. Return as Pydantic model ───────────────────────────────────────────
    return RecordingRecord(
        recording_id=record["recording_id"],
        call_session_id=record["call_session_id"],
        status=record["status"],
        duration_secs=record["duration_secs"],
        created_at=record["created_at"],
        from_number=record["from_number"],
        to_number=record["to_number"],
        download_urls=download_urls,
        fetched_at=record["fetched_at"],
    )
