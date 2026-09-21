import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Save, RotateCcw, History, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, SectionHeader, StatCard, PageHeader, Btn, TabBar, EmptyState, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { EXPENSE_CATEGORY_LABELS, fmtMoney, currentMonthKey } from '../../utils/helpers';
import { OperatingExpenseCategory } from '../../types';

const MONTH_IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const CATS = Object.keys(EXPENSE_CATEGORY_LABELS) as OperatingExpenseCategory[];
const EQUAL_WEIGHTS = MONTH_IDS.map(() => 100 / 12);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const AnnualBudgetView: React.FC = () => {
  const { operatingExpenses, expenseBudgets, branches, visibleBranchIds, getBranchName, setExpenseBudget, can } = useApp();
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [tab, setTab] = useState<'plan' | 'monthly' | 'category'>('plan');
  const [weights, setWeights] = useState<number[]>([...EQUAL_WEIGHTS]);
  const [yearAmounts, setYearAmounts] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string>('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchLabel = (id: string) => (id === 'central' ? 'مركزية (مشتركة)' : getBranchName(id));
  const equalWeights = MONTH_IDS.every((_, i) => Math.abs(weights[i] - 100 / 12) < 0.001);

  useEffect(() => {
    const m = new Map<string, number>();
    expenseBudgets
      .filter((b) => b.month.startsWith(year) && (filterBranch === 'all' || b.branchId === filterBranch))
      .forEach((b) => b.items.forEach((i) => m.set(i.category, (m.get(i.category) || 0) + i.budgetedAmount)));
    const next: Record<string, string> = {};
    CATS.forEach((c) => { next[c] = String(round2(m.get(c) || 0)); });
    setYearAmounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBranch, year, savedAt, expenseBudgets]);

  const annualFor = (c: string) => parseFloat(String(yearAmounts[c])) || 0;
  const totalPlanned = CATS.reduce((s, c) => s + annualFor(c), 0);
  const plannedByMonth = MONTH_IDS.map((_, i) => round2(totalPlanned * (weights[i] / 100)));
  const savedCount = useMemo(() =>
    expenseBudgets.filter((b) => (filterBranch === 'all' || b.branchId === filterBranch) && b.month.startsWith(year)).length,
    [expenseBudgets, filterBranch, year]);

  const scopeBudgets = expenseBudgets.filter((b) => b.month.startsWith(year) && (filterBranch === 'all' || b.branchId === filterBranch));
  const actualUnless = operatingExpenses.filter((e) =>
    e.dueDate.startsWith(year) && (filterBranch === 'all' || e.branchId === filterBranch) && e.paymentStatus === 'paid');

  const budgetByMonth = useMemo(() => {
    const m = new Map<string, number>();
    scopeBudgets.forEach((b) => m.set(b.month.slice(5), (m.get(b.month.slice(5)) || 0) + b.items.reduce((s, i) => s + i.budgetedAmount, 0)));
    return m;
  }, [scopeBudgets]);
  const actualByMonth = useMemo(() => {
    const m = new Map<string, number>();
    actualUnless.forEach((e) => m.set(e.dueDate.slice(5, 7), (m.get(e.dueDate.slice(5, 7)) || 0) + e.amount));
    return m;
  }, [actualUnless]);
  const budgetByCat = useMemo(() => {
    const m = new Map<string, number>();
    scopeBudgets.forEach((b) => b.items.forEach((i) => m.set(i.category, (m.get(i.category) || 0) + i.budgetedAmount)));
    return m;
  }, [scopeBudgets]);
  const actualByCat = useMemo(() => {
    const m = new Map<string, number>();
    actualUnless.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return m;
  }, [actualUnless]);

  const nowM = currentMonthKey();
  const monthlyRows = MONTH_IDS.map((mm, i) => {
    const budget = budgetByMonth.get(mm) || 0;
    const actual = actualByMonth.get(mm) || 0;
    const future = `${year}-${mm}` > nowM;
    const diff = actual - budget;
    const pct = budget > 0 ? (diff / budget) * 100 : actual > 0 ? 100 : 0;
    const status = future ? 'future' : budget === 0 && actual > 0 ? 'nobudget' : diff > 0 ? 'over' : 'within';
    return { mm, name: MONTH_NAMES[i], budget, actual, diff, pct, status };
  });
  const totalBudgetYear = monthlyRows.reduce((s, r) => s + r.budget, 0);
  const totalActualYear = monthlyRows.reduce((s, r) => s + r.actual, 0);
  const yearVariancePct = totalBudgetYear > 0 ? ((totalActualYear - totalBudgetYear) / totalBudgetYear) * 100 : totalActualYear > 0 ? 100 : 0;
  const monthsOver = monthlyRows.filter((r) => r.status === 'over').length;
  const withinCount = monthlyRows.filter((r) => r.status === 'within').length;

  const catRows = CATS
    .map((c) => {
      const budget = budgetByCat.get(c) || 0;
      const actual = actualByCat.get(c) || 0;
      const diff = actual - budget;
      const pct = budget > 0 ? (diff / budget) * 100 : actual > 0 ? 100 : 0;
      return { category: c, name: EXPENSE_CATEGORY_LABELS[c], budget, actual, diff, pct };
    })
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.diff - a.diff);

  const loadLastYearActuals = () => {
    const ly = String(Number(year) - 1);
    const scope = operatingExpenses.filter((e) => e.dueDate.startsWith(ly) && (filterBranch === 'all' || e.branchId === filterBranch) && e.paymentStatus === 'paid');
    const perMonth = MONTH_IDS.map((mm) => scope.filter((e) => e.dueDate.slice(5, 7) === mm).reduce((s, e) => s + e.amount, 0));
    const tot = perMonth.reduce((s, v) => s + v, 0);
    if (tot <= 0) return;
    setWeights(perMonth.map((v) => round2((v / tot) * 100)));
  };

  const saveAnnual = () => {
    if (filterBranch === 'all') return;
    MONTH_IDS.forEach((mm, i) => {
      const items = CATS
        .map((c) => ({ category: c, budgetedAmount: round2(annualFor(c) * (weights[i] / 100)) }))
        .filter((it) => it.budgetedAmount > 0);
      setExpenseBudget(filterBranch, `${year}-${mm}`, items);
    });
    setSavedAt(new Date().toISOString());
  };

  const statusPill = (status: string) => {
    if (status === 'future') return { cls: 'bg-slate-100 text-slate-500', label: 'قادم' };
    if (status === 'nobudget') return { cls: 'bg-amber-100 text-amber-800', label: 'دون موازنة' };
    if (status === 'over') return { cls: 'bg-rose-100 text-rose-800', label: 'تجاوز' };
    return { cls: 'bg-emerald-100 text-emerald-700', label: 'ضمن الموازنة' };
  };

  const canSave = can('manage_expenses');
  const selectedBranchLabel = filterBranch === 'all' ? 'جميع الفروع' : branchLabel(filterBranch);

  return (
    <div className="space-y-6">
      <PageHeader title="الميزانيات السنوية للفروع" subtitle="تخطيط موازنة سنوية لكل فرع مع توزيع شهري وقابل للتعديل، وتقرير المقارنة الشهرية مع الفعلي" icon={<CalendarRange className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename={`الموازنة_السنوية_${filterBranch}_${year}`}
            sheets={[
              { name: 'التقرير الشهري', header: ['الشهر', 'الموازنة', 'الفعلي', 'الفرق', 'الانحراف %', 'الحالة'], rows: monthlyRows.map((r) => [r.name, r.budget, r.actual, r.diff, r.pct.toFixed(2), r.status === 'future' ? 'قادم' : r.status === 'nobudget' ? 'دون موازنة' : r.status === 'over' ? 'تجاوز' : 'ضمن الموازنة']) },
              { name: 'حسب التصنيف', header: ['التصنيف', 'الموازنة السنوية', 'الفعلي السنوي', 'الفرق', 'الانحراف %'], rows: catRows.map((r) => [r.name, r.budget, r.actual, r.diff, r.pct.toFixed(2)]) },
              { name: 'الملخص السنوي', header: ['البند', 'القيمة'], rows: [['إجمالي الموازنة', totalBudgetYear], ['الفعلي (مدفوع)', totalActualYear], ['الانحراف %', yearVariancePct.toFixed(2)], ['شهور التجاوز', monthsOver], ['شهور ضمن الموازنة', withinCount]] },
            ]}
          />
          <Btn tone="ghost" onClick={() => setTab('monthly')}><TrendingDown className="w-4 h-4" /> التقرير الشهري</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-56'}>
          <option value="all">جميع الفروع المتاحة</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          <option value="central">مركزية (مشتركة)</option>
        </select>
        <input type="number" min="2020" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls + ' !w-32'} />
        <TabBar tabs={[{ id: 'plan', label: 'التخطيط السنوي' }, { id: 'monthly', label: 'الميزانية مقابل الفعلي' }, { id: 'category', label: 'حسب التصنيف' }]} active={tab} onChange={(id) => setTab(id as 'plan' | 'monthly' | 'category')} />
      </Card>

      {tab === 'plan' && (
        filterBranch === 'all' ? (
          <EmptyState title="اختر فرعاً للتخطيط" subtitle="الموازنة السنوية تُحفظ لكل فرع على حدة، اختر فرعاً ثم أدخل المبالغ السنوية للتوزيع الشهري" icon={<CalendarRange className="w-8 h-8 text-slate-300" />} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="إجمالي الموازنة السنوية المخططة" value={fmtMoney(totalPlanned)} sub="حسب المبالغ المدخلة" icon={<CalendarRange className="w-4 h-4 text-indigo-500" />} />
              <StatCard label="الشهور المحفوظة" value={`${savedCount} / 12`} tone={savedCount === 12 ? 'emerald' : 'amber'} sub="عدد أشهر الميزانيات المخزنة" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
              <StatCard label="متوسط الشهر" value={fmtMoney(round2(totalPlanned / 12))} sub="بتوزيع متساوٍ" icon={<TrendingDown className="w-4 h-4 text-slate-500" />} />
              <StatCard label="شهور التجاوز بحسب المحفوظ" value={String(monthsOver)} tone={monthsOver > 0 ? 'rose' : 'emerald'} sub="من البيانات الفعلية المسجلة" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
            </div>

            <Card className="p-5 space-y-4">
              <SectionHeader title={`التخطيط السنوي — ${branchLabel(filterBranch)} · ${year}`} icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
                extra={<div className="flex items-center gap-2">
                  <Btn tone="ghost" onClick={() => { setWeights([...EQUAL_WEIGHTS]); }} disabled={equalWeights}><RotateCcw className="w-3.5 h-3.5" /> توزيع متساوٍ</Btn>
                  <Btn tone="ghost" onClick={loadLastYearActuals}><History className="w-3.5 h-3.5" /> من الفعلي للعام السابق</Btn>
                  {canSave ? <Btn onClick={saveAnnual}><Save className="w-3.5 h-3.5" /> حفظ الميزانية السنوية</Btn> : <span className="text-[10px] text-slate-400">لا تملك صلاحية حفظ</span>}
                </div>} />
              <p className="text-[11px] text-slate-500 leading-6">أدخل المبلغ السنوي لكل تصنيف، وعدّل أوزان التوزيع الشهري (%) إن كانت مصاريفك موسمية، ثم حفظ يحفظ ١٢ موازنة شهرية للفرع (تظهر تلقائياً في "الموازنة مقابل الفعلي" بالمصاريف التشغيلية).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[820px]">
                  <thead>
                    <tr className="text-right text-slate-500 border-b border-slate-200">
                      <th className="p-2 font-semibold">التصنيف</th>
                      {MONTH_NAMES.map((n) => <th key={n} className="p-2 font-semibold text-center">{n}</th>)}
                      <th className="p-2 font-semibold text-center">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-slate-50/60">
                      <td className="p-2 font-bold text-indigo-700">أوزان التوزيع %</td>
                      {weights.map((w, i) => (
                        <td className="p-2" key={i}>
                          <input type="number" min="0" max="100" step="any" value={Number.isFinite(w) ? round2(w) : 0} onChange={(e) => { const nw = [...weights]; nw[i] = parseFloat(e.target.value) || 0; setWeights(nw); }} className={inputCls + ' !w-16 !px-1 text-center'} />
                        </td>
                      ))}
                      <td className="p-2 text-center font-bold">{round2(weights.reduce((s, w) => s + w, 0))}%</td>
                    </tr>
                    {CATS.map((c) => (
                      <tr key={c} className="border-b border-slate-100">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <input type="number" min="0" step="any" value={yearAmounts[c] || ''} onChange={(e) => setYearAmounts({ ...yearAmounts, [c]: e.target.value })} className={inputCls + ' !w-24 !px-1'} placeholder="المبلغ السنوي" />
                            <span className="font-semibold whitespace-nowrap">{EXPENSE_CATEGORY_LABELS[c]}</span>
                          </div>
                        </td>
                        {MONTH_IDS.map((mm, i) => <td key={mm} className="p-2 text-center font-mono text-slate-700">{round2(annualFor(c) * (weights[i] / 100)) || '—'}</td>)}
                        <td className="p-2 text-center font-mono font-bold text-indigo-700">{round2(annualFor(c)) || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-indigo-50/50 font-bold">
                      <td className="p-2 text-indigo-800">الإجمالي الشهري</td>
                      {plannedByMonth.map((v, i) => <td key={i} className="p-2 text-center font-mono text-indigo-800">{round2(v) || '—'}</td>)}
                      <td className="p-2 text-center font-mono text-indigo-800">{round2(totalPlanned)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )
      )}

      {tab === 'monthly' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="إجمالي الموازنة السنوية" value={fmtMoney(totalBudgetYear)} icon={<CalendarRange className="w-4 h-4 text-indigo-500" />} />
            <StatCard label="الفعلي السنوي (مدفوع)" value={fmtMoney(totalActualYear)} tone={totalActualYear > totalBudgetYear ? 'rose' : 'emerald'} icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
            <StatCard label="الانحراف السنوي %" value={`${yearVariancePct >= 0 ? '+' : ''}${yearVariancePct.toFixed(2)}%`} tone={yearVariancePct > 5 ? 'rose' : yearVariancePct < -3 ? 'emerald' : 'amber'} icon={<TrendingDown className="w-4 h-4 text-amber-500" />} />
            <StatCard label="الشهور" value={`${monthsOver} تجاوز × ${withinCount} ضمن`} sub="حسب الفعلي المسجل" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
          </div>

          <Card className="p-5">
            <SectionHeader title={`الميزانية مقابل الفعلي — ${selectedBranchLabel} · ${year}`} icon={<TrendingDown className="w-5 h-5 text-indigo-600" />} />
            <div className="h-72 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRows.map((r) => ({ name: r.name, 'الموازنة': r.budget, 'الفعلي': r.actual }))} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="الموازنة" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="الفعلي" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-right text-slate-500 border-b border-slate-200">
                    <th className="p-2 font-semibold">الشهر</th>
                    <th className="p-2 font-semibold text-center">الموازنة</th>
                    <th className="p-2 font-semibold text-center">الفعلي</th>
                    <th className="p-2 font-semibold text-center">الفرق</th>
                    <th className="p-2 font-semibold text-center">الانحراف %</th>
                    <th className="p-2 font-semibold text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((r) => {
                    const st = statusPill(r.status);
                    return (
                      <tr key={r.mm} className="border-b border-slate-100">
                        <td className="p-2 font-semibold">{r.name}</td>
                        <td className="p-2 text-center font-mono">{fmtMoney(r.budget)}</td>
                        <td className={`p-2 text-center font-mono font-bold ${r.actual > r.budget && r.budget > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmtMoney(r.actual)}</td>
                        <td className={`p-2 text-center font-mono ${r.diff > 0 ? 'text-rose-600' : r.diff < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{r.diff >= 0 ? '+' : ''}{fmtMoney(r.diff)}</td>
                        <td className="p-2 text-center font-mono">{r.status === 'future' ? '—' : `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%`}</td>
                        <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${st.cls}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                  <tr className="bg-indigo-50/50 font-bold">
                    <td className="p-2 text-indigo-800">الإجمالي</td>
                    <td className="p-2 text-center font-mono text-indigo-800">{fmtMoney(totalBudgetYear)}</td>
                    <td className="p-2 text-center font-mono text-indigo-800">{fmtMoney(totalActualYear)}</td>
                    <td className="p-2 text-center font-mono text-indigo-800">{totalActualYear - totalBudgetYear >= 0 ? '+' : ''}{fmtMoney(totalActualYear - totalBudgetYear)}</td>
                    <td className="p-2 text-center font-mono text-indigo-800">{`${yearVariancePct >= 0 ? '+' : ''}${yearVariancePct.toFixed(2)}%`}</td>
                    <td className="p-2 text-center" />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'category' && (
        <Card className="p-5">
          <SectionHeader title={`الموازنة مقابل الفعلي حسب التصنيف — ${selectedBranchLabel} · ${year}`} icon={<TrendingDown className="w-5 h-5 text-indigo-600" />} />
          {catRows.length === 0 ? (
            <EmptyState title="لا توجد موازنات أو مصاريف" subtitle="احفظ الميزانية السنوية أو سجّل مصاريف لهذه السنة لعرض المقارنة" icon={<CalendarRange className="w-8 h-8 text-slate-300" />} />
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-right text-slate-500 border-b border-slate-200">
                    <th className="p-2 font-semibold">التصنيف</th>
                    <th className="p-2 font-semibold text-center">الموازنة السنوية</th>
                    <th className="p-2 font-semibold text-center">الفعلي السنوي</th>
                    <th className="p-2 font-semibold text-center">الفرق</th>
                    <th className="p-2 font-semibold text-center">الانحراف %</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((r) => (
                    <tr key={r.category} className="border-b border-slate-100">
                      <td className="p-2 font-semibold">{r.name}</td>
                      <td className="p-2 text-center font-mono">{fmtMoney(r.budget)}</td>
                      <td className={`p-2 text-center font-mono font-bold ${r.actual > r.budget && r.budget > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmtMoney(r.actual)}</td>
                      <td className={`p-2 text-center font-mono ${r.diff > 0 ? 'text-rose-600' : r.diff < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{r.diff >= 0 ? '+' : ''}{fmtMoney(r.diff)}</td>
                      <td className="p-2 text-center font-mono">{`${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};