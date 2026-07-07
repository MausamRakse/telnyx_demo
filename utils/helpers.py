"""
utils/helpers.py
────────────────
Common helper functions shared across services.
"""

import json
import base64
from typing import Any


def encode_client_state(data: dict) -> str:
    """Encode a dict into a base64 string for Telnyx client_state."""
    return base64.b64encode(json.dumps(data).encode()).decode()


def decode_client_state(encoded: str) -> dict:
    """Decode a Telnyx client_state base64 string back into a dict."""
    try:
        return json.loads(base64.b64decode(encoded).decode("utf-8"))
    except Exception:
        return {}


def clean_phone_number(number: str) -> str:
    """Strip leading '+' from a phone number (for SIP URI construction)."""
    return number.lstrip("+")


def build_sip_uri(number: str, domain: str) -> str:
    """Build a SIP URI from a phone number and domain.

    Example:
        build_sip_uri("+919876543210", "9bbe71bc.sip.vobiz.ai")
        → "sip:919876543210@9bbe71bc.sip.vobiz.ai"
    """
    clean = clean_phone_number(number)
    return f"sip:{clean}@{domain}"


def extract_telnyx_error(response_json: Any) -> str:
    """Extract the first human-readable error detail from a Telnyx error response."""
    try:
        errors = response_json.get("errors", [])
        if errors:
            return errors[0].get("detail", str(response_json))
    except Exception:
        pass
    return str(response_json)
