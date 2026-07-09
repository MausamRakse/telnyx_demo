import json
import asyncio
from datetime import datetime, timezone
from fastapi import Response
from config import settings
from utils.telnyx_client import telnyx
from utils.supabase_client import supabase
from utils.helpers import encode_client_state, decode_client_state, build_sip_uri, extract_telnyx_error
from services.recording_service import store_recording_id, fetch_recording, start_recording
from services.transcript_service import (
    start_transcription,
    handle_transcription_event,
    fetch_ai_conversation_transcript,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def trigger_outbound_dial(to: str, from_number: str, assistant_id: str) -> dict:
    """Trigger an outbound AI call."""
    state_payload = {"assistant_id": assistant_id}
    client_state_str = encode_client_state(state_payload)

    print(f"🚀 Dialling {from_number} ➜ {to} via Vobiz SIP Trunk")
    
    sip_to = build_sip_uri(to, settings.VOBIZ_SIP_DOMAIN)

    call_payload = {
        "connection_id": settings.TELNYX_CONNECTION_ID,
        "to":            sip_to,
        "from":          from_number,
        "client_state":  client_state_str,
        "timeout_secs":  60,
    }
    
    if settings.VOBIZ_USERNAME and settings.VOBIZ_PASSWORD:
        call_payload["sip_auth_username"] = settings.VOBIZ_USERNAME
        call_payload["sip_auth_password"] = settings.VOBIZ_PASSWORD

    r = await telnyx.post("/calls", json=call_payload)
    
    if r.status_code not in (200, 201):
        print(f"   ❌ Outbound dial failed with HTTP {r.status_code}")
        print(f"   Details: {r.text}")
        err_msg = extract_telnyx_error(r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text)
        return {"success": False, "error": err_msg, "raw": r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text}

    data = r.json().get("data", {})
    return {
        "success": True,
        "call_control_id": data.get("call_control_id"),
        "to": to,
        "from": from_number,
        "raw": r.json()
    }


async def handle_vobiz_answer(form: dict) -> Response:
    """Handle Vobiz answer and bridge to Telnyx AI Assistant."""
    event = form.get("Event", "")
    call_uuid = form.get("CallUUID", form.get("ALegUUID", ""))
    call_status = form.get("CallStatus", "")
    
    print(f"\\n🌐 Vobiz /vobiz_answer | Event={event} | Status={call_status} | UUID={call_uuid}")

    if event == "StartApp":
        print("   ✅ Call answered! Connecting AI Agent via Telnyx...")
        
        room_name = f"ai-bridge-{call_uuid}"
        
        state_payload = {"assistant_id": settings.ASSISTANT_ID}
        client_state_str = encode_client_state(state_payload)
        
        vobiz_conference_sip = f"sip:{room_name}@{settings.VOBIZ_SIP_DOMAIN}"
        
        r = await telnyx.post("/calls", json={
            "connection_id": settings.TELNYX_CONNECTION_ID,
            "to": vobiz_conference_sip,
            "from": settings.FROM_NUMBER or "+918071581212",
            "client_state": client_state_str,
            "timeout_secs": 30,
        })
        print(f"   Telnyx → Vobiz conference dial → HTTP {r.status_code}")
        if r.status_code not in (200, 201):
            print(f"   ⚠️  Error: {r.text[:300]}")
        
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference>{room_name}</Conference>
</Response>"""
        return Response(content=xml, media_type="application/xml")

    elif event == "Hangup":
        cause = form.get("HangupCauseName", "unknown")
        print(f"   📴 Vobiz call ended | Cause: {cause}")

    xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Wait length="1"/>
</Response>"""
    return Response(content=xml, media_type="application/xml")


async def handle_webhook_event(data: dict) -> dict:
    """Handle incoming webhook events from Telnyx."""
    event_type = data.get("data", {}).get("event_type")
    
    if not event_type:
        event_type = data.get("event", data.get("type"))
        if not event_type and "Event" in data:
            event_type = data["Event"].lower()
        if not event_type:
            event_type = "unknown_event"
        
    p = data.get("data", {}).get("payload", {})
    if not p and "payload" not in data.get("data", {}):
        p = data

    call_control_id = p.get("call_control_id", "N/A")
    direction = p.get("direction")
    from_num = p.get("from", "unknown")
    client_state = p.get("client_state", "")

    # ── Webhook audit log (non-blocking) ─────────────────────────────────────
    try:
        supabase.table("webhook_events").insert({
            "event_type":      event_type,
            "call_control_id": call_control_id if call_control_id != "N/A" else None,
            "call_session_id": p.get("call_session_id"),
            "payload":         data,
            "received_at":     _now_iso(),
        }).execute()
    except Exception as _we:
        print(f"   ⚠️  webhook_events log failed (non-fatal): {_we}")

    if event_type == "unknown_event":
        print(f"\\n📨 Raw Unrecognized Webhook:")
        print(json.dumps(data, indent=2))
        return {"status": "success"}

    if event_type not in ("call.conversation.message",):
        print(f"\n📨 Event: {event_type} | direction={direction} | from={from_num}")


    # ── A. Call Initiated ────────────────────────────────────────────────────
    if event_type == "call.initiated":
        print(f"   📞 Call initiated from {from_num} to {p.get('to')}")
        print(f"   call_control_id: {call_control_id}")

        # Persist call row to Supabase for BOTH incoming and outgoing
        try:
            supabase.table("calls").upsert({
                "call_session_id": p.get("call_session_id"),
                "call_control_id": call_control_id,
                "direction":       direction,
                "from_number":     from_num,
                "to_number":       p.get("to"),
                "status":          "initiated",
                "started_at":      p.get("start_time") or _now_iso(),
                "created_at":      _now_iso(),
            }, on_conflict="call_session_id").execute()
            print("   💾 Call row saved to Supabase")
        except Exception as e:
            print(f"   ⚠️  calls DB insert failed (non-fatal): {e}")

        if direction == "incoming":
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
                        print("   ❌ Call ended before we could answer (timing issue).")
                        break
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

        assistant_to_use = None
        if client_state:
            state_data = decode_client_state(client_state)
            if state_data:
                assistant_to_use = state_data.get("assistant_id")
                print(f"   📟 Decoded assistant_id from client_state: {assistant_to_use}")
            else:
                print(f"   ⚠️  Failed to decode client_state")

        if not assistant_to_use:
            assistant_to_use = settings.ASSISTANT_ID
            print(f"   📟 Using default ASSISTANT_ID: {assistant_to_use}")

        if assistant_to_use:
            print(f"   🤖 Attaching AI Assistant: {assistant_to_use}")
            r = await telnyx.post(
                f"/calls/{call_control_id}/actions/ai_assistant_start",
                json={"assistant": {"id": assistant_to_use}}
            )
            print(f"   AI Assistant start → {r.status_code}")
            if r.status_code not in (200, 201):
                print(f"   ⚠️  Error: {r.text[:300]}")
            else:
                print("   ✅ AI Agent attached successfully!")
        else:
            print("   ⚠️  No ASSISTANT_ID configured.")

        # Persist call.answered to Supabase (status + assistant_id)
        try:
            update_data = {
                "status":      "answered",
                "answered_at": _now_iso(),
            }
            # Look up local assistants row to get internal UUID
            if assistant_to_use:
                ast_result = (
                    supabase.table("assistants")
                    .select("id")
                    .eq("telnyx_assistant_id", assistant_to_use)
                    .limit(1)
                    .execute()
                )
                if ast_result.data:
                    update_data["assistant_id"] = ast_result.data[0]["id"]
                else:
                    try:
                        from services.assistant_service import get_assistant, _telnyx_to_db_row
                        print(f"   🤖 Assistant {assistant_to_use} not found in DB. Fetching from Telnyx...")
                        telnyx_resp = await get_assistant(assistant_to_use)
                        telnyx_data = telnyx_resp.get("data", telnyx_resp)
                        row = _telnyx_to_db_row(telnyx_data)
                        row["created_at"] = telnyx_data.get("created_at") or _now_iso()
                        upsert_res = supabase.table("assistants").upsert(
                            row, on_conflict="telnyx_assistant_id"
                        ).execute()
                        if upsert_res.data:
                            update_data["assistant_id"] = upsert_res.data[0]["id"]
                            print(f"   ✅ Dynamically synced assistant: {row['name']}")
                    except Exception as ae:
                        print(f"   ⚠️  Failed to dynamically sync assistant {assistant_to_use}: {ae}")
            supabase.table("calls").update(update_data).eq(
                "call_session_id", p.get("call_session_id")
            ).execute()
            print("   💾 Call status updated to 'answered' in Supabase")
        except Exception as e:
            print(f"   ⚠️  calls update (answered) failed (non-fatal): {e}")

        # Start real-time transcription (Approach A)
        await start_transcription(
            call_control_id=call_control_id,
            call_leg_id=p.get("call_leg_id"),
            call_session_id=p.get("call_session_id"),
            direction=direction,
        )

        # Start call recording programmatically
        await start_recording(call_control_id)

    # ── C. Call Hangup ───────────────────────────────────────────────────────
    elif event_type in ("call.hangup", "hangup"):
        cause = p.get("sip_hangup_cause", "N/A")
        source = p.get("hangup_source", "N/A")

        print("\n📴 Call Ended")
        print("Cause :", cause)
        print("Source:", source)
        
        # Finalize call row in Supabase
        try:
            final_status = "failed" if cause not in ("N/A", "normal_clearing", None) else "completed"
            supabase.table("calls").update({
                "status":       final_status,
                "ended_at":     _now_iso(),
                "hangup_cause": cause,
                "hangup_source": source,
            }).eq("call_session_id", p.get("call_session_id")).execute()
            print(f"   💾 Call finalized in Supabase | status={final_status}")
        except Exception as e:
            print(f"   ⚠️  calls update (hangup) failed (non-fatal): {e}")



        # Fetch full AI conversation transcript and store it (Approach B)
        session_id = p.get("call_session_id")
        if session_id:
            try:
                await fetch_ai_conversation_transcript(session_id)
            except Exception as e:
                print(f"   ⚠️  AI conversation transcript fetch error: {e}")

    # ── D. AI Agent Transcript ───────────────────────────────────────────────
    elif event_type == "call.conversation.message":
        print("\\n💬 TRANSCRIPT EVENT RECEIVED:")
        
        message_obj = p.get("message", {})
        role = message_obj.get("role", "unknown")
        content = message_obj.get("content", "")
        
        if role == "unknown":
            role = p.get("role", "unknown")
            content = p.get("content", "")
        
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
        print("\\n📝 FULL TRANSCRIPTION COMPLETED:")
        
        transcription_data = p.get("transcription_data", {})
        text = transcription_data.get("transcript") or p.get("text") or p.get("transcript")
        
        if text:
            print(f"   🗣️ {text}")
        else:
            print(json.dumps(p, indent=2))

    # ── F. Real-time Call Transcription (Approach A) ──────────────────────────
    elif event_type == "call.transcription":
        # Process each is_final=True utterance and store it by speaker
        await handle_transcription_event(p)

    # ── G. Recording Saved ────────────────────────────────────────────────────
    elif event_type in ("call.recording.saved", "call.recording.completed"):
        recording_id    = p.get("recording_id") or p.get("id")
        call_session_id = p.get("call_session_id") or p.get("call_control_id")
        from_num        = p.get("from", "unknown")
        to_num          = p.get("to", "unknown")

        print(f"\n🎙️ Recording event: {event_type} | id={recording_id}")

        if recording_id:
            # 1. Store minimal stub immediately so it's queryable right away
            await store_recording_id(recording_id, call_session_id, from_num, to_num)
            print(f"   💾 Recording stub saved | session={call_session_id}")

            # 2. Auto-fetch full metadata from Telnyx (MP3/WAV URLs, duration, etc.)
            try:
                record = await fetch_recording(recording_id)
                print(f"   ✅ Recording metadata fetched | status={record.status}")
                if record.download_urls.mp3:
                    print(f"   🎧 MP3 URL : {record.download_urls.mp3}")
                if record.download_urls.wav:
                    print(f"   🎧 WAV URL : {record.download_urls.wav}")
                if record.duration_secs is not None:
                    print(f"   ⏱️  Duration: {record.duration_secs}s")
            except Exception as e:
                print(f"   ⚠️  Could not fetch recording metadata: {e}")
        else:
            print("   ⚠️ No recording_id found in webhook payload")
            print(json.dumps(p, indent=2))

    return {"status": "success"}
