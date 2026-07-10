-- ══════════════════════════════════════════════════════════════════════════
-- 0001_init.sql — Telnyx Demo: Full Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════

-- Requires pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- ── USERS (optional — link to Supabase auth.users for multi-tenant ownership) ──
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company text,
  created_at timestamptz not null default now()
);

-- ── ASSISTANTS (local mirror of Telnyx AI Assistants, so you can query/filter locally) ──
create table if not exists public.assistants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,
  telnyx_assistant_id text unique not null,
  name text not null,
  instructions text,
  model text,
  greeting text,
  voice_settings jsonb default '{}',
  transcription_settings jsonb default '{}',
  tags text[],
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── CALLS (one row per call session) ──
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  call_session_id text unique not null,
  call_control_id text,
  assistant_id uuid references public.assistants(id) on delete set null,
  direction text check (direction in ('incoming','outgoing')),
  from_number text,
  to_number text,
  sip_trunk text default 'vobiz',
  status text check (status in ('initiated','answered','in_progress','completed','failed','no_answer'))
    default 'initiated',
  hangup_cause text,
  hangup_source text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_secs numeric,
  client_state jsonb,
  created_at timestamptz not null default now()
);
create index if not exists calls_call_session_id_idx on public.calls (call_session_id);
create index if not exists calls_assistant_id_idx on public.calls (assistant_id);

-- ── CALL LEGS (call_leg_id → speaker role, per call) ──
create table if not exists public.call_legs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls(id) on delete cascade,
  call_leg_id text unique not null,
  role text check (role in ('User','Agent','System','Unknown')) default 'Unknown',
  created_at timestamptz not null default now()
);

-- ── TRANSCRIPT MESSAGES (append-only, one row per final utterance) ──
create table if not exists public.transcript_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls(id) on delete cascade,
  call_leg_id text references public.call_legs(call_leg_id) on delete set null,
  speaker text check (speaker in ('User','Agent','System','Unknown')) default 'Unknown',
  text text not null,
  occurred_at timestamptz,
  confidence numeric,
  is_final boolean default true,
  source text check (source in ('webhook','api')) default 'webhook',
  created_at timestamptz not null default now()
);
create index if not exists transcript_messages_call_id_idx on public.transcript_messages (call_id, occurred_at);

-- ── RECORDINGS ──
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls(id) on delete cascade,
  recording_id text unique not null,
  status text check (status in ('initiated','completed','failed')) default 'initiated',
  duration_secs numeric,
  mp3_url text,
  wav_url text,
  created_at timestamptz,
  fetched_at timestamptz
);
create index if not exists recordings_call_id_idx on public.recordings (call_id);

-- ── WEBHOOK EVENTS (raw audit log — invaluable for debugging Telnyx flows) ──
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  call_control_id text,
  call_session_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists webhook_events_call_session_id_idx on public.webhook_events (call_session_id);
create index if not exists webhook_events_event_type_idx on public.webhook_events (event_type);

-- ── Convenience view: reconstructs formatted_transcript on the fly ──
create or replace view public.call_transcripts_formatted as
select
  call_id,
  string_agg(speaker || ': ' || text, E'\n' order by occurred_at) as formatted_transcript,
  count(*) as total_messages
from public.transcript_messages
where text is not null and text <> ''
group by call_id;
