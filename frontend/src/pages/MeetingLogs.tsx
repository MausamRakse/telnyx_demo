import { useState, useEffect, useMemo } from 'react';
import { getMeetingLogs, type MeetingLog } from '../api/client';
import { 
  CalendarCheck, CalendarRange, Clock, RefreshCcw, 
  User, FileText, CheckCircle2, AlertCircle, 
  ExternalLink, Code, Video, Copy, Download, X,
  LayoutGrid, Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import CalendarView from '../components/CalendarView';

const MeetingLogs = () => {
  const [logs, setLogs] = useState<MeetingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'booked' | 'failed'>('booked');
  const [selectedLog, setSelectedLog] = useState<MeetingLog | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    const saved = localStorage.getItem('meeting_logs_view_pref');
    return (saved === 'list' || saved === 'calendar') ? saved : 'list';
  });

  const handleViewModeChange = (mode: 'list' | 'calendar') => {
    setViewMode(mode);
    localStorage.setItem('meeting_logs_view_pref', mode);
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getMeetingLogs();
      setLogs(data);
    } catch (err: any) {
      toast.error('Failed to load meeting logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filter logs for each tab
  const bookedLogs = logs.filter(log => log.status === 'booked');
  const failedLogs = logs.filter(log => log.status === 'failed' || log.status === 'skipped');
  const activeLogs = activeTab === 'booked' ? bookedLogs : failedLogs;

  // Split active logs into featured (top 4 cards) and remaining (table list)
  const featuredLogs = activeLogs.slice(0, 4);
  const remainingLogs = activeLogs.slice(4);

  // Pagination State for history table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, viewMode, logs.length]);

  const totalPages = Math.max(1, Math.ceil(remainingLogs.length / pageSize));

  const paginatedRemainingLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return remainingLogs.slice(start, start + pageSize);
  }, [remainingLogs, currentPage, pageSize]);

  // Helper to parse dates, times, and participant details
  const parseMeetingDetails = (log: MeetingLog) => {
    let dateStr = '—';
    let timeStr = '—';
    let participantName = '—';
    let participantEmail = log.extracted_email || '—';
    let topic = log.meeting_topic || 'AI Consultation Call';
    let parsedJson: any = null;
    
    // Try to parse json_output
    try {
      if (log.json_output) {
        parsedJson = typeof log.json_output === 'string' ? JSON.parse(log.json_output) : log.json_output;
        
        participantName = parsedJson?.name || parsedJson?.participant_name || parsedJson?.customer_name || '—';
        if (parsedJson?.email) participantEmail = parsedJson.email;
        dateStr = parsedJson?.date || parsedJson?.meeting_date || '—';
        timeStr = parsedJson?.time || parsedJson?.meeting_time || '—';
        if (parsedJson?.topic || parsedJson?.meeting_topic) {
          topic = parsedJson.topic || parsedJson.meeting_topic;
        }
      }
    } catch (e) {
      // ignore
    }

    // Fallback to error_reason regex parsing
    if ((dateStr === '—' || timeStr === '—') && log.error_reason) {
      const dateMatch = log.error_reason.match(/Date:\s*([^\s,)]+)/i);
      const timeMatch = log.error_reason.match(/Time:\s*([^\s,)]+)/i);
      if (dateMatch) dateStr = dateMatch[1];
      if (timeMatch) timeStr = timeMatch[1];
    }

    // Date/Time Fallbacks
    if (dateStr === '—') {
      dateStr = new Date(log.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    if (timeStr === '—') {
      timeStr = new Date(log.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // Name fallback
    if (participantName === '—' && participantEmail !== '—') {
      const prefix = participantEmail.split('@')[0];
      participantName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    return { dateStr, timeStr, participantName, participantEmail, topic, parsedJson };
  };

  // Helper to extract calendar Month and Day for the calendar badge
  const getCalendarBadge = (dateStr: string) => {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const day = d.getDate().toString();
      return { month, day };
    }
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let month = 'MEET';
    let day = '—';
    
    for (const m of months) {
      if (dateStr.toUpperCase().includes(m)) {
        month = m;
        break;
      }
    }
    const dayMatch = dateStr.match(/\b\d{1,2}\b/);
    if (dayMatch) day = dayMatch[0];
    
    return { month, day };
  };

  // Copy transcript in modal
  const handleCopyTranscript = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedLogId(true);
    toast.success('Transcript copied to clipboard!');
    setTimeout(() => setCopiedLogId(false), 2000);
  };

  // Download transcript in modal
  const handleDownloadTranscript = (log: MeetingLog) => {
    const transcript = log.transcript || '';
    if (!transcript) return;
    const nameStr = log.extracted_email ? log.extracted_email.split('@')[0] : 'transcript';
    const filename = `meeting_booking_${nameStr}_${new Date(log.created_at).toISOString().split('T')[0]}.txt`;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Transcript downloaded!');
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Title Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-surface-foreground tracking-tight flex items-center gap-3">
            Meeting Logs <CalendarCheck className="w-7 h-7 text-primary" />
          </h1>
          <p className="text-textMuted mt-1 text-[14px]">Detailed records of AI meeting booking attempts and outcomes.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* View Switcher Toggle Pill */}
          <div className="bg-muted/40 p-1 rounded-xl inline-flex border border-border/20 gap-1">
            <button
              onClick={() => handleViewModeChange('list')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-textMuted hover:text-surface-foreground hover:bg-muted/20'
              }`}
              title="List View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => handleViewModeChange('calendar')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-textMuted hover:text-surface-foreground hover:bg-muted/20'
              }`}
              title="Calendar View"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          <button 
            onClick={loadLogs}
            disabled={loading}
            className="btn-outline px-4 py-2 text-[13px] flex items-center gap-2 group cursor-pointer"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            {loading ? 'Refreshing...' : 'Refresh Logs'}
          </button>
        </div>
      </div>

      {/* Modern Slider Tab Switcher */}
      <div className="flex justify-between items-center bg-surface border border-border/40 p-3 rounded-[24px] shadow-sm">
        <div className="bg-muted/40 p-1 rounded-full inline-flex border border-border/20 gap-1">
          <button
            onClick={() => setActiveTab('booked')}
            className={`px-5 py-2 rounded-full font-bold text-[13px] transition-all flex items-center gap-2 tracking-wide cursor-pointer ${
              activeTab === 'booked'
                ? 'bg-success/15 text-success shadow-sm border border-success/10'
                : 'text-textMuted hover:text-surface-foreground hover:bg-muted/20'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            Booked Meetings
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'booked' ? 'bg-success/20 text-success' : 'bg-muted text-textMuted'
            }`}>
              {bookedLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('failed')}
            className={`px-5 py-2 rounded-full font-bold text-[13px] transition-all flex items-center gap-2 tracking-wide cursor-pointer ${
              activeTab === 'failed'
                ? 'bg-error/15 text-error shadow-sm border border-error/10'
                : 'text-textMuted hover:text-surface-foreground hover:bg-muted/20'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Failed Bookings
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'failed' ? 'bg-error/20 text-error' : 'bg-muted text-textMuted'
            }`}>
              {failedLogs.length}
            </span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[12px] font-bold text-textMuted mr-2">
          <CalendarRange className="w-4 h-4 text-primary opacity-70" />
          Active View: <span className="text-primary font-black uppercase tracking-wider">{activeTab} ({activeLogs.length})</span>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-surface rounded-[24px] border border-border/60 shadow-xl shadow-black/5 py-24 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="font-bold text-sm tracking-widest uppercase text-textMuted">Syncing meeting archives...</p>
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView 
          logs={logs} 
          onViewDetails={(log) => setSelectedLog(log)} 
          activeTab={activeTab} 
        />
      ) : activeLogs.length === 0 ? (
        <div className="bg-surface rounded-[24px] border border-border/60 shadow-xl shadow-black/5 py-24 text-center flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-20 h-20 bg-muted/40 rounded-full flex items-center justify-center text-textMuted animate-bounce duration-[2000ms]">
            <CalendarCheck className="w-10 h-10 opacity-30" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-surface-foreground">No {activeTab === 'booked' ? 'Booked' : 'Failed'} Records</h3>
            <p className="text-textMuted text-sm mt-2 max-w-sm mx-auto">
              {activeTab === 'booked' 
                ? 'When an agent schedules an event on Cal.com successfully during a call, it will appear here.'
                : 'Any skipped schedule attempts or booking failure messages will be documented in this section.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          
          {/* Top 3-4 Premium Outlook-Style Calendar Event Cards */}
          <div>
            <div className="flex items-center gap-2 px-2 mb-4">
              <CalendarRange className="w-5 h-5 text-primary opacity-80" />
              <h2 className="text-sm font-black text-surface-foreground uppercase tracking-widest">
                Recent Scheduling Events
              </h2>
              <span className="text-[12px] text-textMuted font-bold">({featuredLogs.length} shown)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {featuredLogs.map((log) => {
                const { dateStr, timeStr, participantName, topic } = parseMeetingDetails(log);
                const { month, day } = getCalendarBadge(dateStr);
                
                return (
                  <div 
                    key={log.id} 
                    className={`bg-surface border rounded-[20px] p-5 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 group ${
                      log.status === 'booked' 
                        ? 'border-success/20 hover:border-success/40' 
                        : 'border-error/20 hover:border-error/40'
                    }`}
                  >
                    {/* Visual Color stripe */}
                    <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                      log.status === 'booked' ? 'bg-success' : 'bg-error'
                    }`} />

                    {/* Header: Calendar badge + Topic */}
                    <div className="flex items-start gap-3 mt-1">
                      <div className="flex-shrink-0 flex flex-col items-center justify-center w-12 h-14 bg-muted border border-border/40 rounded-[12px] shadow-sm overflow-hidden">
                        <div className={`w-full text-[9px] font-black text-center py-0.5 tracking-wider uppercase ${
                          log.status === 'booked' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                        }`}>
                          {month}
                        </div>
                        <div className="text-lg font-black text-surface-foreground leading-tight py-1">
                          {day}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[14px] text-surface-foreground truncate group-hover:text-primary transition-colors" title={topic}>
                          {topic}
                        </h3>
                        <p className="text-[12px] text-textMuted truncate mt-0.5 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 opacity-60" />
                          {participantName}
                        </p>
                      </div>
                    </div>

                    {/* Details Box */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-2 bg-muted/20 p-3 rounded-xl border border-border/20 text-[12px]">
                      <div>
                        <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Agent</span>
                        <span className="font-semibold text-surface-foreground truncate block">{log.agent_name || 'Unknown Agent'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Time</span>
                        <span className="font-semibold text-surface-foreground truncate block">{timeStr}</span>
                      </div>
                    </div>

                    {/* Status & Actions Row */}
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/20">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        log.status === 'booked' ? 'bg-success/10 text-success' : 
                        log.status === 'failed' ? 'bg-error/10 text-error' : 
                        'bg-warning/10 text-warning'
                      }`}>
                        {log.status === 'booked' ? 'Booked ✅' : log.status === 'failed' ? 'Failed ❌' : 'Skipped ⚠️'}
                      </span>
                      
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold btn-outline flex items-center gap-1 cursor-pointer transition-all hover:bg-muted"
                        >
                          View Details
                        </button>
                        
                        {log.status === 'booked' && log.error_reason && (
                          <a
                            href={log.error_reason}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-primary text-primary-foreground flex items-center gap-1 shadow-sm hover:opacity-90 cursor-pointer transition-all"
                          >
                            Join
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* All Remaining Records Table */}
          {remainingLogs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-2 mb-4">
                <FileText className="w-5 h-5 text-primary opacity-80" />
                <h2 className="text-sm font-black text-surface-foreground uppercase tracking-widest">
                  Booking History Log
                </h2>
                <span className="text-[12px] text-textMuted font-bold">({remainingLogs.length} records)</span>
              </div>

              <div className="bg-surface rounded-[24px] border border-border/60 shadow-xl shadow-black/5 overflow-hidden">
                <table className="w-full text-left text-[14px]">
                  <thead className="text-textMuted border-b border-border/40 bg-muted/5">
                    <tr>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest whitespace-nowrap">Agent</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest whitespace-nowrap">Participant</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest whitespace-nowrap">Topic</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-center whitespace-nowrap">Status</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest">Details / Link</th>
                      <th className="px-6 py-4 font-bold text-[11px] uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {paginatedRemainingLogs.map((log) => {
                      const { participantName, participantEmail, topic } = parseMeetingDetails(log);
                      
                      return (
                        <tr key={log.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-6 py-4 text-[12px] text-textMuted font-mono whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 font-bold text-surface-foreground whitespace-nowrap">
                            {log.agent_name || log.agent_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-bold text-surface-foreground text-[13px]">{participantName}</span>
                              <span className="text-[11px] text-textMuted font-mono">{participantEmail}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-surface-foreground max-w-[200px] truncate" title={topic}>
                            {topic}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              log.status === 'booked' ? 'bg-success/10 text-success' : 
                              log.status === 'failed' ? 'bg-error/10 text-error' : 
                              'bg-warning/10 text-warning'
                            }`}>
                              {log.status === 'booked' ? 'Booked' : log.status === 'failed' ? 'Failed' : 'Skipped'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[12px] text-textMuted max-w-[250px] truncate" title={log.error_reason || ''}>
                            {log.status === 'booked' && log.error_reason ? (
                              <a href={log.error_reason} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold flex items-center gap-1">
                                <Video className="w-3.5 h-3.5" /> Join Session
                              </a>
                            ) : (
                              log.error_reason || '—'
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-3 py-1 rounded-lg text-[12px] font-bold btn-outline cursor-pointer hover:bg-muted"
                            >
                              View Page
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Premium Pagination Footer (Centered in the middle of the page) */}
                <div className="flex flex-col items-center justify-center gap-3 p-4 border-t border-border/40 bg-surface/50 text-[13px] text-textMuted select-none w-full">
                  
                  {/* Page number switcher buttons in the exact middle */}
                  <div className="flex items-center gap-1 font-bold">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-border/40 hover:bg-muted/30 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all text-[12px]"
                    >
                      Previous
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .map((p, idx, arr) => {
                          const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                          return (
                            <div key={p} className="flex items-center gap-1">
                              {showEllipsis && <span className="px-1.5 opacity-60">...</span>}
                              <button
                                onClick={() => setCurrentPage(p)}
                                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-[12px] ${
                                  currentPage === p
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border/40 hover:bg-muted/30'
                                }`}
                              >
                                {p}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-border/40 hover:bg-muted/30 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-all text-[12px]"
                    >
                      Next
                    </button>
                  </div>

                  {/* Entries control and details centered below */}
                  <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
                    <span>Show</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-surface border border-border/30 rounded-[10px] px-2.5 py-1 font-bold text-surface-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span>entries</span>
                    <span className="opacity-60 ml-2">
                      (Showing {remainingLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, remainingLogs.length)} of {remainingLogs.length} entries)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Premium Glassmorphic Details Modal (View Details / View Page) */}
      {selectedLog && (() => {
        const { dateStr, timeStr, participantName, participantEmail, topic, parsedJson } = parseMeetingDetails(selectedLog);
        
        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md transition-opacity animate-in fade-in"
            onClick={() => setSelectedLog(null)}
          >
            <div 
              className="relative bg-surface border border-border/60 rounded-[28px] max-w-[850px] w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-border/40 flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    selectedLog.status === 'booked' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                  }`}>
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-black text-surface-foreground uppercase tracking-wider">
                      Meeting Log Details
                    </h2>
                    <p className="text-[11px] text-textMuted font-mono">ID: {selectedLog.id}</p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedLog(null)}
                  className="p-2 rounded-full text-textMuted hover:bg-muted/40 cursor-pointer transition-all border border-transparent hover:border-border/30"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 bg-muted/5">
                
                {/* Left Side: Invitation Block & JSON */}
                <div className="md:col-span-7 flex flex-col gap-5">
                  
                  {/* Outlook Style Scheduling Invitation Card */}
                  <div className="border border-border/40 rounded-2xl bg-surface overflow-hidden shadow-sm">
                    <div className="bg-primary/5 px-4 py-3 border-b border-border/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarCheck className="w-4 h-4 text-primary" />
                        <span className="text-[11px] font-black text-primary uppercase tracking-widest">Calendar Event Invitation</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        selectedLog.status === 'booked' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                      }`}>
                        {selectedLog.status}
                      </span>
                    </div>

                    <div className="p-4 flex flex-col gap-4">
                      {/* Topic Title */}
                      <div>
                        <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Meeting Topic</span>
                        <h4 className="text-[15px] font-black text-surface-foreground mt-0.5 leading-snug">{topic}</h4>
                      </div>

                      {/* Timing */}
                      <div className="flex gap-6">
                        <div>
                          <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Meeting Date</span>
                          <span className="text-[13px] font-bold text-surface-foreground flex items-center gap-1.5 mt-0.5">
                            <CalendarRange className="w-4 h-4 text-primary opacity-60" />
                            {dateStr}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Time & Timezone</span>
                          <span className="text-[13px] font-bold text-surface-foreground flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-4 h-4 text-primary opacity-60" />
                            {timeStr} <span className="text-textMuted text-[10px] font-medium">(Asia/Kolkata)</span>
                          </span>
                        </div>
                      </div>

                      {/* Host vs Attendee */}
                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/20">
                        <div>
                          <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Organizer / Host</span>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
                              AI
                            </div>
                            <div className="min-w-0">
                              <span className="text-[12px] font-bold text-surface-foreground block leading-none truncate">{selectedLog.agent_name || 'AI Agent'}</span>
                              <span className="text-[9px] text-textMuted block">Organizer Agent</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Attendee / Guest</span>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-[10px]">
                              {participantName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[12px] font-bold text-surface-foreground block leading-none truncate">{participantName}</span>
                              <span className="text-[9px] text-textMuted block truncate font-mono" title={participantEmail}>{participantEmail}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Location / Meeting Room Link */}
                      <div className="pt-3 border-t border-border/20">
                        <span className="text-[9px] text-textMuted uppercase font-bold tracking-wider block">Location / Meeting Room</span>
                        {selectedLog.status === 'booked' && selectedLog.error_reason ? (
                          <a 
                            href={selectedLog.error_reason} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-primary text-[12px] font-bold mt-1.5 hover:underline group"
                          >
                            <Video className="w-4 h-4 text-success" />
                            Join Cal.com / Google Meet Session
                            <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-error flex items-center gap-1.5 mt-1.5 font-semibold">
                            <AlertCircle className="w-4 h-4" />
                            Unscheduled — Event Not Confirmed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Failure reason alert block */}
                  {(selectedLog.status === 'failed' || selectedLog.status === 'skipped') && (
                    <div className="p-4 rounded-xl bg-error/5 border border-error/25 flex gap-3 text-error">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-[12px] uppercase tracking-wide leading-none">Booking Error Reason</h5>
                        <p className="text-[12px] mt-1 leading-relaxed">{selectedLog.error_reason || 'AI agent finished call without triggering scheduling.'}</p>
                      </div>
                    </div>
                  )}

                  {/* Code Block Metadata view */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-textMuted font-bold uppercase tracking-wider flex items-center gap-1">
                      <Code className="w-4 h-4 text-primary opacity-70" />
                      AI JSON Payload Metadata
                    </span>
                    <pre className="bg-black/20 p-4 rounded-xl font-mono text-[11px] text-textMuted border border-border/30 overflow-x-auto max-h-[170px] leading-normal shadow-inner">
                      {JSON.stringify(parsedJson || { error_reason: selectedLog.error_reason, topic: selectedLog.meeting_topic }, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Right Side: Call Transcript and Actions */}
                <div className="md:col-span-5 flex flex-col gap-4 h-full min-h-[300px]">
                  
                  {/* Transcript controls and copy actions */}
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-textMuted font-bold uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-4 h-4 text-primary opacity-70" />
                      Call Transcript Notes
                    </span>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyTranscript(selectedLog.transcript || '')}
                        disabled={!selectedLog.transcript}
                        className="p-1.5 rounded-lg text-textMuted hover:bg-surface border border-transparent hover:border-border/30 cursor-pointer disabled:opacity-40"
                        title="Copy Transcript"
                      >
                        <span className="sr-only">Copy</span>
                        {copiedLogId ? (
                          <CheckCircle2 className="w-4 h-4 text-success animate-in zoom-in-50 duration-150" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDownloadTranscript(selectedLog)}
                        disabled={!selectedLog.transcript}
                        className="p-1.5 rounded-lg text-textMuted hover:bg-surface border border-transparent hover:border-border/30 cursor-pointer disabled:opacity-40"
                        title="Download Transcript"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Transcript scroll pane */}
                  <div className="bg-black/10 border border-border/30 rounded-xl p-4 flex-1 overflow-y-auto max-h-[380px] font-mono text-[12px] text-surface-foreground leading-relaxed shadow-inner">
                    {selectedLog.transcript ? (
                      selectedLog.transcript.split('\n').map((line, idx) => (
                        <p key={idx} className="mb-2 whitespace-pre-wrap">{line}</p>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3 opacity-60">
                        <FileText className="w-8 h-8 text-textMuted opacity-40 animate-pulse" />
                        <p className="italic text-[12px] text-textMuted">No transcript details compiled for this booking call log.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MeetingLogs;
