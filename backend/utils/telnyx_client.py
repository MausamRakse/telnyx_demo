"""
utils/telnyx_client.py
──────────────────────
Shared singleton async httpx client for all Telnyx v2 API calls.
Import `telnyx` from here in every service that needs it.
"""

import httpx
from config import settings

telnyx = httpx.AsyncClient(
    base_url=settings.TELNYX_BASE_URL,
    headers={
        "Authorization": f"Bearer {settings.TELNYX_API_KEY}",
        "Content-Type": "application/json",
    },
    timeout=30.0,
)
