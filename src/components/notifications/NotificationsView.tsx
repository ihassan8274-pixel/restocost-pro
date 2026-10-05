import React, { useMemo, useState } from 'react';
import { BellRing, AlertTriangle, PackageSearch, Clock4, FileText, Wallet, CalendarClock, Search, ExternalLink, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Field, inputCls } from '../ui';
import type { SystemNotification } from '../../types';

interface Props { onNavigate: (tab: string) => void; }

const TYPE_META: Record<SystemNotification['type'], { icon: React.ReactNode; label: string }> = {
  low_stock: { icon: <PackageSearch className="w-4 h-4" />, label: 'نقص مخزون' },
  expiry: { icon: <Clock4 className="w-4 h-4" />, label: 'انتهاء صلاحية' },
  overdue_invoice: { icon: <FileText className="w-4 h-4" />, label: 'فاتورة متأخرة' },
  expense_due: { icon: <Wallet className="w-4 h-4" />, label: 'مصروف متأخر' },
  cost_alert: { icon: <AlertTriangle className="w-4 h-4" />, label: 'انحراف تكلفة' },
  report_due: { icon: <CalendarClock className="w-4 h-4" />, label: 'تقرير مستحق' },
  task_assigned: { icon: <ListChecks className="w-4 h-4" />, label: 'مهمة مسنَدة' },
};

const SEVERITY_TONE: Record<SystemNotification['severity'], string> = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-sky-100 text-sky-700 border-sky-200',
};

export const NotificationsView: React.FC<Props> = ({ onNavigate }) => {
  const { getNotifications } = useApp();
  const notes = useMemo(() => getNotifications(), [getNotifications]); // eslint-disable-line react-hooks/exhaustive-deps

  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [desktopEnabled, setDesktopEnabled] = useState(() => localStorage.getItem('rcerp_desktop_notify') === '1');
  const [permHint, setPermHint] = useState(false);

  const toggleDesktop = async () => {
    const next = !desktopEnabled;
    setDesktopEnabled(next);
    localStorage.setItem('rcerp_desktop_notify', next ? '1' : '0');
    if (next) {
      if (typeof Notification === 'undefined' || !('Notification' in window)) { setPermHint(true); return; }
      const p = await Notification.requestPermission();
      setPermHint(p !== 'granted');
    }
  };

  const filtered = notes.filter((n) =>
    (typeFilter === 'all' || n.type === typeFilter) &&
    (severityFilter === 'all' || n.severity === severityFilter) &&
    (!search || n.title.includes(search) || n.description.includes(search))
  );

  const critical = notes.filter((n) => n.severity === 'critical').length;
  const warning = notes.filter((n) => n.severity === 'warning').length;
  const info = notes.filter((n) => n.severity === 'info').length;

  return (
    <div className="space-y-6">
      <PageHeader title="مركز التنبيهات" subtitle="جميع تنبيهات النظام: المخزون، الصلاحية، الفواتير، المصاريف، وانحراف التكلفة — مع إشعارات سطح المكتب" icon={<BellRing className="w-6 h-6 text-rose-600" />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي التنبيهات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{notes.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">حرجة</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{critical}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تحذيرات</span><strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{warning}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">معلومات</span><strong className="text-lg font-extrabold font-mono text-sky-700 block mt-1">{info}</strong></div>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="النوع">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الأنواع</option>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="الخطورة">
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={inputCls + ' !w-40'}>
            <option value="all">كل الخطورات</option>
            <option value="critical">حرجة</option>
            <option value="warning">تحذير</option>
            <option value="info">معلومات</option>
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-52'} placeholder="عنوان أو وصف التنبيه" />
          </div>
        </Field>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 bg-slate-50">
          <BellRing className="w-4 h-4 text-brand-500" />
          <span className="font-bold text-slate-700">إشعارات سطح المكتب</span>
          <button type="button" onClick={toggleDesktop} className={`relative w-11 h-6 rounded-full transition-colors ${desktopEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${desktopEnabled ? 'left-0.5' : 'left-[22px]'}`} />
          </button>
          {permHint && desktopEnabled && <span className="text-[10px] font-bold text-rose-600">المتصفح يمنع الإشعارات</span>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-xs">قائمة التنبيهات ({filtered.length})</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-bold text-sm">لا توجد تنبيهات مطابقة — كل شيء تحت السيطرة</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors ${n.severity === 'critical' ? 'border-r-4 border-r-rose-500' : n.severity === 'warning' ? 'border-r-4 border-r-amber-400' : 'border-r-4 border-r-sky-300'}`}>
                <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${n.severity === 'critical' ? 'bg-rose-50 text-rose-600' : n.severity === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`}>
                  {TYPE_META[n.type].icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-xs text-slate-900 truncate">{n.title}</p>
                    <span className={`shrink-0 text-[10px] font-extrabold rounded-full px-2 py-0.5 border ${SEVERITY_TONE[n.severity]}`}>{TYPE_META[n.type].label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{n.description}</p>
                  {n.tab && (
                    <button onClick={() => onNavigate(n.tab!)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-800">
                      <ExternalLink className="w-3 h-3" /> فتح الملف ذي الصلة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-center text-[10px] text-slate-400 font-bold">تُحتسب التنبيهات لحظياً من بيانات النظام الفعلية — وعند تفعيل إشعارات سطح المكتب تظهر التنبيهات الحرجة حتى وأنت خارج النظام.</p>
    </div>
  );
};