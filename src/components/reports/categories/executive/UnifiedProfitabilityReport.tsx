import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn, reportPct } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmt } from '../../../../utils/helpers';
import { summarizeSales, summarizeExpenses, totalWastageCost, profitBreakdown } from '../../utilities/financialMetrics';
import type { BatchSalesRecord, OperatingExpense, WastageLog, LaborShift } from '../../../../types';

interface BranchRowData {
  branchId: string;
  revenue: number;
  foodCost: number;
  labor: number;
  operational: number;
  wastage: number;
  netProfit: number;
  fcPct: number;
  marginPct: number;
}

interface ProfitabilityInput {
  saleRows: BatchSalesRecord[];
  expRows: OperatingExpense[];
  wasRows: WastageLog[];
  shiftRows: LaborShift[];
}

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

const buildProfitability = (input: ProfitabilityInput, getBranchName: (id: string) => string) => {
  const { saleRows, expRows, wasRows, shiftRows } = input;

  const sales = summarizeSales(saleRows);
  const expenses = summarizeExpenses(expRows.filter((e) => e.paymentStatus !== 'pending'));
  const wastageCost = totalWastageCost(wasRows);
  const labor = shiftRows.reduce((s, r) => s + (r.totalShiftCost || 0), 0);
  const pl = profitBreakdown(sales.revenue, sales.foodCost, expenses.paid + wastageCost + labor);
  const operational = expenses.paid;
  const totalCost = pl.expenses;
  const netProfit = pl.netProfit;
  const fcPct = pl.foodCostPct;
  const marginPct = pl.netMarginPct;

  const summaries: ReportSummaryItem[] = [
    { key: 'revenue', label: 'إجمالي الإيراد', value: pl.revenue, tone: 'indigo' },
    { key: 'foodCost', label: 'تكلفة الطعام', value: pl.foodCost, tone: 'amber' },
    { key: 'fcPct', label: 'نسبة Food Cost', value: fcPct, tone: fcPct > 35 ? 'rose' : 'emerald', format: (v) => `${fmt(Number(v))}%` },
    { key: 'labor', label: 'تكلفة العمالة', value: labor },
    { key: 'operational', label: 'المصاريف المدفوعة', value: operational },
    { key: 'wastage', label: 'الهوالك', value: wastageCost, tone: 'rose' },
    { key: 'net', label: 'صافي الربح', value: netProfit, tone: netProfit >= 0 ? 'emerald' : 'rose' },
    { key: 'margin', label: 'الهامش %', value: marginPct, tone: marginPct >= 0 ? 'emerald' : 'rose', format: (v) => `${fmt(Number(v))}%` },
  ];

  const t = new ReportTableBuilder()
    .addColumn(reportColumn('item', 'البند'))
    .addColumn({ ...reportColumn('value', 'القيمة'), aggregate: 'none' })
    .addRows([
      { id: 'rev', values: { item: 'إجمالي الإيراد', value: pl.revenue } },
      { id: 'fc', values: { item: 'تكلفة الطعام', value: pl.foodCost } },
      { id: 'labor', values: { item: 'تكلفة العمالة', value: labor } },
      { id: 'op', values: { item: 'المصاريف التشغيلية المدفوعة', value: operational } },
      { id: 'was', values: { item: 'الهوالك', value: wastageCost } },
      { id: 'total', values: { item: 'إجمالي التكاليف', value: totalCost } },
      { id: 'net', values: { item: 'صافي الربح', value: netProfit } },
    ]);

  const branchIds = Array.from(new Set([...saleRows, ...shiftRows, ...expRows, ...wasRows].map((r) => r.branchId)));
  const branchData: BranchRowData[] = branchIds.map((id) => {
    const rev = saleRows.filter((r) => r.branchId === id).reduce((s, r) => s + (r.totalRevenue || 0), 0);
    const fc = saleRows.filter((r) => r.branchId === id).reduce((s, r) => s + (r.totalFoodCost || 0), 0);
    const lab = shiftRows.filter((r) => r.branchId === id).reduce((s, r) => s + (r.totalShiftCost || 0), 0);
    const op = expRows.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + (e.amount || 0), 0);
    const was = wasRows.filter((r) => r.branchId === id).reduce((s, r) => s + (r.totalCostImpact || 0), 0);
    const net = rev - (fc + lab + op + was);
    return { branchId: id, revenue: rev, foodCost: fc, labor: lab, operational: op, wastage: was, netProfit: net, fcPct: rev ? (fc / rev) * 100 : 0, marginPct: rev ? (net / rev) * 100 : 0 };
  });

  const t2 = new ReportTableBuilder()
    .addColumn(reportColumn('branch', 'الفرع'))
    .addColumn({ ...reportColumn('rev', 'الإيراد'), aggregate: 'sum' })
    .addColumn({ ...reportColumn('fc', 'تكلفة الطعام'), aggregate: 'sum' })
    .addColumn(reportPct('fcPct', 'FC %'))
    .addColumn({ ...reportColumn('labor', 'العمالة'), aggregate: 'sum' })
    .addColumn({ ...reportColumn('op', 'المصاريف'), aggregate: 'sum' })
    .addColumn({ ...reportColumn('was', 'الهوالك'), aggregate: 'sum' })
    .addColumn({ ...reportColumn('net', 'صافي الربح'), aggregate: 'sum' })
    .addColumn(reportPct('margin', 'الهامش %'))
    .addRows(branchData.map((b) => ({
      id: b.branchId,
      values: {
        branch: branchName(b.branchId, getBranchName),
        rev: b.revenue, fc: b.foodCost, fcPct: b.fcPct,
        labor: b.labor, op: b.operational, was: b.wastage, net: b.netProfit, margin: b.marginPct,
      },
    })));

  const branchExportRows = branchData.map((b) => [
    branchName(b.branchId, getBranchName),
    b.revenue, b.foodCost, `${b.fcPct.toFixed(2)}%`, b.labor, b.operational, b.wastage, b.netProfit, `${b.marginPct.toFixed(2)}%`,
  ]);

  return {
    summaries,
    tables: [t.build(), t2.build()],
    exportSheets: [
      { name: 'ملخص الربحية', header: ['البند', 'القيمة'], rows: [['إجمالي الإيراد', pl.revenue], ['تكلفة الطعام', pl.foodCost], ['نسبة Food Cost', `${fcPct.toFixed(2)}%`], ['العمالة', labor], ['المصاريف', operational], ['الهوالك', wastageCost], ['إجمالي التكاليف', totalCost], ['صافي الربح', netProfit], ['الهامش', `${marginPct.toFixed(2)}%`]] },
      { name: 'تفصيل الفروع', header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'المصاريف', 'الهوالك', 'صافي الربح', 'الهامش %'], rows: branchExportRows },
    ],
  };
};

/** أول تقرير حقيقي مُحوّل للنمط الموحّد: الربحية الموحدة (P&L) لكل الفروع */
export const UnifiedProfitabilityReport: React.FC = () => {
  const { batchSalesRecords, operatingExpenses, wastageLogs, shifts, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(
    () => branches.map((b) => ({ id: b.id, name: b.nameAr })),
    [branches],
  );

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'profitability', title: 'الربحية الموحدة حسب الفرع', subtitle: 'الإيراد، تكلفة الطعام، العمالة، المصاريف، والهالك' }, [
      { name: 'sales', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
      { name: 'expenses', rows: operatingExpenses, date: (r: OperatingExpense) => r.dueDate, branch: (r: OperatingExpense) => r.branchId, status: (r: OperatingExpense) => r.paymentStatus },
      { name: 'wastage', rows: wastageLogs, date: (r: WastageLog) => r.date, branch: (r: WastageLog) => r.branchId },
      { name: 'shifts', rows: shifts, date: (r: LaborShift) => r.date, branch: (r: LaborShift) => r.branchId },
    ]);
    return e;
  }, [batchSalesRecords, operatingExpenses, wastageLogs, shifts]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('profitability', filters);
    const built = buildProfitability({
      saleRows: sources[0].rows as BatchSalesRecord[],
      expRows: sources[1].rows as OperatingExpense[],
      wasRows: sources[2].rows as WastageLog[],
      shiftRows: sources[3].rows as LaborShift[],
    }, getBranchName);
    return {
      id: 'profitability',
      title: 'الربحية الموحدة حسب الفرع',
      subtitle: 'الإيراد، تكلفة الطعام، العمالة، المصاريف، والهالك',
      summaries: built.summaries,
      tables: built.tables,
      exportSheets: built.exportSheets,
      generatedAt: new Date().toISOString(),
    };
  }, [engine, filters, getBranchName]);

  return (
    <ReportTemplate
      report={result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={branchOptions}
      showStatus
      statusOptions={[{ value: 'paid', label: 'مدفوع' }, { value: 'pending', label: 'مستحق' }, { value: 'overdue', label: 'متأخر' }]}
    />
  );
};

export default UnifiedProfitabilityReport;