import os
import json
import base64
import httpx
from fastapi import FastAPI, Request
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

TELNYX_API_KEY      = os.getenv("TELNYX_API_KEY")
TELNYX_CONNECTION_ID = os.getenv("TELNYX_CONNECTION_ID")  # Call Control App ID
ASSISTANT_ID         = os.getenv("ASSISTANT_ID")
VOBIZ_SIP_DOMAIN    = os.getenv("VOBIZ_SIP_DOMAIN")        # Optional, comment out in .env to dial direct

app = FastAPI(title="Telnyx AI Call Agent (Inbound & Outbound)")

# HTTP client preset for Telnyx v2 API
client = httpx.AsyncClient(
    base_url="https://api.telnyx.com/v2",
    headers={
        "Authorization": f"Bearer {TELNYX_API_KEY}",
        "Content-Type": "application/json"
    },
    timeout=30.0
)

@app.get("/")
async def health_check():
    return {
        "status": "healthy",
        "connection_id": TELNYX_CONNECTION_ID,
        "assistant_id": ASSISTANT_ID,
        "vobiz_domain": VOBIZ_SIP_DOMAIN
    }

# ── 1. Webhook Handler (Controls the Inbound / Outbound Call Flow) ───────────
@app.post("/webhook")
async def handle_webhook(request: Request):
    payload = await request.json()
    data = payload.get("data", {})
    event_type = data.get("event_type")
    
    # A. Incoming Call Rings (Inbound Route)
    if event_type == "call.initiated":
        call_control_id = data.get("payload", {}).get("call_control_id")
        direction = data.get("payload", {}).get("direction")
        from_num = data.get("payload", {}).get("from")
        
        if direction == "incoming":
            print(f"📞 Incoming call ringing from {from_num}... Answering call...")
            response = await client.post(f"/calls/{call_control_id}/actions/answer")
            print(f"   Answer command sent. Status: {response.status_code}")
            
    # B. Call Connected (Triggered for both Inbound & Outbound calls when answered)
    elif event_type == "call.answered":
        call_control_id = data.get("payload", {}).get("call_control_id")
        client_state = data.get("payload", {}).get("client_state")
        
        # Check if an assistant ID was explicitly passed via client_state (outbound)
        assistant_to_use = None
        if client_state:
            try:
                decoded = base64.b64decode(client_state).decode("utf-8")
                state_data = json.loads(decoded)
                assistant_to_use = state_data.get("assistant_id")
            except Exception:
                pass
                
        # If not, fallback to default assistant ID from env (inbound)
        if not assistant_to_use:
            assistant_to_use = ASSISTANT_ID
            
        if assistant_to_use:
            print(f"📞 Call connected! Attaching AI Assistant {assistant_to_use}...")
            response = await client.post(
                f"/calls/{call_control_id}/actions/ai_assistant_start",
                json={"assistant": {"id": assistant_to_use}}
            )
            print(f"🤖 AI Assistant join request: [{response.status_code}]")
        else:
            print("⚠️ Call answered, but no ASSISTANT_ID is set in .env or client_state.")
            
    # C. Call Ended
    elif event_type in ("call.hangup", "call.conversation.ended"):
        print("💬 Call conversation ended.")
        
    return {"status": "success"}

@app.post("/dial")
async def trigger_dial(to: str, from_number: str, assistant_id: str):
    """
    Triggers an outbound call.
    to: Phone number to call (e.g. +91XXXXXXXXXX)
    from_number: Your caller ID number
    """
    dial_to = to
    dial_from = from_number
    print(f"🚀 Dialing direct E.164 target: {dial_from} ➜ {dial_to}")
        
    # Store assistant_id in client_state
    state_payload = {"assistant_id": assistant_id}
    client_state_str = base64.b64encode(json.dumps(state_payload).encode("utf-8")).decode("utf-8")
    
    payload = {
        "connection_id": TELNYX_CONNECTION_ID,
        "to": dial_to,
        "from": dial_from,
        "client_state": client_state_str,
        "timeout_secs": 60,
    }
    
    response = await client.post("/calls", json=payload)
    return response.json()

# ── 3. Helper Endpoint to Create AI Assistants ──────────────────────────────
@app.post("/agents")
async def create_calling_agent(name: str, instructions: str, voice: str = "Telnyx.KokoroTTS.af_heart"):
    payload = {
        "name": name,
        "instructions": instructions,
        "enabled_features": ["telephony"],
        "voice_settings": {"voice": voice},
        "transcription": {"model": "deepgram/flux"}
    }
    response = await client.post("/ai/assistants", json=payload)
    return response.json()
