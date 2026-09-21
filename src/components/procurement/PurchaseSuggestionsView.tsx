import React, { useMemo, useState } from 'react';
import { Sparkles, ShoppingCart, AlertTriangle, CheckSquare, PackagePlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';
import { lastSupplierIdFor } from '../../business/purchaseRequests';

export const PurchaseSuggestionsView: React.FC = () => {
  const {
    rawMaterials, recipes, posOrders, batchSalesRecords, workOrders, inventory,
    purchaseOrders, suppliers, branches, visibleBranchIds, addPurchaseOrder, grnNotes,
    getStockLevelsFor,
  } = useApp();

  const [targetDays, setTargetDays] = useState(7);
  const [scopeBranch, setScopeBranch] = useState('all');
  const [mode, setMode] = useState<'minmax' | 'consumption' | 'reorder'>('minmax');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  const scopeBranches = scopeBranch === 'all' ? visibleBranchIds : visibleBranchIds.filter((id) => id === scopeBranch);
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const { consumption, stockByMat, openByMat } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const inWindow = (d: string) => { const t = new Date(d).getTime(); return !isNaN(t) && t >= cutoff.getTime(); };
    const usage: Record<string, number> = {};
    const addRecipeUsage = (recipeId: string, qty: number) => {
      const r = recipes.find((x) => x.id === recipeId);
      r?.ingredients.forEach((ing) => { usage[ing.rawMaterialId] = (usage[ing.rawMaterialId] || 0) + ing.quantity * qty; });
    };
    posOrders.filter((o) => scopeBranches.includes(o.branchId) && inWindow(o.date))
      .forEach((o) => o.items.forEach((i) => addRecipeUsage(i.recipeId, i.quantity)));
    batchSalesRecords.filter((b) => scopeBranches.includes(b.branchId) && inWindow(b.date))
      .forEach((b) => b.items.forEach((i) => addRecipeUsage(i.recipeId, i.quantitySold)));
    workOrders.filter((w) => w.status === 'completed' && w.rawMaterialsDeducted && inWindow(w.completionDate || w.startDate))
      .forEach((w) => addRecipeUsage(w.recipeId, w.targetQuantity));

    const stock: Record<string, number> = {};
    inventory.filter((i) => scopeBranches.includes(i.branchId)).forEach((i) => { stock[i.rawMaterialId] = (stock[i.rawMaterialId] || 0) + i.quantity; });

    const open: Record<string, number> = {};
    purchaseOrders.filter((p) => ['submitted', 'approved', 'partially_received'].includes(p.status) && scopeBranches.includes(p.branchId))
      .forEach((p) => p.items.forEach((i) => { open[i.rawMaterialId] = (open[i.rawMaterialId] || 0) + i.quantity; }));

    return { consumption: usage, stockByMat: stock, openByMat: open };
  }, [recipes, posOrders, batchSalesRecords, workOrders, inventory, purchaseOrders, scopeBranches]);

  const rows = useMemo(() => {
    const target = Math.max(1, targetDays);
    // الحدود الفعلية حسب الفرع: عند تحديد فرع تُستخدم حدود هذا الفرع المخصصة،
    // وعند "جميع الفروع" تُجمع حدود كل فرع. أصناف «طلب كامل» تُطلب بكامل الحد الأقصى دون النظر للرصيد.
    const effLevels = (matId: string) => {
      const bids = scopeBranch === 'all' ? scopeBranches : [scopeBranch];
      let min = 0, max = 0;
      let fullMax = false;
      bids.forEach((bid) => {
        const lv = getStockLevelsFor(matId, bid);
        min += lv.minStockLevel;
        max += lv.maxStockLevel;
        if (lv.alwaysOrderFullMax) fullMax = true;
      });
      return { min, max, fullMax };
    };
    return rawMaterials
      .filter((m) => m.isActive)
      .map((m) => {
        const consumed = consumption[m.id] || 0;
        const stock = stockByMat[m.id] || 0;
        const openPO = openByMat[m.id] || 0;
        const daily = consumed / 30;
        const conv = m.purchaseUnitConversion && m.purchaseUnitConversion > 0 ? m.purchaseUnitConversion : 1;
        const roundUp = (v: number) => (conv > 1 ? Math.ceil(v / conv) * conv : Math.ceil(v));
        const lvl = effLevels(m.id);
        let rawSuggested: number;
        let trigger: boolean;
        let critical: boolean;
        if (mode === 'minmax') {
          // دورة الحد الأدنى/الأقصى بحدود الفرع: عند هبوط المتاح (المخزون + أوامر مفتوحة)
          // تحت الحد الأدنى يُطلب ما يرفع المخزون إلى الحد الأقصى، مقرّباً لأقرب وحدة شراء.
          // صنف «طلب كامل»: يُطلب كامل الحد الأقصى دون النظر للرصيد (مع خصم أوامر مفتوحة فقط).
          const available = stock + openPO;
          rawSuggested = lvl.fullMax ? Math.max(0, lvl.max - openPO) : Math.max(0, lvl.max - available);
          trigger = lvl.fullMax || available < lvl.min;
          critical = !lvl.fullMax && stock < lvl.min;
        } else if (mode === 'reorder') {
          // نقطة إعادة الطلب + مهلة التوريد (بند 52): يُشغَّل عند هبوط المتاح تحت نقطة
          // إعادة الطلب (أو الحد الأدنى إن لم تُحدَّد)، والكمية المقترحة = استهلاك متوقع
          // يعادل (الاستهلاك اليومي × مهلة التوريد) − المتاح، مع حد أدنى يسد العجز إلى النقطة.
          const point = m.reorderPoint && m.reorderPoint > 0 ? m.reorderPoint : lvl.min;
          const lead = m.leadTimeDays && m.leadTimeDays > 0 ? m.leadTimeDays : 5;
          const available = stock + openPO;
          rawSuggested = Math.max(0, Math.max(daily * lead - available, point - available));
          trigger = lvl.fullMax || (available < point && daily > 0);
          critical = !lvl.fullMax && stock < point;
        } else {
          // الاستهلاك الذكي: الاحتياج = الحد الأقصى(الحد الأدنى للفرع, اليومي × التغطية)
          const need = Math.max(lvl.min || 0, daily * target);
          rawSuggested = Math.max(0, need - stock - openPO);
          trigger = true;
          critical = stock < lvl.min;
        }
        const suggested = rawSuggested > 0 ? roundUp(rawSuggested) : 0;
        const purchaseQty = conv > 1 && suggested > 0 ? suggested / conv : 0;
        return {
          material: m, consumed, stock, openPO, daily, suggested, purchaseQty, conv,
          minLvl: lvl.min, maxLvl: lvl.max, fullMax: lvl.fullMax,
          stockDays: daily > 0 ? stock / daily : Infinity,
          estCost: purchaseQty > 0 && m.purchaseUnitPrice ? purchaseQty * m.purchaseUnitPrice : suggested * m.standardPrice,
          critical,
          supplierId: lastSupplierIdFor(grnNotes, m.id, m.supplierId),
          trigger,
        };
      })
      .filter((r) => r.suggested > 0 && r.trigger)
      .sort((a, b) => b.suggested - a.suggested);
  }, [rawMaterials, consumption, stockByMat, openByMat, targetDays, mode, getStockLevelsFor, scopeBranches, scopeBranch, grnNotes]);

  const totalSuggestedCost = rows.reduce((s, r) => s + r.estCost, 0);
  const totalSuggestedQty = rows.reduce((s, r) => s + r.suggested, 0);
  const criticalCount = rows.filter((r) => r.critical).length;

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.material.id]);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => { next[r.material.id] = !allSelected; });
    setSelected(next);
  };

  const selectedRows = rows.filter((r) => selected[r.material.id] && r.suggested > 0);

  const createOrders = () => {
    if (selectedRows.length === 0) { setMsg('حدد أصنافاً أولاً لإنشاء أوامر الشراء'); setTimeout(() => setMsg(''), 3000); return; }
    const bySupplier: Record<string, typeof selectedRows> = {};
    selectedRows.forEach((r) => {
      const sid = r.supplierId || suppliers[0]?.id || '';
      (bySupplier[sid] = bySupplier[sid] || []).push(r);
    });
    const branchId = visibleBranchIds.includes('b-ck') ? 'b-ck' : visibleBranchIds[0] || '';
    const date = new Date().toISOString().split('T')[0];
    Object.entries(bySupplier).forEach(([sid, items]) => {
      const supplier = suppliers.find((s) => s.id === sid);
      const poItems = items.map((r) => {
        const conv = r.conv;
        const usePU = conv > 1 && !!r.material.purchaseUnit && !!r.material.purchaseUnitPrice;
        return {
          rawMaterialId: r.material.id, materialName: r.material.nameAr,
          quantity: r.suggested, unit: r.material.unit,
          purchaseUnit: usePU ? r.material.purchaseUnit : undefined,
          purchaseUnitConversion: usePU ? conv : undefined,
          purchaseQty: usePU ? r.purchaseQty : undefined,
          unitPrice: usePU ? (r.material.purchaseUnitPrice || r.material.standardPrice) : r.material.standardPrice,
          lineTotal: usePU ? r.purchaseQty * (r.material.purchaseUnitPrice || 0) : r.suggested * r.material.standardPrice,
        };
      });
      addPurchaseOrder({
        supplierId: sid, supplierName: supplier?.name || sid, branchId, orderDate: date,
        expectedDate: date, status: 'draft', items: poItems,
        totalAmount: poItems.reduce((s, i) => s + i.lineTotal, 0),
        requestedBy: 'اقتراح شراء ذكي', notes: `توليد تلقائي من اقتراحات الشراء — ${mode === 'minmax' ? `دورة الحد الأدنى/الأقصى (أقصى ${items[0]?.material.maxStockLevel}، أدنى ${items[0]?.material.minStockLevel})` : mode === 'reorder' ? `نقطة إعادة الطلب والاستهلاك × مهلة التوريد (نقطة ${items[0]?.material.reorderPoint || items[0]?.material.minStockLevel}، مهلة ${items[0]?.material.leadTimeDays || 5} يوم)` : `تغطية ${targetDays} يوم`}`,
      });
    });
    setMsg(`تم إنشاء ${Object.keys(bySupplier).length} أمر شراء من ${selectedRows.length} صنف بوحدة الشراء`);
    setTimeout(() => setMsg(''), 4000);
    setSelected({});
  };

  return (
    <div className="space-y-6">
      <PageHeader title="دورة المشتريات والاقتراحات الذكية" subtitle="اقتراحات الشراء حسب الحد الأدنى/الأقصى لكل صنف أو حسب الاستهلاك، مع الطلب بوحدة الشراء وتقريب الكمية لأقرب وحدة شراء" icon={<Sparkles className="w-6 h-6 text-amber-300" />}
        actions={
          <ViewToolbar
            filename="اقتراحات_الشراء"
            sheets={[
              {
                name: 'الاقتراحات', header: ['الصنف', 'وحدة التخزين', 'وحدة الشراء', 'استهلاك 30 يوم', 'المخزون الحالي', 'أوامر مفتوحة', 'الحد الأدنى', 'الحد الأقصى', 'الكمية بوحدة الشراء', 'المعادل بوحدة التخزين', 'التكلفة المقدرة', 'المورد', 'حالة حرجة'],
                rows: rows.map((r) => [r.material.nameAr, r.material.unit, r.material.purchaseUnit || r.material.unit, fmt(r.consumed, 1), fmt(r.stock, 1), r.openPO, r.material.minStockLevel, r.material.maxStockLevel, r.purchaseQty > 0 ? r.purchaseQty : r.suggested, r.suggested, r.estCost, suppliers.find((s) => s.id === r.supplierId)?.name || '', r.critical ? 'نعم' : 'لا']),
              },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف تحتاج شراء</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{rows.filter((r) => r.suggested > 0).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الكمية المقترحة (وحدة تخزين)</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(totalSuggestedQty)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">التكلفة المقدرة</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmt(totalSuggestedCost)}</strong></div>
        <div className={`p-4 rounded-xl border shadow-xs ${criticalCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <span className="text-slate-500 text-[11px] block">أصناف حرجة (تحت الحد الأدنى)</span>
          <strong className={`text-lg font-extrabold flex items-center gap-1.5 font-mono block mt-1 ${criticalCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}><AlertTriangle className="w-5 h-5" /> {criticalCount}</strong>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <Field label="نمط دورة المشتريات">
            <div className="flex flex-wrap rounded-xl border border-slate-200 overflow-hidden">
              <button type="button" onClick={() => setMode('minmax')} className={`px-3 py-1.5 font-extrabold transition-colors whitespace-nowrap ${mode === 'minmax' ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-600'}`}>الحد الأدنى/الأقصى</button>
              <button type="button" onClick={() => setMode('consumption')} className={`px-3 py-1.5 font-extrabold transition-colors whitespace-nowrap ${mode === 'consumption' ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-600'}`}>الاستهلاك الذكي</button>
              <button type="button" onClick={() => setMode('reorder')} className={`px-3 py-1.5 font-extrabold transition-colors whitespace-nowrap ${mode === 'reorder' ? 'bg-amber-400 text-amber-950' : 'bg-white text-slate-600'}`}>نقطة الطلب + مهلة التوريد</button>
            </div>
          </Field>
          {mode === 'consumption' && (
            <Field label="عدد أيام التغطية المطلوبة">
              <input type="number" min="1" max="90" value={targetDays} onChange={(e) => setTargetDays(parseInt(e.target.value, 10) || 7)} className={inputCls + ' !w-32'} />
            </Field>
          )}
          <Field label="نطاق المخزون">
            <select value={scopeBranch} onChange={(e) => setScopeBranch(e.target.value)} className={inputCls + ' !w-64'}>
              <option value="all">جميع الفروع المتاحة</option>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 pb-0.5">
            <Btn onClick={toggleAll}>{allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <PackagePlus className="w-3.5 h-3.5" />} {allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}</Btn>
            <Btn tone="success" onClick={createOrders}><ShoppingCart className="w-3.5 h-3.5" /> إنشاء أوامر شراء ({selectedRows.length})</Btn>
          </div>
        </div>
        {msg && <div className={`mt-3 rounded-xl p-3 font-bold text-xs border ${msg.includes('تم') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg}</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <SectionHeader title="الجدول المقترح" subtitle={mode === 'minmax' ? 'الصيغة: المتاح = المخزون + أوامر مفتوحة، وعند هبوطه تحت حد الفرع الأدنى يُطلب (حد الفرع الأقصى - المتاح) — وأصناف «طلب كامل» تُطلب بكامل الحد الأقصى' : mode === 'reorder' ? 'الصيغة (بند 52): التفعيل عند (المخزون + أوامر مفتوحة) < نقطة إعادة الطلب، والكمية = (الاستهلاك اليومي × مهلة التوريد) - المتاح، مع حد أدنى يسد العجز إلى النقطة' : 'الصيغ: الاحتياج = الحد الأقصى(الحد الأدنى للفرع, الاستهلاك اليومي × أيام التغطية) - المخزون - أوامر مفتوحة'} icon={<Sparkles className="w-5 h-5 text-amber-600" />} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-indigo-600" /></th>
                <th className="p-3">الصنف</th><th className="p-3">استهلاك 30 يوم</th><th className="p-3">المخزون</th><th className="p-3">أوامر مفتوحة</th><th className="p-3">حد أدنى</th><th className="p-3">حد أقصى</th><th className="p-3">كمية بوحدة الشراء</th><th className="p-3">المعادل بوحدة التخزين</th><th className="p-3">التكلفة</th><th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.material.id} className={`hover:bg-slate-50 ${r.critical ? 'bg-rose-50/40' : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={!!selected[r.material.id]} onChange={() => setSelected((s) => ({ ...s, [r.material.id]: !s[r.material.id] }))} className="w-4 h-4 accent-indigo-600" /></td>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{r.material.nameAr}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.material.code} · {suppliers.find((s) => s.id === r.supplierId)?.name || ''}</div>
                  </td>
                  <td className="p-3 font-mono text-slate-600">{fmt(r.consumed, 1)}</td>
                  <td className={`p-3 font-mono font-bold ${r.stock < r.minLvl ? 'text-rose-600' : 'text-slate-900'}`}>{fmt(r.stock, 1)} <span className="text-[10px] text-slate-400">{r.material.unit}</span></td>
                  <td className="p-3 font-mono text-slate-600">{fmt(r.openPO, 1)}</td>
                  <td className="p-3 font-mono text-slate-600">{r.minLvl} <span className="text-[10px] text-slate-400">{r.material.unit}</span></td>
                  <td className="p-3 font-mono text-slate-600">{r.maxLvl} <span className="text-[10px] text-slate-400">{r.material.unit}</span></td>
                  <td className={`p-3 font-mono font-extrabold ${r.suggested > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                    {r.purchaseQty > 0 ? `${r.purchaseQty} × ${r.material.purchaseUnit}` : `${r.suggested} ${r.material.unit}`}
                  </td>
                  <td className="p-3 font-mono text-slate-600">{r.suggested} <span className="text-[10px] text-slate-400">{r.material.unit}</span></td>
                  <td className="p-3 font-mono font-bold text-slate-800">{fmt(r.estCost)}</td>
                  <td className="p-3">
                    {r.fullMax
                      ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">طلب كامل (مستثنى)</span>
                      : r.critical
                        ? <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> حرج</span>
                        : <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">يحتاج شراء</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف تحتاج شراء — المخزون فوق الحد الأدنى ومغطى</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};