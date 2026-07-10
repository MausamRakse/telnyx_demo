from fastapi import APIRouter
from api.assistant.routes import router as assistant_router
from api.call.routes import router as call_router
from api.agent.routes import router as agent_router
from api.user.routes import router as user_router
from api.companion.routes import router as companion_router
from api.recording.routes import router as recording_router
from api.transcript.routes import router as transcript_router
from api.logs.routes import router as logs_router
from api.campaign.routes import router as campaign_router

router = APIRouter()

# Register all module-specific routers here
router.include_router(assistant_router, prefix="/ai/assistants", tags=["Assistant"])
router.include_router(call_router, prefix="", tags=["Call Control"])
router.include_router(recording_router, prefix="", tags=["Recordings"])
router.include_router(transcript_router, prefix="", tags=["Transcripts"])
router.include_router(logs_router, prefix="", tags=["Logs & Stats"])
router.include_router(campaign_router, prefix="/campaigns", tags=["Campaigns"])

# Placeholders for future modules
router.include_router(agent_router, prefix="/agents", tags=["Agent"])
router.include_router(user_router, prefix="/users", tags=["User"])
router.include_router(companion_router, prefix="/companions", tags=["Companion"])

