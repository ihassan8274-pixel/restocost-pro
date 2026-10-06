import type { GoodsReceiptNote, OpeningBalanceRecord, StockTransfer } from '../types';
import { addMoney, divMoney } from './money';

// متوسط التكلفة من الاستلامات المعتمدة فقط — احتياط عند غياب سجل حركة مرجّح
export const averageUnitCostFromReceipts = (
  grnNotes: GoodsReceiptNote[],
  rawMaterialId: string,
  fallbackCost: number,
): number => {
  const receipts = grnNotes.filter((g) => g.status === 'approved' && g.items.some((i) => i.rawMaterialId === rawMaterialId));
  let qty = 0, value = 0;
  receipts.forEach((g) => g.items.forEach((i) => {
    if (i.rawMaterialId === rawMaterialId) { qty += i.quantityReceived; value = addMoney(value, i.quantityReceived * i.unitPrice); }
  }));
  if (qty > 0) return divMoney(value, qty);
  return fallbackCost;
};

// متوسط التكلفة المرجّح المتحرك للفرع (Moving Weighted Average) — يُحاكي دفتر حركة
// الصنف في الفرع لحظة بلحظة حتى تاريخ معيّن (asOf) أو حتى الآن:
// افتتاحي + استلامات معتمدة + تحويلات واردة/صادرة، بحيث يُقيَّم كل صادر بمتوسط
// الرصيد الجاري قبل العملية، فيعكس التكلفة الحقيقية للمتبقي دون فقدان كسور السعر.
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
  let balanceQty = 0, balanceValue = 0;
  const startDate = lastOpening ? lastOpening.date.slice(0, 10) : '';
  if (lastOpening) {
    lastOpening.items.forEach((i) => { if (i.rawMaterialId === rawMaterialId) { balanceQty = i.quantity; balanceValue = i.quantity * (i.unitCost || 0); } });
  }
  // 2) حركات ما بعد الافتتاحي مجمعة زمنياً (GRN قبل التحويلات لنفس اليوم)
  interface MV { date: string; ord: number; qty: number; cost: number }
  const move: MV[] = [];
  const afterStart = (d: string) => !startDate || d.slice(0, 10) >= startDate;
  const inWindow = (d: string) => d.slice(0, 10) <= until;
  grnNotes
    .filter((g) => g.status === 'approved' && g.branchId === branchId && afterStart(g.date) && inWindow(g.date))
    .forEach((g) => g.items.forEach((i) => { if (i.rawMaterialId === rawMaterialId) move.push({ date: g.date.slice(0, 10), ord: 0, qty: i.quantityReceived, cost: i.unitPrice || 0 }); }));
  stockTransfers
    .filter((t) => t.status === 'approved' && inWindow(t.date))
    .forEach((t) => t.items.forEach((i) => {
      if (i.rawMaterialId !== rawMaterialId) return;
      if (t.fromBranchId === branchId) move.push({ date: t.date.slice(0, 10), ord: 1, qty: -i.quantity, cost: i.unitCost || 0 });
      if (t.toBranchId === branchId) move.push({ date: t.date.slice(0, 10), ord: 1, qty: i.quantity, cost: i.unitCost || 0 });
    }));
  move.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
  // 3) معالجة زمنية
  for (const m of move) {
    if (m.qty > 0) {
      balanceValue += m.qty * m.cost;
      balanceQty += m.qty;
    } else if (balanceQty > 0) {
      // الصادر يُقيَّم بمتوسط الرصيد الجاري قبل الصرف
      const avg = balanceValue / balanceQty;
      balanceValue += m.qty * avg;
      balanceQty += m.qty;
    }
  }
  if (balanceQty > 0) return balanceValue / balanceQty;
  return fallbackCost;
};