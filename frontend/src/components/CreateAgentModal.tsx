import { useState } from 'react';
import { X, Loader2, Volume2 } from 'lucide-react';
import { createAgent, type Agent } from '../api/client';

import { useAgentStore } from '../store/agentStore';
import toast from 'react-hot-toast';
import VoiceSelectionModal from './VoiceSelectionModal';

interface Props {
  onClose: (createdAgent?: Agent) => void;
}

const AVAILABLE_PHONE_NUMBERS = [
  { value: '+918035736739', label: '+91 80357 36739' }
];

const CreateAgentModal = ({ onClose }: Props) => {
  const [loading, setLoading] = useState(false);
  const { addAgent } = useAgentStore();
  const [formData, setFormData] = useState({
    agent_name: '',
    custom_first_line: '',
    prompt_text: '',
    stt_language: 'en',
    voice_id: 0,
    enable_calendar_booking: false,
    cal_api_key: '',
    cal_event_type_id: '',
    phone_number: '+918035736739',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, boolean> = {};
    if (!formData.agent_name.trim()) newErrors.agent_name = true;
    if (!formData.custom_first_line.trim()) newErrors.custom_first_line = true;
    if (!formData.prompt_text.trim()) newErrors.prompt_text = true;
    // if (formData.voice_id === 0) newErrors.voice_id = true;

    // cal_api_key and cal_event_type_id are now strictly optional so no validation needed here

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const res = await createAgent(formData);
      addAgent(res.agent);
      toast.success('Agent created successfully!');
      onClose(res.agent);
    } catch (error: any) {
      const errDetail = error.response?.data?.detail || 'Failed to create agent';
      toast.error(errDetail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
      <div
        className="relative bg-surface rounded-[16px] w-full max-w-[700px] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border border-border/50"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-surface-foreground">Create an Agent</h2>
          <button onClick={() => onClose()} className="p-1 rounded-md text-textMuted hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-surface-foreground">Agent Name</label>
            <input
              type="text"
              value={formData.agent_name}
              onChange={e => setFormData({ ...formData, agent_name: e.target.value })}
              className={`border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${errors.agent_name ? 'border-error' : 'border-border'}`}
              placeholder="e.g. Sales Representative"
            />
            {errors.agent_name && <span className="text-[12px] text-error">Required field</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-surface-foreground">Greeting / First Line</label>
            <input
              type="text"
              value={formData.custom_first_line}
              onChange={e => setFormData({ ...formData, custom_first_line: e.target.value })}
              className={`border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all ${errors.custom_first_line ? 'border-error' : 'border-border'}`}
              placeholder="e.g. Hello, how can I help you today?"
            />
            {errors.custom_first_line && <span className="text-[12px] text-error">Required field</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-surface-foreground">Agent Prompt</label>
            <textarea
              value={formData.prompt_text}
              onChange={e => setFormData({ ...formData, prompt_text: e.target.value })}
              rows={12}
              className={`border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none ${errors.prompt_text ? 'border-error' : 'border-border'}`}
              placeholder="Describe the agent's persona, goals, and behavior..."
            />
            {errors.prompt_text && <span className="text-[12px] text-error">Required field</span>}
          </div>

          {/*
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-surface-foreground">Language</label>
              <select
                value={formData.stt_language}
                onChange={e => setFormData({ ...formData, stt_language: e.target.value })}
                className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary"
              >
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi)</option>
                <option value="es">Spanish (es)</option>
                <option value="fr">French (fr)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-surface-foreground">Voice Options</label>
              <button
                type="button"
                onClick={() => setShowVoiceModal(true)}
                className={`w-full flex items-center justify-between border rounded-[8px] px-3 py-2.5 text-[14px] bg-muted/30 text-surface-foreground hover:border-primary transition-all outline-none text-left cursor-pointer ${
                  errors.voice_id ? 'border-error' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <div>
                    {formData.voice_id === 0 ? (
                      <span className="font-bold text-[13px] text-textMuted italic">
                        Select Your Voice
                      </span>
                    ) : (
                      <>
                        <span className="font-bold text-[13px]">
                          {formData.voice_id === 1 ? 'Riya Mehta' : formData.voice_id === 2 ? 'Akash' : 'Asha'}
                        </span>
                        <span className="text-[11px] text-textMuted ml-2">
                          ({formData.voice_id === 1 ? 'Female' : formData.voice_id === 2 ? 'Male' : 'Female'} • Indian Accent)
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[11px] font-bold text-primary bg-primary/10 py-0.5 px-2.5 rounded-full hover:bg-primary/20 transition-all">
                  {formData.voice_id === 0 ? 'Select' : 'Change'}
                </span>
              </button>
              {errors.voice_id && <span className="text-[12px] text-error">Please select an active voice profile</span>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-surface-foreground">select phone</label>
            <select
              value={formData.phone_number}
              onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
              className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              {AVAILABLE_PHONE_NUMBERS.map(num => (
                <option key={num.value} value={num.value}>{num.label}</option>
              ))}
            </select>
          </div>
          */}

          {/*
          <div className="pt-2">
            <div 
              onClick={() => setFormData({ ...formData, enable_calendar_booking: !formData.enable_calendar_booking })}
              className="flex items-center justify-between cursor-pointer p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-all active:scale-[0.99] select-none"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-bold text-surface-foreground">Enable Meeting Booking</span>
                <span className="text-[12px] text-textMuted">Allow this agent to fetch real-time slots and book appointments during calls.</span>
              </div>
              <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in pointer-events-none">
                <input
                  type="checkbox"
                  checked={formData.enable_calendar_booking}
                  readOnly
                  className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-muted appearance-none cursor-pointer transition-transform duration-200 ease-in-out z-10"
                  style={{ transform: formData.enable_calendar_booking ? 'translateX(100%)' : 'translateX(0)', borderColor: formData.enable_calendar_booking ? '#10b981' : '#374151' }}
                />
                <span className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${formData.enable_calendar_booking ? 'bg-success' : 'bg-muted'}`}></span>
              </div>
            </div>
          </div>
          */}

          <div className="pt-2 flex justify-end gap-3 border-t border-border mt-4">
            <button type="button" onClick={() => onClose()} className="btn-outline">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary min-w-[120px] flex justify-center items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
      {showVoiceModal && (
        <VoiceSelectionModal
          selectedVoiceId={formData.voice_id}
          onSelect={(voiceId) => {
            setFormData({ ...formData, voice_id: voiceId });
            setShowVoiceModal(false);
          }}
          onClose={() => setShowVoiceModal(false)}
        />
      )}
    </div>
  );
};

export default CreateAgentModal;
