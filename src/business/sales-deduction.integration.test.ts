import { describe, it, expect } from 'vitest';
import { applySaleDeduction } from './sales-deduction';
import type { RawMaterial, StandardRecipe } from '../types';

// ⭐ هذا الملف كان مستحيلاً: إعداد "خصم المبيعات من المخزون" مُعلن في
// financialStore ومقروء في شاشة الضبط، ولا يملك أي مستهلك. النتيجة أن واجهة
// "مخصوم المخزون" كاذبة تماماً. هذه تثبت أن المحرك يمرّر deltas سالبة إلى
// دفتر الحركات، وأن sign=+1 يعكسها بالضبط.

const mat = (id: string, over: Partial<RawMaterial> = {}): RawMaterial => ({
  id, code: id, nameAr: id, nameEn: '', category: 'dry_goods', unit: 'كغم',
  standardPrice: 10, minStockLevel: 0, yieldPercentage: 100, supplierId: '',
  storageType: 'dry', isActive: true, ...over,
} as RawMaterial);

const rec = (id: string, ingredients: StandardRecipe['ingredients']): StandardRecipe => ({
  id, code: id, nameAr: id, nameEn: '', category: 'main_dish', portionSize: '1',
  prepTimeMins: 0, ingredients, directLaborCost: 0, packagingCost: 0,
  totalCalculatedCost: 0, suggestedPrice: 0, actualMenuPrice: 0,
  isCentralKitchenPrep: false, isActive: true,
} as StandardRecipe);

const ctx = {
  recipes: [rec('r1', [{ rawMaterialId: 'm1', quantity: 0.25, wastagePercent: 0 }])],
  rawMaterials: [mat('m1'), mat('m2', { unit: 'زجاجة', tradeUomName: 'لتر', tradeUomConversion: 0.7 })],
};

const DEDUCT = 'خصم مبيعات';
const REVERSE = 'عكس خصم مبيعات';

/** دفتر حركة وهمي: نلتقط ما يُكتب بدل تعديل متجر حقيقي. */
const fakeLedger = () => {
  const calls: { rawMaterialId: string; delta: number }[] = [];
  const adjust = (_b: string, rawMaterialId: string, delta: number) => { calls.push({ rawMaterialId, delta }); };
  return { calls, adjust };
};

describe('applySaleDeduction — الربط بدفتر الحركات', () => {
  it('يكتب deltas سالبة على المواد عند البيع', () => {
    const { calls, adjust } = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, adjust,
      { ref: 'BS-001', enabled: true, type: DEDUCT });
    // 40 × 0.25 = 10 كجم بسالب
    expect(calls).toEqual([{ rawMaterialId: 'm1', delta: -10 }]);
  });

  it('العكس يكتب نفس المقدار موجباً (بلا انحراف)', () => {
    const fwd = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, fwd.adjust,
      { ref: 'BS-001', enabled: true, type: DEDUCT });
    const rev = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, rev.adjust,
      { ref: 'BS-001', enabled: true, sign: 1, type: REVERSE });
    expect(rev.calls[0].delta).toBe(-fwd.calls[0].delta);
    // الرصيد يعود إلى ما كان عليه بالضبط
    expect(rev.calls[0].delta + fwd.calls[0].delta).toBe(0);
  });

  it('ثلاث عمليات بيع متتالية = ثلاثة أضعاف، لا خصم مزدوج', () => {
    const { calls, adjust } = fakeLedger();
    for (const ref of ['a', 'b', 'c']) {
      applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 10 }], ctx, adjust,
        { ref, enabled: true, type: DEDUCT });
    }
    // 3 × 10 قطع × 0.25 = 7.5 كجم
    expect(calls.reduce((s, c) => s + c.delta, 0)).toBeCloseTo(-7.5, 6);
  });

  it('حركة الخصم تحمل نوعها ومرجعها في دفتر الحركات', () => {
    const seen: { type: string; ref?: string }[] = [];
    const adjust = (_b: string, _m: string, _d: number, _bi?: undefined, reason?: { type: string; ref?: string }) => {
      seen.push({ type: reason!.type, ref: reason!.ref });
    };
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 1 }], ctx, adjust,
      { ref: 'POS-77', enabled: true, type: DEDUCT });
    expect(seen[0]).toEqual({ type: DEDUCT, ref: 'POS-77' });
  });

  it('يرصد المواد التي تنزل تحت الصفر ويحذّر بدل ابتلاعها', () => {
    const calls: string[] = [];
    const adjust = (_b: string, rawMaterialId: string) => { calls.push(rawMaterialId); };
    // m1 رصيده 5، والخصم 10 ⇒ سالب
    const res = applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, adjust, {
      ref: 'BS-1', enabled: true, type: DEDUCT,
      balancesBefore: new Map([['m1', 5]]),
    });
    expect(res.negativeCount).toBe(1);
    expect(calls).toEqual(['m1']);   // الحركة كُتبت رغم السالب — لا قمع
  });

  it('رصيد كافٍ ⇒ لا تحذير', () => {
    const adjust = () => {};
    const res = applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, adjust, {
      ref: 'BS-1', enabled: true, type: DEDUCT,
      balancesBefore: new Map([['m1', 100]]),
    });
    expect(res.negativeCount).toBe(0);
  });

  it('وحدة التداول: 8.4 لتر = 12 زجاجة في المخزون', () => {
    const c = {
      recipes: [rec('r', [{ rawMaterialId: 'm2', quantity: 8.4, wastagePercent: 0 }])],
      rawMaterials: [mat('m2', { unit: 'زجاجة', tradeUomName: 'لتر', tradeUomConversion: 0.7 })],
    };
    const { calls, adjust } = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r', quantitySold: 1 }], c, adjust,
      { ref: 'x', enabled: true, type: DEDUCT });
    expect(calls[0]).toEqual({ rawMaterialId: 'm2', delta: -12 });
  });
});

// ─────────────────────────────────────────────────────────────
// ⭐ البوابة: المعطّل = لا خصم إطلاقاً، حتى لو مرّت عمليات بيع كثيرة
// ─────────────────────────────────────────────────────────────
describe('الإعداد معطّل = لا خصم إطلاقاً', () => {
  it('enabled:false ⇒ صفر حركة، والرصيد سليم', () => {
    const { calls, adjust } = fakeLedger();
    const res = applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, adjust,
      { ref: 'BS-1', enabled: false, type: DEDUCT });
    expect(res.applied).toBe(false);
    expect(res.plan.lines).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('المعطّل ثم المفعّل: الخصم يبدأ عند التفعيل فقط', () => {
    const off = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, off.adjust,
      { ref: 'BS-1', enabled: false, type: DEDUCT });
    expect(off.calls).toEqual([]);

    const on = fakeLedger();
    applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, on.adjust,
      { ref: 'BS-2', enabled: true, type: DEDUCT });
    expect(on.calls).toEqual([{ rawMaterialId: 'm1', delta: -10 }]);
  });

  it('العكس يتطلّب force — الإعداد المعطّل لا يعكس بدونه', () => {
    // ⭐ هذا هو الثغرة التي وُجدت: لو اكتفينا بـ enabled لكان حذف فاتورة بعد
    // تعطيل المفتاح لا يعيد شيئاً، فيبقى الخصم معلّقاً في المخزون للأبد.
    const noForce = fakeLedger();
    const r1 = applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, noForce.adjust,
      { ref: 'BS-1', enabled: false, sign: 1, type: REVERSE });
    expect(r1.applied).toBe(false);
    expect(noForce.calls).toEqual([]);

    const forced = fakeLedger();
    const r2 = applySaleDeduction('b1', [{ recipeId: 'r1', quantitySold: 40 }], ctx, forced.adjust,
      { ref: 'BS-1', enabled: false, sign: 1, type: REVERSE, force: true });
    expect(r2.applied).toBe(true);
    expect(forced.calls).toEqual([{ rawMaterialId: 'm1', delta: 10 }]);
  });

  it('branchId فارغ ⇒ لا حركة (حتى مع التفعيل)', () => {
    const { calls, adjust } = fakeLedger();
    const res = applySaleDeduction('', [{ recipeId: 'r1', quantitySold: 40 }], ctx, adjust,
      { ref: 'BS-1', enabled: true, type: DEDUCT });
    expect(res.applied).toBe(false);
    expect(calls).toEqual([]);
  });
});