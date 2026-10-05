import React, { useState } from 'react';
import { Plus, Printer, Pencil, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, today } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const MEAT_CATEGORIES = ['meat_poultry', 'seafood', 'processed_meat'] as const;

export const ButcherTestsView: React.FC = () => {
  const { rawMaterials, branches, butcherTests, addButcherTest, updateButcherTest, deleteButcherTest, postButcherTest, showToast, getBranchName, getRawMaterialName } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState<string | null>(null);

  const meatMaterials = rawMaterials.filter((m) => MEAT_CATEGORIES.includes(m.category as typeof MEAT_CATEGORIES[number]) && m.isActive);

  const [form, setForm] = useState({
    rawMaterialId: '',
    branchId: branches[0]?.id || '',
    date: today(),
    grossWeight: 0,
    pricePerKg: 0,
    usableWeight: 0,
    notes: '',
  });

  const yieldPercent = form.grossWeight > 0 ? (form.usableWeight / form.grossWeight) * 100 : 0;
  const wasteWeight = Math.max(0, form.grossWeight - form.usableWeight);
  const costPerUsableKg = form.usableWeight > 0 ? (form.grossWeight * form.pricePerKg) / form.usableWeight : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rawMaterialId || form.grossWeight <= 0 || form.usableWeight <= 0 || form.pricePerKg <= 0) return;
    const material = rawMaterials.find((m) => m.id === form.rawMaterialId);
    if (!material) return;
    const wt = form.grossWeight;
    const uw = form.usableWeight;
    const yp = (uw / wt) * 100;
    const cpu = (wt * form.pricePerKg) / uw;
    addButcherTest({
      rawMaterialId: form.rawMaterialId,
      rawMaterialName: material.nameAr,
      branchId: form.branchId,
      date: form.date,
      grossWeight: wt,
      pricePerKg: form.pricePerKg,
      usableWeight: uw,
      wasteWeight: wt - uw,
      yieldPercent: yp,
      costPerUsableKg: cpu,
      notes: form.notes,
      posted: false,
      createdBy: 'المستخدم',
    });
    setShowModal(false);
  };

  const openEdit = (t: typeof butcherTests[number]) => {
    setForm({
      rawMaterialId: t.rawMaterialId,
      branchId: t.branchId,
      date: t.date,
      grossWeight: t.grossWeight,
      pricePerKg: t.pricePerKg,
      usableWeight: t.usableWeight,
      notes: t.notes || '',
    });
    setEditId(t.id);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    const wt = form.grossWeight;
    const uw = form.usableWeight;
    const yp = wt > 0 ? (uw / wt) * 100 : 0;
    const cpu = uw > 0 ? (wt * form.pricePerKg) / uw : 0;
    updateButcherTest(editId, {
      rawMaterialId: form.rawMaterialId,
      branchId: form.branchId,
      date: form.date,
      grossWeight: wt,
      pricePerKg: form.pricePerKg,
      usableWeight: uw,
      wasteWeight: wt - uw,
      yieldPercent: yp,
      costPerUsableKg: cpu,
      notes: form.notes,
    });
    setEditId(null);
  };

  const handlePost = async (id: string) => {
    setPostBusy(id);
    const res = await postButcherTest(id);
    setPostBusy(null);
    if (!res.ok) showToast(res.error || 'فشل الترحيل');
  };

  const printTest = (t: typeof butcherTests[number]) => {
    const materialName = t.rawMaterialName || getRawMaterialName(t.rawMaterialId);
    openPrintWindow({
      title: `اختبار جزارة — ${materialName}`,
      subtitle: `فرع ${getBranchName(t.branchId)} — ${t.date}`,
      meta: [
        ['المادة', materialName],
        ['الفرع', getBranchName(t.branchId)],
        ['التاريخ', t.date],
        ['الحالة', t.posted ? 'مرحّل' : 'مسودة'],
      ],
      tables: [{
        title: 'تفاصيل الاختبار',
        header: ['البيان', 'القيمة'],
        rows: [
          ['الوزن الإجمالي', `${fmt(t.grossWeight, 2)} كجم`],
          ['السعر / كجم', `${fmtMoney(t.pricePerKg)}`],
          ['الوزن الصالح', `${fmt(t.usableWeight, 2)} كجم`],
          ['الوزن الهالك/المقلم', `${fmt(t.wasteWeight, 2)} كجم`],
          ['نسبة الإنتاجية', `${fmt(t.yieldPercent, 2)}%`],
          ['تكلفة الكجم الصالح', `${fmtMoney(t.costPerUsableKg)}`],
        ],
      }],
      totals: [
        ['التكلفة الإجمالية للمحصول', `${fmtMoney(t.grossWeight * t.pricePerKg)}`],
        ['سعر الكجم الصالح المقترح', `${fmtMoney(t.costPerUsableKg)}`],
      ],
      footer: t.notes ? `ملاحظات: ${t.notes}` : t.posted ? 'تم ترحيل السعر إلى المادة' : 'مسودة — لم يرحّل بعد',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="اختبارات الجزارة والإنتاجية" subtitle="تسجيل وزن الذبيحة الإجمالي والصالح، احتساب نسبة الإنتاجية، وتحديث سعر المادة عند الترحيل" icon={<Plus className="w-6 h-6 text-amber-600" />}
        actions={<>
          <ViewToolbar
            filename="اختبارات_الجزارة"
            sheets={[
              { name: 'الاختبارات', header: ['التاريخ', 'المادة', 'الفرع', 'الوزن الإجمالي', 'الوزن الصالح', 'الوزن الهالك', 'الإنتاجية %', 'سعر الكجم', 'تكلفة الصالح/كجم', 'الحالة'], rows: butcherTests.map((t) => [t.date, t.rawMaterialName || '', getBranchName(t.branchId), fmt(t.grossWeight, 2), fmt(t.usableWeight, 2), fmt(t.wasteWeight, 2), fmt(t.yieldPercent, 2), fmtMoney(t.pricePerKg), fmtMoney(t.costPerUsableKg), t.posted ? 'مرحّل' : 'مسودة']) },
            ]}
          />
          <Btn onClick={() => { setForm({ rawMaterialId: '', branchId: branches[0]?.id || '', date: today(), grossWeight: 0, pricePerKg: 0, usableWeight: 0, notes: '' }); setShowModal(true); }}><Plus className="w-4 h-4" /> اختبار جديد</Btn>
        </>} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">المادة</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">الوزن الإجمالي (كجم)</th>
                <th className="p-3">الوزن الصالح (كجم)</th>
                <th className="p-3">الهالك/مقلم (كجم)</th>
                <th className="p-3">الإنتاجية %</th>
                <th className="p-3">سعر الشراء/كجم</th>
                <th className="p-3">تكلفة الصالح/كجم</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {butcherTests.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="tnum text-left p-3 text-slate-600">{t.date}</td>
                  <td className="p-3 font-bold text-slate-900">{t.rawMaterialName}</td>
                  <td className="p-3 text-slate-600">{getBranchName(t.branchId)}</td>
                  <td className="tnum text-left p-3">{fmt(t.grossWeight, 2)}</td>
                  <td className="tnum text-left p-3 text-emerald-700">{fmt(t.usableWeight, 2)}</td>
                  <td className="tnum text-left p-3 text-rose-700">{fmt(t.wasteWeight, 2)}</td>
                  <td className="tnum text-left p-3 font-bold text-amber-700">{fmt(t.yieldPercent, 2)}%</td>
                  <td className="tnum text-left p-3 text-amber-600">{fmtMoney(t.pricePerKg)}</td>
                  <td className="tnum text-left p-3 font-extrabold text-brand-700">{fmtMoney(t.costPerUsableKg)}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.posted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {t.posted ? 'مرحّل' : 'مسودة'}
                    </span>
                  </td>
                  <td className="p-3">
                    <button onClick={() => printTest(t)} className="mr-1 p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg align-middle" title="طباعة"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(t)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg align-middle" title="تعديل"><Pencil className="w-4 h-4" /></button>
                    {!t.posted && <button onClick={() => handlePost(t.id)} disabled={postBusy === t.id} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg align-middle" title="ترحيل وتحديث السعر"><CheckCircle2 className="w-4 h-4" />{postBusy === t.id && <Loader2 className="w-4 h-4 animate-spin" />}</button>}
                    <button onClick={() => { if (!window.confirm('حذف هذا الاختبار؟')) return; deleteButcherTest(t.id); }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg align-middle" title="حذف"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {butcherTests.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-500 font-bold">لا توجد اختبارات جزارة مسجلة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal || editId !== null} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? 'تعديل اختبار جزارة' : 'اختبار جزارة جديد'}>
        <form onSubmit={editId ? submitEdit : submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="المادة (لحوم/دواجن/أسماك)" required>
              <select value={form.rawMaterialId} onChange={(e) => setForm({ ...form, rawMaterialId: e.target.value })} className={inputCls} required>
                <option value="">اختر المادة</option>
                {meatMaterials.map((m) => <option key={m.id} value={m.id}>{m.nameAr} ({m.category === 'meat_poultry' ? 'لحوم' : m.category === 'seafood' ? 'أسماك' : 'معالجة'})</option>)}
              </select>
            </Field>
            <Field label="الفرع" required>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls} required>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="التاريخ"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="سعر الشراء / كجم"><input type="number" step="0.01" min="0" value={form.pricePerKg || ''} onChange={(e) => setForm({ ...form, pricePerKg: parseFloat(e.target.value) || 0 })} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الوزن الإجمالي (كجم)"><input type="number" step="0.01" min="0.01" value={form.grossWeight || ''} onChange={(e) => setForm({ ...form, grossWeight: parseFloat(e.target.value) || 0 })} className={inputCls} /></Field>
            <Field label="الوزن الصالح (كجم)"><input type="number" step="0.01" min="0.01" value={form.usableWeight || ''} onChange={(e) => setForm({ ...form, usableWeight: parseFloat(e.target.value) || 0 })} className={inputCls} /></Field>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between">
            <span>الوزن الهالك/مقلم</span>
            <span className="font-mono text-rose-700">{fmt(wasteWeight, 2)} كجم</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between">
            <span>نسبة الإنتاجية</span>
            <span className="font-mono text-amber-700">{fmt(yieldPercent, 2)}%</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between">
            <span>تكلفة الكجم الصالح (مقترح)</span>
            <span className="font-mono text-brand-700">{fmtMoney(costPerUsableKg)}</span>
          </div>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowModal(false); setEditId(null); }} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium">{editId ? 'حفظ التعديل' : 'إضافة الاختبار'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};