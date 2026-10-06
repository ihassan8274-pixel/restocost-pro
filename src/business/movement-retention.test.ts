import { describe, it, expect } from 'vitest';
// C6: سجلات الحركة كانت تنمو بلا حدّ على الخادم (3.2MB قبل تنظيف، و17000+ حركة).
// applyRetention يقصّ الأقدم دائماً ولا يمسّ حركة حديثة.

// نفس المنطق المستخدَم في server/routes/data.mjs (يُعاد هنا لأن الملف Sever-side
// غير قابل للاستيراد في اختبارات العميل).
const MOVEMENT_RETENTION = 5000;
const MOVEMENT_KEYS = new Set(['rcerp_inventory_movements', 'rcerp_audit']);

const applyRetention = (key, value) => {
  if (!MOVEMENT_KEYS.has(key) || !Array.isArray(value) || value.length <= MOVEMENT_RETENTION) return value;
  const dated = value.filter((r) => r && typeof r.date === 'string' && r.date.length >= 10);
  const undated = value.filter((r) => !(r && typeof r.date === 'string' && r.date.length >= 10));
  if (dated.length <= MOVEMENT_RETENTION) return value;
  dated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const kept = dated.slice(0, MOVEMENT_RETENTION);
  return [...kept, ...undated];
};

const mv = (i: number, date?: string) => ({ id: `mv-${i}`, ...(date ? { date } : {}), delta: -1 });

describe('applyRetention لسجلات الحركة', () => {
  it('لا يقصّ تحت السقف', () => {
    const arr = Array.from({ length: 100 }, (_, i) => mv(i, `2026-01-01`));
    expect(applyRetention('rcerp_inventory_movements', arr)).toHaveLength(100);
  });

  it('لا يمسّ مفاتيح غير الحركة', () => {
    const big = Array.from({ length: 6000 }, (_, i) => mv(i, '2026-01-01'));
    expect(applyRetention('rcerp_journal', big)).toHaveLength(6000);
  });

  it('يقصّ الأقدم ويحفظ الأحدث', () => {
    const arr = Array.from({ length: 5200 }, (_, i) => mv(i, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`));
    const out = applyRetention('rcerp_inventory_movements', arr);
    expect(out.length).toBeLessThanOrEqual(MOVEMENT_RETENTION);
    // كل الأحدث (التي لها أحدث تاريخ) ما زالت موجودة
    const latest = arr.filter((r) => r.date === '2026-01-28').map((r) => r.id);
    const outIds = new Set(out.map((r) => r.id));
    for (const id of latest) expect(outIds.has(id)).toBe(true);
  });

  it('يحفظ السجلات بلا تاريخ ولا يسقطها بصمت', () => {
    const dated = Array.from({ length: 5000 }, (_, i) => mv(i, `2026-01-01`));
    const undated = [mv(9001), mv(9002)];
    const out = applyRetention('rcerp_inventory_movements', [...dated, ...undated]);
    const ids = new Set(out.map((r) => r.id));
    expect(ids.has('mv-9001')).toBe(true);
    expect(ids.has('mv-9002')).toBe(true);
  });

  it('يطبَّق على audit أيضاً', () => {
    const arr = Array.from({ length: 5100 }, (_, i) => mv(i, `2026-02-0${(i % 9) + 1}`));
    expect(applyRetention('rcerp_audit', arr).length).toBeLessThanOrEqual(MOVEMENT_RETENTION);
  });
});