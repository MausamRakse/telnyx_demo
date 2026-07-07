"""
utils/supabase_client.py
────────────────────────
Singleton Supabase client for all database operations.
Uses the service_role key — bypasses RLS, trusted server-side only.

Import `supabase` from here in every database module that needs it.
"""

import sys
from config import settings

# Fail fast with a clear message if creds are missing
if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
    print(
        "\n❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env\n"
        "    Get them from: Supabase Dashboard → Settings → API\n"
        "    See .env.example for the expected format.\n",
        file=sys.stderr,
    )
    sys.exit(1)

from supabase import create_client, Client  # noqa: E402

supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)
