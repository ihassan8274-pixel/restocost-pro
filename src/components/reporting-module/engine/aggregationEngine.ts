// ============================================================
// محرك التجميع الموحد (Aggregation Engine)
// يحسب جميع المقاييس من البيانات الخام مع Cache
// ============================================================

import type {
  ReportFilters,
  PeriodRange,
  MetricId,
  AggregatedRow,
  SeriesPoint,
  KPIValue,
  ReportResult,
  ReportMeta,
  DrillPath,
} from '../data';

import { getMetric } from '../data';
import {
  getBatchSales, getGRN, getInventory, getInventoryMovements,
  getDailyCounts, getOperatingExpenses, getJournal,
  getBranches, getRawMaterials,
  getShifts, getPayroll,
} from '../data/apiClient';

// كاش النتائج المحسوبة
interface ComputedCache {
  [reportId: string]: {
    result: ReportResult;
    computedAt: number;
    filtersHash: string;
  };
}

const computationCache: ComputedCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

// دوال مساعدة
function hashFilters(filters: ReportFilters): string {
  return JSON.stringify(filters);
}

function isCacheValid(reportId: string, filters: ReportFilters): boolean {
  const cached = computationCache[reportId];
  if (!cached) return false;
  if (Date.now() - cached.computedAt > CACHE_TTL) return false;
  if (cached.filtersHash !== hashFilters(filters)) return false;
  return true;
}

function setCache(reportId: string, filters: ReportFilters, result: ReportResult): void {
  computationCache[reportId] = {
    result,
    computedAt: Date.now(),
    filtersHash: hashFilters(filters),
  };
}

export function clearCache(reportId?: string): void {
  if (reportId) {
    delete computationCache[reportId];
  } else {
    Object.keys(computationCache).forEach(k => delete computationCache[k]);
  }
}

// ---------- دوال التجميع الأساسية ----------

// تجميع المبيعات حسب الفرع/التصنيف/الصنف
async function aggregateSales(filters: ReportFilters, comparePeriod?: PeriodRange) {
  const sales = await getBatchSales();
  const filtered = sales.filter(s => {
    if (s.date < filters.period.from || s.date > filters.period.to) return false;
    if (filters.branchIds?.length && !filters.branchIds.includes(s.branchId)) return false;
    return true;
  });
  
  // تجميع حسب الفرع
  const byBranch: Record<string, { revenue: number; cost: number; qty: number; count: number; branchName: string }> = {};
  
  for (const s of filtered) {
    const key = s.branchId;
    if (!byBranch[key]) byBranch[key] = { revenue: 0, cost: 0, qty: 0, count: 0, branchName: s.branchName };
    byBranch[key].count++;
    for (const item of s.items) {
      byBranch[key].revenue += item.lineTotalRevenue;
      byBranch[key].cost += item.lineTotalCost;
      byBranch[key].qty += item.quantitySold;
    }
  }
  
  // فترة المقارنة
  let compareData: Record<string, { revenue: number; cost: number; qty: number }> = {};
  if (comparePeriod) {
    const compareSales = sales.filter(s => 
      s.date >= comparePeriod.from && s.date <= comparePeriod.to &&
      (!filters.branchIds?.length || filters.branchIds.includes(s.branchId))
    );
    for (const s of compareSales) {
      const key = s.branchId;
      if (!compareData[key]) compareData[key] = { revenue: 0, cost: 0, qty: 0 };
      for (const item of s.items) {
        compareData[key].revenue += item.lineTotalRevenue;
        compareData[key].cost += item.lineTotalCost;
        compareData[key].qty += item.quantitySold;
      }
    }
  }
  
  return { byBranch, compareData };
}

// تجميع تكلفة الطعام الفعلية من الجرد والحركات
async function aggregateActualFoodCost(filters: ReportFilters) {
  const [movements, counts] = await Promise.all([
    getInventoryMovements(),
    getDailyCounts(),
  ]);
  
  // فلترة الحركات
  const filteredMovements = movements.filter(m => {
    if (m.date < filters.period.from || m.date > filters.period.to) return false;
    if (filters.branchIds?.length && !filters.branchIds.includes(m.branchId)) return false;
    return ['صرف', 'إنتاج', 'هالك', 'تعديل'].includes(m.type);
  });
  
  // تجميع المستهلك من الحركات
  const consumedByBranch: Record<string, number> = {};
  for (const m of filteredMovements) {
    if (m.delta < 0) {
      const key = m.branchId;
      // نحتاج سعر المادة - مبسط هنا
      consumedByBranch[key] = (consumedByBranch[key] || 0) + Math.abs(m.delta);
    }
  }
  
  // من الجرد اليومي (أدق)
  const consumedFromCounts: Record<string, number> = {};
  for (const c of counts) {
    if (c.date < filters.period.from || c.date > filters.period.to) continue;
    if (filters.branchIds?.length && !filters.branchIds.includes(c.branchId)) continue;
    const key = c.branchId;
    for (const item of c.items) {
      consumedFromCounts[key] = (consumedFromCounts[key] || 0) + item.consumedValue;
    }
  }
  
  // دمج: الأولوية للجرد اليومي
  const merged: Record<string, number> = { ...consumedByBranch };
  Object.assign(merged, consumedFromCounts);
  
  return merged;
}

// تجميع المشتريات
async function aggregatePurchases(filters: ReportFilters) {
  const grn = await getGRN();
  const filtered = grn.filter(g => 
    g.date >= filters.period.from && g.date <= filters.period.to &&
    g.status === 'approved' &&
    (!filters.branchIds?.length || filters.branchIds.includes(g.branchId))
  );
  
  const bySupplier: Record<string, { amount: number; vat: number; qty: number; count: number }> = {};
  const byBranch: Record<string, { amount: number; vat: number; count: number }> = {};
  
  for (const g of filtered) {
    // بالمورد
    const sKey = g.supplierId;
    if (!bySupplier[sKey]) bySupplier[sKey] = { amount: 0, vat: 0, qty: 0, count: 0 };
    bySupplier[sKey].amount += g.totalAmount;
    bySupplier[sKey].vat += g.vatAmount;
    bySupplier[sKey].count += 1;
    for (const item of g.items) bySupplier[sKey].qty += item.quantityReceived;
    
    // بالفرع
    const bKey = g.branchId;
    if (!byBranch[bKey]) byBranch[bKey] = { amount: 0, vat: 0, count: 0 };
    byBranch[bKey].amount += g.totalAmount;
    byBranch[bKey].vat += g.vatAmount;
    byBranch[bKey].count += 1;
  }
  
  return { bySupplier, byBranch, total: filtered.reduce((s, g) => s + g.totalAmount, 0) };
}

// تجميع المخزون
async function aggregateInventory(filters: ReportFilters) {
  const [inventory, materials] = await Promise.all([getInventory(), getRawMaterials()]);
  const matMap = new Map(materials.map(m => [m.id, m]));
  
  const filtered = inventory.filter(i => 
    !filters.branchIds?.length || filters.branchIds.includes(i.branchId)
  );
  
  const byBranch: Record<string, { value: number; lines: number }> = {};
  const byCategory: Record<string, { value: number; lines: number }> = {};
  
  for (const i of filtered) {
    const mat = matMap.get(i.rawMaterialId);
    if (!mat) continue;
    const value = i.quantity * mat.standardPrice;
    
    const bKey = i.branchId;
    if (!byBranch[bKey]) byBranch[bKey] = { value: 0, lines: 0 };
    byBranch[bKey].value += value;
    byBranch[bKey].lines += 1;
    
    const cKey = mat.category;
    if (!byCategory[cKey]) byCategory[cKey] = { value: 0, lines: 0 };
    byCategory[cKey].value += value;
    byCategory[cKey].lines += 1;
  }
  
  return { byBranch, byCategory };
}

// تجميع العمالة
async function aggregateLabor(filters: ReportFilters) {
  const [payroll, shifts] = await Promise.all([getPayroll(), getShifts()]);
  
  const payrollFiltered = payroll.filter(p => 
    p.month >= filters.period.from.slice(0, 7) && p.month <= filters.period.to.slice(0, 7)
  );
  
  const laborByBranch: Record<string, { cost: number; overtime: number }> = {};
  
  for (const p of payrollFiltered) {
    for (const line of p.lines) {
      if (filters.branchIds?.length && !filters.branchIds.includes(line.branchId)) continue;
      const key = line.branchId;
      if (!laborByBranch[key]) laborByBranch[key] = { cost: 0, overtime: 0 };
      laborByBranch[key].cost += line.baseSalary || 0;
    }
  }
  
  for (const s of shifts) {
    if (s.date < filters.period.from || s.date > filters.period.to) continue;
    if (filters.branchIds?.length && !filters.branchIds.includes(s.branchId)) continue;
    const key = s.branchId;
    if (!laborByBranch[key]) laborByBranch[key] = { cost: 0, overtime: 0 };
    laborByBranch[key].cost += s.totalShiftCost || 0;
    laborByBranch[key].overtime += s.overtimeHours * (s.totalShiftCost / Math.max(1, s.hoursWorked)) || 0;
  }
  
  return laborByBranch;
}

// تجميع المصاريف
async function aggregateExpenses(filters: ReportFilters) {
  const expenses = await getOperatingExpenses();
  const filtered = expenses.filter(e => 
    e.dueDate >= filters.period.from && e.dueDate <= filters.period.to &&
    e.paymentStatus !== 'cancelled' &&
    (!filters.branchIds?.length || filters.branchIds.includes(e.branchId))
  );
  
  const byBranch: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  
  for (const e of filtered) {
    const bKey = e.branchId;
    byBranch[bKey] = (byBranch[bKey] || 0) + e.amount;
    
    const cKey = e.category;
    byCategory[cKey] = (byCategory[cKey] || 0) + e.amount;
  }
  
  return { byBranch, byCategory, total: filtered.reduce((s, e) => s + e.amount, 0) };
}

// تجميع اليومية
async function aggregateJournal(filters: ReportFilters) {
  const journal = await getJournal();
  const filtered = journal.filter(j => 
    j.date >= filters.period.from && j.date <= filters.period.to
  );
  
  let totalDebit = 0, totalCredit = 0;
  const byAccount: Record<string, { debit: number; credit: number }> = {};
  
  for (const j of filtered) {
    for (const line of j.lines) {
      totalDebit += line.debit;
      totalCredit += line.credit;
      const key = line.accountId;
      if (!byAccount[key]) byAccount[key] = { debit: 0, credit: 0 };
      byAccount[key].debit += line.debit;
      byAccount[key].credit += line.credit;
    }
  }
  
  return { totalDebit, totalCredit, byAccount, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

// تجميع GRN غير المقيدة
async function aggregateGRNMatch(filters: ReportFilters) {
  const [grn, journal] = await Promise.all([getGRN(), getJournal()]);
  const journalRefs = new Set(journal.map(j => j.refNumber).filter(Boolean));
  
  const filtered = grn.filter(g => 
    g.date >= filters.period.from && g.date <= filters.period.to &&
    g.status === 'approved'
  );
  
  let matched = 0, unmatched = 0;
  for (const g of filtered) {
    if (journalRefs.has(g.grnNumber)) matched++; else unmatched++;
  }
  
  return { matched, unmatched, total: filtered.length };
}

// ---------- المحرك الرئيسي ----------

export interface ComputeOptions {
  reportId: string;
  definition: { metrics: MetricId[]; dimensions: string[]; kpiMetrics: MetricId[] };
  filters: ReportFilters;
  comparePeriod?: PeriodRange;
  useCache?: boolean;
}

export async function computeReport(options: ComputeOptions): Promise<ReportResult> {
  const { reportId, definition, filters, comparePeriod, useCache = true } = options;
  
  // فحص الكاش
  if (useCache && isCacheValid(reportId, filters)) {
    return { ...computationCache[reportId].result, meta: { ...computationCache[reportId].result.meta, fromCache: true } };
  }
  
  // تحميل البيانات المطلوبة (حسب المصادر المعرفة في التقرير)
  const [
    salesAgg,
    actualCostAgg,
    purchasesAgg,
    inventoryAgg,
    laborAgg,
    expensesAgg,
    _journalAgg,
    grnMatchAgg,
  ] = await Promise.all([
    aggregateSales(filters, comparePeriod),
    aggregateActualFoodCost(filters),
    aggregatePurchases(filters),
    aggregateInventory(filters),
    aggregateLabor(filters),
    aggregateExpenses(filters),
    aggregateJournal(filters),
    aggregateGRNMatch(filters),
  ]);
  
  // بناء الصفوف حسب الأبعاد
  const dimensions = definition.dimensions;
  const kpiMetrics = definition.kpiMetrics;
  
  // تحديد مفتاح التجميع الرئيسي (أول بعد)
  const primaryDim = dimensions[0] || 'branch';
  const branches = await getBranches();
  const branchMap = new Map(branches.map(b => [b.id, b.nameAr]));
  
  let rowKeys: string[];
  if (primaryDim === 'branch') {
    rowKeys = Array.from(new Set([
      ...Object.keys(salesAgg.byBranch),
      ...Object.keys(actualCostAgg),
      ...Object.keys(purchasesAgg.byBranch),
      ...Object.keys(inventoryAgg.byBranch),
      ...Object.keys(laborAgg),
      ...Object.keys(expensesAgg.byBranch),
    ])).filter(k => !filters.branchIds?.length || filters.branchIds.includes(k));
  } else {
    rowKeys = ['all'];
  }
  
  const rows: AggregatedRow[] = [];
  
  for (const key of rowKeys) {
    const branchName = branchMap.get(key) || key;
    const sales = salesAgg.byBranch[key] || { revenue: 0, cost: 0, qty: 0, count: 0, branchName };
    const compare = comparePeriod ? (salesAgg.compareData[key] || { revenue: 0, cost: 0, qty: 0 }) : null;
    const actualCost = actualCostAgg[key] || 0;
    const purchase = purchasesAgg.byBranch[key] || { amount: 0, vat: 0, count: 0 };
    const inventory = inventoryAgg.byBranch[key] || { value: 0, lines: 0 };
    const labor = laborAgg[key] || { cost: 0, overtime: 0 };
    const expense = expensesAgg.byBranch[key] || 0;
    
    // المقاييس الأساسية
    const revenue = sales.revenue;
    const foodCostTheoretical = sales.cost;
    const foodCostActual = actualCost || foodCostTheoretical; // fallback
    const foodCostVariance = foodCostActual - foodCostTheoretical;
    const foodCostVariancePct = foodCostTheoretical > 0 ? (foodCostVariance / foodCostTheoretical) * 100 : 0;
    const foodCostPct = revenue > 0 ? (foodCostTheoretical / revenue) * 100 : 0;
    const laborCost = labor.cost;
    const laborCostPct = revenue > 0 ? (laborCost / revenue) * 100 : 0;
    const overtimeCost = labor.overtime;
    const primeCost = foodCostActual + laborCost;
    const primeCostPct = revenue > 0 ? (primeCost / revenue) * 100 : 0;
    const opEx = expense;
    const opExPct = revenue > 0 ? (opEx / revenue) * 100 : 0;
    const netOp = revenue - foodCostActual - laborCost - opEx;
    const netOpPct = revenue > 0 ? (netOp / revenue) * 100 : 0;
    const inventoryValue = inventory.value;
    const qtySold = sales.qty;
    const ordersCount = sales.count;
    const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;
    const countVariance = 0;
    
    const row: AggregatedRow = {
      branchId: key,
      branchName,
      revenue,
      qtySold,
      ordersCount,
      avgOrderValue,
      countVariance,
      foodCostTheoretical,
      foodCostActual,
      foodCostVariance,
      foodCostVariancePct,
      foodCostPct,
      laborCost,
      laborCostPct,
      overtimeCost,
      primeCost,
      primeCostPct,
      opEx,
      opExPct,
      netOp,
      netOpPct,
      inventoryValue,
      purchaseAmount: purchase.amount,
      purchaseVat: purchase.vat,
      grnMatched: 0, // سيملأ لاحقاً
      grnUnmatched: 0,
    };
    
    // إضافة مقارنات إذا مطلوبة
    if (compare) {
      row.prevRevenue = compare.revenue;
      row.revenueGrowth = compare.revenue > 0 ? ((revenue - compare.revenue) / compare.revenue) * 100 : 0;
    }
    
    rows.push(row);
  }
  
  // صف الإجماليات
  const totals: AggregatedRow = {
    branchId: 'TOTAL',
    branchName: 'المجموع',
    revenue: rows.reduce((s, r) => s + num(r.revenue), 0),
    foodCostTheoretical: rows.reduce((s, r) => s + num(r.foodCostTheoretical), 0),
    foodCostActual: rows.reduce((s, r) => s + num(r.foodCostActual), 0),
    foodCostVariance: rows.reduce((s, r) => s + num(r.foodCostVariance), 0),
    foodCostVariancePct: 0,
    foodCostPct: 0,
    laborCost: rows.reduce((s, r) => s + num(r.laborCost), 0),
    laborCostPct: 0,
    overtimeCost: rows.reduce((s, r) => s + num(r.overtimeCost), 0),
    primeCost: rows.reduce((s, r) => s + num(r.primeCost), 0),
    primeCostPct: 0,
    opEx: rows.reduce((s, r) => s + num(r.opEx), 0),
    opExPct: 0,
    netOp: rows.reduce((s, r) => s + num(r.netOp), 0),
    netOpPct: 0,
    inventoryValue: rows.reduce((s, r) => s + num(r.inventoryValue), 0),
    purchaseAmount: rows.reduce((s, r) => s + num(r.purchaseAmount), 0),
    purchaseVat: rows.reduce((s, r) => s + num(r.purchaseVat), 0),
    qtySold: rows.reduce((s, r) => s + num(r.qtySold), 0),
    ordersCount: rows.reduce((s, r) => s + num(r.ordersCount), 0),
    avgOrderValue: 0,
    countVariance: rows.reduce((s, r) => s + num(r.countVariance), 0),
  };
  
  totals.avgOrderValue = num(totals.ordersCount) > 0 ? num(totals.revenue) / num(totals.ordersCount) : 0;
  
  // حساب نسب الإجماليات
  totals.foodCostVariancePct = num(totals.foodCostTheoretical) > 0 ? (num(totals.foodCostVariance) / num(totals.foodCostTheoretical)) * 100 : 0;
  totals.foodCostPct = num(totals.revenue) > 0 ? (num(totals.foodCostTheoretical) / num(totals.revenue)) * 100 : 0;
  totals.laborCostPct = num(totals.revenue) > 0 ? (num(totals.laborCost) / num(totals.revenue)) * 100 : 0;
  totals.primeCostPct = num(totals.revenue) > 0 ? (num(totals.primeCost) / num(totals.revenue)) * 100 : 0;
  totals.opExPct = num(totals.revenue) > 0 ? (num(totals.opEx) / num(totals.revenue)) * 100 : 0;
  totals.netOpPct = num(totals.revenue) > 0 ? (num(totals.netOp) / num(totals.revenue)) * 100 : 0;
  
  // KPIs
  const kpis: KPIValue[] = kpiMetrics.map(mid => {
    const def = getMetric(mid);
    const totalValue = num(totals[mid]);
    const prevValue = comparePeriod ? rows.reduce((s, r) => s + num(r[`prev${mid.charAt(0).toUpperCase() + mid.slice(1)}`]), 0) : 0;
    
    return {
      id: mid,
      value: totalValue,
      delta: prevValue ? ((totalValue - prevValue) / prevValue) : undefined,
      deltaAbs: prevValue ? totalValue - prevValue : undefined,
      direction: def.direction,
      labelAr: def.labelAr,
    };
  });
  
  // Series (للرسوم البيانية) - مبسط: حسب الأيام
  const series: SeriesPoint[] = [];
  if (filters.period.from !== filters.period.to) {
    const sales = await getBatchSales();
    const daily = sales.filter(s => s.date >= filters.period.from && s.date <= filters.period.to);
    const byDate: Record<string, { revenue: number; cost: number }> = {};
    for (const s of daily) {
      if (!byDate[s.date]) byDate[s.date] = { revenue: 0, cost: 0 };
      for (const item of s.items) {
        byDate[s.date].revenue += item.lineTotalRevenue;
        byDate[s.date].cost += item.lineTotalCost;
      }
    }
    for (const [date, vals] of Object.entries(byDate).sort()) {
      series.push({ label: date, revenue: vals.revenue, cost: vals.cost });
    }
  }
  
  // تحذيرات
  const warnings: string[] = [];
  if (!laborAgg || Object.keys(laborAgg).length === 0) warnings.push('بيانات ناقصة: العمالة');
  if (!expensesAgg.byBranch || Object.keys(expensesAgg.byBranch).length < 2) warnings.push('مصاريف التشغيل مدخلة لفرع واحد فقط');
  if (grnMatchAgg.unmatched > 0) warnings.push(`${grnMatchAgg.unmatched} سند GRN غير مقيد في اليومية`);
  
  // Meta
  const meta: ReportMeta = {
    reportId,
    family: reportId.split('-')[0] || 'general',
    generatedAt: new Date().toISOString(),
    period: filters.period,
    branchIds: filters.branchIds || [],
    fromCache: false,
    closed: false, // TODO: تحقق من closed_months
    recordCount: rows.length,
  };
  
  // Drill path
  const drill: DrillPath = {
    entity: primaryDim as DrillPath['entity'],
    next: dimensions.slice(1).filter(d => d !== primaryDim) as DrillPath['next'],
  };
  
  const result: ReportResult = { meta, kpis, rows, series, totals, drill, warnings };
  
  // حفظ في الكاش
  setCache(reportId, filters, result);
  
  return result;
}

export type { ComputedCache };
export { computationCache };