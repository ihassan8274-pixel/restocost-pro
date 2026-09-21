// التوقعات الموسمية: أنماط مبيعات موسمية (رمضان/الصيف/الشتاء) → اقتراح شراء تلقائي
import type { POSOrder, BatchSalesRecord, DeliverySale, StandardRecipe, RawMaterial, InventoryRecord, PurchaseOrder } from '../types';

export type SeasonKey = 'ramadan' | 'summer' | 'winter' | 'normal';

export const SEASON_PRESETS: Record<SeasonKey, { label: string; months: number[]; multiplier: number; desc: string }> = {
  ramadan: { label: 'رمضان', months: [], multiplier: 1.6, desc: 'ذروة موسمية — يؤخذ أقوى شهرين للوصفة مع مضاعف 1.6' },
  summer: { label: 'الصيف', months: [5, 6, 7, 8], multiplier: 1.3, desc: 'أشهر مايو–سبتمبر (عصائر/مثلجات)' },
  winter: { label: 'الشتاء', months: [10, 11, 0, 1], multiplier: 1.25, desc: 'أشهر نوفمبر–فبراير (أطباق ساخنة)' },
  normal: { label: 'أيام عادية', months: [], multiplier: 1, desc: 'لا موسم — متوسط الفترة كاملة' },
};

export interface RecipeSeasonality {
  recipeId: string;
  nameAr: string;
  monthly: number[]; // متوسط وحدات بيع لكل شهر (0=يناير)
  avg: number; // المتوسط الشهري الكلي
  peakMonth: number; // 0-11
  peakRatio: number; // نسبة الذروة إلى المتوسط
  lastSaleAt: string;
  active: boolean; // بيع خلال الـ 90 يوم الأخيرة
}

export function monthOf(dateStr: string): number {
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
  return isNaN(d.getTime()) ? -1 : d.getMonth();
}

export interface MonthlySalesCollector {
  byMonth: number[]; // 12
  total: number;
  recent90: number;
  lastSaleAt: string;
}

export function collectMonthlySales(
  posOrders: POSOrder[],
  batchSalesRecords: BatchSalesRecord[],
  deliverySales: DeliverySale[],
  branchIds: string[],
  withinMonths = 12,
): Map<string, MonthlySalesCollector> {
  const map = new Map<string, MonthlySalesCollector>();
  const ensure = (id: string) => {
    let m = map.get(id);
    if (!m) { m = { byMonth: Array(12).fill(0), total: 0, recent90: 0, lastSaleAt: '' }; map.set(id, m); }
    return m;
  };
  const now = new Date();
  const nowMs = now.getTime();
  const cutoffMs = nowMs - withinMonths * 30 * 86400000;
  const cut90 = nowMs - 90 * 86400000;
  const add = (recipeId: string, qty: number, dateStr: string) => {
    const m = ensure(recipeId);
    const mth = monthOf(dateStr);
    const ms = new Date(dateStr).getTime();
    if (mth >= 0) m.byMonth[mth] += qty;
    if (ms >= cutoffMs) m.total += qty;
    if (ms >= cut90) m.recent90 += qty;
    if (dateStr > m.lastSaleAt) m.lastSaleAt = dateStr;
  };
  posOrders.filter((o) => branchIds.includes(o.branchId)).forEach((o) =>
    o.items.forEach((i) => add(i.recipeId, i.quantity, o.date)));
  batchSalesRecords.filter((b) => branchIds.includes(b.branchId)).forEach((b) =>
    b.items.forEach((i) => add(i.recipeId, i.quantitySold, b.date)));
  deliverySales.filter((d) => branchIds.includes(d.branchId)).forEach((d) =>
    d.items.forEach((i) => add(i.recipeId, i.quantitySold, d.date)));
  return map;
}

export function computeSeasonality(collector: Map<string, MonthlySalesCollector>, recipes: StandardRecipe[]): RecipeSeasonality[] {
  return recipes.map((r) => {
    const c = collector.get(r.id);
    if (!c || c.total <= 0) return { recipeId: r.id, nameAr: r.nameAr, monthly: Array(12).fill(0), avg: 0, peakMonth: 0, peakRatio: 0, lastSaleAt: '', active: false };
    const monthly = c.byMonth.slice();
    const avg = c.total / 12;
    let peakMonth = 0;
    monthly.forEach((v, i) => { if (v > monthly[peakMonth]) peakMonth = i; });
    const peakRatio = avg > 0 ? monthly[peakMonth] / avg : 0;
    return {
      recipeId: r.id, nameAr: r.nameAr, monthly, avg, peakMonth, peakRatio,
      lastSaleAt: c.lastSaleAt, active: c.recent90 > 0,
    };
  });
}

// احتياج متوقع لكل وصفة خلال النافذة القادمة حسب الموسم المختار
export function forecastByRecipe(seasonality: RecipeSeasonality[], targetDays: number, season: SeasonKey): Record<string, number> {
  const preset = SEASON_PRESETS[season];
  const scale = Math.max(1, targetDays) / 30;
  const out: Record<string, number> = {};
  seasonality.forEach((s) => {
    if (!s.active || s.avg <= 0) return;
    let base: number;
    if (season === 'ramadan') {
      // ذروة: أفضل شهرين للوصفة (تجنب ضجيج شهر واحد)
      const sorted = s.monthly.slice().sort((a, b) => b - a);
      base = (sorted[0] + (sorted[1] || 0)) / 2;
    } else if (preset.months.length > 0) {
      const vals = preset.months.map((m) => s.monthly[m]).filter((v) => v > 0);
      base = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : s.avg;
    } else {
      base = s.avg;
    }
    const val = base * scale * preset.multiplier;
    if (val >= 0.5) out[s.recipeId] = val;
  });
  return out;
}

export interface MaterialDemandRow {
  rawMaterialId: string;
  nameAr: string;
  code: string;
  unit: string;
  demandQty: number;
  demandBy: { recipeId: string; nameAr: string; label: string; units: number; qty: number }[]; // مصادر الطلب
}

export function materialDemandFromForecast(
  forecast: Record<string, number>,
  recipes: StandardRecipe[],
): MaterialDemandRow[] {
  const agg = new Map<string, MaterialDemandRow>();
  recipes.forEach((r) => {
    const units = forecast[r.id];
    if (!units || units <= 0) return;
    r.ingredients.forEach((ing) => {
      let row = agg.get(ing.rawMaterialId);
      if (!row) {
        row = { rawMaterialId: ing.rawMaterialId, nameAr: ing.rawMaterialId, code: '', unit: '', demandQty: 0, demandBy: [] };
        agg.set(ing.rawMaterialId, row);
      }
      const qty = ing.quantity * units;
      row.demandQty += qty;
      row.demandBy.push({ recipeId: r.id, nameAr: r.nameAr, label: r.nameAr, units, qty });
    });
  });
  return [...agg.values()].sort((a, b) => b.demandQty - a.demandQty);
}

export interface SeasonalSuggestion {
  material: RawMaterial;
  demand: number; // الاحتياج المتوقع (وحدة تخزين، يشمل المعامل الموسمي)
  onHand: number;
  onOrder: number;
  baseSuggested: number; // كمية مباشرة = الطلب − المخزون − الأوامر
  smartSuggested: number; // كمية ذكية = (الطلب الموسمي × معامل الذروة) − المخزون − الأوامر
  peakFactor: number; // معامل الذروة المدمج (1 = لا قمم واضحة)
  suggestedPurchaseUnits: number;
  estCost: number;
  demandSource: number; // عدد الوصفات المطلوبة
  topRecipe: string;
}

const clampFactor = (v: number, lo = 1, hi = 2.2) => Math.min(hi, Math.max(lo, v));

export function buildSeasonalSuggestions(
  demandRows: MaterialDemandRow[],
  rawMaterials: RawMaterial[],
  inventory: InventoryRecord[],
  purchaseOrders: PurchaseOrder[],
  branchIds: string[],
  seasonality: RecipeSeasonality[] = [],
): SeasonalSuggestion[] {
  const onHandMap: Record<string, number> = {};
  inventory.filter((i) => branchIds.includes(i.branchId)).forEach((i) => { onHandMap[i.rawMaterialId] = (onHandMap[i.rawMaterialId] || 0) + i.quantity; });
  const onOrderMap: Record<string, number> = {};
  purchaseOrders.filter((p) => branchIds.includes(p.branchId) && ['submitted', 'approved', 'partially_received'].includes(p.status))
    .forEach((p) => p.items.forEach((i) => { onOrderMap[i.rawMaterialId] = (onOrderMap[i.rawMaterialId] || 0) + i.quantity; }));
  const peakOf = (recipeId: string) => seasonality.find((s) => s.recipeId === recipeId)?.peakRatio || 1;
  return demandRows.map((d) => {
    const mat = rawMaterials.find((m) => m.id === d.rawMaterialId);
    if (!mat) return null;
    const demand = d.demandQty;
    const onHand = onHandMap[mat.id] || 0;
    const onOrder = onOrderMap[mat.id] || 0;
    const conv = mat.purchaseUnitConversion && mat.purchaseUnitConversion > 0 ? mat.purchaseUnitConversion : 1;
    // معامل الذروة المرجح بمصادر الطلب: دمج ذروة الطلب مع المعامل الموسمي
    const totalW = d.demandBy.reduce((s, b) => s + b.qty, 0);
    const peakFactor = clampFactor(totalW > 0 ? d.demandBy.reduce((s, b) => s + b.qty * peakOf(b.recipeId), 0) / totalW : 1);
    const baseSuggested = Math.max(0, demand - onHand - onOrder);
    const smartSuggested = Math.max(0, demand * peakFactor - onHand - onOrder);
    const cents = (v: number) => (v > 0 ? Math.ceil(v / conv) * conv : 0);
    const top = d.demandBy.sort((a, b) => b.qty - a.qty)[0];
    return {
      material: mat, demand, onHand, onOrder,
      baseSuggested: cents(baseSuggested), smartSuggested: cents(smartSuggested),
      peakFactor: Number(peakFactor.toFixed(2)),
      suggestedPurchaseUnits: conv > 1 && smartSuggested > 0 ? smartSuggested / conv : 0,
      estCost: smartSuggested > 0 ? smartSuggested * (mat.standardPrice || 0) : 0,
      demandSource: d.demandBy.length,
      topRecipe: top ? `${top.nameAr} (${Math.round(top.units)} طبق)` : '—',
    };
  }).filter((x): x is SeasonalSuggestion => !!x).sort((a, b) => b.smartSuggested - a.smartSuggested);
}