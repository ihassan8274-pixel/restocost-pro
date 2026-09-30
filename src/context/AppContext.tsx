// طبقة توافق: AppContext القديم (3700+ سطر) حُوصِر فعلياً — كل الحالة الآن في
// stores/hooks (Zustand) عبر useAppCompat. يُبقى هذا الشلّ المُصدَّر للأنواع
// التاريخية المعتمدة في 154 مكوّناً (useApp, RecentDoc, SystemCheckResult,
// SystemRebuildResult) دون مزوّد سياق — الـ useApp الجديد لا يحتاج Context.
export interface SystemCheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface DataHealthPart {
  label: string;
  pct: number;
  detail: string;
}

export interface DataHealthScore {
  score: number;
  grade: 'excellent' | 'good' | 'attention';
  parts: DataHealthPart[];
}

export interface SystemRebuildResult {
  fixes: string[];
  recalcs: string[];
  issues: string[];
}

export type RecentDoc = { id: string; type: string; title: string; tab: string; at: number };

export { useApp, AppProvider } from '../stores/hooks/useAppCompat';