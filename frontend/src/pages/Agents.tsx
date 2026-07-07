import { useState, useEffect } from 'react';
import { useAgentStore } from '../store/agentStore';
import type { Agent } from '../api/client';
import AgentCard from '../components/AgentCard';
import CreateAgentModal from '../components/CreateAgentModal';
import EditAgentModal from '../components/EditAgentModal';
import TriggerCallModal from '../components/TriggerCallModal';
import ConnectCalModal from '../components/ConnectCalModal';
import { Plus, Sparkles, ArrowRight } from 'lucide-react';

const Agents = () => {
  const { agents, fetchAgents, loading } = useAgentStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAgentForEdit, setSelectedAgentForEdit] = useState<Agent | null>(null);
  const [selectedAgentForCall, setSelectedAgentForCall] = useState<Agent | null>(null);
  const [pendingCalConnectionAgent, setPendingCalConnectionAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const allAgents = agents; // Only use actual agents from store

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-surface-foreground tracking-tight">Agents</h1>
          <p className="text-textMuted mt-1">Manage your team of AI voice agents. Click any card to manage.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create an Agent
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {loading && agents.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-60">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-muted border border-border rounded-[12px] animate-pulse" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-in zoom-in-95 duration-700">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8 relative">
              <Sparkles className="w-12 h-12 text-primary animate-pulse" />
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping opacity-25" />
            </div>
            
            <div className="max-w-md bg-surface p-10 rounded-[32px] border border-border/80 shadow-2xl relative">
              <div className="absolute -top-4 -right-4 bg-primary text-white p-2 rounded-xl shadow-lg rotate-12">
                <ArrowRight className="w-5 h-5 -rotate-45" />
              </div>
              
              <h2 className="text-[24px] font-bold text-surface-foreground mb-3">Welcome to convexa.ai!</h2>
              <p className="text-textMuted text-[15px] leading-relaxed mb-8">
                Ready to transform your business communications? <br/>
                <span className="text-surface-foreground font-bold">Build your first AI agent</span> in seconds and start making intelligent voice calls.
              </p>
              
              <button
                onClick={() => setIsCreateOpen(true)}
                className="w-full bg-primary text-primary-foreground py-4 rounded-2xl text-[16px] font-bold hover:bg-primary-hover transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group"
              >
                Click to Create Your First Agent
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {allAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => setSelectedAgentForEdit(agent)}
                onTriggerCall={() => setSelectedAgentForCall(agent)}
              />
            ))}
          </div>
        )}
      </div>

      {isCreateOpen && (
        <CreateAgentModal onClose={(createdAgent) => {
          setIsCreateOpen(false);
          if (createdAgent?.meeting_enabled) {
            setPendingCalConnectionAgent(createdAgent);
          }
        }} />
      )}

      {pendingCalConnectionAgent && (
        <ConnectCalModal
          agent={pendingCalConnectionAgent}
          onClose={() => setPendingCalConnectionAgent(null)}
          onSuccess={() => fetchAgents()}
        />
      )}

      {selectedAgentForEdit && (
        <EditAgentModal
          agent={selectedAgentForEdit}
          onClose={() => {
            setSelectedAgentForEdit(null);
            fetchAgents(); // Refresh so next Edit open gets fresh cal_connected from DB
          }}
        />
      )}

      {selectedAgentForCall && (
        <TriggerCallModal
          agent={selectedAgentForCall}
          onClose={() => setSelectedAgentForCall(null)}
        />
      )}
    </div>
  );
};

export default Agents;
