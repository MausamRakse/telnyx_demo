import os
import json
import base64
import asyncio
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

TELNYX_API_KEY       = os.getenv("TELNYX_API_KEY")
TELNYX_CONNECTION_ID = os.getenv("TELNYX_CONNECTION_ID")   # Call Control App ID
ASSISTANT_ID         = os.getenv("ASSISTANT_ID")
VOBIZ_SIP_DOMAIN     = os.getenv("VOBIZ_SIP_DOMAIN")
TELNYX_ACCOUNT_SID   = os.getenv("TELNYX_ACCOUNT_SID")
VOBIZ_USERNAME       = os.getenv("VOBIZ_USERNAME")          # SIP auth for Vobiz trunk
VOBIZ_PASSWORD       = os.getenv("VOBIZ_PASSWORD")          # SIP auth for Vobiz trunk

app = FastAPI(title="Telnyx AI Call Agent (Inbound & Outbound)")

# Async HTTP client for Telnyx v2 API
telnyx = httpx.AsyncClient(
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


# ── 1. Webhook Handler ────────────────────────────────────────────────────────
@app.post("/webhook")
async def handle_webhook(request: Request):
    """Handle all incoming webhooks from Telnyx (and Vobiz if configured)."""
    data = await request.json()
    
    # Safely extract event type
    event_type = data.get("data", {}).get("event_type")
    
    # If Vobiz sends a webhook, it won't have the Telnyx structure.
    if not event_type:
        # Check lowercase first
        event_type = data.get("event", data.get("type"))
        # Check uppercase Event if still not found
        if not event_type and "Event" in data:
            event_type = data["Event"].lower()
            
        if not event_type:
            event_type = "unknown_event"
        
    p = data.get("data", {}).get("payload", {})
    if not p and "payload" not in data.get("data", {}):
        # Fallback for non-Telnyx webhooks
        p = data

    call_control_id = p.get("call_control_id", "N/A")
    direction = p.get("direction")
    from_num = p.get("from", "unknown")
    client_state = p.get("client_state", "")

    # Print raw unrecognized events to debug
    if event_type == "unknown_event":
        print(f"\n📨 Raw Unrecognized Webhook:")
        print(json.dumps(data, indent=2))
        return {"status": "success"}

    if event_type not in ("call.conversation.message",):
        print(f"\n📨 Event: {event_type} | direction={direction} | from={from_num}")

    # ── A. Incoming Call ─────────────────────────────────────────────────────
    if event_type == "call.initiated" and direction == "incoming":
        print(f"   📞 Answering incoming call from {from_num}")
        print(f"   call_control_id: {call_control_id}")

        # Retry the answer up to 5 times with a short delay
        # (handles timing race between Vobiz CANCEL and our answer)
        for attempt in range(1, 6):
            r = await telnyx.post(
                f"/calls/{call_control_id}/actions/answer",
                json={}
            )
            print(f"   Attempt {attempt}: Answer → {r.status_code}")
            if r.status_code in (200, 201):
                print("   ✅ Call answered successfully!")
                break
            elif r.status_code == 422:
                err = r.json().get("errors", [{}])[0]
                code = err.get("code", "")
                print(f"   ⚠️  422 error code: {code} | {err.get('detail','')}")
                if code == "90018":
                    # Call already ended — no point retrying
                    print("   ❌ Call ended before we could answer (timing issue).")
                    break
                # For other 422s, wait briefly and retry
                await asyncio.sleep(0.3)
            else:
                print(f"   ❌ Unexpected: {r.text[:200]}")
                await asyncio.sleep(0.3)

    # ── B. Call Answered ─────────────────────────────────────────────────────
    elif event_type == "call.answered":
        to_field = p.get("to", "")
        print(f"   📟 call_control_id: {call_control_id}")
        print(f"   📟 to: {to_field}")
        print(f"   📟 client_state present: {bool(client_state)}")

        # Decode client_state to get assistant_id (outbound) or use env default (inbound)
        assistant_to_use = None
        if client_state:
            try:
                decoded = base64.b64decode(client_state).decode("utf-8")
                state_data = json.loads(decoded)
                assistant_to_use = state_data.get("assistant_id")
                print(f"   📟 Decoded assistant_id from client_state: {assistant_to_use}")
            except Exception as e:
                print(f"   ⚠️  Failed to decode client_state: {e}")

        if not assistant_to_use:
            # Inbound call with no client_state — use the env default
            assistant_to_use = ASSISTANT_ID
            print(f"   📟 Using default ASSISTANT_ID: {assistant_to_use}")

        if assistant_to_use:
            print(f"   🤖 Attaching AI Assistant: {assistant_to_use}")
            r = await telnyx.post(
                f"/calls/{call_control_id}/actions/ai_assistant_start",
                json={"assistant": {"id": assistant_to_use}}   # ← correct format
            )
            print(f"   AI Assistant start → {r.status_code}")
            if r.status_code not in (200, 201):
                print(f"   ⚠️  Error: {r.text[:300]}")
            else:
                print("   ✅ AI Agent attached successfully!")
        else:
            print("   ⚠️  No ASSISTANT_ID configured.")

    # ======================================================
    # Call Hangup
    # ======================================================
    elif event_type in ("call.hangup", "hangup"):

        cause = p.get("sip_hangup_cause", "N/A")
        source = p.get("hangup_source", "N/A")

        print("\n📴 Call Ended")
        print("Cause :", cause)
        print("Source:", source)
        
        # --- Fetch Post-Call Transcripts ---
        if TELNYX_ACCOUNT_SID:
            print("\n📜 Fetching Post-Call Transcripts from TeXML API...")
            try:
                res = await telnyx.get(
                    f"/texml/Accounts/{TELNYX_ACCOUNT_SID}/Transcriptions.json?PageSize=10"
                )
                if res.status_code == 200:
                    data = res.json()
                    transcriptions = data.get("transcriptions", [])
                    if transcriptions:
                        for t in transcriptions:
                            date = t.get("date_created", "Unknown Date")
                            text = t.get("transcription_text") or t.get("text") or json.dumps(t)
                            print(f"   [{date}] {text}")
                    else:
                        print("   (No transcriptions returned by API)")
                else:
                    print(f"   ❌ Transcript fetch failed: {res.status_code}")
                    print(f"      {res.text}")
            except Exception as e:
                print(f"   ❌ Error fetching transcripts: {e}")
        else:
            print("\n⚠️ Skipping full transcript fetch (TELNYX_ACCOUNT_SID not set in .env)")

    # ── D. AI Agent Transcript ───────────────────────────────────────────────
    elif event_type == "call.conversation.message":
        print("\n💬 TRANSCRIPT EVENT RECEIVED:")
        
        # The AI message data is nested inside a 'message' object
        message_obj = p.get("message", {})
        
        role = message_obj.get("role", "unknown")
        content = message_obj.get("content", "")
        
        # If it's still unknown, fallback to checking the payload directly
        if role == "unknown":
            role = p.get("role", "unknown")
            content = p.get("content", "")
        
        # Fallback raw payload print in case the structure is different
        if not content:
            print(json.dumps(p, indent=2))
        
        if role == "user":
            print(f"   👤 Caller: {content}")
        elif role == "assistant":
            print(f"   🤖 Agent: {content}")
        else:
            print(f"   💬 Message ({role}): {content}")

    # ── E. Standard Transcription Completed ──────────────────────────────────
    elif event_type == "transcription.completed":
        print("\n📝 FULL TRANSCRIPTION COMPLETED:")
        
        transcription_data = p.get("transcription_data", {})
        text = transcription_data.get("transcript") or p.get("text") or p.get("transcript")
        
        if text:
            print(f"   🗣️ {text}")
        else:
            # Fallback if structure is unknown
            print(json.dumps(p, indent=2))

    return {"status": "success"}


# ── 2. Outbound Call ──────────────────────────────────────────────────────────
@app.post("/dial")
async def trigger_dial(to: str, from_number: str, assistant_id: str):
    """Trigger an outbound AI call."""
    state_payload    = {"assistant_id": assistant_id}
    client_state_str = base64.b64encode(json.dumps(state_payload).encode()).decode()

    print(f"🚀 Dialling {from_number} ➜ {to} via Vobiz SIP Trunk")
    
    # Extract just the digits from the 'to' number (remove the + if it exists)
    clean_to = to.replace("+", "")
    vobiz_domain = os.getenv("VOBIZ_SIP_DOMAIN", "9bbe71bc.sip.vobiz.ai")
    
    # Route via SIP instead of PSTN to bypass Telnyx routing blocks (PE5)
    sip_to = f"sip:{clean_to}@{vobiz_domain}"

    call_payload = {
        "connection_id": TELNYX_CONNECTION_ID,
        "to":            sip_to,
        "from":          from_number,
        "client_state":  client_state_str,
        "timeout_secs":  60,
    }
    # Attach Vobiz SIP credentials so Telnyx can authenticate to the trunk
    if VOBIZ_USERNAME and VOBIZ_PASSWORD:
        call_payload["sip_auth_username"] = VOBIZ_USERNAME
        call_payload["sip_auth_password"] = VOBIZ_PASSWORD

    r = await telnyx.post("/calls", json=call_payload)
    
    if r.status_code not in (200, 201):
        print(f"   ❌ Outbound dial failed with HTTP {r.status_code}")
        print(f"   Details: {r.text}")
        err_msg = "Unknown error"
        try:
            err_msg = r.json().get("errors", [{}])[0].get("detail", r.text)
        except Exception:
            pass
        return {"success": False, "error": err_msg, "raw": r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text}

    data = r.json().get("data", {})
    return {
        "success": True,
        "call_control_id": data.get("call_control_id"),
        "to": to,
        "from": from_number,
        "raw": r.json()
    }


# ── 3. Create AI Assistant ────────────────────────────────────────────────────
@app.post("/agents")
async def create_calling_agent(
    name: str,
    instructions: str,
    voice: str = "Telnyx.KokoroTTS.af_heart"
):
    r = await telnyx.post("/ai/assistants", json={
        "name": name,
        "instructions": instructions,
        "enabled_features": ["telephony"],
        "voice_settings": {"voice": voice},
        "transcription": {"model": "deepgram/flux"}
    })
    return r.json()


# ── Vobiz Answer + AI Bridge ──────────────────────────────────────────────────
@app.post("/vobiz_answer")
async def vobiz_answer(request: Request):
    """
    Called by Vobiz when callee answers the outbound call.
    Flow:
      1. Vobiz hits this URL with StartApp event when call is answered.
      2. We respond with <Conference> XML to hold the caller in a conference room.
      3. We simultaneously dial the Telnyx AI assistant into the same conference room.
      4. The AI agent and the callee are now in the same conference — AI responds!
    """
    form = await request.form()
    event = form.get("Event", "")
    call_uuid = form.get("CallUUID", form.get("ALegUUID", ""))
    call_status = form.get("CallStatus", "")
    
    print(f"\n🌐 Vobiz /vobiz_answer | Event={event} | Status={call_status} | UUID={call_uuid}")

    if event == "StartApp":
        print("   ✅ Call answered! Connecting AI Agent via Telnyx...")
        
        # Use the CallUUID as the conference room name so it's unique per call
        room_name = f"ai-bridge-{call_uuid}"
        
        # Encode the assistant ID into client_state for the call.answered handler
        state_payload = {"assistant_id": ASSISTANT_ID}
        client_state_str = base64.b64encode(json.dumps(state_payload).encode()).decode()
        
        # Dial a new Telnyx call leg: from our number → Vobiz SIP conference
        # This leg will be answered by Telnyx and the AI agent will attach via call.answered
        vobiz_conference_sip = f"sip:{room_name}@{VOBIZ_SIP_DOMAIN}"
        
        r = await telnyx.post("/calls", json={
            "connection_id": TELNYX_CONNECTION_ID,
            "to": vobiz_conference_sip,
            "from": os.getenv("FROM_NUMBER", "+918071581212"),
            "client_state": client_state_str,
            "timeout_secs": 30,
        })
        print(f"   Telnyx → Vobiz conference dial → HTTP {r.status_code}")
        if r.status_code not in (200, 201):
            print(f"   ⚠️  Error: {r.text[:300]}")
        
        # Put the callee in the same conference room so they hear the AI
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference>{room_name}</Conference>
</Response>"""
        return Response(content=xml, media_type="application/xml")

    elif event == "Hangup":
        cause = form.get("HangupCauseName", "unknown")
        print(f"   📴 Vobiz call ended | Cause: {cause}")

    # Default fallback
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Wait length="1"/>
</Response>"""
    return Response(content=xml, media_type="application/xml")
