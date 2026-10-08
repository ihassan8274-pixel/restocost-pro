import React, { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, ClipboardList, Search, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, allCategoryLabels, categoryLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { summariseMovement, buildItemLedger, buildOpeningMap, type MovementSummaryInput, type MovementSource } from '../../business/inventory-movement-report';

export const InventoryMovementView: React.FC = () => {
  const { rawMaterials, branches, inventory, grnNotes, stockTransfers, wastageLogs, productionRuns, physicalCounts, openingBalances, inventoryMovements, supplierReturns, getBranchName, getAverageUnitCost, getBranchAverageUnitCost, materialCategories } = useApp();

  const [tab, setTab] = useState<'summary' | 'ledger' | 'live'>('summary');
  const [branchFilter, setBranchFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [ledgerItem, setLedgerItem] = useState(rawMaterials[0]?.id || '');
  const [ledgerBranch, setLedgerBranch] = useState('all');

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const inBranch = (b: string) => branchFilter === 'all' || b === branchFilter;

  // Latest opening balance per branch, keyed by `branchId|rawMaterialId`
  // Kept for potential future use; currently not referenced directly
  // Latest opening balance per branch, keyed by `branchId|rawMaterialId`
  // Kept for potential future use; currently not referenced directly
  const _openingMap = useMemo(() => {
    const latest = new Map<string, typeof openingBalances[number]>();
    openingBalances.forEach((r) => {
      const cur = latest.get(r.branchId);
      if (!cur || r.date > cur.date) latest.set(r.branchId, r);
    });
    const map: Record<string, number> = {};
    latest.forEach((r) => r.items.forEach((i) => {
      const k = r.branchId + '|' + i.rawMaterialId;
      map[k] = (map[k] || 0) + i.quantity;
    }));
    return map;
  }, [openingBalances]);
  // Suppress unused variable warning
  void _openingMap;

  const filteredMaterials = useMemo(() => rawMaterials.filter((m) =>
    (categoryFilter === 'all' || m.category === categoryFilter) &&
    (!search || m.nameAr.includes(search) || m.code.toLowerCase().includes(search.toLowerCase()))
  ), [rawMaterials, categoryFilter, search]);

  // ── استخراج البيانات الخام للنموذج النقي ───────────────────────────────
  const inputData: MovementSummaryInput = useMemo(() => ({
    rawMaterialId: '', // سيتم تعيينها داخل الخريطة
    branches,
    inventory,
    movements: inventoryMovements.map(m => ({ ...m, rawMaterialId: m.rawMaterialId, branchId: m.branchId, delta: m.delta, type: m.type, date: m.date, ref: m.ref })) as MovementSource[],
    openingBalances: openingBalances.map(ob => ({ branchId: ob.branchId, date: ob.date, items: ob.items.map(i => ({ rawMaterialId: i.rawMaterialId, quantity: i.quantity, unitCost: i.unitCost })) })),
    grnNotes: grnNotes.map(g => ({ ...g, items: g.items.map(i => ({ rawMaterialId: i.rawMaterialId, quantityReceived: i.quantityReceived })) })),
    stockTransfers: stockTransfers.map(t => ({ status: t.status, fromBranchId: t.fromBranchId, toBranchId: t.toBranchId, date: t.date, items: t.items.map(i => ({ rawMaterialId: i.rawMaterialId ?? '', quantity: i.quantity })) })),
    productionRuns: productionRuns.map(r => ({ ...r, items: r.items.map(i => ({ rawMaterialId: i.rawMaterialId, requiredQty: i.requiredQty })) })),
    wastageLogs: wastageLogs.map(w => ({ rawMaterialId: w.rawMaterialId ?? '', branchId: w.branchId, date: w.date, quantity: w.quantity })),

    physicalCounts: physicalCounts.map(p => ({ ...p, items: p.items.map(i => ({ rawMaterialId: i.rawMaterialId, varianceQty: i.varianceQty })) })),
    supplierReturns: supplierReturns.map(r => ({ ...r, items: r.items.map(i => ({ rawMaterialId: i.rawMaterialId, quantity: i.quantity })) })),
    branchFilter,
    fromDate,
    toDate,
  }), [grnNotes, stockTransfers, wastageLogs, productionRuns, physicalCounts, supplierReturns, openingBalances, inventoryMovements, branchFilter, fromDate, toDate]);

  // ── حساب الملخص باستخدام الموديول النقي ─────────────────────────────────
  const summary = useMemo(() => filteredMaterials.map((m) => {
    const input = { ...inputData, rawMaterialId: m.id };
    const row = summariseMovement(input);
    return {
      m,
      opening: row.opening,
      purchases: row.docPurchases,
      transIn: row.docTransIn,
      transOut: row.docTransOut,
      production: row.docProduction,
      wastage: row.docWastage,
      adjustment: row.docAdjustment,
      supplierReturnsQty: row.docSupplierReturns,
      calculated: row.docCalculated,
      current: row.current,
      diff: row.current - row.docCalculated, // يبقى كما كان للعرض التاريخي
      // حقول جديدة تكشف الحقيقة
      ledgerCalculated: row.ledgerCalculated,
      ledgerNet: row.ledgerNet,
      ledgerGap: row.ledgerGap,
      docGap: row.docGap,
      movementCount: row.movementCount,
      currentValue: row.current * getAverageUnitCost(m.id),
    };
  }), [filteredMaterials, inputData, getAverageUnitCost]);

  const ledger = useMemo(() => {
    if (!ledgerItem) return { rows: [], opening: 0, inTotal: 0, outTotal: 0, final: 0 };
    
    // ── حساب الافتتاحي لهذا الصنف والفرع ──────────────────────────────────
    // تحويل أرصدة الافتتاح إلى التنسيق المتوقع من buildOpeningMap
    // خريطة الافتتاحيات — المفتاح مركّب من (الصنف + الفرع + التاريخ)،
    // فيجد كل سطر حركةٍ رصيده الافتتاحي الصحيح قبل أوّل حركة ضمن فترته
    const obForMap = openingBalances.map(ob => ({
      branchId: ob.branchId,
      date: ob.date,
      items: (ob.items || []).map(i => ({ rawMaterialId: i.rawMaterialId, quantity: i.quantity, unitCost: i.unitCost }))
    }));
    const openingMap = buildOpeningMap(obForMap);
    
    let opening = 0;
    if (ledgerBranch === 'all') {
      opening = branches.reduce((sum, b) => {
        return sum + (openingMap.get(`${b.id}|${ledgerItem}`) || 0);
      }, 0);
    } else {
      opening = openingMap.get(`${ledgerBranch}|${ledgerItem}`) || 0;
    }
    
    const costFor = () => getBranchAverageUnitCost(ledgerBranch, ledgerItem) || getAverageUnitCost(ledgerItem);
    
    const movementsForLedger = inventoryMovements.map(m => ({
      id: m.id,
      rawMaterialId: m.rawMaterialId,
      branchId: m.branchId,
      delta: m.delta,
      type: m.type,
      date: m.date,
      ref: m.ref,
      reference: m.ref,
      branchName: getBranchName(m.branchId),
      qty: m.delta,
      cost: 0,
      value: 0,
      running: 0,
    }));
    
    return buildItemLedger(
      movementsForLedger,
      {
        rawMaterialId: ledgerItem,
        branchFilter: ledgerBranch,
        fromDate,
        toDate,
        opening,
        costFor,
        getBranchName,
      },
    );
  }, [ledgerItem, ledgerBranch, inventoryMovements, openingBalances, branches, fromDate, toDate, getAverageUnitCost, getBranchAverageUnitCost]);

  const totalPurchases = summary.reduce((s, r) => s + r.purchases, 0);
  const totalOut = summary.reduce((s, r) => s + r.transOut + r.production + r.wastage, 0);
  const totalCurrentValue = summary.reduce((s, r) => s + r.currentValue, 0);

  const exportSheets = [
    { name: 'ملخص حركة المخزون', header: ['الكود', 'الصنف', 'التصنيف', 'افتتاحي', 'مشتريات', 'وارد تحويلات', 'صادر تحويلات', 'استهلاك إنتاج', 'هالك', 'تسويات جرد', 'إرجاع موردين', 'المحسوب (مستندات)', 'المحسوب (دفتر)', 'الرصيد الحالي', 'فجوة الدفتر', 'فجوة المستندات', 'الفرق (قديم)'], rows: summary.map((r) => [r.m.code, r.m.nameAr, categoryLabel(r.m.category, materialCategories), r.opening, r.purchases, r.transIn, r.transOut, r.production, r.wastage, r.adjustment, r.supplierReturnsQty, r.calculated, r.ledgerCalculated, r.current, r.ledgerGap, r.docGap, r.diff]) },
    { name: 'دفتر حركة صنف', header: ['التاريخ', 'الحركة', 'المرجع', 'الفرع', 'الكمية', 'التكلفة/الوحدة', 'القيمة', 'الرصيد الجاري'], rows: ledger.rows.map((r) => [r.date, r.type, r.reference, r.branchName, r.qty, r.cost, r.value, r.running]) },
  ];

  const liveRows = useMemo(() => inventoryMovements
    .filter((m) => inBranch(m.branchId) && inDate(m.date.slice(0, 10)))
    .map((m) => ({ ...m, itemName: rawMaterials.find((r) => r.id === m.rawMaterialId)?.nameAr || m.rawMaterialId })), [inventoryMovements, rawMaterials, branchFilter, fromDate, toDate]);

  const printLive = () => {
    const inQ = liveRows.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
    const outQ = liveRows.filter((m) => m.delta < 0).reduce((s, m) => s - m.delta, 0);
    openPrintWindow({
      title: 'السجل المباشر لحركات المخزون',
      subtitle: `${branchFilter === 'all' ? 'كل الفروع' : getBranchName(branchFilter)} — طباعة ${new Date().toLocaleDateString('ar-SA-u-nu-latn')}`,
      meta: [
        ['عدد الحركات', `${liveRows.length}`], ['إجمالي الوارد (كمية)', fmt(inQ, 2)], ['إجمالي الصادر (كمية)', fmt(outQ, 2)],
      ],
      tables: [{
        title: 'الحركات المسجلة تلقائياً',
        header: ['التاريخ', 'النوع', 'المرجع', 'الفرع', 'الصنف', 'التغيير'],
        rows: liveRows.slice(0, 400).map((m) => [m.date.replace('T', ' ').slice(0, 16), m.type, m.ref || '-', getBranchName(m.branchId), m.itemName, (m.delta > 0 ? '+' : '') + fmt(m.delta, 3)]),
      }],
      totals: [],
      footer: 'سجل حركة المخزون الفوري — RestoCost ERP',
    });
  };

  const printSummarySheet = () => {
    openPrintWindow({
      title: 'ملخص حركة المخزون',
      subtitle: `الفترة ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'} — ${branchFilter === 'all' ? 'كل الفروع' : getBranchName(branchFilter)}`,
      meta: [['الأصناف المعروضة', `${summary.length}`], ['إجمالي المشتريات', fmt(totalPurchases, 2)], ['إجمالي الصادر', fmt(totalOut, 2)], ['قيمة المخزون الحالي', fmtMoney(totalCurrentValue)]],
      tables: [{ title: 'الملخص', header: exportSheets[0].header, rows: exportSheets[0].rows }],
      totals: [],
      footer: 'تقرير حركة المخزون — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تقرير حركة المخزون" subtitle="الوارد والصادر لكل صنف من المشتريات والتحويلات والإنتاج والهالك وتسويات الجرد، مع دفتر حركة تفصيلي" icon={<Activity className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar filename="حركة المخزون" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printSummarySheet}><Printer className="w-4 h-4" /> طباعة الملخص</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV(`حركة_المخزون_${branchFilter === 'all' ? 'الكل' : 'فرع'}.csv`, exportSheets[0].header, exportSheets[0].rows)}><ClipboardList className="w-4 h-4" /> تصدير الملخص</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
          <div className="flex items-end gap-1">
            <Btn tone="ghost" onClick={() => { const first = new Date(); first.setDate(1); setFromDate(first.toISOString().slice(0, 10)); setToDate(new Date().toISOString().slice(0, 10)); }}>هذا الشهر</Btn>
            <Btn tone="ghost" onClick={() => { const last = new Date(); last.setMonth(last.getMonth() - 1); last.setDate(1); const end = new Date(); end.setDate(0); setFromDate(last.toISOString().slice(0, 10)); setToDate(end.toISOString().slice(0, 10)); }}>الشهر الماضي</Btn>
            <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح</Btn>
          </div>
        </div>
        <Field label="التصنيف">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(allCategoryLabels(materialCategories)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-48'} placeholder="اسم الصنف أو الكود" />
          </div>
        </Field>
      </Card>

      <TabBar tabs={[{ id: 'summary', label: 'ملخص الحركة' }, { id: 'ledger', label: 'دفتر حركة صنف' }, { id: 'live', label: `السجل المباشر (${liveRows.length})` }]} active={tab} onChange={(id) => setTab(id as 'summary' | 'ledger' | 'live')} />

      {tab === 'live' && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold text-slate-700">سجل الحركات الفوري — يُنشأ تلقائياً مع كل عملية (بيع، هدر، استلام، تحويل، جرد…)</h3>
            <Btn tone="ghost" onClick={printLive}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line sticky top-0">
                <tr><th className="p-2.5">التاريخ</th><th className="p-2.5">النوع</th><th className="p-2.5">المرجع</th><th className="p-2.5">الفرع</th><th className="p-2.5">الصنف</th><th className="p-2.5">التغيير</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveRows.slice(0, 300).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-2.5 text-slate-500">{m.date.replace('T', ' ').slice(0, 16)}</td>
                    <td className="p-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.delta > 0 ? 'bg-emerald-100 text-emerald-700' : m.type === 'هدر' ? 'bg-rose-100 text-rose-700' : 'bg-brand-100 text-brand-700'}`}>{m.type}</span></td>
                    <td className="tnum text-left p-2.5 text-slate-500">{m.ref || '-'}</td>
                    <td className="p-2.5">{getBranchName(m.branchId)}</td>
                    <td className="p-2.5 font-bold">{m.itemName}</td>
                    <td className={`p-2.5 font-mono font-extrabold ${m.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(m.delta > 0 ? '+' : '') + fmt(m.delta, 3)}</td>
                  </tr>
                ))}
                {liveRows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا حركات مسجلة بعد — سيظهر السجل مع أول عملية جديدة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الأصناف المعروضة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{summary.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المشتريات (كمية)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(totalPurchases, 2)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الصادر (كمية)</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fmt(totalOut, 2)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المخزون الحالي</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(totalCurrentValue)}</strong></div>
          </div>

          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">ملخص الوارد والصادر حسب الصنف</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[1200px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                    <th className="text-right p-2 font-bold">الكود</th>
                    <th className="text-right p-2 font-bold">الصنف</th>
                    <th className="text-right p-2 font-bold">التصنيف</th>
                    <th className="text-right p-2 font-bold">الرصيد الافتتاحي</th>
                    <th className="text-right p-2 font-bold text-emerald-700">+ مشتريات</th>
                    <th className="text-right p-2 font-bold text-emerald-700">+ وارد تحويلات</th>
                    <th className="text-right p-2 font-bold text-rose-600">− صادر تحويلات</th>
                    <th className="text-right p-2 font-bold text-rose-600">− إنتاج</th>
                    <th className="text-right p-2 font-bold text-rose-600">− هالك</th>
                    <th className="text-right p-2 font-bold text-amber-700">± تسويات جرد</th>
                    <th className="text-right p-2 font-bold text-rose-600">− إرجاع موردين</th>
                    <th className="text-right p-2 font-bold text-brand-700">المحسوب (مستندات)</th>
                    <th className="text-right p-2 font-bold text-brand-700">المحسوب (دفتر)</th>
                    <th className="text-right p-2 font-bold">الرصيد الحالي</th>
                    <th className="text-right p-2 font-bold text-amber-700">فجوة الدفتر</th>
                    <th className="text-right p-2 font-bold text-amber-700">فجوة المستندات</th>
                    <th className="text-right p-2 font-bold">الفرق (قديم)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.m.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="tnum text-left p-2 font-bold text-brand-700">{r.m.code}</td>
                      <td className="p-2 font-bold text-slate-800">{r.m.nameAr}</td>
                      <td className="p-2 text-slate-500">{categoryLabel(r.m.category, materialCategories)}</td>
                      <td className="tnum text-left p-2 text-slate-600">{fmt(r.opening, 2)}</td>
                      <td className="tnum text-left p-2 text-emerald-700">{fmt(r.purchases, 2)}</td>
                      <td className="tnum text-left p-2 text-emerald-700">{fmt(r.transIn, 2)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(r.transOut, 2)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(r.production, 2)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(r.wastage, 2)}</td>
                      <td className={`p-2 font-mono ${r.adjustment < 0 ? 'text-rose-600' : r.adjustment > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(r.adjustment, 2)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(r.supplierReturnsQty, 2)}</td>
                      <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(r.calculated, 2)}</td>
                      <td className="tnum text-left p-2 font-bold text-brand-700">{fmt(r.ledgerCalculated, 2)}</td>
                      <td className="tnum text-left p-2 font-bold text-slate-800">{fmt(r.current, 2)}</td>
                      <td className={`p-2 font-mono font-bold ${r.ledgerGap < -0.001 ? 'text-rose-600' : r.ledgerGap > 0.001 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(r.ledgerGap, 2)}</td>
                      <td className={`p-2 font-mono ${r.docGap < -0.001 ? 'text-rose-600' : r.docGap > 0.001 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(r.docGap, 2)}</td>
                      <td className={`p-2 font-mono font-bold ${r.diff < -0.001 ? 'text-rose-600' : r.diff > 0.001 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(r.diff, 2)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && <tr><td colSpan={14} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف مطابقة للفلاتر المحددة</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-bold">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> الوارد (مشتريات + تحويلات وارد)
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 mr-2" /> الصادر (تحويلات + إنتاج + هالك)
              <Activity className="w-3.5 h-3.5 text-amber-500 mr-2" /> فجوة الدفتر = الحالي − محسوب(دفتر) <span className="text-rose-600">⚠</span>
              <Activity className="w-3.5 h-3.5 text-emerald-500 mr-2" /> فجوة المستندات = محسوب(مستندات) − محسوب(دفتر)
              <Activity className="w-3.5 h-3.5 text-amber-500 mr-2" /> الفرق القديم = الحالي − محسوب(مستندات)
            </div>
          </Card>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
            <Field label="الصنف">
              <AutocompleteSelect
                value={ledgerItem}
                onChange={(val) => setLedgerItem(val)}
                options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: `${m.code} — ${m.nameAr}`, code: m.code }))}
                getOptionLabel={(opt) => opt.label}
                placeholder="— اختر مادة خام —"
                className="w-full"
              />
            </Field>
            <Field label="الفرع">
              <select value={ledgerBranch} onChange={(e) => setLedgerBranch(e.target.value)} className={inputCls + ' !w-44'}>
                <option value="all">كل الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الرصيد الافتتاحي</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(ledger.opening, 2)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الوارد</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(ledger.inTotal, 2)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الصادر</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fmt(ledger.outTotal, 2)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الرصيد النهائي المحسوب</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmt(ledger.final, 2)}</strong></div>
          </div>

          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">دفتر الحركة التفصيلي مع الرصيد الجاري</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[800px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                    <th className="text-right p-2 font-bold">التاريخ</th>
                    <th className="text-right p-2 font-bold">الحركة</th>
                    <th className="text-right p-2 font-bold">المرجع</th>
                    <th className="text-right p-2 font-bold">الفرع</th>
                    <th className="text-right p-2 font-bold">الكمية</th>
                    <th className="text-right p-2 font-bold">التكلفة/الوحدة</th>
                    <th className="text-right p-2 font-bold">القيمة</th>
                    <th className="text-right p-2 font-bold">الرصيد الجاري</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((r, i) => (
                    <tr key={i} className={`border-b border-slate-50 ${r.type === 'رصيد افتتاحي' ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}>
                      <td className="tnum text-left p-2 text-slate-600">{r.date}</td>
                      <td className="p-2 font-bold text-slate-800">{r.type}</td>
                      <td className="p-2 text-slate-500">{r.reference}</td>
                      <td className="p-2 text-slate-500">{r.branchName}</td>
                      <td className={`p-2 font-mono font-bold ${r.qty > 0.001 ? 'text-emerald-700' : r.qty < -0.001 ? 'text-rose-600' : 'text-slate-400'}`}>{r.qty > 0.001 ? '+' : ''}{fmt(r.qty, 2)}</td>
                      <td className="tnum text-left p-2 text-slate-500">{fmt(r.cost, 2)}</td>
                      <td className={`p-2 font-mono ${r.value < -0.001 ? 'text-rose-600' : r.value > 0.001 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(r.value, 2)}</td>
                      <td className="tnum text-left p-2 font-extrabold text-brand-700">{fmt(r.running, 2)}</td>
                    </tr>
                  ))}
                  {ledger.rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد حركة لهذا الصنف في الفترة المحددة</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};