# 🛠️ Developer Documentation — Telnyx Unified AI Calling Agent

> **For internal developers and contributors only.**
> This document explains every part of the system — architecture, services, phone number setup, SIP trunk configuration, database schema, environment variables, and how to run the full stack from scratch.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Why Telnyx + Vobiz? — The Dual-Provider Architecture](#2-why-telnyx--vobiz--the-dual-provider-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Complete Project Structure](#4-complete-project-structure)
5. [How the System Works — Full Call Flow](#5-how-the-system-works--full-call-flow)
6. [Telnyx Account Setup](#6-telnyx-account-setup)
7. [Phone Number Setup on Telnyx](#7-phone-number-setup-on-telnyx)
8. [SIP Trunk Setup (Vobiz)](#8-sip-trunk-setup-vobiz)
9. [Supabase Database Setup](#9-supabase-database-setup)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Backend — Architecture & Services](#11-backend--architecture--services)
12. [API Endpoints Reference](#12-api-endpoints-reference)
13. [Frontend — Architecture](#13-frontend--architecture)
14. [Running Locally (Development)](#14-running-locally-development)
15. [Running in Production (Docker / Render)](#15-running-in-production-docker--render)
16. [Campaign Dialer — How It Works](#16-campaign-dialer--how-it-works)
17. [Transcripts & Recordings Flow](#17-transcripts--recordings-flow)
18. [Troubleshooting Common Issues](#18-troubleshooting-common-issues)

---

## 1. System Overview

This project is a **Unified AI Calling Agent** — a full-stack application that lets you:

- **Receive inbound calls** on a Telnyx phone number → Automatically answer and connect the caller to an AI Assistant.
- **Place outbound calls** to any phone number → Route calls through a **Vobiz SIP Trunk** to reach Indian DID numbers (or any number) → Connect the answered call to an AI Assistant.
- **Run bulk calling campaigns** — Upload a CSV/XLSX list of contacts, then dial all of them automatically with rate limiting and concurrency control.
- **Store everything** — every call, transcript message, recording, and webhook event is saved to Supabase (Postgres).
- **View a dashboard** — a React frontend shows agents, call logs, transcripts, recordings, campaigns, and meeting bookings.

### High-Level Architecture

```
┌────────────────────────┐          ┌──────────────────────────┐
│   React Frontend        │ ◄──────► │  FastAPI Backend (Python) │
│   (Vite + TypeScript)   │  REST    │  Uvicorn on port 8001     │
│   TailwindCSS + Zustand │          └──────────┬───────────────┘
└────────────────────────┘                       │
                                                 │ HTTP (httpx)
                             ┌───────────────────▼──────────────┐
                             │         Telnyx API v2             │
                             │  - Call Control (Calls API)       │
                             │  - AI Assistants API              │
                             │  - Recordings API                  │
                             │  - Transcripts API                 │
                             └───────────┬──────────────────────┘
                                         │ Webhooks (POST)
                             ┌───────────▼──────────────────────┐
                             │   /webhook  endpoint              │
                             │   (FastAPI handles events)        │
                             └───────────┬──────────────────────┘
                                         │ Writes
                             ┌───────────▼──────────────────────┐
                             │   Supabase (Postgres)             │
                             │   calls, transcripts, recordings  │
                             │   campaigns, assistants...        │
                             └──────────────────────────────────┘
```

---

---

## 2. Why Telnyx + Vobiz? — The Dual-Provider Architecture

This is the **most important architectural decision** in the project. Here is a clear explanation of why we need **both** services and what each one does.

### The Core Problem: Telnyx Cannot Dial Indian Phone Numbers Directly

Telnyx is a US-based carrier that operates primarily in North America and Europe. It provides:
- Excellent **Call Control API** (programmable telephony)
- Powerful **AI Assistants** (voice AI)
- Reliable **recordings and transcripts**
- US/EU phone numbers

However, **Telnyx does not offer Indian DID (Direct Inward Dialing) numbers**, and direct PSTN calls to Indian numbers from Telnyx are either unavailable or very expensive due to international termination restrictions.

### The Solution: Vobiz as an Indian SIP Trunk

Vobiz is an Indian SIP trunk / VoIP carrier that provides:
- **Indian phone numbers (DIDs)** — e.g. `+918071581212`
- **Indian PSTN termination** — can call any Indian mobile or landline number cheaply and reliably
- **SIP trunk connectivity** — connects to Telnyx via SIP protocol

### How They Work Together

```
┌─────────────────────────────────────────────────────────────────┐
│                    What Each Provider Does                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  TELNYX                          VOBIZ                          │
│  ───────                         ─────                          │
│  ✅ AI Voice Assistants           ✅ Indian phone numbers (DIDs) │
│  ✅ Call Control API              ✅ Indian PSTN termination      │
│  ✅ Recordings & Transcripts      ✅ SIP trunk (connects to Telnyx)│
│  ✅ Webhooks & call events        ✅ Low-cost calls to India      │
│  ✅ US/EU phone numbers           ❌ No AI, no webhooks, no API   │
│  ❌ No Indian DID numbers         ❌ No recordings or transcripts │
│  ❌ Cannot dial Indian PSTN       ❌ No call control logic        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### The Outbound Call Path (Step by Step)

```
Your Backend
    │
    │  POST /calls to Telnyx API
    │  to: sip:+919876543210@sip.vobiz.com   ← SIP URI wrapping the Indian number
    │  from: your Telnyx DID
    │  sip_auth_username: vobiz_user
    │  sip_auth_password: vobiz_pass
    │
    ▼
Telnyx (handles call control, AI, recording)
    │
    │  Routes the call via SIP protocol to Vobiz
    │  (Telnyx dials: sip:+919876543210@sip.vobiz.com)
    │
    ▼
Vobiz SIP Trunk
    │
    │  Terminates the call onto the Indian PSTN
    │  (Vobiz dials: +91 9876543210 as a real mobile call)
    │
    ▼
Indian Phone (+91 9876543210) — rings on the person's mobile
```

### Why Not Use Telnyx Alone?

| Scenario | Telnyx Only | Telnyx + Vobiz |
|---|---|---|
| Call a US number | ✅ Works | ✅ Works |
| Call an Indian mobile | ❌ Not available / blocked | ✅ Works |
| Have an Indian caller ID | ❌ No Indian DIDs | ✅ Indian DID as FROM number |
| AI voice conversation | ✅ Works | ✅ Works |
| Record the call | ✅ Works | ✅ Works |
| Get transcripts | ✅ Works | ✅ Works |

### Why Not Use Vobiz Alone?

Vobiz is just a SIP trunk — it has no AI, no webhooks, no programmable call control. It is a dumb pipe that can only place phone calls. You cannot attach an AI assistant, record calls, or get transcripts using Vobiz alone.

### Summary

> **Telnyx brings the intelligence. Vobiz brings the Indian connectivity.**
> Together they form a complete system: Telnyx controls the call and runs the AI, while Vobiz physically terminates the call to any Indian phone number.

---

## 3. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.9+ | Primary language |
| **FastAPI** | 0.115.5 | REST API framework + auto Swagger docs |
| **Uvicorn** | 0.32.1 | ASGI server (runs FastAPI) |
| **httpx** | 0.27.2 | Async HTTP client — all calls to Telnyx API |
| **Pydantic** | 2.10.3 | Request/response schema validation |
| **python-dotenv** | 1.0.1 | Loads `.env` config file |
| **supabase-py** | 2.10.0 | Supabase (Postgres) client |
| **phonenumbers** | >= 8.13 | E.164 phone number validation for campaigns |
| **openpyxl** | >= 3.1 | XLSX file parsing for campaign contact uploads |
| **python-multipart** | >= 0.0.9 | CSV/XLSX file upload support |
| **ngrok** | latest | Tunnels `localhost:8001` to a public HTTPS URL for Telnyx webhooks |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **React** | 19 | UI framework |
| **TypeScript** | ~5.9 | Type-safe JS |
| **Vite** | 8 | Dev server + production bundler |
| **TailwindCSS** | 3 | Utility-first CSS styling |
| **Zustand** | 5 | Lightweight global state management |
| **Axios** | 1.14 | HTTP client to call the FastAPI backend |
| **React Router DOM** | 7 | Client-side page routing |
| **Lucide React** | latest | Icon library |
| **React Hot Toast** | 2 | Notification toasts |
| **@supabase/supabase-js** | 2.102 | Optional direct Supabase access from frontend |
| **xlsx** | 0.18 | Client-side XLSX export |

### External Services

| Service | Role |
|---|---|
| **Telnyx** | Phone number provider, Call Control API, AI Assistants, Recordings, Transcripts |
| **Vobiz** | SIP Trunk provider — routes outbound calls to Indian DIDs |
| **Supabase** | Hosted Postgres database (no self-hosted DB required) |
| **Cal.com** | Appointment booking (optional — used in booking/meeting features) |
| **ngrok** | Temporary public tunnel for Telnyx webhooks during local development |

---

## 3. Complete Project Structure

```
telnyx_demo/
│
├── backend/                          # All Python/FastAPI code
│   ├── main.py                       # App entry point, CORS, route mounting, lifespan
│   ├── config.py                     # Single source of truth for all env vars (Settings class)
│   ├── make_call.py                  # CLI script to trigger an outbound call manually
│   ├── requirements.txt              # Python dependencies
│   ├── .env.example                  # Template for your .env file (copy and fill in)
│   ├── .env                          # NOT committed. Your actual secrets.
│   │
│   ├── api/                          # FastAPI routers (one module per feature)
│   │   ├── router.py                 # Central router — registers all sub-routers
│   │   ├── assistant/routes.py       # CRUD for AI Assistants (sync from Telnyx)
│   │   ├── call/routes.py            # /dial, /webhook, outbound call API
│   │   ├── campaign/routes.py        # Campaign CRUD, contact upload, start/stop/pause
│   │   ├── recording/routes.py       # Fetch recordings from DB or Telnyx
│   │   ├── transcript/routes.py      # Fetch transcripts per call
│   │   ├── logs/routes.py            # Call logs, webhook event logs, stats
│   │   ├── booking/routes.py         # Cal.com appointment booking
│   │   ├── meeting/routes.py         # Meeting logs
│   │   ├── agent/routes.py           # Placeholder (future)
│   │   ├── user/routes.py            # Placeholder (future)
│   │   └── companion/routes.py       # Placeholder (future)
│   │
│   ├── services/                     # Core business logic layer
│   │   ├── call_service.py           # MAIN webhook handler — handles ALL call events
│   │   ├── campaign_service.py       # Campaign CRUD, CSV/XLSX contact parsing, CDR
│   │   ├── dialer_service.py         # Async rate-limited outbound campaign dialer engine
│   │   ├── assistant_service.py      # Telnyx AI Assistant CRUD, local DB sync
│   │   ├── recording_service.py      # Store/fetch recording metadata
│   │   ├── transcript_service.py     # Real-time transcription + AI transcript fetch
│   │   └── booking_service.py        # Cal.com slot availability + booking
│   │
│   ├── database/                     # Low-level Supabase DB access layer
│   │   ├── db_helpers.py             # Generic upsert / get_or_create helpers
│   │   ├── transcript_store.py       # Transcript messages + call_legs CRUD
│   │   └── recording_store.py        # Recordings table CRUD
│   │
│   ├── schemas/                      # Pydantic models for request/response validation
│   │   ├── assistant.py
│   │   ├── call.py
│   │   └── campaign.py
│   │
│   ├── utils/                        # Shared utility modules
│   │   ├── telnyx_client.py          # Singleton httpx client for Telnyx API (with retry)
│   │   ├── supabase_client.py        # Singleton Supabase client
│   │   ├── auth.py                   # JWT auth helpers for multi-tenant user auth
│   │   └── helpers.py                # encode/decode client_state, build_sip_uri, etc.
│   │
│   ├── models/                       # ORM stubs (no ORM used — raw Supabase client)
│   ├── supabase/
│   │   └── migrations/               # SQL migration files to run in Supabase
│   │       ├── 0001_init.sql         # Core tables: users, assistants, calls, transcripts, recordings
│   │       ├── 0002_campaigns.sql    # Campaign + campaign_contacts tables
│   │       ├── 0003_campaign_assistant.sql
│   │       ├── 0003_multi_tenant.sql # Multi-tenant owner_id support
│   │       └── 0004_meetings.sql     # Meetings table for Cal.com booking logs
│   │
│   └── test_webhook.py               # Quick test scripts for webhook payloads
│
├── frontend/                         # React + Vite frontend
│   ├── src/
│   │   ├── main.tsx                  # React entry point
│   │   ├── App.tsx                   # Router setup (all pages)
│   │   ├── api/client.ts             # Axios instance pointed at FastAPI backend
│   │   ├── store/                    # Zustand stores (global state)
│   │   ├── pages/                    # Full page components (Agents, Calls, Campaigns...)
│   │   ├── components/               # Reusable UI components (Sidebar, Modals, etc.)
│   │   └── lib/                      # Supabase client, helpers
│   └── package.json
│
├── start.sh                          # One-command dev launcher (FastAPI + ngrok)
├── build.sh                          # Build script for Render.com deployment
├── Dockerfile                        # Multi-stage Docker build (frontend + backend)
└── README.md                         # Quick-start overview
```

---

## 4. How the System Works — Full Call Flow

### A. Inbound Call Flow

```
1. Someone dials your Telnyx phone number
       |
2. Telnyx fires a POST to your /webhook endpoint
   with event: "call.initiated" (direction: "incoming")
       |
3. call_service.py sees an inbound call → calls Telnyx API:
   POST /calls/{call_control_id}/actions/answer
       |
4. Call is answered. Telnyx fires "call.answered" webhook.
       |
5. call_service.py attaches AI Assistant:
   POST /calls/{call_control_id}/actions/ai_assistant_start
   { "assistant": { "id": "<ASSISTANT_ID>" } }
       |
6. AI assistant takes over — speaks greeting, handles conversation.
       |
7. During call: "call.transcription" webhooks arrive
   → stored in transcript_messages table (speaker: User or Agent)
       |
8. On hangup: "call.hangup" webhook received.
   → calls table updated (status: completed)
   → Background task runs: fetch_transcript_with_retries()
     → Polls Telnyx Transcripts API, stores all messages
       |
9. "call.recording.saved" webhook arrives (if recording enabled)
   → recordings table updated with MP3/WAV URLs
```

### B. Outbound Call Flow (Single Call)

```
1. Developer or frontend triggers POST /dial
   with params: to, from_number, assistant_id
       |
2. call_service.trigger_outbound_dial() runs:
   - Encodes assistant_id into base64 client_state
   - Builds SIP URI: sip:+91XXXXXXXXXX@<VOBIZ_SIP_DOMAIN>
   - POST /calls to Telnyx API with SIP destination
       |
3. Telnyx routes call through Vobiz SIP Trunk to the destination number
       |
4. Destination phone rings. On answer:
   → "call.answered" webhook fires
   → AI Assistant attached (same as inbound flow from step 5)
       |
5. Call conversation proceeds; transcripts + recordings stored.
```

### C. Campaign Call Flow (Bulk Dialing)

```
1. Frontend: Create campaign (POST /api/campaigns)
   → set name, from_number, connection_id, assistant_id, max_concurrent, rate
       |
2. Frontend: Upload contacts CSV/XLSX (POST /api/campaigns/{id}/contacts/upload)
   → Each row validated as E.164 phone number
   → Stored in campaign_contacts table (status: pending)
       |
3. Frontend: Start campaign (POST /api/campaigns/{id}/start)
   → dialer_service.start_campaign_dialer(campaign_id) called
   → Background asyncio.Task launched
       |
4. CampaignDialer engine runs:
   - Fetches pending contacts in batches
   - asyncio.Semaphore(max_concurrent) controls simultaneous calls
   - Sleeps 1/calls_per_second between dials (rate limiting)
   - For each contact: POST /calls with client_state:
     { "type": "campaign_call", "campaign_id": ..., "contact_id": ..., "assistant_id": ... }
       |
5. As calls progress, webhooks update campaign_contacts:
   pending → calling → answered / no_answer / voicemail / busy / failed
       |
6. When all contacts reach terminal status → campaign auto-marked "completed"
       |
7. Frontend polls GET /api/campaigns/{id}/progress for live stats
```

---

## 5. Telnyx Account Setup

### Step 1 — Create a Telnyx Account

Go to https://telnyx.com → Sign Up → Verify your email.

### Step 2 — Get Your API Key

1. Log into https://portal.telnyx.com
2. Navigate to **Auth → API Keys**
3. Click **"Create API Key"**
4. Copy the key → paste into your `.env` as `TELNYX_API_KEY`

> **IMPORTANT:** This is a secret key. Never commit it to Git. Never share it in chat.

### Step 3 — Create a Call Control Application

This is the "Connection ID" that ties your phone numbers to your backend.

1. Go to **Voice → Call Control → Applications**
2. Click **"Add App"**
3. Set the **Webhook URL** to your public server URL + `/webhook`:
   - Local dev: `https://<your-ngrok-url>.ngrok.io/webhook`
   - Production: `https://your-domain.com/webhook`
4. Set **Webhook API Version** to **API v2**
5. Click **Save**
6. Copy the **Connection ID** → paste into `.env` as `TELNYX_CONNECTION_ID`

### Step 4 — Create an AI Assistant

1. Go to **AI → Assistants**
2. Click **"Create Assistant"**
3. Configure:
   - **Name:** Give it a descriptive name
   - **System Prompt / Instructions:** Describe how the AI should behave
   - **Voice:** Choose voice, language, accent
   - **Greeting:** The first thing the AI says when a call connects
4. Click **Save**
5. Copy the **Assistant ID** (starts with `ag_...`) → paste into `.env` as `ASSISTANT_ID`

---

## 6. Phone Number Setup on Telnyx

### Buy a Phone Number

1. Go to **Numbers → Search & Buy Numbers**
2. Search by country/area code
3. Select a number → click **Buy**

### Assign the Number to Your Call Control App

1. Go to **Numbers → My Numbers**
2. Click on your purchased number
3. Under **Voice**, select **"Call Control"**
4. Choose the **Call Control Application** you created in Step 3 above
5. Click **Save**

Now, when someone calls that number, Telnyx will fire a webhook to your `/webhook` endpoint.

### Verify Webhook is Working

1. Start your backend with `bash start.sh`
2. Copy the ngrok URL printed in the terminal (e.g. `https://abc123.ngrok.io`)
3. Update your Telnyx Call Control App's **Webhook URL** to `https://abc123.ngrok.io/webhook`
4. Dial your Telnyx number → watch the backend terminal for incoming webhook events

---

## 7. SIP Trunk Setup (Vobiz)

Vobiz is a SIP trunk provider used to route outbound calls to Indian phone numbers (and other destinations). When you dial an outbound call, Telnyx sends it out through the Vobiz SIP trunk.

### Why a SIP Trunk?

Telnyx does not natively offer Indian phone numbers (DIDs) for outbound routing. Vobiz provides Indian DIDs and SIP trunk connectivity, bridging Telnyx to Indian PSTN.

### How it Works in Code

When a call is initiated via `trigger_outbound_dial()` in `call_service.py`:

```python
# The destination number is wrapped as a SIP URI pointing at Vobiz
sip_to = build_sip_uri(to, settings.VOBIZ_SIP_DOMAIN)
# e.g. "sip:+919876543210@sip.vobiz.com"

call_payload = {
    "connection_id": settings.TELNYX_CONNECTION_ID,
    "to":            sip_to,              # SIP URI to Vobiz
    "from":          from_number,          # Your Telnyx DID
    "sip_auth_username": settings.VOBIZ_USERNAME,
    "sip_auth_password": settings.VOBIZ_PASSWORD,
}
```

Telnyx routes the call to Vobiz via SIP. Vobiz places the call to the real phone number over the Indian PSTN.

### Vobiz Setup Steps

1. **Create a Vobiz account** at your Vobiz provider's portal
2. **Get a SIP Domain** — e.g. `sip.yourprovider.com`
3. **Get SIP credentials** — username and password
4. **Get a DID (Indian phone number)** — this is your `FROM_NUMBER`
5. **Configure the SIP trunk** to accept calls from Telnyx's IP range
   (Telnyx publishes their IP ranges in the portal under **Voice → SIP Trunking → IP Addresses**)
6. **Add these to your `.env`:**

```env
VOBIZ_SIP_DOMAIN=sip.yourprovider.com
VOBIZ_USERNAME=your_sip_username
VOBIZ_PASSWORD=your_sip_password
FROM_NUMBER=+918071581212
```

### Vobiz + Conference Bridge (Inbound to India flow)

For the `vobiz_answer` flow (when Vobiz answers first, then bridges to Telnyx AI):

1. Caller dials Vobiz DID
2. Vobiz POSTs to your `/vobiz_answer` endpoint (XML/form-data)
3. Your backend creates a conference room on Vobiz
4. Simultaneously dials a Telnyx AI leg into the same Vobiz conference room
5. Both legs are joined → caller hears the AI

This is handled by `handle_vobiz_answer()` in `call_service.py`.

---

## 8. Supabase Database Setup

We use **Supabase** as our hosted Postgres database. No local database is required.

### Step 1 — Create a Supabase Project

1. Go to https://supabase.com → Sign up / Log in
2. Click **"New Project"**
3. Give it a name, choose a region close to you
4. Set a database password (save it securely)
5. Wait for the project to initialize

### Step 2 — Get Credentials

1. Go to your project → **Settings → API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` key** (NOT `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`
   - **JWT Secret** → `SUPABASE_JWT_SECRET`
3. Add these to your `.env` file

> **WARNING:** Use the `service_role` key only in the backend. This key bypasses Row Level Security (RLS). Never expose it in the frontend.

### Step 3 — Run Database Migrations

Run each SQL migration file in order in the **Supabase SQL Editor** (Dashboard → SQL Editor → New Query):

#### Migration 1 — Core Schema (`0001_init.sql`)

Creates:
- `users` — linked to Supabase `auth.users`
- `assistants` — local mirror of Telnyx AI Assistants
- `calls` — one row per call session (tracks status, timestamps, direction)
- `call_legs` — maps `call_leg_id` to speaker role (User/Agent)
- `transcript_messages` — append-only transcript utterances
- `recordings` — call recording metadata with MP3/WAV URLs
- `webhook_events` — raw audit log of every Telnyx webhook received
- `call_transcripts_formatted` — convenience view for formatted transcripts

#### Migration 2 — Campaigns (`0002_campaigns.sql`)

Creates:
- `campaigns` — one row per campaign (status: draft/running/paused/completed/stopped)
- `campaign_contacts` — one row per contact per campaign (tracks call_status per contact)
- `campaign_progress` — view summarizing counts by status per campaign

#### Migration 3 — Multi-tenant (`0003_multi_tenant.sql`)

Adds `owner_id` columns and Row Level Security policies.

#### Migration 4 — Meetings (`0004_meetings.sql`)

Creates `meetings` table for Cal.com booking logs.

### Key Database Tables

| Table | Purpose |
|---|---|
| `assistants` | Local cache of Telnyx AI assistants |
| `calls` | Every call session — direction, status, timestamps |
| `call_legs` | Speaker identification per leg |
| `transcript_messages` | Utterances (User/Agent) with timestamps |
| `recordings` | Recording IDs + MP3/WAV download URLs |
| `webhook_events` | Raw webhook payload audit log |
| `campaigns` | Bulk dialing campaign configs |
| `campaign_contacts` | Per-contact call outcome tracking |
| `meetings` | Cal.com meeting bookings |

---

## 9. Environment Variables Reference

Copy `backend/.env.example` to `backend/.env` and fill in all values:

```env
# Telnyx
TELNYX_API_KEY=KEYxxxxxxxxxxxxxxxxxx          # From portal.telnyx.com → Auth → API Keys
TELNYX_BASE_URL=https://api.telnyx.com/v2     # Leave as-is
TELNYX_CONNECTION_ID=xxxxxxxxxxxxxxxxxx        # Call Control Application ID
ASSISTANT_ID=ag_xxxxxxxxxxxxxxxxxx            # Telnyx AI Assistant ID

# Vobiz SIP Trunk
VOBIZ_SIP_DOMAIN=sip.yourprovider.com         # SIP domain from Vobiz
VOBIZ_USERNAME=your_sip_username               # SIP auth username
VOBIZ_PASSWORD=your_sip_password               # SIP auth password
FROM_NUMBER=+918071581212                       # Your Vobiz DID (outbound caller ID)

# App Settings
APP_NAME=Telnyx AI Agent API
APP_ENV=development                            # development | production
APP_PORT=8001                                  # Port uvicorn listens on
LOG_LEVEL=INFO

# Supabase
SUPABASE_URL=https://xxxx.supabase.co          # From Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # service_role key (NOT anon key)
SUPABASE_JWT_SECRET=your_jwt_secret_here       # From Supabase → Settings → API

# Webhook URL (Telnyx needs to reach your server)
APP_PUBLIC_URL=https://your-ngrok-url.ngrok.io  # Dev: ngrok URL. Prod: your domain.

# Campaign Dialer
CAMPAIGN_MAX_CONCURRENT=5                      # Max simultaneous calls in flight
CAMPAIGN_CALLS_PER_SECOND=1                    # Rate limit: calls per second

# Cal.com (Optional — for booking feature)
CAL_API_KEY=cal_xxxxxxxxxxxxxxxx
CAL_EVENT_TYPE_ID=123456
CAL_SLOT_WINDOW_HOURS=4
CAL_TIMEZONE=Asia/Kolkata
```

---

## 10. Backend — Architecture & Services

### Entry Point: `main.py`

- Configures **FastAPI** app with title, version, and CORS (all origins allowed)
- **Lifespan handler:** On startup, auto-detects ngrok tunnel URL from `localhost:4040` if `APP_PUBLIC_URL` is not set in `.env`
- **Mounts routers:**
  - `/api/...` → all frontend-facing API routes (via `api/router.py`)
  - `/webhook` → root-level Telnyx webhook handler
  - `/dial` → root-level outbound dial trigger
  - `/vobiz_answer` → root-level Vobiz XML bridge
  - `/` + static files → serves the built React frontend (`frontend/dist`)

### Config: `config.py`

A single `Settings` class reads all environment variables from `.env` via `python-dotenv`. One singleton instance is imported everywhere as `settings`.

```python
from config import settings
settings.TELNYX_API_KEY   # use like this throughout the codebase
```

### Telnyx Client: `utils/telnyx_client.py`

A **singleton `httpx.AsyncClient`** pre-configured with:
- `base_url = https://api.telnyx.com/v2`
- `Authorization: Bearer <TELNYX_API_KEY>` header
- Auto-retry logic (3 attempts) on connection errors
- `keepalive_expiry=5.0s` to prevent stale connection reuse

```python
from utils.telnyx_client import telnyx
r = await telnyx.post("/calls", json={...})
```

### Call Service: `services/call_service.py`

This is the **core of the system**. It handles every Telnyx webhook event:

| Event Type | Handler Action |
|---|---|
| `call.initiated` | Saves call to DB. If inbound: answers the call via API. |
| `call.answered` | Attaches AI Assistant. Starts transcription + recording. |
| `call.hangup` | Finalizes call status in DB. Schedules background transcript fetch. |
| `call.machine.detection.ended` | Marks campaign contact as "voicemail" if AMD detected machine. |
| `call.conversation.message` | Logs AI conversation messages (role: user/assistant). |
| `call.transcription` | Handles real-time transcription utterances, stores in DB. |
| `call.recording.saved` | Saves recording ID to DB, fetches MP3/WAV URLs. |

**Campaign call detection** uses the `client_state` field — a base64-encoded JSON blob attached to every outbound call:

```json
{ "type": "campaign_call", "campaign_id": "...", "contact_id": "...", "assistant_id": "..." }
```

### Campaign Service: `services/campaign_service.py`

Handles:
- Create / read / update / delete campaigns
- Upload contacts from CSV or XLSX files → validates E.164 format using `phonenumbers` library
- State machine transitions: `draft → running → paused/stopped → completed`
- CDR reconciliation: re-syncs contact call statuses from Telnyx CDR API

### Dialer Service: `services/dialer_service.py`

The **async rate-limited outbound dialer engine**:
- Uses `asyncio.Semaphore(max_concurrent)` to limit simultaneous calls
- Enforces `1 / calls_per_second` interval between dials (token-bucket pacing)
- Each campaign run is an `asyncio.Task` stored in `_active_tasks` dict
- Supports pause (cancel current task) and resume (start new task from where left off)
- Marks campaign "completed" when all contacts reach terminal status

### Transcript Service: `services/transcript_service.py`

Two approaches for getting transcripts:

**Approach A (Real-time):** `start_transcription()` calls Telnyx to enable real-time transcription on the call. Each `call.transcription` webhook delivers utterances as they happen → stored immediately via `transcript_store`.

**Approach B (Post-call):** `fetch_transcript_with_retries()` runs as a background `asyncio.Task` after hangup. It polls the Telnyx AI Conversation API up to 5 times (3-second delays) to get the full AI conversation transcript → bulk-stored in `transcript_messages`.

### Recording Service: `services/recording_service.py`

- `start_recording()` → calls `POST /calls/{id}/actions/record_start`
- `store_recording_id()` → saves recording stub to Supabase
- `fetch_recording()` → calls Telnyx Recordings API to get MP3/WAV download URLs

### Database Layer: `database/`

Low-level Supabase client access:

- **`db_helpers.py`** — `get_or_create_call_id()` resolves `call_session_id` → internal `calls.id`
- **`transcript_store.py`** — stores and retrieves `call_legs` (speaker roles) and `transcript_messages`
- **`recording_store.py`** — stores and retrieves `recordings` rows

---

## 11. API Endpoints Reference

The FastAPI server runs Swagger UI at `http://localhost:8001/docs` — all endpoints are documented interactively there.

### Root-level (Telnyx webhook-compatible)

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Receives all Telnyx webhook events |
| `POST` | `/dial` | Triggers outbound AI call |
| `POST` | `/vobiz_answer` | Vobiz XML bridge handler |
| `GET` | `/` | Health check / serves React app |

### AI Assistants

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/assistants` | List all assistants (from Telnyx) |
| `POST` | `/api/ai/assistants` | Create new AI assistant |
| `GET` | `/api/ai/assistants/{id}` | Get assistant by Telnyx ID |
| `PUT` | `/api/ai/assistants/{id}` | Update assistant config |
| `DELETE` | `/api/ai/assistants/{id}` | Delete assistant |

### Campaigns

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List all campaigns |
| `POST` | `/api/campaigns` | Create new campaign |
| `GET` | `/api/campaigns/{id}` | Get campaign details |
| `POST` | `/api/campaigns/{id}/contacts/upload` | Upload CSV/XLSX contact list |
| `POST` | `/api/campaigns/{id}/start` | Start dialing campaign |
| `POST` | `/api/campaigns/{id}/pause` | Pause running campaign |
| `POST` | `/api/campaigns/{id}/stop` | Stop and terminate campaign |
| `GET` | `/api/campaigns/{id}/progress` | Live progress stats |

### Calls, Transcripts, Recordings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/calls` | List call logs |
| `GET` | `/api/calls/{id}/transcript` | Get transcript for a call |
| `GET` | `/api/calls/{id}/recording` | Get recording for a call |
| `GET` | `/api/recordings` | List all recordings |
| `GET` | `/api/transcripts` | List all transcripts |

### Booking (Cal.com)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/booking/slots` | Get available time slots |
| `POST` | `/api/booking/book` | Create a booking |

---

## 12. Frontend — Architecture

The React frontend (`frontend/src/`) is organized as follows:

```
src/
├── App.tsx              # React Router routes — maps paths to page components
├── api/client.ts        # Axios instance → points to http://localhost:8001 in dev
├── store/               # Zustand global state stores
├── pages/
│   ├── Dashboard.tsx    # Overview / home
│   ├── Agents.tsx       # AI Assistant management
│   ├── CallLogs.tsx     # Call history and transcripts
│   ├── Campaigns.tsx    # Campaign management + live progress
│   ├── Recordings.tsx   # Audio recording playback
│   ├── MeetingLogs.tsx  # Cal.com meeting logs
│   └── ...
└── components/
    ├── Sidebar.tsx                # Navigation sidebar
    ├── CreateAgentModal.tsx       # Create AI assistant form
    ├── EditAgentModal.tsx         # Edit assistant form
    ├── VoiceSelectionModal.tsx    # Voice picker for assistants
    └── ...
```

In production, the FastAPI server serves the built React app from `frontend/dist` directly — so the API URL becomes relative (same origin). No separate frontend server is needed in production.

---

## 13. Running Locally (Development)

### Prerequisites — Install These First

| Tool | Install |
|---|---|
| **Python 3.9+** | https://python.org/downloads |
| **Node.js 18+ & npm** | https://nodejs.org |
| **ngrok** | `brew install ngrok` or https://ngrok.com/download |
| **ngrok auth token** | `ngrok config add-authtoken <your_token>` (sign up free at ngrok.com) |

### Step-by-Step Setup

#### 1. Clone the repository

```bash
git clone https://github.com/MausamRakse/telnyx_demo.git
cd telnyx_demo
```

#### 2. Set up the backend environment

```bash
cd backend
cp .env.example .env
# Open .env in your editor and fill in ALL values (see Section 9)
pip install -r requirements.txt
cd ..
```

#### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

#### 4. Run the database migrations

Go to your **Supabase Dashboard → SQL Editor** and run these files in order:

1. `backend/supabase/migrations/0001_init.sql`
2. `backend/supabase/migrations/0002_campaigns.sql`
3. `backend/supabase/migrations/0003_multi_tenant.sql`
4. `backend/supabase/migrations/0004_meetings.sql`

#### 5. Start the backend + ngrok

```bash
bash start.sh
```

This single command:
- Starts FastAPI/uvicorn on port `8001`
- Starts ngrok tunnel on port `8001`
- Prints the public ngrok URL

Expected output:
```
  Telnyx Unified AI Calling Agent

  Server Address : http://localhost:8001
  Swagger UI Docs: http://localhost:8001/docs
  ngrok Public   : https://abc123.ngrok.io
  Webhook URL    : https://abc123.ngrok.io/webhook

  Ensure the Webhook URL in your Telnyx Portal is set to:
      https://abc123.ngrok.io/webhook
```

#### 6. Update Telnyx Webhook URL

Copy the `Webhook URL` printed above → Paste it into:
**Telnyx Portal → Voice → Call Control → Your App → Webhook URL**

#### 7. Start the frontend dev server (separate terminal)

```bash
cd frontend
npm run dev
# Opens at http://localhost:5173
```

#### 8. Test an outbound call

```bash
python3 backend/make_call.py +91XXXXXXXXXX
```

---

## 14. Running in Production (Docker / Render)

### Docker (any cloud)

```bash
# Build the image
docker build -t telnyx-ai-agent .

# Run with env vars
docker run -p 10000:10000 \
  -e TELNYX_API_KEY=... \
  -e TELNYX_CONNECTION_ID=... \
  -e ASSISTANT_ID=... \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e VOBIZ_SIP_DOMAIN=... \
  -e VOBIZ_USERNAME=... \
  -e VOBIZ_PASSWORD=... \
  -e FROM_NUMBER=... \
  -e APP_PUBLIC_URL=https://your-production-domain.com \
  telnyx-ai-agent
```

The Docker build:
1. **Stage 1:** Builds React frontend (`npm run build`) → produces `frontend/dist/`
2. **Stage 2:** Python image → installs backend deps → copies frontend dist
3. Serves everything from one port (backend serves frontend static files)

### Render.com Deployment

1. Connect your GitHub repo to Render
2. Create a **Web Service**
3. Set **Build Command:** `bash build.sh`
4. Set **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add all environment variables from Section 9 in Render's "Environment" panel
6. Deploy — Render auto-assigns a URL like `https://your-app.onrender.com`
7. Update Telnyx Webhook URL to `https://your-app.onrender.com/webhook`

---

## 15. Campaign Dialer — How It Works

The campaign dialer is a custom async engine inside `services/dialer_service.py`.

### CampaignDialer Class

```python
class CampaignDialer:
    semaphore       # asyncio.Semaphore(max_concurrent) — limits simultaneous calls
    _interval       # 1.0 / calls_per_second — sleep time between dials
    _cancelled      # flag set when pause/stop is requested
```

### Dial Loop Logic

```
For each pending contact:
  1. Acquire semaphore slot (blocks if max_concurrent is reached)
  2. Check campaign status from DB (exit if paused/stopped)
  3. POST /calls to Telnyx with client_state encoding campaign + contact IDs
  4. Update contact status to "queued"
  5. Sleep _interval seconds (rate limiting)
  6. Release semaphore on call completion (via webhook)
```

### State Machine

```
draft → running → paused → running  (can resume)
               → stopped              (terminal)
               → completed            (terminal, all contacts dialed)
```

### Contact Status Lifecycle

```
pending → queued → calling → answered    (call picked up, AI connected)
                           → no_answer   (rang, not picked up)
                           → voicemail   (AMD detected machine)
                           → busy        (USER_BUSY / CALL_REJECTED)
                           → failed      (unallocated number / error)
```

---

## 16. Transcripts & Recordings Flow

### Real-time Transcription (Approach A)

```
call.answered
  → start_transcription() → POST /calls/{id}/actions/transcription_start
  → call.transcription webhooks arrive during call
  → Each utterance stored in transcript_messages (speaker: User or Agent)
```

### Post-call AI Transcript (Approach B)

```
call.hangup
  → asyncio.create_task(fetch_transcript_with_retries(...))
  → Polls GET /calls/{call_session_id}/transcripts (up to 5 retries, 3s apart)
  → Bulk-upserts all messages into transcript_messages
```

### Recordings

```
call.answered
  → start_recording() → POST /calls/{id}/actions/record_start

call.recording.saved (webhook)
  → store_recording_id() → saves stub to recordings table
  → fetch_recording() → GET /recordings/{id} for MP3/WAV URLs
  → recordings table updated with download URLs + duration
```

---

## 17. Troubleshooting Common Issues

### Webhook not receiving events

**Cause:** Telnyx cannot reach your `/webhook` endpoint.

**Fix:**
1. Make sure ngrok is running: `ngrok http 8001`
2. Check `http://localhost:4040` in your browser to see the ngrok URL
3. Update Telnyx Portal → Your Call Control App → Webhook URL with the current ngrok URL
4. Note: ngrok URLs change every restart unless you have a paid plan with a fixed domain

---

### Call answered but AI assistant doesn't speak

**Cause:** `ASSISTANT_ID` not set or wrong.

**Fix:**
1. Verify `ASSISTANT_ID` in `.env` matches an assistant in Telnyx Portal → AI → Assistants
2. Check backend logs for: `No ASSISTANT_ID configured`
3. Verify the assistant is active in Telnyx portal

---

### Outbound call fails with 422 error

**Cause:** Wrong `TELNYX_CONNECTION_ID` or SIP URI format.

**Fix:**
1. Verify `TELNYX_CONNECTION_ID` matches the Call Control Application ID
2. Verify `VOBIZ_SIP_DOMAIN` is correct
3. Check that the Vobiz trunk accepts calls from Telnyx IPs

---

### Database errors in logs

**Cause:** Migrations not run or wrong Supabase keys.

**Fix:**
1. Run all 4 SQL migrations in Supabase SQL Editor (see Section 8)
2. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
3. Make sure you're using the `service_role` key, not the `anon` key

---

### ngrok URL not detected on startup

**Cause:** ngrok is slow to start and the URL detection runs too early.

**Fix:**
- The `start.sh` script sleeps 4 seconds after starting ngrok before fetching the URL
- If it still fails, go to `http://localhost:4040` and copy the URL manually
- Paste it as `APP_PUBLIC_URL` in `.env` before running again

---

### Campaign contacts all show "failed"

**Cause:** SIP errors from Vobiz or invalid phone number format.

**Fix:**
1. Ensure all phone numbers in your CSV are in E.164 format (e.g. `+919876543210`)
2. Check Vobiz trunk is active and accepting calls
3. Check Telnyx webhook logs for `sip_hangup_cause` codes in `call.hangup` events
4. Check `webhook_events` table in Supabase for raw payloads

---

*For questions or issues, open an issue on the GitHub repository.*
