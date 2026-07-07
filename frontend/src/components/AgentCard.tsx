import type { Agent } from '../api/client';
import { Headphones, Megaphone, Bot, Sparkles } from 'lucide-react';

interface AgentCardProps {
  agent: Agent;
  onEdit: () => void;
  onTriggerCall: () => void;
}

const AgentCard = ({ agent, onEdit, onTriggerCall }: AgentCardProps) => {
  const isCustom = !agent.category;

  const getIcon = () => {
    if (agent.category === 'customer_care') return <Headphones className="w-5 h-5 text-primary" />;
    if (agent.category === 'growth') return <Megaphone className="w-5 h-5 text-primary" />;
    return <Bot className="w-5 h-5 text-primary" />;
  };

  const getBadge = () => {
    if (agent.category === 'customer_care') return 'CUSTOMER CARE';
    if (agent.category === 'growth') return 'GROWTH';
    return 'CUSTOM AGENT';
  };

  return (
    <div className="group bg-surface rounded-[12px] border border-border pb-6 flex flex-col flex-shrink-0 transition-all hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 cursor-pointer h-full min-h-[220px] overflow-hidden">
      <div className="p-6 pb-0 flex-1 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary text-secondary-foreground text-[10px] font-bold tracking-widest leading-none">
          {isCustom && <Sparkles className="w-3 h-3" />}
          {getBadge()}
        </span>
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
          {getIcon()}
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-[18px] font-bold text-surface-foreground mb-1 leading-tight group-hover:text-primary transition-colors">{agent.name}</h3>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md mb-3">
          📞 {agent.phone_number || "+91 80357 36739"}
        </span>
        <p className="text-[14px] text-textMuted line-clamp-2">
          {agent.prompt.split('\n')[0]}
        </p>
      </div>
      </div>

      <div className="px-6 mt-6 flex items-center gap-3 pt-4 border-t border-border/50">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="btn-outline flex-1 text-[13px] py-2 h-10"
        >
          Edit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onTriggerCall(); }}
          className="btn-primary flex-1 text-[13px] py-2 h-10 shadow-lg shadow-primary/20"
        >
          Trigger Call
        </button>
      </div>
    </div>
  );
};

export default AgentCard;
