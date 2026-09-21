import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Pencil, Trash2, Receipt, TrendingDown, CheckCircle2, Clock, AlertTriangle, Gauge, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, SectionHeader, StatCard, PageHeader, Btn, Modal, Field, inputCls, TabBar, StatusPill, EmptyState } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS, PAYMENT_STATUS_LABELS, RECURRENCE_LABELS, fmt, fmtMoney, monthLabel, downloadCSV, navOnEnter } from '../../utils/helpers';
import { OperatingExpense, OperatingExpenseCategory, ExpensePaymentStatus, ExpenseRecurrence, ExpenseBudget } from '../../types';

const EMPTY = {
  branchId: '', category: 'rent' as OperatingExpenseCategory, description: '', amount: 0, dueDate: '',
  paymentStatus: 'pending' as ExpensePaymentStatus, paymentMethod: '', recurrence: 'monthly' as ExpenseRecurrence,
  vendor: '', invoiceNumber: '', notes: '', createdBy: '',
};

export const OperatingExpensesView: React.FC = () => {
  const { operatingExpenses, expenseBudgets, branches, plSummaries, visibleBranchIds, getBranchName, addOperatingExpense, updateOperatingExpense, deleteOperatingExpense, setExpenseBudget, can } = useApp();
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('2026-08');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [tab, setTab] = useState<'list' | 'budget' | 'variant'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<OperatingExpense | null>(null);
  const [form, setForm] = useState(EMPTY);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchLabel = (id: string) => (id === 'central' ? 'مركزية (مشتركة)' : getBranchName(id));

  const scope = operatingExpenses.filter((e) => {
    const mb = filterBranch === 'all' || e.branchId === filterBranch;
    const mm = e.dueDate.startsWith(filterMonth);
    const mc = filterCategory === 'all' || e.category === filterCategory;
    const ms = filterStatus === 'all' || e.paymentStatus === filterStatus;
    return mb && mm && mc && ms;
  });

  const monthScope = operatingExpenses.filter((e) => (filterBranch === 'all' || e.branchId === filterBranch) && e.dueDate.startsWith(filterMonth));
  const total = monthScope.reduce((s, e) => s + e.amount, 0);
  const paid = monthScope.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
  const pending = monthScope.filter((e) => e.paymentStatus === 'pending').reduce((s, e) => s + e.amount, 0);
  const overdue = monthScope.filter((e) => e.paymentStatus === 'overdue').reduce((s, e) => s + e.amount, 0);

  const scopeSales = plSummaries.filter((p) => filterBranch === 'all' || p.branchId === filterBranch).reduce((s, p) => s + p.totalSales, 0);
  const opexPct = scopeSales ? (total / scopeSales) * 100 : 0;

  const budget = expenseBudgets.find((b) => (filterBranch === 'all' || b.branchId === filterBranch) && b.month === filterMonth);
  const budgetByCat = useMemo(() => { const m = new Map<string, number>(); budget?.items.forEach((i) => m.set(i.category, i.budgetedAmount)); return m; }, [budget]);
  const actualByCat = useMemo(() => { const m = new Map<string, number>(); monthScope.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount)); return m; }, [monthScope]);

  const chartData = (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[])
    .filter((c) => (actualByCat.get(c) || 0) > 0 || (budgetByCat.get(c) || 0) > 0)
    .map((c) => ({ name: EXPENSE_CATEGORY_LABELS[c], 'الفعلي': actualByCat.get(c) || 0, 'الموازنة': budgetByCat.get(c) || 0 }));

  const totalBudgeted = Array.from(budgetByCat.values()).reduce((s, v) => s + v, 0);
  const variance = totalBudgeted > 0 ? ((total - totalBudgeted) / totalBudgeted) * 100 : 0;

  // Budget editing state
  const [budgetValues, setBudgetValues] = useState<Record<string, string | number>>({});
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const openBudgetEditor = () => {
    const next: Record<string, string> = {};
    (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).forEach((c) => { next[c] = String(budgetByCat.get(c) || ''); });
    setBudgetValues(next);
    setShowBudgetModal(true);
  };

  const saveBudget = () => {
    const items = (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[])
      .map((c) => ({ category: c, budgetedAmount: parseFloat(String(budgetValues[c])) || 0 }))
      .filter((i) => i.budgetedAmount > 0);
    const branchKey = filterBranch === 'all' ? 'b-01' : filterBranch;
    setExpenseBudget(branchKey, filterMonth, items);
    setShowBudgetModal(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, branchId: filterBranch === 'all' ? visibleBranches[0]?.id || '' : filterBranch, dueDate: `${filterMonth}-15`, createdBy: '' });
    setShowModal(true);
  };

  const openEdit = (exp: OperatingExpense) => {
    setEditing(exp);
    setForm({ branchId: exp.branchId, category: exp.category, description: exp.description, amount: exp.amount, dueDate: exp.dueDate, paymentStatus: exp.paymentStatus, paymentMethod: exp.paymentMethod || '', recurrence: exp.recurrence, vendor: exp.vendor || '', invoiceNumber: exp.invoiceNumber || '', notes: exp.notes || '', createdBy: exp.createdBy });
    setShowModal(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.branchId || !form.description || form.amount <= 0) return;
    if (editing) updateOperatingExpense(editing.id, form);
    else addOperatingExpense(form);
    setShowModal(false);
  };

  const exportCSV = () => {
    downloadCSV(`Operating_Expenses_${filterMonth}.csv`,
      ['الرقم', 'الفرع', 'التصنيف', 'الوصف', 'المبلغ', 'الاستحقاق', 'الحالة', 'التكرار', 'المورد'],
      scope.map((e) => [e.expenseNumber, branchLabel(e.branchId), EXPENSE_CATEGORY_LABELS[e.category], e.description, e.amount, e.dueDate, PAYMENT_STATUS_LABELS[e.paymentStatus], RECURRENCE_LABELS[e.recurrence], e.vendor || '']));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المصاريف التشغيلية والموازنات" subtitle="تسجيل الإيجارات والمنافع والتسويق والعمولات مع موازنة شهرية ومراقبة انحرافات" icon={<Wallet className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename={`المصاريف_${filterMonth}`}
            sheets={[
              { name: 'سجل المصاريف', header: ['الرقم', 'التاريخ', 'الفرع', 'التصنيف', 'الوصف', 'المبلغ', 'الحالة', 'التكرار', 'المورد', 'رقم الفاتورة', 'طريقة الدفع', 'ملاحظات'], rows: scope.map((e) => [e.expenseNumber, e.dueDate, branchLabel(e.branchId), EXPENSE_CATEGORY_LABELS[e.category], e.description, e.amount, PAYMENT_STATUS_LABELS[e.paymentStatus], RECURRENCE_LABELS[e.recurrence], e.vendor || '', e.invoiceNumber || '', e.paymentMethod || '', e.notes || '']) },
              { name: 'الموازنة مقابل الفعلي', header: ['التصنيف', 'الموازنة', 'الفعلي', 'الفرق'], rows: chartData.map((r) => [r.name, r.الموازنة, r.الفعلي, r.الفعلي - r.الموازنة]) },
              { name: 'الملخص', header: ['البند', 'القيمة'], rows: [['إجمالي المصاريف', total], ['المدفوع', paid], ['المستحق', pending], ['المتأخر', overdue], ['الموازنة', totalBudgeted], ['الانحراف %', variance.toFixed(2)]] },
            ]}
          />
          <Btn tone="ghost" onClick={exportCSV}>تصدير CSV</Btn>
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> إضافة مصروف</Btn>
        </>} />

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-56'}>
          <option value="all">جميع الفروع المتاحة</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          <option value="central">مركزية (مشتركة)</option>
        </select>
        <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className={inputCls + ' !w-40'} />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={inputCls + ' !w-44'}>
          <option value="all">جميع التصنيفات</option>
          {(Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls + ' !w-32'}>
          <option value="all">كل الحالات</option>
          <option value="paid">مدفوع</option><option value="pending">مستحق</option><option value="overdue">متأخر</option>
        </select>
        <span className="font-bold text-slate-500">{monthLabel(filterMonth)}</span>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي المصاريف" value={fmtMoney(total)} sub={`${opexPct.toFixed(2)}% من المبيعات`} icon={<Receipt className="w-4 h-4 text-indigo-500" />} />
        <StatCard label="المدفوع" value={fmtMoney(paid)} tone="emerald" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="المستحق" value={fmtMoney(pending)} tone="amber" icon={<Clock className="w-4 h-4 text-amber-500" />} />
        <StatCard label="المتأخر" value={fmtMoney(overdue)} tone="rose" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
      </div>

      <TabBar tabs={[{ id: 'list', label: 'سجل المصاريف' }, { id: 'budget', label: 'الموازنة مقابل الفعلي' }, { id: 'variant', label: 'الانحراف والتنبيهات' }]} active={tab} onChange={(id) => setTab(id as 'list' | 'budget' | 'variant')} />

      {tab === 'budget' ? (
        <Card className="p-5 space-y-4">
          <SectionHeader title={`الموازنة مقابل الفعلي — ${monthLabel(filterMonth)}`} icon={<TrendingDown className="w-5 h-5 text-indigo-600" />}
            extra={<div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-3 py-1 rounded-lg ${variance > 5 ? 'bg-rose-100 text-rose-800' : variance < -3 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>الانحراف: {variance >= 0 ? '+' : ''}{variance.toFixed(2)}%</span>
              <Btn onClick={openBudgetEditor}><Pencil className="w-3.5 h-3.5" /> تعديل الموازنة</Btn>
            </div>} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Bar dataKey="الموازنة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {chartData.map((row) => {
              const diff = row.الفعلي - row.الموازنة;
              return (
                <div key={row.name} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-500">{row.name}</p>
                  <p className="font-mono font-extrabold text-slate-900 text-sm">{fmt(row.الفعلي)} ر.س</p>
                  <p className={`text-[10px] font-bold ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    موازنة {fmt(row.الموازنة)} ({diff >= 0 ? '+' : ''}{fmt(diff)})
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : tab === 'variant' ? (
        <VariantView
          month={filterMonth}
          branchFilter={filterBranch}
          branchLabel={branchLabel}
          operatingExpenses={operatingExpenses}
          expenseBudgets={expenseBudgets}
          getCategoryLabel={(c) => EXPENSE_CATEGORY_LABELS[c as OperatingExpenseCategory] || c}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">سجل المصاريف التشغيلية</h3>
            <span className="text-xs font-bold text-slate-600">الإجمالي الظاهر: {fmtMoney(scope.reduce((s, e) => s + e.amount, 0))}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">الرقم</th><th className="p-3">التاريخ</th><th className="p-3">الفرع</th><th className="p-3">التصنيف</th>
                  <th className="p-3">الوصف</th><th className="p-3">المبلغ</th><th className="p-3">التكرار</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scope.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-500">{e.expenseNumber}</td>
                    <td className="p-3 font-mono text-slate-600">{e.dueDate}</td>
                    <td className="p-3 font-bold text-slate-900">{branchLabel(e.branchId)}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold" style={{ backgroundColor: `${EXPENSE_CATEGORY_COLORS[e.category]}1a`, color: EXPENSE_CATEGORY_COLORS[e.category] }}>
                        {EXPENSE_CATEGORY_LABELS[e.category]}
                      </span>
                    </td>
                    <td className="p-3 max-w-[220px]">
                      <span className="block truncate font-semibold">{e.description}</span>
                      {e.vendor && <span className="text-[10px] text-slate-400 block">{e.vendor}</span>}
                    </td>
                    <td className="p-3 font-mono font-extrabold text-slate-900">{fmt(e.amount)} ر.س</td>
                    <td className="p-3"><span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">{RECURRENCE_LABELS[e.recurrence]}</span></td>
                    <td className="p-3">
                      {can('approve_expenses') ? (
                        <select value={e.paymentStatus} onChange={(ev) => updateOperatingExpense(e.id, { paymentStatus: ev.target.value as ExpensePaymentStatus })} className="px-2 py-1 rounded-lg font-bold text-[11px] border cursor-pointer outline-none bg-white">
                          <option value="paid">مدفوع</option><option value="pending">مستحق</option><option value="overdue">متأخر</option>
                        </select>
                      ) : <StatusPill status={e.paymentStatus} map={PAYMENT_STATUS_LABELS} />}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(e)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                        {can('delete_data') && <button onClick={() => { if (confirm('حذف المصروف؟')) deleteOperatingExpense(e.id); }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {scope.length === 0 && <tr><td colSpan={9} className="p-0"><EmptyState title="لا توجد مصروفات مطابقة" subtitle="غيّر الفلتر أو أضف مصروفاً جديداً" icon={<Wallet className="w-5 h-5" />} compact /></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add/Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل مصروف' : 'إضافة مصروف جديد'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع" required>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls} required>
                <option value="" disabled>اختر</option>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                <option value="central">مركزية (مشتركة) — تُوزَّع على الفروع</option>
              </select>
            </Field>
            <Field label="التصنيف">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as OperatingExpenseCategory })} className={inputCls}>
                {(Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="الوصف" required>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} required placeholder="مثال: فاتورة كهرباء شهر أغسطس" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="المبلغ (ر.س)" required>
              <input type="number" min="0" step="any" data-nav value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} required />
            </Field>
            <Field label="تاريخ الاستحقاق">
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الحالة">
              <select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as ExpensePaymentStatus })} className={inputCls}>
                <option value="paid">مدفوع</option><option value="pending">مستحق</option><option value="overdue">متأخر</option>
              </select>
            </Field>
            <Field label="التكرار">
              <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as ExpenseRecurrence })} className={inputCls}>
                <option value="one_time">مرة واحدة</option><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="المورد"><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className={inputCls} /></Field>
            <Field label="رقم الفاتورة"><input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="طريقة الدفع"><input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium text-xs">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs">{editing ? 'حفظ' : 'إضافة'}</button>
          </div>
        </form>
      </Modal>

      {/* Budget editor modal */}
      <Modal open={showBudgetModal} onClose={() => setShowBudgetModal(false)} title={`موازنة ${monthLabel(filterMonth)}`} wide>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {(Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[]).map((c) => (
            <div key={c}>
              <label className="block font-bold text-slate-600 mb-1 text-[11px]">{EXPENSE_CATEGORY_LABELS[c]}</label>
              <input type="number" min="0" step="any" data-nav value={budgetValues[c] || ''} onChange={(e) => setBudgetValues({ ...budgetValues, [c]: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="0" />
            </div>
          ))}
        </div>
        <div className="pt-3 flex justify-end gap-2">
          <button onClick={() => setShowBudgetModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium text-xs">إلغاء</button>
          <button onClick={saveBudget} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs">حفظ الموازنة</button>
        </div>
      </Modal>
    </div>
  );
};

// ================== الانحراف والتنبيهات ==================
interface VariantViewProps {
  month: string;
  branchFilter: string;
  branchLabel: (id: string) => string;
  operatingExpenses: OperatingExpense[];
  expenseBudgets: ExpenseBudget[];
  getCategoryLabel: (c: string) => string;
}

const VariantView: React.FC<VariantViewProps> = ({ month, branchFilter, branchLabel, operatingExpenses, expenseBudgets, getCategoryLabel }) => {
  const scopeExp = operatingExpenses.filter((e) => (branchFilter === 'all' || e.branchId === branchFilter) && e.dueDate.startsWith(month));

  // Current month budget map
  const budget = expenseBudgets.find((b) => (branchFilter === 'all' || b.branchId === branchFilter) && b.month === month);
  const budgetMap = new Map<string, number>();
  budget?.items.forEach((i) => budgetMap.set(i.category, i.budgetedAmount));
  const actualMap = new Map<string, number>();
  scopeExp.forEach((e) => actualMap.set(e.category, (actualMap.get(e.category) || 0) + e.amount));

  // Over-budget categories (actual > budget)
  const overBudget = (Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[])
    .filter((c) => (budgetMap.get(c) || 0) > 0)
    .map((c) => {
      const b = budgetMap.get(c) || 0;
      const a = actualMap.get(c) || 0;
      return { category: c, budget: b, actual: a, diff: a - b, pct: b ? (a / b) * 100 : 0 };
    })
    .filter((r) => r.diff > 0)
    .sort((x, y) => y.diff - x.diff);

  const totalBudget = Array.from(budgetMap.values()).reduce((s, v) => s + v, 0);
  const totalActual = Array.from(actualMap.values()).reduce((s, v) => s + v, 0);
  const overPct = totalBudget ? (totalActual / totalBudget) * 100 : 0;
  const overAmount = totalActual - totalBudget;

  // Trend across last 6 months (budget for 'all' uses branch b-01 budget, else the matching branch)
  const trendMonths: string[] = [];
  const base = new Date(month + '-01T12:00:00');
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const trend = trendMonths.map((m) => {
    const exp = operatingExpenses.filter((e) => (branchFilter === 'all' || e.branchId === branchFilter) && e.dueDate.startsWith(m));
    const bd = expenseBudgets.find((b) => (branchFilter === 'all' || b.branchId === branchFilter) && b.month === m);
    const b = bd ? bd.items.reduce((s, i) => s + i.budgetedAmount, 0) : 0;
    const a = exp.reduce((s, e) => s + e.amount, 0);
    return { month: monthLabel(m).split(' ')[0], budget: b, actual: a, diff: a - b };
  });

  // Branch-level adherence (for 'all' scope)
  const branchRows = branchFilter === 'all'
    ? Array.from(new Set([...operatingExpenses.map((e) => e.branchId), ...expenseBudgets.map((b) => b.branchId)]))
        .map((bid) => {
          const exp = operatingExpenses.filter((e) => e.branchId === bid && e.dueDate.startsWith(month));
          const bd = expenseBudgets.find((b) => b.branchId === bid && b.month === month);
          const b = bd ? bd.items.reduce((s, i) => s + i.budgetedAmount, 0) : 0;
          const a = exp.reduce((s, e) => s + e.amount, 0);
          return { branchId: bid, budget: b, actual: a, pct: b ? (a / b) * 100 : 0 };
        })
        .filter((r) => r.budget > 0)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي الموازنة" value={fmtMoney(totalBudget)} icon={<Gauge className="w-4 h-4 text-indigo-500" />} />
        <StatCard label="الإنفاق الفعلي" value={fmtMoney(totalActual)} tone="amber" icon={<TrendingUp className="w-4 h-4 text-amber-500" />} />
        <StatCard label="نسبة الاستهلاك" value={`${overPct.toFixed(1)}%`} tone={overPct > 100 ? 'rose' : 'emerald'} icon={<Gauge className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="الفائض / التجاوز" value={fmtMoney(overAmount)} tone={overAmount > 0 ? 'rose' : 'emerald'} icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Over-budget alerts */}
        <Card className="p-5 space-y-3">
          <SectionHeader title="تنبيهات تجاوز الموازنة" subtitle={monthLabel(month)} icon={<AlertTriangle className="w-5 h-5 text-rose-600" />} />
          {overBudget.length === 0 ? (
            <p className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl p-3">لا توجد تصنيفات تجاوزت موازنتها هذا الشهر — أداء ممتاز.</p>
          ) : (
            <div className="space-y-2">
              {overBudget.map((r) => (
                <div key={r.category} className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800">{getCategoryLabel(r.category)}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.pct > 120 ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'}`}>تجاوز {r.pct.toFixed(0)}%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">الموازنة {fmtMoney(r.budget)} · الفعلي <span className="text-rose-600 font-bold">{fmtMoney(r.actual)}</span> · تجاوز {fmtMoney(r.diff)}</p>
                  <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Trend chart */}
        <Card className="p-5">
          <SectionHeader title="الاتجاه الشهري (الموازنة مقابل الفعلي)" subtitle="آخر 6 أشهر" icon={<TrendingUp className="w-5 h-5 text-indigo-600" />} />
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(v: unknown) => `${fmt(Number(v))} ر.س`} />
                <Bar dataKey="budget" name="الموازنة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Branch adherence */}
      {branchFilter === 'all' && branchRows.length > 0 && (
        <Card className="p-5">
          <SectionHeader title="التزام الفروع بالموازنة" subtitle={monthLabel(month)} icon={<Gauge className="w-5 h-5 text-indigo-600" />} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الفرع</th><th className="p-3">الموازنة</th><th className="p-3">الفعلي</th><th className="p-3">نسبة الاستهلاك</th><th className="p-3">التقييم</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchRows.map((r) => (
                  <tr key={r.branchId} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{branchLabel(r.branchId)}</td>
                    <td className="p-3 font-mono">{fmt(r.budget)}</td>
                    <td className="p-3 font-mono">{fmt(r.actual)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(r.pct, 100)}%`, backgroundColor: r.pct > 100 ? '#ef4444' : r.pct > 85 ? '#f59e0b' : '#10b981' }} /></div>
                        <span className="font-mono font-bold text-[11px]">{r.pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.pct > 100 ? 'bg-rose-100 text-rose-700' : r.pct > 85 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.pct > 100 ? 'تجاوز' : r.pct > 85 ? 'قريب من الحد' : 'ضمن الموازنة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};