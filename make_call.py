"""
make_call.py
─────────────
Triggers an outbound call to an Indian number via Vobiz SIP Trunk.
Uses the /dial endpoint on your running FastAPI server.

Usage:
    python make_call.py +919876543210

Or with a custom assistant:
    python make_call.py +919876543210 --assistant ag_xxxxxxxxxx
"""

import sys
import os
import argparse
import httpx
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

ASSISTANT_ID = os.getenv("ASSISTANT_ID", "")
FROM_NUMBER  = os.getenv("FROM_NUMBER", "")       # +918071581212 from your .env
SERVER_URL   = "http://localhost:8000"

parser = argparse.ArgumentParser(description="Make an outbound call via Telnyx + Vobiz")
parser.add_argument("to",           help="Indian number to call (E.164, e.g. +919876543210)")
parser.add_argument("--from-number",default=FROM_NUMBER,  help="Your Vobiz DID (+918071581212)")
parser.add_argument("--assistant",  default=ASSISTANT_ID, help="Telnyx AI Assistant ID")
parser.add_argument("--server",     default=SERVER_URL,   help="FastAPI server URL")
args = parser.parse_args()

# ── Validate inputs ──────────────────────────────────────────────────────────
errors = []
if not args.to.startswith("+"):
    errors.append("❌ 'to' number must be in E.164 format (e.g. +919876543210)")
if not args.from_number:
    errors.append("❌ 'from_number' not set. Add 'from_number=+91XXXXXXXXXX' to .env")
if not args.assistant or args.assistant == "your_default_assistant_id_here":
    errors.append("❌ 'assistant' not set. Run setup_assistant.py first or set ASSISTANT_ID in .env")

if errors:
    for e in errors:
        print(e)
    sys.exit(1)

# ── Trigger the Call ─────────────────────────────────────────────────────────
print(f"📞 Initiating outbound call...")
print(f"   From : {args.from_number}")
print(f"   To   : {args.to}")
print(f"   Agent: {args.assistant}")
print(f"   Server: {args.server}")
print()

try:
    response = httpx.post(
        f"{args.server}/dial",
        params={
            "to":           args.to,
            "from_number":  args.from_number,
            "assistant_id": args.assistant,
        },
        timeout=30.0,
    )
    data = response.json()

    if response.status_code in (200, 201):
        # New /dial response format: {success, call_control_id, to, from, raw}
        call_id  = data.get("call_control_id") or data.get("data", {}).get("call_control_id", "unknown")
        success  = data.get("success", True)
        sip_err  = data.get("error", None)

        if not success or sip_err:
            print(f"❌ Call failed!")
            print(f"   Error: {sip_err}")
        else:
            print(f"✅ Call triggered successfully!")
            print(f"   Call Control ID : {call_id}")
            print(f"   To              : {data.get('to', args.to)}")
            print()
            print("👀 Watch your server terminal for:")
            print("   📞 Call answered! → AI Assistant will attach")
            print("   💬 Conversation ended.")
    else:
        print(f"❌ Call failed (HTTP {response.status_code})")
        print(f"   Response: {data}")

except httpx.ConnectError:
    print(f"❌ Cannot connect to server at {args.server}")
    print("   Make sure the server is running: uvicorn app:app --reload --port 8000")
except Exception as e:
    print(f"❌ Error: {e}")
