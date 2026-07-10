import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchCallLogs, type CallLog } from '../api/client';
import TranscriptModal from '../components/TranscriptModal';
import { Download, PlayCircle, PhoneOff, Loader2, Play, Pause, X } from 'lucide-react';

const CallLogs = () => {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs.length]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, currentPage, pageSize]);

  // Audio Player States
  const [activeAudioLog, setActiveAudioLog] = useState<CallLog | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playbackRate = 1;
  const volume = 1;
  const isMuted = false;
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatDate = (dateStr: any) => {
    const str = String(dateStr || "");
    if (!str || str === "unknown") return "N/A";
    const safeDate = str.replace(' ', 'T') + 'Z'; // Force UTC 
    const d = new Date(safeDate);
    return isNaN(d.getTime())
      ? str
      : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  };

  // Naming & Sanitization Helpers
  const transliterateHindi = (text: string): string => {
    const map: { [key: string]: string } = {
      'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
      'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
      'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
      'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
      'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
      'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
      'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
      'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
      'ं': 'n', 'ः': 'h', 'ँ': 'n', '़': '', '्': ''
    };

    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (map[char] !== undefined) {
        result += map[char];
        
        // If this is a consonant and not followed by a matra, halant, or EOF, add inherent 'a' sound
        const isConsonant = 'कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह'.includes(char);
        const nextIsMatraOrHalant = nextChar && 'ािीुूृेैोौ्ंःँ़'.includes(nextChar);
        
        if (isConsonant && !nextIsMatraOrHalant && nextChar !== ' ') {
          result += 'a';
        }
      } else {
        result += char;
      }
    }
    return result;
  };

  const sanitizeFileNameComponent = (text: any, fallback: string): string => {
    if (!text) return fallback;
    const str = transliterateHindi(String(text));
    let sanitized = str
      .trim()
      .replace(/[\/\\:*?"<>|]/g, '') // remove invalid characters
      .replace(/\s+/g, '_')          // replace spaces with underscores
      .replace(/_+/g, '_');          // prevent double underscores
    
    sanitized = sanitized.replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
    return sanitized || fallback;
  };

  const sanitizePhone = (phone: any): string => {
    if (!phone) return "NoPhone";
    const cleaned = String(phone).replace(/\D/g, ''); // strip non-digits (e.g. +1 (987) 654-3210 -> 19876543210)
    return cleaned || "NoPhone";
  };

  const getCallDate = (dateStr: any): string => {
    const str = String(dateStr || "");
    if (!str || str === "unknown") {
      return new Date().toISOString().split('T')[0];
    }
    try {
      const match = str.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) return match[0];
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
  };

  const getCustomerName = (log: CallLog): string => {
    if (log.customer_name) return log.customer_name;
    if (log.json_output) {
      try {
        const data = typeof log.json_output === 'string' ? JSON.parse(log.json_output) : log.json_output;
        if (data && typeof data === 'object') {
          const found = data.name || data.customer_name || data.user_name;
          if (found) return found;
        }
      } catch (e) {}
    }
    return "UnknownCustomer";
  };

  const generateCallFileName = (log: CallLog, extension: string): string => {
    const customerName = sanitizeFileNameComponent(getCustomerName(log), "UnknownCustomer");
    const phone = sanitizePhone(log.phone_number);
    const agentName = sanitizeFileNameComponent(log.agent_name, "UnknownAgent");
    const callDate = getCallDate(log.date);
    
    const filename = `${customerName}_${phone}_${agentName}_${callDate}.${extension}`;
    
    if (filename.length > 200) {
      const truncatedCustomer = customerName.substring(0, 30);
      const truncatedAgent = agentName.substring(0, 30);
      return `${truncatedCustomer}_${phone}_${truncatedAgent}_${callDate}.${extension}`;
    }
    return filename;
  };

  // Audio Playback Handlers
  const handlePlayRecording = (log: CallLog) => {
    if (!log.recording_url) return;
    
    if (activeAudioLog && activeAudioLog.call_id === log.call_id) {
      if (isAudioPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play().catch(e => console.error("Playback failed", e));
      }
      return;
    }
    
    setActiveAudioLog(log);
    setIsAudioLoading(true);
    setIsAudioPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  useEffect(() => {
    if (audioRef.current && activeAudioLog?.recording_url) {
      audioRef.current.pause();
      audioRef.current.load();
      
      audioRef.current.src = activeAudioLog.recording_url;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;
      
      setIsAudioLoading(true);
      
      audioRef.current.play()
        .then(() => {
          setIsAudioPlaying(true);
          setIsAudioLoading(false);
        })
        .catch(err => {
          console.error("Autoplay failed:", err);
          setIsAudioPlaying(false);
          setIsAudioLoading(false);
        });
    } else if (!activeAudioLog && audioRef.current) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    }
  }, [activeAudioLog]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };



  const formatAudioTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  useEffect(() => {
    let isMounted = true;

    const loadData = () => {
      fetchCallLogs(50).then(data => {
        if (isMounted) {
          setLogs(data);
          setLoading(false);
        }
      }).catch(err => {
        console.error(err);
        if (isMounted) setLoading(false);
      });
    };

    loadData();
    const interval = setInterval(loadData, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-foreground tracking-tight">Call Logs</h1>
        <p className="text-textMuted mt-1">Review activity, playback recordings, and read transcripts from your agents.</p>
      </div>

      <div className="flex-1 bg-surface rounded-[12px] border border-border card-shadow flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-textMuted h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="font-medium">Loading call logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-textMuted h-full">
            <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4">
              <PhoneOff className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-surface-foreground font-bold text-[18px]">No call history yet</p>
            <p className="text-[14px] mt-1 max-w-sm text-center">Trigger your first call from the Agents page to see it appear here.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-surface sticky top-0 border-b border-border shadow-sm z-10 text-textMuted">
                <tr>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Phone Number</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Transcript</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider">Recording</th>
                  <th className="px-6 py-4 font-semibold text-[12px] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-6 py-4 text-[13px] font-medium text-surface-foreground">{log.agent_name || "Unknown Agent"}</td>
                    <td className="px-6 py-4 font-mono text-[13px]">{log.phone_number}</td>
                    <td className="px-6 py-4 text-textMuted whitespace-nowrap">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold tracking-wide ${
                        log.status === 'Completed' ? 'bg-success/10 text-success' : 
                        log.status === 'Not Answered' ? 'bg-error/10 text-error' : 
                        'bg-warning/10 text-warning animate-pulse'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {log.status === 'Not Answered' ? (
                        <span className="text-textMuted/40 text-[13px]">—</span>
                      ) : (
                        <button
                          onClick={() => setSelectedLog(log)}
                          disabled={!log.transcript}
                          className="text-primary hover:text-primary-hover font-medium disabled:text-textMuted/40 transition-colors disabled:cursor-not-allowed text-[13px]"
                        >
                          View Text
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {log.status === 'Not Answered' ? (
                        <span className="text-textMuted/40 text-[13px]">—</span>
                      ) : log.recording_url ? (
                        activeAudioLog?.call_id === log.call_id ? (
                          /* COMPACT INLINE PILL PLAYER */
                          <div className="flex items-center gap-1.5 bg-muted/95 border border-border/80 rounded-full px-1.5 py-0.5 w-max animate-in zoom-in-95 duration-200 shadow-sm">
                            {/* Play/Pause Button */}
                            <button
                              onClick={() => {
                                if (audioRef.current) {
                                  if (isAudioPlaying) audioRef.current.pause();
                                  else audioRef.current.play().catch(e => console.error(e));
                                }
                              }}
                              className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
                              title={isAudioPlaying ? "Pause" : "Play"}
                            >
                              {isAudioLoading ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : isAudioPlaying ? (
                                <Pause className="w-2.5 h-2.5 fill-current" />
                              ) : (
                                <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                              )}
                            </button>
                            
                            {/* Progress bar */}
                            <input
                              type="range"
                              min="0"
                              max={duration || 0}
                              value={currentTime}
                              onChange={handleSeek}
                              className="h-0.5 rounded bg-surface/85 cursor-pointer accent-primary w-10 sm:w-12 md:w-16 lg:w-20 flex-shrink-0"
                              title="Seek"
                            />

                            {/* Duration */}
                            <span className="text-[9px] font-mono text-surface-foreground/80 whitespace-nowrap select-none font-bold">
                              {formatAudioTime(currentTime)}/{formatAudioTime(duration)}
                            </span>

                            {/* Close Button */}
                            <button
                              onClick={() => setActiveAudioLog(null)}
                              className="p-0.5 rounded-full text-textMuted hover:bg-muted hover:text-primary transition-all flex-shrink-0 border-l border-border/60 pl-1 cursor-pointer"
                              title="Close Player"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          /* STANDARD ACTION TRIGGERS */
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handlePlayRecording(log)}
                              className="inline-flex items-center gap-1.5 text-surface-foreground hover:text-primary transition-colors text-[13px] font-medium"
                              title="Play Recording"
                            >
                              <PlayCircle className="w-4 h-4 text-primary" /> Play
                            </button>
                            {/* 
                            <button
                              onClick={() => downloadRecording(log)}
                              disabled={downloadingRecording === log.call_id}
                              className="inline-flex items-center gap-1 text-textMuted hover:text-primary transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Download Recording"
                            >
                              {downloadingRecording === log.call_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-textMuted hover:text-primary" />
                              )}
                              Download
                            </button>
                            */}
                          </div>
                        )
                      ) : (
                        <span className="text-textMuted/40 text-[13px]">Processing...</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {log.json_output && (
                        <a
                          href={`data:application/json;charset=utf-8,${encodeURIComponent(log.json_output)}`}
                          download={generateCallFileName(log, "json")}
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-textMuted hover:bg-muted hover:text-primary shadow-sm opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-border"
                          title="Download Data"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
                className="bg-surface border border-border/30 rounded-lg px-2.5 py-1 font-bold text-surface-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>entries</span>
              <span className="opacity-60 ml-2">
                (Showing {logs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, logs.length)} of {logs.length} entries)
              </span>
            </div>
          </div>
          </>
        )}
      </div>

      {selectedLog !== null && (
        <TranscriptModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          generateCallFileName={generateCallFileName}
        />
      )}

      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onEnded={() => {
          setIsAudioPlaying(false);
          setCurrentTime(0);
        }}
        onPlay={() => setIsAudioPlaying(true)}
        onPause={() => setIsAudioPlaying(false)}
      />
    </div>
  );
};

export default CallLogs;
