import React from 'react';
import { CalendarRange, X } from 'lucide-react';

/** فاحص نطاق تاريخ موحد لكل تقارير النظام */
export const inDateRange = (date: string, from: string, to: string): boolean =>
  (!from || date >= from) && (!to || date <= to);

export const rangeLabel = (from: string, to: string): string =>
  from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كامل الفترة';

interface DateRangeBarProps {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  label?: string;
}

/** شريط فلتر التاريخ القياسي — يوضع أعلى أي شاشة تقارير */
export const DateRangeBar: React.FC<DateRangeBarProps> = ({ from, to, setFrom, setTo, label }) => {
  const inputCls =
    'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100';
  const active = !!(from || to);
  return (
    <div className={`flex items-end gap-2 flex-wrap rounded-xl border px-3 py-2 ${active ? 'border-brand-300 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/40' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-600 dark:text-slate-300 pb-1.5">
        <CalendarRange className="w-4 h-4 text-brand-500" />
        {label || 'فلترة بالفترة'}
      </span>
      <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
        من
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
      </label>
      <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
        إلى
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
      </label>
      {active && (
        <button
          onClick={() => { setFrom(''); setTo(''); }}
          className="flex items-center gap-1 text-[10px] font-extrabold text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300 rounded-lg px-2 py-1.5 transition-colors"
        >
          <X className="w-3 h-3" /> مسح
        </button>
      )}
    </div>
  );
};
