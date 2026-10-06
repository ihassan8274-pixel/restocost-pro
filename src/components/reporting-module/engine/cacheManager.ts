// ============================================================
// مدير التخزين المؤقت (Cache Manager)
// يبني ملخصات الفترات في الخلفية عند تغيير البيانات
// ============================================================

import type { PeriodRange, AggregatedRow } from '../types';
import { getSyncState, invalidateCache as invalidateApiCache } from '../data/apiClient';

interface SummaryKey {
  reportId: string;
  period: string; // YYYY-MM
  branchId: string;
}

interface PeriodSummary {
  key: SummaryKey;
  data: AggregatedRow;
  builtAt: number;
  rev: number;
}

const summaryCache = new Map<string, PeriodSummary>();
const BUILD_QUEUE: Array<{ reportId: string; period: PeriodRange; branchId?: string }> = [];
let isBuilding = false;

// مفتاح التخزين
function summaryKey(reportId: string, period: string, branchId: string): string {
  return `${reportId}:${period}:${branchId}`;
}

// بناء ملخص لفترة وفرع محدد
async function buildSummary(reportId: string, period: PeriodRange, branchId: string, rev: number): Promise<void> {
  const key = summaryKey(reportId, period.from.slice(0, 7), branchId);
  
  // التحقق مما إذا كان موجوداً وصالحاً
  const existing = summaryCache.get(key);
  if (existing && existing.rev === rev) return;
  
  // هنا كان سيستدعي computeReport لكن بمجموعات مختصرة
  // للتبسيط نمرر - في الإنتاج يُستدعى المحرك الحقيقي
  console.log(`[Cache] Building summary for ${key} at rev ${rev}`);
  
  summaryCache.set(key, {
    key: { reportId, period: period.from.slice(0, 7), branchId },
    data: {} as AggregatedRow, // placeholder
    builtAt: Date.now(),
    rev,
  });
}

// معالجة طابور البناء
async function processBuildQueue(): Promise<void> {
  if (isBuilding || BUILD_QUEUE.length === 0) return;
  
  isBuilding = true;
  
  try {
    const state = await getSyncState();
    const rev = state.rev;
    
    while (BUILD_QUEUE.length > 0) {
      const job = BUILD_QUEUE.shift()!;
      await buildSummary(job.reportId, job.period, job.branchId || 'all', rev);
    }
  } catch (error: unknown) {
    console.error('[Cache] Build queue error:', error);
  } finally {
    isBuilding = false;
  }
}

// جدولة بناء عند تغيير البيانات
export function scheduleRebuild(reportId: string, period: PeriodRange, branchId?: string): void {
  BUILD_QUEUE.push({ reportId, period, branchId });
  // معالجة غير متزامنة
  setTimeout(processBuildQueue, 100);
}

// جدولة إعادة بناء شاملة (عند تغيير جوهري)
export function scheduleFullRebuild(reportIds: string[]): void {
  const periods = ['this-month', 'last-month', 'this-quarter', 'last-quarter', 'this-year'];
  const branches = ['all']; // في الإنتاج: قائمة الفروع الفعلية
  
  for (const reportId of reportIds) {
    for (const preset of periods) {
      // فترة افتراضية للبناء المسبق
      const period: PeriodRange = { from: '', to: '', preset: preset as any };
      for (const branchId of branches) {
        BUILD_QUEUE.push({ reportId, period, branchId });
      }
    }
  }
  setTimeout(processBuildQueue, 100);
}

// الحصول على ملخص جاهز
export function getSummary(reportId: string, period: string, branchId: string): PeriodSummary | null {
  return summaryCache.get(summaryKey(reportId, period, branchId)) || null;
}

// التحقق من صلاحية الكاش
export function isSummaryValid(reportId: string, period: string, branchId: string, currentRev: number): boolean {
  const summary = summaryCache.get(summaryKey(reportId, period, branchId));
  return !!summary && summary.rev === currentRev;
}

// إحصائيات الكاش
export function getCacheStats(): { 
  entries: number; 
  oldestBuild: number | null; 
  newestBuild: number | null;
  queueLength: number;
} {
  const builds = Array.from(summaryCache.values()).map(s => s.builtAt);
  return {
    entries: summaryCache.size,
    oldestBuild: builds.length ? Math.min(...builds) : null,
    newestBuild: builds.length ? Math.max(...builds) : null,
    queueLength: BUILD_QUEUE.length,
  };
}

// مسح الكاش
export function clearCache(reportId?: string): void {
  if (reportId) {
    for (const key of summaryCache.keys()) {
      if (key.startsWith(`${reportId}:`)) summaryCache.delete(key);
    }
  } else {
    summaryCache.clear();
  }
  invalidateApiCache();
}

// تصدير للكشف
export { summaryCache, BUILD_QUEUE };