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
import json
import argparse
import httpx
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

ASSISTANT_ID = os.getenv("ASSISTANT_ID", "")
FROM_NUMBER  = os.getenv("FROM_NUMBER", "")       # +918071581212 from your .env
SERVER_URL   = "http://localhost:8001"

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
try:
    print(f"\n📞 Initiating outbound AI call...")
    print(f"   From  : {FROM_NUMBER}")
    print(f"   To    : {args.to}")
    print(f"   Agent : {ASSISTANT_ID}")
    print()

    # Call the /dial endpoint on our FastAPI server
    # The server will use Telnyx + Vobiz SIP credentials to reach the destination
    response = httpx.post(
        f"{args.server}/dial",
        params={
            "to":           args.to,
            "from_number":  args.from_number,
            "assistant_id": ASSISTANT_ID,
        },
        timeout=30.0,
    )
    data = response.json()

    if response.status_code == 200:
        success  = data.get("success", False)
        call_id  = data.get("call_control_id", "N/A")
        sip_err  = data.get("error", None)

        if not success or sip_err:
            print(f"❌ Call failed!")
            print(f"   Error: {sip_err}")
            print(f"   Raw Response:")
            print(json.dumps(data.get("raw"), indent=2))
        else:
            print(f"✅ Call triggered successfully!")
            print(f"   Call Control ID : {call_id}")
            print(f"   To              : {data.get('to', args.to)}")
            print()
            print("👀 Watch your server terminal for:")
            print("   📞 call.answered  → AI Agent will attach")
            print("   💬 conversation messages → transcripts")
    else:
        print(f"❌ Call failed (HTTP {response.status_code})")
        print(f"   Response: {json.dumps(data, indent=2)}")

except httpx.ConnectError:
    print(f"❌ Cannot connect to server at {args.server}")
    print("   Make sure the server is running: bash start.sh")
except Exception as e:
    print(f"❌ Error: {e}")
