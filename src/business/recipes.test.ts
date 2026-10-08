import { describe, it, expect } from 'vitest';
import { computeRecipeCosts, recipeUsesAnyMaterial } from './recipes';
import type { RawMaterial, StandardRecipe } from '../types';

// ⭐ هذا الموديول هو **محرك تكلفة الطعام** — منه تخرج كل food cost في
// النظام، ومنه اشتقّ محرّك خصم المخزون معادلةَ الكمية (نفس yield/wastage).
// كان بلا أي اختبار: أي انحراف فيه ينتقل صامتاً إلى 150+ شاشة.

// ── مصانع بيانات ─────────────────────────────────────────────
const mat = (id: string, over: Partial<RawMaterial> = {}): RawMaterial => ({
  id, code: id, nameAr: id, nameEn: '', category: 'dry_goods', unit: 'كغم',
  standardPrice: 10, minStockLevel: 0, yieldPercentage: 100, supplierId: '',
  storageType: 'dry', isActive: true, ...over,
} as RawMaterial);

const ing = (rawMaterialId: string, quantity: number, wastagePercent = 0) =>
  ({ rawMaterialId, quantity, wastagePercent });

const rec = (id: string, over: Partial<StandardRecipe> = {}): StandardRecipe => ({
  id, code: id, nameAr: id, nameEn: '', category: 'main_dish', portionSize: '1',
  prepTimeMins: 0, ingredients: [], directLaborCost: 0, packagingCost: 0,
  totalCalculatedCost: 0, suggestedPrice: 0, actualMenuPrice: 0,
  isCentralKitchenPrep: false, isActive: true, ...over,
} as StandardRecipe);

const mats = [mat('m1'), mat('m2', { standardPrice: 5 })];

// ── المباشرة ─────────────────────────────────────────────────
describe('computeRecipeCosts — مواد مباشرة', () => {
  it('تكلفة بسيطة: كمية × سعر', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 2)], 0, 0);
    // 2 × 10 = 20
    expect(r.foodCost).toBe(20);
    expect(r.totalCost).toBe(20);
  });

  it('يجمع عدة مكوّنات', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 1), ing('m2', 3)], 0, 0);
    expect(r.foodCost).toBe(10 + 15);
  });

  it('الهدر يضرب المكوّن', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 1, 10)], 0, 0);
    expect(r.foodCost).toBeCloseTo(11, 6);   // 1 × 1.10 × 10
  });

  it('الإنتاجية تُقسَم على المكوّن', () => {
    const withYield = [mat('y', { standardPrice: 10, yieldPercentage: 80 })];
    const r = computeRecipeCosts(withYield, [], [ing('y', 0.8)], 0, 0);
    expect(r.foodCost).toBeCloseTo(10, 6);  // 0.8 ÷ 0.8 = 1 × 10
  });

  it('مادة غير مسجَّلة تُكلّف صفراً ولا تكسر الحساب', () => {
    const r = computeRecipeCosts(mats, [], [ing('ghost', 5)], 0, 0);
    expect(r.foodCost).toBe(0);
  });

  it('سعر التداول بدل سعر المخزون: زجاجة 0.7 لتر تُحسب باللتر', () => {
    const oil = [mat('o', { standardPrice: 8, unit: 'زجاجة', tradeUomName: 'لتر', tradeUomConversion: 0.7 })];
    // 1 لتر من وصفة = 8 ÷ 0.7 = 11.4286، والمحرّك يقرّب إلى منزلتين ⇒ 11.43
    const r = computeRecipeCosts(oil, [], [ing('o', 1)], 0, 0);
    expect(r.foodCost).toBe(11.43);
  });

  it('stockPriceFor يتغلّب على السعر القياسي (متوسط الاستلامات)', () => {
    // ⭐ المعامل الثامن هو _depth وليس stockPriceFor. تمرير الدالة في موضعها
    // خطأ صامت: المحرّك يتجاهلها ويستخدم السعر القياسي.
    const r = computeRecipeCosts(mats, [], [ing('m1', 2)], 0, 0, undefined, undefined, 0, () => 12);
    expect(r.foodCost).toBeCloseTo(24, 6);   // 2 × 12 لا 2 × 10
  });
});

// ── العمل والتغليف ───────────────────────────────────────────
describe('computeRecipeCosts — عمل وتغليف', () => {
  it('الإجمالي = طعام + عمل + تغليف', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 1)], 3, 2);
    expect(r.totalCost).toBe(15);           // 10 + 3 + 2
    expect(r.foodCost).toBe(10);
  });

  it('السعر المقترح يحقّق 28%Food Cost', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 1)], 0, 0);
    expect(r.suggestedPrice).toBeCloseTo(r.totalCost / 0.28, 2);
  });

  it('تكلفة القطعة ÷ عدد القطع', () => {
    const r = computeRecipeCosts(mats, [], [ing('m1', 4)], 0, 0, undefined, 4);
    expect(r.pieceCost).toBeCloseTo(40 / 4, 6);
  });

  it('قائمة فارغة = تكلفة صفر بلا انهيار', () => {
    const r = computeRecipeCosts(mats, [], [], 0, 0);
    expect(r.totalCost).toBe(0);
    expect(r.foodCost).toBe(0);
  });
});

// ── التحضيرات الفرعية ────────────────────────────────────────
describe('computeRecipeCosts — تحضيرات فرعية', () => {
  const sub = rec('sub', {
    ingredients: [ing('m2', 10)],
    yieldPieces: 10,
  });

  it('تحضير فرعي: تكلفته ÷ قطعه × الكمية المستهلكة', () => {
    // التحضير: 10 × 5 = 50 على 10 قطع = 5 للقطعة؛ صنف يستهلك 2 ⇒ 10
    const r = computeRecipeCosts(mats, [sub], [], 0, 0, [{ recipeId: 'sub', quantity: 2 }]);
    expect(r.subPrepCost).toBeCloseTo(10, 4);
    expect(r.foodCost).toBeCloseTo(10, 4);
  });

  it('التحضير يدخل في foodCost لا فيه مرّتين', () => {
    const r = computeRecipeCosts(mats, [sub], [], 0, 0, [{ recipeId: 'sub', quantity: 2 }]);
    expect(r.foodCost).toBe(r.subPrepCost);
  });

  it('portionSize رقمي يُستخدم عند غياب yieldPieces', () => {
    const s2 = rec('s2', { ingredients: [ing('m2', 10)], portionSize: '5' });
    const r = computeRecipeCosts(mats, [s2], [], 0, 0, [{ recipeId: 's2', quantity: 1 }]);
    // 50 ÷ 5 قطع = 10
    expect(r.subPrepCost).toBeCloseTo(10, 4);
  });

  it('تحضير غير موجود يُتجاهل بصمت', () => {
    const r = computeRecipeCosts(mats, [sub], [], 0, 0, [{ recipeId: 'ghost', quantity: 1 }]);
    expect(r.subPrepCost).toBe(0);
  });

  it('عمق التحضير محدود بـ6 — دورة لا تعلّق التطبيق', () => {
    const a = rec('a', { subPrepIngredients: [{ recipeId: 'b', quantity: 1 }] });
    const b = rec('b', { subPrepIngredients: [{ recipeId: 'a', quantity: 1 }] });
    const r = computeRecipeCosts(mats, [a, b], [], 0, 0, [{ recipeId: 'a', quantity: 1 }]);
    expect(Number.isFinite(r.totalCost)).toBe(true);
  });
});

// ── الدقة ────────────────────────────────────────────────────
describe('computeRecipeCosts — الدقة', () => {
  it('roundMoney يمنع تراكم خطأ الفاصلة العائمة', () => {
    // 0.1 + 0.2 يعطي 0.30000000000000004 — هنا يجب أن يكون 0.3 بالضبط
    const m = [mat('f', { standardPrice: 1 })];
    const r = computeRecipeCosts(m, [], [ing('f', 0.1), ing('f', 0.2)], 0, 0);
    expect(r.foodCost).toBe(0.3);
  });

  it('83.33 × 3 يقرَّب إلى منزلتين لا يبقى 249.99000000000001', () => {
    const m = [mat('f', { standardPrice: 83.33 })];
    const r = computeRecipeCosts(m, [], [ing('f', 3)], 0, 0);
    expect(r.totalCost).toBe(249.99);
  });
});

// ── الاعتماد على مادة ────────────────────────────────────────
describe('recipeUsesAnyMaterial', () => {
  const r1 = rec('r1', { ingredients: [ing('m1', 1)] });
  const r2 = rec('r2', { subPrepIngredients: [{ recipeId: 'r1', quantity: 1 }] });

  it('مادة مباشرة ⇒ يعتمد', () => {
    expect(recipeUsesAnyMaterial(r1, [r1], ['m1'])).toBe(true);
    expect(recipeUsesAnyMaterial(r1, [r1], ['m9'])).toBe(false);
  });

  it('اعتماد متتابع عبر تحضير فرعي', () => {
    expect(recipeUsesAnyMaterial(r2, [r1, r2], ['m1'])).toBe(true);
  });

  it('دورة في التحضيرات الفرعية لا تعلّق', () => {
    const a = rec('a', { subPrepIngredients: [{ recipeId: 'b', quantity: 1 }] });
    const b = rec('b', { subPrepIngredients: [{ recipeId: 'a', quantity: 1 }] });
    expect(recipeUsesAnyMaterial(a, [a, b], ['m1'])).toBe(false);
  });
});