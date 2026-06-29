import os
import json
import base64
import httpx
from fastapi import FastAPI, Request
from dotenv import load_dotenv

load_dotenv()

TELNYX_API_KEY = os.getenv("TELNYX_API_KEY")
TELNYX_CONNECTION_ID = os.getenv("TELNYX_CONNECTION_ID") # Call Control App ID
VOBIZ_SIP_DOMAIN = os.getenv("VOBIZ_SIP_DOMAIN")
VOBIZ_USERNAME = os.getenv("VOBIZ_USERNAME")

app = FastAPI(title="Telnyx Outbound AI Call Tester")

# Singleton HTTP client with authorization headers preset for Telnyx v2 API
client = httpx.AsyncClient(
    base_url="https://api.telnyx.com/v2",
    headers={
        "Authorization": f"Bearer {TELNYX_API_KEY}",
        "Content-Type": "application/json"
    },
    timeout=30.0
)

@app.post("/agents")
async def create_calling_agent(name: str, instructions: str, voice: str = "Telnyx.KokoroTTS.af_heart"):
    """
    Creates a new AI Voice Agent (Assistant) with telephony enabled.
    """
    try:
        payload = {
            "name": name,
            "instructions": instructions,
            "enabled_features": ["telephony"],
            "voice_settings": {
                "voice": voice
            },
            "transcription": {
                "model": "deepgram/flux"
            }
        }
        
        # Raw HTTP POST to https://api.telnyx.com/v2/ai/assistants
        response = await client.post("/ai/assistants", json=payload)
        
        if response.status_code not in (200, 201):
            return {"success": False, "error": f"Telnyx API error {response.status_code}: {response.text}"}
            
        response_json = response.json()
        
        agent_id = response_json.get("id")
        agent_name = response_json.get("name")
        telephony = response_json.get("telephony_settings", {})
        texml_app_id = telephony.get("default_texml_app_id") if isinstance(telephony, dict) else None

        return {
            "success": True,
            "agent_id": agent_id,
            "name": agent_name,
            "default_texml_app_id": texml_app_id
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/connections")
async def create_sip_connection(name: str, username: str, password: str):
    """
    Creates a credential-based SIP Connection on Telnyx for Vobiz integration.
    """
    try:
        payload = {
            "connection_name": name,
            "user_name": username,
            "password": password
        }
        
        # Raw HTTP POST to https://api.telnyx.com/v2/credential_connections
        response = await client.post("/credential_connections", json=payload)
        
        if response.status_code not in (200, 201):
            return {"success": False, "error": f"Telnyx API error {response.status_code}: {response.text}"}
            
        response_json = response.json()
        return {
            "success": True,
            "connection": response_json.get("data")
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/webhook")
async def handle_webhook(request: Request):
    payload = await request.json()
    data = payload.get("data", {})
    event_type = data.get("event_type")
    
    if event_type == "call.answered":
        call_control_id = data.get("payload", {}).get("call_control_id")
        client_state = data.get("payload", {}).get("client_state")
        
        assistant_id = None
        if client_state:
            try:
                # Try to decode client_state (expecting base64 encoded JSON)
                decoded = base64.b64decode(client_state).decode("utf-8")
                state_data = json.loads(decoded)
                assistant_id = state_data.get("assistant_id")
            except Exception as e:
                print(f"Error decoding client_state: {e}")
        
        if not assistant_id:
            # Fallback to an assistant ID from env if client_state decoding failed
            assistant_id = os.getenv("ASSISTANT_ID")
            
        if assistant_id:
            print(f"📞 Call answered! Attaching AI Assistant {assistant_id} to call {call_control_id}...")
            # Dispatch the call control action to attach the AI Assistant
            response = await client.post(
                f"/calls/{call_control_id}/actions/ai_assistant_start",
                json={"assistant": {"id": assistant_id}}
            )
            print(f"🤖 Assistant Start Response: [{response.status_code}] {response.text}")
        else:
            print(f"⚠️ Call answered, but no assistant_id was found in client_state or env.")
        
    elif event_type == "call.conversation.ended":
        print("💬 Conversation ended.")
        
    return {"status": "success"}

@app.post("/dial")
async def trigger_dial(to: str, from_number: str, assistant_id: str):
    """
    Triggers an outbound call.
    to: E.164 phone number (e.g. '+91...') or a SIP URI
    from_number: Your caller ID number
    assistant_id: The ID of the assistant to attach when the call is answered
    """
    dial_to = to
    dial_from = from_number
    
    # If Vobiz SIP Domain is configured, route the call leg via Vobiz SIP trunk
    if VOBIZ_SIP_DOMAIN:
        if not to.startswith("sip:"):
            dial_to = f"sip:{to}@{VOBIZ_SIP_DOMAIN}"
        if not from_number.startswith("sip:"):
            # Route caller ID / credentials via the Vobiz trunk domain
            dial_from = f"sip:{from_number}@{VOBIZ_SIP_DOMAIN}"
            
    print(f"🚀 Triggering outbound call: {dial_from} -> {dial_to} using Connection: {TELNYX_CONNECTION_ID}...")
    
    # Store assistant_id in client_state as base64-encoded JSON string
    state_payload = {"assistant_id": assistant_id}
    client_state_str = base64.b64encode(json.dumps(state_payload).encode("utf-8")).decode("utf-8")
    
    payload = {
        "connection_id": TELNYX_CONNECTION_ID,
        "to": dial_to,
        "from": dial_from,
        "client_state": client_state_str
    }
    
    response = await client.post("/calls", json=payload)
    return response.json()
