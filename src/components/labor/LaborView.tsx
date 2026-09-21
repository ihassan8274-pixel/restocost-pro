import React, { useState } from 'react';
import { Users, Plus, Clock, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, EmptyState } from '../ui';
import { fmt, fmtMoney, downloadCSV, navOnEnter, employeeRoleLabel } from '../../utils/helpers';
import { ViewToolbar } from '../ui/ViewToolbar';

export const LaborView: React.FC = () => {
  const { employees, shifts, branches, visibleBranchIds, addShift, getBranchName, addEmployee, updateEmployee, deleteEmployee, customRoles, addRole, deleteRole } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [empModal, setEmpModal] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [newRole, setNewRole] = useState('');
  const [form, setForm] = useState({ branchId: visibleBranchIds[0] || '', employeeId: '', hoursWorked: 8, overtimeHours: 0, ordersHandled: 0 });
  const [empForm, setEmpForm] = useState({ id: '', name: '', role: customRoles[0] || '', branchId: visibleBranchIds[0] || '', hourlyRate: '', monthlyBaseSalary: '', phone: '', isActive: true });

  const submitEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: empForm.name.trim(),
      role: empForm.role,
      branchId: empForm.branchId,
      hourlyRate: parseFloat(empForm.hourlyRate) || 0,
      monthlyBaseSalary: parseFloat(empForm.monthlyBaseSalary) || 0,
      phone: empForm.phone.trim(),
      isActive: empForm.isActive,
    };
    if (empForm.id) updateEmployee(empForm.id, payload);
    else addEmployee(payload);
    setEmpModal(false);
    setEmpForm({ id: '', name: '', role: customRoles[0] || '', branchId: visibleBranchIds[0] || '', hourlyRate: '', monthlyBaseSalary: '', phone: '', isActive: true });
  };

  const addNewRole = () => {
    const r = newRole.trim();
    if (!r) return;
    addRole(r);
    setEmpForm((f) => ({ ...f, role: r }));
    setNewRole('');
  };

  const visibleEmployees = employees.filter((e) => visibleBranchIds.includes(e.branchId));
  const filteredShifts = branchFilter === 'all' ? shifts : shifts.filter((s) => s.branchId === branchFilter);
  const totalLabor = filteredShifts.reduce((s, sh) => s + sh.totalShiftCost, 0);
  const today = new Date().toISOString().slice(0, 10);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === form.employeeId);
    if (!emp) return;
    addShift({
      branchId: form.branchId,
      employeeId: emp.id,
      employeeName: emp.name,
      hoursWorked: form.hoursWorked,
      overtimeHours: form.overtimeHours,
      totalShiftCost: form.hoursWorked * emp.hourlyRate + form.overtimeHours * emp.hourlyRate * 1.5,
      ordersHandled: form.ordersHandled,
    });
    setShowModal(false);
    setForm({ branchId: visibleBranchIds[0] || '', employeeId: '', hoursWorked: 8, overtimeHours: 0, ordersHandled: 0 });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="قوى العمل وتكلفة الورديات" subtitle="الموظفون، تكلفة الورديات، والعبء التشغيلي على العمالة" icon={<Users className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="قوى_العمل"
            sheets={[
              { name: 'الورديات', header: ['الموظف', 'الفرع', 'التاريخ', 'ساعات', 'إضافي', 'طلبات', 'تكلفة الوردية'], rows: filteredShifts.map((s) => [s.employeeName, getBranchName(s.branchId), s.date, s.hoursWorked, s.overtimeHours || 0, s.ordersHandled || 0, s.totalShiftCost]) },
              { name: 'الموظفون', header: ['الاسم', 'الدور', 'الفرع', 'معدل الساعة', 'الراتب الأساسي', 'الحالة'], rows: visibleEmployees.map((emp) => [emp.name, employeeRoleLabel(emp.role), getBranchName(emp.branchId), emp.hourlyRate, emp.monthlyBaseSalary, emp.isActive ? 'نشط' : 'متوقف']) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Labor.csv', ['الموظف', 'الفرع', 'التاريخ', 'ساعات', 'إضافي', 'تكلفة الوردية'], filteredShifts.map((s) => [s.employeeName, s.branchId, s.date, s.hoursWorked, s.overtimeHours, s.totalShiftCost]))}>تصدير CSV</Btn>
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> تسجيل وردية</Btn>
          <Btn onClick={() => { setEmpForm({ id: '', name: '', role: customRoles[0] || '', branchId: visibleBranchIds[0] || '', hourlyRate: '', monthlyBaseSalary: '', phone: '', isActive: true }); setEmpModal(true); }}><Plus className="w-4 h-4" /> إضافة موظف</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تكلفة العمالة (ورديات)</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalLabor)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الموظفون النشطون</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{visibleEmployees.filter((e) => e.isActive).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ورديات اليوم</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{filteredShifts.filter((s) => s.date === today).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متوسط تكلفة الوردية</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{filteredShifts.length ? fmt(filteredShifts.reduce((s, x) => s + x.totalShiftCost, 0) / filteredShifts.length, 2) : 0}</strong></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-indigo-500" /><h3 className="font-bold text-slate-800 text-xs">الموظفون</h3></div>
          <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[10px] font-extrabold text-slate-500 mb-1.5">الوظائف والأدوار ({customRoles.length})</p>
            <div className="flex flex-wrap gap-1">
              {customRoles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">
                  {r}
                  <button type="button" onClick={() => { if (window.confirm(`حذف الوظيفة "${r}"؟ (لن يحذف الموظفين المسندين إليها)`)) deleteRole(r); }} className="text-indigo-300 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewRole(); } }} placeholder="إضافة وظيفة/دور جديد..." className={inputCls + ' !h-8 text-[10px]'} />
              <button type="button" onClick={addNewRole} className="px-2.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold whitespace-nowrap">+ إضافة</button>
            </div>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {visibleEmployees.map((emp) => (
              <div key={emp.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">{emp.name}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => { setEmpForm({ id: emp.id, name: emp.name, role: emp.role, branchId: emp.branchId, hourlyRate: String(emp.hourlyRate), monthlyBaseSalary: String(emp.monthlyBaseSalary), phone: emp.phone, isActive: emp.isActive }); setEmpModal(true); }} className="p-1 rounded-lg hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5 text-indigo-500" /></button>
                    <button type="button" onClick={() => { if (window.confirm(`حذف الموظف ${emp.name}؟`)) deleteEmployee(emp.id); }} className="p-1 rounded-lg hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5 text-rose-500" /></button>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${emp.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{emp.isActive ? 'نشط' : 'متوقف'}</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{employeeRoleLabel(emp.role)} • {getBranchName(emp.branchId)}</p>
                <p className="text-[10px] font-mono font-bold text-indigo-700 mt-1">معدل الساعة {fmt(emp.hourlyRate, 2)} ر.س • أساسي {fmt(emp.monthlyBaseSalary, 0)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <div className="p-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xs">سجل الورديات</h3>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-48'}>
              <option value="all">جميع الفروع</option>
              {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الموظف</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">ساعات</th><th className="p-3">إضافي</th><th className="p-3">طلبات</th><th className="p-3">التكلفة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{s.employeeName}</td>
                    <td className="p-3 text-slate-600">{getBranchName(s.branchId)}</td>
                    <td className="p-3 font-mono text-slate-600">{s.date}</td>
                    <td className="p-3 font-mono">{s.hoursWorked}</td>
                    <td className="p-3 font-mono text-amber-700">{s.overtimeHours || '-'}</td>
                    <td className="p-3 font-mono text-slate-600">{s.ordersHandled || '-'}</td>
                    <td className="p-3 font-mono font-extrabold text-indigo-700">{fmt(s.totalShiftCost, 2)}</td>
                  </tr>
                ))}
                {filteredShifts.length === 0 && <tr><td colSpan={7} className="p-0"><EmptyState title="لا توجد ورديات" subtitle="أضف وردية جديدة لتبدأ إدارة الوقت" icon={<Clock className="w-5 h-5" />} compact /></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="تسجيل وردية عمل">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع">
              <select value={form.branchId} onChange={(e) => { const b = e.target.value; setForm({ ...form, branchId: b, employeeId: '' }); }} className={inputCls}>
                {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="الموظف">
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className={inputCls} required>
                <option value="">اختر الموظف</option>
                {employees.filter((x) => x.branchId === form.branchId && x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} — {fmt(x.hourlyRate, 2)}/ساعة</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="ساعات العمل"><input type="number" min="0" step="0.5" data-nav value={form.hoursWorked} onChange={(e) => setForm({ ...form, hoursWorked: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="ساعات إضافية"><input type="number" min="0" step="0.5" data-nav value={form.overtimeHours} onChange={(e) => setForm({ ...form, overtimeHours: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="طلبات معالجة"><input type="number" min="0" data-nav value={form.ordersHandled} onChange={(e) => setForm({ ...form, ordersHandled: parseInt(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ الوردية</button>
          </div>
        </form>
      </Modal>

      <Modal open={empModal} onClose={() => setEmpModal(false)} title={empForm.id ? 'تعديل موظف' : 'إضافة موظف'}>
        <form onSubmit={submitEmployee} className="space-y-3 text-xs">
          <Field label="الاسم" required><input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className={inputCls} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الدور">
              <select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })} className={inputCls}>
                {customRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="الفرع">
              <select value={empForm.branchId} onChange={(e) => setEmpForm({ ...empForm, branchId: e.target.value })} className={inputCls}>
                {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewRole(); } }} placeholder="وظيفة/دور غير موجودة؟ أضفها هنا..." className={inputCls} />
            <button type="button" onClick={addNewRole} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium whitespace-nowrap">+ إضافة للقائمة</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="معدل الساعة (ر.س)"><input type="number" min="0" step="0.5" data-nav value={empForm.hourlyRate} onChange={(e) => setEmpForm({ ...empForm, hourlyRate: e.target.value })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="الراتب الأساسي الشهري"><input type="number" min="0" data-nav value={empForm.monthlyBaseSalary} onChange={(e) => setEmpForm({ ...empForm, monthlyBaseSalary: e.target.value })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <Field label="رقم الجوال"><input value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className={inputCls} /></Field>
          <label className="flex items-center gap-2 font-medium text-slate-700">
            <input type="checkbox" checked={empForm.isActive} onChange={(e) => setEmpForm({ ...empForm, isActive: e.target.checked })} className="w-4 h-4" />
            موظف نشط
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEmpModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ الموظف</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};