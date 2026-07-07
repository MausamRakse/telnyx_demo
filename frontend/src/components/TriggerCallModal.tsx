import { useState } from 'react';
import { X, Loader2, CheckCircle2, PhoneCall } from 'lucide-react';
import { triggerCall, type Agent } from '../api/client';
import toast from 'react-hot-toast';

interface Props {
  agent: Agent;
  onClose: () => void;
}

const TriggerCallModal = ({ agent, onClose }: Props) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [phone, setPhone] = useState('+919770774461');
  const [customGreeting, setCustomGreeting] = useState('');
  const [callId, setCallId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [phoneError, setPhoneError] = useState(false);

  const handleStart = async () => {
    if (!phone.trim()) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setStep(2);

    try {
      const res = await triggerCall({
        agent_id: agent.id,
        phone_number: phone,
        custom_first_line: customGreeting,
        is_booking_agent: agent.meeting_enabled,
      });
      setCallId(res.call_id);
      toast.success('Call triggered successfully!');
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Call failed');
      toast.error('Failed to trigger call');
      setStep(4);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
      <div
        className="relative bg-surface rounded-[16px] w-full max-w-[420px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border/50"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-muted/30 border-b border-border flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-surface-foreground flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-primary" />
            Trigger Call
          </h2>
          <button onClick={onClose} className="p-1 rounded-md text-textMuted hover:bg-surface border border-transparent hover:border-border transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="flex flex-col gap-4 animate-in fade-in">
              <div className="bg-secondary p-3 rounded-lg text-[13px] text-primary border border-primary/20">
                You are about to trigger an outbound call from <strong>{agent.name}</strong>.
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-surface-foreground">Phone Number</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted text-[14px]"></span>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className={`w-full border rounded-[8px] pl-3 pr-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${phoneError ? 'border-error' : 'border-border'}`}
                    placeholder="+91XXXXXXXXXX"
                  />
                </div>
                {phoneError && <span className="text-[12px] text-error">Required field</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-surface-foreground">Custom Greeting (Optional)</label>
                <input
                  type="text"
                  value={customGreeting}
                  onChange={e => setCustomGreeting(e.target.value)}
                  className="w-full border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Defaults to agent greeting..."
                />
              </div>

              <button onClick={handleStart} className="btn-primary w-full mt-2 py-2.5 font-bold shadow-sm shadow-primary/30">
                Start Call
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 animate-in fade-in zoom-in-95">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-surface-foreground font-medium text-[15px]">{agent.meeting_enabled ? "Fetching availability & placing call..." : "Placing call..."}</p>
              <p className="text-[13px] text-textMuted text-center max-w-[250px]">Calling {phone}. Please wait, this may take a moment.</p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 animate-in fade-in zoom-in-95">
              <div className="w-14 h-14 bg-success/10 rounded-full flex items-center justify-center text-success mb-2">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-surface-foreground font-bold text-[18px]">Call triggered successfully!</p>
              <div className="bg-muted/30 border border-border rounded-[8px] px-4 py-3 w-full text-center">
                <p className="text-[12px] text-textMuted uppercase tracking-wider font-semibold mb-1">Call ID</p>
                <p className="font-mono text-primary text-[14px]">{callId || 'unknown'}</p>
              </div>
              <button onClick={onClose} className="btn-outline w-full mt-4">Close</button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 animate-in fade-in zoom-in-95">
              <div className="w-14 h-14 bg-error/10 rounded-full flex items-center justify-center text-error mb-2">
                <X className="w-8 h-8" />
              </div>
              <p className="text-surface-foreground font-bold text-[18px]">Call Failed</p>
              <p className="text-error text-[13px] text-center">{errorMsg}</p>
              <button onClick={() => setStep(1)} className="btn-outline w-full mt-4">Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TriggerCallModal;
