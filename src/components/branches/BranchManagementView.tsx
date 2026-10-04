import React, { useState } from 'react';
import { Building2, Plus, Pencil, MapPin, Phone, User, Building, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, Modal } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';

interface BranchForm {
  nameAr: string;
  nameEn: string;
  type: 'central_kitchen' | 'restaurant';
  city: string;
  region: string;
  address: string;
  managerName: string;
  phone: string;
  companyId: string;
  isActive: boolean;
}

const emptyForm: BranchForm = {
  nameAr: '', nameEn: '', type: 'restaurant', city: '', region: '', address: '',
  managerName: '', phone: '', companyId: '', isActive: true,
};

export const BranchManagementView: React.FC = () => {
  const { branches, addBranch, updateBranch, deleteBranch, inventory, posOrders, workOrders, companies, getCompanyName } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [msg, setMsg] = useState('');

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (b: (typeof branches)[0]) => {
    setEditingId(b.id);
    setForm({ nameAr: b.nameAr, nameEn: b.nameEn, type: b.type, city: b.city, region: b.region || '', address: b.address, managerName: b.managerName, phone: b.phone, companyId: b.companyId || '', isActive: b.isActive });
    setShowModal(true);
  };

  const branchStats = (id: string) => ({
    stockItems: inventory.filter((i) => i.branchId === id).length,
    orders: posOrders.filter((o) => o.branchId === id).length,
    workOrders: workOrders.filter((w) => w.centralKitchenId === id || w.targetBranchId === id).length,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr.trim() || !form.city.trim()) return;
    if (editingId) {
      updateBranch(editingId, form);
      setMsg('تم تحديث بيانات الفرع');
    } else {
      addBranch(form);
      setMsg('تم إضافة الفرع بنجاح');
    }
    setTimeout(() => setMsg(''), 3000);
    setShowModal(false);
  };

  const activeCount = branches.filter((b) => b.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة الفروع" subtitle="إضافة وتعديل الفروع والمطبخ المركزي — ترتبط بها المخزون ونقاط البيع وأوامر التصنيع" icon={<Building2 className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar
            filename="الفروع"
            sheets={[{
              name: 'الفروع', header: ['الكود', 'الاسم', 'النوع', 'الشركة', 'المدينة', 'العنوان', 'المدير', 'الهاتف', 'الحالة'],
              rows: branches.map((b) => [b.code, b.nameAr, b.type === 'central_kitchen' ? 'مطبخ مركزي' : 'مطعم', getCompanyName(b.companyId || '') || 'غير مرتبطة', b.city, b.address, b.managerName, b.phone, b.isActive ? 'نشط' : 'موقوف']),
            }]}
          />
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> فرع جديد</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الفروع</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{branches.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الفروع النشطة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{activeCount}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مطاعم</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{branches.filter((b) => b.type === 'restaurant').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مطابخ مركزية</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{branches.filter((b) => b.type === 'central_kitchen').length}</strong></div>
      </div>

      {msg && <div className="rounded-xl p-3 font-bold text-xs border bg-emerald-50 border-emerald-200 text-emerald-700">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {branches.map((b) => {
          const stats = branchStats(b.id);
          return (
            <Card key={b.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${b.type === 'central_kitchen' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{b.nameAr}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{b.code} • {b.nameEn}</p>
                    {b.companyId ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded-full"><Building className="w-2.5 h-2.5" /> {getCompanyName(b.companyId)}</span>
                    ) : (
                      <span className="mt-1 inline-flex items-center text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">غير مرتبطة بشركة</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.isActive ? 'نشط' : 'موقوف'}</span>
                  <button onClick={() => openEdit(b)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => {
                    if (!window.confirm(`حذف الفرع «${b.nameAr}»؟ سيُحذف السجل نهائياً.`)) return;
                    deleteBranch(b.id);
                  }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /> <strong>{b.city}</strong> — {b.address}</p>
                <p className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /> {b.managerName || 'غير محدد'}</p>
                <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> <span dir="ltr">{b.phone || '—'}</span></p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] border-t border-slate-100 pt-3">
                <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-500 block">أصناف مخزون</span><strong className="font-mono text-slate-900">{stats.stockItems}</strong></div>
                <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-500 block">طلبات POS</span><strong className="font-mono text-slate-900">{fmt(stats.orders)}</strong></div>
                <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-500 block">أوامر تصنيع</span><strong className="font-mono text-slate-900">{fmt(stats.workOrders)}</strong></div>
              </div>
            </Card>
          );
        })}
        {branches.length === 0 && <p className="text-center text-slate-400 text-xs py-8 col-span-full">لا توجد فروع بعد</p>}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل فرع' : 'إضافة فرع جديد'} wide>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الاسم بالعربية" required>
              <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="الاسم بالإنجليزية">
              <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} dir="ltr" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="النوع" required>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as BranchForm['type'] })} className={inputCls}>
                <option value="restaurant">مطعم / فرع</option>
                <option value="central_kitchen">مطبخ مركزي / مستودع</option>
              </select>
            </Field>
            <Field label="الشركة التابعة لها">
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
                <option value="">— غير مرتبطة —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="المدينة" required>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} required />
            </Field>
                <Field label="المنطقة">
                  <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={inputCls} placeholder="مثال: المنطقة الشمالية" list="regions-list" />
                  <datalist id="regions-list">{Array.from(new Set(branches.map((b) => b.region).filter(Boolean))).map((rg) => <option key={rg} value={rg} />)}</datalist>
                </Field>
                <Field label="العنوان">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="اسم المدير">
              <input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="رقم الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} dir="ltr" />
            </Field>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-700 text-xs">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> فرع نشط (يظهر في القوائم والتحويلات)
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editingId ? 'حفظ التعديلات' : 'إضافة الفرع'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};