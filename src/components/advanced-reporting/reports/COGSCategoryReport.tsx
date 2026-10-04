import React, { useMemo, useState } from 'react';
import { Printer, BarChart3 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';
import type { BatchSalesRecord } from '../../../types/pos';

interface CostRow {
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  costPct: number;
  profit: number;
  profitPct: number;
}

interface CostTotals {
  quantity: number;
  revenue: number;
  cost: number;
  costPct: number;
  profit: number;
  profitPct: number;
}

interface ItemAgg {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  cost: number;
}

const foodCategories = ['main_dish', 'appetizer', 'dessert', 'side', 'welcome', 'breakfast'];
const beverageCategories = ['beverage', 'drink', 'cold_drink', 'hot_drink'];

const buildRows = (records: BatchSalesRecord[], categories: string[]): CostRow[] => {
  const map = new Map<string, ItemAgg>();
  records.forEach((r) => {
    const vatRate = (r.vatRate || 0) / 100;
    (r.items || []).forEach((it) => {
      if (categories.length && !categories.includes(it.category)) return;
      const key = it.recipeId;
      const cur = map.get(key) || { name: it.recipeNameAr || it.recipeId, category: it.category, quantity: 0, revenue: 0, cost: 0 };
      cur.quantity += it.quantitySold || 0;
      // استخدام صافي الإيراد (بدون ضريبة) = lineTotalRevenue / (1 + vatRate)
      const grossRevenue = it.lineTotalRevenue || 0;
      const netRevenue = vatRate > 0 ? grossRevenue / (1 + vatRate) : grossRevenue;
      cur.revenue += netRevenue;
      cur.cost += it.lineTotalCost || 0;
      map.set(key, cur);
    });
  });
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((g) => {
      const profit = g.revenue - g.cost;
      return {
        name: g.name,
        quantity: g.quantity,
        revenue: g.revenue,
        cost: g.cost,
        costPct: g.revenue ? (g.cost / g.revenue) * 100 : 0,
        profit,
        profitPct: g.revenue ? (profit / g.revenue) * 100 : 0,
      };
    });
};

const sumRows = (rows: CostRow[]): CostTotals => {
  const t = rows.reduce(
    (acc, r) => {
      acc.quantity += r.quantity;
      acc.revenue += r.revenue;
      acc.cost += r.cost;
      return acc;
    },
    { quantity: 0, revenue: 0, cost: 0, costPct: 0, profit: 0, profitPct: 0 }
  );
  t.profit = t.revenue - t.cost;
  t.costPct = t.revenue ? (t.cost / t.revenue) * 100 : 0;
  t.profitPct = t.revenue ? (t.profit / t.revenue) * 100 : 0;
  return t;
};

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const costHeaders = ['الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'نسبة التكلفة%', 'الربح', 'نسبة الربح%'];
const costRow = (r: CostRow): (string | number)[] => [
  r.name,
  r.quantity,
  r.revenue,
  r.cost,
  r.costPct.toFixed(1),
  r.profit,
  r.profitPct.toFixed(1),
];

export const COGSCategoryReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'food' | 'beverage' | 'summary'>('food');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );

  const currentPeriodValue = useMemo(() => currentPeriod || periods[0] || new Date().toISOString().slice(0, 7), [currentPeriod, periods]);

  const filteredRecords = useMemo(
    () =>
      batchSalesRecords.filter(
        (b) =>
          (b.date || '').startsWith(currentPeriodValue) &&
          (branchFilter === 'all' || b.branchId === branchFilter)
      ),
    [batchSalesRecords, currentPeriodValue, branchFilter]
  );

  const foodRows = useMemo(() => buildRows(filteredRecords, foodCategories), [filteredRecords]);
  const beverageRows = useMemo(() => buildRows(filteredRecords, beverageCategories), [filteredRecords]);
  const foodTotals = useMemo(() => sumRows(foodRows), [foodRows]);
  const bevTotals = useMemo(() => sumRows(beverageRows), [beverageRows]);
  const grandTotals = useMemo(() => sumRows([...foodRows, ...beverageRows]), [foodRows, beverageRows]);

  const foodRatio = grandTotals.revenue ? (foodTotals.revenue / grandTotals.revenue) * 100 : 0;
  const bevRatio = grandTotals.revenue ? (bevTotals.revenue / grandTotals.revenue) * 100 : 0;

  const periodLabel = monthLabel(currentPeriodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const printReport = (tabType: 'food' | 'beverage' | 'summary') => {
    const titleMap = { food: 'تكلفة المأكولات', beverage: 'تكلفة المشروبات', summary: 'ملخص تكلفة المبيعات' };
    const title = titleMap[tabType];

    let tables: { title?: string; header: string[]; rows: (string | number)[][] }[] = [];

    if (tabType === 'food' || tabType === 'beverage') {
      const rows = tabType === 'food' ? foodRows : beverageRows;
      const totals = tabType === 'food' ? foodTotals : bevTotals;
      tables = [{
        title: tabType === 'food' ? 'الإجمالي (المأكولات)' : 'الإجمالي (المشروبات)',
        header: costHeaders,
        rows: [
          ...rows.map(costRow),
          ['الإجمالي', totals.quantity, totals.revenue, totals.cost, totals.costPct.toFixed(1), totals.profit, totals.profitPct.toFixed(1)],
        ],
      }];
    } else {
      tables = [{
        title: 'ملخص تكلفة المبيعات',
        header: ['المجموعة', 'الكمية', 'الإيراد', 'التكلفة', 'نسبة التكلفة%', 'الربح', 'نسبة الربح%'],
        rows: [
          ['المأكولات', foodTotals.quantity, foodTotals.revenue, foodTotals.cost, foodTotals.costPct.toFixed(1), foodTotals.profit, foodTotals.profitPct.toFixed(1)],
          ['المشروبات', bevTotals.quantity, bevTotals.revenue, bevTotals.cost, bevTotals.costPct.toFixed(1), bevTotals.profit, bevTotals.profitPct.toFixed(1)],
          ['الإجمالي', grandTotals.quantity, grandTotals.revenue, grandTotals.cost, grandTotals.costPct.toFixed(1), grandTotals.profit, grandTotals.profitPct.toFixed(1)],
        ],
      }];
    }

    openPrintWindow({
      title: `تقرير ${title}`,
      subtitle: `${COMPANY} — ${periodLabel}`,
      meta: [
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
      ],
      tables,
      footer: `${COMPANY} — ${title}`,
    });
  };

  const costTable = (rows: CostRow[], totals: CostTotals, label: string, printKey: 'food' | 'beverage') => (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800 text-lg">{label}</h3>
        <div className="flex items-center gap-2">
          <Btn tone="ghost" onClick={() => printReport(printKey)}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold">
              {costHeaders.map((h) => (
                <th key={h} className="p-2 text-right">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2 font-bold text-slate-800">{r.name}</td>
                <td className="tnum text-left p-2">{fmt(r.quantity)}</td>
                <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(r.revenue)}</td>
                <td className="tnum text-left p-2 text-rose-600">{fmtMoney(r.cost)}</td>
                <td className="tnum text-left p-2 text-amber-700">{r.costPct.toFixed(1)}%</td>
                <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(r.profit)}</td>
                <td className="tnum text-left p-2 text-slate-700">{r.profitPct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <td className="p-2">الإجمالي</td>
              <td className="tnum text-left p-2">{fmt(totals.quantity)}</td>
              <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(totals.revenue)}</td>
              <td className="tnum text-left p-2 text-rose-600">{fmtMoney(totals.cost)}</td>
              <td className="tnum text-left p-2 text-amber-700">{totals.costPct.toFixed(1)}%</td>
              <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(totals.profit)}</td>
              <td className="tnum text-left p-2 text-slate-700">{totals.profitPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );

  const excelSheets = [
    {
      name: 'المأكولات',
      header: costHeaders,
      rows: [...foodRows.map(costRow), ['الإجمالي', foodTotals.quantity, foodTotals.revenue, foodTotals.cost, foodTotals.costPct.toFixed(1), foodTotals.profit, foodTotals.profitPct.toFixed(1)]],
    },
    {
      name: 'المشروبات',
      header: costHeaders,
      rows: [...beverageRows.map(costRow), ['الإجمالي', bevTotals.quantity, bevTotals.revenue, bevTotals.cost, bevTotals.costPct.toFixed(1), bevTotals.profit, bevTotals.profitPct.toFixed(1)]],
    },
    {
      name: 'الملخص',
      header: ['المجموعة', 'الكمية', 'الإيراد', 'التكلفة', 'نسبة التكلفة%', 'الربح', 'نسبة الربح%'],
      rows: [
        ['المأكولات', foodTotals.quantity, foodTotals.revenue, foodTotals.cost, foodTotals.costPct.toFixed(1), foodTotals.profit, foodTotals.profitPct.toFixed(1)],
        ['المشروبات', bevTotals.quantity, bevTotals.revenue, bevTotals.cost, bevTotals.costPct.toFixed(1), bevTotals.profit, bevTotals.profitPct.toFixed(1)],
        ['الإجمالي', grandTotals.quantity, grandTotals.revenue, grandTotals.cost, grandTotals.costPct.toFixed(1), grandTotals.profit, grandTotals.profitPct.toFixed(1)],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تكلفة الأصناف حسب التصنيف (COGS by Category)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<BarChart3 className="w-6 h-6 text-indigo-600" />}
        actions={
          <>
            <TabBar
              tabs={[
                { id: 'food', label: 'تكلفة المأكولات' },
                { id: 'beverage', label: 'تكلفة المشروبات' },
                { id: 'summary', label: 'الملخص' },
              ]}
              active={activeTab}
              onChange={(id) => setActiveTab(id as 'food' | 'beverage' | 'summary')}
            />
            <ViewToolbar filename={`COGS_By_Category_${currentPeriodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameAr}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-[11px] font-bold text-emerald-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel}
      </div>

      {activeTab === 'food' && costTable(foodRows, foodTotals, 'تكلفة المأكولات', 'food')}

      {activeTab === 'beverage' && costTable(beverageRows, bevTotals, 'تكلفة المشروبات', 'beverage')}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <span className="text-[10px] text-blue-600 font-bold block">المأكولات</span>
              <strong className="text-lg font-extrabold text-blue-800 font-mono">{fmtMoney(foodTotals.revenue)}</strong>
              <span className="text-[10px] text-blue-500 block">تكلفة: {fmtMoney(foodTotals.cost)} — ربح: {fmtMoney(foodTotals.profit)} ({foodTotals.profitPct.toFixed(1)}%)</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <span className="text-[10px] text-red-600 font-bold block">المشروبات</span>
              <strong className="text-lg font-extrabold text-red-800 font-mono">{fmtMoney(bevTotals.revenue)}</strong>
              <span className="text-[10px] text-red-500 block">تكلفة: {fmtMoney(bevTotals.cost)} — ربح: {fmtMoney(bevTotals.profit)} ({bevTotals.profitPct.toFixed(1)}%)</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <span className="text-[10px] text-emerald-600 font-bold block">الإجمالي</span>
              <strong className="text-lg font-extrabold text-emerald-800 font-mono">{fmtMoney(grandTotals.revenue)}</strong>
              <span className="text-[10px] text-emerald-500 block">تكلفة: {fmtMoney(grandTotals.cost)} ({grandTotals.costPct.toFixed(1)}%) — ربح: {fmtMoney(grandTotals.profit)} ({grandTotals.profitPct.toFixed(1)}%)</span>
            </div>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">الملخص التفصيلي</h3>
              <Btn tone="ghost" onClick={() => printReport('summary')}>
                <Printer className="w-4 h-4" /> طباعة الملخص
              </Btn>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    <th className="p-2 text-right">المجموعة</th>
                    <th className="p-2 text-right">الكمية</th>
                    <th className="p-2 text-right">الإيراد</th>
                    <th className="p-2 text-right">التكلفة</th>
                    <th className="p-2 text-right">نسبة التكلفة%</th>
                    <th className="p-2 text-right">الربح</th>
                    <th className="p-2 text-right">نسبة الربح%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-blue-50 font-bold">
                    <td className="p-2">المأكولات</td>
                    <td className="tnum text-left p-2">{fmt(foodTotals.quantity)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(foodTotals.revenue)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmtMoney(foodTotals.cost)}</td>
                    <td className="tnum text-left p-2 text-amber-700">{foodTotals.costPct.toFixed(1)}%</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(foodTotals.profit)}</td>
                    <td className="tnum text-left p-2 text-slate-700">{foodTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-red-50 font-bold">
                    <td className="p-2">المشروبات</td>
                    <td className="tnum text-left p-2">{fmt(bevTotals.quantity)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(bevTotals.revenue)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmtMoney(bevTotals.cost)}</td>
                    <td className="tnum text-left p-2 text-amber-700">{bevTotals.costPct.toFixed(1)}%</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(bevTotals.profit)}</td>
                    <td className="tnum text-left p-2 text-slate-700">{bevTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold border-t-2 border-emerald-200">
                    <td className="p-2">الإجمالي</td>
                    <td className="tnum text-left p-2">{fmt(grandTotals.quantity)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(grandTotals.revenue)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmtMoney(grandTotals.cost)}</td>
                    <td className="tnum text-left p-2 text-amber-700">{grandTotals.costPct.toFixed(1)}%</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(grandTotals.profit)}</td>
                    <td className="tnum text-left p-2 text-slate-700">{grandTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">النسبة</th>
                  <th className="p-2 text-center">المأكولات</th>
                  <th className="p-2 text-center">المشروبات</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 font-bold">نسبة الإيراد</td>
                  <td className="tnum p-2 text-left">{foodRatio.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left">{bevRatio.toFixed(1)}%</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="p-2 font-bold">نسبة التكلفة</td>
                  <td className="tnum p-2 text-left">{foodTotals.costPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left">{bevTotals.costPct.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
};

export default COGSCategoryReport;