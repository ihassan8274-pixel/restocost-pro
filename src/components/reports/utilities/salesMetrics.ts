// ==========================================================
// salesMetrics.ts — حسابات المبيعات المركزية
// تُشارك بين كل تقارير المبيعات: اليومية، حسب الفرع، حسب
// المصدر (فرع/توصيل)، عمولات التوصيل، والقنوات.
// ==========================================================
import { pct } from '../_core/ReportTypes';
import type { BatchSalesRecord } from '../../../types';

export const SOURCE_LABELS: Record<string, string> = {
  branch: 'فرع مباشر',
  delivery: 'توصيل',
  foodics: 'Foodics',
};

export interface SalesTotals {
  revenue: number;
  netRevenue: number;
  vatAmount: number;
  foodCost: number;
  commissionAmount: number;
  netAfterCommission: number;
  orders: number;
}

export const salesTotals = (records: BatchSalesRecord[]): SalesTotals => {
  const out = { revenue: 0, netRevenue: 0, vatAmount: 0, foodCost: 0, commissionAmount: 0, netAfterCommission: 0, orders: 0 };
  records.forEach((r) => {
    out.revenue += r.totalRevenue || 0;
    out.netRevenue += r.netRevenue || 0;
    out.vatAmount += r.vatAmount || 0;
    out.foodCost += r.totalFoodCost || 0;
    out.commissionAmount += r.commissionAmount || 0;
    out.netAfterCommission += r.netAfterCommission || r.totalRevenue || 0;
    out.orders += r.items ? r.items.length : 0;
  });
  return out;
};

/** متوسط إيراد اليوم في نطاق محدد (عدد أيام مفلترة) */
export const avgDailyRevenue = (records: BatchSalesRecord[], days: number): number => {
  const total = records.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  return days ? total / days : 0;
};

/** تجميع المبيعات حسب اليوم (سلسلة زمنية للرسم/التقرير اليومي) */
export const dailySalesSeries = (records: BatchSalesRecord[]) => {
  const map = new Map<string, { revenue: number; foodCost: number }>();
  records.forEach((r) => {
    const d = map.get(r.date) || { revenue: 0, foodCost: 0 };
    d.revenue += r.totalRevenue || 0;
    d.foodCost += r.totalFoodCost || 0;
    map.set(r.date, d);
  });
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({ date, revenue: v.revenue, foodCost: v.foodCost }));
};

/** تجميع المبيعات حسب الفرع مع نسب مساهمة */
export const salesByBranch = (records: BatchSalesRecord[]) => {
  const totals = salesTotals(records);
  const map = new Map<string, { branchId: string; revenue: number; foodCost: number; commission: number }>();
  records.forEach((r) => {
    const b = map.get(r.branchId) || { branchId: r.branchId, revenue: 0, foodCost: 0, commission: 0 };
    b.revenue += r.totalRevenue || 0;
    b.foodCost += r.totalFoodCost || 0;
    b.commission += r.commissionAmount || 0;
    map.set(r.branchId, b);
  });
  return Array.from(map.values())
    .map((b) => ({ ...b, sharePct: pct(b.revenue, totals.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
};

/** توزيع المبيعات حسب المصدر (قناة البيع) */
export const salesBySource = (records: BatchSalesRecord[]) => {
  const map = new Map<string, number>();
  records.forEach((r) => {
    const key = r.source || 'branch';
    map.set(key, (map.get(key) || 0) + (r.totalRevenue || 0));
  });
  const totals = salesTotals(records);
  return Array.from(map.entries()).map(([source, revenue]) => ({
    source,
    label: SOURCE_LABELS[source] || source,
    revenue,
    sharePct: pct(revenue, totals.revenue),
  }));
};

/** صافي إيراد فعلي بعد عمولات التوصيل (المستلم فعلياً) */
export const netAfterCommissions = (records: BatchSalesRecord[]): number => {
  const t = salesTotals(records);
  return t.netAfterCommission > 0 ? t.netAfterCommission : t.revenue - t.commissionAmount;
};