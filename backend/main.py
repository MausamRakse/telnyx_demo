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
    # Startup: dynamic ngrok URL detection if not configured in .env
    if not settings.APP_PUBLIC_URL:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get("http://localhost:4040/api/tunnels", timeout=2.0)
                if resp.status_code == 200:
                    tunnels = resp.json().get("tunnels", [])
                    for t in tunnels:
                        public_url = t.get("public_url", "")
                        if public_url.startswith("https"):
                            settings.APP_PUBLIC_URL = public_url
                            print(f"\n📡 Dynamically detected ngrok tunnel URL: {public_url}")
                            break
        except Exception as e:
            print(f"\n⚠️  Could not dynamically detect ngrok tunnel URL: {e}")
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

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint. Serves React index.html if frontend is built."""
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "connection_id": settings.TELNYX_CONNECTION_ID,
        "assistant_id": settings.ASSISTANT_ID,
        "vobiz_domain": settings.VOBIZ_SIP_DOMAIN,
    }

# Serve static files and handle client-side routing
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="static")

    @app.get("/{catchall:path}", tags=["Frontend"])
    async def serve_react(catchall: str):
        # Ignore backend API & documentation paths
        if (catchall.startswith("api") or 
            catchall.startswith("webhook") or 
            catchall.startswith("dial") or 
            catchall.startswith("vobiz_answer") or 
            catchall.startswith("docs") or 
            catchall.startswith("openapi.json")):
            raise HTTPException(status_code=404)
        
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="index.html not found")

