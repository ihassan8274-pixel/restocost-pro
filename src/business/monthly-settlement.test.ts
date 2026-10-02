import { describe, it, expect } from 'vitest';
import { buildMonthlySettlement, describeSettlementEntry } from './monthly-settlement';

// الإقفال كان يضع status:'closed' فقط — لا يمسّ المخزون ولا يقيّد. نص الشاشة
// يعد بـ"يُحوَّل الفرق إلى المخزون مع قيد محاسبي". هذه الوحدة تحسب ما يجب
// تطبيقه فعلاً.

const item = (o: Partial<{ rawMaterialId: string; theoreticalQty: number; countedQty: number; unitCost: number }> = {}) => ({
  rawMaterialId: o.rawMaterialId || 'm1',
  itemName: 'سكر',
  unit: 'كغم',
  theoreticalQty: o.theoreticalQty ?? 100,
  countedQty: o.countedQty ?? 100,
  unitCost: o.unitCost ?? 5,
});

describe('buildMonthlySettlement', () => {
  it('لا فرق ⇒ لا خطوط ولا حركات ولا قيد', () => {
    const p = buildMonthlySettlement([item()]);
    expect(p.hasVariance).toBe(false);
    expect(p.lines).toEqual([]);
    expect(describeSettlementEntry(p, 'سبتمبر 2026')).toBeNull();
  });

  it('عجز (المعدود أقل): delta سالب، يُقيَّد كاستهلاك', () => {
    const p = buildMonthlySettlement([item({ theoreticalQty: 100, countedQty: 80, unitCost: 5 })]);
    expect(p.hasVariance).toBe(true);
    expect(p.shortages).toHaveLength(1);
    expect(p.surpluses).toHaveLength(0);
    expect(p.lines[0].delta).toBe(-20);
    expect(p.lines[0].kind).toBe('shortage');
    expect(p.totalShortageValue).toBe(-100);   // 20 × 5
    expect(p.netVarianceValue).toBe(-100);
  });

  it('فائض (المعدود أكبر): delta موجب', () => {
    const p = buildMonthlySettlement([item({ theoreticalQty: 100, countedQty: 130, unitCost: 4 })]);
    expect(p.surpluses).toHaveLength(1);
    expect(p.lines[0].delta).toBe(30);
    expect(p.totalSurplusValue).toBe(120);
  });

  it('يخلط عجز وفائض ويجمع الصافي', () => {
    const p = buildMonthlySettlement([
      item({ rawMaterialId: 'a', theoreticalQty: 100, countedQty: 90, unitCost: 10 }),   // -100
      item({ rawMaterialId: 'b', theoreticalQty: 50, countedQty: 60, unitCost: 5 }),     // +50
      item({ rawMaterialId: 'c', theoreticalQty: 20, countedQty: 20, unitCost: 99 }),    // مطابق
    ]);
    expect(p.lines).toHaveLength(2);          // المطابق مستثنى
    expect(p.shortages).toHaveLength(1);
    expect(p.surpluses).toHaveLength(1);
    expect(p.netVarianceValue).toBe(-50);
  });

  it('فارق ضئيل يُتجاهل (حد 0.0001)', () => {
    const p = buildMonthlySettlement([item({ theoreticalQty: 100, countedQty: 100.00001 })]);
    expect(p.hasVariance).toBe(false);
  });

  it('تكلفة صفر ⇒ فرق بلا قيمة محاسبية لكن الحركة تبقى', () => {
    const p = buildMonthlySettlement([item({ theoreticalQty: 10, countedQty: 5, unitCost: 0 })]);
    expect(p.hasVariance).toBe(true);
    expect(p.shortages).toHaveLength(1);
    expect(p.totalShortageValue).toBe(0);
  });

  it('قيم غير رقمية تُعامَل كصفر ولا تكسر', () => {
    const p = buildMonthlySettlement([
      { rawMaterialId: 'x', itemName: 'صنف', unit: '', theoreticalQty: NaN, countedQty: 10, unitCost: undefined as unknown as number },
    ]);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].delta).toBe(10);
    expect(p.lines[0].varianceCost).toBe(0);
  });

  it('الوصف يذكر العدد والقيمة لكل نوع', () => {
    const p = buildMonthlySettlement([
      item({ rawMaterialId: 'a', theoreticalQty: 100, countedQty: 90, unitCost: 10 }),
      item({ rawMaterialId: 'b', theoreticalQty: 50, countedQty: 60, unitCost: 5 }),
    ]);
    const desc = describeSettlementEntry(p, 'سبتمبر 2026');
    expect(desc).toContain('سبتمبر 2026');
    expect(desc).toContain('عجز مخزون بقيمة 100.00');
    expect(desc).toContain('فائض مخزون بقيمة 50.00');
    expect(desc).toContain('-50.00');
  });
});