import React from 'react';
import { FileSpreadsheet, FileDown, Printer } from 'lucide-react';
import { ReportExporter } from '../utilities/exportUtils';
import type { ReportResult } from '../_core/ReportTypes';

interface ReportToolbarProps {
  report: ReportResult;
  filename?: string;
}

const btnCls = 'flex items-center gap-1.5 font-bold px-3 py-2 rounded-xl text-xs shadow-xs border transition-colors bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700';

/** شريط تصدير/طباعة موحّد — يعمل على نتيجة ReportResult مباشرة */
export const ReportToolbar: React.FC<ReportToolbarProps> = ({ report, filename }) => {
  const name = filename || report.title;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button onClick={() => ReportExporter.excel(report, name)} className={`${btnCls} bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 hover:border-emerald-700`} title="تصدير Excel">
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </button>
      <button onClick={() => ReportExporter.csv(report, name)} className={btnCls} title="تصدير CSV">
        <FileDown className="w-4 h-4" /> CSV
      </button>
      <button onClick={() => ReportExporter.run('print', report)} className={`${btnCls} bg-slate-900 text-white border-slate-800 hover:bg-slate-800 hover:border-slate-800`} title="طباعة / PDF">
        <Printer className="w-4 h-4" /> طباعة
      </button>
    </div>
  );
};