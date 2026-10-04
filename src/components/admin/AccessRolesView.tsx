import React, { useMemo, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Save, Users, KeyRound, AlertTriangle, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { SCREENS } from '../../navigation';
import { AccessRole, ROLE_LABELS, UserRole } from '../../types';

const ACTIONS: { key: 'view' | 'add' | 'edit' | 'del'; label: string }[] = [
  { key: 'view', label: 'عرض' },
  { key: 'add', label: 'إضافة' },
  { key: 'edit', label: 'تعديل' },
  { key: 'del', label: 'حذف' },
];

const emptyPerms = (): Record<string, { view: boolean; add: boolean; edit: boolean; del: boolean }> => ({});

const newRole = (): AccessRole => ({
  id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  nameAr: 'دور جديد',
  baseRole: 'branch_manager',
  inheritBase: true,
  screenPerms: emptyPerms(),
});

export const AccessRolesView: React.FC = () => {
  const { accessRoles, upsertAccessRole, removeAccessRole, users, updateUser, currentUser, showToast } = useApp();
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<AccessRole | null>(null);

  const role = draft ?? accessRoles.find((r) => r.id === selectedId) ?? null;
  const grouped = useMemo(() => {
    const m = new Map<string, typeof SCREENS>();
    SCREENS.forEach((s) => {
      if (!m.has(s.section)) m.set(s.section, []);
      m.get(s.section)!.push(s);
    });
    return Array.from(m.entries());
  }, []);

  if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'executive') {
    return (
      <div className="space-y-4">
        <PageHeader title="نموذج صلاحيات الشاشات" icon={<KeyRound className="w-6 h-6 text-rose-600" />} />
        <Card className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="font-extrabold text-slate-700">هذه الشاشة متاحة لمسؤول النظام فقط</p>
        </Card>
      </div>
    );
  }

  const startEdit = (r: AccessRole) => { setSelectedId(r.id); setDraft({ ...r, screenPerms: { ...r.screenPerms } }); };
  const startNew = () => { const r = newRole(); setDraft(r); setSelectedId(''); };

  const permOf = (screenId: string) =>
    (role?.screenPerms[screenId] ?? { view: false, add: false, edit: false, del: false });

  const toggle = (screenId: string, key: 'view' | 'add' | 'edit' | 'del') => {
    if (!role) return;
    const cur = permOf(screenId);
    const next = { ...cur, [key]: !cur[key] };
    if ((key === 'add' || key === 'edit' || key === 'del') && next[key]) next.view = true;
    if (key === 'view' && !next.view) { next.add = false; next.edit = false; next.del = false; }
    setDraft({ ...role, screenPerms: { ...role.screenPerms, [screenId]: next } });
  };

  const setAllRow = (screenId: string, val: boolean) => {
    if (!role) return;
    setDraft({ ...role, screenPerms: { ...role.screenPerms, [screenId]: { view: val, add: val, edit: val, del: val } } });
  };

  const saveRole = () => {
    if (!draft || !draft.nameAr.trim()) { showToast('اكتب اسم الدور'); return; }
    upsertAccessRole(draft);
    setSelectedId(draft.id);
    setDraft(null);
    showToast('تم حفظ الدور والصلاحيات');
  };

  const assignedUsers = (roleId: string) => users.filter((u) => u.roleId === roleId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="نموذج صلاحيات الشاشات (متقدم)"
        subtitle="حدد لكل دور الشاشات المسموحة ومستوى الوصول عليها: عرض / إضافة / تعديل / حذف — ثم أسند الدور للمستخدمين"
        icon={<ShieldCheck className="w-6 h-6 text-indigo-600" />}
        actions={<Btn tone="primary" onClick={startNew}><Plus className="w-4 h-4" /> دور جديد</Btn>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-2 lg:col-span-1">
          <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-indigo-500" /> الأدوار المخصصة</h3>
          {!accessRoles.length && !draft && <p className="text-xs text-slate-400 py-4 text-center">لا توجد أدوار مخصصة بعد — أنشئ دوراً وحدد صلاحياته</p>}
          {accessRoles.map((r) => (
            <div key={r.id} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${selectedId === r.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'} hover:border-indigo-200 transition-colors`}>
              <button className="text-right grow" onClick={() => startEdit(r)}>
                <span className="block font-extrabold text-slate-800 text-xs">{r.nameAr}</span>
                <span className="block text-[10px] text-slate-500">أساس: {ROLE_LABELS[r.baseRole]}{r.inheritBase ? ' · وراثة المشاهدة' : ''} · {assignedUsers(r.id).length} مستخدم</span>
              </button>
              <button
                onClick={() => { if (window.confirm(`حذف دور "${r.nameAr}"؟ سيعود المستخدمون المسندون إليه لدورهم الأساسي.`)) { removeAccessRole(r.id); if (selectedId === r.id) { setSelectedId(''); setDraft(null); } showToast('تم حذف الدور'); } }}
                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600" title="حذف الدور"
              ><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {draft && <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-50 font-extrabold text-emerald-700 text-xs flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> مسودة غير محفوظة: {draft.nameAr}</div>}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {role && (
            <>
              <Card className="p-4 space-y-3">
                <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" /> إعدادات الدور</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="اسم الدور" required>
                    <input value={role.nameAr} onChange={(e) => setDraft({ ...role, nameAr: e.target.value })} className={inputCls} placeholder="مثال: كاشير فرع النخيل" />
                  </Field>
                  <Field label="الدور الأساسي (للوراثة)">
                    <select value={role.baseRole} onChange={(e) => setDraft({ ...role, baseRole: e.target.value as UserRole })} className={inputCls}>
                      {(Object.keys(ROLE_LABELS) as UserRole[]).filter((k) => k !== 'admin').map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
                    </select>
                  </Field>
                  <Field label="خيارات">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none mt-1">
                      <input type="checkbox" checked={role.inheritBase} onChange={(e) => setDraft({ ...role, inheritBase: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                      وراثة مشاهدة شاشات الدور الأساسي
                    </label>
                  </Field>
                </div>
                <div className="flex gap-2 justify-end">
                  <Btn tone="primary" onClick={saveRole}><Save className="w-4 h-4" /> حفظ الدور والصلاحيات</Btn>
                </div>
              </Card>

              <Card className="overflow-x-auto">
                <div className="p-4 pb-2 font-extrabold text-slate-700 text-sm">مصفوفة صلاحيات الشاشات — {role.nameAr}</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="p-2.5 text-right font-bold">الشاشة</th>
                      {ACTIONS.map((a) => <th key={a.key} className="p-2.5 text-center font-bold w-16">{a.label}</th>)}
                      <th className="p-2.5 text-center font-bold w-20">كامل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(([section, screens]) => (
                      <React.Fragment key={section}>
                        <tr><td colSpan={6} className="p-2 bg-slate-100/70 font-extrabold text-[11px] text-slate-500">{section}</td></tr>
                        {screens.map((s) => {
                          const p = permOf(s.id);
                          return (
                            <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50 ${p.view ? 'bg-white' : 'opacity-60'}`}>
                              <td className="p-2.5 font-bold text-slate-700">{s.label}</td>
                              {ACTIONS.map((a) => (
                                <td key={a.key} className="p-2.5 text-center">
                                  <input type="checkbox" checked={!!p[a.key]} onChange={() => toggle(s.id, a.key)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                                </td>
                              ))}
                              <td className="p-2.5 text-center">
                                <button onClick={() => setAllRow(s.id, !(p.view && p.add && p.edit && p.del))} className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                                  {p.view && p.add && p.edit && p.del ? 'إلغاء' : 'تحديد'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" /> إسناد الدور للمستخدمين</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {users.filter((u) => u.role !== 'admin').map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-white">
                      <div className="min-w-0">
                        <span className="block font-extrabold text-slate-800 text-xs truncate">{u.name}</span>
                        <span className="block text-[10px] text-slate-500">{ROLE_LABELS[u.role]} · {u.isActive ? 'نشط' : 'معطل'}</span>
                      </div>
                      <select
                        value={u.roleId || ''}
                        onChange={async (e) => {
                          const res = await updateUser(u.id, { roleId: e.target.value || undefined });
                          if (!res.ok) { alert(res.error || 'تعذر تحديث الدور'); return; }
                          showToast(e.target.value ? `أُسند دور "${role?.nameAr}" إلى ${u.name}` : `أُلغي الدور المخصص عن ${u.name}`);
                        }}
                        className={`${inputCls} max-w-[190px]`}
                      >
                        <option value="">— بدون دور مخصص —</option>
                        {accessRoles.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
          {!role && (
            <Card className="p-8 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-500 text-sm">اختر دوراً من القائمة أو أنشئ دوراً جديداً لتحديد مصفوفة الصلاحيات</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
