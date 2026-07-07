import { useState, useEffect } from 'react';
import { X, Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { getCalAuthUrl, type Agent } from '../api/client';
import toast from 'react-hot-toast';

interface Props {
  agent: Agent;
  onClose: () => void;
  onSuccess: () => void;
}

const ConnectCalModal = ({ agent, onClose, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'CAL_AUTH_SUCCESS') {
        setSuccess(true);
        toast.success('Cal.com connected successfully for this agent!');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onClose, onSuccess]);

  const handleConnectCal = async () => {
    setLoading(true);
    try {
      const res = await getCalAuthUrl(agent.id);
      if (res.url) {
        const width = 600, height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(res.url, 'cal_auth', `width=${width},height=${height},left=${left},top=${top}`);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to initialize Cal.com connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
      <div
        className="relative bg-surface rounded-[16px] w-full max-w-[500px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border border-border/50"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-surface-foreground">Connect Your Cal.com Account</h2>
          <button onClick={onClose} className="p-1 rounded-md text-textMuted hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center text-center">
          {success ? (
            <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-surface-foreground mb-2">Successfully Connected!</h3>
                <p className="text-textMuted">Your calendar is now linked to {agent.name}.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Calendar className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-surface-foreground mb-3">Almost done!</h3>
              <p className="text-[15px] text-textMuted leading-relaxed mb-8 max-w-[400px]">
                Meeting Booking has been enabled for this agent. Connect your Cal.com account now to allow the agent to fetch real-time availability and schedule meetings during calls.
              </p>

              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleConnectCal}
                  disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-[15px]"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Calendar className="w-5 h-5" />
                      Connect Cal.com Account
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 text-textMuted hover:text-surface-foreground font-medium text-[14px] transition-colors"
                >
                  Skip for Now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectCalModal;
