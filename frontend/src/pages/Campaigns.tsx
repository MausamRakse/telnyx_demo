import React, { useState, useEffect } from 'react';
import { Upload, Download, Clock, Rocket, FileSpreadsheet, CheckCircle2, ChevronRight, AlertCircle, MessageSquare, Terminal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { listAgents, createCampaign, type Agent } from '../api/client';
import toast from 'react-hot-toast';

const Campaigns = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showSampleWarning, setShowSampleWarning] = useState(false);
  
  const [formData, setFormData] = useState({
    campaign_name: '',
    agent_id: '',
    start_time: '09:00',
    end_time: '18:00',
    time_zone: 'IST',
    custom_first_line: 'Hey, am I speaking with {name}?',
    prompt_text: '',
    retries: '1'
  });

  useEffect(() => {
    loadAgents();
  }, []);

  // Update prompt whenever agent changes
  useEffect(() => {
    if (formData.agent_id) {
      const selectedAgent = agents.find(a => a.id === formData.agent_id);
      if (selectedAgent) {
        setFormData(prev => ({
          ...prev,
          prompt_text: selectedAgent.prompt || '',
          custom_first_line: selectedAgent.greeting || prev.custom_first_line
        }));
      }
    }
  }, [formData.agent_id, agents]);

  const loadAgents = async () => {
    try {
      const data = await listAgents();
      setAgents(data || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
      toast.error('Could not load agents. Please refresh the page.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Safeguard 1: Reject if the uploaded file has the default sample name
    if (file.name.toLowerCase() === 'tabbly_contacts_sample.csv') {
      setShowSampleWarning(true);
      setPreviewData([]);
      toast.error('Template file detected. Please upload your own customized contact list instead.', {
        duration: 6000,
        icon: '⚠️'
      });
      e.target.value = '';
      return;
    }

    setShowSampleWarning(false);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        // Safeguard 2: Reject if the uploaded file's contents match the exact sample rows unmodified
        const isDefaultTemplate = data.length === 3 && 
          data[0]?.participant_identity === 'Rahul Sharma' && 
          data[1]?.Jane_Smith === 'Jane Smith' || // accommodate standard JSON headers parsing variations
          (data[0]?.participant_identity === 'Rahul Sharma' && data[1]?.participant_identity === 'Jane Smith' && data[2]?.participant_identity === 'Amit Patel');

        if (isDefaultTemplate) {
          setShowSampleWarning(true);
          setPreviewData([]);
          toast.error('Default sample contents detected. Please prepare your own customized contact list.', {
            duration: 6000,
            icon: '⚠️'
          });
          e.target.value = '';
          return;
        }

        setPreviewData(data);
        toast.success(`Loaded ${data.length} contacts from ${file.name.split('.').pop()?.toUpperCase()}`);
      } catch (err) {
        toast.error('Failed to parse file. Ensure it is valid CSV or Excel.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadCSV = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (previewData.length === 0) {
      toast.success("No data uploaded yet. Downloading a sample file to help you get started.", {
        duration: 4000,
        icon: 'ℹ️'
      });
      
      const headers = ['phone_number', 'participant_identity', 'use_agent_id', 'created_by', 'custom_first_line', 'custom_instruction'];
      const rows = [
        ['+917359043943', 'Rahul Sharma', '123', 'API', 'Hello Rahul, calling from ABC Corp regarding your inquiry.', 'Mention the Q2 offer and ask about budget timeline.'],
        ['+14155552671', 'Jane Smith', '123', 'API', 'Hi Jane, this is ABC Corp following up on your request.', 'Discuss the premium plan and check if she reviewed the brochure.'],
        ['+919876543210', 'Amit Patel', '123', 'API', 'Hello Amit, calling from ABC Corp about your recent inquiry.', 'Focus on Hindi if preferred. Mention discount valid till month end.']
      ];
      
      const escapeCSV = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "tabbly_contacts_sample.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      toast.success("Exporting staged campaign contacts to CSV.");
      
      const headers = Object.keys(previewData[0]);
      const rows = previewData.map(row => headers.map(h => row[h] || ''));
      
      const escapeCSV = (val: any) => {
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "tabbly_contacts_staged.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agent_id) return toast.error('Please select an agent');
    if (previewData.length === 0) return toast.error('Please upload a contact list');

    try {
      setSubmitting(true);
      const response = await createCampaign({
        campaign_name: formData.campaign_name,
        agent_id: formData.agent_id,
        start_time: formData.start_time,
        end_time: formData.end_time,
        time_zone: formData.time_zone,
        custom_first_line: formData.custom_first_line,
        retries: formData.retries
      });

      console.log('Campaign Created:', response);
      toast.success('Campaign launched successfully!');
    } catch (error) {
      toast.error('Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const timeZones = [
    "IST", "UTC", "GMT", "EST", "PST", "CST", "MST", "AST", "PKT", "BST",
    "ICT", "JST", "KST", "AEST", "ACST", "AWST", "NZST"
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-surface-foreground mb-2">Campaign Center</h1>
        <p className="text-textMuted text-[16px]">Launch and manage automated voice outreach at scale.</p>
      </div>

      {/* NEW Topmost Launch Summary Section */}
      <div className="bg-surface rounded-[24px] p-6 border border-border shadow-md mb-10 flex flex-col md:flex-row items-center gap-6 justify-between animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex flex-wrap gap-8">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.campaign_name ? 'bg-success/10 text-success' : 'bg-muted text-textMuted opacity-50'}`}>
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-textMuted font-medium uppercase tracking-wider">Campaign</p>
              <p className="text-[15px] font-bold">{formData.campaign_name || <span className="text-error font-normal italic">Missing name</span>}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-l border-border pl-8">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${previewData.length > 0 ? 'bg-success/10 text-success' : 'bg-muted text-textMuted opacity-50'}`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-textMuted font-medium uppercase tracking-wider">Audience</p>
              <p className="text-[15px] font-bold">{previewData.length > 0 ? `${previewData.length} contacts staged` : <span className="text-error font-normal italic">0 contacts staged</span>}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-l border-border pl-8">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.agent_id ? 'bg-success/10 text-success' : 'bg-muted text-textMuted opacity-50'}`}>
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[12px] text-textMuted font-medium uppercase tracking-wider">Agent</p>
              <p className="text-[15px] font-bold md:max-w-[150px] truncate">{agents.find((a: Agent) => a.id === formData.agent_id)?.name || <span className="text-error font-normal italic">None selected</span>}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`
            px-10 py-4 rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 transition-all min-w-[200px]
            ${submitting 
              ? 'bg-primary/50 cursor-not-allowed' 
              : 'bg-primary text-primary-foreground hover:bg-primary-hover hover:scale-[1.05] active:scale-[0.98] shadow-lg shadow-primary/20'}
          `}
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <>
              Launch Campaign
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Section 1: Campaign Details */}
        <div className="bg-surface rounded-[24px] p-8 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold">1</div>
            <h2 className="text-[18px] font-bold text-surface-foreground">Primary Details</h2>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-surface-foreground">Campaign Name</label>
              <input
                type="text"
                required
                placeholder="Ex: October Sales Outreach"
                className="w-full h-14 px-5 rounded-2xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-lg"
                value={formData.campaign_name}
                onChange={(e) => setFormData({...formData, campaign_name: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[14px] font-bold text-surface-foreground">Select Voice Agent</label>
              <select
                required
                className="w-full h-14 px-5 rounded-2xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none bg-surface transition-all appearance-none cursor-pointer text-lg"
                value={formData.agent_id}
                onChange={(e) => setFormData({...formData, agent_id: e.target.value})}
              >
                <option value="">Select an Agent...</option>
                {agents.map((a: Agent) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Prompt & Script Section */}
        <div className="bg-surface rounded-[24px] p-8 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold">2</div>
            <h2 className="text-[18px] font-bold text-surface-foreground">Agent Script & Prompt</h2>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-surface-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Custom First Line
              </label>
              <input
                type="text"
                placeholder="Hey, am I speaking with {name}?"
                className="w-full h-14 px-5 rounded-2xl border border-border focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                value={formData.custom_first_line}
                onChange={(e) => setFormData({...formData, custom_first_line: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[14px] font-bold text-surface-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                System Prompt (Structure)
              </label>
              <textarea
                placeholder="Define how the agent should behave..."
                className="w-full h-24 p-5 rounded-2xl border border-border bg-muted/30 outline-none focus:ring-4 focus:ring-primary/5 resize-none text-[14px] font-mono leading-relaxed"
                value={formData.prompt_text}
                onChange={(e) => setFormData({...formData, prompt_text: e.target.value})}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Contact List (FULL WIDTH-ish) */}
        <div className="lg:col-span-2 bg-surface rounded-[24px] p-8 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold">3</div>
              <h2 className="text-[18px] font-bold text-surface-foreground">Audience & Contact List</h2>
            </div>
            <button 
              onClick={handleDownloadCSV}
              className="text-primary text-[14px] hover:underline flex items-center gap-2 font-bold px-4 py-2 bg-primary/5 rounded-lg border border-transparent hover:border-primary/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download CSV Template
            </button>
          </div>

          {showSampleWarning && (
            <div className="mb-6 p-5 bg-error/5 border border-error/25 rounded-2xl flex gap-3 text-error animate-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-[13px] uppercase tracking-wide leading-none">Safeguard Validation Blocked</h5>
                <p className="text-[12px] mt-1.5 leading-relaxed">
                  You are attempting to upload the default sample template file (<strong>tabbly_contacts_sample.csv</strong>). 
                  This file is only a formatting reference to show you what data structures are required. Please prepare and upload your own customized contact list instead before launching the campaign.
                </p>
              </div>
            </div>
          )}

          <div className={`
            border-3 border-dashed rounded-[32px] p-12 flex flex-col items-center gap-6 transition-all
            ${previewData.length > 0 ? 'border-success/30 bg-success/5' : 'border-border hover:border-primary/40 hover:bg-surface/50'}
          `}>
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${previewData.length > 0 ? 'bg-success text-white' : 'bg-surface text-textMuted'}`}>
              {previewData.length > 0 ? <CheckCircle2 className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
            </div>
            <div className="text-center">
              <p className="font-bold text-xl mb-1 text-surface-foreground">Upload Contacts</p>
              <p className="text-textMuted text-[15px]">Select a <span className="font-bold text-surface-foreground">.CSV</span> or <span className="font-bold text-surface-foreground">.XLSX</span> file to begin.</p>
            </div>
            
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
              id="campaign-upload"
            />
            <label
              htmlFor="campaign-upload"
              className="px-10 py-4 bg-surface text-surface-foreground border-2 border-border rounded-xl hover:border-primary hover:text-primary transition-all cursor-pointer font-bold text-[15px] shadow-sm active:scale-95"
            >
              {previewData.length > 0 ? 'Replace file' : 'Browse Files'}
            </label>
          </div>

          {previewData.length > 0 && (
            <div className="mt-10 animate-in zoom-in-95 duration-300">
               <div className="flex items-center justify-between mb-4 px-2">
                 <h4 className="font-bold flex items-center gap-2">
                   Contact Preview
                   <span className="px-3 py-1 bg-primary/10 text-primary text-[11px] rounded-full uppercase tracking-tighter">Verified</span>
                 </h4>
                 <button onClick={() => setPreviewData([])} className="text-[13px] text-error font-medium hover:underline">Remove data</button>
               </div>
               <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left text-[14px]">
                      <thead className="bg-surface sticky top-0">
                        <tr>
                          {Object.keys(previewData[0]).map(key => (
                            <th key={key} className="px-6 py-4 font-bold border-b border-border text-textMuted uppercase text-[11px] tracking-widest">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewData.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-surface/30 transition-colors">
                            {Object.values(row).map((val: any, j: number) => (
                              <td key={j} className="px-6 py-4 text-textPrimary">{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewData.length > 10 && (
                     <div className="p-4 bg-surface/50 text-center border-t border-border">
                       <p className="text-[13px] text-textMuted font-medium italic">Viewing first 10 rows. Total contacts: {previewData.length}</p>
                     </div>
                  )}
               </div>
            </div>
          )}
        </div>

        {/* Section 4: Settings & Schedule */}
        <div className="lg:col-span-2 bg-surface rounded-[24px] p-8 border border-border shadow-sm">
           <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold">4</div>
              <h2 className="text-[18px] font-bold text-surface-foreground">Execution Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
               <div className="space-y-3">
                  <label className="text-[14px] font-bold text-surface-foreground">Recall / Retries</label>
                  <select
                    className="w-full h-14 px-5 rounded-2xl border border-border outline-none font-bold focus:ring-4 focus:ring-primary/5 appearance-none bg-surface"
                    value={formData.retries}
                    onChange={(e) => setFormData({...formData, retries: e.target.value})}
                  >
                    <option value="0">Zero Retries</option>
                    <option value="1">1 Automatic Retry</option>
                    <option value="2">2 Automatic Retries</option>
                    <option value="3">3 Automatic Retries</option>
                  </select>
                  <p className="text-[11px] text-textMuted leading-relaxed">System will retry failed/busy calls automatically.</p>
               </div>

                <div className="space-y-3">
                  <label className="text-[14px] font-bold text-surface-foreground flex items-center gap-2">
                    Start Window <Clock className="w-4 h-4 text-primary" />
                  </label>
                  <input
                    type="time"
                    className="w-full h-14 px-5 rounded-2xl border border-border outline-none font-bold focus:ring-4 focus:ring-primary/5"
                    value={formData.start_time}
                    onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                  />
               </div>

                <div className="space-y-3">
                  <label className="text-[14px] font-bold text-surface-foreground flex items-center gap-2">
                    End Window <Clock className="w-4 h-4 text-primary" />
                  </label>
                  <input
                    type="time"
                    className="w-full h-14 px-5 rounded-2xl border border-border outline-none font-bold focus:ring-4 focus:ring-primary/5"
                    value={formData.end_time}
                    onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                  />
               </div>

                <div className="md:col-span-3 space-y-3">
                  <label className="text-[14px] font-bold text-surface-foreground">Execution Time Zone</label>
                  <select
                    className="w-full h-14 px-5 rounded-2xl border border-border outline-none font-bold focus:ring-4 focus:ring-primary/5 appearance-none bg-surface cursor-pointer transition-all"
                    value={formData.time_zone}
                    onChange={(e) => setFormData({...formData, time_zone: e.target.value})}
                  >
                    {timeZones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  <p className="text-[11px] text-textMuted leading-relaxed">System will use this time zone to calculate your start/end windows.</p>
               </div>
            </div>
        </div>
      </div>

      {/* Warning Footer */}
      <div className="mt-8 flex items-center justify-center gap-3 p-6 bg-primary/5 rounded-[24px] border border-primary/10 max-w-2xl mx-auto">
         <AlertCircle className="w-6 h-6 text-primary shrink-0" />
          <p className="text-[14px] text-textMuted font-medium text-center">
            Ready to go? Double check your <span className="font-bold text-surface-foreground">Start/End windows</span> and <span className="font-bold text-surface-foreground">Time Zone</span> before clicking Launch.
          </p>
      </div>
    </div>
  );
};

export default Campaigns;
