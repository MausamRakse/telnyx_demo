import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Megaphone, Plus, Play, Pause, Square, RefreshCw, Eye, ArrowLeft,
  Upload, CheckCircle2, AlertCircle, Clock, PhoneCall,
  PhoneOff, PhoneMissed, Bot, Loader2, ChevronLeft, ChevronRight,
  BarChart3, FileText, X, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listCampaigns, createCampaignV2, getCampaign, uploadContacts,
  startCampaign, pauseCampaign, stopCampaign, getCampaignProgress,
  getCampaignContacts, reconcileCampaign, listAgents,
  type Campaign, type CampaignContact, type CampaignProgress,
  type ContactUploadResult, type FailedRow, type CDRReconcileResult, type Agent,
} from '../api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot?: string }> = {
  draft:     { label: 'Draft',     color: 'text-textMuted',       bg: 'bg-muted',          dot: 'bg-textMuted' },
  running:   { label: 'Running',   color: 'text-success',         bg: 'bg-success/10',     dot: 'bg-success animate-pulse' },
  paused:    { label: 'Paused',    color: 'text-warning',         bg: 'bg-warning/10',     dot: 'bg-warning' },
  completed: { label: 'Completed', color: 'text-primary',         bg: 'bg-primary/10',     dot: 'bg-primary' },
  stopped:   { label: 'Stopped',   color: 'text-error',           bg: 'bg-error/10',       dot: 'bg-error' },
};

const CONTACT_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   color: 'text-textMuted',   icon: <Clock className="w-3.5 h-3.5" /> },
  queued:    { label: 'Queued',    color: 'text-textMuted',   icon: <Clock className="w-3.5 h-3.5" /> },
  calling:   { label: 'Calling',   color: 'text-primary',     icon: <PhoneCall className="w-3.5 h-3.5 animate-pulse" /> },
  answered:  { label: 'Answered',  color: 'text-success',     icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  no_answer: { label: 'No Answer', color: 'text-textMuted',   icon: <PhoneMissed className="w-3.5 h-3.5" /> },
  voicemail: { label: 'Voicemail', color: 'text-accent',      icon: <Bot className="w-3.5 h-3.5" /> },
  busy:      { label: 'Busy',      color: 'text-warning',     icon: <PhoneOff className="w-3.5 h-3.5" /> },
  failed:    { label: 'Failed',    color: 'text-error',       icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const fmtDate = (s?: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
};

const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ── Progress Bar ──────────────────────────────────────────────────────────────

const ProgressBar = ({ campaign }: { campaign: Partial<Campaign> }) => {
  const total  = campaign.total_contacts || 0;
  const dialed = campaign.total_dialed   || 0;
  const answered = campaign.answered     || 0;
  const pctDialed   = pct(dialed, total);
  const pctAnswered = pct(answered, dialed || 1);
  return (
    <div className="w-full">
      <div className="flex justify-between text-[11px] text-textMuted mb-1">
        <span>{dialed}/{total} dialed</span>
        <span>{pctAnswered}% answered</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pctDialed}%` }}
        />
      </div>
    </div>
  );
};

// ── View types ────────────────────────────────────────────────────────────────

type View = 'list' | 'detail' | 'new';

// ════════════════════════════════════════════════════════════════════════════
// VIEW 1: Campaign List
// ════════════════════════════════════════════════════════════════════════════

const CampaignList = ({
  onNew,
  onDetail,
}: {
  onNew: () => void;
  onDetail: (id: string) => void;
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await listCampaigns();
      setCampaigns(res.campaigns || []);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startCampaign(id);
      toast.success('Campaign started!');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to start campaign');
    }
  };

  const handlePause = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await pauseCampaign(id);
      toast.success('Campaign paused');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to pause campaign');
    }
  };

  const handleStop = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Stop this campaign permanently? This cannot be undone.')) return;
    try {
      await stopCampaign(id);
      toast.success('Campaign stopped');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to stop campaign');
    }
  };

  const totals = campaigns.reduce((acc, c) => ({
    total: acc.total + 1,
    active: acc.active + (c.status === 'running' ? 1 : 0),
    completed: acc.completed + (c.status === 'completed' ? 1 : 0),
    contacts: acc.contacts + (c.total_dialed || 0),
  }), { total: 0, active: 0, completed: 0, contacts: 0 });

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-surface-foreground mb-1 flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-primary" />
            Campaign Center
          </h1>
          <p className="text-textMuted">Manage automated voice outreach at scale.</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover active:scale-95 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Campaigns', value: totals.total, icon: Megaphone, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Active Now', value: totals.active, icon: Play, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Completed', value: totals.completed, icon: CheckCircle2, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Total Dialed', value: totals.contacts, icon: PhoneCall, color: 'text-warning', bg: 'bg-warning/10' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-surface-foreground">{s.value.toLocaleString()}</p>
            <p className="text-[12px] text-textMuted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Campaign table */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-textMuted">
            <Megaphone className="w-10 h-10 opacity-20" />
            <p className="font-medium">No campaigns yet</p>
            <button onClick={onNew} className="text-primary text-sm hover:underline font-semibold">Create your first campaign →</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Campaign', 'Status', 'Progress', 'Answer Rate', 'From Number', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-4 font-bold text-textMuted uppercase text-[11px] tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map(c => {
                  const total = c.total_contacts || 0;
                  const dialed = c.total_dialed || 0;
                  const answered = c.answered || 0;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onDetail(c.id)}
                      className="hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-surface-foreground">{c.name}</p>
                        <p className="text-[12px] text-textMuted font-mono">{c.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                      <td className="px-5 py-4 min-w-[160px]">
                        <ProgressBar campaign={c} />
                        <p className="text-[11px] text-textMuted mt-1">{dialed} of {total}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-surface-foreground">
                          {pct(answered, dialed || 1)}%
                        </span>
                        <p className="text-[11px] text-textMuted">{answered} answered</p>
                      </td>
                      <td className="px-5 py-4 font-mono text-[13px]">{c.from_number}</td>
                      <td className="px-5 py-4 text-textMuted text-[12px]">{fmtDate(c.created_at)}</td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onDetail(c.id)}
                            className="p-2 rounded-lg hover:bg-muted text-textMuted hover:text-primary transition-colors"
                            title="View detail"
                          ><Eye className="w-4 h-4" /></button>
                          {(c.status === 'draft' || c.status === 'paused') && (
                            <button
                              onClick={e => handleStart(c.id, e)}
                              className="p-2 rounded-lg hover:bg-success/10 text-textMuted hover:text-success transition-colors"
                              title="Start"
                            ><Play className="w-4 h-4" /></button>
                          )}
                          {c.status === 'running' && (
                            <button
                              onClick={e => handlePause(c.id, e)}
                              className="p-2 rounded-lg hover:bg-warning/10 text-textMuted hover:text-warning transition-colors"
                              title="Pause"
                            ><Pause className="w-4 h-4" /></button>
                          )}
                          {(c.status === 'running' || c.status === 'paused') && (
                            <button
                              onClick={e => handleStop(c.id, e)}
                              className="p-2 rounded-lg hover:bg-error/10 text-textMuted hover:text-error transition-colors"
                              title="Stop"
                            ><Square className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// VIEW 2: Campaign Detail / Live Dashboard
// ════════════════════════════════════════════════════════════════════════════

const CampaignDetail = ({
  campaignId,
  onBack,
}: {
  campaignId: string;
  onBack: () => void;
}) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cdrResult, setCdrResult] = useState<CDRReconcileResult | null>(null);
  const [cdrLoading, setCdrLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PAGE_SIZE = 50;

  const loadDetail = useCallback(async () => {
    try {
      const [campRes, progRes, contactsRes] = await Promise.all([
        getCampaign(campaignId),
        getCampaignProgress(campaignId),
        getCampaignContacts(campaignId, page, PAGE_SIZE),
      ]);
      setCampaign(campRes.campaign);
      setProgress(progRes);
      setContacts(contactsRes.contacts);
      setContactsTotal(contactsRes.total);
    } catch {
      toast.error('Failed to load campaign detail');
    } finally {
      setLoading(false);
    }
  }, [campaignId, page]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Poll progress every 5 seconds when campaign is running
  useEffect(() => {
    if (campaign?.status === 'running' || campaign?.status === 'paused') {
      pollRef.current = setInterval(loadDetail, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [campaign?.status, loadDetail]);

  const doAction = async (action: 'start' | 'pause' | 'stop') => {
    setActionLoading(action);
    try {
      if (action === 'start') await startCampaign(campaignId);
      if (action === 'pause') await pauseCampaign(campaignId);
      if (action === 'stop') {
        if (!confirm('Stop this campaign permanently?')) { setActionLoading(null); return; }
        await stopCampaign(campaignId);
      }
      toast.success(`Campaign ${action}ed`);
      await loadDetail();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to ${action} campaign`);
    } finally {
      setActionLoading(null);
    }
  };

  const doReconcile = async () => {
    setCdrLoading(true);
    try {
      const result = await reconcileCampaign(campaignId);
      setCdrResult(result);
      toast.success(`CDR reconciliation complete: ${result.contacts_updated} contacts updated`);
      await loadDetail();
    } catch {
      toast.error('CDR reconciliation failed');
    } finally {
      setCdrLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!campaign || !progress) return null;

  const statCards = [
    { label: 'Pending',   value: progress.pending,   color: 'text-textMuted', bg: 'bg-muted',         icon: Clock },
    { label: 'Calling',   value: progress.calling + progress.queued, color: 'text-primary',   bg: 'bg-primary/10',   icon: PhoneCall },
    { label: 'Answered',  value: progress.answered,  color: 'text-success',   bg: 'bg-success/10',   icon: CheckCircle2 },
    { label: 'No Answer', value: progress.no_answer, color: 'text-textMuted', bg: 'bg-muted',         icon: PhoneMissed },
    { label: 'Voicemail', value: progress.voicemail, color: 'text-accent',    bg: 'bg-accent/10',    icon: Bot },
    { label: 'Busy/Failed', value: progress.busy + progress.failed, color: 'text-error', bg: 'bg-error/10', icon: PhoneOff },
  ];

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back + Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-textMuted hover:text-surface-foreground text-[13px] font-medium mb-3 hover:-translate-x-1 transition-transform"
          >
            <ArrowLeft className="w-4 h-4" />
            All Campaigns
          </button>
          <h1 className="text-[26px] font-bold text-surface-foreground flex items-center gap-3">
            {campaign.name}
            <StatusBadge status={campaign.status} />
          </h1>
          <p className="text-textMuted text-[13px] mt-1 font-mono">
            From: {campaign.from_number} · {progress.total_contacts} contacts ·
            {campaign.assistant_id && (
              <> Agent: <span className="text-primary font-semibold">{campaign.assistant_id}</span> · </>
            )}
            Rate: {campaign.calls_per_second}/s · Max concurrent: {campaign.max_concurrent}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(campaign.status === 'draft' || campaign.status === 'paused') && (
            <button
              onClick={() => doAction('start')}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-success text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-success/20"
            >
              {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {campaign.status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}
          {campaign.status === 'running' && (
            <button
              onClick={() => doAction('pause')}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-warning text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
              Pause
            </button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused') && (
            <button
              onClick={() => doAction('stop')}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-error text-white rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {actionLoading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Stop
            </button>
          )}
          <button
            onClick={loadDetail}
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-textMuted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {(campaign.status === 'completed' || campaign.status === 'stopped') && (
            <button
              onClick={doReconcile}
              disabled={cdrLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-primary/20"
            >
              {cdrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              CDR Report
            </button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-surface-foreground">Overall Progress</span>
          <span className="text-textMuted text-[13px]">{progress.total_dialed} of {progress.total_contacts} dialed · {progress.answer_rate_pct}% answer rate</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-primary to-accent"
            style={{ width: `${pct(progress.total_dialed, progress.total_contacts)}%` }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 shadow-sm text-center">
            <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-2`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            <p className="text-[11px] text-textMuted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* CDR Result Panel */}
      {cdrResult && (
        <div className="bg-surface border border-primary/20 rounded-2xl p-6 mb-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-surface-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              CDR Reconciliation Report
            </h3>
            <button onClick={() => setCdrResult(null)} className="text-textMuted hover:text-surface-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-surface-foreground">{cdrResult.contacts_checked}</p>
              <p className="text-[12px] text-textMuted">Contacts Checked</p>
            </div>
            <div className="bg-success/5 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-success">{cdrResult.contacts_updated}</p>
              <p className="text-[12px] text-textMuted">Statuses Corrected</p>
            </div>
            <div className={`${cdrResult.errors.length > 0 ? 'bg-error/5' : 'bg-muted/50'} rounded-xl p-4 text-center`}>
              <p className={`text-2xl font-bold ${cdrResult.errors.length > 0 ? 'text-error' : 'text-textMuted'}`}>{cdrResult.errors.length}</p>
              <p className="text-[12px] text-textMuted">Errors</p>
            </div>
          </div>
          {cdrResult.errors.length > 0 && (
            <div className="p-3 bg-error/5 rounded-xl border border-error/20 text-[12px] text-error">
              {cdrResult.errors.slice(0, 3).map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Contacts table */}
      <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-surface-foreground">
            Contact Statuses
            {campaign.status === 'running' && (
              <span className="ml-2 text-[11px] font-normal text-success animate-pulse">● Live updates every 5s</span>
            )}
          </h3>
          <span className="text-[12px] text-textMuted">{contactsTotal} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Phone', 'Name', 'Status', 'Dialed At', 'Answered At', 'Duration', 'Hangup Cause'].map(h => (
                  <th key={h} className="px-5 py-3 font-semibold text-textMuted uppercase text-[11px] tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map(c => {
                const scfg = CONTACT_STATUS_CONFIG[c.call_status] || CONTACT_STATUS_CONFIG.pending;
                const durSecs = c.answered_at && c.ended_at
                  ? Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-3 font-mono text-[13px]">{c.phone_number}</td>
                    <td className="px-5 py-3 text-textMuted">{c.name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1.5 font-semibold ${scfg.color}`}>
                        {scfg.icon}
                        {scfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-textMuted">{fmtDate(c.dialed_at)}</td>
                    <td className="px-5 py-3 text-textMuted">{fmtDate(c.answered_at)}</td>
                    <td className="px-5 py-3 text-textMuted">
                      {durSecs !== null ? `${durSecs}s` : '—'}
                    </td>
                    <td className="px-5 py-3 text-textMuted font-mono text-[12px]">{c.hangup_cause || '—'}</td>
                  </tr>
                );
              })}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-textMuted">
                    No contacts yet — upload a CSV first
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {contactsTotal > PAGE_SIZE && (
          <div className="p-4 border-t border-border flex items-center justify-between text-[13px]">
            <span className="text-textMuted">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, contactsTotal)} of {contactsTotal}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              ><ChevronLeft className="w-4 h-4" /></button>
              <span className="font-medium px-2">Page {page}</span>
              <button
                disabled={page * PAGE_SIZE >= contactsTotal}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors"
              ><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// VIEW 3: New Campaign Wizard
// ════════════════════════════════════════════════════════════════════════════

type Step = 1 | 2 | 3;

const NewCampaignWizard = ({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (id: string) => void;
}) => {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // AI Agents — loaded on mount for the assistant selector
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  useEffect(() => {
    listAgents()
      .then((a: Agent[]) => setAgents(a))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, []);

  // Step 1 — Campaign details
  const [form, setForm] = useState({
    name:             '',
    assistant_id:     '',
    connection_id:    '2994230404518512614',
    from_number:      '+918071581212',
    max_concurrent:   5,
    calls_per_second: 1,
  });

  // Step 2 — File upload
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<ContactUploadResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const step1Valid = form.name && form.connection_id && form.from_number && form.assistant_id;

  const handleStep1Next = async () => {
    if (!step1Valid) { toast.error('Fill in all required fields'); return; }
    setSaving(true);
    try {
      const res = await createCampaignV2({
        name:             form.name,
        assistant_id:     form.assistant_id,
        connection_id:    form.connection_id,
        from_number:      form.from_number,
        max_concurrent:   form.max_concurrent,
        calls_per_second: form.calls_per_second,
      });
      setCampaignId(res.campaign.id);
      setStep(2);
      toast.success('Campaign created! Now upload your contacts.');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !campaignId) { toast.error('Select a file first'); return; }
    setUploadLoading(true);
    try {
      const result = await uploadContacts(campaignId, uploadFile);
      setUploadResult(result);
      if (result.success_count > 0) {
        toast.success(`Uploaded ${result.success_count} contacts!`);
      }
      if (result.failed_count > 0) {
        toast.error(`${result.failed_count} rows failed validation — see report below`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleLaunch = async () => {
    if (!campaignId) return;
    setSaving(true);
    try {
      await startCampaign(campaignId);
      toast.success('Campaign launched! 🚀');
      onCreated(campaignId);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to start campaign');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { n: 1, label: 'Campaign Details' },
    { n: 2, label: 'Upload Contacts' },
    { n: 3, label: 'Review & Launch' },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-textMuted hover:text-surface-foreground text-[13px] font-medium hover:-translate-x-1 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </button>
        <h1 className="text-[24px] font-bold text-surface-foreground">New Campaign</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-0 mb-8">
        {steps.map((s, idx) => (
          <React.Fragment key={s.n}>
            <div className={`flex items-center gap-2 ${step >= s.n ? 'text-primary' : 'text-textMuted'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold border-2 transition-all ${
                step > s.n ? 'bg-primary border-primary text-primary-foreground' :
                step === s.n ? 'border-primary text-primary' :
                'border-border text-textMuted'
              }`}>
                {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
              </div>
              <span className={`text-[13px] font-semibold ${step >= s.n ? 'text-surface-foreground' : 'text-textMuted'}`}>
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 transition-all ${step > s.n ? 'bg-primary' : 'bg-border'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: Campaign Details ── */}
      {step === 1 && (
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm space-y-6">
          <h2 className="text-[18px] font-bold text-surface-foreground">Campaign Details</h2>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-surface-foreground">Campaign Name <span className="text-error">*</span></label>
            <input
              type="text"
              placeholder="e.g. October Sales Outreach"
              className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-surface-foreground flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-primary" />
              AI Assistant <span className="text-error">*</span>
            </label>
            {agentsLoading ? (
              <div className="w-full h-12 rounded-xl border border-border flex items-center px-4 text-textMuted text-[13px] gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading assistants...
              </div>
            ) : agents.length === 0 ? (
              <div className="p-3 bg-warning/5 border border-warning/20 rounded-xl text-[12px] text-textMuted flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                No AI Assistants found — create one in the AI Agents section first.
              </div>
            ) : (
              <select
                className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all bg-surface text-surface-foreground appearance-none cursor-pointer"
                value={form.assistant_id}
                onChange={e => setForm({ ...form, assistant_id: e.target.value })}
              >
                <option value="">— Select AI Assistant —</option>
                {agents.map((a: Agent) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-textMuted">This assistant will handle every call in this campaign.</p>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-surface-foreground flex items-center gap-1">
              Telnyx Connection ID (Call Control App ID) <span className="text-error">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 1234567890123456789"
              className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all font-mono"
              value={form.connection_id}
              onChange={e => setForm({ ...form, connection_id: e.target.value })}
            />
            <p className="text-[11px] text-textMuted">Found in Telnyx Portal → Voice → Call Control Applications</p>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-surface-foreground">From Number (E.164) <span className="text-error">*</span></label>
            <input
              type="text"
              placeholder="e.g. +14155552671"
              className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all font-mono"
              value={form.from_number}
              onChange={e => setForm({ ...form, from_number: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-surface-foreground">Max Concurrent Calls</label>
              <input
                type="number"
                min={1} max={50}
                className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                value={form.max_concurrent}
                onChange={e => setForm({ ...form, max_concurrent: parseInt(e.target.value) || 5 })}
              />
              <p className="text-[11px] text-textMuted">Max calls in-flight simultaneously</p>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-surface-foreground">Calls Per Second</label>
              <input
                type="number"
                min={0.1} max={10} step={0.1}
                className="w-full h-12 px-4 rounded-xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                value={form.calls_per_second}
                onChange={e => setForm({ ...form, calls_per_second: parseFloat(e.target.value) || 1 })}
              />
              <p className="text-[11px] text-textMuted">Rate limit for new call initiation</p>
            </div>
          </div>

          <button
            onClick={handleStep1Next}
            disabled={!step1Valid || saving}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue to Upload Contacts
          </button>
        </div>
      )}

      {/* ── Step 2: Upload Contacts ── */}
      {step === 2 && (
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm space-y-6">
          <h2 className="text-[18px] font-bold text-surface-foreground">Upload Contact List</h2>

          <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 transition-all ${
            uploadResult?.success_count ? 'border-success/40 bg-success/5' : 'border-border hover:border-primary/40'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${uploadResult?.success_count ? 'bg-success text-white' : 'bg-muted text-textMuted'}`}>
              {uploadResult?.success_count ? <CheckCircle2 className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
            </div>
            <div className="text-center">
              <p className="font-bold text-lg text-surface-foreground">
                {uploadFile ? uploadFile.name : 'Upload CSV or XLSX'}
              </p>
              <p className="text-textMuted text-[13px] mt-1">
                Required column: <code className="font-mono bg-muted px-1 rounded">phone_number</code> (E.164 format, e.g. +14155552671)
              </p>
              <p className="text-textMuted text-[12px] mt-0.5">
                Optional: <code className="font-mono bg-muted px-1 rounded">name</code> column for contact names
              </p>
            </div>
            <div className="flex gap-3">
              <label className="px-5 py-2.5 bg-surface border-2 border-border rounded-xl font-semibold text-[14px] cursor-pointer hover:border-primary hover:text-primary transition-all">
                Browse Files
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setUploadFile(f); setUploadResult(null); }
                  }}
                />
              </label>
              {uploadFile && !uploadResult && (
                <button
                  onClick={handleUpload}
                  disabled={uploadLoading}
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-[14px] hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {uploadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Upload & Validate
                </button>
              )}
            </div>
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-success/5 border border-success/20 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-success">{uploadResult.success_count}</p>
                  <p className="text-[12px] text-textMuted">Valid contacts uploaded</p>
                </div>
                <div className={`${uploadResult.failed_count > 0 ? 'bg-error/5 border-error/20' : 'bg-muted/50 border-border'} border rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-bold ${uploadResult.failed_count > 0 ? 'text-error' : 'text-textMuted'}`}>{uploadResult.failed_count}</p>
                  <p className="text-[12px] text-textMuted">Rows failed validation</p>
                </div>
              </div>

              {uploadResult.failed_rows.length > 0 && (
                <div className="border border-error/20 rounded-xl overflow-hidden">
                  <div className="bg-error/5 px-4 py-3 flex items-center gap-2 text-error text-[13px] font-bold">
                    <AlertCircle className="w-4 h-4" />
                    Failed Rows — Fix and re-upload if needed
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {uploadResult.failed_rows.slice(0, 20).map((r: FailedRow) => (
                      <div key={r.row_number} className="px-4 py-2 border-t border-border text-[12px]">
                        <span className="font-mono text-textMuted">Row {r.row_number}:</span>{' '}
                        <span className="text-error">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex gap-3">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-textMuted leading-relaxed">
              <strong className="text-surface-foreground">CSV format tip:</strong> Use headers like <code>phone_number,name</code>.
              Phone numbers must include country code (e.g. <code>+14155552671</code>). Numbers without <code>+</code> will be tried both ways.
              Numbers that cannot be validated as E.164 will be rejected with a reason.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 h-12 border border-border rounded-xl font-semibold hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!uploadResult || uploadResult.success_count === 0}
              className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-primary/20"
            >
              Continue to Review
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Launch ── */}
      {step === 3 && uploadResult && (
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm space-y-6">
          <h2 className="text-[18px] font-bold text-surface-foreground">Review & Launch</h2>

          <div className="space-y-3">
            {[
              { label: 'Campaign Name', value: form.name },
              { label: 'AI Assistant', value: agents.find((a: Agent) => a.id === form.assistant_id)?.name || form.assistant_id || '—' },
              { label: 'Connection ID', value: form.connection_id, mono: true },
              { label: 'From Number', value: form.from_number, mono: true },
              { label: 'Max Concurrent', value: `${form.max_concurrent} calls` },
              { label: 'Rate Limit', value: `${form.calls_per_second} calls/second` },
              { label: 'Contacts Loaded', value: `${uploadResult.success_count.toLocaleString()} valid contacts` },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-3 border-b border-border last:border-0">
                <span className="text-textMuted text-[13px]">{item.label}</span>
                <span className={`font-semibold text-surface-foreground text-[13px] ${item.mono ? 'font-mono' : ''}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl flex gap-3">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-textMuted leading-relaxed">
              <strong className="text-surface-foreground">Before launching:</strong> Ensure your Telnyx Connection ID is configured
              and your <code>APP_PUBLIC_URL</code> environment variable is set to your public webhook URL so Telnyx can deliver call events.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 h-12 border border-border rounded-xl font-semibold hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleLaunch}
              disabled={saving}
              className="flex-1 h-12 bg-success text-white rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-success/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Launch Campaign 🚀
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// ROOT: Campaigns page — manages view switching
// ════════════════════════════════════════════════════════════════════════════

const Campaigns = () => {
  const [view, setView] = useState<View>('list');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const handleDetail = (id: string) => {
    setSelectedCampaignId(id);
    setView('detail');
  };

  const handleCreated = (id: string) => {
    setSelectedCampaignId(id);
    setView('detail');
  };

  return (
    <div className="pb-20">
      {view === 'list' && (
        <CampaignList
          onNew={() => setView('new')}
          onDetail={handleDetail}
        />
      )}
      {view === 'detail' && selectedCampaignId && (
        <CampaignDetail
          campaignId={selectedCampaignId}
          onBack={() => setView('list')}
        />
      )}
      {view === 'new' && (
        <NewCampaignWizard
          onBack={() => setView('list')}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
};

export default Campaigns;
