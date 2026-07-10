import axios from "axios";
import { getSupabase } from "../lib/supabase";

// Always use /api as the base — Vite dev proxy forwards it to http://localhost:8001
// In production, /api is served from the same origin.
const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Interceptor to add Supabase auth token on every request
api.interceptors.request.use(async (config) => {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const createAgent = (data: CreateAgentPayload) =>
  api.post("agents/create-agent", data).then(r => r.data);

export const listAgents = () =>
  api.get("agents/").then(r => r.data.agents);

export const triggerCall = (data: TriggerCallPayload) =>
  api.post("calls/trigger-call", data).then(r => r.data);

export const fetchCallLogs = async (limit = 50): Promise<CallLog[]> => {
  const { data } = await api.get(`logs/call-logs?limit=${limit}`);
  return data.logs;
};

export const fetchStats = async (): Promise<{ total_calls: number; total_completed: number; active_agents: number }> => {
  const { data } = await api.get('logs/stats');
  return data;
};

export const updateAgentApi = (data: UpdateAgentPayload) =>
  api.post("agents/update-agent", data).then(r => r.data);

export const deleteAgentApi = (agent_id: string) =>
  api.post("agents/delete-agent", { agent_id }).then(r => r.data);

export const createCampaign = (data: CreateCampaignPayload) =>
  api.post("campaigns/create", data).then(r => r.data);

export const updateCampaignApi = (campaign_id: number, current_status: string) =>
  api.post("campaigns/update", { campaign_id, current_status }).then(r => r.data);

export const getUser = () =>
  api.get("users/me").then(r => r.data);

export const updateUserCalSettings = (cal_api_key: string, cal_event_type_id: string) =>
  api.post("users/me/cal-settings", { cal_api_key, cal_event_type_id }).then(r => r.data);

export const getCalAuthUrl = (agentId?: string) =>
  api.get("auth/cal/url" + (agentId ? `?agent_id=${agentId}` : "")).then(r => r.data);

export const disconnectCalApi = () =>
  api.post("users/me/disconnect-cal").then(r => r.data);

export const disconnectAgentCalApi = (agent_id: string) =>
  api.post("agents/disconnect-agent-cal", { agent_id }).then(r => r.data);

// ── Campaign API (real implementation) ────────────────────────────────────────

export const createCampaignV2 = (data: CampaignCreatePayload) =>
  api.post("campaigns/", data).then(r => r.data);

export const listCampaigns = (): Promise<{ campaigns: Campaign[]; count: number }> =>
  api.get("campaigns/").then(r => r.data);

export const getCampaign = (id: string): Promise<{ campaign: Campaign }> =>
  api.get(`campaigns/${id}`).then(r => r.data);

export const uploadContacts = (
  campaignId: string,
  file: File,
): Promise<ContactUploadResult> => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`campaigns/${campaignId}/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

export const startCampaign = (id: string) =>
  api.post(`campaigns/${id}/start`).then(r => r.data);

export const pauseCampaign = (id: string) =>
  api.post(`campaigns/${id}/pause`).then(r => r.data);

export const stopCampaign = (id: string) =>
  api.post(`campaigns/${id}/stop`).then(r => r.data);

export const getCampaignProgress = (id: string): Promise<CampaignProgress> =>
  api.get(`campaigns/${id}/progress`).then(r => r.data);

export const getCampaignContacts = (
  id: string,
  page = 1,
  pageSize = 50,
): Promise<{ campaign_id: string; total: number; page: number; page_size: number; contacts: CampaignContact[] }> =>
  api.get(`campaigns/${id}/contacts?page=${page}&page_size=${pageSize}`).then(r => r.data);

export const reconcileCampaign = (id: string): Promise<CDRReconcileResult> =>
  api.post(`campaigns/${id}/reconcile`).then(r => r.data);

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface CreateAgentPayload {
  agent_name: string;
  custom_first_line: string;
  prompt_text: string;
  stt_language: string;
  voice_id: number;
  enable_calendar_booking: boolean;
  cal_api_key?: string;
  cal_event_type_id?: string;
  phone_number?: string;
}

export interface UpdateAgentPayload extends CreateAgentPayload {
  agent_id: string;
  status?: string;
}

export interface TriggerCallPayload {
  agent_id: string;
  phone_number: string;
  custom_first_line?: string;
  is_booking_agent?: boolean;
}

export interface CreateCampaignPayload {
  campaign_name: string;
  agent_id: string;
  start_time: string;
  end_time: string;
  time_zone: string;
  custom_first_line: string;
  retries: string;
}

export interface Agent {
  id: string;
  name: string;
  greeting: string;
  prompt: string;
  language: string;
  voice_id: number;
  meeting_enabled: boolean;
  cal_api_key?: string;
  cal_event_type_id?: string;
  cal_connected?: boolean;
  category?: "customer_care" | "growth" | "custom";
  phone_number?: string;
}

export interface CallLog {
  call_id: string;
  phone_number: string;
  date: string;
  status: "Completed" | "Processing" | "Not Answered";
  recording_url: string | null;
  transcript: string | null;
  json_output: string | null;
  agent_name: string;
  customer_name?: string;
}

export interface MeetingLog {
  id: string;
  user_id: string;
  agent_id: string;
  agent_name?: string;
  call_id: string;
  status: "booked" | "failed" | "skipped";
  extracted_email?: string;
  meeting_topic?: string;
  is_interested?: boolean;
  error_reason?: string;
  created_at: string;
  phone_number?: string;
  date?: string;
  recording_url?: string | null;
  transcript?: string | null;
  json_output?: string | null;
}

export const getMeetingLogs = async (): Promise<MeetingLog[]> => {
  const { data } = await api.get('/calls/meeting-logs');
  return data.logs;
};

// ── Campaign interfaces ─────────────────────────────────────────────────────

export interface CampaignCreatePayload {
  name: string;
  connection_id: string;
  from_number: string;
  max_concurrent?: number;
  calls_per_second?: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  connection_id: string;
  from_number: string;
  max_concurrent: number;
  calls_per_second: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  total_contacts?: number;
  pending?: number;
  queued?: number;
  calling?: number;
  answered?: number;
  no_answer?: number;
  voicemail?: number;
  busy?: number;
  failed?: number;
  total_dialed?: number;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  phone_number: string;
  name?: string;
  call_status: 'pending' | 'queued' | 'calling' | 'answered' | 'no_answer' | 'voicemail' | 'busy' | 'failed';
  call_control_id?: string;
  call_session_id?: string;
  dialed_at?: string;
  answered_at?: string;
  ended_at?: string;
  hangup_cause?: string;
  retry_count: number;
  created_at?: string;
}

export interface CampaignProgress {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  total_contacts: number;
  pending: number;
  queued: number;
  calling: number;
  answered: number;
  no_answer: number;
  voicemail: number;
  busy: number;
  failed: number;
  total_dialed: number;
  answer_rate_pct: number;
}

export interface FailedRow {
  row_number: number;
  data: Record<string, string>;
  reason: string;
}

export interface ContactUploadResult {
  campaign_id: string;
  success_count: number;
  failed_count: number;
  failed_rows: FailedRow[];
}

export interface CDRRecord {
  call_session_id?: string;
  call_leg_id?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  duration_secs?: number;
  status?: string;
  hangup_cause?: string;
  start_time?: string;
  end_time?: string;
  answered_at?: string;
}

export interface CDRReconcileResult {
  campaign_id: string;
  contacts_checked: number;
  contacts_updated: number;
  records: CDRRecord[];
  errors: string[];
}
