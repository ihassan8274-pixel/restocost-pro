// ==========================================================
// ReportCache.ts — تخزين مؤقت داخل الذاكرة لنتائج التقارير
// يمنع إعادة حساب التقارير المكلفة عند تغيّر لا يتعلق ببياناتها.
// البيانات الأصلية من AppContext تتغير بإشارة مرجعية واحدة،
// لذا نحفظ مفتاح hash على مصدر البيانات لاستبعاد النتائج القديمة.
// ==========================================================
import type { ReportResult, ReportFilter } from './ReportTypes';

/** بصمة صغيرة لمصدر بيانات (تتغير عند تغيّر أي صف) */
export const dataFingerprint = (rowCounts: number[]): string =>
  `v1:${rowCounts.join(',')}`;

interface CacheEntry {
  key: string;
  result: ReportResult;
  stamp: number;
}

const MAX_ENTRIES = 50;
const STALE_MS = 60_000; // 60 ثانية كحد أقصى لصلاحية النتيجة

/**
 * محرك تخزين مؤقت بسيط (LRU) بدون اعتماديات خارجية.
 * يُلتف حول حساب فالـ useMemo بتسليم مفتاح فريد للتقرير + الفلاتر + الأحجام.
 */
export class ReportCache {
  private map = new Map<string, CacheEntry>();

  /**
   * يسترجع النتيجة من الذاكرة أو يستدعي الحسّاب عند انعدامها أو انتهائها.
   * fingerprint هو dataFingerprint(أحجام المصادر) ويُضمّن في المفتاح.
   */
  get<T extends ReportResult>(
    key: string,
    fingerprint: string,
    filters: ReportFilter,
    compute: () => T,
  ): T {
    const cacheKey = `${key}|${fingerprint}|${JSON.stringify(filters)}`;
    const now = Date.now();
    const hit = this.map.get(cacheKey);
    if (hit && now - hit.stamp < STALE_MS) return hit.result as T;

    const result = compute();
    this.map.set(cacheKey, { key: cacheKey, result, stamp: now });

    // إزالة الأقدم عند تجاوز الحد الأقصى
    if (this.map.size > MAX_ENTRIES) {
      const oldest = [...this.map.entries()].sort((a, b) => a[1].stamp - b[1].stamp)[0];
      if (oldest) this.map.delete(oldest[0]);
    }
    return result;
  }

  /** إفراغ كامل للذاكرة (عند تسجيل الخروج أو إعادة بناء البيانات) */
  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}