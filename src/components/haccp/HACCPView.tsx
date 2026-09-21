import React, { useState } from 'react';
import { Thermometer, ClipboardCheck, AlertTriangle, ShieldCheck, Plus, Printer, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, DateText } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { tempStatusOf, TEMP_RANGES, DEFAULT_INSPECTION_TEMPLATE } from '../../types';

const STORAGE_LABEL: Record<string, string> = { frozen: 'مجمد', chilled: 'مبرد', dry: 'جاف' };

export const HACCPView: React.FC = () => {
  const { currentUser, tempLogs, addTempLog, deleteTempLog, haccpInspections, addHaccpInspection, branches, visibleBranchIds, getBranchName, showToast, expiringBatches } = useApp();
  const [filterBranch, setFilterBranch] = useState('all');
  const [showTempModal, setShowTempModal] = useState(false);
  const [showInspModal, setShowInspModal] = useState(false);

  const [tempForm, setTempForm] = useState({ branchId: '', location: '', storageType: 'chilled' as 'frozen' | 'chilled' | 'dry', temperature: '', note: '' });
  const [inspForm, setInspForm] = useState({ branchId: '', type: 'daily' as 'daily' | 'weekly' | 'monthly', items: DEFAULT_INSPECTION_TEMPLATE.map((t) => ({ ...t, passed: false })), notes: '' });

  const defaultBranch = visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '';
  const nowIso = () => new Date().toISOString();

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = tempLogs.filter((t) => t.date.slice(0, 10) === todayKey);
  const lastInspection = haccpInspections[0];
  const lastInspectionDays = lastInspection ? Math.floor((Date.now() - new Date(lastInspection.date).getTime()) / 86400000) : null;
  const { expired, soon } = expiringBatches(7);

  const filteredLogs = tempLogs.filter((t) => filterBranch === 'all' || t.branchId === filterBranch);
  const okCount = filteredLogs.filter((t) => tempStatusOf(t) === 'ok').length;
  const warnCount = filteredLogs.filter((t) => tempStatusOf(t) === 'warning').length;
  const critCount = filteredLogs.filter((t) => tempStatusOf(t) === 'critical').length;

  const overall = tempLogs.length > 0
    ? Math.round((tempLogs.filter((t) => tempStatusOf(t) !== 'critical').length / tempLogs.length) * 100)
    : 100;
  const inspPass = haccpInspections.filter((i) => i.overallPassed).length;
  const compliance = Math.round(((haccpInspections.length > 0 ? inspPass / haccpInspections.length : 1) * 0.5 + overall / 100 * 0.5) * 100);

  const saveTemp = () => {
    const t = Number(tempForm.temperature);
    const bid = tempForm.branchId || defaultBranch;
    if (!bid || !isFinite(t)) { showToast('أكمل الفرع وقيمة الحرارة'); return; }
    addTempLog({ date: nowIso(), branchId: bid, location: tempForm.location || STORAGE_LABEL[tempForm.storageType], storageType: tempForm.storageType, temperature: t, note: tempForm.note });
    setShowTempModal(false);
    setTempForm({ branchId: '', location: '', storageType: 'chilled', temperature: '', note: '' });
  };

  const saveInspection = () => {
    const bid = inspForm.branchId || defaultBranch;
    if (!bid) { showToast('اختر الفرع'); return; }
    const passedCount = inspForm.items.filter((i) => i.passed).length;
    addHaccpInspection({ date: nowIso(), branchId: bid, type: inspForm.type, inspector: currentUser?.name || 'المستخدم', items: inspForm.items, overallPassed: passedCount === inspForm.items.length, notes: inspForm.notes });
    setShowInspModal(false);
    setInspForm({ branchId: '', type: 'daily', items: DEFAULT_INSPECTION_TEMPLATE.map((t) => ({ ...t, passed: false })), notes: '' });
  };

  const printReport = () => {
    openPrintWindow({
      title: 'تقرير الامتثال — سلامة الغذاء (HACCP)',
      subtitle: `${compliance}% امتثال`,
      meta: [
        ['نطاق', filterBranch === 'all' ? 'كل الفروع' : getBranchName(filterBranch)],
        ['قياسات الحرارة', `${filteredLogs.length}`],
        ['ضمن النطاق', `${okCount}`],
        ['تحذير', `${warnCount}`],
        ['حرج', `${critCount}`],
        ['تفتيشات', `${haccpInspections.length}`],
        ['ناجحة', `${inspPass}`],
        ['دفعات منتهية', `${expired.length}`],
        ['تنتهي قريباً', `${soon.length}`],
      ],
      tables: [
        {
          title: 'سجل درجات الحرارة',
          header: ['#', 'التاريخ', 'الفرع', 'الموقع', 'النوع', 'الحرارة °م', 'الحالة', 'سجّلها'],
          rows: filteredLogs.slice(0, 200).map((t, i) => [i + 1, t.date.slice(0, 10) + ' ' + t.date.slice(11, 16), getBranchName(t.branchId), t.location, STORAGE_LABEL[t.storageType], fmt(t.temperature, 1), tempStatusOf(t) === 'ok' ? 'ضمن النطاق' : tempStatusOf(t) === 'warning' ? 'تحذير' : 'حرج', t.recordedBy]),
        },
        {
          title: 'تقارير التفتيش الأخيرة (10)',
          header: ['#', 'التاريخ', 'الفرع', 'النوع', 'البنود', 'النتيجة', 'المفتش'],
          rows: haccpInspections.slice(0, 10).map((i, x) => [x + 1, i.date.slice(0, 10), getBranchName(i.branchId), i.type, `${i.items.filter((q) => q.passed).length}/${i.items.length}`, i.overallPassed ? 'ناجح' : 'ملاحظات', i.inspector]),
        },
      ],
      footer: 'تقرير تلقائي من لوحة سلامة الغذاء (HACCP) — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="سلامة الغذاء (HACCP)" subtitle="تتبع درجات حرارة التخزين، التفتيش اليومي، وتتبع الدفعات FEFO — امتثال سلامة الغذاء" icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />}
        actions={<>
          <ViewToolbar
            filename="سلامة_الغذاء"
            sheets={[
              { name: 'درجات الحرارة', header: ['التاريخ', 'الفرع', 'الموقع', 'النوع', 'الحرارة', 'الحالة', 'سجلها'], rows: filteredLogs.map((t) => [t.date.slice(0, 10), getBranchName(t.branchId), t.location, STORAGE_LABEL[t.storageType], fmt(t.temperature, 1), tempStatusOf(t), t.recordedBy]) },
              { name: 'التفتيش', header: ['التاريخ', 'الفرع', 'النوع', 'البنود', 'النتيجة', 'المفتش'], rows: haccpInspections.map((i) => [i.date.slice(0, 10), getBranchName(i.branchId), i.type, i.items.length, i.overallPassed ? 'ناجح' : 'ملاحظات', i.inspector]) },
            ]}
          />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> تقرير الامتثال</Btn>
          <Btn onClick={() => setShowInspModal(true)}><ClipboardCheck className="w-4 h-4" /> تفتيش جديد</Btn>
          <Btn onClick={() => setShowTempModal(true)}><Plus className="w-4 h-4" /> تسجيل حرارة</Btn>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-emerald-600"><ShieldCheck className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">نسبة الامتثال</span></div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2 font-mono">{compliance}%</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">قراءات حرارة + تفتيشات</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-indigo-600"><Thermometer className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">قراءات اليوم</span></div>
          <p className="text-2xl font-extrabold text-indigo-700 mt-2 font-mono">{todayLogs.length}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">آخر قراءة: {todayLogs[0] ? fmt(todayLogs[0].temperature, 1) + '°' : '—'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-amber-600"><ClipboardCheck className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">آخر تفتيش</span></div>
          <p className="text-2xl font-extrabold text-amber-700 mt-2 font-mono">{lastInspectionDays === null ? '—' : `${lastInspectionDays} يوم`}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">{lastInspection ? (lastInspection.overallPassed ? 'ناجح ✓' : 'به ملاحظات') : 'لا يوجد بعد'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-rose-600"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">صلاحية قريبة/منتهية</span></div>
          <p className="text-2xl font-extrabold text-rose-700 mt-2 font-mono">{soon.length + expired.length}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">{expired.length} منتهية · {soon.length} خلال 7 أيام</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="all">كل الفروع</option>
          {branches.filter((b) => b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">ضمن النطاق: {okCount}</span>
          <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg">تحذير: {warnCount}</span>
          <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg">حرج: {critCount}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Thermometer className="w-4 h-4 text-indigo-500" /> سجل درجات الحرارة</h3>
          <span className="text-[10px] font-bold text-slate-400">{filteredLogs.length} قراءة</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-bold">التاريخ</th>
                <th className="pb-2 font-bold">الفرع</th>
                <th className="pb-2 font-bold">الموقع</th>
                <th className="pb-2 font-bold">النوع</th>
                <th className="pb-2 font-bold">الحرارة</th>
                <th className="pb-2 font-bold">الحالة</th>
                <th className="pb-2 font-bold">سجّلها</th>
                <th className="pb-2 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 60).map((t) => {
                const st = tempStatusOf(t);
                return (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2.5"><DateText value={t.date} /></td>
                    <td className="py-2.5 text-xs text-slate-600 font-bold">{getBranchName(t.branchId)}</td>
                    <td className="py-2.5 text-xs font-bold text-slate-800">{t.location}</td>
                    <td className="py-2.5"><span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{STORAGE_LABEL[t.storageType]}</span></td>
                    <td className="py-2.5 font-mono font-extrabold text-xs" dir="ltr">{fmt(t.temperature, 1)}° <span className="text-slate-400 text-[10px]">({TEMP_RANGES[t.storageType].max}°) </span></td>
                    <td className="py-2.5">{st === 'ok' ? <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">ضمن النطاق</span> : st === 'warning' ? <span className="text-[10px] font-extrabold bg-amber-50 text-amber-700 px-2 py-1 rounded-full">تحذير</span> : <span className="text-[10px] font-extrabold bg-rose-100 text-rose-700 px-2 py-1 rounded-full">حرج</span>}</td>
                    <td className="py-2.5 text-[11px] text-slate-500 font-bold">{t.recordedBy}</td>
                    <td className="py-2.5"><button onClick={() => deleteTempLog(t.id)} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400 text-xs font-bold">لا توجد قراءات — سجّل أول قراءة حرارة من الزر أعلاه</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4 text-emerald-500" /> تقارير التفتيش الأخيرة</h3>
          <div className="space-y-2">
            {haccpInspections.slice(0, 8).map((i) => (
              <div key={i.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  {i.overallPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                  <div>
                    <p className="text-xs font-bold text-slate-800">{i.inspector} — {getBranchName(i.branchId)}</p>
                    <p className="text-[10px] text-slate-400 font-bold"><DateText value={i.date} /> · {i.type === 'daily' ? 'يومي' : i.type === 'weekly' ? 'أسبوعي' : 'شهري'} · {i.items.filter((q) => q.passed).length}/{i.items.length} بنود</p>
                  </div>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${i.overallPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{i.overallPassed ? 'ناجح' : 'ملاحظات'}</span>
              </div>
            ))}
            {haccpInspections.length === 0 && <p className="text-center text-slate-400 text-xs font-bold py-8">لا توجد تقارير تفتيش بعد</p>}
          </div>
          {lastInspection && !lastInspection.overallPassed && (
            <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl p-3">
              <p className="mb-1.5">بنود بحاجة لمعالجة في آخر تفتيش:</p>
              <ul className="space-y-1">
                {lastInspection.items.filter((q) => !q.passed).map((q) => <li key={q.key} className="flex items-center gap-1.5"><XCircle className="w-3 h-3" /> {q.label}</li>)}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> تنبيهات الصلاحية (FEFO)</h3>
          <div className="space-y-2">
            {[...expired.slice(0, 4), ...soon.slice(0, 4)].map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">{''}</p>
                  <p className="text-[10px] text-slate-400 font-bold"># {b.batchNumber} · <span dir="ltr">{b.expiryDate.slice(0, 10)}</span> · باقي {fmt(b.remainingQty, 1)}</p>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${expired.some((x) => x.id === b.id) ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{expired.some((x) => x.id === b.id) ? 'منتهية' : 'قريبة'}</span>
              </div>
            ))}
            {expired.length + soon.length === 0 && <p className="text-center text-slate-400 text-xs font-bold py-8">لا توجد دُفعات قريبة/منتهية الصلاحية</p>}
          </div>
        </Card>
      </div>

      <Modal open={showTempModal} onClose={() => setShowTempModal(false)} title="تسجيل درجة حرارة وحدة تخزين">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفرع">
            <select value={tempForm.branchId} onChange={(e) => setTempForm({ ...tempForm, branchId: e.target.value })} className={inputCls}>
              <option value="">اختر</option>
              {branches.filter((b) => b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <Field label="نوع التخزين">
            <select value={tempForm.storageType} onChange={(e) => setTempForm({ ...tempForm, storageType: e.target.value as any })} className={inputCls}>
              {(['frozen', 'chilled', 'dry'] as const).map((s) => <option key={s} value={s}>{STORAGE_LABEL[s]} (الأمان حتى {TEMP_RANGES[s].max}°)</option>)}
            </select>
          </Field>
          <Field label="الموقع (الثلاجة/المنطقة)">
            <input value={tempForm.location} onChange={(e) => setTempForm({ ...tempForm, location: e.target.value })} className={inputCls} placeholder="مثال: ثلاجة اللحوم" />
          </Field>
          <Field label="درجة الحرارة °م">
            <input value={tempForm.temperature} onChange={(e) => setTempForm({ ...tempForm, temperature: e.target.value })} type="number" step="0.1" className={inputCls} placeholder="0.0" />
          </Field>
          <div className="col-span-2">
            <Field label="ملاحظات">
              <input value={tempForm.note} onChange={(e) => setTempForm({ ...tempForm, note: e.target.value })} className={inputCls} placeholder="اختياري" />
            </Field>
          </div>
        </div>
        <div className="pt-4 flex justify-end gap-2">
          <Btn tone="ghost" onClick={() => setShowTempModal(false)}>إلغاء</Btn>
          <Btn onClick={saveTemp}>حفظ القراءة</Btn>
        </div>
      </Modal>

      <Modal open={showInspModal} onClose={() => setShowInspModal(false)} title="تقرير تفتيش سلامة غذاء" wide>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="الفرع">
            <select value={inspForm.branchId} onChange={(e) => setInspForm({ ...inspForm, branchId: e.target.value })} className={inputCls}>
              <option value="">اختر</option>
              {branches.filter((b) => b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <Field label="النوع">
            <select value={inspForm.type} onChange={(e) => setInspForm({ ...inspForm, type: e.target.value as any })} className={inputCls}>
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
              <option value="monthly">شهري</option>
            </select>
          </Field>
        </div>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {inspForm.items.map((it, idx) => (
            <button key={it.key} onClick={() => setInspForm({ ...inspForm, items: inspForm.items.map((x, i) => (i === idx ? { ...x, passed: !x.passed } : x)) })}
              className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-colors ${it.passed ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
              {it.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-slate-300 shrink-0" />}
              {it.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Field label="ملاحظات">
            <input value={inspForm.notes} onChange={(e) => setInspForm({ ...inspForm, notes: e.target.value })} className={inputCls} placeholder="اختياري" />
          </Field>
        </div>
        <div className="pt-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500">{inspForm.items.filter((i) => i.passed).length}/{inspForm.items.length} بنود مقبولة</span>
          <div className="flex gap-2">
            <Btn tone="ghost" onClick={() => setShowInspModal(false)}>إلغاء</Btn>
            <Btn onClick={saveInspection} tone={inspForm.items.every((i) => i.passed) ? 'success' : 'primary'}>حفظ التفتيش</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};