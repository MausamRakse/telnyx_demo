from fastapi import APIRouter, Request, Response, HTTPException
from typing import Optional
from pydantic import BaseModel
from schemas.call import DialRequest
from services.call_service import trigger_outbound_dial, handle_vobiz_answer, handle_webhook_event
from config import settings

router = APIRouter()


# ── Telnyx webhook (also exposed at root level in main.py) ────────────────────
@router.post("/webhook")
async def webhook_handler(request: Request):
    """Handle all incoming webhooks from Telnyx."""
    data = await request.json()
    return await handle_webhook_event(data)


# ── Root-level dial (legacy — also proxied from main.py) ─────────────────────
@router.post("/dial")
async def dial_handler(to: str, from_number: str, assistant_id: str):
    """Trigger an outbound AI call via query params."""
    return await trigger_outbound_dial(to, from_number, assistant_id)


@router.post("/vobiz_answer")
async def vobiz_answer_handler(request: Request):
    """Handle Vobiz answer and bridge to Telnyx AI Assistant."""
    form = await request.form()
    form_dict = {k: v for k, v in form.items()}
    return await handle_vobiz_answer(form_dict)


# ── Frontend-facing endpoints ─────────────────────────────────────────────────

class TriggerCallBody(BaseModel):
    """JSON body shape that the frontend sends for triggering a call."""
    agent_id: str
    phone_number: str
    custom_first_line: Optional[str] = None
    is_booking_agent: Optional[bool] = False


@router.post("/calls/trigger-call")
async def trigger_call_endpoint(body: TriggerCallBody):
    """
    Trigger an outbound AI call.
    Accepts a JSON body from the frontend and routes to the existing
    trigger_outbound_dial service using the configured from_number.
    """
    from_number = settings.FROM_NUMBER or "+918071581212"
    result = await trigger_outbound_dial(
        to=body.phone_number,
        from_number=from_number,
        assistant_id=body.agent_id,
    )
    if not result.get("success", True):
        raise HTTPException(status_code=502, detail=result.get("error", "Call failed"))

    return {
        "success": True,
        "call_id": result.get("call_control_id"),
        "to": body.phone_number,
        "from": from_number,
    }


@router.get("/calls/meeting-logs")
async def meeting_logs_endpoint():
    """
    Meeting logs endpoint — Cal.com integration is not wired in this backend.
    Returns an empty list so the frontend renders gracefully.
    """
    return {"logs": []}
