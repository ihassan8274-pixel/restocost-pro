import React, { useMemo, useState } from 'react';
import { Printer, Building2, UtensilsCrossed, CupSoda, Package } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';
import type { BatchSalesRecord } from '../../../types/pos';

interface BranchCostRow {
  itemName: string;
  category: string;
  branches: number[];
  branchRevenues: number[];
  branchCosts: number[];
  branchProfits: number[];
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

interface BranchTotals {
  branches: number[];
  branchRevenues: number[];
  branchCosts: number[];
  branchProfits: number[];
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalCostPct: number;
  totalProfitPct: number;
}

const foodCategories = ['main_dish', 'appetizer', 'dessert', 'side', 'welcome', 'breakfast'];
const beverageCategories = ['beverage', 'drink', 'cold_drink', 'hot_drink'];

const buildBranchRows = (
  records: BatchSalesRecord[],
  categories: string[],
  branchNames: string[]
): BranchCostRow[] => {
  const map = new Map<string, Map<string, { qty: number; rev: number; cost: number }>>();
  records.forEach((r) => {
    const branch = r.branchId;
    const vatRate = (r.vatRate || 0) / 100;
    (r.items || []).forEach((it) => {
      if (categories.length && !categories.includes(it.category)) return;
      const itemName = it.recipeNameAr || it.recipeId;
      if (!map.has(itemName)) map.set(itemName, new Map());
      const itemMap = map.get(itemName)!;
      const cur = itemMap.get(branch) || { qty: 0, rev: 0, cost: 0 };
      cur.qty += it.quantitySold || 0;
      const grossRevenue = it.lineTotalRevenue || 0;
      const netRevenue = vatRate > 0 ? grossRevenue / (1 + vatRate) : grossRevenue;
      cur.rev += netRevenue;
      cur.cost += it.lineTotalCost || 0;
      itemMap.set(branch, cur);
    });
  });

  return Array.from(map.entries())
    .sort((a, b) => {
      const totalRevA = Array.from(a[1].values()).reduce((s, v) => s + v.rev, 0);
      const totalRevB = Array.from(b[1].values()).reduce((s, v) => s + v.rev, 0);
      return totalRevB - totalRevA;
    })
    .map(([itemName, branchMap]) => {
      const branches = branchNames.map((bn) => {
        const data = branchMap.get(bn);
        return data ? data.qty : 0;
      });
      const branchRevenues = branchNames.map((bn) => {
        const data = branchMap.get(bn);
        return data ? data.rev : 0;
      });
      const branchCosts = branchNames.map((bn) => {
        const data = branchMap.get(bn);
        return data ? data.cost : 0;
      });
      const branchProfits = branchNames.map((_, i) => branchRevenues[i] - branchCosts[i]);

      const totalQuantity = branches.reduce((a, b) => a + b, 0);
      const totalRevenue = branchRevenues.reduce((a, b) => a + b, 0);
      const totalCost = branchCosts.reduce((a, b) => a + b, 0);
      const totalProfit = totalRevenue - totalCost;

      return {
        itemName,
        category: '',
        branches,
        branchRevenues,
        branchCosts,
        branchProfits,
        totalQuantity,
        totalRevenue,
        totalCost,
        totalProfit,
      };
    });
};

const sumBranchRows = (rows: BranchCostRow[], branchCount: number): BranchTotals => {
  const branches = new Array(branchCount).fill(0);
  const branchRevenues = new Array(branchCount).fill(0);
  const branchCosts = new Array(branchCount).fill(0);
  const branchProfits = new Array(branchCount).fill(0);
  let totalQuantity = 0;
  let totalRevenue = 0;
  let totalCost = 0;

  rows.forEach((r) => {
    totalQuantity += r.totalQuantity;
    totalRevenue += r.totalRevenue;
    totalCost += r.totalCost;
    r.branches.forEach((v, i) => { branches[i] += v; });
    r.branchRevenues.forEach((v, i) => { branchRevenues[i] += v; });
    r.branchCosts.forEach((v, i) => { branchCosts[i] += v; });
    r.branchProfits.forEach((v, i) => { branchProfits[i] += v; });
  });

  const totalProfit = totalRevenue - totalCost;
  return {
    branches,
    branchRevenues,
    branchCosts,
    branchProfits,
    totalQuantity,
    totalRevenue,
    totalCost,
    totalProfit,
    totalCostPct: totalRevenue ? (totalCost / totalRevenue) * 100 : 0,
    totalProfitPct: totalRevenue ? (totalProfit / totalRevenue) * 100 : 0,
  };
};

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const COGSBranchReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'food' | 'beverage' | 'all'>('food');
  const [viewMode, setViewMode] = useState<'quantity' | 'revenue' | 'cost' | 'profit' | 'pct'>('revenue');

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

  const branchNames = useMemo(
    () => (branchFilter === 'all' ? branches.map((b) => b.nameAr) : [getBranchName(branchFilter)]),
    [branchFilter, branches, getBranchName]
  );

  const foodRows = useMemo(() => buildBranchRows(filteredRecords, foodCategories, branchNames), [filteredRecords, branchNames]);
  const beverageRows = useMemo(() => buildBranchRows(filteredRecords, beverageCategories, branchNames), [filteredRecords, branchNames]);
  const allRows = useMemo(() => buildBranchRows(filteredRecords, [...foodCategories, ...beverageCategories], branchNames), [filteredRecords, branchNames]);

  const foodTotals = useMemo(() => sumBranchRows(foodRows, branchNames.length), [foodRows, branchNames.length]);
  const bevTotals = useMemo(() => sumBranchRows(beverageRows, branchNames.length), [beverageRows, branchNames.length]);
  const allTotals = useMemo(() => sumBranchRows(allRows, branchNames.length), [allRows, branchNames.length]);

  const periodLabel = monthLabel(currentPeriodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const getRows = () => (activeTab === 'food' ? foodRows : activeTab === 'beverage' ? beverageRows : allRows);
  const getTotals = () => (activeTab === 'food' ? foodTotals : activeTab === 'beverage' ? bevTotals : allTotals);

  const getCellValue = (row: BranchCostRow, branchIndex: number) => {
    switch (viewMode) {
      case 'quantity': return row.branches[branchIndex];
      case 'revenue': return row.branchRevenues[branchIndex];
      case 'cost': return row.branchCosts[branchIndex];
      case 'profit': return row.branchProfits[branchIndex];
      case 'pct': {
        const rev = row.branchRevenues[branchIndex];
        const cost = row.branchCosts[branchIndex];
        return rev ? ((cost / rev) * 100).toFixed(1) + '%' : '-';
      }
      default: return row.branchRevenues[branchIndex];
    }
  };

  const getTotalCell = (totals: BranchTotals, branchIndex: number) => {
    switch (viewMode) {
      case 'quantity': return totals.branches[branchIndex];
      case 'revenue': return totals.branchRevenues[branchIndex];
      case 'cost': return totals.branchCosts[branchIndex];
      case 'profit': return totals.branchProfits[branchIndex];
      case 'pct': {
        const rev = totals.branchRevenues[branchIndex];
        const cost = totals.branchCosts[branchIndex];
        return rev ? ((cost / rev) * 100).toFixed(1) + '%' : '-';
      }
      default: return totals.branchRevenues[branchIndex];
    }
  };

  const formatCell = (val: number | string) => {
    if (typeof val === 'string') return val;
    if (viewMode === 'pct') return val;
    if (viewMode === 'quantity') return fmt(val);
    return fmtMoney(val);
  };

  const printReport = () => {
    const titleMap = { food: 'تكلفة المأكولات حسب الفرع', beverage: 'تكلفة المشروبات حسب الفرع', all: 'تكلفة الأصناف حسب الفرع (الكل)' };
    const title = titleMap[activeTab];

    const rows = getRows();
    const totals = getTotals();

    const headers = ['الصنف', ...branchNames, 'الإجمالي'];
    const tableRows = [
      ...rows.map((r) => [r.itemName, ...r.branches.map((_, i) => formatCell(getCellValue(r, i))), formatCell(viewMode === 'quantity' ? r.totalQuantity : viewMode === 'revenue' ? r.totalRevenue : viewMode === 'cost' ? r.totalCost : r.totalProfit)]),
      ['الإجمالي', ...branchNames.map((_, i) => formatCell(getTotalCell(totals, i))), formatCell(viewMode === 'quantity' ? totals.totalQuantity : viewMode === 'revenue' ? totals.totalRevenue : viewMode === 'cost' ? totals.totalCost : totals.totalProfit)],
    ];

    openPrintWindow({
      title: `تقرير ${title}`,
      subtitle: `${COMPANY} — ${periodLabel}`,
      meta: [
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['وضع العرض', viewMode === 'quantity' ? 'الكميات' : viewMode === 'revenue' ? 'الإيراد' : viewMode === 'cost' ? 'التكلفة' : viewMode === 'profit' ? 'الربح' : 'نسبة التكلفة%'],
      ],
      tables: [{
        title: title,
        header: headers,
        rows: tableRows,
        dense: true,
      }],
      orientation: branchNames.length > 6 ? 'landscape' : 'portrait',
      footer: `${COMPANY} — ${title}`,
    });
  };

  const excelSheets = [
    {
      name: 'المأكولات',
      header: ['الصنف', ...branchNames, 'الإجمالي'],
      rows: foodRows.map((r) => [r.itemName, ...r.branches, r.totalQuantity]),
    },
    {
      name: 'المشروبات',
      header: ['الصنف', ...branchNames, 'الإجمالي'],
      rows: beverageRows.map((r) => [r.itemName, ...r.branches, r.totalQuantity]),
    },
    {
      name: 'الكل (إيراد)',
      header: ['الصنف', ...branchNames, 'الإجمالي'],
      rows: allRows.map((r) => [r.itemName, ...r.branchRevenues, r.totalRevenue]),
    },
    {
      name: 'الكل (تكلفة)',
      header: ['الصنف', ...branchNames, 'الإجمالي'],
      rows: allRows.map((r) => [r.itemName, ...r.branchCosts, r.totalCost]),
    },
    {
      name: 'الكل (ربح)',
      header: ['الصنف', ...branchNames, 'الإجمالي'],
      rows: allRows.map((r) => [r.itemName, ...r.branchProfits, r.totalProfit]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تكلفة الأصناف حسب الفرع (COGS by Branch)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Building2 className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <TabBar
              tabs={[
                { id: 'food', label: 'المأكولات' },
                { id: 'beverage', label: 'المشروبات' },
                { id: 'all', label: 'الكل' },
              ]}
              active={activeTab}
              onChange={(id) => setActiveTab(id as 'food' | 'beverage' | 'all')}
            />
            <div className="flex items-center gap-2 ml-4">
              <label className="text-xs font-bold text-slate-700">عرض</label>
              <select value={viewMode} onChange={(e) => setViewMode(e.target.value as any)} className={inputCls + ' !w-40'}>
                <option value="quantity">الكميات</option>
                <option value="revenue">الإيراد</option>
                <option value="cost">التكلفة</option>
                <option value="profit">الربح</option>
                <option value="pct">% التكلفة</option>
              </select>
            </div>
            <ViewToolbar filename={`COGS_By_Branch_${currentPeriodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — العرض: {viewMode === 'quantity' ? 'الكميات' : viewMode === 'revenue' ? 'الإيراد' : viewMode === 'cost' ? 'التكلفة' : viewMode === 'profit' ? 'الربح' : 'نسبة التكلفة%'}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg">
            {activeTab === 'food' ? <span className="inline-flex items-center gap-1"><UtensilsCrossed className="w-4 h-4" /> المأكولات</span> : activeTab === 'beverage' ? <span className="inline-flex items-center gap-1"><CupSoda className="w-4 h-4" /> المشروبات</span> : <span className="inline-flex items-center gap-1"><Package className="w-4 h-4" /> جميع الأصناف</span>}
            — {viewMode === 'quantity' ? 'الكميات' : viewMode === 'revenue' ? 'الإيراد' : viewMode === 'cost' ? 'التكلفة' : viewMode === 'profit' ? 'الربح' : 'نسبة التكلفة%'}
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة هذا التقرير
          </Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right sticky right-0 bg-slate-100 z-10">الصنف</th>
                {branchNames.map((bn) => (
                  <th key={bn} className="p-2 text-center font-mono">{bn}</th>
                ))}
                <th className="p-2 text-right font-bold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {getRows().map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800 sticky right-0 bg-inherit z-10">{row.itemName}</td>
                  {branchNames.map((_, bi) => (
                    <td key={bi} className="p-2 text-center font-mono">
                      {formatCell(getCellValue(row, bi))}
                    </td>
                  ))}
                  <td className="tnum p-2 text-left font-bold text-indigo-700">
                    {formatCell(
                      viewMode === 'quantity' ? row.totalQuantity :
                      viewMode === 'revenue' ? row.totalRevenue :
                      viewMode === 'cost' ? row.totalCost : row.totalProfit
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي</td>
                {branchNames.map((_, bi) => (
                  <td key={bi} className="p-2 text-center font-mono">
                    {formatCell(getTotalCell(getTotals(), bi))}
                  </td>
                ))}
                <td className="tnum p-2 text-left font-bold text-indigo-700">
                  {formatCell(
                    viewMode === 'quantity' ? getTotals().totalQuantity :
                    viewMode === 'revenue' ? getTotals().totalRevenue :
                    viewMode === 'cost' ? getTotals().totalCost : getTotals().totalProfit
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default COGSBranchReport;