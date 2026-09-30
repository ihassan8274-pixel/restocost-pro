import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  numerals: 'en' | 'ar';
  setNumerals: (v: 'en' | 'ar') => void;
  decimals: number;
  setDecimals: (v: number) => void;
  density: 'comfortable' | 'compact';
  setDensity: (v: 'comfortable' | 'compact') => void;
  hijriMode: boolean;
  setHijriMode: (v: boolean) => void;
  preferences: Record<string, unknown>;
  setPreference: (key: string, value: unknown) => void;
  logo: string;
  setLogo: (v: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      numerals: 'en',
      setNumerals: (v) => set({ numerals: v }),
      decimals: 2,
      setDecimals: (v) => set({ decimals: v }),
      density: 'comfortable',
      setDensity: (v) => set({ density: v }),
      hijriMode: false,
      setHijriMode: (v) => set({ hijriMode: v }),
      preferences: {},
      setPreference: (key, value) => set((state) => ({ preferences: { ...state.preferences, [key]: value } })),
      logo: '',
      setLogo: (v) => set({ logo: v }),
    }),
    { name: 'rcerp_preferences' }
  )
);