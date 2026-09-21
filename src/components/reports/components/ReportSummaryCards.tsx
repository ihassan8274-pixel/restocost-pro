import React from 'react';
import { fmt, fmtMoney } from '../../../utils/helpers';
import type { ReportSummaryItem } from '../_core/ReportTypes';

interface ReportSummaryCardsProps {
  items: ReportSummaryItem[];
}

const toneClasses: Record<NonNullable<ReportSummaryItem['tone']>, string> = {
  default: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  emerald: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30',
  amber: 'border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30',
  rose: 'border-rose-200 bg-rose-50/70 dark:border-rose-700 dark:bg-rose-950/30',
  indigo: 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/30',
};

const valueCls = (tone: ReportSummaryItem['tone']): string => {
  switch (tone) {
    case 'emerald': return 'text-emerald-700 dark:text-emerald-400';
    case 'amber': return 'text-amber-700 dark:text-amber-400';
    case 'rose': return 'text-rose-700 dark:text-rose-400';
    case 'indigo': return 'text-indigo-700 dark:text-indigo-400';
    default: return 'text-slate-800 dark:text-slate-100';
  }
};

const formatValue = (item: ReportSummaryItem): string => {
  if (item.format) return item.format(item.value);
  if (typeof item.value === 'number') {
    const v = Number(item.value.toFixed(2));
    if (Math.abs(v) >= 1000) return fmtMoney(v).replace(' ر.س', '');
    return fmt(v);
  }
  return String(item.value ?? '—');
};

/** مؤشرات مالية رئيسية موحدة — تعرض فوق كل التقارير */
export const ReportSummaryCards: React.FC<ReportSummaryCardsProps> = ({ items }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 print:hidden">
    {items.map((it) => (
      <div key={it.key} className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClasses[it.tone ?? 'default']}`}>
        <div className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 mb-1">{it.label}</div>
        <div className={`text-lg font-black tracking-tight ${valueCls(it.tone)}`} dir="ltr" style={{ textAlign: 'right' }}>
          {formatValue(it)}
        </div>
        {it.hint && <div className="text-[10px] font-bold text-slate-400 mt-0.5">{it.hint}</div>}
      </div>
    ))}
  </div>
);

export type { ReportSummaryItem };