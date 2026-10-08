// خصم المبيعات من المخزون حسب وصفة الطبق — منطق نقي، كمّي فقط.
//
// ⭐ لماذا موديول مستقل: إعداد "خصم المبيعات من المخزون" كان معلَّقاً بلا
// مستهلك. أي أن المبيعات لا تمس المخزون إطلاقاً بينما الواجهة تقول
// "مخصوم المخزون". هنا المحرك النقي للخصم، يُستدعى من useAppCompat.
//
// ⭐ لماذا لا نستخدم money.ts: هذا كمّي لا نقدي. mulMoney تُقرّب إلى قرش
// (عدد صحيح) فتحوّل 0.25 كغم إلى صفر. الكميات تبقَى أعداداً عشرية، والتدوير
// إلى 4 منازل يتم في adjustInventory (نفس دقة دفتر الحركات).
//
// ⭐ المعادلة لكل قطعة مبنيةً على محرك التكلفة computeRecipeCosts حرفياً حتى
// لا يختلف المخزون عن التكلفة:
//     كمية/قطعة = (الكمية ÷ نسبة الإنتاجية) × (1 + نسبة الهدر)
// ثم تُحوَّل من وحدات التداول إلى وحدات المخزون عبر tradeToStock.

import type { RawMaterial, StandardRecipe } from '../types';
import { tradeToStock } from './units';

export interface SaleItemLike {
  recipeId: string;
  quantitySold: number;
}

export interface DeductionLine {
  rawMaterialId: string;
  itemName: string;
  /** سالب دائماً عند الخصم، موجب عند العكس. */
  delta: number;
}

export interface DeductionPlan {
  lines: DeductionLine[];
  /** مجموع الكميات المنصاعة (بالوحدات العشرية، لا يهمّ في التقارير). */
  totalStockQty: number;
  /** أصناف بيع بلا وصفة — تعذّر اشتقاق مواد، فلا يُخصم منها شيء. */
  unmappedRecipes: string[];
  /** مواد خام غير موجودة في بطاقات الأصناف. */
  unknownMaterials: string[];
}

/** أقصى عمق لتوسيع التحضيرات الفرعية — مطابق لـ computeRecipeCosts. */
const MAX_SUBPREP_DEPTH = 6;

/** 4 منازل — دقة دفتر الحركات (inventoryStore.adjustInventory). */
const round4 = (n: number) => Math.round(n * 10000) / 10000;

interface Accumulator {
  qty: number;
  itemName: string;
}

/**
 * يوسّع أصناف البيع إلى مواد خام بوحدة المخزون.
 * `sign = -1` للخصم، `+1` للعكس.
 */
export const planSaleStockDeduction = (
  items: SaleItemLike[],
  ctx: { recipes: StandardRecipe[]; rawMaterials: RawMaterial[] },
  sign: -1 | 1 = -1,
): DeductionPlan => {
  const { recipes, rawMaterials } = ctx;
  const acc = new Map<string, Accumulator>();
  const unmappedRecipes: string[] = [];
  const unknownMaterials: string[] = [];

  const matOf = (id: string) => rawMaterials.find((m) => m.id === id);

  const addQty = (rawMaterialId: string, stockQty: number) => {
    if (!Number.isFinite(stockQty) || stockQty === 0) return;
    const cur = acc.get(rawMaterialId);
    if (cur) cur.qty += stockQty;
    else acc.set(rawMaterialId, { qty: stockQty, itemName: matOf(rawMaterialId)?.nameAr || rawMaterialId });
  };

  // ⭐ التوسيع مطابق للمحرك: yield + wastage قبل أي تحويل وحدة.
  const walk = (recipe: StandardRecipe, portions: number, depth: number) => {
    (recipe.ingredients || []).forEach((ing) => {
      const mat = matOf(ing.rawMaterialId);
      if (!mat) {
        if (!unknownMaterials.includes(ing.rawMaterialId)) unknownMaterials.push(ing.rawMaterialId);
        return;
      }
      const yieldFactor = mat.yieldPercentage ? mat.yieldPercentage / 100 : 1;
      const wastageFactor = 1 + (ing.wastagePercent || 0) / 100;
      const perPieceTrade = yieldFactor > 0 ? (ing.quantity / yieldFactor) * wastageFactor : ing.quantity;
      // ⬇️ المخزون بوحدات المخزون لا وحدات التداول.
      addQty(ing.rawMaterialId, tradeToStock(perPieceTrade * portions, mat));
    });

    if (depth >= MAX_SUBPREP_DEPTH) return;
    (recipe.subPrepIngredients || []).forEach((sp) => {
      const sub = recipes.find((r) => r.id === sp.recipeId);
      if (!sub) return;
      const per = Number(sp.quantity);
      if (!Number.isFinite(per) || per <= 0) return;
      walk(sub, portions * per, depth + 1);
    });
  };

  for (const it of items || []) {
    const qty = Number(it?.quantitySold);
    // ⭐ qty <= 0 لا qty === 0: كمية سالبة كانت تُنتج سطراً موجباً أي عكساً
    // صامتاً للمخزون. العكس مسار صريح (sign = +1) لا مدخل يُمرَّر سالباً.
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const recipe = recipes.find((r) => r.id === it.recipeId);
    if (!recipe) {
      if (!unmappedRecipes.includes(it.recipeId)) unmappedRecipes.push(it.recipeId);
      continue;
    }
    walk(recipe, qty, 0);
  }

  const lines: DeductionLine[] = [];
  let totalStockQty = 0;
  acc.forEach((v, rawMaterialId) => {
    // ⭐ تقريب إلى 4 منازل = نفس دقة inventoryStore عند كتابة الحركة
    // (Math.round(delta * 10000) / 10000). بلاه كان 8.4 ÷ 0.7 يساوي
    // 11.999999999999998 فيالخطة بينما الحركة تكتب -12 ⇒ الخطة لا تطابق
    // ما في الدفتر، وأي تحقق لاحق بينهما يفشل.
    const qty = round4(v.qty);
    lines.push({ rawMaterialId, itemName: v.itemName, delta: sign * qty });
    totalStockQty += qty;
  });

  return { lines, totalStockQty, unmappedRecipes, unknownMaterials };
};

/**
 * يطبّق الخطة على دفتر المخزون.
 *
 * ⭐ البوابة هنا لا في طبقة React. كان الفحص في useAppCompat (وحدة hook غير
 * قابلة للاختبار)، فلم يكن بإمكان إثبات عقد "لا خصم إلا بالتفعيل" — وكان
 * أي استدعاء مباشر للمحرّك يتجاوز الإعداد بصمت. السياسة الآن في مكان واحد
 * قابل للاختبار، والـ hook يمرّر `enabled` فقط.
 *
 * `force` للعكس فقط: يُتجاوز به `enabled` لأن العكس يجب أن يُشترط ببصمة
 * السجل (هل خُصم فعلاً؟)، لا بحالة المفتاح الآن. لولا ذلك لعطّل المستخدم
 * المفتاح بعد خصم فواتير ثم حذفها، فبقي الخصم معلّقاً بلا رجعة.
 *
 * `adjust` = useInventoryStore.getState().adjustInventory
 * `negativeCount` = عدد الأصناف التي ينزل رصيدها تحت الصفر (تحذير لا قمع).
 */
export const applySaleDeduction = (
  branchId: string,
  items: SaleItemLike[],
  ctx: { recipes: StandardRecipe[]; rawMaterials: RawMaterial[] },
  adjust: (branchId: string, rawMaterialId: string, delta: number, batchInfo?: undefined, reason?: { type: string; ref?: string }) => void,
  opts: {
    ref: string;
    /** حالة مفتاح الضبط وقت العملية. */
    enabled: boolean;
    sign?: -1 | 1;
    type: string;
    balancesBefore?: Map<string, number>;
    /** تجاوز `enabled` — للعكس فقط. */
    force?: boolean;
  },
): { applied: boolean; plan: DeductionPlan; negativeCount: number } => {
  const sign = opts.sign ?? -1;
  // المعطّل + غير مُجبر ⇒ لا خصم إطلاقاً. هذا هو العقد.
  if ((!opts.enabled && !opts.force) || !branchId) {
    return { applied: false, plan: planSaleStockDeduction([], ctx, sign), negativeCount: 0 };
  }
  const plan = planSaleStockDeduction(items, ctx, sign);
  let negativeCount = 0;
  for (const line of plan.lines) {
    adjust(branchId, line.rawMaterialId, line.delta, undefined, { type: opts.type, ref: opts.ref });
    if (sign === -1 && opts.balancesBefore) {
      const before = opts.balancesBefore.get(line.rawMaterialId);
      if (typeof before === 'number' && before + line.delta < -1e-9) negativeCount++;
    }
  }
  return { applied: true, plan, negativeCount };
};