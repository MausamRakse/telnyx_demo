"""
api/campaign/routes.py
───────────────────────
All HTTP endpoints for the Calling Campaign feature.
Mounted at /api/campaigns/ via api/router.py.

Follows the same pattern as api/call/routes.py:
  - FastAPI APIRouter
  - Thin route handlers that delegate to service functions
  - Consistent JSON error responses via HTTPException
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from schemas.campaign import (
    CampaignCreate,
    CampaignResponse,
    ContactUploadResult,
    CampaignProgress,
    CDRReconcileResult,
)
from services import campaign_service, dialer_service

router = APIRouter()


# ── Create a campaign ─────────────────────────────────────────────────────────

@router.post("/", response_model=dict, summary="Create a new campaign (status: draft)")
async def create_campaign(body: CampaignCreate):
    """
    Create a new calling campaign in 'draft' status.
    Contacts are uploaded separately via POST /campaigns/{id}/upload.
    """
    try:
        row = campaign_service.create_campaign(body)
        return {"success": True, "campaign": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── List campaigns ────────────────────────────────────────────────────────────

@router.get("/", summary="List all campaigns with aggregate progress")
async def list_campaigns():
    """Return all campaigns including real-time contact progress counts."""
    try:
        campaigns = campaign_service.list_campaigns()
        return {"campaigns": campaigns, "count": len(campaigns)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Single campaign detail ────────────────────────────────────────────────────

@router.get("/{campaign_id}", summary="Get a single campaign")
async def get_campaign(campaign_id: str):
    """Return campaign details + aggregate progress."""
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        return {"campaign": campaign}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Upload contacts ───────────────────────────────────────────────────────────

@router.post("/{campaign_id}/upload", response_model=ContactUploadResult,
             summary="Upload CSV/XLSX contact list")
async def upload_contacts(
    campaign_id: str,
    file: UploadFile = File(..., description="CSV or XLSX file with phone_number column"),
):
    """
    Parse a CSV or XLSX file, validate phone numbers to E.164, and store
    valid contacts linked to this campaign.

    Returns ContactUploadResult with success_count and details of any failed rows.
    Supports columns: phone_number (required), name / full_name / participant_identity (optional).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    allowed_exts = {".csv", ".xlsx", ".xls"}
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Upload a .csv, .xlsx, or .xls file."
        )

    try:
        file_bytes = await file.read()
        result = campaign_service.upload_contacts(campaign_id, file_bytes, file.filename)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Start campaign ────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/start", summary="Start or resume a campaign")
async def start_campaign(campaign_id: str):
    """
    Transition campaign draft→running or paused→running.
    Launches the async dialer engine in the background.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        current_status = campaign.get("status", "")

        # Validate state machine transition
        campaign_service.validate_transition(current_status, "running")

        # Update DB status
        campaign_service._set_campaign_status(
            campaign_id, "running",
            started_at=campaign_service._now_iso() if current_status == "draft" else None,
        )

        # Launch background dialer task
        await dialer_service.start_campaign_dialer(campaign_id)

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "running",
            "message": "Campaign started. Dialer is running in the background.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Pause campaign ────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/pause", summary="Pause a running campaign")
async def pause_campaign(campaign_id: str):
    """
    Stop the dialer from placing new calls.
    In-flight calls continue until they complete naturally.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        campaign_service.validate_transition(campaign.get("status", ""), "paused")

        # Cancel the background dialer task first, then update status
        await dialer_service.stop_campaign_dialer(campaign_id)
        campaign_service._set_campaign_status(campaign_id, "paused")

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "paused",
            "message": "Campaign paused. In-flight calls will complete naturally.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stop campaign ─────────────────────────────────────────────────────────────

@router.post("/{campaign_id}/stop", summary="Stop a campaign permanently")
async def stop_campaign(campaign_id: str):
    """
    Permanently stop the campaign. Remaining pending/queued contacts
    are left as-is (not dialed). Cannot be resumed.
    """
    try:
        campaign = campaign_service.get_campaign(campaign_id)
        campaign_service.validate_transition(campaign.get("status", ""), "stopped")

        await dialer_service.stop_campaign_dialer(campaign_id)
        campaign_service._set_campaign_status(campaign_id, "stopped")

        return {
            "success": True,
            "campaign_id": campaign_id,
            "status": "stopped",
            "message": "Campaign stopped permanently.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Real-time progress ────────────────────────────────────────────────────────

@router.get("/{campaign_id}/progress", response_model=CampaignProgress,
            summary="Get real-time campaign progress")
async def get_campaign_progress(campaign_id: str):
    """
    Return real-time counts of contacts by status.
    Frontend polls this every 5 seconds while campaign is running.
    """
    try:
        return campaign_service.get_campaign_progress(campaign_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Contact list ──────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/contacts", summary="Get paginated contact list")
async def get_campaign_contacts(
    campaign_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Contacts per page"),
):
    """Return paginated contacts with their current call statuses."""
    try:
        return campaign_service.get_campaign_contacts(campaign_id, page, page_size)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── CDR Reconciliation ────────────────────────────────────────────────────────

@router.post("/{campaign_id}/reconcile", response_model=CDRReconcileResult,
             summary="Reconcile contact statuses against Telnyx CDR API")
async def reconcile_campaign(campaign_id: str):
    """
    Query the Telnyx Detail Records (CDR) API for each contact that has a
    call_session_id and correct any discrepancies in the local call_status.

    Recommended to run once after a campaign reaches 'completed' status
    for authoritative final reporting.
    """
    try:
        result = await campaign_service.reconcile_cdr(campaign_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
