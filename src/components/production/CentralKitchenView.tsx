import React, { useState } from 'react';
import { Factory, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, StatusPill } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';

export const CentralKitchenView: React.FC = () => {
  const { workOrders, recipes, branches, visibleBranchIds, addWorkOrder, updateWorkOrderStatus, getBranchName } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [recipeId, setRecipeId] = useState(recipes.filter((r) => r.isCentralKitchenPrep)[0]?.id || '');
  const [targetBranchId, setTargetBranchId] = useState(visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '');
  const [targetQuantity, setTargetQuantity] = useState(1);
  const [prepChef, setPrepChef] = useState('');
  const [notes, setNotes] = useState('');

  const prepRecipes = recipes.filter((r) => r.isCentralKitchenPrep);
  const filtered = workOrders.filter((w) => w.centralKitchenId === 'b-ck' || visibleBranchIds.includes(w.targetBranchId));
  const active = filtered.filter((w) => w.status === 'planned' || w.status === 'in_progress');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec || targetQuantity <= 0) return;
    addWorkOrder({ centralKitchenId: 'b-ck', targetBranchId, recipeId, recipeName: rec.nameAr, targetQuantity, producedQuantity: 0, prepChef: prepChef || 'الشيف الرئيسي', notes });
    setShowModal(false); setTargetQuantity(1); setPrepChef(''); setNotes('');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المطبخ المركزي والتصنيع" subtitle="أوامر تصنيع التحضيرات المركزية وتوزيعها على الفروع مع خصم المواد الخام" icon={<Factory className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar
            filename="أوامر_التصنيع"
            sheets={[
              { name: 'أوامر التصنيع', header: ['الأمر', 'المنتج', 'الفرع المستهدف', 'الكمية المطلوبة', 'المنتجة', 'الشيف', 'الحالة', 'ملاحظات'], rows: filtered.map((w) => [w.orderNumber, w.recipeName, getBranchName(w.targetBranchId), w.targetQuantity, w.producedQuantity, w.prepChef, w.status, w.notes || '']) },
            ]}
          />
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> أمر تصنيع جديد</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أوامر نشطة</span><strong className="text-lg font-extrabold text-brand-700 block mt-1">{active.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تحضيرات مركزية</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{prepRecipes.length}</strong></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الأمر</th><th className="p-3">المنتج</th><th className="p-3">المستهدف</th><th className="p-3">الكمية المطلوبة</th><th className="p-3">المنتجة</th><th className="p-3">الشيف</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="tnum text-left p-3 font-bold text-brand-700">{w.orderNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{w.recipeName}</td>
                  <td className="p-3 text-slate-600">{getBranchName(w.targetBranchId)}</td>
                  <td className="tnum text-left p-3">{w.targetQuantity}</td>
                  <td className="tnum text-left p-3 font-bold text-emerald-700">{w.producedQuantity}</td>
                  <td className="p-3 text-slate-600">{w.prepChef}</td>
                  <td className="p-3"><StatusPill status={w.status} map={{ planned: 'مخطط', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' }} /></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {w.status === 'planned' && <button onClick={() => updateWorkOrderStatus(w.id, 'in_progress')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="بدء">▶</button>}
                      {w.status === 'in_progress' && <button onClick={() => updateWorkOrderStatus(w.id, 'completed')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="إكمال"><CheckCircle2 className="w-4 h-4" /></button>}
                      {(w.status === 'planned' || w.status === 'in_progress') && <button onClick={() => updateWorkOrderStatus(w.id, 'cancelled')} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد أوامر تصنيع</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="أمر تصنيع جديد بالمطبخ المركزي">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="المنتج (تحضير مركزي)" required>
            <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputCls}>
              {prepRecipes.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
            </select>
          </Field>
          <Field label="الفرع المستهدف" required>
            <select value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} className={inputCls}>
              {branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الكمية المطلوبة" required><input type="number" min="1" step="1" value={targetQuantity} onChange={(e) => setTargetQuantity(parseInt(e.target.value) || 1)} className={inputCls} /></Field>
            <Field label="الشيف المسؤول"><input value={prepChef} onChange={(e) => setPrepChef(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">إنشاء الأمر</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};