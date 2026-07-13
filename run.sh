#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# run.sh  —  Starts both the backend (FastAPI + ngrok) and frontend
# ─────────────────────────────────────────────────────────────────

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Start the Backend & ngrok in the background
echo "🚀 Starting backend (FastAPI + ngrok)..."
cd "$PROJECT_DIR"
bash start.sh &
BACKEND_PID=$!

# Wait 3 seconds to let backend initialize
sleep 3

# 2. Start the Frontend Vite dev server (in foreground)
echo "🚀 Starting frontend React application..."
cd "$PROJECT_DIR/frontend"
export PATH="/Users/mousamrakse/.nvm/versions/node/v22.22.2/bin:$PATH"
npm run dev
