"""
services/dialer_service.py
───────────────────────────
Async rate-limited campaign dialer engine.

Architecture:
  - asyncio.Semaphore controls max_concurrent calls in flight at any moment.
  - A per-call interval (1 / calls_per_second) adds pacing between dials.
  - Each campaign run is launched as an asyncio background Task stored in
    _active_tasks, allowing pause/stop to cancel it cleanly.
  - Campaign state is re-checked from the DB before each dial batch so that
    pause/stop propagates without requiring inter-task messaging.

Usage (from routes):
    await start_campaign_dialer(campaign_id)
    await stop_campaign_dialer(campaign_id)
"""

import asyncio
import json
import base64
from datetime import datetime, timezone
from typing import Optional

from config import settings
from utils.telnyx_client import telnyx
from utils.supabase_client import supabase


# ── Module-level task registry ────────────────────────────────────────────────
# Maps campaign_id → running asyncio.Task so we can cancel it on pause/stop.
_active_tasks: dict[str, asyncio.Task] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _encode_client_state(data: dict) -> str:
    """Encode campaign/contact identifiers into base64 client_state."""
    return base64.b64encode(json.dumps(data).encode()).decode()


# ── Dialer core ───────────────────────────────────────────────────────────────

class CampaignDialer:
    """
    Concurrency + rate-limited outbound dialer.

    max_concurrent: max simultaneous calls in flight (asyncio.Semaphore).
    calls_per_second: rate limit — each slot sleeps 1/rate before dialing.
    """

    def __init__(self, max_concurrent: int, calls_per_second: float):
        self.semaphore       = asyncio.Semaphore(max(1, max_concurrent))
        self._interval       = 1.0 / max(0.1, calls_per_second)  # seconds between calls
        self._cancelled      = False                              # set on pause/stop

    def cancel(self):
        """Signal this dialer to stop accepting new dials."""
        self._cancelled = True

    async def dial_contact(self, campaign: dict, contact: dict) -> None:
        """
        Acquire semaphore slot, sleep for rate limiting, then POST /v2/calls.
        Updates campaign_contacts row with result.
        """
        if self._cancelled:
            return

        async with self.semaphore:
            if self._cancelled:
                return

            # Rate-limit: space calls by 1/calls_per_second
            await asyncio.sleep(self._interval)

            if self._cancelled:
                return

            campaign_id = campaign["id"]
            contact_id  = contact["id"]
            to_number   = contact["phone_number"]
            from_number = campaign["from_number"]
            conn_id     = campaign["connection_id"]

            # Embed campaign + contact IDs + assistant ID in client_state so webhooks can route
            client_state = _encode_client_state({
                "campaign_id":  campaign_id,
                "contact_id":   contact_id,
                "assistant_id": campaign.get("assistant_id", ""),
                "type":         "campaign_call",
            })

            # Build webhook_url — must be the public URL Telnyx can reach
            webhook_url = ""
            if settings.APP_PUBLIC_URL:
                webhook_url = f"{settings.APP_PUBLIC_URL.rstrip('/')}/webhook"

            # Route call via Vobiz SIP trunk if domain is configured (for outbound India/international routing bypass)
            target_to = to_number
            if settings.VOBIZ_SIP_DOMAIN:
                from utils.helpers import build_sip_uri
                target_to = build_sip_uri(to_number, settings.VOBIZ_SIP_DOMAIN)

            call_payload: dict = {
                "connection_id": conn_id,
                "to":            target_to,
                "from":          from_number,
                "client_state":  client_state,
                "timeout_secs":  60,
            }

            if settings.VOBIZ_USERNAME and settings.VOBIZ_PASSWORD:
                call_payload["sip_auth_username"] = settings.VOBIZ_USERNAME
                call_payload["sip_auth_password"] = settings.VOBIZ_PASSWORD

            if webhook_url:
                call_payload["webhook_url"] = webhook_url


            print(f"📞 Dialing campaign {campaign_id} → {to_number}")

            try:
                r = await telnyx.post("/calls", json=call_payload)

                if r.status_code in (200, 201):
                    data = r.json().get("data", {})
                    call_control_id = data.get("call_control_id")
                    # Update contact: queued → calling
                    supabase.table("campaign_contacts").update({
                        "call_status":    "calling",
                        "call_control_id": call_control_id,
                        "dialed_at":      _now_iso(),
                    }).eq("id", contact_id).execute()
                    print(f"   ✅ Call placed | call_control_id={call_control_id}")

                else:
                    err = r.text[:200]
                    print(f"   ❌ Dial failed HTTP {r.status_code}: {err}")
                    supabase.table("campaign_contacts").update({
                        "call_status":  "failed",
                        "hangup_cause": f"dial_error_{r.status_code}",
                        "dialed_at":    _now_iso(),
                        "ended_at":     _now_iso(),
                    }).eq("id", contact_id).execute()

            except asyncio.CancelledError:
                raise  # propagate so the task cancels cleanly

            except Exception as e:
                print(f"   ❌ Dial exception for contact {contact_id}: {e}")
                supabase.table("campaign_contacts").update({
                    "call_status":  "failed",
                    "hangup_cause": f"exception: {str(e)[:100]}",
                    "dialed_at":    _now_iso(),
                    "ended_at":     _now_iso(),
                }).eq("id", contact_id).execute()

    async def run(self, campaign_id: str) -> None:
        """
        Main dialer loop:
        1. Fetch campaign row (rate limits, connection_id, etc.)
        2. While campaign status == 'running' and pending contacts exist:
           a. Re-fetch status from DB (catches external pause/stop)
           b. Batch-fetch next N pending contacts
           c. Dial them concurrently (semaphore-limited)
        3. When done: set campaign status='completed', completed_at=now
        """
        BATCH_SIZE = self.semaphore._value  # fetch one batch per semaphore capacity

        try:
            while not self._cancelled:
                # ── Re-read campaign status from DB on every iteration ────────
                campaign_result = (
                    supabase.table("campaigns")
                    .select("*")
                    .eq("id", campaign_id)
                    .limit(1)
                    .execute()
                )
                if not campaign_result.data:
                    print(f"⚠️  Campaign {campaign_id} not found — stopping dialer")
                    break

                campaign = campaign_result.data[0]
                current_status = campaign.get("status", "")

                if current_status not in ("running",):
                    print(f"ℹ️  Campaign {campaign_id} status={current_status} — dialer stopping")
                    break

                # ── Fetch next batch of pending contacts ─────────────────────
                pending_result = (
                    supabase.table("campaign_contacts")
                    .select("*")
                    .eq("campaign_id", campaign_id)
                    .eq("call_status", "pending")
                    .order("created_at", desc=False)
                    .limit(BATCH_SIZE * 2)
                    .execute()
                )
                contacts = pending_result.data or []

                if not contacts:
                    print(f"✅ Campaign {campaign_id}: no more pending contacts — completing")
                    break

                # Mark contacts as 'queued' before async dialing (prevents double-dial)
                contact_ids = [c["id"] for c in contacts]
                supabase.table("campaign_contacts").update({
                    "call_status": "queued",
                }).in_("id", contact_ids).execute()

                # Re-fetch with updated status (to pass correct state to dial_contact)
                for c in contacts:
                    c["call_status"] = "queued"

                # ── Dial concurrently, semaphore limits in-flight calls ───────
                tasks = [self.dial_contact(campaign, c) for c in contacts]
                await asyncio.gather(*tasks, return_exceptions=True)

            # ── Campaign finished (all pending exhausted or cancelled) ────────
            if not self._cancelled:
                # Check if any contacts are still in calling state
                still_active = (
                    supabase.table("campaign_contacts")
                    .select("id", count="exact")
                    .eq("campaign_id", campaign_id)
                    .in_("call_status", ["calling", "queued"])
                    .execute()
                )
                if not (still_active.count and still_active.count > 0):
                    # All done — mark campaign completed
                    supabase.table("campaigns").update({
                        "status":       "completed",
                        "completed_at": _now_iso(),
                    }).eq("id", campaign_id).execute()
                    print(f"🎉 Campaign {campaign_id} completed!")

        except asyncio.CancelledError:
            print(f"⚡ Dialer task for campaign {campaign_id} was cancelled (pause/stop)")
            raise  # Let asyncio handle the cancellation cleanly

        except Exception as e:
            print(f"❌ Dialer loop error for campaign {campaign_id}: {e}")
            # Leave campaign in current status — operator can investigate + restart

        finally:
            # Remove from active task registry
            _active_tasks.pop(campaign_id, None)


# ── Public API for routes ─────────────────────────────────────────────────────

async def start_campaign_dialer(campaign_id: str) -> None:
    """
    Launch the dialer as a background asyncio Task.
    Cancels any existing task for the same campaign first (safety net).
    """
    # Cancel any leftover task
    await stop_campaign_dialer(campaign_id)

    # Fetch campaign to get rate-limit settings
    campaign_result = (
        supabase.table("campaigns")
        .select("*")
        .eq("id", campaign_id)
        .limit(1)
        .execute()
    )
    if not campaign_result.data:
        raise ValueError(f"Campaign {campaign_id} not found")

    campaign = campaign_result.data[0]

    # Fail-fast guard: refuse to start if no assistant is assigned
    if not campaign.get("assistant_id"):
        raise ValueError(
            f"Campaign {campaign_id} has no assistant_id — refusing to start dialer. "
            "Assign an AI Assistant to this campaign first."
        )

    max_concurrent   = campaign.get("max_concurrent", settings.CAMPAIGN_MAX_CONCURRENT)
    calls_per_second = campaign.get("calls_per_second", settings.CAMPAIGN_CALLS_PER_SECOND)

    dialer = CampaignDialer(
        max_concurrent   = int(max_concurrent),
        calls_per_second = float(calls_per_second),
    )

    # Create background task — FastAPI's event loop will run it concurrently
    task = asyncio.create_task(dialer.run(campaign_id), name=f"dialer_{campaign_id}")
    _active_tasks[campaign_id] = task

    print(f"🚀 Dialer started for campaign {campaign_id} "
          f"(max_concurrent={max_concurrent}, rate={calls_per_second}/s)")


async def stop_campaign_dialer(campaign_id: str) -> None:
    """
    Cancel the running dialer task for a campaign (pause or stop).
    Non-fatal if no task is running.
    """
    task = _active_tasks.pop(campaign_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    print(f"⏹️  Dialer stopped for campaign {campaign_id}")


def is_dialer_running(campaign_id: str) -> bool:
    """Return True if a dialer task is currently active for this campaign."""
    task = _active_tasks.get(campaign_id)
    return task is not None and not task.done()
