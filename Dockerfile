# ── Stage 1: Build React Frontend ──
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build Python Backend ──
FROM python:3.9-slim
WORKDIR /app

# Install system dependencies (for building psycopg2 or other C extensions if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy backend application code
COPY backend/ ./backend/

# Set Python path to resolve imports within the backend directory
ENV PYTHONPATH=/app/backend

# Expose port and define start command (Render injects $PORT)
EXPOSE 10000
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}
