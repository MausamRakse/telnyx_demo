#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# start.sh  —  Starts the Unified FastAPI server + ngrok tunnel
# Usage: bash start.sh
# ─────────────────────────────────────────────────────────────────

export PATH="$PATH:/Users/mousamrakse/Library/Python/3.9/bin"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Telnyx Unified AI Calling Agent (Inbound & Outbound)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Start FastAPI server in background ────────────────────────
echo "▶  Starting FastAPI server on port 8000..."
python3 -m uvicorn app:app --reload --port 8000 &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"
sleep 3

# ── 2. Start ngrok tunnel ────────────────────────────────────────
echo ""
echo "▶  Starting ngrok tunnel on port 8000..."
ngrok http 8000 --log=stdout &
NGROK_PID=$!
sleep 4

# ── 3. Fetch the public ngrok URL ────────────────────────────────
echo ""
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c \
  "import sys,json; tunnels=json.load(sys.stdin).get('tunnels',[]); \
   print(next((t['public_url'] for t in tunnels if t['public_url'].startswith('https')), 'Not found'))" 2>/dev/null)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅ Server Address : http://localhost:8000"
echo "  ✅ Swagger UI Docs: http://localhost:8000/docs"
if [ "$NGROK_URL" != "Not found" ] && [ -n "$NGROK_URL" ]; then
    echo "  ✅ ngrok Public   : $NGROK_URL"
    echo "  ✅ Webhook URL    : $NGROK_URL/webhook"
    echo ""
    echo "  ⚠️  Ensure the Webhook URL in your Telnyx Portal is set to:"
    echo "      $NGROK_URL/webhook"
else
    echo "  ⚠️  ngrok URL not found. Check http://localhost:4040 manually."
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  📞 To trigger an outbound call:"
echo "      python3 make_call.py +91XXXXXXXXXX"
echo ""
echo "  📞 To test inbound calls:"
echo "      Simply dial your configured number from your mobile!"
echo ""
echo "  Press Ctrl+C to stop the server and ngrok."
echo ""

# ── 4. Wait and cleanup on exit ──────────────────────────────────
trap "echo ''; echo '🛑 Stopping server and ngrok...'; kill $SERVER_PID $NGROK_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
