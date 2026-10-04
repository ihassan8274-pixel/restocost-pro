import React, { useMemo, useState } from 'react';
import { Factory, Hammer, AlertTriangle, CheckCircle2, Trash2, Eye, Package } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Field, inputCls, SectionHeader, StatusPill, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, navOnEnter } from '../../utils/helpers';
import type { ProductionRun, ProductionRunItem } from '../../types';

const toNum = (v: string): number => {
  if (v === undefined || v === null || v === '') return NaN;
  const arabic = v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return parseFloat(arabic.replace(/,/g, '.'));
};

export const ManufacturingView: React.FC = () => {
  const {
    recipes, branches, visibleBranchIds, inventory, rawMaterials, productionRuns,
    getAverageUnitCost, getRawMaterialName, getBranchName, manufactureRecipe, deleteProductionRun,
  } = useApp();

  const [tab, setTab] = useState<'produce' | 'history'>('produce');
  const [branchId, setBranchId] = useState(() => visibleBranchIds.includes('b-ck') ? 'b-ck' : visibleBranchIds[0] || '');
  const [recipeId, setRecipeId] = useState('');
  const [batchSize, setBatchSize] = useState('');
  const [producedBy, setProducedBy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [viewRun, setViewRun] = useState<ProductionRun | null>(null);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const baseRecipes = useMemo(() => recipes.filter((r) => r.isActive && (r.isCentralKitchenPrep || r.category === 'sub_prep')), [recipes]);
  const selectedRecipe = recipes.find((r) => r.id === recipeId);
  const batch = toNum(batchSize) || 0;

  const requirements: ProductionRunItem[] = useMemo(() => {
    if (!selectedRecipe || batch <= 0) return [];
    return selectedRecipe.ingredients.map((ing) => {
      const availableQty = inventory.find((i) => i.branchId === branchId && i.rawMaterialId === ing.rawMaterialId)?.quantity || 0;
      return {
        rawMaterialId: ing.rawMaterialId,
        materialName: getRawMaterialName(ing.rawMaterialId),
        unit: rawMaterials.find((m) => m.id === ing.rawMaterialId)?.unit || '',
        requiredQty: ing.quantity * batch,
        availableQty,
        unitCost: getAverageUnitCost(ing.rawMaterialId),
      };
    });
  }, [selectedRecipe, batch, branchId, inventory, rawMaterials, getRawMaterialName, getAverageUnitCost]);

  const shortItems = requirements.filter((r) => r.requiredQty > r.availableQty + 0.0001);
  const totalCost = requirements.reduce((s, r) => s + r.requiredQty * r.unitCost, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipe) { setMsg({ ok: false, text: 'اختر الصنف الأساسي للتصنيع' }); return; }
    if (batch <= 0) { setMsg({ ok: false, text: 'أدخل عدد الوحدات/الدفعات المراد تصنيعها' }); return; }
    if (shortItems.length > 0) { setMsg({ ok: false, text: 'رصيد غير كافٍ في الفرع المحدد — راجع جدول المتطلبات' }); return; }
    const res = manufactureRecipe({ branchId, recipeId, batchSize: batch, producedBy });
    if (!res.ok) { setMsg({ ok: false, text: res.error || 'فشل التصنيع' }); return; }
    setMsg({ ok: true, text: `تم تصنيع ${batch} ${selectedRecipe.portionSize || 'وحدة'} بنجاح وإضافتها لمخزون الفرع القابل للتحويل` });
    setBatchSize(''); setProducedBy(''); setRecipeId('');
    setTimeout(() => setMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="شاشة التصنيع" subtitle="تصنيع الأصناف الأساسية (تحضيرات مسبقة / مطبخ مركزي) وتحويلها إلى مخزون قابل للتحويل بين الفروع" icon={<Factory className="w-6 h-6 text-indigo-300" />}
        actions={
          <ViewToolbar
            filename="سجل_التصنيع"
            sheets={[
              { name: 'سجل التصنيع', header: ['الرقم', 'الصنف', 'الفرع', 'التاريخ', 'الكمية', 'الوحدة', 'قيمة المواد', 'بواسطة', 'الحالة'], rows: productionRuns.map((r) => [r.recipeCode, r.recipeName, getBranchName(r.branchId), r.date, r.producedQty, r.unit, r.totalCost, r.producedBy, r.status === 'completed' ? 'مكتمل' : 'ملغي']) },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">عمليات تصنيع</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{productionRuns.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف أساسية قابلة للتصنيع</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{baseRecipes.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المواد المستهلكة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(productionRuns.reduce((s, r) => s + r.totalCost, 0))}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الوحدات المنتجة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{productionRuns.reduce((s, r) => s + r.producedQty, 0)}</strong></div>
      </div>

      <TabBar tabs={[{ id: 'produce', label: 'تصنيع جديد' }, { id: 'history', label: `سجل التصنيع (${productionRuns.length})` }]} active={tab} onChange={(t) => setTab(t as 'produce' | 'history')} />

      {tab === 'produce' && (
        <Card className="p-5">
          <SectionHeader title="تصنيع صنف أساسي" subtitle="اختر الفرع والصنف وعدد الوحدات — تُخصم المواد الخام من مخزون الفرع وتُضاف الكمية المنتجة إلى رصيد الصنف القابل للتحويل" icon={<Hammer className="w-5 h-5 text-indigo-600" />} />
          <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
            {msg && <div className={`rounded-xl p-3 font-bold border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg.text}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="الفرع (مكان التصنيع)" required>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                  {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                </select>
              </Field>
              <Field label="الصنف الأساسي القابل للتصنيع" required>
                <select value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setMsg(null); }} className={inputCls}>
                  <option value="">اختر الصنف...</option>
                  {baseRecipes.map((r) => <option key={r.id} value={r.id}>{r.nameAr} ({r.code})</option>)}
                </select>
              </Field>
              <Field label={`عدد الوحدات / الدفعات (${selectedRecipe?.portionSize || 'وحدة'} لكل وحدة)`} required hint="مثال: 2 = وحدتان من الصنف الأساسي">
                <input type="text" inputMode="decimal" data-nav value={batchSize} onChange={(e) => setBatchSize(e.target.value)} onKeyDown={navOnEnter} className={inputCls} placeholder="0" />
              </Field>
            </div>
            <Field label="تم التصنيع بواسطة"><input value={producedBy} onChange={(e) => setProducedBy(e.target.value)} className={inputCls} placeholder="اسم الشيف / المسؤول" /></Field>

            {selectedRecipe && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500 flex items-center justify-between">
                  <span>متطلبات المواد الخام (لكل {selectedRecipe.portionSize || 'وحدة'})</span>
                  <span className="text-indigo-700 font-mono">الكمية المطلوبة: {fmt(batch)} × الوصفة</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr><th className="p-2.5">المادة الخام</th><th className="p-2.5">المطلوب</th><th className="p-2.5">المتوفر</th><th className="p-2.5">متوسط سعر الوحدة</th><th className="p-2.5">القيمة</th><th className="p-2.5">الحالة</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {requirements.map((r) => {
                        const short = r.requiredQty > r.availableQty + 0.0001;
                        return (
                          <tr key={r.rawMaterialId} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-800">{r.materialName}</td>
                            <td className="tnum text-left p-2.5 font-extrabold text-indigo-700">{fmt(r.requiredQty)} {r.unit}</td>
                            <td className="tnum text-left p-2.5 text-slate-700">{fmt(r.availableQty)} {r.unit}</td>
                            <td className="tnum text-left p-2.5">{fmt(r.unitCost)}</td>
                            <td className="tnum text-left p-2.5 font-bold">{fmtMoney(r.requiredQty * r.unitCost)}</td>
                            <td className="p-2.5">{short ? <span className="text-[9px] font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> ناقص</span> : <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> متوفر</span>}</td>
                          </tr>
                        );
                      })}
                      {requirements.length === 0 && <tr><td colSpan={6} className="p-5 text-center text-slate-500 font-bold">أدخل عدد الوحدات لعرض متطلبات المواد</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between text-[11px] font-extrabold">
                  <span>القيمة الإجمالية للمواد المطلوبة:</span>
                  <span className="font-mono text-indigo-800">{fmtMoney(totalCost)} ر.س</span>
                </div>
              </div>
            )}

            {shortItems.length > 0 && <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> توجد مواد غير كافية في الفرع — لن يكتمل التصنيع إلا بعد توفر الرصيد</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <div className="text-xs font-bold text-slate-600">سيُضاف للمخزون القابل للتحويل: <span className="font-mono font-extrabold text-amber-700">{fmt(batch)} {selectedRecipe?.portionSize || 'وحدة'}</span></div>
              <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs"><Hammer className="w-4 h-4" /> تنفيذ التصنيع</button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="سجل عمليات التصنيع" subtitle="كل عمليات تصنيع الأصناف الأساسية مع خصم المواد الخام وإضافة المخزون المصنّع" icon={<Package className="w-5 h-5 text-indigo-600" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الرقم</th><th className="p-3">الصنف</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الكمية المنتجة</th><th className="p-3">قيمة المواد</th><th className="p-3">بواسطة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productionRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-3 font-bold text-indigo-700">{r.recipeCode}</td>
                    <td className="p-3 font-bold text-slate-900">{r.recipeName}</td>
                    <td className="p-3 text-slate-600">{getBranchName(r.branchId)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{r.date}</td>
                    <td className="tnum text-left p-3 font-extrabold text-amber-700">{fmt(r.producedQty)} {r.unit}</td>
                    <td className="tnum text-left p-3 font-bold">{fmtMoney(r.totalCost)}</td>
                    <td className="p-3 text-slate-600">{r.producedBy}</td>
                    <td className="p-3"><StatusPill status={r.status} map={{ completed: 'مكتمل', cancelled: 'ملغي' }} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewRun(r)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="عرض التفاصيل"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => deleteProductionRun(r.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {productionRuns.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد عمليات تصنيع بعد</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {viewRun && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewRun(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">تفاصيل عملية التصنيع — {viewRun.recipeName}</h3>
              <button onClick={() => setViewRun(null)} className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none">×</button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="flex flex-wrap gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold">
                <span>الفرع: {getBranchName(viewRun.branchId)}</span>
                <span>التاريخ: {viewRun.date}</span>
                <span>الكمية: {fmt(viewRun.producedQty)} {viewRun.unit}</span>
                <span>بواسطة: {viewRun.producedBy}</span>
                <span>قيمة المواد: <span className="font-mono text-indigo-700">{fmtMoney(viewRun.totalCost)}</span></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11px] border-collapse">
                  <thead><tr className="bg-slate-100 text-slate-700 font-bold"><th className="p-2">المادة</th><th className="p-2">المطلوب</th><th className="p-2">المتوفر</th><th className="p-2">متوسط السعر</th><th className="p-2">القيمة</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewRun.items.map((it) => (
                      <tr key={it.rawMaterialId}>
                        <td className="p-2 font-bold text-slate-800">{it.materialName}</td>
                        <td className="tnum text-left p-2 font-extrabold text-indigo-700">{fmt(it.requiredQty)} {it.unit}</td>
                        <td className="tnum text-left p-2">{fmt(it.availableQty)} {it.unit}</td>
                        <td className="tnum text-left p-2">{fmt(it.unitCost)}</td>
                        <td className="tnum text-left p-2 font-bold">{fmtMoney(it.requiredQty * it.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
