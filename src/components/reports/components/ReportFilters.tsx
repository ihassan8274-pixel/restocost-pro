import React from 'react';
import { CalendarRange, X } from 'lucide-react';
import { emptyReportFilter, type ReportFilter } from '../_core/ReportTypes';

export interface BranchOption {
  id: string;
  name: string;
}

interface ReportFiltersProps {
  value: ReportFilter;
  onChange: (f: ReportFilter) => void;
  branches?: BranchOption[];
  /** عكس منطق الفلترة: نعرض 'الكل' كخيار جذاب */
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  children?: React.ReactNode;
}

const inputCls =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100';

/** شريط فلاتر تقارير موحّد — فترة + فروع + حالات */
export const ReportFilters: React.FC<ReportFiltersProps> = ({ value, onChange, branches, showStatus, statusOptions = [], children }) => {
  const active = !!(value.from || value.to || value.branchIds.length || value.statuses.length);

  return (
    <div className={`rounded-xl border px-3 py-2 flex items-end gap-2 flex-wrap print:hidden ${active ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-600 dark:text-slate-300 pb-1.5">
        <CalendarRange className="w-4 h-4 text-indigo-500" />
        فلترة التقرير
      </span>
      <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
        من
        <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className={inputCls} />
      </label>
      <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
        إلى
        <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className={inputCls} />
      </label>

      {branches && branches.length > 0 && (
        <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
          الفروع
          <select
            className={inputCls}
            value={value.branchIds.length === 1 ? value.branchIds[0] : ''}
            onChange={(e) => onChange({ ...value, branchIds: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}

      {showStatus && statusOptions.length > 0 && (
        <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
          الحالة
          <select
            className={inputCls}
            value={value.statuses.length === 1 ? value.statuses[0] : ''}
            onChange={(e) => onChange({ ...value, statuses: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">كل الحالات</option>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      )}

      {children}

      {active && (
        <button
          onClick={() => onChange(emptyReportFilter())}
          className="flex items-center gap-1 text-[10px] font-extrabold text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300 rounded-lg px-2 py-1.5 transition-colors"
        >
          <X className="w-3 h-3" /> مسح الفلاتر
        </button>
      )}
    </div>
  );
};

export type { ReportFilter };