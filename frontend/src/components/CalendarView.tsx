import { useState, useMemo } from 'react';
import type { MeetingLog } from '../api/client';
import {
  ChevronLeft, ChevronRight, Calendar, Clock,
  User, Video, ExternalLink, CalendarRange
} from 'lucide-react';

interface CalendarViewProps {
  logs: MeetingLog[];
  onViewDetails: (log: MeetingLog) => void;
  activeTab: 'booked' | 'failed';
}

const CalendarView = ({ logs, onViewDetails, activeTab }: CalendarViewProps) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // The current active view mode of the calendar: month, week, or day view
  // const [mode, setMode] = useState<'month' | 'week' | 'day'>('month');
  let mode: any = 'month';

  // Helper to parse dates, times, and participant details
  const parseMeetingDetails = (log: MeetingLog) => {
    let dateStr = '—';
    let timeStr = '—';
    let participantName = '—';
    let participantEmail = log.extracted_email || '—';
    let topic = log.meeting_topic || 'AI Consultation Call';
    let parsedJson: any = null;

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

    if ((dateStr === '—' || timeStr === '—') && log.error_reason) {
      const dateMatch = log.error_reason.match(/Date:\s*([^\s,)]+)/i);
      const timeMatch = log.error_reason.match(/Time:\s*([^\s,)]+)/i);
      if (dateMatch) dateStr = dateMatch[1];
      if (timeMatch) timeStr = timeMatch[1];
    }

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

    if (participantName === '—' && participantEmail !== '—') {
      const prefix = participantEmail.split('@')[0];
      participantName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    // Construct Date object
    let dateObj: Date | null = null;
    if (dateStr && dateStr !== '—') {
      const cleanTime = timeStr !== '—' ? timeStr : '12:00 PM';
      const parsed = new Date(`${dateStr} ${cleanTime}`);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      } else {
        const parsedDateOnly = new Date(dateStr);
        if (!isNaN(parsedDateOnly.getTime())) {
          dateObj = parsedDateOnly;
        }
      }
    }
    if (!dateObj) {
      dateObj = new Date(log.created_at);
    }

    return { dateStr, timeStr, participantName, participantEmail, topic, parsedJson, dateObj };
  };

  // Pre-parse and memoize all logs
  const parsedMeetings = useMemo(() => {
    return logs.map(log => {
      const details = parseMeetingDetails(log);
      return {
        log,
        ...details
      };
    });
  }, [logs]);

  // Filter logs for the active tab (booked vs failed/skipped)
  const filteredMeetings = useMemo(() => {
    return parsedMeetings.filter(item => {
      if (activeTab === 'booked') {
        return item.log.status === 'booked';
      } else {
        return item.log.status === 'failed' || item.log.status === 'skipped';
      }
    });
  }, [parsedMeetings, activeTab]);

  // Helper to check if two dates are the same calendar day
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Helper to check if a date is "Today"
  const isToday = (d: Date) => {
    return isSameDay(d, new Date());
  };

  // Get meetings scheduled on a specific day
  const getMeetingsForDay = (d: Date) => {
    return filteredMeetings.filter(item => isSameDay(item.dateObj, d));
  };

  // Month Mode Grid Calculation (42 days grid)
  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Leading days from next month
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return days;
  };

  // Week Mode Days Calculation (7 days, starting Sunday)
  const getWeekDays = (date: Date) => {
    const temp = new Date(date);
    const day = temp.getDay(); // 0 = Sun
    const diff = temp.getDate() - day;
    const startOfWeek = new Date(temp.setDate(diff));

    return Array.from({ length: 7 }, (_, i) => {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      return dayDate;
    });
  };

  // Navigation handlers
  const handlePrev = () => {
    const nextDate = new Date(currentDate);
    if (mode === 'month') {
      nextDate.setMonth(currentDate.getMonth() - 1);
    } else if (mode === 'week') {
      nextDate.setDate(currentDate.getDate() - 7);
    } else if (mode === 'day') {
      nextDate.setDate(currentDate.getDate() - 1);
    }
    setCurrentDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDate);
    if (mode === 'month') {
      nextDate.setMonth(currentDate.getMonth() + 1);
    } else if (mode === 'week') {
      nextDate.setDate(currentDate.getDate() + 7);
    } else if (mode === 'day') {
      nextDate.setDate(currentDate.getDate() + 1);
    }
    setCurrentDate(nextDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Header Title String Creator
  const getHeaderTitle = () => {
    if (mode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (mode === 'week') {
      const weekDays = getWeekDays(currentDate);
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      } else {
        return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} – ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}, ${start.getFullYear()}`;
      }
    } else {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  const weekHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-surface rounded-[24px] border border-border/60 p-4 md:p-6 shadow-xl shadow-black/5 flex flex-col gap-6 select-none">

      {/* Calendar Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/20 pb-4">

        {/* Current Date Range Title */}
        <h2 className="text-lg font-black text-surface-foreground flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-primary" />
          <span>{getHeaderTitle()}</span>
        </h2>

        {/* Action Controls Group */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Navigation Controls */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/20">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-textMuted hover:text-surface-foreground hover:bg-muted/20 cursor-pointer transition-colors"
              title="Previous"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={handleToday}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold text-textMuted hover:text-surface-foreground hover:bg-muted/20 cursor-pointer transition-colors ${isSameDay(currentDate, new Date()) ? 'bg-primary/10 text-primary font-black' : ''
                }`}
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-textMuted hover:text-surface-foreground hover:bg-muted/20 cursor-pointer transition-colors"
              title="Next"
            >
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Mode Switcher Pill (Commented out to restrict view to Month view only) */}
          {/*
          <div className="bg-muted/40 p-1 rounded-xl inline-flex border border-border/20 gap-1">
            {(['month', 'week', 'day'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer ${mode === m
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-textMuted hover:text-surface-foreground hover:bg-muted/20'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
          */}
        </div>
      </div>

      {/* Mode Renderings */}

      {/* 1. MONTH VIEW */}
      {mode === 'month' && (
        <div className="flex flex-col gap-1.5">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center border-b border-border/20 pb-2">
            {weekHeaders.map(day => (
              <span key={day} className="text-[11px] uppercase tracking-wider font-black text-textMuted py-1">
                {day}
              </span>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 gap-1.5 bg-muted/10 p-1.5 rounded-[18px] border border-border/20">
            {getMonthDays(currentDate).map(({ date, isCurrentMonth }, idx) => {
              const dayMeetings = getMeetingsForDay(date);
              const isTodayCell = isToday(date);

              return (
                <div
                  key={idx}
                  className={`min-h-[90px] md:min-h-[120px] rounded-xl p-2 flex flex-col gap-1 transition-all border ${isCurrentMonth
                      ? 'bg-surface border-border/20 text-surface-foreground'
                      : 'bg-muted/10 border-border/10 text-textMuted opacity-50'
                    } ${isTodayCell ? 'ring-2 ring-primary/45 bg-primary/5 border-primary/30' : 'hover:border-border'}`}
                >
                  {/* Cell Header: Date Number */}
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-[12px] font-mono font-bold flex items-center justify-center w-6 h-6 rounded-full ${isTodayCell ? 'bg-primary text-primary-foreground font-black' : ''
                        }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayMeetings.length > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab === 'booked' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                        }`}>
                        {dayMeetings.length}
                      </span>
                    )}
                  </div>

                  {/* Meeting Chips */}
                  <div className="flex-1 overflow-y-auto flex flex-col gap-1 max-h-[60px] md:max-h-[85px] custom-scrollbar">
                    {dayMeetings.slice(0, 3).map((item) => (
                      <button
                        key={item.log.id}
                        onClick={() => onViewDetails(item.log)}
                        className={`w-full text-left px-2 py-1 rounded-lg text-[10px] font-black leading-tight flex items-center justify-between gap-1 transition-all hover:scale-[1.02] border cursor-pointer ${item.log.status === 'booked'
                            ? 'border-success/20 bg-success/10 hover:bg-success/15 text-success'
                            : item.log.status === 'failed'
                              ? 'border-error/20 bg-error/10 hover:bg-error/15 text-error'
                              : 'border-warning/20 bg-warning/10 hover:bg-warning/15 text-warning'
                          }`}
                        title={`${item.topic} - ${item.participantName} (${item.timeStr})`}
                      >
                        <span className="truncate flex-1 font-bold">{item.participantName}</span>
                        <span className="flex-shrink-0 opacity-75 font-mono text-[9px]">
                          {item.timeStr.split(' ')[0]}
                        </span>
                      </button>
                    ))}

                    {/* More Indicators */}
                    {dayMeetings.length > 3 && (
                      <button
                        onClick={() => {
                          setCurrentDate(date);
                          // setMode('day');
                        }}
                        className="text-[9px] font-bold text-primary hover:underline text-center py-0.5 transition-all cursor-pointer"
                      >
                        + {dayMeetings.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. WEEK VIEW */}
      {mode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 bg-muted/10 p-4 rounded-[20px] border border-border/20 overflow-x-auto">
          {getWeekDays(currentDate).map((date, idx) => {
            const dayMeetings = getMeetingsForDay(date);
            const isTodayCell = isToday(date);

            return (
              <div
                key={idx}
                className={`flex flex-col gap-3 min-w-[150px] p-3 rounded-xl border bg-surface ${isTodayCell ? 'ring-2 ring-primary/45 bg-primary/5 border-primary/30' : 'border-border/20'
                  }`}
              >
                {/* Column Header */}
                <div className="flex justify-between items-center border-b border-border/20 pb-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase text-textMuted">
                      {weekHeaders[date.getDay()]}
                    </span>
                    <span className="text-[16px] font-mono font-black text-surface-foreground mt-0.5 leading-none">
                      {date.getDate()}
                    </span>
                  </div>
                  {isTodayCell && (
                    <span className="text-[9px] font-black bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Today
                    </span>
                  )}
                </div>

                {/* Event list */}
                <div className="flex-1 flex flex-col gap-2 min-h-[200px] overflow-y-auto">
                  {dayMeetings.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center border border-dashed border-border/30 rounded-lg p-4 text-center opacity-40">
                      <Clock className="w-5 h-5 text-textMuted mb-1" />
                      <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider">No Sessions</span>
                    </div>
                  ) : (
                    dayMeetings.map((item) => (
                      <div
                        key={item.log.id}
                        onClick={() => onViewDetails(item.log)}
                        className={`flex flex-col gap-1.5 p-3 rounded-lg border text-[11px] transition-all hover:scale-[1.02] shadow-sm hover:shadow-md cursor-pointer ${item.log.status === 'booked'
                            ? 'border-success/35 bg-success/5 text-success hover:border-success/50'
                            : item.log.status === 'failed'
                              ? 'border-error/35 bg-error/5 text-error hover:border-error/50'
                              : 'border-warning/35 bg-warning/5 text-warning hover:border-warning/50'
                          }`}
                      >
                        <div className="font-bold flex items-center justify-between gap-1">
                          <span className="truncate text-[12px] font-black flex items-center gap-1">
                            <User className="w-3.5 h-3.5 opacity-65 flex-shrink-0" />
                            {item.participantName}
                          </span>
                          <span className="font-mono text-[9px] opacity-75 flex-shrink-0">
                            {item.timeStr}
                          </span>
                        </div>
                        <p className="text-[10px] opacity-80 leading-snug line-clamp-2 truncate" title={item.topic}>
                          {item.topic}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[9px] opacity-75 font-semibold pt-1.5 border-t border-current/10">
                          <span>Agent: {item.log.agent_name || 'AI'}</span>
                          {item.log.status === 'booked' && item.log.error_reason && (
                            <a
                              href={item.log.error_reason}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary font-black flex items-center gap-0.5 hover:underline"
                            >
                              Join <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. DAY VIEW */}
      {mode === 'day' && (
        <div className="bg-muted/10 p-4 md:p-6 rounded-[20px] border border-border/20">
          {getMeetingsForDay(currentDate).length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 bg-muted/40 rounded-full flex items-center justify-center text-textMuted">
                <Calendar className="w-8 h-8 opacity-30 animate-pulse" />
              </div>
              <div>
                <h4 className="text-md font-bold text-surface-foreground uppercase tracking-widest">
                  No events listed for this date
                </h4>
                <p className="text-textMuted text-xs mt-1 max-w-xs mx-auto">
                  {activeTab === 'booked'
                    ? 'No calls successfully booked a calendar spot on this day.'
                    : 'No failed scheduling attempts or skipped operations logged for this day.'
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-black uppercase text-textMuted tracking-widest pl-1">
                Agenda for the Day ({getMeetingsForDay(currentDate).length} items)
              </span>

              <div className="flex flex-col gap-3">
                {getMeetingsForDay(currentDate).map((item) => (
                  <div
                    key={item.log.id}
                    onClick={() => onViewDetails(item.log)}
                    className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border transition-all hover:scale-[1.01] cursor-pointer shadow-sm ${item.log.status === 'booked'
                        ? 'border-success/35 bg-success/5 text-success hover:border-success/50'
                        : item.log.status === 'failed'
                          ? 'border-error/35 bg-error/5 text-error hover:border-error/50'
                          : 'border-warning/35 bg-warning/5 text-warning hover:border-warning/50'
                      }`}
                  >
                    {/* Left: Timing & Participant */}
                    <div className="flex flex-col md:flex-row md:items-center gap-4">

                      {/* Time card */}
                      <div className="flex items-center gap-1.5 font-mono text-[13px] font-bold md:border-r md:border-current/15 md:pr-4 md:min-w-[110px]">
                        <Clock className="w-4 h-4 opacity-75" />
                        <span>{item.timeStr}</span>
                      </div>

                      {/* Description */}
                      <div className="flex flex-col">
                        <h4 className="font-black text-[14px] text-surface-foreground leading-snug">
                          {item.topic}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] opacity-80">
                          <span className="flex items-center gap-1 font-bold">
                            <User className="w-3.5 h-3.5 opacity-70" />
                            {item.participantName}
                          </span>
                          <span className="opacity-60 font-mono text-[11px] truncate max-w-[200px]" title={item.participantEmail}>
                            {item.participantEmail}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Agent, Actions & Status */}
                    <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-4 border-t border-current/10 pt-3 md:border-t-0 md:pt-0">
                      <div className="text-[12px] opacity-85">
                        <span className="opacity-70 font-semibold block text-[10px] uppercase tracking-wide">AI Assistant</span>
                        <span className="font-bold text-surface-foreground">{item.log.agent_name || 'AI Booking Agent'}</span>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(item.log);
                          }}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-current hover:bg-current/10 transition-all cursor-pointer"
                        >
                          View Logs
                        </button>

                        {item.log.status === 'booked' && item.log.error_reason && (
                          <a
                            href={item.log.error_reason}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-primary text-primary-foreground flex items-center gap-1.5 shadow-sm hover:opacity-90 cursor-pointer transition-all"
                          >
                            <Video className="w-3.5 h-3.5" />
                            Join
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarView;
