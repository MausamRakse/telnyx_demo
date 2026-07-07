"""
api/agent/routes.py
────────────────────
Agent CRUD endpoints for the frontend — proxies to the existing Telnyx
AI Assistant service and adapts the response shape to what the frontend expects.

Frontend expects agents shaped as:
  { id, name, greeting, prompt, language, voice_id, meeting_enabled,
    cal_api_key, cal_event_type_id, cal_connected, phone_number }

Telnyx assistant fields:
  { id, name, greeting, instructions, voice_settings.voice, transcription.language }
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel
from services.assistant_service import (
    create_assistant,
    list_assistants,
    update_assistant,
    delete_assistant,
)
from schemas.assistant import CreateAssistantRequest, UpdateAssistantRequest, VoiceSettings, TranscriptionSettings

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _telnyx_to_agent(item: dict) -> dict:
    """Map a single Telnyx assistant dict → frontend Agent shape."""
    voice_settings = item.get("voice_settings") or {}
    transcription = item.get("transcription") or {}
    # Map Telnyx voice string to a numeric voice_id the frontend stores
    # Since Telnyx uses string voice IDs, we hash to a stable int for the frontend
    voice_str = voice_settings.get("voice", "")
    voice_id = abs(hash(voice_str)) % 100000 if voice_str else 0

    return {
        "id": item.get("id", ""),
        "name": item.get("name", ""),
        "greeting": item.get("greeting") or "",
        "prompt": item.get("instructions") or "",
        "language": transcription.get("language", "en"),
        "voice_id": voice_id,
        "voice_name": voice_str,
        "meeting_enabled": False,          # Cal.com not wired in this backend
        "cal_connected": False,
        "cal_api_key": None,
        "cal_event_type_id": None,
        "phone_number": None,
        "category": "custom",
    }


def _parse_telnyx_list(result: dict) -> list:
    """Extract the list of assistants from a Telnyx response envelope."""
    if isinstance(result, list):
        return result
    if "data" in result:
        raw = result["data"]
        return raw if isinstance(raw, list) else [raw]
    return []


# ── Request bodies ─────────────────────────────────────────────────────────────

class CreateAgentBody(BaseModel):
    agent_name: str
    custom_first_line: str
    prompt_text: str
    stt_language: str = "en"
    voice_id: int = 0
    voice_name: Optional[str] = None       # Actual Telnyx voice string
    enable_calendar_booking: bool = False
    cal_api_key: Optional[str] = None
    cal_event_type_id: Optional[str] = None
    phone_number: Optional[str] = None


class UpdateAgentBody(CreateAgentBody):
    agent_id: str
    status: Optional[str] = None


class DeleteAgentBody(BaseModel):
    agent_id: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_agents_endpoint():
    """List all agents — proxies GET /ai/assistants and adapts shape."""
    result = await list_assistants()
    items = _parse_telnyx_list(result)
    agents = [_telnyx_to_agent(item) for item in items]
    return {"agents": agents}


@router.post("/create-agent")
async def create_agent_endpoint(body: CreateAgentBody):
    """Create a new agent — proxies POST /ai/assistants."""
    # Map frontend payload → Telnyx CreateAssistantRequest
    voice_str = body.voice_name or "Telnyx.KokoroTTS.af_heart"
    payload = CreateAssistantRequest(
        name=body.agent_name,
        instructions=body.prompt_text,
        greeting=body.custom_first_line,
        voice_settings=VoiceSettings(voice=voice_str),
        transcription=TranscriptionSettings(language=body.stt_language),
    )
    result = await create_assistant(payload)
    # Return the newly created agent in frontend shape
    raw = result.get("data", result)
    if isinstance(raw, list):
        raw = raw[0] if raw else {}
    agent = _telnyx_to_agent(raw)
    return {"agent": agent}


@router.post("/update-agent")
async def update_agent_endpoint(body: UpdateAgentBody):
    """Update an existing agent — proxies POST /ai/assistants/{id}."""
    voice_str = body.voice_name or "Telnyx.KokoroTTS.af_heart"
    payload = UpdateAssistantRequest(
        name=body.agent_name,
        instructions=body.prompt_text,
        greeting=body.custom_first_line,
        voice_settings=VoiceSettings(voice=voice_str),
        transcription=TranscriptionSettings(language=body.stt_language),
    )
    result = await update_assistant(body.agent_id, payload)
    raw = result.get("data", result)
    if isinstance(raw, list):
        raw = raw[0] if raw else {}
    agent = _telnyx_to_agent(raw)
    return {"agent": agent}


@router.post("/delete-agent")
async def delete_agent_endpoint(body: DeleteAgentBody):
    """Delete an agent — proxies DELETE /ai/assistants/{id}."""
    result = await delete_assistant(body.agent_id)
    return {"success": True, "detail": result}


@router.post("/disconnect-agent-cal")
async def disconnect_agent_cal(body: DeleteAgentBody):
    """Stub — Cal.com is not connected in this backend."""
    return {"success": True, "message": "Cal.com not configured in this backend."}
