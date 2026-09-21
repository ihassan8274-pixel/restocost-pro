import React, { useState, useMemo } from 'react';
import { Moon, ArrowRight, ArrowLeft, CheckCircle2, Lock, FileText, AlertCircle, Unlock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Field, inputCls } from '../ui';
import { fmtMoney, fmt } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

type Step = 'select' | 'review' | 'closing' | 'report' | 'done';

interface DayBranchSummary {
  branchId: string;
  branchName: string;
  orders: number;
  posRevenue: number;
  posCost: number;
  batchRevenue: number;
  batchFoodCost: number;
  wastage: number;
  laborCost: number;
  expenses: number;
}

export const EndOfDayWizardView: React.FC = () => {
  const {
    branches, visibleBranchIds, posOrders, batchSalesRecords, wastageLogs,
    operatingExpenses, shifts, closedDays, closeDay, reopenDay,
  } = useApp();

  const [step, setStep] = useState<Step>('select');
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [closed, setClosed] = useState(false);
  const [msg, setMsg] = useState('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  const isClosedDay = closedDays.includes(day);

  const dayLabel = () => `${day}`;

  const summaries = useMemo((): DayBranchSummary[] => {
    return visibleBranches.map((b) => {
      const dayPos = posOrders.filter((o) => o.date.slice(0, 10) === day && o.branchId === b.id);
      const dayBatch = batchSalesRecords.filter((s) => s.date.slice(0, 10) === day && s.branchId === b.id);
      const dayWaste = wastageLogs.filter((w) => w.date.slice(0, 10) === day && w.branchId === b.id);
      const dayExp = operatingExpenses.filter((e) => (e.dueDate || '').slice(0, 10) === day && e.branchId === b.id);
      const dayLabor = shifts.filter((s) => s.date.slice(0, 10) === day && s.branchId === b.id);
      return {
        branchId: b.id,
        branchName: b.nameAr,
        orders: dayPos.length,
        posRevenue: dayPos.reduce((s, o) => s + o.totalAmount, 0),
        posCost: dayPos.reduce((s, o) => s + (o.totalCost || 0), 0),
        batchRevenue: dayBatch.reduce((s, x) => s + (x.netRevenue ?? x.totalRevenue / (1 + (x.vatRate ?? 0.15))), 0),
        batchFoodCost: dayBatch.reduce((s, x) => s + (x.totalFoodCost || 0), 0),
        wastage: dayWaste.reduce((s, w) => s + w.totalCostImpact, 0),
        laborCost: dayLabor.reduce((s, l) => s + (l.totalShiftCost || 0), 0),
        expenses: dayExp.reduce((s, e) => s + e.amount, 0),
      };
    });
  }, [visibleBranches, posOrders, batchSalesRecords, wastageLogs, operatingExpenses, shifts, day]);

  const sel = summaries.filter((s) => selectedBranches.includes(s.branchId));
  const totals = sel.reduce((acc, s) => {
    acc.orders += s.orders; acc.posRevenue += s.posRevenue; acc.posCost += s.posCost;
    acc.batchRevenue += s.batchRevenue; acc.batchFoodCost += s.batchFoodCost;
    acc.wastage += s.wastage; acc.laborCost += s.laborCost; acc.expenses += s.expenses;
    return acc;
  }, { orders: 0, posRevenue: 0, posCost: 0, batchRevenue: 0, batchFoodCost: 0, wastage: 0, laborCost: 0, expenses: 0 });

  const grossSales = totals.posRevenue + totals.batchRevenue;
  const foodCost = totals.posCost + totals.batchFoodCost;
  const profit = grossSales - foodCost - totals.wastage - totals.laborCost - totals.expenses;

  const nextStep = () => {
    if (step === 'select') setStep('review');
    else if (step === 'review') setStep('closing');
    else if (step === 'closing') setStep('report');
    else if (step === 'report') setStep('done');
  };
  const prevStep = () => {
    if (step === 'review') setStep('select');
    else if (step === 'closing') setStep('review');
    else if (step === 'report') setStep('closing');
  };

  const runClosing = () => {
    closeDay(day);
    setClosed(true);
    setMsg(`أُغلق يوم ${day} — مُنعت الإضافة أو التعديل على هذا التاريخ`);
    setTimeout(() => setMsg(''), 4000);
  };

  const runReport = () => {
    const rows = sel.map((s) => [
      s.branchName,
      s.orders,
      fmtMoney(s.posRevenue + s.batchRevenue),
      fmtMoney(s.posCost + s.batchFoodCost),
      fmtMoney(s.wastage),
      fmtMoney(s.laborCost),
      fmtMoney(s.expenses),
      fmtMoney(s.posRevenue + s.batchRevenue - s.posCost - s.batchFoodCost - s.wastage - s.laborCost - s.expenses),
    ]);
    openPrintWindow({
      title: `تقرير إغلاق اليوم — ${dayLabel()}`,
      subtitle: `${new Date().toLocaleString('ar-SA-u-nu-latn')} — ${selectedBranches.length} فرع`,
      meta: [
        ['اليوم التشغيلي', dayLabel()],
        ['عدد الفروع', `${selectedBranches.length}`],
        ['إجمالي المبيعات', fmtMoney(grossSales)],
        ['Food Cost', `${foodCost > 0 && grossSales > 0 ? ((foodCost / grossSales) * 100).toFixed(2) : 0}% (${fmtMoney(foodCost)})`],
        ['الربح التقديري', fmtMoney(profit)],
        ['حالة اليوم', isClosedDay || closed ? 'مُقفَل' : 'مفتوح'],
      ],
      tables: [{
        title: 'تفصيل الفروع',
        header: ['الفرع', 'أوامر', 'المبيعات', 'تكلفة الطعام', 'الهالك', 'الرواتب', 'مصروفات', 'الربح التقديري'],
        rows,
      }],
      footer: 'RestoCost ERP Pro — End of Day Closing',
    });
    setMsg('صدر تقرير الإغلاق اليومي');
    setTimeout(() => setMsg(''), 3000);
  };

  const stepLabels: Record<Step, { label: string; desc: string }> = {
    select: { label: '1. اختيار اليوم والفروع', desc: 'اختر التاريخ والفروع المراد إغلاقها' },
    review: { label: '2. مراجعة اليوم', desc: 'استعراض مبيعات وتكاليف اليوم لكل فرع' },
    closing: { label: '3. تنفيذ الإغلاق', desc: 'إقفال اليوم ومنع الحركة بعده' },
    report: { label: '4. تقرير الإغلاق', desc: 'إصدار التقرير النهائي لليوم' },
    done: { label: 'مكتمل', desc: 'تم إغلاق اليوم بنجاح' },
  };
  const stepOrder: Step[] = ['select', 'review', 'closing', 'report', 'done'];

  return (
    <div className="space-y-6">
      <PageHeader title="معالج إغلاق اليوم (نهاية الدوام)" subtitle="خطوات موجهة لإقفال اليوم التشغيلي، مراجعة الحصيلة، وإصدار التقرير النهائي" icon={<Moon className="w-6 h-6 text-indigo-300" />}
        actions={
          <>
            <Btn tone="ghost" onClick={() => setStep('select')}>بدء جديد</Btn>
          </>
        } />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          {(Object.keys(stepLabels) as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 ${
                  stepOrder.indexOf(step) >= i ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-300 text-slate-400'
                }`}>{i + 1}</div>
                {i < stepOrder.length - 1 && <div className={`w-12 md:w-16 h-1 mx-2 ${stepOrder.indexOf(step) > i ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="mt-2 text-center text-xs text-slate-500">{stepLabels[step].label} — {stepLabels[step].desc}</div>
      </Card>

      {msg && <div className="fixed bottom-4 right-4 rounded-xl p-3 font-bold border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs shadow-lg z-50">{msg}</div>}

      {step === 'select' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 1: اختيار اليوم والفروع" icon={<Moon className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="التاريخ (YYYY-MM-DD)">
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">الفروع المتاحة: {visibleBranches.length}</label>
              <div className="max-h-60 overflow-auto space-y-1">
                {visibleBranches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedBranches.includes(b.id)} onChange={(e) => setSelectedBranches(e.target.checked ? [...selectedBranches, b.id] : selectedBranches.filter((id) => id !== b.id))} className="w-4 h-4 accent-indigo-600" />
                    <span>{b.nameAr}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {isClosedDay && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
              <AlertCircle className="w-4 h-4" /> هذا اليوم ( {day} ) مُقفَل بالفعل — سيستعرض المعالج تقرير مراجعة دون تنفيذ إغلاق جديد.
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Btn tone="success" onClick={nextStep} disabled={selectedBranches.length === 0}>
              <ArrowRight className="w-4 h-4" /> التالي
            </Btn>
          </div>
        </Card>
      )}

      {step === 'review' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 2: مراجعة حصيلة اليوم" subtitle={`اليوم: ${dayLabel()}`} icon={<FileText className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200"><span className="text-slate-500 text-[11px] block">إجمالي المبيعات</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(grossSales)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200"><span className="text-slate-500 text-[11px] block">Food Cost</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{grossSales > 0 ? fmt((foodCost / grossSales) * 100, 1) : 0}%</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200"><span className="text-slate-500 text-[11px] block">الهالك</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmtMoney(totals.wastage)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200"><span className="text-slate-500 text-[11px] block">رواتب اليوم</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(totals.laborCost)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200"><span className="text-slate-500 text-[11px] block">الربح التقديري</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmtMoney(profit)}</strong></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3">الفرع</th><th className="p-3">أوامر</th><th className="p-3">المبيعات</th><th className="p-3">تكلفة الطعام</th><th className="p-3">الهالك</th><th className="p-3">رواتب</th><th className="p-3">مصروفات</th><th className="p-3">الربح</th><th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sel.map((s) => (
                  <tr key={s.branchId} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{s.branchName}</td>
                    <td className="p-3 font-mono">{s.orders}</td>
                    <td className="p-3 font-mono font-bold text-emerald-700">{fmtMoney(s.posRevenue + s.batchRevenue)}</td>
                    <td className="p-3 font-mono">{fmtMoney(s.posCost + s.batchFoodCost)}</td>
                    <td className="p-3 font-mono text-rose-700">{fmtMoney(s.wastage)}</td>
                    <td className="p-3 font-mono">{fmtMoney(s.laborCost)}</td>
                    <td className="p-3 font-mono">{fmtMoney(s.expenses)}</td>
                    <td className="p-3 font-mono font-bold">{fmtMoney(s.posRevenue + s.batchRevenue - s.posCost - s.batchFoodCost - s.wastage - s.laborCost - s.expenses)}</td>
                    <td className="p-3">{isClosedDay ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">مُقفَل</span> : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">مفتوح</span>}</td>
                  </tr>
                ))}
                {sel.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500 font-bold">اختر فرعاً واحداً على الأقل</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between">
            <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
            <div className="flex gap-2">
              {isClosedDay && <Btn tone="ghost" onClick={() => { reopenDay(day); setMsg(`أُعيد فتح يوم ${day}`); setTimeout(() => setMsg(''), 3000); }}><Unlock className="w-4 h-4" /> إعادة فتح</Btn>}
              <Btn tone="success" onClick={nextStep} disabled={sel.length === 0 || isClosedDay}>التالي <ArrowRight className="w-4 h-4" /></Btn>
            </div>
          </div>
        </Card>
      )}

      {step === 'closing' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 3: تنفيذ إغلاق اليوم" icon={<Lock className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="font-bold text-amber-800 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> سيتم إقفال يوم {dayLabel()} لـ {selectedBranches.length} فرع.</p>
              <p className="text-xs text-amber-700 mt-1 font-bold">بعد الإقفال يُمنع إضافة أو تعديل أو حذف أي حركة على هذا التاريخ (مبيعات، مشتريات، مخزون، هالك) حتى يُعاد فتحه يدوياً.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl"><span className="text-[11px] text-slate-500 block">إجمالي المبيعات</span><strong className="font-mono text-emerald-700 block">{fmtMoney(grossSales)}</strong></div>
              <div className="bg-slate-50 p-3 rounded-xl"><span className="text-[11px] text-slate-500 block">تكلفة الطعام</span><strong className="font-mono text-indigo-700 block">{fmtMoney(foodCost)}</strong></div>
              <div className="bg-slate-50 p-3 rounded-xl"><span className="text-[11px] text-slate-500 block">الهالك</span><strong className="font-mono text-rose-700 block">{fmtMoney(totals.wastage)}</strong></div>
              <div className="bg-slate-50 p-3 rounded-xl"><span className="text-[11px] text-slate-500 block">الربح التقديري</span><strong className="font-mono text-slate-900 block">{fmtMoney(profit)}</strong></div>
            </div>
            <div className="flex justify-between">
              <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
              <Btn tone="danger" onClick={() => { runClosing(); nextStep(); }}>
                <Lock className="w-4 h-4" /> تأكيد إغلاق اليوم
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {step === 'report' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 4: تقرير الإغلاق اليومي" icon={<FileText className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 space-y-3 text-center">
            <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold"><CheckCircle2 className="w-5 h-5" /> تم إقفال اليوم بنجاح</div>
            <p className="text-xs text-slate-500">أصدر التقرير النهائي (PDF) لتوثيق الحصيلة قبل اعتماد الإغلاق نهائياً.</p>
            <div className="flex justify-center gap-2">
              <Btn tone="primary" onClick={runReport}><FileText className="w-4 h-4" /> إصدار التقرير النهائي</Btn>
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
            <Btn tone="success" onClick={nextStep}>التالي <ArrowRight className="w-4 h-4" /></Btn>
          </div>
        </Card>
      )}

      {step === 'done' && (
        <Card className="p-5 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-extrabold text-emerald-800 mb-2">تم إغلاق الليلة بنجاح</h3>
          <p className="text-slate-600 mb-2">اليوم: <span className="font-bold text-indigo-700">{dayLabel()}</span> — الفروع: <span className="font-bold">{selectedBranches.length}</span></p>
          <p className="text-[11px] font-bold text-slate-500 mb-4">الربح التقديري لليوم: {fmtMoney(profit)} — Food Cost: {grossSales > 0 ? fmt((foodCost / grossSales) * 100, 1) : 0}%</p>
          <div className="flex justify-center gap-2">
            <Btn onClick={() => { setStep('select'); setSelectedBranches([]); setClosed(false); }} tone="ghost">إغلاق يوم آخر</Btn>
            {!isClosedDay && <Btn tone="danger" onClick={runClosing}><Lock className="w-4 h-4" /> قفل اليوم أيضاً مدنياً</Btn>}
          </div>
        </Card>
      )}
    </div>
  );
};