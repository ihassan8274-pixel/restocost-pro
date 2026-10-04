import React, { useMemo, useState } from 'react';
import { Factory, Plus, Printer, PackageCheck, TrendingUp, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface ForecastRow {
  recipeId: string;
  code: string;
  nameAr: string;
  unit: string;
  historyQty: number;
  dailyAvg: number;
  forecast: number;
  stock: number;
  openWO: number;
  netNeed: number;
  suggested: number;
  selected: boolean;
}

export const ProductionPlanningView: React.FC = () => {
  const {
    recipes, posOrders, batchSalesRecords, workOrders, inventory, rawMaterials,
    visibleBranchIds, getRecipeStock, addWorkOrder, manufactureRecipe, getAverageUnitCost,
  } = useApp();
  const [historyDays, setHistoryDays] = useState(30);
  const [forecastDays, setForecastDays] = useState(7);
  const [scopeBranch, setScopeBranch] = useState('all');
  const [tab, setTab] = useState<'forecast' | 'materials'>('forecast');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  const scopeBranches = scopeBranch === 'all' ? visibleBranchIds : visibleBranchIds.filter((id) => id === scopeBranch);

  const salesByRecipe = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - historyDays);
    const inWindow = (d: string) => { const t = new Date(d).getTime(); return !isNaN(t) && t >= cutoff.getTime(); };
    const data: Record<string, number> = {};
    posOrders.filter((o) => scopeBranches.includes(o.branchId) && inWindow(o.date)).forEach((o) => o.items.forEach((i) => { data[i.recipeId] = (data[i.recipeId] || 0) + i.quantity; }));
    batchSalesRecords.filter((b) => scopeBranches.includes(b.branchId) && inWindow(b.date)).forEach((b) => b.items.forEach((i) => { data[i.recipeId] = (data[i.recipeId] || 0) + i.quantitySold; }));
    workOrders.filter((w) => w.status === 'completed' && w.rawMaterialsDeducted && inWindow(w.completionDate || w.startDate)).forEach((w) => { data[w.recipeId] = (data[w.recipeId] || 0) + w.targetQuantity; });
    return data;
  }, [posOrders, batchSalesRecords, workOrders, historyDays, scopeBranches]);

  const openWorkOrdersPerRecipe = useMemo(() => {
    const map: Record<string, number> = {};
    workOrders.filter((w) => ['planned', 'in_progress'].includes(w.status)).forEach((w) => { map[w.recipeId] = (map[w.recipeId] || 0) + (w.targetQuantity - w.producedQuantity); });
    return map;
  }, [workOrders]);

  const rows = useMemo<ForecastRow[]>(() => {
    const list = recipes
      .filter((r) => r.isActive && !r.isCentralKitchenPrep)
      .map((r) => {
        const historyQty = salesByRecipe[r.id] || 0;
        const dailyAvg = historyQty / Math.max(1, historyDays);
        const forecast = dailyAvg * forecastDays;
        let stock = 0;
        scopeBranches.forEach((bid) => { stock += getRecipeStock(bid, r.id); });
        const openWO = openWorkOrdersPerRecipe[r.id] || 0;
        const netNeed = Math.max(0, forecast - stock - openWO);
        const suggested = Math.ceil(netNeed);
        return {
          recipeId: r.id, code: r.code, nameAr: r.nameAr, unit: 'حصة',
          historyQty, dailyAvg, forecast, stock, openWO, netNeed, suggested,
          selected: (selected[r.id] ?? false) && suggested > 0,
        };
      })
      .filter((r) => r.suggested > 0)
      .sort((a, b) => b.suggested - a.suggested);
    return list;
  }, [recipes, salesByRecipe, historyDays, forecastDays, scopeBranches, getRecipeStock, openWorkOrdersPerRecipe, selected]);

  const forecasts = rows;
  const totalSuggested = forecasts.reduce((s, r) => s + r.suggested, 0);
  const selectedCount = forecasts.filter((r) => r.selected).length;

  const materialNeeds = useMemo(() => {
    const needs: Record<string, number> = {};
    forecasts.filter((r) => r.selected).forEach((r) => {
      const recipe = recipes.find((x) => x.id === r.recipeId);
      recipe?.ingredients.forEach((ing) => { needs[ing.rawMaterialId] = (needs[ing.rawMaterialId] || 0) + ing.quantity * r.suggested; });
    });
    const stock: Record<string, number> = {};
    inventory.filter((i) => scopeBranches.includes(i.branchId)).forEach((i) => { stock[i.rawMaterialId] = (stock[i.rawMaterialId] || 0) + i.quantity; });
    return rawMaterials
      .filter((m) => needs[m.id])
      .map((m) => {
        const need = needs[m.id];
        const onHand = stock[m.id] || 0;
        return { m, need, onHand, shortfall: Math.max(0, need - onHand), value: need * getAverageUnitCost(m.id) };
      })
      .sort((a, b) => b.need - a.need);
  }, [forecasts, recipes, inventory, rawMaterials, scopeBranches, getAverageUnitCost]);

  const materialShortfallValue = materialNeeds.reduce((s, r) => s + r.value, 0);

  const toggleRow = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleAll = () => {
    const allOn = forecasts.length > 0 && forecasts.every((r) => r.selected);
    setSelected((prev) => {
      const next = { ...prev };
      forecasts.forEach((r) => { next[r.recipeId] = !allOn; });
      return next;
    });
  };

  const createWorkOrders = () => {
    const chosen = forecasts.filter((r) => r.selected);
    if (chosen.length === 0) { setMsg('اختر صنفاً واحداً على الأقل لإنشاء أوامر الإنتاج.'); return; }
    chosen.forEach((r) => {
      addWorkOrder({
        recipeId: r.recipeId, recipeName: r.nameAr, centralKitchenId: 'b-ck', targetBranchId: 'b-ck',
        targetQuantity: r.suggested, producedQuantity: 0, prepChef: 'الشيف - تخطيط الإنتاج',
      });
    });
    setMsg(`تم إنشاء ${chosen.length} أمر إنتاج (خططت ${totalSuggested} حصة).`);
  };

  const manufactureNow = (r: ForecastRow) => {
    const res = manufactureRecipe({ branchId: 'b-ck', recipeId: r.recipeId, batchSize: r.suggested, producedBy: 'الشيف' });
    setMsg(res.ok ? `تم إنتاج ${r.nameAr} (${r.suggested} حصة).` : (res.error || 'تعذر الإنتاج (راجع المخزون).'));
  };

  const exportSheets = [
    { name: 'توقعات الإنتاج', header: ['الكود', 'الصنف', 'كمية التاريخ', 'متوسط/يوم', 'التوقعات', 'المخزون', 'أوامر مفتوحة', 'الاحتياج الصافي', 'المقترح'], rows: forecasts.map((r) => [r.code, r.nameAr, r.historyQty, r.dailyAvg.toFixed(1), r.forecast.toFixed(1), r.stock, r.openWO, r.netNeed.toFixed(1), r.suggested]) },
  ];
  if (materialNeeds.length) {
    exportSheets.push({ name: 'الاحتياجات الخام', header: ['المادة', 'الوحدة', 'الاحتياج', 'المتوفر', 'العجز', 'القيمة'], rows: materialNeeds.map((r) => [r.m.nameAr, r.m.unit, r.need, r.onHand, r.shortfall, r.value]) });
  }

  const printReport = () => {
    openPrintWindow({
      title: 'تخطيط الإنتاج',
      subtitle: `آخر ${historyDays} يوم → توقعات ${forecastDays} يوم — ${scopeBranch === 'all' ? 'كل الفروع' : 'فرع محدد'}`,
      meta: [['أصناف مقترحة', `${forecasts.length}`], ['الإجمالي المقترح', `${totalSuggested}`], ['قيمة عجز الخام المختار', `${fmtMoney(materialShortfallValue)}`]],
      tables: [
        { title: 'التوقعات والاحتياج', header: ['الكود', 'الصنف', 'التوقعات', 'المخزون', 'أوامر', 'الصافي', 'المقترح'], rows: forecasts.map((r) => [r.code, r.nameAr, r.forecast.toFixed(1), r.stock, r.openWO, r.netNeed.toFixed(1), r.suggested]) },
        { title: 'الاحتياجات الخام (للمحدد)', header: ['المادة', 'الاحتياج', 'المتوفر', 'العجز'], rows: materialNeeds.map((r) => [r.m.nameAr, r.need, r.onHand, r.shortfall]) },
      ],
      totals: [['إجمالي المقترح', `${totalSuggested}`], ['قيمة العجز', `${fmtMoney(materialShortfallValue)}`]],
      footer: 'تخطيط الإنتاج من الطلب التاريخي — RestoCost ERP',
    });
  };

  const nf = (v: number) => (Number.isFinite(v) ? fmt(v, 1) : '0');

  return (
    <div className="space-y-6">
      <PageHeader title="تخطيط الإنتاج" subtitle="توقعات الطلب من المبيعات التاريخية، ومعادلة المتاح (المخزون + أوامر مفتوحة) لاقتراح كميات الإنتاج وتوليد أوامر تشغيل" icon={<Factory className="w-6 h-6 text-emerald-600" />}
        actions={<>
          <ViewToolbar filename="تخطيط الإنتاج" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn onClick={createWorkOrders} disabled={selectedCount === 0}><Plus className="w-4 h-4" /> إنشاء أوامر إنتاج ({selectedCount})</Btn>
        </>} />

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2 text-[11px] font-bold">{msg}</div>}

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="أيام التاريخ المتاحة"><input type="number" min={1} max={365} value={historyDays} onChange={(e) => setHistoryDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))} className={inputCls + ' !w-24'} /></Field>
        <Field label="أيام التوقعات"><input type="number" min={1} max={90} value={forecastDays} onChange={(e) => setForecastDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 7)))} className={inputCls + ' !w-24'} /></Field>
        <Field label="الفرع">
          <select value={scopeBranch} onChange={(e) => setScopeBranch(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الفروع</option>
            {visibleBranchIds.map((id) => <option key={id} value={id}>{id === 'b-ck' ? 'المطبخ المركزي' : id}</option>)}
          </select>
        </Field>
        <div className="text-[10px] text-slate-500 font-bold basis-full">التوقع = متوسط الطلب اليومي × أيام التوقعات. الاحتياج الصافي = التوقع − (مخزون الوصفة + أوامر الإنتاج المفتوحة).</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مقترحة</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{forecasts.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المقترح (حصة)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(totalSuggested, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">المحدد لأوامر الإنتاج</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{selectedCount}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة عجز الخام المحدد</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fmtMoney(materialShortfallValue)}</strong></div>
      </div>

      <TabBar tabs={[{ id: 'forecast', label: 'التوقعات والاقتراحات' }, { id: 'materials', label: 'الاحتياجات الخام' }]} active={tab} onChange={(id) => setTab(id as 'forecast' | 'materials')} />

      {tab === 'forecast' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-slate-800 text-xs">اقتراحات الإنتاج حسب الطلب التاريخي</h3>
            <Btn tone="ghost" onClick={toggleAll}>{forecasts.length > 0 && forecasts.every((r) => r.selected) ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">تحديد</th>
                  <th className="text-right p-2 font-bold">الكود</th>
                  <th className="text-right p-2 font-bold">الصنف</th>
                  <th className="text-right p-2 font-bold">مبيعات التاريخ</th>
                  <th className="text-right p-2 font-bold">متوسط/يوم</th>
                  <th className="text-right p-2 font-bold">التوقع</th>
                  <th className="text-right p-2 font-bold">مخزون</th>
                  <th className="text-right p-2 font-bold">أوامر مفتوحة</th>
                  <th className="text-right p-2 font-bold">الصافي</th>
                  <th className="text-right p-2 font-bold">المقترح</th>
                  <th className="text-right p-2 font-bold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((r) => (
                  <tr key={r.recipeId} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2"><input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.recipeId)} /></td>
                    <td className="tnum text-left p-2 font-bold text-indigo-700">{r.code}</td>
                    <td className="p-2 font-bold text-slate-800">{r.nameAr}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(r.historyQty, 0)}</td>
                    <td className="tnum text-left p-2 text-slate-600">{nf(r.dailyAvg)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{nf(r.forecast)}</td>
                    <td className="tnum text-left p-2 text-slate-700">{fmt(r.stock, 1)}</td>
                    <td className="tnum text-left p-2 text-amber-700">{fmt(r.openWO, 0)}</td>
                    <td className="tnum text-left p-2 font-bold text-indigo-700">{nf(r.netNeed)}</td>
                    <td className="tnum text-left p-2 font-extrabold text-slate-900">{fmt(r.suggested, 0)}</td>
                    <td className="p-2"><Btn tone="ghost" className="!p-1.5" onClick={() => manufactureNow(r)}><PackageCheck className="w-3.5 h-3.5" /></Btn></td>
                  </tr>
                ))}
                {forecasts.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف تحتاج إنتاجاً ضمن هذه الفلاتر (جميع المتاحات تكفي التوقعات)</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-bold">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> التوقعات مبنية على متوسط الطلب الفعلي (مبيعات POS والمجمعة وأوامر الإنتاج المنجزة)
            <Factory className="w-3.5 h-3.5 text-indigo-500 mr-2" /> زر الإنتاج الفوري تحتاج له مواد خام متوفرة
          </div>
        </Card>
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-800 text-xs">الاحتياجات الخام للأصناف المحددة أعلاه ({selectedCount} صنف)</h3>
            </div>
            {selectedCount === 0 ? (
              <p className="text-center text-[11px] text-slate-400 font-bold py-8">حدّد أصنافاً في تبويب التوقعات لعرض متطلباتها من المواد الخام ومقارنتها بالمخزون.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                      <th className="text-right p-2 font-bold">المادة</th>
                      <th className="text-right p-2 font-bold">الوحدة</th>
                      <th className="text-right p-2 font-bold">الاحتياج</th>
                      <th className="text-right p-2 font-bold">المتوفر</th>
                      <th className="text-right p-2 font-bold">العجز</th>
                      <th className="text-right p-2 font-bold">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialNeeds.map((r) => (
                      <tr key={r.m.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="p-2 font-bold text-slate-800">{r.m.nameAr}</td>
                        <td className="tnum text-left p-2 text-slate-500">{r.m.unit}</td>
                        <td className="tnum text-left p-2 font-bold text-indigo-700">{fmt(r.need, 2)}</td>
                        <td className="tnum text-left p-2 text-slate-600">{fmt(r.onHand, 2)}</td>
                        <td className={`p-2 font-mono font-extrabold ${r.shortfall > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(r.shortfall, 2)}</td>
                        <td className="tnum text-left p-2 text-slate-700">{fmtMoney(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> قيّم العجز عبر شاشة «اقتراحات الشراء» أو «تغطية المخزون» لتأمين المواد قبل بدء الإنتاج
          </div>
        </div>
      )}

      <SectionHeader title="منهجية الاحتساب" subtitle="كيف يُحسب اقتراح الإنتاج" icon={<Factory className="w-4 h-4" />} />
      <Card className="p-4 text-xs text-slate-600 leading-relaxed">
        <ol className="list-decimal pr-5 space-y-1 font-bold">
          <li>يُحسب متوسط الطلب اليومي لكل وصفة من المبيعات الفعلية خلال «أيام التاريخ» (نقاط البيع + المبيعات المجمعة + أوامر الإنتاج المنجزة).</li>
          <li>التوقع = متوسط الطلب اليومي × «أيام التوقعات».</li>
          <li>الاحتياج الصافي = التوقع − (مخزون الوصفة الحالي + أوامر الإنتاج المفتوحة غير المنجزة).</li>
          <li>يُقترح إنتاج الأصناف ذات الاحتياج الصافي الموجب، وتُحوَّل إلى أوامر إنتاج للمطبخ المركزي أو تُنتَج فوراً إن توفرت المواد.</li>
          <li>تبويب الاحتياجات الخام يجمّع مكونات الوصفات للمحدد ويقارنها بالمخزون لتحديد العجز (مدخل لاقتراحات الشراء).</li>
        </ol>
      </Card>
    </div>
  );
};
