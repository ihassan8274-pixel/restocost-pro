import React from 'react';
import { fmt, fmtMoney, fmtPct } from '../../../utils/helpers';
import type { CellValue, CellTone, ReportColumn, ReportRow, ReportTableData } from '../_core/ReportTypes';
import { engineSum } from '../_core/ReportEngine';

interface ReportTableProps {
  data: ReportTableData;
}

// التنسيق الافتراضي حسب بنية القيمة — لا يعتمد على col.format إذا لم يُعطَ
const defaultFormat = (v: CellValue): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    return Number(v.toFixed(2)).toLocaleString('en-US');
  }
  return String(v);
};

const toneForCell = (v: CellValue, tone?: ReportColumn['tone']): CellTone => {
  if (tone === 'auto-money' && typeof v === 'number') return v < 0 ? 'negative' : v > 0 ? 'positive' : 'default';
  if (tone === 'auto-percent' && typeof v === 'number') return v > 100 ? 'negative' : v < 0 ? 'negative' : 'default';
  return 'default';
};

const cellText = (cl: CellTone): string =>
  cl === 'negative' ? 'text-rose-600 dark:text-rose-400' : cl === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : '';

const alignCls = (a?: string): string =>
  a === 'left' ? 'text-left' : a === 'center' ? 'text-center' : 'text-right';

/** جدول تقارير موحّد — دعم RTL، إجماليات، تلوين تلقائي للقيم */
export const ReportTable: React.FC<ReportTableProps> = ({ data }) => {
  const hasRows = data.rows.length > 0;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60">
            {data.columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-extrabold text-slate-600 dark:text-slate-300 whitespace-nowrap ${alignCls(c.align)}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasRows && (
            <tr>
              <td colSpan={data.columns.length} className="px-3 py-8 text-center text-slate-400 font-bold">
                {data.emptyText || 'لا توجد بيانات في النطاق المحدد'}
              </td>
            </tr>
          )}
          {data.rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-amber-50/50 dark:hover:bg-slate-800/40">
              {data.columns.map((c) => {
                const v = r.values[c.key];
                const text = c.format ? c.format(v) : defaultFormat(v);
                return (
                  <td key={c.key} className={`px-3 py-2 text-slate-700 dark:text-slate-200 ${alignCls(c.align)} ${cellText(toneForCell(v, c.tone))}`}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {data.totals && hasRows && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 font-extrabold">
              {data.columns.map((c) => {
                const v = data.totals![c.key];
                const text = c.format ? c.format(v) : defaultFormat(v);
                return (
                  <td key={c.key} className={`px-3 py-2 text-slate-900 dark:text-slate-100 whitespace-nowrap ${alignCls(c.align)}`}>
                    {text}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

/** أدوات مساعدة للأنواع */
export type { ReportRow };
export { fmt, fmtMoney, fmtPct, engineSum };