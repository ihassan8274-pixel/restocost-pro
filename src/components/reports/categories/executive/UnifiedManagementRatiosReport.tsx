import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem, type ReportResult } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmtMoney, VAT_RATE, netOfGross } from '../../../../utils/helpers';

const inDate = (d: string, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to);

/** المؤشرات الإدارية (KPI) الموحدة — نسب الربحية ودوران المخزون وكفاءة العمالة */
export const UnifiedManagementRatiosReport: React.FC = () => {
  const { batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, inventory, rawMaterials, visibleBranchIds, getAverageUnitCost, getBranchAverageUnitCost } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const view = useMemo(() => {
    const from = filters.from;
    const to = filters.to;
    const allowed = (b: string, d: string) => visibleBranchIds.includes(b) && inDate(d, from, to);

    const sales = batchSalesRecords.filter((b) => allowed(b.branchId, b.date));
    const pos = posOrders.filter((o) => allowed(o.branchId, o.date));
    const shiftsIn = shifts.filter((s) => allowed(s.branchId, s.date));
    const expensesIn = operatingExpenses.filter((e) => e.paymentStatus === 'paid' && allowed(e.branchId, e.dueDate));
    const wastageIn = wastageLogs.filter((w) => allowed(w.branchId, w.date));

    const revenue =
      sales.reduce((s, b) => s + (b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE)), 0) +
      pos.reduce((s, o) => s + o.subtotal, 0);
    const foodCost = sales.reduce((s, b) => s + b.totalFoodCost, 0) + pos.reduce((s, o) => s + o.totalCost, 0);
    const laborCost = shiftsIn.reduce((s, sh) => s + sh.totalShiftCost, 0);
    const operating = expensesIn.reduce((s, e) => s + e.amount, 0);
    const wastage = wastageIn.reduce((s, w) => s + w.totalCostImpact, 0);

    const transactions = sales.length + pos.length;
    const covers =
      pos.reduce((s, o) => s + o.items.reduce((x, i) => x + i.quantity, 0), 0) +
      sales.reduce((s, b) => s + b.items.reduce((x, i) => x + i.quantitySold, 0), 0);

    const laborHours = shiftsIn.reduce((s, sh) => s + (sh.hoursWorked || 0) + (sh.overtimeHours || 0), 0);

    const avgInventoryValue = inventory
      .filter((i) => visibleBranchIds.includes(i.branchId))
      .reduce((s, i) => {
        return s + i.quantity * getBranchAverageUnitCost(i.branchId, i.rawMaterialId);
      }, 0);

    const grossProfit = revenue - foodCost - laborCost;
    const netProfit = grossProfit - operating - wastage;
    const days = Math.max(1, (() => {
      const d0 = from ? new Date(from) : new Date('2020-01-01');
      const d1 = to ? new Date(to + 'T23:59:59') : new Date();
      return Math.ceil((d1.getTime() - d0.getTime()) / 86400000);
    })());

    const cogs = foodCost;
    const inventoryTurnover = avgInventoryValue > 0 ? cogs / avgInventoryValue : 0;
    const dioh = cogs > 0 ? (avgInventoryValue / cogs) * days : 0;
    const grossMarginPct = revenue ? (grossProfit / revenue) * 100 : 0;
    const foodCostPct = revenue ? (foodCost / revenue) * 100 : 0;
    const laborCostPct = revenue ? (laborCost / revenue) * 100 : 0;
    const wastagePct = revenue ? (wastage / revenue) * 100 : 0;
    const netMarginPct = revenue ? (netProfit / revenue) * 100 : 0;
    const avgTicket = transactions ? revenue / transactions : 0;
    const revPerCover = covers ? revenue / covers : 0;
    const revPerLaborHour = laborHours ? revenue / laborHours : 0;
    const primeCostPct = revenue ? ((foodCost + laborCost) / revenue) * 100 : 0;
    const breakEvenRevenue = grossMarginPct > 0 ? (operating + wastage + (laborCost || 0)) / (grossMarginPct / 100) : 0;

    const ratios = [
      { key: 'fc', label: 'تكلفة الطعام (Food Cost)', value: `${foodCostPct.toFixed(2)}%`, note: 'مقابل 35% معياري', tone: foodCostPct > 35 ? ('rose' as const) : ('emerald' as const) },
      { key: 'prime', label: 'التكلفة الأولية (طعام + عمالة)', value: `${primeCostPct.toFixed(2)}%`, note: 'مقابل 60% معياري', tone: primeCostPct > 60 ? ('rose' as const) : ('emerald' as const) },
      { key: 'labor', label: 'نسبة العمالة', value: `${laborCostPct.toFixed(2)}%`, note: 'مقابل 30% معياري', tone: laborCostPct > 30 ? ('rose' as const) : ('amber' as const) },
      { key: 'gross', label: 'الهامش الإجمالي', value: `${grossMarginPct.toFixed(2)}%`, note: '', tone: grossMarginPct > 0 ? ('emerald' as const) : ('rose' as const) },
      { key: 'net', label: 'صافي الهامش', value: `${netMarginPct.toFixed(2)}%`, note: '', tone: netMarginPct > 0 ? ('emerald' as const) : ('rose' as const) },
      { key: 'ticket', label: 'متوسط سعر الفاتورة', value: fmtMoney(avgTicket), note: '', tone: 'indigo' as const },
      { key: 'cover', label: 'الإيراد لكل غطاء (ضيف)', value: fmtMoney(revPerCover), note: '', tone: 'indigo' as const },
      { key: 'laborhr', label: 'الإيراد لكل ساعة عمل', value: fmtMoney(revPerLaborHour), note: '', tone: 'indigo' as const },
      { key: 'turnover', label: 'معدل دوران المخزون', value: inventoryTurnover.toFixed(2), note: `مرّات خلال ${days} يوم`, tone: 'default' as const },
      { key: 'dioh', label: 'أيام المبيعات في المخزون (DIOH)', value: `${dioh.toFixed(1)}`, note: 'أيام', tone: dioh > 30 ? ('amber' as const) : ('emerald' as const) },
      { key: 'wastage', label: 'نسبة الهوالك', value: `${wastagePct.toFixed(2)}%`, note: 'مقابل 5% معياري', tone: wastagePct > 5 ? ('rose' as const) : ('amber' as const) },
      { key: 'breakeven', label: 'نقطة التعادل (إيراد)', value: fmtMoney(breakEvenRevenue), note: 'إيراد يغطي التكاليف', tone: 'indigo' as const },
    ];

    const summaries: ReportSummaryItem[] = [
      { key: 'revenue', label: 'الإيراد', value: Math.round(revenue), tone: 'emerald' },
      { key: 'netProfit', label: 'صافي الربح', value: Math.round(netProfit), tone: netProfit >= 0 ? 'emerald' : 'rose' },
      { key: 'margin', label: 'صافي الهامش', value: netMarginPct, tone: netMarginPct >= 0 ? 'emerald' : 'rose', format: (v) => `${Number(v).toFixed(2)}%` },
      { key: 'turnover', label: 'دوران المخزون', value: inventoryTurnover, format: (v) => Number(v).toFixed(2), hint: `خلال ${days} يوم` },
      { key: 'ticket', label: 'متوسط الفاتورة', value: Math.round(avgTicket), tone: 'indigo' },
      { key: 'dioh', label: 'أيام في المخزون', value: dioh, tone: dioh > 30 ? 'amber' : 'emerald', format: (v) => `${Number(v).toFixed(1)} يوم` },
    ];

    const ratiosTable = new ReportTableBuilder()
      .addColumn(reportColumn('label', 'المؤشر'))
      .addColumn(reportColumn('value', 'القيمة'))
      .addColumn(reportColumn('note', 'ملاحظة'))
      .addRows(ratios.map((r) => ({ id: r.key, values: r })))
      .build();

    const result: ReportResult = {
      id: 'ratios',
      title: 'المؤشرات الإدارية (KPI) الموحدة',
      subtitle: 'نسب الربحية وكفاءة العمالة ودوران المخزون من الحركات الفعلية',
      summaries,
      tables: [ratiosTable],
      exportSheets: [{
        name: 'المؤشرات الإدارية',
        header: ['المؤشر', 'القيمة', 'ملاحظة'],
        rows: ratios.map((r) => [r.label, r.value, r.note || '']),
      }],
      generatedAt: new Date().toISOString(),
    };

    const visuals = (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <strong className="text-slate-800 block mb-1">كفاءة العمالة</strong>
              <span className="text-slate-600">الإيراد لكل ساعة عمل {fmtMoney(revPerLaborHour)} — كلما ارتفع دلّ على إنتاجية أعلى لنفس التكلفة البشرية ({revPerLaborHour > 0 && laborCost > 0 ? `${(revPerLaborHour / avgTicket).toFixed(1)}` : '0'} غطاء/ساعة تقديرياً).</span>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <strong className="text-slate-800 block mb-1">أيام المبيعات في المخزون</strong>
              <span className="text-slate-600">يكفي المخزون الحالي متوسط {dioh.toFixed(1)} يوم من المبيعات عند معدل الصرف الحالي. تحت 30 يوم صحية، أعلى من ذلك تجميد لرأس المال.</span>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <strong className="text-slate-800 block mb-1">نقطة التعادل</strong>
              <span className="text-slate-600">تحتاج إيراد {fmtMoney(breakEvenRevenue)} لتغطية التكاليف الثابتة والمتغيرة. الإيراد الحالي {breakEvenRevenue > 0 && revenue > 0 ? `${((revenue / breakEvenRevenue) * 100).toFixed(0)}%` : '—'} من نقطة التعادل.</span>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div>
              <strong className="text-slate-800 block mb-1">متوسط الفاتورة</strong>
              <span className="text-slate-600">متوسط قيمة الفاتورة {fmtMoney(avgTicket)} ومتوسط الوحدة/الضيف {fmtMoney(revPerCover)}. تُستخدم لمتابعة استراتيجية الأسعار والترويج.</span>
            </div>
          </div>
        </div>
      </div>
    );

    return { result, visuals };
  }, [batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, inventory, rawMaterials, visibleBranchIds, getAverageUnitCost, filters]);

  return (
    <ReportTemplate
      report={view.result}
      filters={filters}
      onFiltersChange={setFilters}
      visuals={view.visuals}
    />
  );
};

export default UnifiedManagementRatiosReport;