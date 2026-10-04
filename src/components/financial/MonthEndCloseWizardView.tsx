import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, Lock, ArrowRight, ArrowLeft, Calculator, FileText, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Modal, Field, inputCls } from '../ui';
import { fmtMoney, monthLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

type Step = 'select' | 'review' | 'closing' | 'pl' | 'lock' | 'done';

interface BranchStatus {
  branchId: string;
  branchName: string;
  hasOpenPeriod: boolean;
  periodId?: string;
  status: 'counting' | 'review' | 'closed';
  totalVarianceCost: number;
  itemsCount: number;
}

export const MonthEndCloseWizardView: React.FC = () => {
  const {
    branches, visibleBranchIds, monthlyInventory,
    closeMonthlyInventory, rebuildPLSummaries,
  } = useApp();

  const [step, setStep] = useState<Step>('select');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [closingBranch, setClosingBranch] = useState<string | null>(null);
  const [closingResults, setClosingResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [plBuilt, setPlBuilt] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');

  const branchStatuses = useMemo((): BranchStatus[] => {
    return visibleBranches.map((b) => {
      const period = monthlyInventory.find((p) => p.branchId === b.id && p.monthKey === month);
      if (!period) return { branchId: b.id, branchName: b.nameAr, hasOpenPeriod: false, status: 'closed' as const, totalVarianceCost: 0, itemsCount: 0 };
      return {
        branchId: b.id,
        branchName: b.nameAr,
        hasOpenPeriod: true,
        periodId: period.id,
        status: period.status,
        totalVarianceCost: period.totalVarianceCost,
        itemsCount: period.items.filter((it) => it.countedQty !== 0 || it.varianceQty !== 0).length,
      };
    });
  }, [monthlyInventory, month, visibleBranches]);

  const openCount = branchStatuses.filter((s) => s.hasOpenPeriod && s.status === 'counting').length;
  const totalVariance = branchStatuses.reduce((s, b) => s + b.totalVarianceCost, 0);

  const nextStep = () => {
    if (step === 'select') setStep('review');
    else if (step === 'review') setStep('closing');
    else if (step === 'closing') setStep('pl');
    else if (step === 'pl') setStep('lock');
    else if (step === 'lock') setStep('done');
  };

  const prevStep = () => {
    if (step === 'review') setStep('select');
    else if (step === 'closing') setStep('review');
    else if (step === 'pl') setStep('closing');
    else if (step === 'lock') setStep('pl');
  };

  const runClosing = async () => {
    setClosing(true);
    const results: Record<string, { ok: boolean; error?: string }> = {};
    for (const branchId of selectedBranches) {
      const bStatus = branchStatuses.find((s) => s.branchId === branchId);
      if (!bStatus?.hasOpenPeriod || bStatus.status !== 'counting') continue;
      setClosingBranch(bStatus.branchName);
      try {
        closeMonthlyInventory(bStatus.periodId!);
        results[branchId] = { ok: true };
      } catch (e: any) {
        results[branchId] = { ok: false, error: e.message };
      }
    }
    setClosingResults(results);
    setClosing(false);
    setClosingBranch(null);
  };

  const runPL = () => {
    rebuildPLSummaries(month);
    setPlBuilt(true);
    setMsg('تم إعادة بناء قائمة الدخل الموحدة');
    setTimeout(() => setMsg(''), 3000);
  };

  const runLock = () => {
    // closedMonths is updated by closeMonthlyInventory; here we just confirm
    setLocked(true);
    setMsg('تم إقفال الشهر ومنع الحركة');
    setTimeout(() => setMsg(''), 3000);
  };

  const printSummary = () => {
    const rows = branchStatuses.filter((b) => selectedBranches.includes(b.branchId)).map((b) => [
      b.branchName,
      b.hasOpenPeriod ? (b.status === 'closed' ? 'مُقفَل' : 'مفتوح') : 'لا يوجد جرد',
      b.itemsCount,
      fmtMoney(b.totalVarianceCost),
    ]);
    openPrintWindow({
      title: `ملخص إقفال الشهر — ${monthLabel(month)}`,
      subtitle: `${selectedBranches.length} فرع — ${new Date().toLocaleString('ar-SA-u-nu-latn')}`,
      meta: [
        ['الشهر', monthLabel(month)],
        ['عدد الفروع', `${selectedBranches.length}`],
        ['إجمالي انحراف الجرد', fmtMoney(totalVariance)],
      ],
      tables: [{
        title: 'تفصيل الفروع',
        header: ['الفرع', 'حالة الجرد', 'أصناف معدودة', 'تكلفة الانحراف'],
        rows,
      }],
      footer: 'RestoCost ERP Pro — Month-End Close Wizard',
    });
  };

  const stepLabels: Record<Step, { label: string; desc: string }> = {
    select: { label: '1. اختيار الشهر والفروع', desc: 'اختر الشهر والفروع المراد إقفالها' },
    review: { label: '2. مراجعة الجرد', desc: 'تأكد من حالة الجرد لكل فرع' },
    closing: { label: '3. إقفال الجرد', desc: 'تنفيذ إقفال الجرد وإنشاء القيود المحاسبية' },
    pl: { label: '4. قائمة الدخل', desc: 'إعادة بناء قائمة الدخل الموحدة (P&L)' },
    lock: { label: '5. إقفال الشهر', desc: 'منع أي حركة على الشهر المقفل' },
    done: { label: 'مكتمل', desc: 'تم إقفال الشهر بنجاح' },
  };

  return (
    <div className="space-y-6">
      <PageHeader title="معالج إقفال نهاية الشهر" subtitle="خطوات موجهة لإقفال الجرد الشهري، بناء قائمة الدخل، وقفل الفترة" icon={<Lock className="w-6 h-6 text-indigo-600" />}
        actions={
          <>
            <Btn tone="ghost" onClick={printSummary} disabled={step !== 'done'}><FileText className="w-4 h-4" /> طباعة الملخص</Btn>
            <Btn tone="ghost" onClick={() => setStep('select')}>بدء جديد</Btn>
          </>
        } />

      {/* Progress Steps */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          {(Object.keys(stepLabels) as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 ${
                  (['select', 'review', 'closing', 'pl', 'lock', 'done'].indexOf(step) >= i)
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-100 border-slate-300 text-slate-400'
                }`}>
                  {i + 1}
                </div>
                {i < 5 && <div className={`w-16 h-1 mx-2 ${
                  (['select', 'review', 'closing', 'pl', 'lock', 'done'].indexOf(step) > i)
                    ? 'bg-indigo-600' : 'bg-slate-200'
                }`} />}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="mt-2 text-center text-xs text-slate-500">
          {stepLabels[step].label} — {stepLabels[step].desc}
        </div>
      </Card>

      {msg && <div className="fixed bottom-4 right-4 rounded-xl p-3 font-bold border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs shadow-lg z-50">{msg}</div>}

      {/* Step 1: Select Month & Branches */}
      {step === 'select' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 1: اختيار الشهر والفروع" icon={<Calculator className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="الشهر (YYYY-MM)">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} max={new Date().toISOString().slice(0, 7)} />
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
          <div className="mt-4 flex justify-end">
            <Btn tone="success" onClick={nextStep} disabled={selectedBranches.length === 0}>
              <ArrowRight className="w-4 h-4" /> التالي
            </Btn>
          </div>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === 'review' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 2: مراجعة حالة الجرد" subtitle={`الشهر: ${monthLabel(month)}`} icon={<FileText className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3">الفرع</th>
                  <th className="p-3">حالة الجرد</th>
                  <th className="p-3">أصناف معدودة</th>
                  <th className="p-3">تكلفة الانحراف</th>
                  <th className="p-3">جاهز للإقفال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchStatuses.filter((b) => selectedBranches.includes(b.branchId)).map((b) => (
                  <tr key={b.branchId} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{b.branchName}</td>
                    <td className="p-3">
                      {b.hasOpenPeriod ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {b.status === 'closed' ? 'مُقفَل' : 'قيد الجرد'}
                        </span>
                      ) : <span className="text-slate-500">لا يوجد جرد</span>}
                    </td>
                    <td className="tnum text-left p-3">{b.itemsCount}</td>
                    <td className="tnum text-left p-3 font-bold">{fmtMoney(b.totalVarianceCost)}</td>
                    <td className="p-3">
                      {b.hasOpenPeriod && b.status === 'counting'
                        ? <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                        : b.hasOpenPeriod && b.status === 'closed'
                          ? <AlertCircle className="w-5 h-5 text-amber-600 mx-auto" />
                          : <XCircle className="w-5 h-5 text-slate-400 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between">
            <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
            <Btn tone="success" onClick={nextStep} disabled={openCount === 0}>التالي <ArrowRight className="w-4 h-4" /></Btn>
          </div>
        </Card>
      )}

      {/* Step 3: Closing */}
      {step === 'closing' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 3: إقفال الجرد وإنشاء القيود" icon={<Lock className="w-5 h-5 text-indigo-500" />} />
          {closing ? (
            <div className="mt-4 space-y-4 text-center">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <p className="font-bold text-slate-700">جاري إقفال الجرد...</p>
              <p className="text-slate-500">الفرع الحالي: {closingBranch}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">سيتم إقفال الجرد لـ <strong>{openCount}</strong> فرع وإنشاء القيود المحاسبية للانحرافات.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead><tr className="bg-slate-100"><th className="p-2">الفرع</th><th className="p-2">انحراف</th><th className="p-2">النتيجة</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {branchStatuses.filter((b) => selectedBranches.includes(b.branchId) && b.hasOpenPeriod && b.status === 'counting').map((b) => (
                      <tr key={b.branchId}>
                        <td className="p-2 font-bold">{b.branchName}</td>
                        <td className="tnum text-left p-2">{fmtMoney(b.totalVarianceCost)}</td>
                        <td className="p-2">
{closingResults[b.branchId]?.ok ? <CheckCircle className="w-5 h-5 text-emerald-600 mx-auto" /> :
                            closingResults[b.branchId]?.ok === false ? <XCircle className="w-5 h-5 text-rose-600 mx-auto" /> :
                            <span className="text-slate-400">في الانتظار</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-between">
                <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
                <Btn tone="success" onClick={runClosing} disabled={closing || openCount === 0}>
                  {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تنفيذ الإقفال'} <ArrowRight className="w-4 h-4" />
                </Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: P&L */}
      {step === 'pl' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 4: إعادة بناء قائمة الدخل الموحدة (P&L)" icon={<Calculator className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 space-y-3 text-center">
            <p className="text-slate-600">هذا سيجمع المبيعات، المشتريات، الرواتب، الهالك، والمصروفات لكل فرع ويبني قائمة دخل موحدة.</p>
            <div className="flex justify-center gap-2">
              <Btn tone="primary" onClick={runPL} disabled={plBuilt}>
                {plBuilt
                  ? <><CheckCircle2 className="w-4 h-4" /> تم البناء</>
                  : <><RefreshCw className="w-4 h-4" /> بناء P&L</>}
              </Btn>
            </div>
            {plBuilt && <p className="text-emerald-600 font-bold">تم بناء قائمة الدخل الموحدة للشهر <span className="font-mono">{monthLabel(month)}</span></p>}
          </div>
          <div className="mt-4 flex justify-between">
            <Btn tone="ghost" onClick={prevStep}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
            <Btn tone="success" onClick={nextStep} disabled={!plBuilt}>التالي <ArrowRight className="w-4 h-4" /></Btn>
          </div>
        </Card>
      )}

      {/* Step 5: Lock */}
      {step === 'lock' && (
        <Card className="p-5">
          <SectionHeader title="الخطوة 5: إقفال الشهر النهائي" icon={<Lock className="w-5 h-5 text-rose-500" />} />
          <div className="mt-4 space-y-3">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="font-bold text-rose-800 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> تحذير: هذا الإجراء لا يمكن التراجع عنه بسهولة.</p>
              <p className="text-sm text-rose-700 mt-1">سيتم إضافة الشهر <span className="font-mono">{monthLabel(month)}</span> إلى قائمة الشهور المقفلة، مما سيمنع أي حركة مخزون، مبيعات، أو مشتريات على هذا الشهر.</p>
            </div>
            <div className="flex justify-center">
              <Btn tone="danger" onClick={() => { runLock(); nextStep(); }}>
                <Lock className="w-4 h-4" /> تأكيد إقفال الشهر
              </Btn>
            </div>
            {locked && <p className="text-emerald-600 font-bold text-center">تم إقفال الشهر ومنع الحركة.</p>}
          </div>
          <div className="mt-4 flex justify-between">
            <Btn tone="ghost" onClick={prevStep} disabled={locked}><ArrowLeft className="w-4 h-4" /> رجوع</Btn>
            {locked && <Btn tone="success" onClick={nextStep}>مكتمل <CheckCircle2 className="w-4 h-4" /></Btn>}
          </div>
        </Card>
      )}

      {/* Step 6: Done */}
      {step === 'done' && (
        <Card className="p-5 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-extrabold text-emerald-800 mb-2">تم إقفال الشهر بنجاح</h3>
          <p className="text-slate-600 mb-4">الشهر: <span className="font-bold text-indigo-700">{monthLabel(month)}</span> — الفروع: <span className="font-bold">{selectedBranches.length}</span></p>
          <div className="flex justify-center gap-2">
            <Btn onClick={printSummary} tone="primary"><FileText className="w-4 h-4" /> طباعة الملخص</Btn>
            <Btn onClick={() => { setStep('select'); setSelectedBranches([]); setClosingResults({}); setPlBuilt(false); setLocked(false); }} tone="ghost">إقفال شهر آخر</Btn>
          </div>
        </Card>
      )}

      {/* Confirm Modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="تأكيد" wide>
        <p className="font-bold text-slate-700">هل أنت متأكد من تنفيذ هذا الإجراء؟</p>
        <div className="flex justify-end gap-2 pt-2">
          <Btn tone="ghost" onClick={() => setShowConfirm(false)}>إلغاء</Btn>
          <Btn tone="danger" onClick={() => { setShowConfirm(false); }}>تأكيد</Btn>
        </div>
      </Modal>
    </div>
  );
};