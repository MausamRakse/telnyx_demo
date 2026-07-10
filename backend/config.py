"""
config.py
─────────
Single source of truth for all environment variables and application settings.
Uses python-dotenv to load from .env file.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # ── Telnyx ──────────────────────────────────────────────────────────────
    TELNYX_API_KEY: str        = os.getenv("TELNYX_API_KEY", "")
    TELNYX_BASE_URL: str       = os.getenv("TELNYX_BASE_URL", "https://api.telnyx.com/v2")
    TELNYX_CONNECTION_ID: str  = os.getenv("TELNYX_CONNECTION_ID", "")
    TELNYX_ACCOUNT_SID: str    = os.getenv("TELNYX_ACCOUNT_SID", "")

    # ── AI Assistant ─────────────────────────────────────────────────────────
    ASSISTANT_ID: str          = os.getenv("ASSISTANT_ID", "")

    # ── Vobiz SIP Trunk ──────────────────────────────────────────────────────
    VOBIZ_SIP_DOMAIN: str      = os.getenv("VOBIZ_SIP_DOMAIN", "")
    VOBIZ_USERNAME: str        = os.getenv("VOBIZ_USERNAME", "")
    VOBIZ_PASSWORD: str        = os.getenv("VOBIZ_PASSWORD", "")
    VOBIZ_AUTH_ID: str         = os.getenv("VOBIZ_AUTH_ID", "")
    VOBIZ_AUTH_TOKEN: str      = os.getenv("VOBIZ_AUTH_TOKEN", "")

    # ── Caller ID ────────────────────────────────────────────────────────────
    FROM_NUMBER: str           = os.getenv("FROM_NUMBER", "")

    # ── Supabase (Postgres) ──────────────────────────────────────────────────
    SUPABASE_URL: str              = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str              = os.getenv("APP_NAME", "Telnyx AI Call Agent")
    APP_ENV: str               = os.getenv("APP_ENV", "development")
    APP_PORT: int              = int(os.getenv("APP_PORT", "8001"))
    LOG_LEVEL: str             = os.getenv("LOG_LEVEL", "INFO")
    # Public URL used as the Telnyx webhook_url for campaign call legs
    APP_PUBLIC_URL: str        = os.getenv("APP_PUBLIC_URL", "")

    # ── Campaign Dialer ───────────────────────────────────────────────────────
    # Max simultaneous in-flight calls across all campaigns
    CAMPAIGN_MAX_CONCURRENT: int      = int(os.getenv("CAMPAIGN_MAX_CONCURRENT", "5"))
    # Maximum calls initiated per second (token-bucket rate limit)
    CAMPAIGN_CALLS_PER_SECOND: float  = float(os.getenv("CAMPAIGN_CALLS_PER_SECOND", "1"))


# Singleton instance — import this everywhere
settings = Settings()
