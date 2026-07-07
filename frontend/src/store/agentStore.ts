import { create } from 'zustand';
import { listAgents, type Agent } from '../api/client';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  fetchAgents: () => Promise<void>;
  addAgent: (agent: Agent) => void;
  updateAgent: (agent: Agent) => void;
  deleteAgent: (id: string) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  loading: false,
  fetchAgents: async () => {
    set({ loading: true });
    try {
      const data = await listAgents();
      set({ agents: data, loading: false });
    } catch (error) {
      console.error(error);
      set({ loading: false });
    }
  },
  addAgent: (agent: Agent) => set((state) => ({ agents: [...state.agents, agent] })),
  updateAgent: (updatedAgent: Agent) => set((state) => ({
    agents: state.agents.map((a) => (a.id === updatedAgent.id ? updatedAgent : a))
  })),
  deleteAgent: (id: string) => set((state) => ({
    agents: state.agents.filter((a) => a.id !== id)
  })),
}));
