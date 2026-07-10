-- ══════════════════════════════════════════════════════════════════════════
-- 0002_campaigns.sql — Calling Campaign Feature
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════

-- ── CAMPAIGNS ─────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null
                     check (status in ('draft','running','paused','completed','stopped'))
                     default 'draft',
  connection_id    text not null,          -- Telnyx Call Control App ID
  from_number      text not null,          -- E.164 outbound caller ID
  max_concurrent   int  not null default 5,
  calls_per_second numeric not null default 1,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

comment on table public.campaigns is
  'One row per calling campaign. Status enforced by backend state machine.';

comment on column public.campaigns.connection_id is
  'Telnyx Call Control Application ID (not phone number).';

comment on column public.campaigns.from_number is
  'Outbound caller ID in E.164 format, e.g. +14155552671.';

-- ── CAMPAIGN CONTACTS ──────────────────────────────────────────────────────
create table if not exists public.campaign_contacts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  phone_number    text not null,           -- E.164, validated on upload
  name            text,                    -- optional contact name from CSV
  call_status     text not null
                    check (call_status in (
                      'pending','queued','calling',
                      'answered','no_answer','voicemail','busy','failed'
                    ))
                    default 'pending',
  call_control_id text,                   -- from Telnyx /v2/calls response
  call_session_id text,                   -- used for CDR reconciliation
  dialed_at       timestamptz,
  answered_at     timestamptz,
  ended_at        timestamptz,
  hangup_cause    text,                   -- raw Telnyx SIP hangup cause code
  retry_count     int not null default 0,
  created_at      timestamptz not null default now()
);

comment on table public.campaign_contacts is
  'One row per contact per campaign. Updated in real-time by webhook events.';

comment on column public.campaign_contacts.call_session_id is
  'Telnyx call_session_id — used to query the CDR API for final reconciliation.';

-- Indexes for fast lookups
create index if not exists campaign_contacts_campaign_id_idx
  on public.campaign_contacts (campaign_id);

create index if not exists campaign_contacts_call_status_idx
  on public.campaign_contacts (campaign_id, call_status);

create index if not exists campaign_contacts_call_control_id_idx
  on public.campaign_contacts (call_control_id)
  where call_control_id is not null;

create index if not exists campaign_contacts_call_session_id_idx
  on public.campaign_contacts (call_session_id)
  where call_session_id is not null;

-- ── CONVENIENCE VIEW: campaign progress summary ────────────────────────────
create or replace view public.campaign_progress as
select
  c.id                                                                   as campaign_id,
  c.name                                                                 as campaign_name,
  c.status                                                               as campaign_status,
  count(cc.id)                                                           as total_contacts,
  count(cc.id) filter (where cc.call_status = 'pending')                as pending,
  count(cc.id) filter (where cc.call_status = 'queued')                 as queued,
  count(cc.id) filter (where cc.call_status = 'calling')                as calling,
  count(cc.id) filter (where cc.call_status = 'answered')               as answered,
  count(cc.id) filter (where cc.call_status = 'no_answer')              as no_answer,
  count(cc.id) filter (where cc.call_status = 'voicemail')              as voicemail,
  count(cc.id) filter (where cc.call_status = 'busy')                   as busy,
  count(cc.id) filter (where cc.call_status = 'failed')                 as failed,
  count(cc.id) filter (where cc.call_status not in ('pending','queued','calling')) as total_dialed
from public.campaigns c
left join public.campaign_contacts cc on cc.campaign_id = c.id
group by c.id, c.name, c.status;
