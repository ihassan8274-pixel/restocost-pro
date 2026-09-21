import { BranchPLSummary } from '../types';

export interface FinancialDataSource {
  posOrders: { branchId: string; date: string; subtotal: number; totalCost: number }[];
  batchSales: { branchId: string; date: string; netRevenue: number; totalFoodCost: number }[];
  shifts: { branchId: string; date: string; totalShiftCost: number }[];
  expenses: { branchId: string; dueDate: string; paymentStatus: string; amount: number }[];
  wastage: { branchId: string; date: string; totalCostImpact: number }[];
}

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const monthKeyOf = (date: string) => date.slice(0, 7);

export const monthLabelFor = (monthKey: string) => {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
};

export interface RawPLRow {
  branchId: string;
  periodKey: string;
  period: string;
  branchName: string;
  totalSales: number;
  foodCost: number;
  laborCost: number;
  operatingExpenses: number;
  wastage: number;
}

export function buildPLRows(d: FinancialDataSource, opts: { monthKey?: string } = {}): RawPLRow[] {
  const map = new Map<string, RawPLRow>();
  const add = (branchId: string, date: string, sales: number, food: number, labor: number, exp: number, was: number) => {
    const periodKey = monthKeyOf(date);
    if (opts.monthKey && periodKey !== opts.monthKey) return;
    const key = `${branchId}|${periodKey}`;
    const cur = map.get(key) || {
      branchId, periodKey, period: monthLabelFor(periodKey), branchName: '',
      totalSales: 0, foodCost: 0, laborCost: 0, operatingExpenses: 0, wastage: 0,
    };
    cur.totalSales += sales; cur.foodCost += food; cur.laborCost += labor; cur.operatingExpenses += exp; cur.wastage += was;
    map.set(key, cur);
  };
  d.posOrders.forEach((o) => add(o.branchId, o.date, o.subtotal, o.totalCost, 0, 0, 0));
  d.batchSales.forEach((b) => add(b.branchId, b.date, b.netRevenue, b.totalFoodCost, 0, 0, 0));
  d.shifts.forEach((s) => add(s.branchId, s.date, 0, 0, s.totalShiftCost, 0, 0));
  d.expenses.forEach((e) => { if (e.paymentStatus === 'paid') add(e.branchId, e.dueDate, 0, 0, 0, e.amount, 0); });
  d.wastage.forEach((w) => add(w.branchId, w.date, 0, 0, 0, 0, w.totalCostImpact));
  return Array.from(map.values()).sort((a, b) => (a.periodKey === b.periodKey ? a.branchId.localeCompare(b.branchId) : a.periodKey.localeCompare(b.periodKey)));
}

export function toPLSummaries(rows: RawPLRow[], nameOf: (id: string) => string): BranchPLSummary[] {
  return rows.map((r) => {
    const branchName = r.branchName || nameOf(r.branchId);
    const primeCost = r.foodCost + r.laborCost;
    const netProfit = r.totalSales - (primeCost + r.operatingExpenses + r.wastage);
    const pct = (v: number) => r.totalSales ? Number(((v / r.totalSales) * 100).toFixed(2)) : 0;
    return {
      branchId: r.branchId,
      branchName,
      period: r.period,
      totalSales: Number(r.totalSales.toFixed(2)),
      foodCost: Number(r.foodCost.toFixed(2)),
      laborCost: Number(r.laborCost.toFixed(2)),
      primeCost: Number(primeCost.toFixed(2)),
      operatingExpenses: Number(r.operatingExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      foodCostPercent: pct(r.foodCost),
      laborCostPercent: pct(r.laborCost),
      primeCostPercent: pct(primeCost),
      netProfitPercent: pct(netProfit),
    };
  });
}

export function buildPLSummaries(d: FinancialDataSource, nameOf: (id: string) => string, opts: { monthKey?: string } = {}): BranchPLSummary[] {
  return toPLSummaries(buildPLRows(d, opts), nameOf);
}