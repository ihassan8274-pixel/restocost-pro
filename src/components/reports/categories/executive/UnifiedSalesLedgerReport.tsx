import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem, type ReportResult } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmt, VAT_RATE, netOfGross } from '../../../../utils/helpers';
import type { POSOrder, BatchSalesRecord, POSReturn } from '../../../../types';

const RECIPE_CAT_LABELS: Record<string, string> = {
  main_dish: 'طبق رئيسي', appetizer: 'مقبلات', beverage: 'مشروبات', dessert: 'حلويات', sub_prep: 'تحضيرات مركزية',
};

const moneyFmt = (v: unknown) => fmt(Number(v), 0);

interface Agg { qty: number; revenue: number; cost: number; }

/** دفتر المبيعات التحليلي الموحد — المبيعات حسب الصنف والفرع واليوم (شامل المرتجعات) */
export const UnifiedSalesLedgerReport: React.FC = () => {
  const { posOrders, batchSalesRecords, posReturns, recipes, branches } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const recipeCat = useMemo(() => new Map(recipes.map((r) => [r.id, r.category])), [recipes]);
  const recipeName = useMemo(() => new Map(recipes.map((r) => [r.id, r.nameAr])), [recipes]);
  const targetMap = useMemo(() => new Map(recipes.map((r) => [r.id, r.targetMarginPercent ?? 68])), [recipes]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'salesledger', title: 'دفتر المبيعات التحليلي', subtitle: 'تحليل المبيعات حسب الصنف والفرع واليوم مع هامش الربح' }, [
      { name: 'pos', rows: posOrders, date: (r: POSOrder) => r.date, branch: (r: POSOrder) => r.branchId },
      { name: 'batch', rows: batchSalesRecords, date: (r: BatchSalesRecord) => r.date, branch: (r: BatchSalesRecord) => r.branchId },
      { name: 'returns', rows: posReturns, date: (r: POSReturn) => r.date, branch: (r: POSReturn) => r.branchId },
    ]);
    return e;
  }, [posOrders, batchSalesRecords, posReturns]);

  const view = useMemo(() => {
    const s = engine.applyFilters('salesledger', filters);
    const pos = s[0].rows as POSOrder[];
    const batch = s[1].rows as BatchSalesRecord[];
    const returns = s[2].rows as POSReturn[];

    const catLabel = (c: string) => RECIPE_CAT_LABELS[c] || c || 'غير مصنف';

    // حسب الصنف
    const items = new Map<string, { recipeId: string; name: string; category: string; qty: number; revenue: number; cost: number }>();
    const addItem = (recipeId: string, name: string, cat: string | undefined, qty: number, revenue: number, cost: number) => {
      const key = recipeId || `other-${name}`;
      const cur = items.get(key) || { recipeId, name: name || recipeName.get(recipeId) || 'أخرى', category: recipeCat.get(recipeId) || cat || 'other', qty: 0, revenue: 0, cost: 0 };
      cur.qty += qty; cur.revenue += revenue; cur.cost += cost;
      items.set(key, cur);
    };
    pos.forEach((o) => {
      const grossTotal = o.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = o.subtotal / grossTotal;
      o.items.forEach((i) => addItem(i.recipeId, i.recipeName, undefined, i.quantity, i.lineTotal * ratio, i.quantity * i.unitCost));
    });
    batch.forEach((b) => {
      const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      const grossTotal = b.items.reduce((sum, i) => sum + i.lineTotalRevenue, 0) || 1;
      const ratio = net / grossTotal;
      b.items.forEach((i) => addItem(i.recipeId, i.recipeNameAr, i.category, i.quantitySold, i.lineTotalRevenue * ratio, i.lineTotalCost));
    });
    returns.forEach((r) => {
      const grossTotal = r.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = r.subtotal / grossTotal;
      r.items.forEach((i) => addItem(i.recipeId, i.recipeName, undefined, -i.quantity, -i.lineTotal * ratio, -(i.quantity * i.unitCost)));
    });

    const itemRows = Array.from(items.values())
      .filter((l) => (categoryFilter === 'all' || l.category === categoryFilter) && (!search || l.name.includes(search)))
      .map((l) => ({ ...l, profit: l.revenue - l.cost, margin: l.revenue > 0 ? ((l.revenue - l.cost) / l.revenue) * 100 : 0, target: targetMap.get(l.recipeId) ?? 68 }))
      .sort((a, b) => b.revenue - a.revenue);

    const catOk = (c: string | undefined) => categoryFilter === 'all' || (recipeCat.get(c || '') || c) === categoryFilter;

    // حسب الفرع
    const branchAgg = new Map<string, Agg>();
    pos.forEach((o) => {
      const grossTotal = o.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = o.subtotal / grossTotal;
      o.items.forEach((i) => {
        if (!catOk(recipeCat.get(i.recipeId))) return;
        const cur = branchAgg.get(o.branchId) || { qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.quantity; cur.revenue += i.lineTotal * ratio; cur.cost += i.quantity * i.unitCost;
        branchAgg.set(o.branchId, cur);
      });
    });
    batch.forEach((b) => {
      const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      const grossTotal = b.items.reduce((sum, i) => sum + i.lineTotalRevenue, 0) || 1;
      const ratio = net / grossTotal;
      b.items.forEach((i) => {
        if (!catOk(recipeCat.get(i.recipeId) || i.category)) return;
        const cur = branchAgg.get(b.branchId) || { qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.quantitySold; cur.revenue += i.lineTotalRevenue * ratio; cur.cost += i.lineTotalCost;
        branchAgg.set(b.branchId, cur);
      });
    });
    returns.forEach((r) => {
      const grossTotal = r.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = r.subtotal / grossTotal;
      r.items.forEach((i) => {
        if (!catOk(recipeCat.get(i.recipeId))) return;
        const cur = branchAgg.get(r.branchId) || { qty: 0, revenue: 0, cost: 0 };
        cur.qty -= i.quantity; cur.revenue -= i.lineTotal * ratio; cur.cost -= i.quantity * i.unitCost;
        branchAgg.set(r.branchId, cur);
      });
    });
    const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;
    const branchRows = Array.from(branchAgg.entries())
      .map(([id, l]) => ({ branchId: id, name: branchName(id), qty: l.qty, revenue: l.revenue, cost: l.cost, profit: l.revenue - l.cost, margin: l.revenue > 0 ? ((l.revenue - l.cost) / l.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // حسب اليوم
    const dayKey = (d: string) => d.slice(0, 10);
    const dayAgg = new Map<string, Agg>();
    pos.forEach((o) => {
      const grossTotal = o.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = o.subtotal / grossTotal;
      o.items.forEach((i) => {
        const cur = dayAgg.get(dayKey(o.date)) || { qty: 0, revenue: 0, cost: 0 };
        cur.revenue += i.lineTotal * ratio; cur.cost += i.quantity * i.unitCost;
        dayAgg.set(dayKey(o.date), cur);
      });
    });
    batch.forEach((b) => {
      const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      const grossTotal = b.items.reduce((sum, i) => sum + i.lineTotalRevenue, 0) || 1;
      const ratio = net / grossTotal;
      b.items.forEach((i) => {
        const cur = dayAgg.get(dayKey(b.date)) || { qty: 0, revenue: 0, cost: 0 };
        cur.revenue += i.lineTotalRevenue * ratio; cur.cost += i.lineTotalCost;
        dayAgg.set(dayKey(b.date), cur);
      });
    });
    returns.forEach((r) => {
      const grossTotal = r.items.reduce((sum, i) => sum + i.lineTotal, 0) || 1;
      const ratio = r.subtotal / grossTotal;
      r.items.forEach((i) => {
        const cur = dayAgg.get(dayKey(r.date)) || { qty: 0, revenue: 0, cost: 0 };
        cur.revenue -= i.lineTotal * ratio; cur.cost -= i.quantity * i.unitCost;
        dayAgg.set(dayKey(r.date), cur);
      });
    });
    const dailyRows = Array.from(dayAgg.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, revenue: Math.round(v.revenue), cost: Math.round(v.cost), profit: Math.round(v.revenue - v.cost) }));

    const totalRevenue = itemRows.reduce((sum, l) => sum + l.revenue, 0);
    const totalCost = itemRows.reduce((sum, l) => sum + l.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalOrders = pos.length;

    const summaries: ReportSummaryItem[] = [
      { key: 'revenue', label: 'إجمالي الإيراد', value: Math.round(totalRevenue), tone: 'emerald' },
      { key: 'orders', label: 'طلبات نقاط البيع', value: totalOrders },
      { key: 'cost', label: 'تكلفة الغذاء', value: Math.round(totalCost), tone: 'indigo' },
      { key: 'profit', label: 'صافي الربح', value: Math.round(totalProfit), tone: totalProfit < 0 ? 'rose' : 'default' },
      { key: 'margin', label: 'هامش الربح', value: margin, tone: 'amber', format: (v) => `${Number(v).toFixed(1)}%` },
    ];

    const itemsTable = new ReportTableBuilder()
      .addColumn(reportColumn('name', 'الصنف'))
      .addColumn(reportColumn('category', 'التصنيف', { format: (v) => catLabel(String(v)) }))
      .addColumn({ ...reportColumn('qty', 'الكمية'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('cost', 'التكلفة'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('profit', 'الربح'), aggregate: 'sum', tone: 'auto-money' })
      .addColumn({ ...reportColumn('margin', 'الهامش %'), format: (v) => `${Number(v).toFixed(1)}%` })
      .addColumn({ ...reportColumn('target', 'الهدف %'), format: (v) => `${Number(v).toFixed(0)}%` })
      .addRows(itemRows.map((l) => ({ id: l.recipeId || l.name, values: l })))
      .build();

    const branchesTable = new ReportTableBuilder()
      .addColumn(reportColumn('name', 'الفرع'))
      .addColumn({ ...reportColumn('qty', 'الكمية'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('cost', 'التكلفة'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('profit', 'الربح'), aggregate: 'sum', tone: 'auto-money' })
      .addColumn({ ...reportColumn('margin', 'الهامش %'), format: (v) => `${Number(v).toFixed(1)}%` })
      .addRows(branchRows.map((l) => ({ id: l.branchId, values: l })))
      .build();

    const dailyTable = new ReportTableBuilder()
      .addColumn(reportColumn('day', 'اليوم'))
      .addColumn({ ...reportColumn('revenue', 'الإيراد'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('cost', 'التكلفة'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('profit', 'الربح'), aggregate: 'sum', tone: 'auto-money' })
      .addRows(dailyRows.map((l) => ({ id: l.day, values: l })))
      .build();

    const result: ReportResult = {
      id: 'salesledger',
      title: 'دفتر المبيعات التحليلي الموحد',
      subtitle: 'تحليل المبيعات حسب الصنف والفرع واليوم مع هامش الربح ومقارنته بالهدف (شامل المرتجعات)',
      summaries,
      tables: [itemsTable, branchesTable, dailyTable],
      exportSheets: [
        { name: 'المبيعات حسب الصنف', header: ['الصنف', 'التصنيف', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %', 'الهدف %'], rows: itemRows.map((r) => [r.name, catLabel(r.category), r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2), r.target]) },
        { name: 'المبيعات حسب الفرع', header: ['الفرع', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'], rows: branchRows.map((r) => [r.name, r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2)]) },
        { name: 'المبيعات حسب اليوم', header: ['اليوم', 'الإيراد', 'التكلفة', 'الربح'], rows: dailyRows.map((r) => [r.day, r.revenue, r.cost, r.profit]) },
      ],
      generatedAt: new Date().toISOString(),
    };

    const visuals = (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs mb-3">الاتجاه اليومي: الإيراد مقابل التكلفة</h3>
        <div dir="ltr" className="h-64">
          {dailyRows.length === 0
            ? <p className="h-64 flex items-center justify-center text-xs font-bold text-slate-500">لا توجد مبيعات في النطاق المحدد</p>
            : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRows} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyFmt} />
                  <Tooltip formatter={(v: unknown, name?: unknown) => [moneyFmt(v), { revenue: 'الإيراد', cost: 'التكلفة', profit: 'الربح' }[String(name)] || String(name)]} />
                  <Legend formatter={(v: string) => ({ revenue: 'الإيراد', cost: 'التكلفة', profit: 'الربح' }[v] || v)} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>
    );

    const extraFilters = (
      <>
        <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
          التصنيف
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(RECIPE_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
          بحث
          <input type="text" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الصنف" />
        </label>
      </>
    );

    return { result, visuals, extraFilters };
  }, [engine, filters, categoryFilter, search, recipeCat, recipeName, targetMap, branches]);

  return (
    <ReportTemplate
      report={view.result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={branchOptions}
      visuals={view.visuals}
      extraFilters={view.extraFilters}
    />
  );
};

export default UnifiedSalesLedgerReport;