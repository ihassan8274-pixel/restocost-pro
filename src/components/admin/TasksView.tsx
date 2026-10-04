import React, { useMemo, useState } from 'react';
import { ListChecks, Plus, CheckCircle2, Undo2, XCircle, Trash2, CalendarClock, User, Search, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import type { TaskType, TaskPriority, TaskStatus } from '../../types';

const TYPE_LABELS: Record<TaskType, string> = {
  approval: 'اعتماد',
  stock_count: 'جرد',
  grn_verify: 'تدقيق GRN',
  purchase_request: 'طلب شراء',
  review: 'مراجعة',
  general: 'مهمة عامة',
};

const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  critical: { label: 'عاجلة جداً', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  high: { label: 'عالية', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'متوسطة', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  low: { label: 'منخفضة', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'مفتوحة', done: 'مُنجزة', cancelled: 'ملغاة',
};

export const TasksView: React.FC = () => {
  const { tasks, users, addTask, completeTask, reopenTask, cancelTask, deleteTask, currentUser, branches, visibleBranchIds } = useApp();
  const [view, setView] = useState<'mine' | 'all'>('mine');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open');
  const [typeFilter, setTypeFilter] = useState<'all' | TaskType>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const userName = (id: string) => users.find((u) => u.id === id)?.name || id;
  const branchName = (id?: string) => (id ? (id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b: any) => b.id === id)?.nameAr || id) : '—');

  const visibleBranches = branches.filter((b: any) => visibleBranchIds.includes(b.id));

  const myName = currentUser?.name || '';
  const myId = currentUser?.id || '';

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (view === 'mine' && !t.assigneeIds.includes(myName) && !t.assigneeIds.includes(myId)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (search && !(t.title + ' ' + (t.description || '')).includes(search)) return false;
      return true;
    }).sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || (b.priority === 'critical' ? 1 : 0) - (a.priority === 'critical' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  }, [tasks, view, statusFilter, typeFilter, search, myName, myId]);

  const openCount = tasks.filter((t) => t.status === 'open' && (t.assigneeIds.includes(myName) || t.assigneeIds.includes(myId))).length;
  const overdueCount = tasks.filter((t) => t.status === 'open' && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && (t.assigneeIds.includes(myName) || t.assigneeIds.includes(myId))).length;

  const [form, setForm] = useState({ title: '', description: '', type: 'approval' as TaskType, branchId: '', assigneeIds: [] as string[], dueDate: '', priority: 'medium' as TaskPriority, tab: '' });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    addTask({ ...form, title: form.title.trim(), branchId: form.branchId || undefined, dueDate: form.dueDate || undefined });
    setShowModal(false);
    setForm({ title: '', description: '', type: 'approval', branchId: '', assigneeIds: [], dueDate: '', priority: 'medium', tab: '' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المهام والتكليفات" subtitle="تعيين مهام (اعتماد، جرد، تدقيق) مع إشعارات للمكلفين ولوحة متابعة الحالة" icon={<ListChecks className="w-6 h-6 text-indigo-600" />}
        actions={
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> مهمة جديدة</Btn>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مهماتي المفتوحة</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{openCount}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متأخرة</span><strong className="text-lg font-extrabold text-rose-600 block mt-1">{overdueCount}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المهام</span><strong className="text-lg font-extrabold text-indigo-700 block mt-1">{tasks.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مُنجزة</span><strong className="text-lg font-extrabold text-emerald-600 block mt-1">{tasks.filter((t) => t.status === 'done').length}</strong></div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([['mine', 'مهامي'], ['all', 'كل المهام']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${view === k ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')} className={inputCls + ' !w-36'}>
            <option value="all">كل الحالات</option>
            <option value="open">مفتوحة</option>
            <option value="done">مُنجزة</option>
            <option value="cancelled">ملغاة</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | TaskType)} className={inputCls + ' !w-36'}>
            <option value="all">كل الأنواع</option>
            {(Object.keys(TYPE_LABELS) as TaskType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-64'} placeholder="بحث في المهام..." />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 font-bold text-sm">لا توجد مهام مطابقة — أوجد مهمة جديدة لبدء التكليف</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className={`p-4 ${t.status === 'open' && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) ? 'border-rose-300' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${PRIORITY_META[t.priority].cls}`}>{PRIORITY_META[t.priority].label}</span>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{TYPE_LABELS[t.type]}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'done' ? 'bg-emerald-100 text-emerald-700' : t.status === 'cancelled' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{STATUS_LABELS[t.status]}</span>
                  </div>
                  <p className={`font-bold text-xs ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.title}</p>
                  {t.description && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{t.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><User className="w-3 h-3 text-indigo-500" /> {t.assigneeIds.map(userName).join('، ') || 'غير محدد'}</span>
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-slate-400" /> {branchName(t.branchId)}</span>
                    {t.dueDate && <span className={`flex items-center gap-1 ${t.status === 'open' && t.dueDate < new Date().toISOString().slice(0, 10) ? 'text-rose-600' : ''}`}><CalendarClock className="w-3 h-3" /> {t.dueDate}</span>}
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400 font-bold">أنشأها: {userName(t.assignedBy)} — {new Date(t.createdAt).toLocaleString('ar-SA-u-nu-latn')}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {t.status === 'open' && <button onClick={() => completeTask(t.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="إنجاز"><CheckCircle2 className="w-4 h-4" /></button>}
                  {t.status === 'done' && <button onClick={() => reopenTask(t.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="إعادة فتح"><Undo2 className="w-4 h-4" /></button>}
                  {t.status === 'open' && <button onClick={() => cancelTask(t.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>}
                  <button onClick={() => deleteTask(t.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="مهمة جديدة">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="عنوان المهمة" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} required placeholder="مثال: اعتماد أمر الشراء PO-1042" /></Field>
          <Field label="الوصف"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="النوع">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })} className={inputCls}>
                {(Object.keys(TYPE_LABELS) as TaskType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="الأولوية">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className={inputCls}>
                <option value="critical">عاجلة جداً</option>
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">منخفضة</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع">
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>
                <option value="">— بدون فرع —</option>
                {visibleBranches.map((b: any) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="الاستحقاق">
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="المكلفون" required hint="المرشحون سيظهر لهم إشعار في مركز التنبيهات">
            <div className="max-h-40 overflow-auto space-y-1">
              {users.filter((u) => u.isActive).map((u) => (
                <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={form.assigneeIds.includes(u.id)} onChange={(e) => {
                    const ids = e.target.checked ? [...form.assigneeIds, u.id] : form.assigneeIds.filter((id) => id !== u.id);
                    setForm({ ...form, assigneeIds: ids });
                  }} className="w-4 h-4 accent-indigo-600" />
                  <span>{u.name}</span>
                  <span className="text-[10px] text-slate-400 font-bold mr-auto">{u.role}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" disabled={form.assigneeIds.length === 0} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium disabled:opacity-40">أسند المهمة</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};