import React, { useState } from 'react';
import { Truck, Plus, Pencil, Star, Phone, Mail, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import { allCategoryLabels, categoryLabel, downloadCSV } from '../../utils/helpers';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ImportExcelModal, ImportColumn } from '../ui/ImportExcelModal';
import { useAdminDelete, AdminDeleteModal } from '../../hooks';

const SUPPLIER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', label: 'الكود', aliases: ['الكود', 'code', 'رمز'], sample: 'SUP-001' },
  { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'name', 'اسم المورد'], sample: 'مؤسسة التمور الذهبية' },
  { key: 'contactPerson', label: 'مسؤول التواصل', aliases: ['مسؤول التواصل', 'contactPerson', 'contact'], sample: 'أحمد محمد' },
  { key: 'phone', label: 'الهاتف', aliases: ['الهاتف', 'phone', 'جوال'], sample: '0500000000' },
  { key: 'email', label: 'البريد الإلكتروني', aliases: ['البريد', 'email', 'e-mail', 'بريد'], sample: 'info@supplier.com' },
  { key: 'rating', label: 'التقييم', type: 'number', aliases: ['التقييم', 'rating', 'تقييم'], sample: '4' },
  { key: 'paymentTermsDays', label: 'شروط الدفع (يوم)', type: 'number', aliases: ['شروط الدفع', 'paymentTermsDays', 'payment_terms'], sample: '30' },
  { key: 'categories', label: 'التصنيفات', aliases: ['التصنيفات', 'categories', 'تصنيفات'], sample: '' },
  { key: 'notes', label: 'ملاحظات', aliases: ['ملاحظات', 'notes', 'ملاحظة'], sample: '' },
];

export const SuppliersView: React.FC = () => {
  const { suppliers, grnNotes, addSupplier, updateSupplier, deleteSupplier, importSuppliers, showToast, materialCategories } = useApp();
  const { isModalOpen, password, setPassword, requestDelete, confirmDelete, cancelDelete } = useAdminDelete();
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', rating: 4, paymentTermsDays: 30, categories: [] as string[], notes: '', isActive: true });

  const openCreate = () => { setEditingId(null); setForm({ name: '', contactPerson: '', phone: '', email: '', rating: 4, paymentTermsDays: 30, categories: [], notes: '', isActive: true }); setShowModal(true); };
  const openEdit = (s: (typeof suppliers)[0]) => { setEditingId(s.id); setForm({ name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, rating: s.rating, paymentTermsDays: s.paymentTermsDays, categories: s.categories, notes: s.notes || '', isActive: s.isActive }); setShowModal(true); };

  const toggleCat = (c: string) => setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    if (editingId) updateSupplier(editingId, form);
    else addSupplier(form);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة الموردين" subtitle="سجل الموردين، تقييم الجودة، شروط الدفع، وتصنيفات التوريد" icon={<Truck className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar
            filename="الموردون"
            onImport={() => setShowImport(true)}
            importLabel="استيراد الموردين"
            sheets={[
              { name: 'الموردون', header: ['الكود', 'الاسم', 'مسؤول التواصل', 'الهاتف', 'البريد الإلكتروني', 'التقييم', 'شروط الدفع', 'التصنيفات', 'ملاحظات', 'الحالة'], rows: suppliers.map((s) => [s.code, s.name, s.contactPerson, s.phone, s.email, s.rating, s.paymentTermsDays, s.categories.map((c) => categoryLabel(c, materialCategories)).join('، '), s.notes || '', s.isActive ? 'نشط' : 'موقوف']) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Suppliers.csv', ['الكود', 'الاسم', 'مسؤول التواصل', 'الهاتف', 'التقييم', 'شروط الدفع'], suppliers.map((s) => [s.code, s.name, s.contactPerson, s.phone, s.rating, s.paymentTermsDays]))}>تصدير CSV</Btn>
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> مورد جديد</Btn>
        </>} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map((s) => {
          const grnCount = grnNotes.filter((g) => g.supplierId === s.id).length;
          return (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{s.name}</p>
                  <p className="text-[11px] text-slate-500 font-mono">{s.code} • {s.isActive ? 'نشط' : 'موقوف'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-extrabold text-amber-600 text-sm flex items-center gap-0.5"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{s.rating}</span>
                  <button onClick={() => openEdit(s)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
<button onClick={() => {
                      requestDelete(() => {
                        deleteSupplier(s.id);
                        showToast(`تم حذف المورد ${s.name}`);
                      });
                    }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {s.contactPerson} — {s.phone}</p>
                {s.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-400" /> {s.email}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                {s.categories.map((c) => <span key={c} className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">{categoryLabel(c, materialCategories)}</span>)}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                <span className="font-bold text-indigo-700">شروط السداد: {s.paymentTermsDays} يوم</span>
                <span className="text-slate-500 font-bold">{grnCount} فواتير استلام</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل مورد' : 'إضافة مورد جديد'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="اسم المورد" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="مسؤول التواصل"><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className={inputCls} /></Field>
            <Field label="الهاتف"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="البريد الإلكتروني"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="التقييم (1-5)"><input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: parseFloat(e.target.value) || 4 })} className={inputCls} /></Field>
            <Field label="شروط الدفع (يوم)"><input type="number" min="0" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: parseInt(e.target.value) || 0 })} className={inputCls} /></Field>
            <Field label="الحالة"><select value={form.isActive ? '1' : '0'} onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })} className={inputCls}><option value="1">نشط</option><option value="0">موقوف</option></select></Field>
          </div>
          <Field label="تصنيفات التوريد">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(allCategoryLabels(materialCategories)).map((c) => (
                <button type="button" key={c} onClick={() => toggleCat(c)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${form.categories.includes(c) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{categoryLabel(c, materialCategories)}</button>
              ))}
            </div>
          </Field>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editingId ? 'حفظ' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>

      <ImportExcelModal
        open={showImport}
        onClose={() => setShowImport(false)}
        columns={SUPPLIER_IMPORT_COLUMNS}
        title="استيراد الموردين من Excel"
        subtitle="اختر ملف Excel يحتوي على موردين — يُضاف الجديد ويُحدَّث الموجود تلقائياً حسب الكود أو الاسم."
        templateName="قالب_الموردين"
        existingCodes={suppliers.map((s) => s.code)}
        codeKey="code"
        onImport={(records) => { importSuppliers(records); }}
      />
      <AdminDeleteModal
        isOpen={isModalOpen}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        password={password}
        setPassword={setPassword}
        title="تأكيد حذف المورد"
        message="سيتم حذف المورد نهائياً. يرجى إدخال كلمة مرور مسؤول النظام للمتابعة."
      />
    </div>
  );
};