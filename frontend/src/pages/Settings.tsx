import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getUser, updateUserCalSettings } from '../api/client';

const Settings = () => {
  const [platformName, setPlatformName] = useState(() => localStorage.getItem('platform_name') || 'Voice AI Platform');
  const [defaultLanguage, setDefaultLanguage] = useState(() => localStorage.getItem('default_language') || 'en');
  const [defaultVoice, setDefaultVoice] = useState(() => localStorage.getItem('default_voice') || '1');
  const [calApiKey, setCalApiKey] = useState('');
  const [calEventTypeId, setCalEventTypeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then((user) => {
      if (user.cal_api_key) setCalApiKey(user.cal_api_key);
      if (user.cal_event_type_id) setCalEventTypeId(user.cal_event_type_id);
    }).catch(err => {
      console.error("Failed to load user settings", err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      localStorage.setItem('platform_name', platformName);
      localStorage.setItem('default_language', defaultLanguage);
      localStorage.setItem('default_voice', defaultVoice);
      
      await updateUserCalSettings(calApiKey, calEventTypeId);
      toast.success('Settings saved successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-foreground tracking-tight">Settings</h1>
        <p className="text-textMuted mt-1">Configure your personal dashboard preferences.</p>
      </div>

      <div className="bg-surface rounded-[12px] border border-border card-shadow">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-[16px] font-bold text-surface-foreground">Platform Settings</h2>
        </div>
        <form onSubmit={handleSave} className="p-6 flex flex-col gap-6">
          
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-semibold text-surface-foreground">Platform Name</label>
            <p className="text-[12px] text-textMuted mb-1">Customize the display name in the sidebar.</p>
            <input 
              type="text"
              value={platformName}
              onChange={e => setPlatformName(e.target.value)}
              className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all w-full max-w-md"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-md">
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-semibold text-surface-foreground">Default Language</label>
              <select 
                value={defaultLanguage}
                onChange={e => setDefaultLanguage(e.target.value)}
                className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary w-full"
              >
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi)</option>
                <option value="es">Spanish (es)</option>
                <option value="fr">French (fr)</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-semibold text-surface-foreground">Default Voice</label>
              <select 
                value={defaultVoice}
                onChange={e => setDefaultVoice(e.target.value)}
                className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary w-full"
              >
                <option value="1">Voice 1 (Female)</option>
                <option value="2">Voice 2 (Male)</option>
                {/* <option value="3">Voice 3 (Neutral)</option> */}
              </select>
            </div>
          </div>

          <div className="border-t border-border mt-2 pt-6">
            <h2 className="text-[16px] font-bold text-surface-foreground mb-4">Cal.com Integration</h2>
            <p className="text-[13px] text-textMuted mb-6">
              Enter your personal Cal.com credentials to enable meeting booking. 
              If left blank, the system will fall back to the default credentials.
            </p>
            
            <div className="flex flex-col gap-4 max-w-md">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-semibold text-surface-foreground">Cal.com API Key</label>
                <input 
                  type="password"
                  value={calApiKey}
                  onChange={e => setCalApiKey(e.target.value)}
                  placeholder="cal_live_..."
                  className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all w-full"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-semibold text-surface-foreground">Event Type ID</label>
                <input 
                  type="text"
                  value={calEventTypeId}
                  onChange={e => setCalEventTypeId(e.target.value)}
                  placeholder="e.g. 1599599 (optional, leave blank to dynamically resolve)"
                  className="border border-border rounded-[8px] px-3 py-2 text-[14px] bg-muted/30 text-surface-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all w-full"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border mt-2">
            <button type="submit" disabled={saving} className="btn-primary min-w-[140px]">
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
