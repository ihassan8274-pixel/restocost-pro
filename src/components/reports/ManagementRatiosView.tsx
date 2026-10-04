import React, { useMemo, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Receipt, Users, Boxes, Printer, DollarSign } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, StatCard } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface RatioRow { key: string; label: string; value: string; note?: string; tone: 'emerald' | 'rose' | 'amber' | 'indigo' | 'default'; }

export const ManagementRatiosView: React.FC = () => {
  const {
    batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs,
    inventory, rawMaterials, visibleBranchIds, getAverageUnitCost, getBranchAverageUnitCost,
  } = useApp();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const metrics = useMemo(() => {
    const sales = batchSalesRecords.filter((s) => visibleBranchIds.includes(s.branchId) && inDate(s.date));
    const pos = posOrders.filter((o) => visibleBranchIds.includes(o.branchId) && inDate(o.date));
    const shiftsIn = shifts.filter((s) => visibleBranchIds.includes(s.branchId) && inDate(s.date));
    const expensesIn = operatingExpenses.filter((e) => e.paymentStatus === 'paid' && visibleBranchIds.includes(e.branchId) && inDate(e.dueDate));
    const wastageIn = wastageLogs.filter((w) => visibleBranchIds.includes(w.branchId) && inDate(w.date));

    const revenue = sales.reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15) / 100)), 0) + pos.reduce((s, o) => s + o.subtotal, 0);
    const foodCost = sales.reduce((s, b) => s + b.totalFoodCost, 0) + pos.reduce((s, o) => s + o.totalCost, 0);
    const laborCost = shiftsIn.reduce((s, sh) => s + sh.totalShiftCost, 0);
    const operating = expensesIn.reduce((s, e) => s + e.amount, 0);
    const wastage = wastageIn.reduce((s, w) => s + w.totalCostImpact, 0);

    const transactions = sales.length + pos.length;
    const covers = pos.reduce((s, o) => s + o.items.reduce((x, i) => x + i.quantity, 0), 0) + sales.reduce((s, b) => s + b.items.reduce((x, i) => x + i.quantitySold, 0), 0);

    const laborHours = shiftsIn.reduce((s, sh) => s + (sh.hoursWorked || 0) + (sh.overtimeHours || 0), 0);

    const avgInventoryValue = inventory.filter((i) => visibleBranchIds.includes(i.branchId)).reduce((s, i) => {
      return s + i.quantity * getBranchAverageUnitCost(i.branchId, i.rawMaterialId);
    }, 0);

    const grossProfit = revenue - foodCost - laborCost;
    const netProfit = grossProfit - operating - wastage;
    const days = Math.max(1, (() => {
      const from = fromDate ? new Date(fromDate) : new Date('2020-01-01');
      const to = toDate ? new Date(toDate + 'T23:59:59') : new Date();
      return Math.ceil((to.getTime() - from.getTime()) / 86400000);
    })());

    const cogs = foodCost;
    const inventoryTurnover = avgInventoryValue > 0 ? cogs / avgInventoryValue : 0;
    const dioh = cogs > 0 ? (avgInventoryValue / cogs) * days : 0;
    const grossMarginPct = revenue ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue, foodCost, laborCost, operating, wastage, transactions, covers,
      laborHours, avgInventoryValue, grossProfit, netProfit, days, inventoryTurnover, dioh, grossMarginPct,
      foodCostPct: revenue ? (foodCost / revenue) * 100 : 0,
      laborCostPct: revenue ? (laborCost / revenue) * 100 : 0,
      operatingPct: revenue ? (operating / revenue) * 100 : 0,
      wastagePct: revenue ? (wastage / revenue) * 100 : 0,
      netMarginPct: revenue ? (netProfit / revenue) * 100 : 0,
      avgTicket: transactions ? revenue / transactions : 0,
      revPerCover: covers ? revenue / covers : 0,
      revPerLaborHour: laborHours ? revenue / laborHours : 0,
      laborPctOfSales: revenue ? (laborCost / revenue) * 100 : 0,
      primeCostPct: revenue ? ((foodCost + laborCost) / revenue) * 100 : 0,
      breakEvenRevenue: grossMarginPct > 0 ? (operating + wastage + (laborCost || 0)) / (grossMarginPct / 100) : 0,
    };
  }, [batchSalesRecords, posOrders, shifts, operatingExpenses, wastageLogs, inventory, rawMaterials, visibleBranchIds, fromDate, toDate, getAverageUnitCost]);

  const ratios: RatioRow[] = [
    { key: 'fc', label: 'تكلفة الطعام (Food Cost)', value: `${metrics.foodCostPct.toFixed(2)}%`, tone: metrics.foodCostPct > 35 ? 'rose' : 'emerald', note: 'مقابل 35% معياري' },
    { key: 'prime', label: 'التكلفة الأولية (طعام + عمالة)', value: `${metrics.primeCostPct.toFixed(2)}%`, tone: metrics.primeCostPct > 60 ? 'rose' : 'emerald', note: 'مقابل 60% معياري' },
    { key: 'labor', label: 'نسبة العمالة', value: `${metrics.laborCostPct.toFixed(2)}%`, tone: metrics.laborCostPct > 30 ? 'rose' : 'amber', note: 'مقابل 30% معياري' },
    { key: 'gross', label: 'الهامش الإجمالي', value: `${metrics.grossMarginPct.toFixed(2)}%`, tone: metrics.grossMarginPct > 0 ? 'emerald' : 'rose' },
    { key: 'net', label: 'صافي الهامش', value: `${metrics.netMarginPct.toFixed(2)}%`, tone: metrics.netMarginPct > 0 ? 'emerald' : 'rose' },
    { key: 'ticket', label: 'متوسط سعر الفاتورة', value: fmtMoney(metrics.avgTicket), tone: 'indigo' },
    { key: 'cover', label: 'الإيراد لكل غطاء (ضيف)', value: fmtMoney(metrics.revPerCover), tone: 'indigo' },
    { key: 'laborhr', label: 'الإيراد لكل ساعة عمل', value: fmtMoney(metrics.revPerLaborHour), tone: 'indigo' },
    { key: 'turnover', label: 'معدل دوران المخزون', value: `${metrics.inventoryTurnover.toFixed(2)}`, tone: 'default', note: `مرّات خلال ${metrics.days} يوم` },
    { key: 'dioh', label: 'أيام المبيعات في المخزون (DIOH)', value: `${metrics.dioh.toFixed(1)}`, tone: metrics.dioh > 30 ? 'amber' : 'emerald', note: 'أيام' },
    { key: 'wastage', label: 'نسبة الهوالك', value: `${metrics.wastagePct.toFixed(2)}%`, tone: metrics.wastagePct > 5 ? 'rose' : 'amber' },
    { key: 'breakeven', label: 'نقطة التعادل (إيراد)', value: fmtMoney(metrics.breakEvenRevenue), tone: 'indigo', note: 'إيراد يغطي التكاليف' },
  ];

  const exportSheets = [{
    name: 'المؤشرات الإدارية',
    header: ['المؤشر', 'القيمة'],
    rows: [
      ['الإيراد', metrics.revenue], ['تكلفة الطعام', metrics.foodCost], ['نسبة Food Cost', `${metrics.foodCostPct.toFixed(2)}%`],
      ['تكلفة العمالة', metrics.laborCost], ['نسبة العمالة', `${metrics.laborCostPct.toFixed(2)}%`],
      ['التشغيلية', metrics.operating], ['الهوالك', metrics.wastage],
      ['إجمالي الربح', metrics.grossProfit], ['صافي الربح', metrics.netProfit], ['صافي الهامش', `${metrics.netMarginPct.toFixed(2)}%`],
      ['متوسط الفاتورة', metrics.avgTicket], ['الإيراد لكل ضيف', metrics.revPerCover], ['الإيراد لكل ساعة عمل', metrics.revPerLaborHour],
      ['دوران المخزون', metrics.inventoryTurnover], ['أيام في المخزون', metrics.dioh],
    ],
  }];

  const printReport = () => {
    openPrintWindow({
      title: 'المؤشرات الإدارية (Management Ratios)',
      subtitle: `${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`,
      meta: [
        ['الإيراد', `${fmtMoney(metrics.revenue)}`], ['صافي الربح', `${fmtMoney(metrics.netProfit)}`],
        ['صافي الهامش', `${metrics.netMarginPct.toFixed(2)}%`], ['نسبة Food Cost', `${metrics.foodCostPct.toFixed(2)}%`],
      ],
      tables: [{
        title: 'المؤشرات',
        header: ['المؤشر', 'القيمة', 'ملاحظة'],
        rows: ratios.map((r) => [r.label, r.value, r.note || '']),
      }],
      totals: [['الإيراد', `${fmtMoney(metrics.revenue)}`], ['صافي الربح', `${fmtMoney(metrics.netProfit)}`]],
      footer: 'مؤشرات إدارية تُحتسب من الحركات الفعلية — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المؤشرات الإدارية (KPI)" subtitle="نسب الربحية، كفاءة العمالة، دوران المخزون، ومؤشرات أداء رئيسية محسوبة من البيانات الفعلية" icon={<Activity className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar filename="المؤشرات الإدارية" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('المؤشرات_الإدارية.csv', exportSheets[0].header, exportSheets[0].rows)}><DollarSign className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
        <div className="text-[10px] text-slate-500 font-bold basis-full">تُحتسب المؤشرات من حركات المبيعات المجمعة والنقاط (POS) والوظائف والمصاريف والهوالك ضمن النطاق وبما يتوافق مع الفروع المسموح بها.</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الإيراد" value={fmtMoney(metrics.revenue)} tone="emerald" icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="صافي الربح" value={fmtMoney(metrics.netProfit)} tone={metrics.netProfit >= 0 ? 'emerald' : 'rose'} icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="صافي الهامش" value={`${metrics.netMarginPct.toFixed(2)}%`} tone={metrics.netMarginPct >= 0 ? 'emerald' : 'rose'} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="دوران المخزون" value={`${metrics.inventoryTurnover.toFixed(2)}`} tone="indigo" icon={<Boxes className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ratios.map((r) => (
          <div key={r.key} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-bold mb-1">
              {r.key === 'fc' || r.key === 'prime' || r.key === 'labor' ? <Receipt className="w-3.5 h-3.5" /> : r.key === 'turnover' || r.key === 'dioh' ? <Boxes className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {r.label}
            </div>
            <strong className={`text-lg font-extrabold font-mono block ${r.tone === 'emerald' ? 'text-emerald-700' : r.tone === 'rose' ? 'text-rose-600' : r.tone === 'amber' ? 'text-amber-600' : r.tone === 'indigo' ? 'text-indigo-700' : 'text-slate-900'}`}>{r.value}</strong>
            {r.note && <span className="text-[10px] text-slate-400 font-bold block mt-1">{r.note}</span>}
          </div>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">قراءة المؤشرات</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Users className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div><strong className="text-slate-800 block mb-1">كفاءة العمالة</strong><span className="text-slate-600">الإيراد لكل ساعة عمل {fmtMoney(metrics.revPerLaborHour)} — كلما ارتفع دلّ على إنتاجية أعلى لنفس التكلفة البشرية ({metrics.revPerLaborHour > 0 && metrics.laborCost > 0 ? `${(metrics.revPerLaborHour / metrics.avgTicket).toFixed(1)}` : '0'} غطاء/ساعة تقديرياً).</span></div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <TrendingDown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div><strong className="text-slate-800 block mb-1">أيام المبيعات في المخزون</strong><span className="text-slate-600">يكفي المخزون الحالي متوسط {metrics.dioh.toFixed(1)} يوم من المبيعات عند معدل الصرف الحالي. تحت 30 يوم صحية، أعلى من ذلك تجميد لرأس المال.</span></div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div><strong className="text-slate-800 block mb-1">نقطة التعادل</strong><span className="text-slate-600">تحتاج إيراد {fmtMoney(metrics.breakEvenRevenue)} لتغطية التكاليف الثابتة والمتغيرة. الإيراد الحالي {metrics.breakEvenRevenue > 0 && metrics.revenue > 0 ? `${((metrics.revenue / metrics.breakEvenRevenue) * 100).toFixed(0)}%` : '—'} من نقطة التعادل.</span></div>
          </div>
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <DollarSign className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div><strong className="text-slate-800 block mb-1">متوسط الفاتورة</strong><span className="text-slate-600">متوسط قيمة الفاتورة {fmtMoney(metrics.avgTicket)} ومتوسط الوحدة/الضيف {fmtMoney(metrics.revPerCover)}. تُستخدم لمتابعة استراتيجية الأسعار والترويج.</span></div>
          </div>
        </div>
      </Card>
    </div>
  );
};
