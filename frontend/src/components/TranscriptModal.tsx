import { X, Copy, CheckCircle2, Download } from 'lucide-react';
import { useState } from 'react';
import { type CallLog } from '../api/client';

interface Props {
  log: CallLog;
  onClose: () => void;
  generateCallFileName: (log: CallLog, extension: string) => string;
}

const TranscriptModal = ({ log, onClose, generateCallFileName }: Props) => {
  const [copied, setCopied] = useState(false);
  const transcript = log.transcript || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!transcript) return;
    const filename = generateCallFileName(log, "txt");
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in" onClick={onClose}>
      <div
        className="relative bg-surface rounded-[16px] w-full max-w-[600px] max-h-[80vh] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border border-border/50"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/30 rounded-t-[16px]">
          <h2 className="text-[18px] font-bold text-surface-foreground">Call Transcript</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-textMuted hover:bg-surface hover:text-primary hover:shadow-sm border border-transparent hover:border-border transition-all"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copy' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!transcript}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-textMuted hover:bg-surface hover:text-primary hover:shadow-sm border border-transparent hover:border-border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download Transcript"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-textMuted hover:bg-surface hover:shadow-sm border border-transparent hover:border-border transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 font-mono text-[13px] leading-relaxed text-surface-foreground bg-muted/10">
          {transcript.split('\n').map((line, i) => (
            <p key={i} className="mb-2 whitespace-pre-wrap">{line}</p>
          ))}
          {!transcript && <p className="italic text-textMuted">No transcript available.</p>}
        </div>
      </div>
    </div>
  );
};

export default TranscriptModal;
