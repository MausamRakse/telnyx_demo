-- ══════════════════════════════════════════════════════════════════════════
-- 0003_campaign_assistant.sql — Link AI Assistant to Campaign
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════

-- Add assistant_id as plain text (matches how connection_id is stored)
-- No FK to assistants table — IDs sourced live from Telnyx, local mirror sync
-- timing must not block campaign creation.
alter table public.campaigns
  add column if not exists assistant_id text;

comment on column public.campaigns.assistant_id is
  'Telnyx AI Assistant ID (assistant-xxxx-...) applied to every answered call in this campaign. Required before the campaign can be started.';

create index if not exists campaigns_assistant_id_idx
  on public.campaigns (assistant_id) where assistant_id is not null;
