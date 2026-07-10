#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build.sh — Combined build script for frontend and backend on Render
# ─────────────────────────────────────────────────────────────

# Exit immediately if a command exits with a non-zero status
set -o errexit

# 1. Build Frontend
echo "📦 Building Frontend (React/Vite)..."
cd frontend
npm install
npm run build
cd ..

# 2. Build Backend
echo "🐍 Installing Backend Python Dependencies..."
cd backend
pip install -r requirements.txt
cd ..

echo "✅ Unified Build Completed Successfully!"
