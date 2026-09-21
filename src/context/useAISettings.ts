// AI model settings state cluster extracted from the monolithic AppContext:
// multiple per-provider model configs + one active model, mirrored to
// localStorage for the rest of the app (utils/ai works off these keys).
// API keys are NEVER stored on the device — server-side only.
import { useEffect, useState } from 'react';
import type { AIModelConfig } from '../utils/ai';

export interface AISettings {
  items: AIModelConfig[];
  activeId: string;
}

export const useAISettings = () => {
  const [aiSettings, setAISettings] = useState<AISettings>(() => {
    try {
      const raw = localStorage.getItem('rcerp_ai_models');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.some((m: unknown) => m && typeof m === 'object' && (m as Record<string, unknown>).id)) {
          const items = arr as AIModelConfig[];
          const activeId = localStorage.getItem('rcerp_ai_active_model') || items[0].id;
          return { items, activeId: items.some((x) => x.id === activeId) ? activeId : items[0].id };
        }
      }
    } catch { /* تجاهل */ }
    const legacy: AIModelConfig = {
      id: 'ai-default',
      name: 'النموذج الافتراضي',
      provider: (localStorage.getItem('rcerp_ai_provider') as AIModelConfig['provider']) || 'local',
      apiKey: '',
      hasKey: !!localStorage.getItem('rcerp_ai_key'),
      baseURL: localStorage.getItem('rcerp_ai_baseurl') || '',
      model: localStorage.getItem('rcerp_ai_model') || '',
      enabled: localStorage.getItem('rcerp_ai_enabled') !== 'false',
    };
    return { items: [legacy], activeId: legacy.id };
  });
  const aiModels = aiSettings.items;
  const activeAIModelId = aiSettings.activeId;

  useEffect(() => {
    try {
      localStorage.setItem('rcerp_ai_models', JSON.stringify(aiSettings.items.map((m) => ({ ...m, apiKey: m.apiKey || '' }))));
    } catch { /* ignore */ }
    localStorage.setItem('rcerp_ai_active_model', aiSettings.activeId);
    const active = aiSettings.items.find((x) => x.id === aiSettings.activeId) || aiSettings.items[0];
    if (active) {
      localStorage.setItem('rcerp_ai_provider', active.provider);
      localStorage.setItem('rcerp_ai_enabled', String(active.enabled));
      localStorage.removeItem('rcerp_ai_key');
      if (active.baseURL) localStorage.setItem('rcerp_ai_baseurl', active.baseURL);
      else localStorage.removeItem('rcerp_ai_baseurl');
      if (active.model) localStorage.setItem('rcerp_ai_model', active.model);
      else localStorage.removeItem('rcerp_ai_model');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSettings]);

  const addAIModel = (cfg: Partial<AIModelConfig>): string => {
    const id = `ai-${Date.now()}`;
    const item: AIModelConfig = {
      id,
      name: cfg.name?.trim() || 'نموذج',
      provider: cfg.provider || 'local',
      apiKey: cfg.apiKey || '',
      baseURL: cfg.baseURL || undefined,
      model: cfg.model || '',
      enabled: cfg.enabled !== false,
    };
    setAISettings((prev) => ({ items: [...prev.items, item], activeId: prev.activeId }));
    return id;
  };
  const updateAIModel = (cfg: Partial<AIModelConfig> & { id: string }) => {
    setAISettings((prev) => ({
      ...prev,
      items: prev.items.map((x) => (x.id === cfg.id ? { ...x, ...cfg } : x)),
    }));
  };
  const deleteAIModel = (id: string) => {
    setAISettings((prev) => {
      const items = prev.items.filter((x) => x.id !== id);
      if (items.length === 0) {
        const blank: AIModelConfig = { id: 'ai-default', name: 'النموذج الافتراضي', provider: 'local', apiKey: '', model: '', enabled: true };
        return { items: [blank], activeId: blank.id };
      }
      return { items, activeId: prev.activeId === id ? items[0].id : prev.activeId };
    });
  };
  const setActiveAIModel = (id: string) => setAISettings((prev) => ({ ...prev, activeId: id }));

  const updateAISettings = (patch: Partial<AIModelConfig>) => {
    setAISettings((prev) => {
      const active = prev.items.find((x) => x.id === prev.activeId) || prev.items[0];
      if (!active) return prev;
      return { ...prev, items: prev.items.map((x) => (x.id === active.id ? { ...x, ...patch } : x)) };
    });
  };

  return { aiSettings, setAISettings, aiModels, activeAIModelId, addAIModel, updateAIModel, deleteAIModel, setActiveAIModel, updateAISettings };
};