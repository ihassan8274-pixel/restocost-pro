import type { RawMaterial, StandardRecipe, SubPrepIngredient } from '../types';
import { tradeUnitPrice } from './units';

// معرفة ما إذا كانت الوصفة تعتمد على أيٍّ من المواد المحددة — مباشرة (في المكونات)
// أو بالتتابع عبر تحضيراتها الفرعية/المطبخ المركزي (يُستخدم لتحديد الوصفات المتأثرة
// عند تغيّر سعر مادة، فلا يُعيد النظام حساب كل الوصفات عبثاً).
export const recipeUsesAnyMaterial = (
  recipe: StandardRecipe,
  recipes: StandardRecipe[],
  materialIds: string[],
  seen = new Set<string>(),
): boolean => {
  if (!recipe || seen.has(recipe.id)) return false;
  seen.add(recipe.id);
  if (recipe.ingredients && recipe.ingredients.some((ing) => materialIds.includes(ing.rawMaterialId))) return true;
  if (recipe.subPrepIngredients) {
    for (const sp of recipe.subPrepIngredients) {
      const sub = recipes.find((r) => r.id === sp.recipeId);
      if (sub && recipeUsesAnyMaterial(sub, recipes, materialIds, seen)) return true;
    }
  }
  return false;
};

export interface RecipeCostBreakdown {
  foodCost: number;
  subPrepCost: number;
  totalCost: number;
  suggestedPrice: number;
  pieceCost: number;
}

// حساب تكلفة الوصفة (مواد مباشرة + تحضيرات فرعية/مطبخ مركزي + عمل + تغليف) بشكل خالص:
// يعتمد ONLY على البيانات الممررة حتى يمكن اختباره وإعادة استخدامه عبر السياق والتقارير.
export const computeRecipeCosts = (
  rawMaterials: RawMaterial[],
  recipes: StandardRecipe[],
  ingredients: StandardRecipe['ingredients'],
  directLabor: number,
  packaging: number,
  subPrep?: SubPrepIngredient[],
  yieldPieces?: number,
  _depth = 0,
  stockPriceFor?: (rawMaterialId: string) => number | undefined,
): RecipeCostBreakdown => {
  let foodCost = 0;
  let subPrepCost = 0;
  ingredients.forEach((ing) => {
    const mat = rawMaterials.find((m) => m.id === ing.rawMaterialId);
    // سعر وحدة القياس (التداول): يُحوَّل من سعر وحدة المخزون عبر معامل الصنف الخاص
    // (زجاجة × 0.7 = لتر) — ويكون لتر هو ما يُحسب به المكوّن في الوصفة.
    // stockPriceFor: دالة اختيارية تعيد متوسط التكلفة لوحدة المخزون (من الاستلامات)
    // بدلاً من السعر القياسي للصنف — تُمرَّر من السياق لتعكس «متوسط الأسعار» الفعلي.
    const unitCost = mat ? tradeUnitPrice(mat, stockPriceFor ? stockPriceFor(mat.id) : undefined) : 0;
    const yieldFactor = mat && mat.yieldPercentage ? mat.yieldPercentage / 100 : 1;
    const wastageFactor = 1 + (ing.wastagePercent || 0) / 100;
    foodCost += (ing.quantity / yieldFactor) * wastageFactor * unitCost;
  });
  if (_depth < 6) {
    (subPrep || []).forEach((sp) => {
      const sub = recipes.find((r) => r.id === sp.recipeId);
      if (!sub) return;
      const subTotal = computeRecipeCosts(rawMaterials, recipes, sub.ingredients, sub.directLaborCost, sub.packagingCost, sub.subPrepIngredients, sub.yieldPieces, _depth + 1, stockPriceFor).totalCost;
      // عدد القطع الناتجة من دفعة التحضير: yieldPieces إن حُدّد، وإلا مقاس الحصة إذا كان رقمياً
      const pieces = (Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces) : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1));
      subPrepCost += sp.quantity * (subTotal / pieces);
    });
  }
  foodCost += subPrepCost;
  const totalCost = foodCost + directLabor + packaging;
  return {
    foodCost: Number(foodCost.toFixed(2)),
    subPrepCost: Number(subPrepCost.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    // السعر المقترح لتحقيق نسبة تكلفة الأغذية المستهدفة 28% (سعر صافي = التكلفة / 0.28)
    suggestedPrice: Number((totalCost / 0.28).toFixed(2)),
    pieceCost: Number((totalCost / (yieldPieces || 1)).toFixed(2)),
  };
};