import React, { useState } from 'react';
import { ShieldCheck, Plus, Power, Trash2, Pencil, LogOut, UserCheck, Hourglass } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ROLE_LABELS, UserRole } from '../../types';

interface PendingUser {
  id: string;
  name: string;
  email: string;
  requestedRole?: UserRole;
  requestedBranchId?: string;
  createdAt?: string;
}

export const UserManagementView: React.FC = () => {
  const { users, branches, accessRoles, register, updateUser, deleteUser, revokeSessions, currentUser, can, logAudit } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'branch_manager' as UserRole, branchId: 'all', roleId: '' });

  const [approveTarget, setApproveTarget] = useState<PendingUser | null>(null);
  const [approveForm, setApproveForm] = useState({ role: 'branch_manager' as UserRole, branchId: 'all', roleId: '' });

  const pending = users.filter((u) => u.needsActivation);
  const activeUsers = users.filter((u) => !u.needsActivation);

  const openCreate = () => { setEditId(null); setForm({ name: '', email: '', password: '', role: 'branch_manager', branchId: 'all', roleId: '' }); setShowModal(true); };

  const openApprove = (u: PendingUser) => {
    setApproveTarget(u);
    setApproveForm({
      role: (u.requestedRole && ROLE_LABELS[u.requestedRole]) ? u.requestedRole : 'branch_manager',
      branchId: u.requestedBranchId && u.requestedBranchId !== 'all' && branches.some((b) => b.id === u.requestedBranchId) ? u.requestedBranchId : 'all',
      roleId: '',
    });
  };

  const submitApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;
    const res = await updateUser(approveTarget.id, { isActive: true, role: approveForm.role, branchId: approveForm.branchId, roleId: approveForm.roleId || undefined });
    if (!res.ok) { alert(res.error || 'تعذر تفعيل المستخدم'); return; }
    logAudit('تفعيل طلب انضمام', 'المستخدمون', approveTarget.email);
    setApproveTarget(null);
  };

  const rejectPending = async (u: PendingUser) => {
    if (!confirm(`رفض طلب انضمام ${u.name} وحذف بياناته؟`)) return;
    const res = await deleteUser(u.id);
    if (!res.ok) { alert(res.error || 'تعذر حذف الطلب'); return; }
    logAudit('رفض طلب انضمام', 'المستخدمون', u.email);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      const res = await updateUser(editId, { name: form.name, role: form.role, branchId: form.branchId, roleId: form.roleId || undefined });
      if (!res.ok) { alert(res.error || 'تعذر تحديث المستخدم'); return; }
      logAudit('تحديث مستخدم', 'المستخدمون', form.email);
    } else {
      const res = await register(form.name, form.email, form.password, form.role, form.branchId);
      if (!res.ok) { alert(res.error || 'تعذر إنشاء المستخدم'); return; }
      logAudit('إنشاء مستخدم', 'المستخدمون', form.email);
    }
    setShowModal(false);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const res = await updateUser(id, { isActive: !isActive });
    if (!res.ok) { alert(res.error || 'تعذر تغيير الحالة'); return; }
    logAudit(isActive ? 'تعطيل مستخدم' : 'تفعيل مستخدم', 'المستخدمون');
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm('متأكد من حذف هذا المستخدم نهائياً؟')) return;
    const res = await deleteUser(id);
    if (!res.ok) { alert(res.error || 'تعذر حذف المستخدم'); return; }
    logAudit('حذف مستخدم', 'المستخدمون', email);
  };

  const handleRevokeSessions = async (id: string, email: string) => {
    if (!confirm('سيتم إلغاء جميع جلسات دخول هذا المستخدم فوراً، وسيتوجب عليه تسجيل الدخول من جديد. متابعة؟')) return;
    const res = await revokeSessions(id);
    if (!res.ok) { alert(res.error || 'تعذر إلغاء الجلسات'); return; }
    logAudit('إلغاء جلسات', 'المستخدمون', email);
  };

  const getRoleName = (roleId?: string) => {
    if (!roleId) return null;
    return accessRoles.find((r) => r.id === roleId)?.nameAr || null;
  };

  const branchName = (bid: string) => bid === 'all' ? 'جميع الفروع' : branches.find((b) => b.id === bid)?.nameAr || bid;

  return (
    <div className="space-y-6">
      <PageHeader title="إدارة المستخدمين والصلاحيات" subtitle="تعيين الأدوار والشاشات المسموح بها لكل مستخدم — واعتماد طلبات الانضمام" icon={<ShieldCheck className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar filename="المستخدمون" sheets={[
            {
              name: 'المستخدمون',
              header: ['الاسم', 'البريد', 'الدور', 'صلاحية الشاشات', 'الفرع', 'الحالة', 'آخر دخول'],
              rows: activeUsers.map((u) => [u.name, u.email, ROLE_LABELS[u.role], getRoleName(u.roleId) || '—', branchName(u.branchId), u.isActive ? 'نشط' : 'معطل', u.lastLogin || '-']),
            },
            {
              name: 'طلبات انضمام',
              header: ['الاسم', 'البريد', 'الدور المطلوب', 'الفرع المطلوب', 'تاريخ الطلب'],
              rows: pending.map((u) => [u.name, u.email, (u.requestedRole && ROLE_LABELS[u.requestedRole]) || '—', u.requestedBranchId ? branchName(u.requestedBranchId) : '—', u.createdAt ? new Date(u.createdAt).toLocaleString('ar-SA-u-nu-latn') : '-']),
            },
          ]} />
          {can('manage_users') && <Btn onClick={openCreate}><Plus className="w-4 h-4" /> مستخدم جديد</Btn>}
        </>} />

      {pending.length > 0 && can('manage_users') && (
        <Card className="border-amber-300 bg-gradient-to-l from-amber-50 to-white p-4">
          <div className="flex items-center gap-2 text-amber-800 font-black mb-3">
            <Hourglass className="w-5 h-5" />
            طلبات انضمام بانتظار التفعيل ({pending.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-amber-700 font-bold border-b border-amber-200">
                <tr><th className="p-2">الاسم</th><th className="p-2">البريد</th><th className="p-2">الدور المطلوب</th><th className="p-2">الفرع المطلوب</th><th className="p-2">تاريخ الطلب</th><th className="p-2">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pending.map((u) => (
                  <tr key={u.id} className="hover:bg-amber-50/50">
                    <td className="p-2 font-bold text-stone-900">{u.name}</td>
                    <td className="p-2 font-mono text-stone-600" dir="ltr">{u.email}</td>
                    <td className="p-2">{(u.requestedRole && ROLE_LABELS[u.requestedRole]) || '—'}</td>
                    <td className="p-2">{u.requestedBranchId ? branchName(u.requestedBranchId) : '—'}</td>
                    <td className="p-2 text-stone-500">{u.createdAt ? new Date(u.createdAt).toLocaleString('ar-SA-u-nu-latn') : '-'}</td>
                    <td className="p-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => openApprove(u)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700">
                          <UserCheck className="w-3.5 h-3.5" /> تفعيل وتحديد الدور
                        </button>
                        <button onClick={() => rejectPending(u)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض الطلب"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-amber-600 mt-2">عند التفعيل يُحدَّد الدور الأساسي ودور صلاحيات الشاشات والفرع — ولا يمكن للمستخدم الدخول قبل ذلك.</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
              <tr><th className="p-3">الاسم</th><th className="p-3">البريد</th><th className="p-3">الدور</th><th className="p-3">صلاحية الشاشات</th><th className="p-3">الفرع</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                    {u.id === currentUser?.id && <span className="text-[9px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">أنت</span>}
                    {u.name}
                  </td>
                  <td className="p-3 font-mono text-slate-600" dir="ltr">{u.email}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{ROLE_LABELS[u.role]}</span></td>
                  <td className="p-3">
                    {getRoleName(u.roleId)
                      ? <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">{getRoleName(u.roleId)}</span>
                      : <span className="text-[10px] text-slate-400">—</span>}
                  </td>
                  <td className="p-3 text-slate-600">{branchName(u.branchId)}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{u.isActive ? 'نشط' : 'معطل'}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {can('manage_users') && <>
                        <button onClick={() => { setEditId(u.id); setForm({ name: u.name, email: u.email, password: '', role: u.role, branchId: u.branchId, roleId: u.roleId || '' }); setShowModal(true); }} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => toggleActive(u.id, u.isActive)} className={`p-1.5 rounded-lg ${u.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}><Power className="w-4 h-4" /></button>
                        <button onClick={() => handleRevokeSessions(u.id, u.email)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="إلغاء جلسات الدخول"><LogOut className="w-4 h-4" /></button>
                        {u.id !== currentUser?.id && <button onClick={() => handleDelete(u.id, u.email)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'تعديل مستخدم' : 'مستخدم جديد'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="الاسم" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></Field>
          <Field label="البريد الإلكتروني" required><input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} required disabled={!!editId} /></Field>
          {!editId && <Field label="كلمة المرور" required><input dir="ltr" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} required minLength={6} /></Field>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="الدور الأساسي">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className={inputCls}>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="الفرع">
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>
                <option value="all">جميع الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <Field label="دور صلاحيات الشاشات">
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className={inputCls}>
              <option value="">— بدون (صلاحيات الدور الأساسي) —</option>
              {accessRoles.map((r) => <option key={r.id} value={r.id}>{r.nameAr} ({ROLE_LABELS[r.baseRole]})</option>)}
            </select>
          </Field>
          <p className="text-[10px] text-slate-400">دور الصلاحيات يحدد أي شاشات يمكن للمستخدم الوصول إليها وما يمكنه فعله فيها (عرض/إضافة/تعديل/حذف).</p>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">{editId ? 'حفظ' : 'إنشاء'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title={`تفعيل طلب انضمام: ${approveTarget?.name || ''}`}>
        <form onSubmit={submitApprove} className="space-y-3 text-xs">
          <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <Hourglass className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            حدد الدور والصلاحيات ثم اعتمد الطلب — سيتمكن المستخدم من تسجيل الدخول فوراً بعدها.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الدور الأساسي">
              <select value={approveForm.role} onChange={(e) => setApproveForm({ ...approveForm, role: e.target.value as UserRole })} className={inputCls}>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="الفرع">
              <select value={approveForm.branchId} onChange={(e) => setApproveForm({ ...approveForm, branchId: e.target.value })} className={inputCls}>
                <option value="all">جميع الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <Field label="دور صلاحيات الشاشات">
            <select value={approveForm.roleId} onChange={(e) => setApproveForm({ ...approveForm, roleId: e.target.value })} className={inputCls}>
              <option value="">— بدون (صلاحيات الدور الأساسي) —</option>
              {accessRoles.map((r) => <option key={r.id} value={r.id}>{r.nameAr} ({ROLE_LABELS[r.baseRole]})</option>)}
            </select>
          </Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setApproveTarget(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium"><UserCheck className="w-4 h-4 inline-block" /> تفعيل الحساب</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};