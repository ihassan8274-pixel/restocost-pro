import React, { useState } from 'react';
import { Ruler, Plus, Trash2, RefreshCw, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, Modal } from '../ui';
import type { UnitOfMeasure } from '../../types';

const UOM_CLASS_LABELS: Record<UnitOfMeasure['uomClass'], string> = {
  volume: 'حجم (لتر/مل)',
  weight: 'وزن (كغم/جم)',
  count: 'عدد (قطعة)',
  length: 'طول (متر)',
};

export const UnitsView: React.FC = () => {
  const { unitsOfMeasure, addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure, rawMaterials } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '', uomClass: 'volume' as UnitOfMeasure['uomClass'], isActive: true });

  const openCreate = () => { setEditing(''); setForm({ code: '', nameAr: '', nameEn: '', uomClass: 'volume', isActive: true }); setShowModal(true); };
  const openEdit = (u: UnitOfMeasure) => { setEditing(u.id); setForm({ code: u.code, nameAr: u.nameAr, nameEn: u.nameEn, uomClass: u.uomClass, isActive: u.isActive }); setShowModal(true); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.nameAr.trim()) return;
    if (editing) updateUnitOfMeasure(editing, { code: form.code, nameAr: form.nameAr, nameEn: form.nameEn, uomClass: form.uomClass, isActive: form.isActive });
    else addUnitOfMeasure({ code: form.code, nameAr: form.nameAr, nameEn: form.nameEn, uomClass: form.uomClass, isActive: form.isActive });
    setShowModal(false);
  };

  const linkedCount = (u: UnitOfMeasure) => rawMaterials.filter((m) => m.tradeUomId === u.id).length;

  return (
    <div className="space-y-6">
      <PageHeader title="وحدات القياس (التداول)" subtitle="ماديول وحدات القياس القياسية المستخدمة في الوصفات — حوِّل رصيدك من وحدة المخزون إلى وحدات قياس (لتر/كغم/قطعة) بسلسلة: شراء ← مخزون ← تداول" icon={<Ruler className="w-6 h-6 text-indigo-300" />}
        actions={<Btn onClick={openCreate}><Plus className="w-4 h-4" /> وحدة قياس جديدة</Btn>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الوحدات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{unitsOfMeasure.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">وحدات نشطة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{unitsOfMeasure.filter((u) => u.isActive).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs"><span className="text-indigo-600 text-[11px] block">أصناف مرتبطة بوحدة تداول</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{rawMaterials.filter((m) => m.tradeUomId).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">فئات الوحدات (حجم/وزن/عدد/طول)</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{new Set(unitsOfMeasure.map((u) => u.uomClass)).size}</strong></div>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
              <tr><th className="p-3">الكود</th><th className="p-3">الاسم بالعربية</th><th className="p-3">الاسم بالإنجليزية</th><th className="p-3">الفئة</th><th className="p-3">الأصناف المرتبطة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unitsOfMeasure.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="tnum text-left p-3 font-extrabold text-indigo-700">{u.code}</td>
                  <td className="p-3 font-bold text-slate-900">{u.nameAr}</td>
                  <td className="p-3 text-slate-500">{u.nameEn}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{UOM_CLASS_LABELS[u.uomClass]}</span></td>
                  <td className="tnum text-left p-3 text-slate-600">{linkedCount(u) || '—'}</td>
                  <td className="p-3">{u.isActive ? <span className="text-emerald-600 font-bold">نشطة</span> : <span className="text-slate-400 font-bold">موقوفة</span>}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={() => { const res = deleteUnitOfMeasure(u.id); if (!res.ok) alert(res.error); }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {unitsOfMeasure.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">لا توجد وحدات قياس — أضف الأولى</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 border-amber-200 bg-amber-50/50">
        <h3 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-amber-500" /> كيف تعمل سلسلة الوحدات الثلاث؟</h3>
        <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
          على شاشة الأصناف تُحدَّد لكل مادة: وحدة المخزون (زجاجة) + وحدة الشراء (كرتون 12 زجاجة) + وحدة التداول من هذه الشاشة (لتر) + معامل خاص للصنف (الزجاجة = 0.7 لتر).
          الوصفات تُقيَّم وتحسب دائماً بوحدة التداول: سعر اللتر = سعر الزجاجة ÷ 0.7، وعند الخصم من المخزون تُحوَّل كمية الوصفة تلقائياً من اللتر إلى الزجاجات.
        </p>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل وحدة قياس' : 'إضافة وحدة قياس جديدة'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الكود" required><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} className={inputCls} dir="ltr" placeholder="LTR / KG / GM" required /></Field>
            <Field label="الفئة"><select value={form.uomClass} onChange={(e) => setForm({ ...form, uomClass: e.target.value as UnitOfMeasure['uomClass'] })} className={inputCls}>{Object.entries(UOM_CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="الاسم بالعربية" required><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputCls} placeholder="لتر / كيلوغرام / قطعة" required /></Field>
          <Field label="الاسم بالإنجليزية"><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} dir="ltr" placeholder="Liter / Kilogram / Piece" /></Field>
          <label className="flex items-center gap-2 font-bold text-slate-700 text-xs"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="accent-indigo-600" /> وحدة نشطة (متاحة للاختيار على الأصناف)</label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editing ? 'حفظ التعديل' : 'إضافة الوحدة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};