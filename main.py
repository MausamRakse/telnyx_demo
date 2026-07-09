import contextlib
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from api.router import router as central_router
from api.call.routes import router as call_router
from utils.telnyx_client import telnyx
from services.call_service import handle_webhook_event, trigger_outbound_dial, handle_vobiz_answer

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: could initialize database connection here
    yield
    # Shutdown: close the async httpx client
    await telnyx.aclose()

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Modular backend for Telnyx AI Call Agent",
    lifespan=lifespan,
)

# Configure CORS — allow frontend dev server and any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── /api/... routes (used by the frontend React app) ─────────────────────────
app.include_router(central_router, prefix="/api")

# ── Root-level direct routes (used by Telnyx/Vobiz webhooks) ─────────────────
# These must remain at root because Telnyx POSTs directly to the public URL
@app.post("/webhook", tags=["Webhooks"])
async def webhook_handler(request: Request):
    """Handle all incoming webhooks from Telnyx (root-level for Telnyx compatibility)."""
    try:
        data = await request.json()
    except Exception:
        form = await request.form()
        data = {k: v for k, v in form.items()}
    return await handle_webhook_event(data)

@app.post("/dial", tags=["Call Control"])
async def dial_handler(to: str, from_number: str, assistant_id: str):
    """Trigger an outbound AI call (root-level legacy endpoint)."""
    return await trigger_outbound_dial(to, from_number, assistant_id)

@app.post("/vobiz_answer", tags=["Call Control"])
async def vobiz_answer_handler(request: Request):
    """Handle Vobiz answer and bridge to Telnyx AI Assistant."""
    form = await request.form()
    form_dict = {k: v for k, v in form.items()}
    return await handle_vobiz_answer(form_dict)

@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "connection_id": settings.TELNYX_CONNECTION_ID,
        "assistant_id": settings.ASSISTANT_ID,
        "vobiz_domain": settings.VOBIZ_SIP_DOMAIN,
    }
