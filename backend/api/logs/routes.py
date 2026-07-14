"""
api/logs/routes.py
───────────────────
Endpoints for call logs and stats that the frontend dashboard needs.

These read from Supabase directly (the same tables that the webhook
handler populates during live calls) and return data in the exact
shape the frontend's api/client.ts expects.

Endpoints:
  GET /logs/call-logs?limit=50  → { logs: CallLog[] }
  GET /logs/stats               → { total_calls, total_completed, active_agents }
"""

from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from utils.supabase_client import supabase
from utils.telnyx_client import telnyx

router = APIRouter()


def _format_call_log(row: dict) -> dict:
    """
    Convert a Supabase `calls` row → frontend CallLog shape.
    Frontend interface:
      { call_id, phone_number, date, status, recording_url,
        transcript, json_output, agent_name, customer_name }
    """
    # Map Supabase status → frontend display status
    status_map = {
        "completed": "Completed",
        "answered":  "Completed",
        "in_progress": "Processing",
        "initiated":   "Processing",
        "failed":      "Not Answered",
        "no_answer":   "Not Answered",
    }
    raw_status = (row.get("status") or "").lower()
    display_status = status_map.get(raw_status, "Processing")

    direction = row.get("direction", "incoming")
    if direction == "outgoing":
        raw_num = row.get("to_number") or row.get("from_number") or "unknown"
    else:
        raw_num = row.get("from_number") or row.get("to_number") or "unknown"
        
    # If raw_num is a sip URI like sip:919770774461@vobiz... extract the number
    if raw_num.startswith("sip:"):
        raw_num = raw_num.split("sip:")[1].split("@")[0]

    assistant_info = row.get("assistants") or {}
    agent_name = assistant_info.get("name") or row.get("sip_trunk") or "AI Agent"

    return {
        "call_id":       row.get("call_session_id") or row.get("id", ""),
        "phone_number":  raw_num,
        "date":          row.get("created_at") or row.get("started_at") or "",
        "status":        display_status,
        "recording_url": None,     # populated below if available
        "transcript":    None,
        "json_output":   None,
        "agent_name":    agent_name,
        "customer_name": None,
    }


@router.get("/logs/call-logs")
async def call_logs_endpoint(limit: int = 50):
    """
    Return call logs from Supabase in the shape the frontend expects.
    Joins recordings and transcripts where available.
    """
    try:
        result = (
            supabase.table("calls")
            .select("*, assistants(name)")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        print(f"⚠️  call-logs query error: {e}")
        rows = []

    logs = []
    for row in rows:
        log = _format_call_log(row)

        # Try to attach a recording URL
        call_id = row.get("id")
        if call_id:
            try:
                rec_result = (
                    supabase.table("recordings")
                    .select("recording_id, mp3_url, wav_url, duration_secs")
                    .eq("call_id", call_id)
                    .limit(1)
                    .execute()
                )
                if rec_result.data:
                    rec = rec_result.data[0]
                    if rec.get("recording_id"):
                        log["recording_url"] = f"/api/logs/recordings/{rec['recording_id']}/play"
                    else:
                        log["recording_url"] = rec.get("mp3_url") or rec.get("wav_url")
                        
                    # Override status to Answered if recording is longer than 2s
                    if rec.get("duration_secs", 0) > 2:
                        log["status"] = "Completed"
            except Exception:
                pass

            # Try to attach a transcript
            try:
                tr_result = (
                    supabase.table("transcript_messages")
                    .select("speaker, text")
                    .eq("call_id", call_id)
                    .order("occurred_at")
                    .execute()
                )
                if tr_result.data:
                    lines = [
                        f"{m['speaker']}: {m['text']}"
                        for m in tr_result.data
                        if m.get("text", "").strip()
                    ]
                    log["transcript"] = "\n".join(lines) if lines else None
                    if log["transcript"]:
                        log["status"] = "Completed"
            except Exception:
                pass

        logs.append(log)

    return {"logs": logs}


@router.get("/logs/stats")
async def stats_endpoint():
    """
    Return aggregate stats for the dashboard.
    Reads from the Supabase calls and assistants tables.
    """
    total_calls = 0
    total_completed = 0
    active_agents = 0

    try:
        calls_result = supabase.table("calls").select("status").execute()
        rows = calls_result.data or []
        total_calls = len(rows)
        total_completed = sum(
            1 for r in rows
            if (r.get("status") or "").lower() in ("completed", "answered")
        )
    except Exception as e:
        print(f"⚠️  stats calls query error: {e}")

    try:
        agents_result = (
            supabase.table("assistants")
            .select("id")
            .eq("is_active", True)
            .execute()
        )
        active_agents = len(agents_result.data or [])
    except Exception as e:
        print(f"⚠️  stats agents query error: {e}")

    return {
        "total_calls":     total_calls,
        "total_completed": total_completed,
        "active_agents":   active_agents,
    }


@router.get("/logs/recordings/{recording_id}/play")
async def play_recording(recording_id: str):
    """
    Proxy endpoint for playing recordings to bypass S3 expiration.
    Fetches the fresh playback URL from Telnyx API on-demand.
    """
    try:
        response = await telnyx.get(f"/recordings/{recording_id}")
        if response.status_code == 200:
            data = response.json().get("data", {})
            download_urls = data.get("download_urls", {})
            fresh_url = download_urls.get("mp3") or download_urls.get("wav")
            if fresh_url:
                return RedirectResponse(url=fresh_url)
        
        # Fallback to local DB url if Telnyx fetch fails
        rec_result = (
            supabase.table("recordings")
            .select("mp3_url, wav_url")
            .eq("recording_id", recording_id)
            .limit(1)
            .execute()
        )
        if rec_result.data:
            rec = rec_result.data[0]
            url = rec.get("mp3_url") or rec.get("wav_url")
            if url:
                return RedirectResponse(url=url)
                
    except Exception as e:
        print(f"⚠️  Error fetching recording {recording_id}: {e}")
        
    return {"error": "Recording not found or expired"}


@router.get("/users/me")
async def get_user_me():
    """
    Stub — no per-user auth system in this backend.
    Returns a placeholder so the frontend doesn't crash.
    """
    return {
        "id": "system",
        "email": "admin@convexa.ai",
        "name": "Admin",
        "cal_connected": False,
    }


@router.post("/users/me/cal-settings")
async def update_cal_settings():
    """Stub — Cal.com not configured in this backend."""
    return {"success": True, "message": "Cal.com not configured."}


@router.post("/users/me/disconnect-cal")
async def disconnect_cal():
    """Stub — Cal.com not configured in this backend."""
    return {"success": True}


@router.get("/auth/cal/url")
async def get_cal_auth_url():
    """Stub — Cal.com OAuth not configured in this backend."""
    return {"url": None, "message": "Cal.com integration not configured."}


@router.post("/campaigns/create")
async def create_campaign():
    """Stub — Campaign management not in this backend."""
    return {"success": False, "message": "Campaign management not supported in this backend."}


@router.post("/campaigns/update")
async def update_campaign():
    """Stub — Campaign management not in this backend."""
    return {"success": False, "message": "Campaign management not supported in this backend."}
