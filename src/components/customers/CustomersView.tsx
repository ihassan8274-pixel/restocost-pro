import React, { useState } from 'react';
import { Users, Plus, Star, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ImportExcelModal, ImportColumn } from '../ui/ImportExcelModal';
import { fmt, downloadCSV } from '../../utils/helpers';
import { CustomerType } from '../../types';

const TYPE_LABELS: Record<CustomerType, string> = { individual: 'فردي', corporate: 'شركات', loyalty: 'ولاء' };

const CUSTOMER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', label: 'الكود', aliases: ['الكود', 'code', 'رمز'], sample: 'C-1001' },
  { key: 'name', label: 'الاسم', required: true, aliases: ['الاسم', 'name', 'اسم العميل'], sample: 'أحمد محمد' },
  { key: 'phone', label: 'الهاتف', aliases: ['الهاتف', 'الجوال', 'phone', 'mobile'], sample: '0501234567' },
  { key: 'email', label: 'البريد الإلكتروني', aliases: ['البريد', 'البريد الالكتروني', 'email'], sample: 'ahmed@example.com' },
  { key: 'type', label: 'النوع', type: 'select', aliases: ['النوع', 'type', 'تصنيف'], options: [
    { value: 'individual', label: 'فرد' }, { value: 'corporate', label: 'شركة' }, { value: 'loyalty', label: 'ولاء' },
  ], sample: 'فرد' },
  { key: 'city', label: 'المدينة', aliases: ['المدينة', 'city'], sample: 'الرياض' },
  { key: 'branchId', label: 'الفرع', type: 'select', aliases: ['الفرع', 'branch', 'branchId'], options: [], sample: '' },
  { key: 'totalSpent', label: 'إجمالي الإنفاق', type: 'number', aliases: ['الإنفاق الكلي', 'إجمالي الإنفاق', 'totalSpent', 'spent'], sample: '2500' },
  { key: 'visits', label: 'عدد الزيارات', type: 'number', aliases: ['الزيارات', 'عدد الزيارات', 'visits'], sample: '12' },
  { key: 'isVip', label: 'عميل VIP', aliases: ['vip', 'isVip', 'عميل مميز'], sample: 'نعم' },
];

export const CustomersView: React.FC = () => {
  const { customers, branches, visibleBranchIds, addCustomer, updateCustomer, deleteCustomer, getBranchName, importCustomers } = useApp();
  const [tab, setTab] = useState<'list' | 'vip'>('list');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', type: 'individual' as CustomerType, city: '', branchId: visibleBranchIds[0] || '', isVip: false, notes: '' });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', phone: '', email: '', type: 'individual', city: '', branchId: visibleBranchIds[0] || '', isVip: false, notes: '' });
    setShowModal(true);
  };
  const openEdit = (c: (typeof customers)[0]) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone, email: c.email || '', type: c.type, city: c.city || '', branchId: c.branchId, isVip: c.isVip, notes: c.notes || '' });
    setShowModal(true);
  };

  const vip = customers.filter((c) => c.isVip);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    if (editingId) {
      updateCustomer(editingId, form);
    } else {
      addCustomer({ ...form, joinDate: new Date().toISOString().slice(0, 10), totalSpent: 0, visits: 0 });
    }
    setShowModal(false);
    setEditingId(null);
    setForm({ name: '', phone: '', email: '', type: 'individual', city: '', branchId: visibleBranchIds[0] || '', isVip: false, notes: '' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="العملاء (CRM)" subtitle="قاعدة العملاء، تصنيف الولاء، وتتبع الإنفاق والزيارات" icon={<Users className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="العملاء"
            onImport={() => setShowImport(true)}
            importLabel="استيراد العملاء"
            sheets={[
              { name: 'العملاء', header: ['الكود', 'الاسم', 'الهاتف', 'البريد', 'النوع', 'المدينة', 'الفرع', 'إجمالي الإنفاق', 'الزيارات', 'آخر زيارة', 'VIP'], rows: customers.map((c) => [c.code, c.name, c.phone, c.email || '', TYPE_LABELS[c.type], c.city || '', getBranchName(c.branchId), c.totalSpent, c.visits, c.lastVisit || '', c.isVip ? 'نعم' : 'لا']) },
              { name: 'VIP', header: ['الكود', 'الاسم', 'الهاتف', 'الفرع', 'الزيارات', 'إجمالي الإنفاق', 'آخر زيارة'], rows: vip.map((c) => [c.code, c.name, c.phone, getBranchName(c.branchId), c.visits, c.totalSpent, c.lastVisit || '']) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Customers.csv', ['الكود', 'الاسم', 'الهاتف', 'النوع', 'الإنفاق الكلي', 'الزيارات'], customers.map((c) => [c.code, c.name, c.phone, c.type, c.totalSpent, c.visits]))}>تصدير CSV</Btn>
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> عميل جديد</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي العملاء</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{customers.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">عملاء VIP</span><strong className="text-lg font-extrabold text-amber-600 block mt-1">{vip.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">شركات</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{customers.filter((c) => c.type === 'corporate').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي إنفاق العملاء</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(customers.reduce((s, c) => s + c.totalSpent, 0), 0)} ر.س</strong></div>
      </div>

      <TabBar tabs={[{ id: 'list', label: 'قائمة العملاء' }, { id: 'vip', label: `VIP (${vip.length})` }]} active={tab} onChange={(id) => setTab(id as 'list' | 'vip')} />

      {tab === 'list' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">الهاتف</th><th className="p-3">النوع</th><th className="p-3">الفرع</th><th className="p-3">الزيارات</th><th className="p-3">إجمالي الإنفاق</th><th className="p-3">آخر زيارة</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-indigo-700">{c.code}</td>
                    <td className="p-3 font-bold text-slate-900 flex items-center gap-1">{c.isVip && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}{c.name}</td>
                    <td className="p-3 font-mono text-slate-600" dir="ltr">{c.phone}</td>
                    <td className="p-3"><span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{TYPE_LABELS[c.type]}</span></td>
                    <td className="p-3 text-slate-600">{getBranchName(c.branchId)}</td>
                    <td className="p-3 font-mono">{c.visits}</td>
                    <td className="p-3 font-mono font-extrabold text-slate-900">{fmt(c.totalSpent, 0)}</td>
                    <td className="p-3 font-mono text-slate-500">{c.lastVisit || '-'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => {
                          if (!window.confirm(`حذف العميل «${c.name}»؟ سيُحذف السجل نهائياً.`)) return;
                          deleteCustomer(c.id);
                        }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'vip' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vip.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <div><p className="font-bold text-slate-900 text-sm">{c.name}</p><p className="text-[10px] text-slate-500">{c.code} • {getBranchName(c.branchId)}</p></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">الزيارات</span><strong className="font-mono text-slate-900">{c.visits}</strong></div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">إجمالي الإنفاق</span><strong className="font-mono text-amber-700">{fmt(c.totalSpent, 0)}</strong></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الاسم" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></Field>
            <Field label="الهاتف" required><input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="البريد"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
            <Field label="المدينة"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="النوع">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CustomerType })} className={inputCls}>
                <option value="individual">فردي</option><option value="corporate">شركات</option><option value="loyalty">ولاء</option>
              </select>
            </Field>
            <Field label="الفرع">
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-700"><input type="checkbox" checked={form.isVip} onChange={(e) => setForm({ ...form, isVip: e.target.checked })} /> عميل VIP</label>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">إضافة</button>
          </div>
        </form>
      </Modal>

      <ImportExcelModal
        open={showImport}
        onClose={() => setShowImport(false)}
        columns={CUSTOMER_IMPORT_COLUMNS.map((c) => (c.key === 'branchId' ? { ...c, options: branches.map((b) => ({ value: b.id, label: b.nameAr })) } : c))}
        title="استيراد العملاء من Excel"
        subtitle="اختر ملف Excel يحتوي على بيانات العملاء — يُضاف الجديد ويُحدَّث الموجود تلقائياً حسب الكود أو الاسم والهاتف."
        templateName="قالب_العملاء"
        existingCodes={customers.map((c) => c.code)}
        codeKey="code"
        onImport={(records) => { importCustomers(records); }}
      />
    </div>
  );
};