import { usePreferencesStore } from '@stores/preferencesStore';
import { useAISettingsStore } from '@stores/aiSettingsStore';

export const usePreferencesContext = () => {
  const prefs = usePreferencesStore();
  const ai = useAISettingsStore();

  return {
    theme: prefs.theme,
    toggleTheme: prefs.toggleTheme,
    numerals: prefs.numerals,
    setNumerals: prefs.setNumerals,
    decimals: prefs.decimals,
    setDecimals: prefs.setDecimals,
    density: prefs.density,
    setDensity: prefs.setDensity,
    hijriMode: prefs.hijriMode,
    setHijriMode: prefs.setHijriMode,
    preferences: prefs.preferences,
    setPreference: prefs.setPreference,
    logo: prefs.logo,
    setLogo: prefs.setLogo,
    aiSettings: ai.aiSettings,
    updateAISettings: ai.updateAISettings,
    aiModels: ai.aiModels,
    activeAIModelId: ai.activeAIModelId,
    addAIModel: ai.addAIModel,
    updateAIModel: ai.updateAIModel,
    deleteAIModel: ai.deleteAIModel,
    setActiveAIModel: ai.setActiveAIModel,
  };
};