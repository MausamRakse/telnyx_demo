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
