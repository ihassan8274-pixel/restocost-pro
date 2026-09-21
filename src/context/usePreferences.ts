// Per-device UI preferences state cluster extracted from the monolithic
// AppContext: theme, numeral system, decimals, density, hijri calendar,
// generic preferences map, and the system logo (base64 data URL).
import { useEffect, useState } from 'react';
import { setNumeralSystem, setDefaultDecimals, setHijriMode, type NumeralSystem } from '../utils/helpers';

export const usePreferences = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('rcerp_theme') as 'light' | 'dark') || 'light');

  // ---- نظام الأرقام المعروضة (إنجليزية 123 / عربية ١٢٣) — تفضيل لكل جهاز ----
  const [numerals, setNumeralsState] = useState<NumeralSystem>(() => {
    const v = localStorage.getItem('rcerp_numerals') === 'ar' ? 'ar' : 'en';
    setNumeralSystem(v); // تطبيق فوري قبل أول رسم
    return v;
  });
  const setNumerals = (v: NumeralSystem) => {
    setNumeralsState(v);
    setNumeralSystem(v);
    localStorage.setItem('rcerp_numerals', v);
  };

  // ---- العلامات العشرية المعروضة في كل الشاشات — تفضيل لكل جهاز (0‑4) ----
  const [decimals, setDecimalsState] = useState<number>(() => {
    const v = Math.max(0, Math.min(4, Number(localStorage.getItem('rcerp_decimals')) || 2));
    setDefaultDecimals(v);
    return v;
  });
  const setDecimals = (v: number) => {
    const safe = Math.max(0, Math.min(4, Math.round(v)));
    setDecimalsState(safe);
    setDefaultDecimals(safe);
    localStorage.setItem('rcerp_decimals', String(safe));
  };

  // ---- وضع الكثافة (مريح/مضغوط) — بند 18 ----
  const [density, setDensityState] = useState<'comfortable' | 'compact'>(() => {
    const v = localStorage.getItem('rcerp_density');
    return v === 'compact' ? 'compact' : 'comfortable';
  });
  const setDensity = (v: 'comfortable' | 'compact') => {
    setDensityState(v);
    localStorage.setItem('rcerp_density', v);
    document.documentElement.classList.toggle('compact', v === 'compact');
  };

  // ---- التقويم الهجري في كل التواريخ — تفضيل لكل جهاز ----
  const [hijriModeState, setHijriModeState] = useState<boolean>(() => {
    const v = localStorage.getItem('rcerp_hijri') === '1';
    setHijriMode(v); // تطبيق فوري قبل أول رسم
    return v;
  });
  const setHijriModePref = (v: boolean) => {
    setHijriModeState(v);
    setHijriMode(v);
    localStorage.setItem('rcerp_hijri', v ? '1' : '0');
  };
  useEffect(() => {
    document.documentElement.classList.toggle('compact', density === 'compact');
  }, [density]);

  // ---- تفضيلات المستخدم العامة (أعمدة، فلاتر...) — بند 19 ----
  const [preferences, setPreferences] = useState<Record<string, unknown>>(() => {
    try { return JSON.parse(localStorage.getItem('rcerp_preferences') || '{}'); } catch { return {}; }
  });
  const setPreference = (key: string, value: unknown) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('rcerp_preferences', JSON.stringify(next)); } catch { /* تجاهل */ }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('rcerp_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // System logo (base64 data URL) — persisted to server + mirrored to localStorage
  // so the standalone print window can read it too.
  const [logo, setLogoState] = useState<string | null>(() => localStorage.getItem('rcerp_logo'));
  const setLogo = (value: string | null) => {
    setLogoState(value);
    if (value) localStorage.setItem('rcerp_logo', value);
    else localStorage.removeItem('rcerp_logo');
  };

  return {
    theme, toggleTheme,
    numerals, setNumerals,
    decimals, setDecimals,
    density, setDensity,
    hijriMode: hijriModeState, setHijriMode: setHijriModePref,
    preferences, setPreference,
    logo, setLogo, setLogoState,
  };
};