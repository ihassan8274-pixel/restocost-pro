import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Search, Layers3, Printer, Beef, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, VAT_RATE, netOfGross, categoryLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const RECIPE_CAT_LABELS: Record<string, string> = {
  main_dish: 'طبق رئيسي', appetizer: 'مقبلات', beverage: 'مشروبات', dessert: 'حلويات', sub_prep: 'تحضيرات مركزية',
};

interface SaleLine { recipeId: string; name: string; category: string; qty: number; revenue: number; cost: number; }

interface MaterialRow {
  matId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  purchaseUnit: string;
  purchaseUnitConversion: number;
  raw: number;
  consumedQty: number;
  consumedUnits: number;
  unitCost: number;
  value: number;
}

export const SalesLedgerView: React.FC = () => {
  const { posOrders, batchSalesRecords, posReturns, recipes, branches, rawMaterials, materialCategories, getAverageUnitCost } = useApp();
  const [tab, setTab] = useState<'items' | 'branches' | 'daily' | 'materials'>('items');
  const [branchFilter, setBranchFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState<string[]>([]);
  const [showMaterialCatPicker, setShowMaterialCatPicker] = useState(false);
  const materialFilterAll = materialCategoryFilter.length === 0;

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const inScope = (d: string, b?: string) => inDate(d) && (branchFilter === 'all' || b === branchFilter);

  const recipeCat = useMemo(() => new Map(recipes.map((r) => [r.id, r.category])), [recipes]);
  const recipeName = useMemo(() => new Map(recipes.map((r) => [r.id, r.nameAr])), [recipes]);
  const targetMap = useMemo(() => new Map(recipes.map((r) => [r.id, r.targetMarginPercent ?? 68])), [recipes]);

  const lines = useMemo<SaleLine[]>(() => {
    const map = new Map<string, SaleLine>();
    const add = (recipeId: string, name: string, cat: string | undefined, qty: number, revenue: number, cost: number) => {
      const key = recipeId || `other-${name}`;
      const cur = map.get(key) || { recipeId, name, category: recipeCat.get(recipeId) || cat || 'other', qty: 0, revenue: 0, cost: 0 };
      cur.name = name || recipeName.get(recipeId) || cur.name;
      cur.qty += qty; cur.revenue += revenue; cur.cost += cost;
      map.set(key, cur);
    };
    posOrders.forEach((o) => {
      if (!inScope(o.date, o.branchId)) return;
      const netPerItem = o.subtotal / (o.items.reduce((s, i) => s + i.lineTotal, 0) || 1);
      o.items.forEach((i) => add(i.recipeId, i.recipeName, undefined, i.quantity, i.lineTotal * netPerItem, i.quantity * i.unitCost));
    });
    batchSalesRecords.forEach((b) => {
      if (!inScope(b.date, b.branchId)) return;
      const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      const grossTotal = b.items.reduce((s, i) => s + i.lineTotalRevenue, 0) || 1;
      const netRatio = net / grossTotal;
      b.items.forEach((i) => add(i.recipeId, i.recipeNameAr, i.category, i.quantitySold, i.lineTotalRevenue * netRatio, i.lineTotalCost));
    });
    posReturns.forEach((r) => {
      if (!inScope(r.date, r.branchId)) return;
      r.items.forEach((i) => add(i.recipeId, i.recipeName, undefined, -i.quantity, -i.lineTotal, -(i.quantity * i.unitCost)));
    });
    return Array.from(map.values());
  }, [posOrders, batchSalesRecords, posReturns, recipeCat, recipeName, branchFilter, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const catLabel = (c: string) => RECIPE_CAT_LABELS[c] || c || 'غير مصنف';

  const filtered = useMemo(() => lines.filter((l) =>
    (categoryFilter === 'all' || l.category === categoryFilter) &&
    (!search || l.name.includes(search))
  ), [lines, categoryFilter, search]);

  const itemRows = useMemo(() => filtered
    .map((l) => ({ ...l, profit: l.revenue - l.cost, margin: l.revenue > 0 ? ((l.revenue - l.cost) / l.revenue) * 100 : 0, target: targetMap.get(l.recipeId) ?? 68 }))
    .sort((a, b) => b.revenue - a.revenue), [filtered, targetMap]);

  const branchRows = useMemo(() => {
    const map = new Map<string, SaleLine>();
    posOrders.forEach((o) => {
      if (!inScope(o.date, o.branchId)) return;
      const grossTotal = o.items.reduce((s, i) => s + i.lineTotal, 0) || 1;
      const netRatio = o.subtotal / grossTotal;
      o.items.forEach((i) => {
        const cat = recipeCat.get(i.recipeId);
        if (categoryFilter !== 'all' && cat !== categoryFilter) return;
        const cur = map.get(o.branchId) || { recipeId: '', name: '', category: '', qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.quantity; cur.revenue += i.lineTotal * netRatio; cur.cost += i.quantity * i.unitCost;
        map.set(o.branchId, cur);
      });
    });
    batchSalesRecords.forEach((b) => {
      if (!inScope(b.date, b.branchId)) return;
      const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      const grossTotal = b.items.reduce((s, i) => s + i.lineTotalRevenue, 0) || 1;
      const netRatio = net / grossTotal;
      b.items.forEach((i) => {
        const cat = recipeCat.get(i.recipeId) || i.category;
        if (categoryFilter !== 'all' && cat !== categoryFilter) return;
        const cur = map.get(b.branchId) || { recipeId: '', name: '', category: '', qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.quantitySold; cur.revenue += i.lineTotalRevenue * netRatio; cur.cost += i.lineTotalCost;
        map.set(b.branchId, cur);
      });
    });
    posReturns.forEach((r) => {
      if (!inScope(r.date, r.branchId)) return;
      const grossTotal = r.items.reduce((s, i) => s + i.lineTotal, 0) || 1;
      const netRatio = r.subtotal / grossTotal;
      r.items.forEach((i) => {
        const cat = recipeCat.get(i.recipeId);
        if (categoryFilter !== 'all' && cat !== categoryFilter) return;
        const cur = map.get(r.branchId) || { recipeId: '', name: '', category: '', qty: 0, revenue: 0, cost: 0 };
        cur.qty -= i.quantity; cur.revenue -= i.lineTotal * netRatio; cur.cost -= i.quantity * i.unitCost;
        map.set(r.branchId, cur);
      });
    });
    return Array.from(map.entries()).map(([branchId, l]) => ({ branchId, name: getBranchNameOf(branchId), qty: l.qty, revenue: l.revenue, cost: l.cost, profit: l.revenue - l.cost, margin: l.revenue > 0 ? ((l.revenue - l.cost) / l.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posOrders, batchSalesRecords, posReturns, recipeCat, branchFilter, fromDate, toDate, categoryFilter]);

  const dailyRows = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number }>();
    const add = (d: string, revenue: number, cost: number) => {
      const cur = map.get(d) || { revenue: 0, cost: 0 };
      cur.revenue += revenue; cur.cost += cost;
      map.set(d, cur);
    };
    posOrders.forEach((o) => { if (!inScope(o.date, o.branchId)) return; const grossTotal = o.items.reduce((s, i) => s + i.lineTotal, 0) || 1; const netRatio = o.subtotal / grossTotal; o.items.forEach((i) => add(o.date, i.lineTotal * netRatio, i.quantity * i.unitCost)); });
    batchSalesRecords.forEach((b) => { if (!inScope(b.date, b.branchId)) return; const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE); const grossTotal = b.items.reduce((s, i) => s + i.lineTotalRevenue, 0) || 1; const netRatio = net / grossTotal; b.items.forEach((i) => add(b.date, i.lineTotalRevenue * netRatio, i.lineTotalCost)); });
    posReturns.forEach((r) => { if (!inScope(r.date, r.branchId)) return; const grossTotal = r.items.reduce((s, i) => s + i.lineTotal, 0) || 1; const netRatio = r.subtotal / grossTotal; r.items.forEach((i) => add(r.date, -i.lineTotal * netRatio, -(i.quantity * i.unitCost))); });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, revenue: Math.round(v.revenue), cost: Math.round(v.cost), profit: Math.round(v.revenue - v.cost) }));
  }, [posOrders, batchSalesRecords, posReturns, branchFilter, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to avoid floating point precision issues
  const roundToPrecision = (val: number, precision = 3) => {
    const factor = Math.pow(10, precision);
    return Math.round((val + Number.EPSILON) * factor) / factor;
  };

  const materialRows = useMemo<MaterialRow[]>(() => {
    const expand = (recipeId: string, qty: number, acc: Map<string, number>) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      recipe.ingredients.forEach((ing) => {
        const factor = 1 + (ing.wastagePercent || 0) / 100;
        acc.set(ing.rawMaterialId, (acc.get(ing.rawMaterialId) || 0) + ing.quantity * factor * qty);
      });
      (recipe.subPrepIngredients || []).forEach((sp) => {
        const sub = recipes.find((r) => r.id === sp.recipeId);
        if (!sub) return;
        const pieces = Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces) : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1);
        sub.ingredients.forEach((ing) => {
          const factor = 1 + (ing.wastagePercent || 0) / 100;
          acc.set(ing.rawMaterialId, (acc.get(ing.rawMaterialId) || 0) + (ing.quantity / pieces) * factor * sp.quantity * qty);
        });
      });
    };
    const acc = new Map<string, number>();
    posOrders.forEach((o) => {
      if (!inScope(o.date, o.branchId)) return;
      o.items.forEach((i) => expand(i.recipeId, i.quantity, acc));
    });
    batchSalesRecords.forEach((b) => {
      if (!inScope(b.date, b.branchId)) return;
      b.items.forEach((i) => expand(i.recipeId, i.quantitySold, acc));
    });
    posReturns.forEach((r) => {
      if (!inScope(r.date, r.branchId)) return;
      r.items.forEach((i) => expand(i.recipeId, -i.quantity, acc));
    });
    const matById = new Map(rawMaterials.map((m) => [m.id, m]));
    return Array.from(acc.entries())
      .map(([matId, raw]) => {
        const m = matById.get(matId);
        if (!m) return null;
        const catLabel = categoryLabel(m.category, materialCategories);
        if (!materialFilterAll && !materialCategoryFilter.includes(catLabel)) return null;
        const rawQty = Math.max(0, raw);
        const conv = m.purchaseUnitConversion && m.purchaseUnitConversion > 0 ? m.purchaseUnitConversion : 1;
        const pu = m.purchaseUnit && m.purchaseUnitConversion ? m.purchaseUnit : m.unit;
        // Round up to nearest purchase unit
        const unitsNeeded = Math.ceil(rawQty / conv);
        const consumedQty = roundToPrecision(unitsNeeded * conv); // total in base unit
        const unitCost = getAverageUnitCost(matId);
        return {
          matId,
          code: m.code,
          name: m.nameAr,
          category: catLabel,
          unit: m.unit,
          purchaseUnit: pu,
          purchaseUnitConversion: conv,
          raw: roundToPrecision(rawQty),
          consumedQty,
          consumedUnits: unitsNeeded, // number of purchase units (e.g., 4 cartons)
          unitCost,
          value: roundToPrecision(consumedQty * unitCost),
        };
      })
      .filter((x): x is MaterialRow => x !== null)
      .sort((a, b) => b.value - a.value);
  }, [posOrders, batchSalesRecords, posReturns, recipes, rawMaterials, materialCategories, getAverageUnitCost, branchFilter, fromDate, toDate, materialCategoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function getBranchNameOf(id: string): string {
    return branches.find((b) => b.id === id)?.nameAr || id;
  }

  const totalRevenue = filtered.reduce((s, l) => s + l.revenue, 0);
  const totalCost = filtered.reduce((s, l) => s + l.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const totalOrders = posOrders.filter((o) => inScope(o.date, o.branchId)).length;

  const moneyFmt = (v: unknown) => fmt(Number(v), 0);

  const exportSheets = [
    { name: 'المبيعات حسب الصنف', header: ['الصنف', 'التصنيف', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %', 'الهدف %'], rows: itemRows.map((r) => [r.name, catLabel(r.category), r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2), r.target]) },
    { name: 'المبيعات حسب الفرع', header: ['الفرع', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'], rows: branchRows.map((r) => [r.name, r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2)]) },
    { name: 'المبيعات حسب اليوم', header: ['اليوم', 'الإيراد', 'التكلفة', 'الربح'], rows: dailyRows.map((r) => [r.day, r.revenue, r.cost, r.profit]) },
    { name: 'المبيعات → مواد خام', header: ['الصنف', 'التصنيف', 'الكمية المستهلكة (وحدة شراء)', 'تكلفة الوحدة', 'الإجمالي'], rows: materialRows.map((r) => [r.name, r.category, `${r.consumedUnits} ${r.purchaseUnit}`, r.unitCost, r.value]) },
  ];

  interface TabPrintData {
    title: string;
    subtitle: string;
    meta: [string, string][];
    header: string[];
    rows: (string | number)[][];
  }

  const printSalesLedger = () => {
    const getActiveTabData = (): TabPrintData => {
      switch (tab) {
        case 'items':
          return {
            title: 'المبيعات حسب الصنف',
            subtitle: `تحليل مبيعات الأصناف${branchFilter !== 'all' ? ` — ${getBranchNameOf(branchFilter)}` : ''}`,
            meta: [['إجمالي الإيراد', fmtMoney(totalRevenue)], ['إجمالي التكلفة', fmtMoney(totalCost)], ['الربح والهامش', `${fmtMoney(totalProfit)} (${margin.toFixed(2)}%)`], ['عدد الطلبات', `${totalOrders}`]] as [string, string][],
            header: ['الصنف', 'التصنيف', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %', 'الهدف %'],
            rows: itemRows.map((r) => [r.name, catLabel(r.category), r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2), r.target]),
          };
        case 'branches':
          return {
            title: 'المبيعات حسب الفرع',
            subtitle: `تحليل المبيعات حسب الفرع${branchFilter !== 'all' ? ` — ${getBranchNameOf(branchFilter)}` : ''}`,
            meta: [['إجمالي الإيراد', fmtMoney(totalRevenue)], ['إجمالي التكلفة', fmtMoney(totalCost)], ['الربح والهامش', `${fmtMoney(totalProfit)} (${margin.toFixed(2)}%)`], ['عدد الطلبات', `${totalOrders}`]] as [string, string][],
            header: ['الفرع', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'],
            rows: branchRows.map((r) => [r.name, r.qty, r.revenue, r.cost, r.profit, r.margin.toFixed(2)]),
          };
        case 'daily':
          return {
            title: 'المبيعات حسب اليوم',
            subtitle: `الاتجاه اليومي للمبيعات${branchFilter !== 'all' ? ` — ${getBranchNameOf(branchFilter)}` : ''}`,
            meta: [['إجمالي الإيراد', fmtMoney(totalRevenue)], ['إجمالي التكلفة', fmtMoney(totalCost)], ['الربح', fmtMoney(totalProfit)]] as [string, string][],
            header: ['اليوم', 'الإيراد', 'التكلفة', 'الربح'],
            rows: dailyRows.map((r) => [r.day, r.revenue, r.cost, r.profit]),
          };
        case 'materials':
        default:
          return {
            title: 'تحويل المبيعات → كميات مواد خام',
            subtitle: `احتياج المواد الخام من مبيعات الفترة${branchFilter !== 'all' ? ` — ${getBranchNameOf(branchFilter)}` : ''}`,
            meta: [['إجمالي وحدات الشراء', String(materialRows.reduce((s, r) => s + r.consumedUnits, 0))], ['إجمالي القيمة', fmtMoney(materialRows.reduce((s, r) => s + r.value, 0))], ['عدد الأصناف', `${materialRows.length}`]] as [string, string][],
            header: ['الصنف', 'التصنيف', 'الكمية المستهلكة (وحدة شراء)', 'تكلفة الوحدة', 'الإجمالي'],
            rows: materialRows.map((r) => [r.name, r.category, `${r.consumedUnits} ${r.purchaseUnit}`, r.unitCost, r.value]),
          };
      }
    };
    const data = getActiveTabData();
    openPrintWindow({
      title: data.title,
      subtitle: data.subtitle,
      meta: [
        ['الفترة', `${fromDate || 'البداية'} → ${toDate || 'النهاية'}`],
        ['الأفرع', branchFilter === 'all' ? 'كل الفروع' : getBranchNameOf(branchFilter)],
        ...data.meta,
      ],
      tables: [{ title: data.title, header: data.header, rows: data.rows }],
      charts: [],
      footer: 'دفتر المبيعات التحليلي — RestoCost ERP Pro',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="دفتر المبيعات التحليلي" subtitle="تحليل المبيعات حسب الصنف والفرع واليوم مع هامش الربح ومقارنته بالهدف (شامل المرتجعات)" icon={<BarChart3 className="w-6 h-6 text-emerald-300" />}
        actions={<>
          <ViewToolbar filename="دفتر المبيعات" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printSalesLedger}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('المبيعات_حسب_الصنف.csv', exportSheets[0].header, exportSheets[0].rows)}><Layers3 className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
        <Field label="التصنيف">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls + ' !w-40'}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(RECIPE_CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-48'} placeholder="اسم الصنف" />
          </div>
        </Field>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الإيراد</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalRevenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">طلبات نقاط البيع</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{totalOrders}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تكلفة الغذاء</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalCost)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الربح</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalProfit < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtMoney(totalProfit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">هامش الربح</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmt(margin, 1)}%</strong></div>
      </div>

      <TabBar tabs={[{ id: 'items', label: 'حسب الصنف' }, { id: 'branches', label: 'حسب الفرع' }, { id: 'daily', label: 'حسب اليوم' }, { id: 'materials', label: 'المبيعات → مواد خام' }]} active={tab} onChange={(id) => setTab(id as 'items' | 'branches' | 'daily' | 'materials')} />

      {tab === 'items' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">المبيعات حسب الصنف — مرتبة بالإيراد</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">الصنف</th>
                  <th className="text-right p-2 font-bold">التصنيف</th>
                  <th className="text-right p-2 font-bold">الكمية</th>
                  <th className="text-right p-2 font-bold">الإيراد</th>
                  <th className="text-right p-2 font-bold">التكلفة</th>
                  <th className="text-right p-2 font-bold">الربح</th>
                  <th className="text-right p-2 font-bold">الهامش</th>
                  <th className="text-right p-2 font-bold">الهدف</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((r) => (
                  <tr key={r.recipeId || r.name} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-800">{r.name}</td>
                    <td className="p-2 text-slate-500">{catLabel(r.category)}</td>
                    <td className="tnum text-left p-2 text-slate-700">{fmt(r.qty, 2)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(r.revenue, 2)}</td>
                    <td className="tnum text-left p-2 text-indigo-700">{fmt(r.cost, 2)}</td>
                    <td className={`p-2 font-mono font-bold ${r.profit < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(r.profit, 2)}</td>
                    <td className={`p-2 font-mono font-bold ${r.margin < r.target - 0.001 ? 'text-rose-600' : r.margin < r.target + 0.001 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmt(r.margin, 1)}%</td>
                    <td className="tnum text-left p-2 text-slate-500">{r.target}%</td>
                  </tr>
                ))}
                {itemRows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد مبيعات في النطاق المحدد</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'branches' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">المبيعات حسب الفرع</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">الفرع</th>
                  <th className="text-right p-2 font-bold">الكمية</th>
                  <th className="text-right p-2 font-bold">الإيراد</th>
                  <th className="text-right p-2 font-bold">التكلفة</th>
                  <th className="text-right p-2 font-bold">الربح</th>
                  <th className="text-right p-2 font-bold">الهامش</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((r) => (
                  <tr key={r.branchId} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-800">{r.name}</td>
                    <td className="tnum text-left p-2 text-slate-700">{fmt(r.qty, 2)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(r.revenue, 2)}</td>
                    <td className="tnum text-left p-2 text-indigo-700">{fmt(r.cost, 2)}</td>
                    <td className={`p-2 font-mono font-bold ${r.profit < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(r.profit, 2)}</td>
                    <td className="tnum text-left p-2 font-bold text-amber-700">{fmt(r.margin, 1)}%</td>
                  </tr>
                ))}
                {branchRows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500 font-bold">لا توجد مبيعات في النطاق المحدد</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'daily' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">الاتجاه اليومي: الإيراد مقابل التكلفة</h3>
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRows} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyFmt} />
                  <Tooltip formatter={(v: unknown, name?: unknown) => [moneyFmt(v), { revenue: 'الإيراد', cost: 'التكلفة', profit: 'الربح' }[String(name)] || String(name)]} />
                  <Legend formatter={(v: string) => ({ revenue: 'الإيراد', cost: 'التكلفة', profit: 'الربح' }[v] || v)} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                  <Bar dataKey="cost" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                  <Bar dataKey="profit" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                    <th className="text-right p-2 font-bold">اليوم</th>
                    <th className="text-right p-2 font-bold">الإيراد</th>
                    <th className="text-right p-2 font-bold">التكلفة</th>
                    <th className="text-right p-2 font-bold">الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((r) => (
                    <tr key={r.day} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-800">{r.day}</td>
                      <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(r.revenue)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(r.cost)}</td>
                      <td className={`p-2 font-mono font-bold ${r.profit < 0 ? 'text-rose-600' : 'text-indigo-700'}`}>{fmt(r.profit)}</td>
                    </tr>
                  ))}
                  {dailyRows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500 font-bold">لا توجد مبيعات في النطاق المحدد</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5"><Beef className="w-4 h-4 text-rose-500" /> تحويل مبيعات الفترة إلى كميات مواد خام (تقريب لأقرب وحدة شراء)</h3>
            <p className="text-[10px] text-slate-500 font-bold mb-3">يحسب الاحتياج النظري من مبيعات نقاط البيع والمبيعات المجمعة مطروحاً منها المرتجعات وفق الوصفات القياسية (شاملاً التحضيرات المركزية الفرعية)، ثم يُقرَّب إلى أقرب وحدة شراء لأعلى ليكون صالحاً للطلب.</p>
            
            <Field label="مجموعات الأصناف">
              <div className="relative">
                <button onClick={() => setShowMaterialCatPicker(!showMaterialCatPicker)} className="w-full text-right p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 flex items-center justify-between">
                  <span>{materialFilterAll ? 'كل المجموعات' : `${materialCategoryFilter.length} مجموعة محددة`}</span>
                  <span>{showMaterialCatPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                </button>
                {showMaterialCatPicker && (() => {
                  const allCats = Array.from(new Set(rawMaterials.map((m) => categoryLabel(m.category, materialCategories)))).sort();
                  return (
                    <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-300 rounded-lg shadow-lg p-2 z-20 max-h-60 overflow-auto">
                      <label className="flex items-center gap-2 text-xs p-1 hover:bg-slate-50 rounded cursor-pointer">
                        <input type="checkbox" checked={materialFilterAll} onChange={(e) => setMaterialCategoryFilter(e.target.checked ? [] : allCats)} className="w-4 h-4" />
                        <span>اختيار الكل</span>
                      </label>
                      <hr className="my-1" />
                      {allCats.map((cat) => (
                        <label key={cat} className="flex items-center gap-2 text-xs p-1 hover:bg-slate-50 rounded cursor-pointer">
                          <input type="checkbox" checked={materialCategoryFilter.includes(cat)} onChange={(e) => setMaterialCategoryFilter(e.target.checked ? [...materialCategoryFilter, cat] : materialCategoryFilter.filter((c) => c !== cat))} className="w-4 h-4" />
                          <span>{cat}</span>
                        </label>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </Field>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-slate-500 border-b-2 border-slate-200 text-[10px]">
                    <th className="text-right p-2 font-bold">الصنف</th>
                    <th className="text-right p-2 font-bold">التصنيف</th>
                    <th className="text-right p-2 font-bold">الكمية المستهلكة (وحدة شراء)</th>
                    <th className="text-right p-2 font-bold">تكلفة الوحدة</th>
                    <th className="text-right p-2 font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {materialRows.map((r) => (
                    <tr key={r.matId} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-800">{r.name}</td>
                      <td className="p-2 text-slate-500">{r.category}</td>
                      <td className="tnum text-left p-2 font-extrabold text-rose-700">{r.consumedUnits} {r.purchaseUnit}</td>
                      <td className="tnum text-left p-2 text-indigo-700">{fmtMoney(r.unitCost)}</td>
                      <td className="tnum text-left p-2 font-bold text-emerald-700">{fmtMoney(r.value)}</td>
                    </tr>
                  ))}
                  {materialRows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">لا توجد مبيعات في النطاق المحدد أو لا توجد أصناف في المجموعات المختارة</td></tr>}
                </tbody>
                {materialRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-200">
                      <td className="p-2" colSpan={2}>الإجمالي</td>
                      <td className="tnum text-left p-2 text-rose-700">{materialRows.reduce((s, r) => s + r.consumedUnits, 0)}</td>
                      <td className="p-2">—</td>
                      <td className="tnum text-left p-2 text-emerald-700">{fmtMoney(materialRows.reduce((s, r) => s + r.value, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
          <p className="text-center text-[10px] text-slate-400 font-bold"><TrendingUp className="w-3 h-3 inline ml-1" /> الكمية المستهلكة بوحدة الشراء مقربة للأعلى — الإجمالي = الكمية × تكلفة الوحدة.</p>
        </div>
      )}

      <p className="text-center text-[10px] text-slate-400 font-bold"><TrendingUp className="w-3 h-3 inline ml-1" /> يشمل التحليل مبيعات نقاط البيع والمبيعات المجمعة مطروحاً منها المرتجعات — والهامش بالأحمر يعني انحرافاً دون الهدف.</p>
    </div>
  );
};