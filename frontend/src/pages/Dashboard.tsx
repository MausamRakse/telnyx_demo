import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchCallLogs, fetchStats, getMeetingLogs, type CallLog, type MeetingLog } from '../api/client';
import { useAgentStore } from '../store/agentStore';
import { PhoneCall, Bot, CheckCircle2, ArrowRight, BarChart3, TrendingUp, Calendar, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';

const Dashboard = () => {
  const { fetchAgents } = useAgentStore();
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [meetingLogs, setMeetingLogs] = useState<MeetingLog[]>([]);
  const [statsData, setStatsData] = useState({ total_calls: 0, total_completed: 0, active_agents: 0 });
  const [loading, setLoading] = useState(true);
  
  const [currentMeetingPage, setCurrentMeetingPage] = useState(1);
  const meetingsPerPage = 10;

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        await fetchAgents();
        const logsData = await fetchCallLogs(5);
        const aggregatedStats = await fetchStats();
        const mLogs = await getMeetingLogs();
        setLogs(logsData);
        setStatsData(aggregatedStats);
        setMeetingLogs(mLogs);
        setCurrentMeetingPage(1);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [fetchAgents]);

  const stats = [
    { 
      label: 'Total Agents', 
      value: statsData.active_agents.toString(), 
      icon: Bot, 
      color: 'text-primary', 
      bg: 'bg-primary/10',
      trend: '+12% from last month'
    },
    { 
      label: 'Real-time Calls', 
      value: statsData.total_calls.toString(), 
      icon: PhoneCall, 
      color: 'text-accent', 
      bg: 'bg-accent/10',
      trend: 'Live system count'
    },
    { 
      label: 'Successful Audits', 
      value: statsData.total_completed.toString(), 
      icon: CheckCircle2, 
      color: 'text-success', 
      bg: 'bg-success/10',
      trend: `${statsData.total_calls > 0 ? Math.round((statsData.total_completed / statsData.total_calls) * 100) : 0}% success rate`
    },
  ];

  const totalPages = Math.ceil(meetingLogs.length / meetingsPerPage);
  const startIndex = (currentMeetingPage - 1) * meetingsPerPage;
  const paginatedMeetings = meetingLogs.slice(startIndex, startIndex + meetingsPerPage);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-surface-foreground tracking-tight flex items-center gap-3">
            Overview <TrendingUp className="w-6 h-6 text-primary animate-pulse" />
          </h1>
          <p className="text-textMuted mt-1">Real-time metrics and system health across your agent network.</p>
        </div>
        <div className="bg-surface border border-border px-4 py-2 rounded-2xl flex items-center gap-2 text-[13px] font-semibold text-textMuted shadow-sm">
          <Calendar className="w-4 h-4" />
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-surface group p-8 rounded-[24px] border border-border/60 shadow-xl shadow-black/5 flex flex-col gap-6 transition-all hover:scale-[1.02] hover:shadow-primary/5">
            <div className="flex items-center justify-between">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color} shadow-inner`}>
                <stat.icon className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-bold text-textMuted opacity-0 group-hover:opacity-100 transition-opacity">REAL TIME</span>
            </div>
            <div>
              <p className="text-[13px] text-textMuted font-bold uppercase tracking-[0.1em]">{stat.label}</p>
              <h3 className="text-4xl font-black text-surface-foreground mt-1 tracking-tight">{loading ? '...' : stat.value}</h3>
              <p className={`text-[12px] mt-2 font-medium ${stat.color} opacity-80 flex items-center gap-1`}>
                <TrendingUp className="w-3 h-3" /> {stat.trend}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-surface rounded-[24px] border border-border/60 shadow-xl shadow-black/5 flex flex-col min-h-[400px] overflow-hidden">
          <div className="px-8 py-6 border-b border-border/40 flex items-center justify-between bg-muted/5">
            <h2 className="text-[18px] font-bold text-surface-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Latest Transmission
            </h2>
            <NavLink to="/logs" className="text-[13px] font-bold text-primary hover:text-primary-hover flex items-center gap-1.5 transition-all group">
              Explore History <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </NavLink>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center p-12 flex-col gap-4 text-textMuted">
                 <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                 <p className="font-bold text-sm tracking-widest uppercase">Syncing Data...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center text-textMuted mb-6 animate-bounce duration-[2000ms]">
                  <PhoneCall className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-xl font-bold text-surface-foreground">Awaiting First Transmission</h3>
                <p className="text-textMuted text-sm mt-2 max-w-[280px]">Deploy your agents and trigger your first call to see live analytics here.</p>
              </div>
            ) : (
              <div className="p-2">
                <table className="w-full text-left text-[14px]">
                  <thead className="text-textMuted">
                    <tr>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Target</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Time (GMT)</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {logs.map((log, i) => (
                      <tr key={i} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex flex-col">
                            <span className="font-mono text-[14px] font-bold text-surface-foreground">{log.phone_number}</span>
                            <span className="text-[11px] text-textMuted mt-0.5">{log.agent_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-textMuted whitespace-nowrap text-[13px]">
                          {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-tighter ${
                            log.status === 'Completed' ? 'bg-success/10 text-success' : 
                            log.status === 'Not Answered' ? 'bg-error/10 text-error' : 
                            'bg-warning/10 text-warning animate-pulse'
                          }`}>
                            {log.status === 'Completed' ? 'SUCCESS' : log.status === 'Not Answered' ? 'FAILED' : 'SYNCING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* System Health / Goal Card */}
        <div className="bg-surface rounded-[24px] border border-border/60 shadow-xl shadow-black/5 p-8 flex flex-col gap-8 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-primary/5 via-surface to-surface">
          <div>
            <h2 className="text-[18px] font-bold text-surface-foreground">Deployment Goal</h2>
            <p className="text-textMuted text-sm mt-1">Status of your current network.</p>
          </div>
          
          <div className="flex-1 flex flex-col justify-center items-center gap-6">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle className="text-muted/20 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" />
                <circle 
                  className="text-primary stroke-current transition-all duration-1000 ease-out" 
                  strokeWidth="8" 
                  strokeDasharray={`${statsData.total_calls > 0 ? (statsData.total_completed / statsData.total_calls) * 251 : 0} 251`}
                  strokeLinecap="round" 
                  cx="50" cy="50" r="40" fill="transparent" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-surface-foreground">
                  {statsData.total_calls > 0 ? Math.round((statsData.total_completed / statsData.total_calls) * 100) : 0}%
                </span>
                <span className="text-[10px] text-textMuted font-bold uppercase tracking-widest">Quality</span>
              </div>
            </div>
            
            <div className="w-full grid grid-cols-2 gap-4">
              <div className="bg-muted/10 p-4 rounded-2xl border border-border/40">
                <p className="text-[10px] text-textMuted font-bold uppercase">Success</p>
                <p className="text-xl font-black text-success mt-1">{statsData.total_completed}</p>
              </div>
              <div className="bg-muted/10 p-4 rounded-2xl border border-border/40">
                <p className="text-[10px] text-textMuted font-bold uppercase">Active</p>
                <p className="text-xl font-black text-primary mt-1">{statsData.active_agents}</p>
              </div>
            </div>
          </div>

          <NavLink 
            to="/agents" 
            className="w-full bg-surface-foreground text-surface py-4 rounded-2xl text-[14px] font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
          >
            Deploy More Agents <Plus className="w-4 h-4" />
          </NavLink>
        </div>
      </div>

      {/* Meeting Logs Analytics Section */}
      <div className="flex flex-col gap-6 mt-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-black text-surface-foreground flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-primary" />
            Meeting Analytics & Logs
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
          <div className="bg-surface border border-border/60 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-textMuted uppercase tracking-wider mb-2">Total Booked</h3>
            <p className="text-3xl font-black text-success">{meetingLogs.filter(m => m.status === 'booked').length}</p>
          </div>
          <div className="bg-surface border border-border/60 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-textMuted uppercase tracking-wider mb-2">Failed/Skipped</h3>
            <p className="text-3xl font-black text-error">{meetingLogs.filter(m => m.status === 'failed' || m.status === 'skipped').length}</p>
          </div>
        </div>

        <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden shadow-xl shadow-black/5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-muted/5 text-textMuted border-b border-border/40">
                <tr>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Agent</th>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Topic</th>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Interest</th>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {meetingLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-textMuted text-[13px]">
                      No meeting data recorded yet. Ensure an agent has "Meeting Booking" enabled.
                    </td>
                  </tr>
                ) : (
                  paginatedMeetings.map((mlog, i) => (
                    <tr key={mlog.id || i} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-4 font-semibold text-surface-foreground whitespace-nowrap">
                        {mlog.agent_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 font-mono text-[12px] text-textMuted">
                        {mlog.extracted_email || '—'}
                      </td>
                      <td className="px-6 py-4 text-[13px] text-surface-foreground max-w-[200px] truncate">
                        {mlog.meeting_topic || '—'}
                      </td>
                      <td className="px-6 py-4">
                        {mlog.is_interested ? (
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black bg-success/10 text-success">YES</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black bg-error/10 text-error">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          mlog.status === 'booked' ? 'bg-success/10 text-success' : 
                          mlog.status === 'failed' ? 'bg-error/10 text-error' : 
                          'bg-warning/10 text-warning'
                        }`}>
                          {mlog.status === 'booked' ? 'Booked ✅' : mlog.status === 'failed' ? 'Failed ❌' : 'Skipped ⏭️'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] text-textMuted max-w-[250px] truncate" title={mlog.error_reason || 'Success'}>
                        {mlog.error_reason || 'Successfully processed'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Premium Pagination Controls */}
          {meetingLogs.length > meetingsPerPage && (
            <div className="px-8 py-5 border-t border-border/40 flex flex-col items-center justify-center gap-3 bg-muted/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentMeetingPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentMeetingPage === 1}
                  className="p-2 text-[13px] font-bold rounded-xl border border-border/60 text-textMuted hover:text-surface-foreground hover:bg-muted/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-textMuted disabled:cursor-not-allowed active:scale-95 flex items-center justify-center"
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {/* Dynamic Page Numbers */}
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    const isActive = currentMeetingPage === pageNum;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentMeetingPage(pageNum)}
                        className={`w-9 h-9 rounded-xl text-[13px] font-bold transition-all active:scale-95 flex items-center justify-center ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.05]'
                            : 'border border-border/40 text-textMuted hover:text-surface-foreground hover:bg-muted/10'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentMeetingPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentMeetingPage === totalPages}
                  className="p-2 text-[13px] font-bold rounded-xl border border-border/60 text-textMuted hover:text-surface-foreground hover:bg-muted/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-textMuted disabled:cursor-not-allowed active:scale-95 flex items-center justify-center"
                  aria-label="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <span className="text-[12px] text-textMuted font-medium text-center mt-1">
                Showing <span className="font-semibold text-surface-foreground">{startIndex + 1}</span> to{' '}
                <span className="font-semibold text-surface-foreground">
                  {Math.min(startIndex + meetingsPerPage, meetingLogs.length)}
                </span>{' '}
                of <span className="font-semibold text-surface-foreground">{meetingLogs.length}</span> meetings
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Plus = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
  </svg>
);

export default Dashboard;
