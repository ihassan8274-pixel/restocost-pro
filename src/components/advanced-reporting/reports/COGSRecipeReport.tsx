import React, { useMemo, useState } from 'react';
import { Printer, ChefHat, AlertTriangle, TrendingDown, TrendingUp, UtensilsCrossed, CupSoda } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';
import type { BatchSalesRecord } from '../../../types/pos';
import type { StandardRecipe } from '../../../types/production';

interface RecipeRow {
  recipeId: string;
  recipeNameAr: string;
  category: string;
  quantitySold: number;
  stdCostPerUnit: number;
  actualCostPerUnit: number;
  variancePerUnit: number;
  variancePct: number;
  totalStdCost: number;
  totalActualCost: number;
  totalVariance: number;
  revenue: number;
  profit: number;
  profitPct: number;
  laborCostPerUnit: number;
  materialCostPerUnit: number;
}

interface RecipeTotals {
  quantitySold: number;
  totalStdCost: number;
  totalActualCost: number;
  totalVariance: number;
  totalVariancePct: number;
  revenue: number;
  profit: number;
  profitPct: number;
}

const foodCategories = ['main_dish', 'appetizer', 'dessert', 'side', 'welcome', 'breakfast'];
const beverageCategories = ['beverage', 'drink', 'cold_drink', 'hot_drink'];

const getRecipeStdCost = (r: StandardRecipe) =>
  (r.totalCalculatedCost || 0) + (r.directLaborCost || 0) + (r.packagingCost || 0);

const buildRecipeRows = (
  records: BatchSalesRecord[],
  recipeMap: Map<string, StandardRecipe>,
  categories: string[]
): RecipeRow[] => {
  const map = new Map<string, { qty: number; revenue: number; actualCost: number }>();
  records.forEach((r) => {
    const vatRate = (r.vatRate || 0) / 100;
    (r.items || []).forEach((it) => {
      if (categories.length && !categories.includes(it.category)) return;
      const cur = map.get(it.recipeId) || { qty: 0, revenue: 0, actualCost: 0 };
      cur.qty += it.quantitySold || 0;
      const grossRevenue = it.lineTotalRevenue || 0;
      const netRevenue = vatRate > 0 ? grossRevenue / (1 + vatRate) : grossRevenue;
      cur.revenue += netRevenue;
      cur.actualCost += it.lineTotalCost || 0;
      map.set(it.recipeId, cur);
    });
  });

  return Array.from(map.entries())
    .map(([recipeId, sales]) => {
      const recipe = recipeMap.get(recipeId);
      const stdCostPerUnit = recipe ? getRecipeStdCost(recipe) : 0;
      const laborCostPerUnit = recipe?.directLaborCost || 0;
      const actualCostPerUnit = sales.qty > 0 ? sales.actualCost / sales.qty : 0;
      const variancePerUnit = actualCostPerUnit - stdCostPerUnit;
      const variancePct = stdCostPerUnit > 0 ? (variancePerUnit / stdCostPerUnit) * 100 : 0;
      const totalStdCost = stdCostPerUnit * sales.qty;
      const totalActualCost = sales.actualCost;
      const totalVariance = totalActualCost - totalStdCost;
      const profit = sales.revenue - sales.actualCost;

      return {
        recipeId,
        recipeNameAr: recipe?.nameAr || recipeId,
        category: recipe?.category || '',
        quantitySold: sales.qty,
        stdCostPerUnit,
        actualCostPerUnit,
        variancePerUnit,
        variancePct,
        totalStdCost,
        totalActualCost,
        totalVariance,
        revenue: sales.revenue,
        profit,
        profitPct: sales.revenue > 0 ? (profit / sales.revenue) * 100 : 0,
        laborCostPerUnit,
        materialCostPerUnit: recipe ? (recipe.totalCalculatedCost || 0) : 0,
      };
    })
    .sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
};

const sumRecipeRows = (rows: RecipeRow[]): RecipeTotals => {
  const t = rows.reduce(
    (acc, r) => {
      acc.quantitySold += r.quantitySold;
      acc.totalStdCost += r.totalStdCost;
      acc.totalActualCost += r.totalActualCost;
      acc.totalVariance += r.totalVariance;
      acc.revenue += r.revenue;
      return acc;
    },
    { quantitySold: 0, totalStdCost: 0, totalActualCost: 0, totalVariance: 0, totalVariancePct: 0, revenue: 0, profit: 0, profitPct: 0 }
  );
  t.profit = t.revenue - t.totalActualCost;
  t.totalVariancePct = t.totalStdCost > 0 ? (t.totalVariance / t.totalStdCost) * 100 : 0;
  t.profitPct = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
  return t;
};

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const varianceColor = (v: number) =>
  v > 0.001 ? 'text-rose-600' : v < -0.001 ? 'text-emerald-600' : 'text-slate-600';

const varianceIcon = (v: number) =>
  v > 0.001 ? <TrendingUp className="w-3 h-3 inline ml-1" /> : v < -0.001 ? <TrendingDown className="w-3 h-3 inline ml-1" /> : null;

export const COGSRecipeReport: React.FC = () => {
  const { batchSalesRecords, branches, recipes, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'food' | 'beverage' | 'summary'>('food');
  const [sortMode, setSortMode] = useState<'variance' | 'revenue' | 'actualCost'>('variance');

  const recipeMap = useMemo(() => {
    const m = new Map<string, StandardRecipe>();
    recipes.forEach((r) => m.set(r.id, r));
    return m;
  }, [recipes]);

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

  const foodRows = useMemo(() => {
    const rows = buildRecipeRows(filteredRecords, recipeMap, foodCategories);
    if (sortMode === 'revenue') return [...rows].sort((a, b) => b.revenue - a.revenue);
    if (sortMode === 'actualCost') return [...rows].sort((a, b) => b.totalActualCost - a.totalActualCost);
    return rows;
  }, [filteredRecords, recipeMap, sortMode]);

  const beverageRows = useMemo(() => {
    const rows = buildRecipeRows(filteredRecords, recipeMap, beverageCategories);
    if (sortMode === 'revenue') return [...rows].sort((a, b) => b.revenue - a.revenue);
    if (sortMode === 'actualCost') return [...rows].sort((a, b) => b.totalActualCost - a.totalActualCost);
    return rows;
  }, [filteredRecords, recipeMap, sortMode]);

  const allRows = useMemo(() => {
    const rows = buildRecipeRows(filteredRecords, recipeMap, [...foodCategories, ...beverageCategories]);
    if (sortMode === 'revenue') return [...rows].sort((a, b) => b.revenue - a.revenue);
    if (sortMode === 'actualCost') return [...rows].sort((a, b) => b.totalActualCost - a.totalActualCost);
    return rows;
  }, [filteredRecords, recipeMap, sortMode]);

  const foodTotals = useMemo(() => sumRecipeRows(foodRows), [foodRows]);
  const bevTotals = useMemo(() => sumRecipeRows(beverageRows), [beverageRows]);
  const grandTotals = useMemo(() => sumRecipeRows(allRows), [allRows]);

  const periodLabel = monthLabel(currentPeriodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const getRows = () => (activeTab === 'food' ? foodRows : activeTab === 'beverage' ? beverageRows : allRows);
  const getTotals = () => (activeTab === 'food' ? foodTotals : activeTab === 'beverage' ? bevTotals : grandTotals);

  const printReport = () => {
    const titleMap = { food: 'تكلفة الوصفات المأكولات: معياري vs فعلي', beverage: 'تكلفة الوصفات المشروبات: معياري vs فعلي', summary: 'ملخص تكلفة الوصفات' };
    const title = titleMap[activeTab];
    const rows = getRows();
    const totals = getTotals();
    const headers = ['الصنف', 'الكمية', 'المعياري/وحدة', 'الفعلي/وحدة', 'الانحراف/وحدة', 'الانحراف %', 'الإيراد', 'الربح', 'نسبة الربح %'];

    openPrintWindow({
      title: `تقرير ${title}`,
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
      ],
      tables: [
        {
          title,
          header: headers,
          rows: [
            ...rows.map((r) => [
              r.recipeNameAr, r.quantitySold, r.stdCostPerUnit.toFixed(2), r.actualCostPerUnit.toFixed(2),
              r.variancePerUnit.toFixed(2), `${r.variancePct.toFixed(1)}%`, r.revenue, r.profit, `${r.profitPct.toFixed(1)}%`,
            ]),
            ['الإجمالي', totals.quantitySold, '-', '-', '-', `${totals.totalVariancePct.toFixed(1)}%`, totals.revenue, totals.profit, `${totals.profitPct.toFixed(1)}%`],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${title}`,
    });
  };

  const excelSheets = [
    {
      name: activeTab === 'food' ? 'المأكولات' : activeTab === 'beverage' ? 'المشروبات' : 'الكل',
      header: ['الصنف', 'الكمية', 'المعياري/وحدة', 'الفعلي/وحدة', 'الانحراف/وحدة', 'الانحراف %', 'الإيراد', 'الربح', 'نسبة الربح %'],
      rows: [
        ...getRows().map((r) => [
          r.recipeNameAr, r.quantitySold, r.stdCostPerUnit.toFixed(2), r.actualCostPerUnit.toFixed(2),
          r.variancePerUnit.toFixed(2), `${r.variancePct.toFixed(1)}%`, r.revenue.toFixed(2), r.profit.toFixed(2), `${r.profitPct.toFixed(1)}%`,
        ]),
        ['الإجمالي', getTotals().quantitySold, '-', '-', '-', `${getTotals().totalVariancePct.toFixed(1)}%`, getTotals().revenue.toFixed(2), getTotals().profit.toFixed(2), `${getTotals().profitPct.toFixed(1)}%`],
      ],
    },
  ];

  const renderTable = (rows: RecipeRow[], totals: RecipeTotals, label: string) => (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-amber-600" /> {label}
          {Math.abs(totals.totalVariancePct) > 5 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> انحراف مرتفع
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold">
              <th className="p-2 text-right">الصنف</th>
              <th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-center">المعياري/وحدة</th>
              <th className="p-2 text-center">الفعلي/وحدة</th>
              <th className="p-2 text-center">الانحراف/وحدة</th>
              <th className="p-2 text-center">الانحراف %</th>
              <th className="p-2 text-center">الإيراد</th>
              <th className="p-2 text-center">الربح</th>
              <th className="p-2 text-center">نسبة الربح %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="p-2 font-bold text-slate-800">{r.recipeNameAr}</td>
                <td className="tnum p-2 text-left">{fmt(r.quantitySold)}</td>
                <td className="tnum p-2 text-left text-blue-700">{r.stdCostPerUnit.toFixed(2)}</td>
                <td className="tnum p-2 text-left text-rose-700">{r.actualCostPerUnit.toFixed(2)}</td>
                <td className={`p-2 text-center font-mono font-bold ${varianceColor(r.variancePerUnit)}`}>
                  {varianceIcon(r.variancePerUnit)}{r.variancePerUnit.toFixed(2)}
                </td>
                <td className={`p-2 text-center font-mono font-bold ${varianceColor(r.variancePct)}`}>
                  {r.variancePct.toFixed(1)}%
                </td>
                <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(r.revenue)}</td>
                <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(r.profit)}</td>
                <td className="tnum p-2 text-left text-slate-700">{r.profitPct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <td className="p-2">الإجمالي</td>
              <td className="tnum p-2 text-left">{fmt(totals.quantitySold)}</td>
              <td className="p-2 text-center text-slate-400">-</td>
              <td className="p-2 text-center text-slate-400">-</td>
              <td className="p-2 text-center text-slate-400">-</td>
              <td className={`p-2 text-center font-mono ${varianceColor(totals.totalVariancePct)} text-lg`}>
                {totals.totalVariancePct.toFixed(1)}%
              </td>
              <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(totals.revenue)}</td>
              <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(totals.profit)}</td>
              <td className="tnum p-2 text-left text-slate-700">{totals.profitPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="تكلفة الوصفات: معياري vs فعلي (Recipe Standard vs Actual)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<ChefHat className="w-6 h-6 text-amber-300" />}
        actions={
          <>
            <TabBar
              tabs={[
                { id: 'food', label: 'المأكولات' },
                { id: 'beverage', label: 'المشروبات' },
                { id: 'summary', label: 'الملخص' },
              ]}
              active={activeTab}
              onChange={(id) => setActiveTab(id as 'food' | 'beverage' | 'summary')}
            />
            <ViewToolbar filename={`COGS_Recipe_${currentPeriodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="ترتيب">
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className={inputCls + ' !w-40'}>
                  <option value="variance">الانحراف الأكبر</option>
                  <option value="revenue">الإيراد</option>
                  <option value="actualCost">التكلفة الفعلية</option>
                </select>
              </Field>
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

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">التكلفة المعيارية الإجمالية</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono">{fmtMoney(getTotals().totalStdCost)}</strong>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">التكلفة الفعلية الإجمالية</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono">{fmtMoney(getTotals().totalActualCost)}</strong>
        </div>
        <div className={`${getTotals().totalVariance > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4`}>
          <span className={`text-[10px] font-bold block ${getTotals().totalVariance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>الانحراف الإجمالي</span>
          <strong className={`text-lg font-extrabold font-mono ${getTotals().totalVariance > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
            {getTotals().totalVariance > 0 ? '+' : ''}{fmtMoney(getTotals().totalVariance)}
          </strong>
          <span className={`text-[10px] block ${getTotals().totalVariance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            ({getTotals().totalVariancePct.toFixed(1)}%)
          </span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">الربح الصافي</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono">{fmtMoney(getTotals().profit)}</strong>
          <span className="text-[10px] text-emerald-500 block">({getTotals().profitPct.toFixed(1)}%)</span>
        </div>
      </div>

      {activeTab === 'food' && renderTable(foodRows, foodTotals, 'تكلفة المأكولات — معياري vs فعلي')}

      {activeTab === 'beverage' && renderTable(beverageRows, bevTotals, 'تكلفة المشروبات — معياري vs فعلي')}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-amber-600" /> ملخص التكلفة
              </h3>
              <Btn tone="ghost" onClick={printReport}>
                <Printer className="w-4 h-4" /> طباعة الملخص
              </Btn>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    <th className="p-2 text-right">المجموعة</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">المعياري</th>
                    <th className="p-2 text-center">الفعلي</th>
                    <th className="p-2 text-center">الانحراف</th>
                    <th className="p-2 text-center">نسبة الانحراف %</th>
                    <th className="p-2 text-center">الإيراد</th>
                    <th className="p-2 text-center">الربح</th>
                    <th className="p-2 text-center">نسبة الربح %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-blue-50 font-bold">
                    <td className="p-2"><span className="inline-flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" /> المأكولات</span></td>
                    <td className="tnum p-2 text-left">{fmt(foodTotals.quantitySold)}</td>
                    <td className="tnum p-2 text-left text-blue-700">{fmtMoney(foodTotals.totalStdCost)}</td>
                    <td className="tnum p-2 text-left text-rose-700">{fmtMoney(foodTotals.totalActualCost)}</td>
                    <td className={`p-2 text-center font-mono font-bold ${varianceColor(foodTotals.totalVariance)}`}>
                      {foodTotals.totalVariance > 0 ? '+' : ''}{fmtMoney(foodTotals.totalVariance)}
                    </td>
                    <td className={`p-2 text-center font-mono font-bold ${varianceColor(foodTotals.totalVariancePct)}`}>
                      {foodTotals.totalVariancePct.toFixed(1)}%
                    </td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(foodTotals.revenue)}</td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(foodTotals.profit)}</td>
                    <td className="tnum p-2 text-left">{foodTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-red-50 font-bold">
                    <td className="p-2"><span className="inline-flex items-center gap-1"><CupSoda className="w-3.5 h-3.5" /> المشروبات</span></td>
                    <td className="tnum p-2 text-left">{fmt(bevTotals.quantitySold)}</td>
                    <td className="tnum p-2 text-left text-blue-700">{fmtMoney(bevTotals.totalStdCost)}</td>
                    <td className="tnum p-2 text-left text-rose-700">{fmtMoney(bevTotals.totalActualCost)}</td>
                    <td className={`p-2 text-center font-mono font-bold ${varianceColor(bevTotals.totalVariance)}`}>
                      {bevTotals.totalVariance > 0 ? '+' : ''}{fmtMoney(bevTotals.totalVariance)}
                    </td>
                    <td className={`p-2 text-center font-mono font-bold ${varianceColor(bevTotals.totalVariancePct)}`}>
                      {bevTotals.totalVariancePct.toFixed(1)}%
                    </td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(bevTotals.revenue)}</td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(bevTotals.profit)}</td>
                    <td className="tnum p-2 text-left">{bevTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold border-t-2 border-emerald-200">
                    <td className="p-2">الإجمالي</td>
                    <td className="tnum p-2 text-left">{fmt(grandTotals.quantitySold)}</td>
                    <td className="tnum p-2 text-left text-blue-700">{fmtMoney(grandTotals.totalStdCost)}</td>
                    <td className="tnum p-2 text-left text-rose-700">{fmtMoney(grandTotals.totalActualCost)}</td>
                    <td className={`p-2 text-center font-mono font-bold text-lg ${varianceColor(grandTotals.totalVariance)}`}>
                      {grandTotals.totalVariance > 0 ? '+' : ''}{fmtMoney(grandTotals.totalVariance)}
                    </td>
                    <td className={`p-2 text-center font-mono font-bold text-lg ${varianceColor(grandTotals.totalVariancePct)}`}>
                      {grandTotals.totalVariancePct.toFixed(1)}%
                    </td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(grandTotals.revenue)}</td>
                    <td className="tnum p-2 text-left text-emerald-700">{fmtMoney(grandTotals.profit)}</td>
                    <td className="tnum p-2 text-left">{grandTotals.profitPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {getTotals().totalVariance > 0 && (
            <Card className="p-4 bg-rose-50 border-rose-200">
              <h4 className="font-bold text-rose-800 text-sm mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> ملاحظة انحراف مرتفع</h4>
              <p className="text-xs text-rose-700">
                التكلفة الفعلية أعلى من المعيارية بنسبة {getTotals().totalVariancePct.toFixed(1)}%. يُنصح بمراجعة تكاليف الوصفات أو أسعار الشراء أو كميات الاستهلاك الفعلية.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default COGSRecipeReport;
