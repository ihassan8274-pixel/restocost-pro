// ==========================================================
// financialMetrics.ts — الحسابات المالية المركزية
// تُشارك بين كل التقارير المالية: P&L، تكلفة الطعام،
// الضريبة، عمولات التوصيل، المؤشرات الرئيسية.
// تستقبل بيانات جاهزة (مفلترة) وتعيد أرقاماً نقية.
// ==========================================================
import { pct } from '../_core/ReportTypes';
import { VAT_RATE } from '../../../utils/helpers';
import type { BatchSalesRecord, OperatingExpense, WastageLog } from '../../../types';

export interface CollectionSummary {
  revenue: number;
  foodCost: number;
  vatAmount: number;
  netRevenue: number;
  commissionAmount: number;
  netAfterCommission: number;
  wastageCost: number;
  operatingExpenses: number;
  laborCost: number;
}

/** مؤشرات مبيعات/تكلفة من قائمة إقفالات مبيعات */
export const summarizeSales = (records: BatchSalesRecord[]): CollectionSummary => {
  let revenue = 0, foodCost = 0, vatAmount = 0, netRevenue = 0, commissionAmount = 0, netAfterCommission = 0;
  records.forEach((r) => {
    revenue += r.totalRevenue || 0;
    foodCost += r.totalFoodCost || 0;
    vatAmount += r.vatAmount || 0;
    netRevenue += r.netRevenue || 0;
    commissionAmount += r.commissionAmount || 0;
    netAfterCommission += r.netAfterCommission || r.totalRevenue || 0;
  });
  return { revenue, foodCost, vatAmount, netRevenue, commissionAmount, netAfterCommission, wastageCost: 0, operatingExpenses: 0, laborCost: 0 };
};

export interface ExpenseSummary {
  paid: number;
  pending: number;
  overdue: number;
  total: number;
}

/** مصاريف تشغيلية حسب حالة الدفع */
export const summarizeExpenses = (expenses: OperatingExpense[]): ExpenseSummary => {
  const out = expenses.reduce(
    (acc, e) => {
      acc.total += e.amount || 0;
      if (e.paymentStatus === 'paid') acc.paid += e.amount || 0;
      else if (e.paymentStatus === 'pending') acc.pending += e.amount || 0;
      else acc.overdue += e.amount || 0;
      return acc;
    },
    { paid: 0, pending: 0, overdue: 0, total: 0 },
  );
  return out;
};

/** تكلفة تلف/هالك من سجل الهالك */
export const totalWastageCost = (wastage: WastageLog[]): number =>
  wastage.reduce((s, w) => s + (Number(w.totalCostImpact) || 0), 0);

/** مؤشر تكلفة الطعام كنسبة من الإيراد (آمنة في حالة المقام صفر) */
export const foodCostPercent = (cost: number, revenue: number): number => pct(cost, revenue);

/** هامش الربح الإجمالي المتبقي بعد تكلفة الطعام فقط */
export const grossMargin = (revenue: number, foodCost: number): number => revenue - foodCost;

/** هامش الربح التشغيلي p&l مبسّط: إيراد - تكلفة طعام - مصاريف */
export const operatingProfit = (revenue: number, foodCost: number, expenses: number): number =>
  revenue - foodCost - expenses;

export interface ProfitBreakdown {
  revenue: number;
  foodCost: number;
  foodCostPct: number;
  grossProfit: number;
  grossMarginPct: number;
  expenses: number;
  netProfit: number;
  netMarginPct: number;
  vatRate: number;
}

/** ملخص ربحية خطّي موحّد — يستخدمه أي تقرير مالي/p&l */
export const profitBreakdown = (
  revenue: number,
  foodCost: number,
  expenses: number,
  vatRate: number = VAT_RATE,
): ProfitBreakdown => {
  const foodCostPct = foodCostPercent(foodCost, revenue);
  const grossProfit = grossMargin(revenue, foodCost);
  const grossMarginPct = pct(grossProfit, revenue);
  const netProfit = operatingProfit(revenue, foodCost, expenses);
  const netMarginPct = pct(netProfit, revenue);
  return { revenue, foodCost, foodCostPct, grossProfit, grossMarginPct, expenses, netProfit, netMarginPct, vatRate };
};

/** متوسط إيراد وخسارة هالك لكل يوم عمل في النطاق */
export const dailyAverages = (records: BatchSalesRecord[], wastageCost: number, days: number) => ({
  avgRevenue: days ? (records.reduce((s, r) => s + (r.totalRevenue || 0), 0)) / days : 0,
  avgWastage: days ? wastageCost / days : 0,
});

/** تجميع إقفالات المبيعات حسب الفرع (للجداول/الرسم) */
export const groupSalesByBranch = (records: BatchSalesRecord[]) => {
  const map = new Map<string, { branchId: string; revenue: number; foodCost: number; netAfterCommission: number }>();
  records.forEach((r) => {
    const b = map.get(r.branchId) || { branchId: r.branchId, revenue: 0, foodCost: 0, netAfterCommission: 0 };
    b.revenue += r.totalRevenue || 0;
    b.foodCost += r.totalFoodCost || 0;
    b.netAfterCommission += r.netAfterCommission || r.totalRevenue || 0;
    map.set(r.branchId, b);
  });
  return Array.from(map.values());
};

/** توزيع المصاريف على الفروع حسب الفئة */
export const groupExpensesByCategory = (expenses: OperatingExpense[]) => {
  const map = new Map<string, number>();
  expenses.forEach((e) => {
    map.set(e.category, (map.get(e.category) || 0) + (e.amount || 0));
  });
  return map;
};