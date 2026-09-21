import React, { useMemo, useState } from 'react';
import { Zap, CalendarClock, Play, Plus, Pencil, ToggleRight, ToggleLeft, BellRing, PackagePlus, ChefHat, Clock4, FileBarChart } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import type { ReportType, ReportFrequency, ScheduledReport } from '../../types';

const REPORT_LABELS: Record<ReportType, string> = {
  sales_summary: 'ملخص المبيعات', cost_report: 'تقرير التكلفة', pl_statement: 'قائمة الدخل (P&L)',
  inventory_report: 'مراجعة المخزون', wastage_report: 'تقرير الهالك', variance_report: 'انحراف أوامر الشراء',
};
const FREQ_LABELS: Record<ReportFrequency, string> = { daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً' };

const RULE_ICONS: Record<string, React.ReactNode> = {
  auto_po: <PackagePlus className="w-4 h-4" />,
  auto_workorder: <ChefHat className="w-4 h-4" />,
  expiry_alert: <Clock4 className="w-4 h-4" />,
  reports_due: <CalendarClock className="w-4 h-4" />,
};

interface Props {
  onNavigate: (tab: string) => void;
}

export const AutomationView: React.FC<Props> = ({ onNavigate }) => {
  const { automationRules, setAutomationRule, runAutomation, scheduledReports, setScheduledReport, addScheduledReport, runScheduledReport } = useApp();
  const [msg, setMsg] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'sales_summary' as ReportType, frequency: 'daily' as ReportFrequency, branchScope: 'all' as 'all' | 'current' });

  const dueReports = useMemo(() => {
    const dayMs = 86400000;
    const overdue = (r: ScheduledReport) => {
      if (!r.lastRun) return true;
      const since = Math.floor((Date.now() - new Date(r.lastRun).getTime()) / dayMs);
      const maxDays = r.frequency === 'daily' ? 1 : r.frequency === 'weekly' ? 7 : 30;
      return since >= maxDays;
    };
    return scheduledReports.filter((r) => r.enabled && overdue(r));
  }, [scheduledReports]);

  const nextRun = (r: ScheduledReport) => {
    if (!r.enabled) return '—';
    if (!r.lastRun) return 'فوراً';
    const d = new Date(r.lastRun);
    const step = r.frequency === 'daily' ? 1 : r.frequency === 'weekly' ? 7 : 30;
    d.setDate(d.getDate() + step);
    return d.toISOString().split('T')[0];
  };

  const openAdd = () => { setEditingId(null); setForm({ name: '', type: 'sales_summary', frequency: 'daily', branchScope: 'all' }); setShowModal(true); };
  const openEdit = (r: ScheduledReport) => { setEditingId(r.id); setForm({ name: r.name, type: r.type, frequency: r.frequency, branchScope: r.branchScope }); setShowModal(true); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) setScheduledReport(editingId, { name: form.name.trim(), type: form.type, frequency: form.frequency, branchScope: form.branchScope });
    else addScheduledReport({ name: form.name.trim(), type: form.type, frequency: form.frequency, branchScope: form.branchScope, enabled: true });
    setShowModal(false);
  };

  const runNow = (id: string) => {
    const tab = runScheduledReport(id);
    onNavigate(tab);
  };

  const doAutomation = () => {
    const res = runAutomation();
    setMsg(res.message);
    setTimeout(() => setMsg(''), 6000);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الأتمتة والتقارير المجدولة" subtitle="قواعد أتمتة تشغيلية (أوامر شراء وتصنيع تلقائية) وتقارير دورية تُجدول وتُشغّل بنقرة واحدة مع تنبيه عند الاستحقاق" icon={<Zap className="w-6 h-6 text-amber-300" />}
        actions={
          <ViewToolbar
            filename="الأتمتة_والتقارير"
            sheets={[
              { name: 'التقارير المجدولة', header: ['الاسم', 'النوع', 'الدورة', 'آخر تشغيل', 'التشغيل القادم', 'الحالة'], rows: scheduledReports.map((r) => [r.name, REPORT_LABELS[r.type], FREQ_LABELS[r.frequency], r.lastRun || '', nextRun(r), r.enabled ? (dueReports.some((d) => d.id === r.id) ? 'مستحق' : 'مجدول') : 'موقوف']) },
              { name: 'قواعد الأتمتة', header: ['القاعدة', 'الوصف', 'الحالة'], rows: automationRules.map((r) => [r.label, r.description, r.enabled ? 'مفعّلة' : 'موقوفة']) },
            ]}
          />
        } />

      {msg && <div className="rounded-xl p-3 font-bold text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2"><Zap className="w-4 h-4" /> {msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قواعد أتمتة مفعّلة</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{automationRules.filter((r) => r.enabled).length} / {automationRules.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تقارير مجدولة نشطة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{scheduledReports.filter((r) => r.enabled).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">تقارير مستحقة الآن</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1 flex items-center gap-1"><CalendarClock className="w-4 h-4" />{dueReports.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">توقيت آخر تنفيذ</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{new Date().toLocaleTimeString('ar-SA-u-nu-latn')}</strong></div>
      </div>

      {/* Automation rules */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="قواعد الأتمتة التشغيلية" subtitle="فعّل القواعد ثم اضغط تنفيذ لتطبيقها على البيانات الحالية" icon={<Zap className="w-5 h-5 text-amber-600" />} />
          <Btn onClick={doAutomation} tone="dark"><Zap className="w-4 h-4" /> تنفيذ الأتمتة الآن</Btn>
        </div>
        <div className="divide-y divide-slate-100">
          {automationRules.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.enabled ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{RULE_ICONS[r.key] || <Zap className="w-4 h-4" />}</span>
                <div>
                  <p className="text-xs font-extrabold text-slate-800">{r.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{r.description}</p>
                </div>
              </div>
              <button onClick={() => setAutomationRule(r.id, !r.enabled)} className={`shrink-0 flex items-center gap-1.5 text-[10px] font-extrabold px-3 py-1.5 rounded-xl border transition-colors ${r.enabled ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300'}`}>
                {r.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {r.enabled ? 'مفعّلة' : 'موقوفة'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Scheduled reports */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="التقارير المجدولة" subtitle="جدولة تقارير دورية — عند الاستحقاق يظهر تنبيه في مركز التنبيهات ويُفتح التقرير بالزر أدناه" icon={<CalendarClock className="w-5 h-5 text-indigo-600" />} />
          <Btn onClick={openAdd}><Plus className="w-4 h-4" /> إضافة تقرير مجدول</Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">التقرير</th><th className="p-3">النوع</th><th className="p-3">الدورة</th><th className="p-3">آخر تشغيل</th><th className="p-3">التشغيل القادم</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scheduledReports.map((r) => {
                const due = dueReports.some((d) => d.id === r.id);
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${due ? 'bg-amber-50/50' : ''}`}>
                    <td className="p-3 font-bold text-slate-900">{r.name}</td>
                    <td className="p-3 text-slate-600">{REPORT_LABELS[r.type]}</td>
                    <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{FREQ_LABELS[r.frequency]}</span></td>
                    <td className="p-3 font-mono text-slate-600">{r.lastRun || '—'}</td>
                    <td className="p-3 font-mono">{nextRun(r)}</td>
                    <td className="p-3">
                      <button onClick={() => setScheduledReport(r.id, { enabled: !r.enabled })} className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${r.enabled ? (due ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') : 'bg-slate-100 text-slate-500'}`}>
                        {r.enabled ? (due ? 'مستحق' : 'نشط') : 'موقوف'}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => runNow(r.id)} disabled={!r.enabled} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-30" title="تشغيل الآن"><Play className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {scheduledReports.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-bold">لا توجد تقارير مجدولة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
        <div className="flex items-start gap-3">
          <BellRing className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-extrabold text-indigo-950">كيف تعمل الأتمتة؟</p>
            <p className="text-xs text-indigo-800/80 mt-1 leading-relaxed">
              عند الضغط على "تنفيذ الأتمتة الآن": تُنشأ أوامر شراء تلقائياً من الأصناف التي انخفضت عن الحد الأدنى (حسب المورد)، وتُنشأ أوامر تصنيع للأصناف المصنّعة الناقصة بالمطبخ المركزي.
              التقارير المجدولة تتحقق من دورتها عند كل زيارة — وعند الاستحقاق يظهر تنبيه في جرس التنبيهات بالأعلى، و"تشغيل الآن" يفتح التقرير مباشرة ويحدّث آخر تشغيل.
            </p>
          </div>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل تقرير مجدول' : 'إضافة تقرير مجدول'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="اسم التقرير" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required /></Field>
          <Field label="نوع التقرير">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ReportType })} className={inputCls}>
              {(Object.keys(REPORT_LABELS) as ReportType[]).map((t) => <option key={t} value={t}>{REPORT_LABELS[t]}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الدورة">
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as ReportFrequency })} className={inputCls}>
                {(Object.keys(FREQ_LABELS) as ReportFrequency[]).map((f) => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </Field>
            <Field label="نطاق الفروع">
              <select value={form.branchScope} onChange={(e) => setForm({ ...form, branchScope: e.target.value as 'all' | 'current' })} className={inputCls}>
                <option value="all">جميع الفروع</option>
                <option value="current">فرع المستخدم فقط</option>
              </select>
            </Field>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-1.5"><FileBarChart className="w-4 h-4" /> حفظ</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};