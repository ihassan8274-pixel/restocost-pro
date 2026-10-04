import React, { useCallback, useEffect, useState } from 'react';
import { Building2, ExternalLink, PlayCircle, RefreshCw, CheckCircle2, Clock, Plus, Pencil, Trash2, Network, Landmark } from 'lucide-react';
import { Card, PageHeader, Btn, Field, inputCls, Modal, TabBar } from '../ui';
import { useApp } from '../../context/AppContext';

interface CompanyEntry {
  name: string;
  dir: string;
  port: number | null;
  running: boolean;
  isCurrent: boolean;
}

interface CompanyForm {
  code: string;
  nameAr: string;
  nameEn: string;
  address: string;
  phone: string;
  vatNumber: string;
  notes: string;
  isActive: boolean;
}

const emptyForm: CompanyForm = { code: '', nameAr: '', nameEn: '', address: '', phone: '', vatNumber: '', notes: '', isActive: true };

export const CompaniesView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { companies, addCompany, updateCompany, deleteCompany, branches } = useApp();
  const [tab, setTab] = useState('group');

  // ---------- نسخ مستقلة ----------
  const [instances, setInstances] = useState<CompanyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/companies', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = await res.json();
      if (json && json.ok) setInstances(json.companies || []);
      else setErr(json?.error || 'تعذر تحميل قائمة الشركات');
    } catch {
      setErr('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async (c: CompanyEntry) => {
    setStarting(c.dir);
    setErr('');
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/start-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ dir: c.dir }),
      });
      const json = await res.json();
      if (!json.ok) { setErr(json?.error || 'فشل التشغيل'); setStarting(null); return; }
      const port = json.port || c.port;
      setTimeout(() => { window.open(`http://localhost:${port}`, '_blank'); setStarting(null); }, 600);
    } catch {
      setErr('تعذر تشغيل نسخة الشركة');
      setStarting(null);
    }
  };

  // ---------- شركات المجموعة ----------
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [msg, setMsg] = useState('');

  const openCreate = () => { setEditingId(''); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: (typeof companies)[number]) => {
    setEditingId(c.id);
    setForm({ code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, address: c.address || '', phone: c.phone || '', vatNumber: c.vatNumber || '', notes: c.notes || '', isActive: c.isActive });
    setShowModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr.trim()) return;
    const payload = { nameAr: form.nameAr, nameEn: form.nameEn, address: form.address, phone: form.phone, vatNumber: form.vatNumber, notes: form.notes, isActive: form.isActive };
    if (editingId) {
      updateCompany(editingId, payload);
      setMsg('تم تحديث بيانات الشركة');
    } else {
      addCompany(payload);
      setMsg('تم إضافة الشركة بنجاح');
    }
    setTimeout(() => setMsg(''), 3000);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الشركات والمجموعة" subtitle="إدارة شركات المجموعة (فروع ← شركة) + التقرير الموحد + فتح النسخ المستقلة لكل شركة" icon={<Building2 className="w-6 h-6 text-indigo-300" />}
        actions={tab === 'instances' ? <Btn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Btn> : <Btn onClick={openCreate}><Plus className="w-4 h-4" /> شركة جديدة</Btn>} />

      <TabBar tabs={[
        { id: 'group', label: 'شركات المجموعة والدمج' },
        { id: 'instances', label: 'النسخ المستقلة لكل شركة' },
      ]} active={tab} onChange={setTab} />

      {tab === 'group' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الشركات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{companies.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs"><span className="text-indigo-600 text-[11px] block">الفروع المرتبطة</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{branches.filter((b) => b.companyId).length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">فروع غير مرتبطة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{branches.filter((b) => !b.companyId).length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">شركات نشطة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{companies.filter((c) => c.isActive).length}</strong></div>
          </div>

          {msg && <div className="rounded-xl p-3 font-bold text-xs border bg-emerald-50 border-emerald-200 text-emerald-700">{msg}</div>}
          {err && <div className="rounded-xl p-3 font-bold border bg-rose-50 border-rose-200 text-rose-700 text-xs">{err}</div>}

          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => onNavigate?.('detailed_reports')}><Landmark className="w-4 h-4" /> فتح التقرير الموحد (الدمج المالي)</Btn>
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5"><Network className="w-4 h-4 text-indigo-400" /> اربط كل فرع بشركته من شاشة "إدارة الفروع" ثم شاهد الدمج الموحد في "التقارير التفصيلية".</span>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">الاسم بالإنجليزية</th><th className="p-3">العنوان</th><th className="p-3">الرقم الضريبي</th><th className="p-3">الفروع التابعة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => {
                    const linked = branches.filter((b) => b.companyId === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="tnum text-left p-3 font-extrabold text-indigo-700">{c.code}</td>
                        <td className="p-3 font-bold text-slate-900">{c.nameAr}</td>
                        <td className="p-3 text-slate-500">{c.nameEn || '—'}</td>
                        <td className="p-3 text-slate-500">{c.address || '—'}</td>
                        <td className="tnum text-left p-3">{c.vatNumber || '—'}</td>
                        <td className="p-3">
                          {linked.length ? <span className="font-bold text-indigo-700">{linked.map((b) => b.nameAr).join('، ')}</span> : <span className="text-slate-400">لا يوجد</span>}
                        </td>
                        <td className="p-3">{c.isActive ? <span className="text-emerald-600 font-bold">نشطة</span> : <span className="text-slate-400 font-bold">موقوفة</span>}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteCompany(c.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title={linked.length ? 'لا يمكن حذف شركة مرتبطة بفروع' : 'حذف'}><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {companies.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد شركات — أضف شركات المجموعة واربط الفروع بها</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'instances' && (
        <div className="space-y-4">
          {err && <div className="rounded-xl p-3 font-bold border bg-rose-50 border-rose-200 text-rose-700 text-xs">{err}</div>}
          {loading && <div className="text-center py-12 text-slate-500 font-bold text-sm">جارِ تحميل قائمة الشركات...</div>}
          {!loading && instances.length === 0 && (
            <Card className="p-8 text-center">
              <p className="font-bold text-slate-600 text-sm">لا توجد نسخ شركات أخرى بجانب هذا النظام.</p>
              <p className="text-xs text-slate-500 mt-2">لإنشاء شركة جديدة استخدم اختصار "RestoCost New Company" على سطح المكتب أو اكتب: نسخ المجلد الحالي وحذف server\data من النسخة.</p>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map((c) => (
              <Card key={c.dir} className={`p-5 border-2 ${c.isCurrent ? 'border-indigo-300' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.running ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Building2 className={`w-5 h-5 ${c.running ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-900 text-sm">{c.name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{c.dir}</p>
                    </div>
                  </div>
                  {c.isCurrent && <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">هذه النسخة الحالية</span>}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] font-bold">
                  {c.running ? (
                    <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> تعمل الآن{c.port ? ` على المنفذ ${c.port}` : ''}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500"><Clock className="w-3.5 h-3.5" /> غير مشغلة{c.port ? ` (آخر منفذ ${c.port})` : ''}</span>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Btn onClick={() => open(c)} disabled={starting !== null && starting !== c.dir} className="flex-1 !py-2 text-xs">
                    {starting === c.dir ? 'جارِ التشغيل...' : c.running ? 'فتح' : 'تشغيل وفتح'}
                    {c.running ? <ExternalLink className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  </Btn>
                  {c.port && (
                    <Btn tone="ghost" className="!py-2 text-xs" onClick={() => window.open(`http://localhost:${c.port}`, '_blank')}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Btn>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل شركة' : 'إضافة شركة إلى المجموعة'} wide>
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
            <Field label="كود الشركة" hint={editingId ? 'الكود غير قابل للتعديل' : 'يُولَّد تلقائياً عند الإضافة'}>
              <input value={form.code || (editingId ? form.code : 'CO-XXX')} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled className={inputCls} dir="ltr" />
            </Field>
            <Field label="الرقم الضريبي (VAT)">
              <input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} className={inputCls} dir="ltr" />
            </Field>
          </div>
          <Field label="العنوان">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الهاتف">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} dir="ltr" />
            </Field>
            <Field label="ملاحظات">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-700 text-xs">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> شركة نشطة (تظهر في ربط الفروع والدمج الموحد)
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editingId ? 'حفظ التعديلات' : 'إضافة الشركة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};