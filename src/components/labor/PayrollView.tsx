import React, { useMemo, useState } from 'react';
import { Users, Plus, Printer, CheckCircle2, Trash2, Pencil, CreditCard, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, SectionHeader, TabBar, StatCard } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { openPrintWindow } from '../../utils/print';
import { fmt, fmtMoney, navOnEnter, currentMonthKey, monthLabel, employeeRoleLabel } from '../../utils/helpers';
import type { AttendanceStatus } from '../../types';

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر', absent: 'غائب', leave: 'إجازة', late: 'متأخر',
};
const STATUS_TONES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-rose-100 text-rose-700',
  leave: 'bg-sky-100 text-sky-700',
  late: 'bg-amber-100 text-amber-700',
};

export const PayrollView: React.FC = () => {
  const {
    employees, branches, visibleBranchIds, attendance, payrollPeriods,
    addAttendance, deleteAttendance, generatePayroll, confirmPayroll, deletePayrollPeriod,
    getBranchName,
  } = useApp();

  const [tab, setTab] = useState<'attendance' | 'payroll'>('attendance');
  const [branchFilter, setBranchFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMonth, setPayMonth] = useState(currentMonthKey());
  const [showAttModal, setShowAttModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [msg, setMsg] = useState('');

  const [attForm, setAttForm] = useState({
    branchId: visibleBranchIds[0] || '', employeeId: '', date: new Date().toISOString().slice(0, 10),
    status: 'present' as AttendanceStatus, hoursWorked: 8, overtimeHours: 0, bonus: 0, deduction: 0,
  });

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchName = (id: string) => id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id);

  const filteredAtt = attendance
    .filter((a) => (branchFilter === 'all' || a.branchId === branchFilter))
    .filter((a) => !dateFilter || a.date === dateFilter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const selectedPeriod = payrollPeriods.find((p) => p.month === payMonth);

  const monthStats = useMemo(() => {
    const inMonth = attendance.filter((a) => a.date.startsWith(payMonth));
    const present = inMonth.filter((a) => a.status === 'present' || a.status === 'late').length;
    const absent = inMonth.filter((a) => a.status === 'absent').length;
    return { total: inMonth.length, present, absent };
  }, [attendance, payMonth]);

  const openAtt = () => {
    setAttForm({ branchId: visibleBranchIds[0] || '', employeeId: '', date: dateFilter || new Date().toISOString().slice(0, 10), status: 'present', hoursWorked: 8, overtimeHours: 0, bonus: 0, deduction: 0 });
    setShowAttModal(true);
  };

  const submitAtt = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === attForm.employeeId);
    if (!emp) return;
    addAttendance({
      branchId: attForm.branchId, employeeId: emp.id, date: attForm.date,
      status: attForm.status, hoursWorked: attForm.hoursWorked, overtimeHours: attForm.overtimeHours,
      bonus: attForm.bonus, deduction: attForm.deduction,
    });
    setShowAttModal(false);
    setMsg('تم تسجيل الحضور بنجاح');
    setTimeout(() => setMsg(''), 2500);
  };

  const doGenerate = () => {
    const res = generatePayroll(payMonth);
    setMsg(res.ok ? 'تم توليد كشف رواتب الشهر' : (res.error || 'تعذر التوليد'));
    setShowPayrollModal(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const printPeriod = () => {
    const p = selectedPeriod;
    if (!p) return;
    openPrintWindow({
      title: `كشف رواتب — ${monthLabel(p.month)}`,
      subtitle: p.status === 'confirmed' ? 'معتمد' : 'مسودة',
      meta: [
        ['عدد الموظفين', `${p.lines.length}`],
        ['الإجمالي قبل الحسميات', fmtMoney(p.totalGross)],
        ['إجمالي الحسميات', fmtMoney(p.totalDeductions)],
        ['صافي مستحق الدفع', fmtMoney(p.totalNet)],
        ...(p.confirmedBy ? ([['اعتمد بواسطة', p.confirmedBy]] as [string, string][]) : []),
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [{
        title: 'كشف الرواتب',
        header: ['#', 'الموظف', 'الفرع', 'النوع', 'أساسي', 'أيام', 'إضافي', 'قيمة الإضافي', 'مكافآت', 'حسميات', 'الإجمالي', 'الصافي'],
        rows: p.lines.map((l, idx) => [idx + 1, l.employeeName, branchName(l.branchId), l.isHourly ? 'ساعي' : 'شهري', fmt(l.baseSalary), `${l.workedDays}`.padStart(2, '0') + 'يوم', fmt(l.overtimeHours), fmt(l.overtimePay), fmt(l.bonus), fmt(l.deduction), fmt(l.grossSalary), fmt(l.netSalary)]),
      }],
      totals: [['صافي إجمالي الرواتب', `${fmtMoney(p.totalNet)}`]],
      footer: p.status === 'confirmed' ? 'كشف رواتب معتمد ضمن نظام RestoCost ERP' : 'كشف رواتب مسودة ضمن نظام RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الرواتب والحضور" subtitle="تسجيل حضور الموظفين يومياً وتوليد كشوف رواتب شهرية مع قيد محاسبي تلقائي" icon={<Users className="w-6 h-6 text-indigo-300" />}
        actions={
          <>
            <ViewToolbar
              filename="الرواتب_والحضور"
              sheets={[
                { name: 'الحضور', header: ['الموظف', 'الفرع', 'التاريخ', 'الحالة', 'ساعات', 'إضافي', 'مكافأة', 'حسم'], rows: attendance.map((a) => [a.employeeName, branchName(a.branchId), a.date, STATUS_LABELS[a.status], a.hoursWorked, a.overtimeHours, a.bonus || 0, a.deduction || 0]) },
                ...payrollPeriods.map((p) => ({ name: `كشف_${p.month}`, header: ['الموظف', 'الفرع', 'أساسي', 'إجمالي', 'حسميات', 'صافي'], rows: p.lines.map((l) => [l.employeeName, branchName(l.branchId), l.baseSalary, l.grossSalary, l.deduction, l.netSalary]) })),
              ]}
            />
            <Btn onClick={openAtt}><Plus className="w-4 h-4" /> تسجيل حضور</Btn>
            <Btn tone="dark" onClick={() => setShowPayrollModal(true)}><CreditCard className="w-4 h-4" /> توليد كشف رواتب</Btn>
          </>
        } />

      {msg && <div className="rounded-xl p-3 font-bold border text-xs bg-indigo-50 border-indigo-200 text-indigo-700">{msg}</div>}

      {/* KPI summary for selected month */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="سجلات حضور الشهر" value={fmt(monthStats.total, 0)} icon={<Users className="w-4 h-4 text-indigo-500" />} />
        <StatCard label="أيام حضور" value={fmt(monthStats.present, 0)} tone="emerald" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="أيام غياب" value={fmt(monthStats.absent, 0)} tone="rose" icon={<Trash2 className="w-4 h-4 text-rose-500" />} />
        <StatCard label="كشوف الرواتب" value={fmt(payrollPeriods.length, 0)} tone="indigo" icon={<FileText className="w-4 h-4 text-indigo-500" />} />
      </div>

      <TabBar tabs={[{ id: 'attendance', label: 'سجل الحضور' }, { id: 'payroll', label: 'كشوف الرواتب' }]} active={tab} onChange={(id) => setTab(id as 'attendance' | 'payroll')} />

      {tab === 'attendance' ? (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center gap-3">
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-56'}>
              <option value="all">جميع الفروع</option>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={inputCls + ' !w-40'} />
            <span className="font-bold text-slate-500 text-xs">{filteredAtt.length} سجل</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الموظف</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الحالة</th><th className="p-3">ساعات</th><th className="p-3">إضافي</th><th className="p-3">مكافأة</th><th className="p-3">حسم</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAtt.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{a.employeeName}</td>
                    <td className="p-3 text-slate-600">{branchName(a.branchId)}</td>
                    <td className="p-3 font-mono text-slate-600">{a.date}</td>
                    <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONES[a.status]}`}>{STATUS_LABELS[a.status]}</span></td>
                    <td className="p-3 font-mono">{a.hoursWorked}</td>
                    <td className="p-3 font-mono text-amber-700">{a.overtimeHours || '-'}</td>
                    <td className="p-3 font-mono text-emerald-700">{fmt(a.bonus || 0)}</td>
                    <td className="p-3 font-mono text-rose-700">{fmt(a.deduction || 0)}</td>
                    <td className="p-3">
                      <button onClick={() => { setAttForm({ branchId: a.branchId, employeeId: a.employeeId, date: a.date, status: a.status, hoursWorked: a.hoursWorked, overtimeHours: a.overtimeHours, bonus: a.bonus || 0, deduction: a.deduction || 0 }); setShowAttModal(true); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('حذف سجل الحضور؟')) deleteAttendance(a.id); }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {filteredAtt.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات حضور مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Payroll list */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-3">
              <input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className={inputCls + ' !w-44'} />
              {selectedPeriod && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className={`text-xs font-bold px-3 py-1 rounded-lg ${selectedPeriod.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{selectedPeriod.status === 'confirmed' ? 'معتمد' : 'مسودة'}</span>
                  {selectedPeriod.status === 'draft' && <Btn tone="success" onClick={() => confirmPayroll(selectedPeriod.id)}><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد</Btn>}
                  <Btn tone="ghost" onClick={printPeriod}><Printer className="w-4 h-4" /> طباعة</Btn>
                </div>
              )}
            </div>
            {selectedPeriod ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr><th className="p-3">#</th><th className="p-3">الموظف</th><th className="p-3">الفرع</th><th className="p-3">النوع</th><th className="p-3">أساسي</th><th className="p-3">أيام حضور</th><th className="p-3">غياب</th><th className="p-3">إجمالي الساعات</th><th className="p-3">إضافي</th><th className="p-3">مكافآت</th><th className="p-3">حسميات</th><th className="p-3">الصافي</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPeriod.lines.map((l, idx) => (
                      <tr key={l.employeeId} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{l.employeeName}</td>
                        <td className="p-3 text-slate-600">{branchName(l.branchId)}</td>
                        <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.isHourly ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>{l.isHourly ? 'ساعي' : 'شهري'}</span></td>
                        <td className="p-3 font-mono">{fmt(l.baseSalary)}</td>
                        <td className="p-3 font-mono">{l.workedDays}</td>
                        <td className="p-3 font-mono text-rose-600">{l.absentDays || '-'}</td>
                        <td className="p-3 font-mono">{fmt(l.hoursWorked)}</td>
                        <td className="p-3 font-mono text-amber-700">{fmt(l.overtimeHours)} / {fmt(l.overtimePay)}</td>
                        <td className="p-3 font-mono text-emerald-700">{fmt(l.bonus)}</td>
                        <td className="p-3 font-mono text-rose-700">{fmt(l.deduction)}</td>
                        <td className="p-3 font-mono font-extrabold text-indigo-700">{fmt(l.netSalary)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={10} className="p-3 text-xs text-slate-600">الإجمالي</td>
                      <td className="p-3 font-mono text-rose-700">{fmt(selectedPeriod.totalDeductions)}</td>
                      <td className="p-3 font-mono font-extrabold text-indigo-700">{fmt(selectedPeriod.totalNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-500 font-bold text-sm">لا يوجد كشف رواتب لشهر {monthLabel(payMonth)} — اضغط "توليد كشف رواتب"</div>
            )}
          </Card>

          {/* Payroll history */}
          {payrollPeriods.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="كشوف الرواتب السابقة" icon={<FileText className="w-5 h-5 text-indigo-600" />} />
              <div className="mt-3 space-y-2">
                {payrollPeriods.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{monthLabel(p.month)}</p>
                      <p className="text-[10px] text-slate-500">{p.lines.length} موظف · صافي {fmtMoney(p.totalNet)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.status === 'confirmed' ? 'معتمد' : 'مسودة'}</span>
                      <button onClick={() => { if (confirm('حذف كشف رواتب؟')) deletePayrollPeriod(p.id); }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Attendance modal */}
      <Modal open={showAttModal} onClose={() => setShowAttModal(false)} title="تسجيل حضور / تعديل">
        <form onSubmit={submitAtt} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع">
              <select value={attForm.branchId} onChange={(e) => { const b = e.target.value; setAttForm({ ...attForm, branchId: b, employeeId: '' }); }} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="الموظف" required>
              <select value={attForm.employeeId} onChange={(e) => setAttForm({ ...attForm, employeeId: e.target.value })} className={inputCls} required>
                <option value="">اختر الموظف</option>
                {employees.filter((x) => x.branchId === attForm.branchId && x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} — {employeeRoleLabel(x.role)}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="التاريخ">
              <input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} className={inputCls} required />
            </Field>
            <Field label="الحالة">
              <select value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value as AttendanceStatus })} className={inputCls}>
                <option value="present">حاضر</option><option value="late">متأخر</option>
                <option value="absent">غائب</option><option value="leave">إجازة</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ساعات العمل"><input type="number" min="0" step="0.5" data-nav value={attForm.hoursWorked} onChange={(e) => setAttForm({ ...attForm, hoursWorked: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="ساعات إضافية"><input type="number" min="0" step="0.5" data-nav value={attForm.overtimeHours} onChange={(e) => setAttForm({ ...attForm, overtimeHours: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="مكافأة للفترة (ر.س)"><input type="number" min="0" step="any" data-nav value={attForm.bonus || ''} onChange={(e) => setAttForm({ ...attForm, bonus: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="حسم من الراتب (ر.س)"><input type="number" min="0" step="any" data-nav value={attForm.deduction || ''} onChange={(e) => setAttForm({ ...attForm, deduction: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAttModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ</button>
          </div>
        </form>
      </Modal>

      {/* Payroll generate modal */}
      <Modal open={showPayrollModal} onClose={() => setShowPayrollModal(false)} title="توليد كشف رواتب">
        <div className="text-xs space-y-3">
          <Field label="الشهر">
            <input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className={inputCls} />
          </Field>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 font-bold leading-relaxed">
            سيتم احتساب راتب كل موظف شهري كامل الأساسي مطروحاً منه خصم أيام الغياب، والساعات الإضافية ×1.5 لمعدل الساعة،
            مع إضافة المكافآت وخصم الحسميات. الموظفون براتب ساعي يُحتسبون من مجموع الساعات.
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button onClick={() => setShowPayrollModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button onClick={doGenerate} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">توليد الكشف</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
