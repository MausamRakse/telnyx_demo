from pydantic import BaseModel
from typing import Optional, Any, List


# ── Dial ─────────────────────────────────────────────────────────────────────

class DialRequest(BaseModel):
    to: str
    from_number: str
    assistant_id: str


class DialResponse(BaseModel):
    success: bool
    call_control_id: Optional[str] = None
    to: str
    from_: str
    error: Optional[str] = None
    raw: Optional[Any] = None


# ── Recording ─────────────────────────────────────────────────────────────────

class DownloadUrls(BaseModel):
    mp3: Optional[str] = None
    wav: Optional[str] = None


class RecordingRecord(BaseModel):
    recording_id: str
    call_session_id: Optional[str] = None
    status: str = "initiated"          # initiated | completed | failed
    duration_secs: Optional[float] = None
    created_at: Optional[str] = None
    from_number: Optional[str] = None
    to_number: Optional[str] = None
    download_urls: DownloadUrls = DownloadUrls()
    fetched_at: Optional[str] = None


class RecordingListResponse(BaseModel):
    count: int
    recordings: List[RecordingRecord]


# ── Transcript ────────────────────────────────────────────────────────────────

class TranscriptMessage(BaseModel):
    speaker: str                        # "User" | "Agent" | "System" | "Unknown"
    text: str
    time: Optional[str] = None
    confidence: Optional[float] = None
    is_final: bool = True
    call_leg_id: Optional[str] = None
    source: str = "api"                 # "webhook" | "api"


class TranscriptRecord(BaseModel):
    call_session_id: str
    total_messages: int
    messages: List[TranscriptMessage]
    formatted_transcript: str           # "User: ...\nAgent: ..."


class TranscriptListResponse(BaseModel):
    count: int
    transcripts: List[TranscriptRecord]
