// ==========================================================
// inventoryMetrics.ts — حسابات المخزون المركزية
// تُشارك بين كل تقارير المخزون: التقييم، الرصيد حسب الفرع/الصنف،
// معدلات الاستهلاك، الضياع، والتغطية.
// ==========================================================
import { pct } from '../_core/ReportTypes';
import type { InventoryRecord, RawMaterial, WastageLog } from '../../../types';

export interface MaterialInfo {
  name: string;
  unit?: string;
  price: number;
}

export interface StockRow {
  rawMaterialId: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  value: number;
  stockLevelPct?: number;
}

const materialInfo = (rawMaterialId: string, materials: RawMaterial[]): MaterialInfo => {
  const m = materials.find((x) => x.id === rawMaterialId);
  return { name: m?.nameAr || rawMaterialId, unit: m?.unit, price: m?.standardPrice || 0 };
};

/** تجميع أرصدة كل مواد المخزون عبر الفروع مع قيمة مقدرة */
export const inventoryValuation = (records: InventoryRecord[], materials: RawMaterial[]): StockRow[] => {
  const map = new Map<string, StockRow>();
  records.forEach((i) => {
    const info = materialInfo(i.rawMaterialId, materials);
    const row = map.get(i.rawMaterialId) || {
      rawMaterialId: i.rawMaterialId,
      name: info.name,
      unit: info.unit || '',
      price: info.price,
      quantity: 0,
      value: 0,
    };
    row.quantity += i.quantity || 0;
    row.value += (i.quantity || 0) * info.price;
    map.set(i.rawMaterialId, row);
  });
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
};

/** إجمالي قيمة مخزون النظام الحالي */
export const totalInventoryValue = (records: InventoryRecord[], materials: RawMaterial[]): number =>
  inventoryValuation(records, materials).reduce((s, r) => s + r.value, 0);

/** رصيد صنف واحد في فرع محدد */
export const branchStock = (records: InventoryRecord[], branchId: string, rawMaterialId: string): number =>
  records.filter((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId).reduce((s, i) => s + (i.quantity || 0), 0);

/** نسبة استهلاك مقابل رصيد (استهلاك/مشتريات VS رصيد حالي) — مؤشر التغطية */
export const coverageDays = (dailyConsumption: number, currentStock: number): number =>
  dailyConsumption ? currentStock / dailyConsumption : 0;

/** قيمة الضياع كأصل مخزوني (لرصد التالف) */
export const inventoryWastageValue = (wastage: WastageLog[]): number =>
  wastage.reduce((s, w) => s + (Number(w.totalCostImpact) || 0), 0);

/** نسبة الضياع من الإيراد (الهالك / إيراد الشهر) */
export const wastageRate = (wastageCost: number, revenue: number): number => pct(wastageCost, revenue);