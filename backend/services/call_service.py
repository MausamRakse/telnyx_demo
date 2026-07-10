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


# ── Campaign webhook helpers ───────────────────────────────────────────────────

_HANGUP_CAUSE_MAP = {
    # Raw Telnyx SIP hangup cause code → campaign contact call_status
    "USER_BUSY":           "busy",
    "CALL_REJECTED":       "busy",
    "NO_ANSWER":           "no_answer",
    "ORIGINATOR_CANCEL":   "no_answer",
    "SUBSCRIBER_ABSENT":   "no_answer",
    "UNALLOCATED_NUMBER":  "failed",
    "INCOMPATIBLE_DEST":   "failed",
    "NORMAL_CLEARING":     "no_answer",   # if not yet answered
}


def _is_campaign_call(state_data: dict) -> bool:
    """Return True if client_state identifies this as a campaign call leg."""
    return state_data.get("type") == "campaign_call" and bool(state_data.get("campaign_id"))


def _update_campaign_contact(contact_id: str, **fields) -> None:
    """Non-fatal update of a campaign_contacts row."""
    try:
        supabase.table("campaign_contacts").update(fields).eq("id", contact_id).execute()
    except Exception as e:
        print(f"   ⚠️  campaign_contacts update failed (non-fatal): {e}")


def _check_campaign_completion(campaign_id: str) -> None:
    """
    After a contact reaches a terminal status, check whether all contacts
    are done and mark the campaign 'completed' if so.
    This is a safety net — the dialer loop also does this check.
    """
    try:
        active = (
            supabase.table("campaign_contacts")
            .select("id", count="exact")
            .eq("campaign_id", campaign_id)
            .in_("call_status", ["pending", "queued", "calling"])
            .execute()
        )
        if not (active.count and active.count > 0):
            # Check current campaign status — only complete if it was 'running'
            camp = (
                supabase.table("campaigns")
                .select("status")
                .eq("id", campaign_id)
                .limit(1)
                .execute()
            )
            if camp.data and camp.data[0].get("status") == "running":
                supabase.table("campaigns").update({
                    "status":       "completed",
                    "completed_at": _now_iso(),
                }).eq("id", campaign_id).execute()
                print(f"   🎉 Campaign {campaign_id} auto-completed via webhook")
    except Exception as e:
        print(f"   ⚠️  campaign completion check failed (non-fatal): {e}")


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


    # ── A. Call Initiated ────────────────────────────────────────────────────────────
    if event_type == "call.initiated":
        print(f"   📞 Call initiated from {from_num} to {p.get('to')}")
        print(f"   call_control_id: {call_control_id}")

        # ── Campaign call: update contact to 'calling' status ──────────────────
        state_data = decode_client_state(client_state) if client_state else {}
        if _is_campaign_call(state_data):
            contact_id = state_data.get("contact_id")
            if contact_id:
                _update_campaign_contact(
                    contact_id,
                    call_status    = "calling",
                    call_control_id= call_control_id if call_control_id != "N/A" else None,
                    dialed_at      = _now_iso(),
                )
                print(f"   📊 Campaign contact {contact_id} → calling")
            return {"status": "success"}

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

    # ── B. Call Answered ────────────────────────────────────────────────────────────
    elif event_type == "call.answered":
        to_field = p.get("to", "")
        print(f"   📟 call_control_id: {call_control_id}")
        print(f"   📟 to: {to_field}")
        print(f"   📟 client_state present: {bool(client_state)}")

        state_data = decode_client_state(client_state) if client_state else {}

        # ── Campaign call: record answered status, skip AI assistant ────────────
        if _is_campaign_call(state_data):
            contact_id  = state_data.get("contact_id")
            campaign_id = state_data.get("campaign_id")
            session_id  = p.get("call_session_id")
            if contact_id:
                _update_campaign_contact(
                    contact_id,
                    call_status     = "answered",
                    call_session_id = session_id,
                    answered_at     = _now_iso(),
                )
                print(f"   📊 Campaign contact {contact_id} → answered")
            return {"status": "success"}

        # ── Non-campaign call: existing AI assistant flow ─────────────────────
        assistant_to_use = state_data.get("assistant_id") if state_data else None
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

    # ── C. Call Hangup ─────────────────────────────────────────────────────────────
    elif event_type in ("call.hangup", "hangup"):
        cause = p.get("sip_hangup_cause", "N/A")
        source = p.get("hangup_source", "N/A")

        print("\n📴 Call Ended")
        print("Cause :", cause)
        print("Source:", source)

        state_data = decode_client_state(client_state) if client_state else {}

        # ── Campaign call hangup ──────────────────────────────────────────────────
        if _is_campaign_call(state_data):
            contact_id  = state_data.get("contact_id")
            campaign_id = state_data.get("campaign_id")

            if contact_id:
                # Fetch current contact status — NEVER downgrade answered/voicemail
                contact_res = (
                    supabase.table("campaign_contacts")
                    .select("call_status, call_session_id")
                    .eq("id", contact_id)
                    .limit(1)
                    .execute()
                )
                current_contact_status = (
                    contact_res.data[0].get("call_status") if contact_res.data else "calling"
                )
                stored_session_id = (
                    contact_res.data[0].get("call_session_id") if contact_res.data else None
                )

                if current_contact_status in ("answered", "voicemail"):
                    # Already correctly classified — just close out timestamps
                    final_contact_status = current_contact_status
                else:
                    # Map raw SIP hangup cause to our status enum
                    cause_upper = (cause or "").upper().replace(" ", "_")
                    final_contact_status = _HANGUP_CAUSE_MAP.get(cause_upper, "failed")

                _update_campaign_contact(
                    contact_id,
                    call_status     = final_contact_status,
                    call_session_id = stored_session_id or p.get("call_session_id"),
                    ended_at        = _now_iso(),
                    hangup_cause    = cause if cause != "N/A" else None,
                )
                print(f"   📊 Campaign contact {contact_id} → {final_contact_status} (hangup: {cause})")

                # Check whether the whole campaign is now done
                if campaign_id:
                    _check_campaign_completion(campaign_id)

            return {"status": "success"}

        # ── Non-campaign call hangup: existing AI call logic ─────────────────────
        # Finalize call row in Supabase
        try:
            current_call_res = supabase.table("calls").select("status").eq("call_session_id", p.get("call_session_id")).execute()
            current_status = current_call_res.data[0].get("status") if current_call_res.data else None
            
            if current_status in ("answered", "completed"):
                final_status = "completed"
            else:
                final_status = "no_answer"
                
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

    # ── C2. Answering Machine Detection ───────────────────────────────────────────
    elif event_type == "call.machine.detection.ended":
        amd_result = p.get("result", "").lower()  # 'machine' | 'human' | 'not_sure'
        state_data = decode_client_state(client_state) if client_state else {}
        print(f"   🤖 AMD result: {amd_result} | call_control_id: {call_control_id}")

        if _is_campaign_call(state_data) and amd_result == "machine":
            contact_id = state_data.get("contact_id")
            if contact_id:
                _update_campaign_contact(
                    contact_id,
                    call_status = "voicemail",
                )
                print(f"   📊 Campaign contact {contact_id} → voicemail (AMD)")

    # ── D. AI Agent Transcript ─────────────────────────────────────────────────────────────
    elif event_type == "call.conversation.message":
        print("\n💬 TRANSCRIPT EVENT RECEIVED:")
        
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
