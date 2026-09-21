import React, { useState } from 'react';
import { Landmark, Plus, Pencil, Trash2, CalendarClock, CircleCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, SectionHeader, EmptyState } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, navOnEnter } from '../../utils/helpers';
import type { FixedAsset, FixedAssetCategory } from '../../types';

const CATEGORY_LABELS: Record<FixedAssetCategory, string> = {
  machinery: 'آلات ومعدات', equipment: 'تجهيزات', furniture: 'أثاث', vehicles: 'مركبات', buildings: 'مباني', software: 'برمجيات وأنظمة', other: 'أخرى',
};

const emptyForm = (branchId: string) => ({ name: '', category: 'machinery' as FixedAssetCategory, branchId, purchaseDate: new Date().toISOString().split('T')[0], purchaseCost: 0, salvageValue: 0, usefulLifeYears: 5, supplierId: '', description: '' });

export const FixedAssetsView: React.FC = () => {
  const { fixedAssets, branches, visibleBranchIds, suppliers, addFixedAsset, updateFixedAsset, deleteFixedAsset, recordDepreciation, getMonthlyDepreciation, can } = useApp();
  const canManage = can('manage_accounting');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(visibleBranchIds[0] || 'b-ck'));
  const [msg, setMsg] = useState('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;

  const monthsInService = (purchaseDate: string) => {
    const f = new Date(purchaseDate); const now = new Date();
    return Math.max(0, (now.getFullYear() - f.getFullYear()) * 12 + (now.getMonth() - f.getMonth()));
  };

  const totals = {
    cost: fixedAssets.reduce((s, a) => s + a.purchaseCost, 0),
    accDep: fixedAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0),
    monthly: fixedAssets.filter((a) => a.isActive).reduce((s, a) => s + getMonthlyDepreciation(a), 0),
    netBook: 0,
  };
  totals.netBook = totals.cost - totals.accDep;

  const openAdd = () => { setEditingId(null); setForm(emptyForm(visibleBranchIds[0] || 'b-ck')); setShowModal(true); };
  const openEdit = (a: FixedAsset) => {
    setEditingId(a.id);
    setForm({ name: a.name, category: a.category, branchId: a.branchId, purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost, salvageValue: a.salvageValue, usefulLifeYears: a.usefulLifeYears, supplierId: a.supplierId || '', description: a.description || '' });
    setShowModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.purchaseCost <= 0) return;
    if (editingId) {
      updateFixedAsset(editingId, { name: form.name.trim(), category: form.category, branchId: form.branchId, purchaseDate: form.purchaseDate, purchaseCost: form.purchaseCost, salvageValue: form.salvageValue, usefulLifeYears: form.usefulLifeYears, supplierId: form.supplierId || undefined, description: form.description });
    } else {
      addFixedAsset({ name: form.name.trim(), category: form.category, branchId: form.branchId, purchaseDate: form.purchaseDate, purchaseCost: form.purchaseCost, salvageValue: form.salvageValue, usefulLifeYears: form.usefulLifeYears, accumulatedDepreciation: 0, supplierId: form.supplierId || undefined, description: form.description, isActive: true });
    }
    setShowModal(false);
  };

  const runDepreciation = () => {
    const res = recordDepreciation(new Date().toISOString().slice(0, 7));
    setMsg(res.message);
    setTimeout(() => setMsg(''), 4000);
  };

  const setF = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  return (
    <div className="space-y-6">
      <PageHeader title="الأصول الثابتة والاهتلاك" subtitle="سجل الأصول (آلات، تجهيزات، مركبات، برمجيات) مع جدول اهتلاك شهري وترحيل محاسبي تلقائي" icon={<Landmark className="w-6 h-6 text-emerald-300" />}
        actions={<>
          <ViewToolbar
            filename="الأصول_الثابتة"
            sheets={[
              { name: 'الأصول', header: ['الكود', 'الاسم', 'التصنيف', 'الفرع', 'تاريخ الاقتناء', 'التكلفة', 'قيمة الخردة', 'العمر (سنوات)', 'مجمع الاهتلاك', 'صافي القيمة'], rows: fixedAssets.map((a) => [a.code, a.name, CATEGORY_LABELS[a.category], branchName(a.branchId), a.purchaseDate, a.purchaseCost, a.salvageValue, a.usefulLifeYears, a.accumulatedDepreciation, a.purchaseCost - a.accumulatedDepreciation]) },
              { name: 'جدول الاهتلاك', header: ['الأصل', 'الاهتلاك الشهري', 'شهور التشغيل', 'الاهتلاك المتراكم'], rows: fixedAssets.map((a) => [a.name, getMonthlyDepreciation(a), monthsInService(a.purchaseDate), a.accumulatedDepreciation]) },
            ]}
          />
          {canManage && <Btn onClick={openAdd}><Plus className="w-4 h-4" /> أصل جديد</Btn>}
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي تكلفة الأصول</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(totals.cost)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مجمع الاهتلاك</span><strong className="text-lg font-extrabold font-mono text-slate-800 block mt-1">{fmt(totals.accDep)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي القيمة الدفترية</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(totals.netBook)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الاهتلاك الشهري الحالي</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmt(totals.monthly)} ر.س</strong></div>
      </div>

      {msg && <div className="rounded-xl p-3 font-bold text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 flex items-center gap-2"><CircleCheck className="w-4 h-4" /> {msg}</div>}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="سجل الأصول الثابتة" subtitle="الاهتلاك بطريقة القسط الثابت: (التكلفة - الخردة) ÷ العمر" icon={<Landmark className="w-5 h-5 text-indigo-600" />} />
          {canManage && <Btn onClick={runDepreciation} tone="dark"><CalendarClock className="w-4 h-4" /> ترحيل اهتلاك الشهر الحالي</Btn>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">التصنيف</th><th className="p-3">الفرع</th><th className="p-3">التكلفة</th><th className="p-3">الاهتلاك الشهري</th><th className="p-3">مجمع الاهتلاك</th><th className="p-3">صافي القيمة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fixedAssets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-indigo-700">{a.code}</td>
                  <td className="p-3 font-bold text-slate-900">{a.name}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{CATEGORY_LABELS[a.category]}</span></td>
                  <td className="p-3 text-slate-600">{branchName(a.branchId)}</td>
                  <td className="p-3 font-mono font-bold">{fmt(a.purchaseCost)}</td>
                  <td className="p-3 font-mono">{fmt(getMonthlyDepreciation(a))}</td>
                  <td className="p-3 font-mono text-slate-800">{fmt(a.accumulatedDepreciation)}</td>
                  <td className="p-3 font-mono font-extrabold text-emerald-700">{fmt(Math.max(0, a.purchaseCost - a.accumulatedDepreciation))}</td>
                  <td className="p-3">{a.isActive ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">نشط</span> : <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">مستبعد</span>}</td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(a)} className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteFixedAsset(a.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {fixedAssets.length === 0 && <tr><td colSpan={10} className="p-0"><EmptyState title="لا توجد أصول ثابتة" subtitle="أضف أصلاً جديداً لتبدأ تتبع الاهتلاك" icon={<Landmark className="w-5 h-5" />} compact /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <SectionHeader title="جدول الاهتلاك السنوي" subtitle="شهور التشغيل المنقضية والقيمة المسجلة لكل أصل" icon={<CalendarClock className="w-5 h-5 text-indigo-600" />} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الأصل</th><th className="p-3">شهور التشغيل</th><th className="p-3">الاهتلاك المتوقع (حتى الآن)</th><th className="p-3">الاهتلاك المسجل</th><th className="p-3">الفرق غير المرحّل</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fixedAssets.map((a) => {
                const months = monthsInService(a.purchaseDate);
                const expected = Number((getMonthlyDepreciation(a) * months).toFixed(2));
                const diff = expected - a.accumulatedDepreciation;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{a.name}</td>
                    <td className="p-3 font-mono">{months}</td>
                    <td className="p-3 font-mono">{fmt(expected)}</td>
<td className="p-3 font-mono text-slate-800">{fmt(a.accumulatedDepreciation)}</td>
                    <td className={`p-3 font-mono font-extrabold ${diff > 1 ? 'text-amber-700' : 'text-emerald-700'}`}>{diff > 1 ? `غير مرحّل ${fmt(diff)}` : 'مسجّل'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل أصل ثابت' : 'إضافة أصل ثابت'} wide>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="اسم الأصل" required><input value={form.name} onChange={(e) => setF({ name: e.target.value })} className={inputCls} placeholder="مثال: فرن شواية غاز" required /></Field>
            <Field label="التصنيف">
              <select value={form.category} onChange={(e) => setF({ category: e.target.value as FixedAssetCategory })} className={inputCls}>
                {(Object.keys(CATEGORY_LABELS) as FixedAssetCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </Field>
            <Field label="الفرع">
              <select value={form.branchId} onChange={(e) => setF({ branchId: e.target.value })} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="تاريخ الاقتناء" required><input type="date" value={form.purchaseDate} onChange={(e) => setF({ purchaseDate: e.target.value })} className={inputCls} required /></Field>
            <Field label="تكلفة الاقتناء (ر.س)" required><input type="number" min="0" step="0.01" data-nav value={form.purchaseCost || ''} onChange={(e) => setF({ purchaseCost: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} required /></Field>
            <Field label="قيمة الخردة (ر.س)"><input type="number" min="0" step="0.01" data-nav value={form.salvageValue || ''} onChange={(e) => setF({ salvageValue: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="العمر الإنتاجي (سنوات)"><input type="number" min="1" data-nav value={form.usefulLifeYears || ''} onChange={(e) => setF({ usefulLifeYears: parseFloat(e.target.value) || 5 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="المورد"><select value={form.supplierId} onChange={(e) => setF({ supplierId: e.target.value })} className={inputCls}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          </div>
          <Field label="الوصف"><textarea value={form.description} onChange={(e) => setF({ description: e.target.value })} rows={2} className={inputCls} /></Field>
          {form.purchaseCost > 0 && form.usefulLifeYears > 0 && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[10px] font-bold text-emerald-800">
              الاهتلاك الشهري المقدر: {fmt((Math.max(0, form.purchaseCost - form.salvageValue) / (form.usefulLifeYears * 12)), 2)} ر.س
            </div>
          )}
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">{editingId ? 'حفظ التعديلات' : 'إضافة الأصل'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};