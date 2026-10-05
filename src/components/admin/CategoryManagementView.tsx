import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Palette } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Modal, Field, inputCls } from '../ui';
import { downloadCSV, DEFAULT_MATERIAL_CATEGORIES } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import type { MaterialCategoryDef } from '../../types';

export const CategoryManagementView: React.FC = () => {
  const {
    materialCategories, addMaterialCategory, updateMaterialCategory, deleteMaterialCategory,
    showToast, rawMaterials,
  } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  const form: Omit<MaterialCategoryDef, 'id' | 'createdAt'> = {
    key: '',
    labelAr: '',
    labelEn: '',
    color: '#6366f1',
    order: 9,
    isActive: true,
    isDefault: false,
  };

  const editing = editId ? materialCategories.find((c) => c.id === editId) || null : null;

  const resetForm = () => {
    form.key = '';
    form.labelAr = '';
    form.labelEn = '';
    form.color = '#6366f1';
    form.order = Math.max(0, ...materialCategories.map((c) => c.order)) + 1;
    form.isActive = true;
    setEditId(null);
    setSavedMsg('');
  };

  const openNew = () => { resetForm(); setShowModal(true); };
  const openEdit = (cat: MaterialCategoryDef) => {
    form.key = cat.key;
    form.labelAr = cat.labelAr;
    form.labelEn = cat.labelEn;
    form.color = cat.color;
    form.order = cat.order;
    form.isActive = cat.isActive;
    setEditId(cat.id);
    setShowModal(true);
  };

  const validateForm = () => {
    if (!form.key.trim()) { alert('أدخل مفتاح التصنيف (بالإنجليزية، بدون مسافات)'); return false; }
    if (!/^[a-z0-9_]+$/.test(form.key)) { alert('المفتاح يجب أن يكون أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط'); return false; }
    if (!form.labelAr.trim()) { alert('أدخل الاسم بالعربي'); return false; }
    const exists = materialCategories.some((c) => c.key === form.key && c.id !== editId);
    if (exists) { alert('هذا المفتاح مستخدم بالفعل'); return false; }
    return true;
  };

  const save = () => {
    if (!validateForm()) return;
    if (editing) {
      updateMaterialCategory(editing.id, { ...form });
      setSavedMsg(`تم تعديل التصنيف "${form.labelAr}"`);
    } else {
      addMaterialCategory({ ...form });
      setSavedMsg(`تم إضافة التصنيف "${form.labelAr}"`);
    }
    setTimeout(() => setSavedMsg(''), 3000);
    setShowModal(false);
    setEditId(null);
  };

  const confirmDelete = (id: string) => {
    const cat = materialCategories.find((c) => c.id === id);
    if (cat?.isDefault) { showToast('لا يمكن حذف التصنيفات الافتراضية الثمانية'); return; }
    setDeleteId(id);
    setConfirmOpen(true);
  };

  const executeDelete = () => {
    if (deleteId) {
      const cat = materialCategories.find((c) => c.id === deleteId);
      deleteMaterialCategory(deleteId);
      showToast(cat ? `تم حذف التصنيف "${cat.labelAr}"` : 'تم الحذف');
    }
    setConfirmOpen(false);
    setDeleteId(null);
  };

  // قائمة التصنيفات الكاملة (افتراضية + مخصصة) للعرض
  const allCategories = [
    ...Object.entries(DEFAULT_MATERIAL_CATEGORIES)
      .map(([key, def]: [string, { labelAr: string; labelEn: string; order: number; isDefault: boolean }]) => ({ key, labelAr: def.labelAr, labelEn: def.labelEn, color: '#6366f1', order: def.order, isDefault: true, isActive: true, id: `default-${key}` })),
    ...materialCategories.filter((c) => c.isActive).sort((a, b) => a.order - b.order),
  ];

  // إحصائيات الاستخدام
  const usedByMaterials = materialCategories.reduce((acc, cat) => {
    const count = rawMaterials.filter((m) => m.category === cat.key).length;
    if (count > 0) acc[cat.key] = count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة تصنيفات المواد" subtitle="الثمانية تصنيفات الافتراضية مدمجة ولا يمكن حذفها — يمكنك إضافة تصنيفات مخصصة خاصة بمنشأتك" icon={<Palette className="w-6 h-6 text-brand-600" />}
        actions={
          <Btn onClick={openNew} tone="success"><Plus className="w-4 h-4" /> إضافة تصنيف مخصص</Btn>
        } />

      <Card className="p-5">
        <SectionHeader title="التصنيفات الحالية" subtitle={allCategories.length > 0 ? '' : 'لا توجد تصنيفات مضافة'} icon={<Palette className="w-5 h-5 text-brand-500" />} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">#</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">النوع</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">المفتاح</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">الاسم (العربي)</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">الاسم (الإنجليزي)</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">اللون</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">الترتيب</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">الحالة</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">مستخدم في</th>
                <th className="border border-slate-300 bg-slate-100 p-2 font-extrabold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {allCategories.map((cat, idx) => (
                <tr key={cat.id} className="hover:bg-slate-50">
                  <td className="tnum text-left border border-slate-300 p-2 font-bold text-slate-700">{idx + 1}</td>
                  <td className="border border-slate-300 p-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.isDefault ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {cat.isDefault ? 'افتراضي' : 'مخصص'}
                    </span>
                  </td>
                  <td className="tnum text-left border border-slate-300 p-2 text-slate-800">{cat.key}</td>
                  <td className="border border-slate-300 p-2 font-bold text-slate-900">{cat.labelAr}</td>
                  <td className="border border-slate-300 p-2 text-slate-600">{cat.labelEn}</td>
                  <td className="border border-slate-300 p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded border" style={{ backgroundColor: cat.color }}></div>
                      <span className="text-[10px] font-mono">{cat.color}</span>
                    </div>
                  </td>
                  <td className="tnum text-left border border-slate-300 p-2">{cat.order}</td>
                  <td className="border border-slate-300 p-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {cat.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="tnum text-left border border-slate-300 p-2 font-bold text-brand-700">{usedByMaterials[cat.key] || 0} صنف</td>
                  <td className="border border-slate-300 p-2">
                    <div className="flex items-center gap-1">
                      {!cat.isDefault && (
                        <button onClick={() => openEdit(cat as MaterialCategoryDef)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50" title="تعديل"><Pencil className="w-4 h-4" /></button>
                      )}
                      {!cat.isDefault && (
                        <button onClick={() => confirmDelete(cat.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="تصدير وطباعة" subtitle="تصدير قائمة التصنيفات الكاملة (افتراضية + مخصصة)" icon={<Palette className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 flex items-center gap-2">
          <Btn tone="primary" onClick={() => openPrintWindow({
            title: 'دليل تصنيفات المواد',
            subtitle: 'جميع التصنيفات (افتراضية + مخصصة) مرتبة للعرض',
            tables: [{
              title: 'التصنيفات',
              header: ['النوع', 'المفتاح', 'الاسم (العربي)', 'الاسم (الإنجليزي)', 'اللون', 'الترتيب', 'الحالة'],
              rows: allCategories.map((c) => [
                c.isDefault ? 'افتراضي' : 'مخصص',
                c.key,
                c.labelAr,
                c.labelEn,
                c.color,
                c.order,
                c.isActive ? 'نشط' : 'غير نشط',
              ]),
            }],
            footer: `إجمالي ${allCategories.length} تصنيف — RestoCost ERP Pro`,
          })}><Pencil className="w-4 h-4" /> طباعة الدليل</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('تصنيفات_المواد.csv',
            ['النوع', 'المفتاح', 'الاسم (العربي)', 'الاسم (الإنجليزي)', 'اللون', 'الترتيب', 'الحالة'],
            allCategories.map((c) => [
              c.isDefault ? 'افتراضي' : 'مخصص',
              c.key,
              c.labelAr,
              c.labelEn,
              c.color,
              c.order,
              c.isActive ? 'نشط' : 'غير نشط',
            ]))}><Palette className="w-4 h-4" /> تصدير CSV</Btn>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editing ? `تعديل: ${editing.labelAr}` : 'إضافة تصنيف مخصص جديد'} wide>
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-bold">المفتاح: أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط (مثال: frozen_goods، spices، dairy_products)</p>
          <p className="text-xs text-slate-500 font-bold">الترتيب: رقم يحدد مكان الظهور في القوائم (الأقل يظهر أولاً)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="المفتاح (Key)"><input value={form.key} onChange={(e) => form.key = e.target.value} placeholder="مثال: frozen_goods" className={inputCls} disabled={!!editing} /></Field>
            <Field label="الترتيب"><input type="number" value={form.order} onChange={(e) => form.order = parseInt(e.target.value) || 0} min={0} className={inputCls} /></Field>
            <Field label="الاسم بالعربي"><input value={form.labelAr} onChange={(e) => form.labelAr = e.target.value} placeholder="مثال: مواد مجمدة" className={inputCls} /></Field>
            <Field label="الاسم بالإنجليزي"><input value={form.labelEn} onChange={(e) => form.labelEn = e.target.value} placeholder="Frozen Goods" className={inputCls} /></Field>
            <Field label="اللون"><input type="color" value={form.color} onChange={(e) => form.color = e.target.value} className="w-full h-10 p-1 border rounded-lg" /></Field>
            <Field label="الحالة">
              <select value={form.isActive ? '1' : '0'} onChange={(e) => form.isActive = e.target.value === '1'} className={inputCls}>
                <option value="1">نشط</option>
                <option value="0">غير نشط</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn tone="ghost" onClick={() => { setShowModal(false); setEditId(null); }}><X className="w-4 h-4" /> إلغاء</Btn>
            <Btn tone="success" onClick={save} disabled={!!editing && false}><Save className="w-4 h-4" /> {editing ? 'حفظ التعديل' : 'إضافة التصنيف'}</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأكيد الحذف" wide>
        <div className="space-y-3">
          <p className="font-bold text-slate-700">سيتم حذف التصنيف المخصص نهائياً.</p>
          <p className="text-xs text-slate-500">ملاحظة: الأصناف التي تستخدم هذا التصنيف ستبقى كما هي لكن التصنيف سيظهر كـ "غير معروف" في القوائم.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Btn tone="ghost" onClick={() => setConfirmOpen(false)}><X className="w-4 h-4" /> إلغاء</Btn>
            <Btn tone="danger" onClick={executeDelete}><Trash2 className="w-4 h-4" /> تأكيد الحذف</Btn>
          </div>
        </div>
      </Modal>

      {savedMsg && (
        <div className="fixed bottom-4 right-4 rounded-xl p-3 font-bold border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs shadow-lg z-50 animate-fade-in">
          {savedMsg}
        </div>
      )}
    </div>
  );
};