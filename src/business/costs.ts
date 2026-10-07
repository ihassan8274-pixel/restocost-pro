import type { GoodsReceiptNote, OpeningBalanceRecord, StockTransfer } from '../types';
import { avgUnitCents, centsOf, fromCents, qtyTimesCents } from './money';

// متوسط التكلفة يُحسب الآن بهلالات (أعداد صحيحة) عبر قراءة ثنائية:
// حقل Cents إن وُجد، وإلا تحويل العشري القديم — فيبقى السلوك مطابقاً
// للبيانات المخزنة قبل الترحيل ويتحسّن دقةً بعدها.

// متوسط التكلفة من الاستلامات المعتمدة فقط — احتياط عند غياب سجل حركة مرجّح
export const averageUnitCostFromReceipts = (
  grnNotes: GoodsReceiptNote[],
  rawMaterialId: string,
  fallbackCost: number,
): number => {
  const receipts = grnNotes.filter((g) => g.status === 'approved' && g.items.some((i) => i.rawMaterialId === rawMaterialId));
  let qty = 0, valueCents = 0;
  receipts.forEach((g) => g.items.forEach((i) => {
    if (i.rawMaterialId === rawMaterialId) {
      qty += i.quantityReceived;
      valueCents += qtyTimesCents(i.quantityReceived, centsOf(i.unitPriceCents, i.unitPrice));
    }
  }));
  if (qty > 0) return fromCents(avgUnitCents(valueCents, qty));
  return fallbackCost;
};

// متوسط التكلفة المرجّح المتحرك للفرع (Moving Weighted Average) — يُحاكي دفتر حركة
// الصنف في الفرع لحظة بلحظة حتى تاريخ معيّن (asOf) أو حتى الآن:
// افتتاحي + استلامات معتمدة + تحويلات واردة/صادرة، بحيث يُقيَّم كل صادر بمتوسط
// الرصيد الجاري قبل العملية، فيعكس التكلفة الحقيقية للمتبقي دون فقدان كسور السعر.
// التجميع بالهللات صحيح تماماً (لا خطأ تمثيل ولا تقريب في الخطوات)، والناتج
// النهائي كسر عائم بالهللات للوحدة تماماً كالسابق لكن من مجموع صحيح.
export const movingWeightedAverage = (
  openingBalances: OpeningBalanceRecord[],
  grnNotes: GoodsReceiptNote[],
  stockTransfers: StockTransfer[],
  branchId: string,
  rawMaterialId: string,
  asOf: string | undefined,
  fallbackCost: number,
): number => {
  const until = asOf ? asOf.slice(0, 10) : '9999-12-31';
  // 1) الرصيد الافتتاحي الأحدث بتاريخ ≤ asOf
  const openings = openingBalances
    .filter((r) => r.branchId === branchId && r.date.slice(0, 10) <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastOpening = openings[openings.length - 1];
  let balanceQty = 0, balanceValueCents = 0;
  const startDate = lastOpening ? lastOpening.date.slice(0, 10) : '';
  if (lastOpening) {
    lastOpening.items.forEach((i) => { if (i.rawMaterialId === rawMaterialId) { balanceQty = i.quantity; balanceValueCents = qtyTimesCents(i.quantity, centsOf(i.unitCostCents, i.unitCost)); } });
  }
  // 2) حركات ما بعد الافتتاحي مجمعة زمنياً (GRN قبل التحويلات لنفس اليوم)
  interface MV { date: string; ord: number; qty: number; costCents: number }
  const move: MV[] = [];
  const afterStart = (d: string) => !startDate || d.slice(0, 10) >= startDate;
  const inWindow = (d: string) => d.slice(0, 10) <= until;
  grnNotes
    .filter((g) => g.status === 'approved' && g.branchId === branchId && afterStart(g.date) && inWindow(g.date))
    .forEach((g) => g.items.forEach((i) => { if (i.rawMaterialId === rawMaterialId) move.push({ date: g.date.slice(0, 10), ord: 0, qty: i.quantityReceived, costCents: centsOf(i.unitPriceCents, i.unitPrice) }); }));
  stockTransfers
    .filter((t) => t.status === 'approved' && inWindow(t.date))
    .forEach((t) => t.items.forEach((i) => {
      if (i.rawMaterialId !== rawMaterialId) return;
      const costCents = centsOf(i.unitCostCents, i.unitCost);
      if (t.fromBranchId === branchId) move.push({ date: t.date.slice(0, 10), ord: 1, qty: -i.quantity, costCents });
      if (t.toBranchId === branchId) move.push({ date: t.date.slice(0, 10), ord: 1, qty: i.quantity, costCents });
    }));
  move.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
  // 3) معالجة زمنية — كل إضافة بالهللات، وكل صادر يُقيَّم بمتوسط الرصيد الجاري
  for (const m of move) {
    if (m.qty > 0) {
      balanceValueCents += qtyTimesCents(m.qty, m.costCents);
      balanceQty += m.qty;
    } else if (balanceQty > 0) {
      // الصادر يُقيَّم بمتوسط الرصيد الجاري قبل الصرف (كسر بالهللات للوحدة)
      const avgCents = balanceValueCents / balanceQty;
      balanceValueCents += m.qty * avgCents;
      balanceQty += m.qty;
    }
  }
  if (balanceQty > 0) return balanceValueCents / (balanceQty * 100);
  return fallbackCost;
};