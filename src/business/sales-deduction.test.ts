import { describe, it, expect } from 'vitest';
import { planSaleStockDeduction } from './sales-deduction';
import type { RawMaterial, StandardRecipe } from '../types';

// ⭐ المفتاح: إعداد "خصم المبيعات من المخزون" كان بلا مستهلك — لا نداءات
// adjustInventory في أي مسار بيع. هذه تربط "الكمية المنصاعة" بـ "الكمية
// المخصومة من المخزون" بنفس معادلة محرك التكلفة، فلا يختلف المخزون عن
// التكلفة في صنف واحد. والكميات تبقى عشرية: التقريب إلى قرش خطأ لكمية.

const mat = (over: Partial<RawMaterial> & { id: string }): RawMaterial => ({
  code: over.id, nameAr: over.id, nameEn: '', category: 'dry_goods', unit: 'كغم',
  standardPrice: 0, minStockLevel: 0, yieldPercentage: 100, supplierId: '', storageType: 'dry',
  isActive: true, ...over,
} as RawMaterial);

const rec = (over: Partial<StandardRecipe> & { id: string }): StandardRecipe => ({
  code: over.id, nameAr: over.id, nameEn: '', category: 'main_dish', portionSize: '1',
  prepTimeMins: 0, ingredients: [], directLaborCost: 0, packagingCost: 0,
  totalCalculatedCost: 0, suggestedPrice: 0, actualMenuPrice: 0,
  isCentralKitchenPrep: false, isActive: true, ...over,
} as StandardRecipe);

const base = {
  recipes: [rec({ id: 'r1', ingredients: [{ rawMaterialId: 'm1', quantity: 0.2, wastagePercent: 0 }] })],
  rawMaterials: [mat({ id: 'm1' })],
};
const qtyOf = (p: ReturnType<typeof planSaleStockDeduction>, id: string) =>
  p.lines.find((l) => l.rawMaterialId === id)?.delta ?? 0;

describe('planSaleStockDeduction', () => {
  it('خصم سالب بمقدار الكمية × حصة الوصفة', () => {
    const p = planSaleStockDeduction([{ recipeId: 'r1', quantitySold: 10 }], base);
    // 10 قطع × 0.2 كغم/قطعة = 2 كGm بسالب
    expect(qtyOf(p, 'm1')).toBeCloseTo(-2, 6);
    expect(p.lines).toHaveLength(1);
  });

  it('.sign موجب عند العكس (حذف/تعديل)', () => {
    const p = planSaleStockDeduction([{ recipeId: 'r1', quantitySold: 10 }], base, 1);
    expect(qtyOf(p, 'm1')).toBeCloseTo(2, 6);
  });

  it('الهدر يُضرب على الحصة', () => {
    const ctx = {
      recipes: [rec({ id: 'r', ingredients: [{ rawMaterialId: 'm', quantity: 1, wastagePercent: 10 }] })],
      rawMaterials: [mat({ id: 'm' })],
    };
    expect(qtyOf(planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx), 'm')).toBeCloseTo(-1.1, 6);
  });

  it('الإنتاجية تُقسَم على الحصة (صفقة 90% تستهلك أكتر)', () => {
    const ctx = {
      recipes: [rec({ id: 'r', ingredients: [{ rawMaterialId: 'm', quantity: 1, wastagePercent: 0 }] })],
      rawMaterials: [mat({ id: 'm', yieldPercentage: 90 })],
    };
    // 1 ÷ 0.9 = 1.1111… مقرَّبة إلى 4 منازل (دقة دفتر الحركات)
    expect(qtyOf(planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx), 'm')).toBeCloseTo(-1.1111, 4);
  });

  // ⭐ الكمية لا تُقرَّب إلى قرش. money.ts يفعل ذلك، وهو خطأ لكمية: 0.25 كغم
  // كانت ستصبح صفراً. هنا 4 منازل لا منزلتين صحيحتين.
  it('كمية كسرية تُقرَّب إلى 4 منازل — لا إلى قرش', () => {
    const ctx = {
      recipes: [rec({ id: 'r', ingredients: [{ rawMaterialId: 'm', quantity: 1 / 3, wastagePercent: 0 }] })],
      rawMaterials: [mat({ id: 'm' })],
    };
    expect(qtyOf(planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx), 'm')).toBeCloseTo(-0.3333, 4);
  });

  it('أصناف البيع لنفس الوصفة تتجمّع في سطر واحد', () => {
    const p = planSaleStockDeduction(
      [{ recipeId: 'r1', quantitySold: 3 }, { recipeId: 'r1', quantitySold: 7 }],
      base,
    );
    expect(p.lines).toHaveLength(1);
    expect(qtyOf(p, 'm1')).toBeCloseTo(-2, 6);
  });

  it('تحويل وحدة التداول إلى المخزون: 8.4 لتر ÷ 0.7 = 12 زجاجة', () => {
    // tradeToStock: زجاجة = 0.7 لتر ⇒ وصفة 8.4 لتر تستهلك 12 زجاجة
    const ctx = {
      recipes: [rec({ id: 'r', ingredients: [{ rawMaterialId: 'z', quantity: 8.4, wastagePercent: 0 }] })],
      rawMaterials: [mat({ id: 'z', unit: 'زجاجة', tradeUomName: 'لتر', tradeUomConversion: 0.7 })],
    };
    expect(qtyOf(planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx), 'z')).toBeCloseTo(-12, 6);
  });

  it('التحضيرات الفرعية تُوسَّد: صنف يبيع تحضيراً فرعياً', () => {
    const ctx = {
      recipes: [
        rec({ id: 'r', subPrepIngredients: [{ recipeId: 'sub', quantity: 2 }] }),
        rec({ id: 'sub', ingredients: [{ rawMaterialId: 'm', quantity: 0.5, wastagePercent: 0 }] }),
      ],
      rawMaterials: [mat({ id: 'm' })],
    };
    // قطعة واحدة = 2 حصة تحضير × 0.5 = 1 كجم
    expect(qtyOf(planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx), 'm')).toBeCloseTo(-1, 6);
  });

  it('ذروة التحضير الفرعي (دورة) لا تعلّق أبداً', () => {
    const a = rec({ id: 'a', subPrepIngredients: [{ recipeId: 'b', quantity: 1 }] });
    const b = rec({ id: 'b', subPrepIngredients: [{ recipeId: 'a', quantity: 1 }] });
    const ctx = { recipes: [a, b], rawMaterials: [mat({ id: 'm' })] };
    // a↔b بلا مواد ⇒ لا سطور ولا تعليق
    expect(planSaleStockDeduction([{ recipeId: 'a', quantitySold: 1 }], ctx).lines).toEqual([]);
  });

  it('وصفة بلا ربط تُبلَّغ ولا تُخصم صامتة', () => {
    const p = planSaleStockDeduction([{ recipeId: 'rX', quantitySold: 5 }], base);
    expect(p.lines).toEqual([]);
    expect(p.unmappedRecipes).toEqual(['rX']);
  });

  it('مادة خام غير مسجَّلة تُبلَّغ ولا تُنتج سالباً', () => {
    const ctx = {
      recipes: [rec({ id: 'r', ingredients: [{ rawMaterialId: 'ghost', quantity: 1, wastagePercent: 0 }] })],
      rawMaterials: [],
    };
    const p = planSaleStockDeduction([{ recipeId: 'r', quantitySold: 1 }], ctx);
    expect(p.lines).toEqual([]);
    expect(p.unknownMaterials).toEqual(['ghost']);
  });

  it('كميات صفرية/سالبة/غير رقمية تُتجاهل بلا سطور', () => {
    const p = planSaleStockDeduction(
      [{ recipeId: 'r1', quantitySold: 0 }, { recipeId: 'r1', quantitySold: NaN }, { recipeId: 'r1', quantitySold: -3 }],
      base,
    );
    expect(p.lines).toEqual([]);
    expect(p.totalStockQty).toBe(0);
  });

  it('قائمة فارغة ⇒ لا خصم (سلوك آمن)', () => {
    expect(planSaleStockDeduction([], base).lines).toEqual([]);
  });
});