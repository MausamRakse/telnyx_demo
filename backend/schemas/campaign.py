"""
schemas/campaign.py
────────────────────
Pydantic models for the Calling Campaign feature.
Follows the same pattern as schemas/call.py — BaseModel with Optional fields.
"""

from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
from datetime import datetime


# ── Campaign ──────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    assistant_id: str                  # Required — Telnyx assistant-xxxx ID
    connection_id: str                 # Telnyx Call Control App ID
    from_number: str                   # E.164 outbound caller ID
    max_concurrent: int = 5
    calls_per_second: float = 1.0

    @field_validator("assistant_id")
    @classmethod
    def assistant_id_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "assistant_id is required. Select an AI Assistant before creating "
                "a campaign — otherwise answered calls will have no agent on the line."
            )
        return v.strip()


class CampaignResponse(BaseModel):
    id: str
    name: str
    assistant_id: Optional[str] = None # Telnyx AI Assistant ID assigned to this campaign
    status: str                        # draft | running | paused | completed | stopped
    connection_id: str
    from_number: str
    max_concurrent: int
    calls_per_second: float
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    # Aggregate progress (joined on list endpoint)
    total_contacts: int = 0
    pending: int = 0
    queued: int = 0
    calling: int = 0
    answered: int = 0
    no_answer: int = 0
    voicemail: int = 0
    busy: int = 0
    failed: int = 0
    total_dialed: int = 0


# ── Campaign Contacts ─────────────────────────────────────────────────────────

class CampaignContactResponse(BaseModel):
    id: str
    campaign_id: str
    phone_number: str
    name: Optional[str] = None
    call_status: str                   # pending | queued | calling | answered | ...
    call_control_id: Optional[str] = None
    call_session_id: Optional[str] = None
    dialed_at: Optional[str] = None
    answered_at: Optional[str] = None
    ended_at: Optional[str] = None
    hangup_cause: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[str] = None


class CampaignContactsResponse(BaseModel):
    campaign_id: str
    total: int
    page: int
    page_size: int
    contacts: List[CampaignContactResponse]


# ── Upload Result ─────────────────────────────────────────────────────────────

class FailedRow(BaseModel):
    row_number: int
    data: Any                          # The raw row dict from the CSV/XLSX
    reason: str                        # Human-readable validation failure reason


class ContactUploadResult(BaseModel):
    campaign_id: str
    success_count: int
    failed_count: int
    failed_rows: List[FailedRow] = []


# ── Progress (real-time) ──────────────────────────────────────────────────────

class CampaignProgress(BaseModel):
    campaign_id: str
    campaign_name: str
    campaign_status: str
    total_contacts: int
    pending: int
    queued: int
    calling: int
    answered: int
    no_answer: int
    voicemail: int
    busy: int
    failed: int
    total_dialed: int
    answer_rate_pct: float = 0.0       # answered / total_dialed * 100


# ── CDR Reconciliation ────────────────────────────────────────────────────────

class CDRRecord(BaseModel):
    """One record from Telnyx Detail Records API."""
    call_session_id: Optional[str] = None
    call_leg_id: Optional[str] = None
    from_number: Optional[str] = None
    to_number: Optional[str] = None
    direction: Optional[str] = None
    duration_secs: Optional[float] = None
    status: Optional[str] = None
    hangup_cause: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    answered_at: Optional[str] = None


class CDRReconcileResult(BaseModel):
    campaign_id: str
    contacts_checked: int
    contacts_updated: int
    records: List[CDRRecord] = []
    errors: List[str] = []
