import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIModelConfig } from '../utils/ai';

interface AISettingsState {
  aiModels: AIModelConfig[];
  activeAIModelId: string;
  addAIModel: (m: AIModelConfig) => void;
  updateAIModel: (id: string, m: Partial<AIModelConfig>) => void;
  deleteAIModel: (id: string) => void;
  setActiveAIModel: (id: string) => void;
  aiSettings: {
    items: AIModelConfig[];
    activeId: string;
  };
  updateAISettings: (v: { items: AIModelConfig[]; activeId: string }) => void;
}

export const useAISettingsStore = create<AISettingsState>()(
  persist(
    (set) => ({
      aiModels: [],
      activeAIModelId: '',
      addAIModel: (m) => set((state) => ({ aiModels: [...state.aiModels, m] })),
      updateAIModel: (id, m) => set((state) => ({ aiModels: state.aiModels.map((x) => (x.id === id ? { ...x, ...m } : x)) })),
      deleteAIModel: (id) => set((state) => ({ aiModels: state.aiModels.filter((x) => x.id !== id) })),
      setActiveAIModel: (id) => set({ activeAIModelId: id }),
      aiSettings: { items: [], activeId: '' },
      updateAISettings: (v) => set({ aiSettings: v }),
    }),
    { name: 'rcerp_ai_settings' }
  )
);