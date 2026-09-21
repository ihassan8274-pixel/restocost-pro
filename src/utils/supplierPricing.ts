// ذكاء أسعار الموردين: مصفوفة أسعار فعّالة لكل صنف × مورد، واختيار الأرخص تلقائياً
import type { Supplier, GoodsReceiptNote, SupplierQuote, RawMaterial } from '../types';

export interface SupplierPriceEntry {
  price: number;
  source: 'quote' | 'grn';
  date: string; // تاريخ الاستشهاد (سعر التسعيرة أو آخر استلام)
}

export type PriceMatrix = Map<string, Record<string, SupplierPriceEntry>>;

const today = () => new Date().toISOString().slice(0, 10);

// السعر الفعّال للمورد على صنف: تسعيرة سارية أولاً، ثم آخر استلام (لا يزيد عمره عن 180 يوماً)
export function effectivePriceFor(
  supplierId: string,
  matId: string,
  quotes: SupplierQuote[],
  grnNotes: GoodsReceiptNote[],
): SupplierPriceEntry | null {
  const now = today();
  const active = quotes
    .filter((q) => q.supplierId === supplierId && q.rawMaterialId === matId && q.validFrom <= now && (!q.validTo || q.validTo >= now))
    .sort((a, b) => (b.validFrom > a.validFrom ? 1 : -1))[0];
  if (active) return { price: active.price, source: 'quote', date: active.validFrom };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const accepted = grnNotes
    .filter((g) => g.supplierId === supplierId && g.status === 'approved')
    .map((g) => g.items.map((i) => ({ matId: i.rawMaterialId, price: i.unitPrice, date: g.date, notes: g.notes || '' })))
    .flat()
    .filter((i) => i.matId === matId && i.date >= cutoffStr)
    .sort((a, b) => (b.date > a.date ? 1 : -1));
  if (accepted.length > 0) return { price: accepted[0].price, source: 'grn', date: accepted[0].date };
  return null;
}

// مصفوفة الأسعار: لكل صنف، أسعار جميع الموردين المتاحين
export function buildPriceMatrix(
  materials: RawMaterial[],
  suppliers: Supplier[],
  quotes: SupplierQuote[],
  grnNotes: GoodsReceiptNote[],
): PriceMatrix {
  const matrix: PriceMatrix = new Map();
  materials.forEach((m) => {
    const bySupplier: Record<string, SupplierPriceEntry> = {};
    suppliers.filter((s) => s.isActive).forEach((s) => {
      const eff = effectivePriceFor(s.id, m.id, quotes, grnNotes);
      if (eff) bySupplier[s.id] = eff;
    });
    if (Object.keys(bySupplier).length > 0) matrix.set(m.id, bySupplier);
  });
  return matrix;
}

export interface CheapestInfo {
  supplierId: string;
  supplierName: string;
  price: number;
  comparedCount: number;
  saving: number; // التوفير مقارنة بسعر التكلفة القياسية أو المتوسط
  savingPct: number;
}

export function cheapestFor(
  matId: string,
  matrix: PriceMatrix,
  suppliers: Supplier[],
  standardPrice: number,
): CheapestInfo | null {
  const entries = matrix.get(matId);
  if (!entries) return null;
  const list = Object.entries(entries).map(([sid, e]) => ({ sid, price: e.price }));
  const best = list.sort((a, b) => a.price - b.price)[0] || null;
  if (!best) return null;
  const s = suppliers.find((x) => x.id === best.sid);
  const baseline = standardPrice > 0 ? standardPrice : Math.max(...Object.values(entries).map((e) => e.price));
  const saving = Math.max(0, baseline - best.price);
  return {
    supplierId: best.sid, supplierName: s?.name || best.sid, price: best.price,
    comparedCount: Object.keys(entries).length,
    saving, savingPct: baseline > 0 ? (saving / baseline) * 100 : 0,
  };
}

export interface SmartOrderPlanRow {
  material: RawMaterial;
  qty: number; // بوحدة المخزون
  supplierId: string;
  supplierName: string;
  price: number;
  lineTotal: number;
  saving: number;
}

// تجميع طلب ذكي: كل صنف يُحال لأرخص مورد يوفره
export function buildSmartOrderPlan(
  lineItems: { matId: string; qty: number }[],
  materials: RawMaterial[],
  matrix: PriceMatrix,
  suppliers: Supplier[],
): SmartOrderPlanRow[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const out: SmartOrderPlanRow[] = [];
  lineItems.forEach((li) => {
    const mat = byId.get(li.matId);
    if (!mat) return;
    const best = cheapestFor(li.matId, matrix, suppliers, mat.standardPrice || 0);
    const price = best ? best.price : 0;
    out.push({
      material: mat, qty: li.qty,
      supplierId: best ? best.supplierId : '', supplierName: best ? best.supplierName : '—',
      price, lineTotal: li.qty * price,
      saving: best && best.saving > 0 ? best.saving * li.qty : 0,
    });
  });
  return out;
}