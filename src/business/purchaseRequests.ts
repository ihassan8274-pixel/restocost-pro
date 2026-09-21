import type {
  BranchStockLimit, DailyInventoryCount, GoodsReceiptNote, InventoryRecord, RawMaterial, Supplier,
} from '../types';
import type { PurchaseOrderItem, PurchaseRequestItem } from '../types';
import { stockPerPurchase } from './units';

// ═══════════════════════════════════════════════════════════════════════════
// طلبات الشراء: كل منطق الحساب يُنفَّذ هنا (نقي من الواجهة) —
//  1) الحدود الفعلية للصنف في الفرع (تخصيص الفرع أو الافتراضي العام)
//  2) آخر جرد من الجوال (بوحدة الشراء)
//  3) آخر سعر توريد = أقل سعر استلام خلال 30 يوماً (بوحدة الشراء)
//  4) آخر مورد تم الشراء منه فعلياً (من GRN معتمدة)
//  5) توليد بنود الطلب: عند بلوغ الحد الأدنى أو أقل ← (الأقصى − آخر جرد)
//  6) تحويل الطلب إلى أوامر توريد مبدئية مجمعة حسب آخر مورد
// ═══════════════════════════════════════════════════════════════════════════

const dayMs = 86400000;

// الحدود الفعلية: تخصيص الفرع (BranchStockLimit) وإلا الافتراضي العام في بطاقة الصنف
export const effectiveLimits = (
  mat: Pick<RawMaterial, 'id' | 'minStockLevel' | 'maxStockLevel'>,
  branchId: string,
  branchStockLimits: BranchStockLimit[],
): { min: number; max: number; alwaysOrderFullMax: boolean; isOverride: boolean } => {
  const override = branchStockLimits.find((l) => l.branchId === branchId && l.rawMaterialId === mat.id);
  if (override) {
    return {
      min: override.minStockLevel,
      max: override.maxStockLevel,
      alwaysOrderFullMax: override.alwaysOrderFullMax,
      isOverride: true,
    };
  }
  return {
    min: mat.minStockLevel || 0,
    max: mat.maxStockLevel || 0,
    alwaysOrderFullMax: false,
    isOverride: false,
  };
};

// آخر جرد من الجوال للصنف في الفرع — الكمية بوحدة الشراء كما سُجِّلت من الجوال
export const lastCountFor = (
  dailyCounts: DailyInventoryCount[],
  branchId: string,
  rawMaterialId: string,
): { date: string; qtyPU: number } | null => {
  let best: { date: string; qtyPU: number } | null = null;
  for (const d of dailyCounts) {
    if (d.branchId !== branchId) continue;
    const it = d.items.find((i) => i.rawMaterialId === rawMaterialId);
    if (!it) continue;
    if (!best || d.date.slice(0, 10) > best.date) best = { date: d.date.slice(0, 10), qtyPU: it.countedQty || 0 };
  }
  return best;
};

// الرصيد الحالي بوحدة الشراء: آخر جرد (تفضيلي)، وإلا رصيد المخزون ÷ معامل التحويل
export const currentPurchaseQty = (
  dailyCounts: DailyInventoryCount[],
  branchId: string,
  mat: Pick<RawMaterial, 'id' | 'purchaseUnitConversion'>,
  inventory: InventoryRecord[],
): { qtyPU: number; source: 'count' | 'inventory'; countDate?: string } => {
  const last = lastCountFor(dailyCounts, branchId, mat.id);
  if (last) return { qtyPU: last.qtyPU, source: 'count', countDate: last.date };
  const conv = stockPerPurchase(mat);
  const stock = inventory.filter((i) => i.branchId === branchId && i.rawMaterialId === mat.id)
    .reduce((s, i) => s + i.quantity, 0);
  return { qtyPU: round2(conv > 0 ? stock / conv : stock), source: 'inventory' };
};

// GRNs المعتمدة التي تحتوي الصنف مرتبة من الأقدم إلى الأحدث
const receiptsFor = (grnNotes: GoodsReceiptNote[], rawMaterialId: string) =>
  grnNotes
    .filter((g) => g.status === 'approved' && g.items.some((i) => i.rawMaterialId === rawMaterialId))
    .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)));

// آخر استلام معتمد للصنف وأسعاره (بوحدة الشراء = سعر وحدة المخزون × معامل التحويل)
export const lastReceiptFor = (
  grnNotes: GoodsReceiptNote[],
  mat: Pick<RawMaterial, 'id' | 'purchaseUnitConversion'>,
): { date: string; pricePU: number; supplierId: string; supplierName: string } | null => {
  const list = receiptsFor(grnNotes, mat.id);
  const last = list[list.length - 1];
  if (!last) return null;
  const conv = stockPerPurchase(mat);
  const item = last.items.find((i) => i.rawMaterialId === mat.id);
  return {
    date: last.date.slice(0, 10),
    pricePU: round2((item?.unitPrice || 0) * conv),
    supplierId: last.supplierId,
    supplierName: last.supplierName,
  };
};

// أقل سعر استلام خلال آخر N يوم (بوحدة الشراء) — يُستخدم كـ «آخر سعر توريد» وسعر أمر التوريد المبدئي
export const lowestPrice30Days = (
  grnNotes: GoodsReceiptNote[],
  mat: Pick<RawMaterial, 'id' | 'purchaseUnitConversion'>,
  days = 30,
): { pricePU: number; date: string; supplierId: string; supplierName: string } | null => {
  const cutoff = new Date(Date.now() - days * dayMs).toISOString().slice(0, 10);
  const conv = stockPerPurchase(mat);
  let best: { pricePU: number; date: string; supplierId: string; supplierName: string } | null = null;
  for (const g of grnNotes) {
    if (g.status !== 'approved') continue;
    const d = g.date.slice(0, 10);
    if (d < cutoff) continue;
    const item = g.items.find((i) => i.rawMaterialId === mat.id);
    if (!item) continue;
    const price = round2((item.unitPrice || 0) * conv);
    if (!best || price < best.pricePU) {
      best = { pricePU: price, date: d, supplierId: g.supplierId, supplierName: g.supplierName };
    }
  }
  return best;
};

// آخر مورد تم الشراء منه فعلياً للصنف — يتجاهل ربط الأصناف بالمورد في بطاقة الصنف
export const lastSupplierIdFor = (
  grnNotes: GoodsReceiptNote[],
  rawMaterialId: string,
  fallback?: string,
): string => {
  const list = receiptsFor(grnNotes, rawMaterialId);
  const last = list[list.length - 1];
  if (last && last.supplierId) return last.supplierId;
  return fallback || '';
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// توليد بنود طلب شراء لفرع — يُستدعى تلقائياً بعد الجرد من الجوال
export const generateRequestItems = (args: {
  branchId: string;
  rawMaterials: RawMaterial[];
  inventory: InventoryRecord[];
  dailyCounts: DailyInventoryCount[];
  branchStockLimits: BranchStockLimit[];
  grnNotes: GoodsReceiptNote[];
  suppliers: Supplier[];
  minPriceWindowDays?: number;
}): PurchaseRequestItem[] => {
  const { branchId, rawMaterials, inventory, dailyCounts, branchStockLimits, grnNotes, suppliers, minPriceWindowDays = 30 } = args;
  const rows: PurchaseRequestItem[] = [];

  rawMaterials.filter((m) => m.isActive).forEach((m) => {
    const conv = stockPerPurchase(m);
    const limits = effectiveLimits(m, branchId, branchStockLimits);
    if (limits.max <= 0) return;
    const current = currentPurchaseQty(dailyCounts, branchId, m, inventory);
    const minPU = round2(limits.min / conv);
    const maxPU = round2(limits.max / conv);
    const belowMin = current.qtyPU <= minPU || limits.alwaysOrderFullMax;
    if (!belowMin) return;
    const quantityPU = round2(limits.alwaysOrderFullMax ? maxPU : Math.max(0, maxPU - current.qtyPU));
    if (quantityPU <= 0) return;

    const cheapest = lowestPrice30Days(grnNotes, m, minPriceWindowDays);
    const lastSupplier = lastReceiptFor(grnNotes, m);
    const lastId = lastSupplier?.supplierId || cheapest?.supplierId || '';
    const lastName = lastId ? suppliers.find((s) => s.id === lastId)?.name || lastSupplier?.supplierName || cheapest?.supplierName || '—' : '—';

    rows.push({
      rawMaterialId: m.id,
      materialName: m.nameAr,
      code: m.code,
      unit: m.unit,
      purchaseUnit: m.purchaseUnit || m.unit,
      purchaseUnitConversion: conv,
      minStockLevel: limits.min,
      maxStockLevel: limits.max,
      alwaysOrderFullMax: limits.alwaysOrderFullMax,
      minPU,
      maxPU,
      currentPU: round2(current.qtyPU),
      currentStockQty: round2(current.qtyPU * conv),
      quantityPU,
      lastPricePU: cheapest?.pricePU ?? 0,
      lastPriceDate: cheapest?.date,
      lastSupplierId: lastId || undefined,
      lastSupplierName: lastName,
    });
  });

  return rows.sort((a, b) => b.quantityPU - a.quantityPU || a.code.localeCompare(b.code, undefined, { numeric: true }));
};

// تحويل طلب شراء إلى أوامر توريد مبدئية — مجمعة حسب آخر مورد فعلي لكل صنف
// السعر المستخدم = أقل سعر خلال آخر 30 يوماً (بوحدة الشراء)، المتحول لوحدة المخزون.
// الأصناف بلا سجل شراء سابق (بلا مورد) تُجمَّع في أمر مبدئي بموردٍ فارغ —
// يجب تسجيل مورد جديد لها من شاشة أوامر التوريد قبل الإرسال.
export const buildPreliminaryPOs = (args: {
  requestItems: PurchaseRequestItem[];
}): { supplierId: string; supplierName: string; items: PurchaseOrderItem[] }[] => {
  const { requestItems } = args;
  const bySupplier = new Map<string, { name: string; items: PurchaseOrderItem[] }>();

  requestItems.forEach((r) => {
    const conv = r.purchaseUnitConversion || 1;
    // سعر وحدة المخزون = سعر بوحدة الشراء ÷ معامل التحويل (حتى يطابق متوسط تكلفة الاستلامات)
    const unitPrice = conv > 0 ? r.lastPricePU / conv : r.lastPricePU;
    // المورد: فقط آخر مورد تم الشراء منه فعلياً — الأصناف بلا سجل شراء سابق
    // تُجمَّع في أمر توريد مبدئي «بلا مورد» ويتطلب تسجيل مورد جديد من شاشة الأوامر.
    const supplierId = r.lastSupplierId || '';
    const quantity = round2(r.quantityPU * conv); // وحدة المخزون
    const item: PurchaseOrderItem = {
      rawMaterialId: r.rawMaterialId,
      materialName: r.materialName,
      quantity,
      unit: r.unit,
      unitPrice,
      lineTotal: round2(quantity * unitPrice),
      purchaseUnit: r.purchaseUnit,
      purchaseUnitConversion: conv,
      purchaseQty: r.quantityPU,
    };
    const name = supplierId ? (r.lastSupplierName || supplierId) : '';
    const entry = bySupplier.get(supplierId) || { name, items: [] };
    entry.items.push(item);
    bySupplier.set(supplierId, entry);
  });

  return Array.from(bySupplier.entries()).map(([supplierId, e]) => ({
    supplierId,
    supplierName: e.name,
    items: e.items,
  }));
};