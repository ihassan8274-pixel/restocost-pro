import React, { useMemo, useState } from 'react';
import { UtensilsCrossed, Plus, Trash2, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { openPrintWindow } from '../../utils/print';
import { fmt, fmtMoney, today, navOnEnter, employeeRoleLabel } from '../../utils/helpers';
import type { EmployeeMealType } from '../../types';

const MEAL_LABELS: Record<EmployeeMealType, string> = { breakfast: 'فطور', lunch: 'غداء', dinner: 'عشاء' };

export const EmployeeMealsView: React.FC = () => {
  const {
    employees, branches, recipes, employeeMeals, visibleBranchIds, addEmployeeMeal, deleteEmployeeMeal, getBranchName,
  } = useApp();
  const [tab, setTab] = useState<'register' | 'history' | 'print'>('register');
  const [branch, setBranch] = useState(visibleBranchIds[0] || 'b-01');
  const [date, setDate] = useState(today());
  const [mealType, setMealType] = useState<EmployeeMealType>('lunch');
  const [employeeId, setEmployeeId] = useState('');
  const [menuItem, setMenuItem] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [notes, setNotes] = useState('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchEmployees = employees.filter((e) => e.branchId === branch && e.isActive);
  const recipeNames = recipes.filter((r) => r.isActive).map((r) => r.nameAr);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === employeeId);
    if (!emp) return;
    addEmployeeMeal({
      branchId: branch, date, mealType,
      employeeId: emp.id, employeeName: emp.name,
      menuItem: menuItem.trim() || 'وجبة موظفين', quantity: quantity || 1,
      unitCost, totalCost: (quantity || 1) * unitCost, notes: notes.trim() || undefined,
    });
    setEmployeeId(''); setNotes('');
  };

  const filtered = useMemo(() => employeeMeals.filter((m) => m.branchId === branch && m.date === date), [employeeMeals, branch, date]);
  const totalMeals = filtered.reduce((s, m) => s + m.quantity, 0);
  const totalCost = filtered.reduce((s, m) => s + m.totalCost, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="وجبات العاملين" subtitle="تسجيل الوجبات المقدمة للموظفين وطباعة نموذج فارغ للتوقيع في الفرع" icon={<UtensilsCrossed className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="وجبات_العاملين"
            sheets={[
              { name: 'سجل الوجبات', header: ['التاريخ', 'الفرع', 'النوع', 'الموظف', 'الصنف', 'الكمية', 'التكلفة'], rows: employeeMeals.map((m) => [m.date, getBranchName(m.branchId), MEAL_LABELS[m.mealType], m.employeeName, m.menuItem, m.quantity, m.totalCost]) },
            ]}
          />
          <Btn onClick={() => setTab('register')}><Plus className="w-4 h-4" /> تسجيل وجبة</Btn>
        </>} />

      <TabBar tabs={[{ id: 'register', label: 'تسجيل الوجبات' }, { id: 'history', label: 'سجل الوجبات' }, { id: 'print', label: 'نموذج التوقيع الفارغ' }]} active={tab} onChange={(id) => setTab(id as 'register' | 'history' | 'print')} />

      {tab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionHeader title="تسجيل وجبة جديدة" subtitle="حدد الفرع والتاريخ والموظف" icon={<Plus className="w-5 h-5 text-indigo-500" />} />
            <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Field label="الفرع">
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                    {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                  </select>
                </Field>
                <Field label="التاريخ">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="نوع الوجبة">
                  <select value={mealType} onChange={(e) => setMealType(e.target.value as EmployeeMealType)} className={inputCls}>
                    <option value="breakfast">فطور</option><option value="lunch">غداء</option><option value="dinner">عشاء</option>
                  </select>
                </Field>
                <Field label="الموظف" required>
                  <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls} required>
                    <option value="">اختر الموظف</option>
                    {branchEmployees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="الصنف / الوجبة">
                <input list="recipe-names" value={menuItem} onChange={(e) => setMenuItem(e.target.value)} className={inputCls} placeholder="مثال: كبسة دجاج / وجبة موظفين" />
                <datalist id="recipe-names">{recipeNames.map((r) => <option key={r} value={r} />)}</datalist>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="الكمية">
                  <input type="number" min="1" step="1" data-nav value={quantity || ''} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} onKeyDown={navOnEnter} className={inputCls} />
                </Field>
                <Field label="تكلفة الوجبة الواحدة (ر.س)">
                  <input type="number" min="0" step="0.01" data-nav value={unitCost || ''} onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)} onKeyDown={navOnEnter} className={inputCls} />
                </Field>
              </div>
              <Field label="ملاحظات">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="اختياري" />
              </Field>
              <div className="pt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">إجمالي: <span className="font-mono text-indigo-700">{fmtMoney((quantity || 1) * unitCost)}</span></span>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-1.5"><Plus className="w-4 h-4" /> تسجيل الوجبة</button>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <SectionHeader title={`وجبات اليوم — ${getBranchName(branch)}`} subtitle={`${date} — ${totalMeals} وجبة بقيمة ${fmtMoney(totalCost)}`} icon={<UtensilsCrossed className="w-5 h-5 text-indigo-500" />} />
            <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
              {filtered.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">لا توجد وجبات مسجلة لهذا اليوم</p>}
              {filtered.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{MEAL_LABELS[m.mealType]}</span>
                    <div>
                      <p className="font-bold text-slate-800 text-xs">{m.employeeName}</p>
                      <p className="text-[10px] text-slate-500">{m.menuItem} × {fmt(m.quantity)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-indigo-700 text-xs">{fmtMoney(m.totalCost)}</span>
                    <button onClick={() => deleteEmployeeMeal(m.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs">سجل وجبات العاملين ({employeeMeals.length})</h3>
            <div className="flex items-center gap-2">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls + ' !w-52'}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' !w-40'} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">التاريخ</th><th className="p-3">الفرع</th><th className="p-3">النوع</th><th className="p-3">الموظف</th><th className="p-3">الصنف</th><th className="p-3">الكمية</th><th className="p-3">التكلفة</th><th className="p-3">ملاحظات</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeMeals.filter((m) => m.branchId === branch && m.date === date).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-600">{m.date}</td>
                    <td className="p-3">{getBranchName(m.branchId)}</td>
                    <td className="p-3"><span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{MEAL_LABELS[m.mealType]}</span></td>
                    <td className="p-3 font-bold text-slate-900">{m.employeeName}</td>
                    <td className="p-3">{m.menuItem}</td>
                    <td className="p-3 font-mono">{fmt(m.quantity)}</td>
                    <td className="p-3 font-mono font-extrabold text-indigo-700">{fmtMoney(m.totalCost)}</td>
                    <td className="p-3 text-slate-500">{m.notes || '—'}</td>
                    <td className="p-3"><button onClick={() => deleteEmployeeMeal(m.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {employeeMeals.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد وجبات مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'print' && (
        <Card className="p-5">
          <SectionHeader title="طباعة نموذج فارغ لتسجيل الوجبات" subtitle="اختر الفرع والتاريخ ثم اطبع النموذج لتوقيع الموظفين في الفرع" icon={<Printer className="w-5 h-5 text-indigo-500" />}
            extra={<Btn tone="dark" onClick={() => openPrintWindow({
              title: 'نموذج تسجيل وجبات العاملين',
              subtitle: 'نموذج فارغ للتوقيع',
              meta: [['الفرع', getBranchName(branch)], ['التاريخ', date], ['المسؤول', '______________'], ['عدد الموظفين', `${branchEmployees.length}`]],
              tables: [{
                title: 'كشوف الوجبات اليومية',
                header: ['م', 'اسم الموظف', 'الوظيفة', 'فطور', 'غداء', 'عشاء', 'توقيع الموظف'],
                rows: branchEmployees.map((emp, i) => [i + 1, emp.name, employeeRoleLabel(emp.role), '', '', '', '']),
              }],
              footer: 'يُعبأ النموذج يومياً ويوقَّع من الموظفين ومدير الفرع — RestoCost ERP',
            })}><Printer className="w-4 h-4" /> طباعة النموذج</Btn>} />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">
            <Field label="الفرع">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="التاريخ">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="المسؤول">
              <input className={inputCls} placeholder="اسم مدير الفرع" />
            </Field>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-2 print:hidden">يُطبع النموذج بتنسيق A4 ويتضمن توقيع كل موظف على الوجبات المستلمة.</p>
        </Card>
      )}
    </div>
  );
};
