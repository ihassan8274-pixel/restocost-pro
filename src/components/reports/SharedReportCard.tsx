import React, { useState } from 'react';
import { Loader2, FileDown, FileSpreadsheet, Printer, Hash } from 'lucide-react';
import { Card, SectionHeader } from '../ui';
import { fmt, fmtMoney } from '../../utils/helpers';
import { type ProReportSpec, type RowCell } from '../../utils/pdf';
import { openPrintWindow } from '../../utils/print';

export interface ReportCol {
  key: string;
  label: string;
  type?: 'money' | 'pct' | 'num' | 'date' | 'text';
}

export interface ReportKPI {
  label: string;
  value: string;
}

export interface ReportExhibit {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  columns: ReportCol[];
  rows: Record<string, RowCell | boolean>[];
  csvHeader: string[];
  kpis?: ReportKPI[];
  spec: () => ProReportSpec;
  printMeta?: [string, string][];
  printFooter?: string;
}

const cellText = (v: RowCell | boolean, type?: string) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') { if (type === 'money') return fmtMoney(v); if (type === 'pct') return `${fmt(v)}%`; return fmt(v); }
  return String(v);
};

export const SharedReportCard: React.FC<{
  ex: ReportExhibit;
  busy: string | null;
  onDownload: (name: string, spec: ProReportSpec) => void;
  onCsv: (name: string, header: string[], rows: (string | number)[][]) => void;
}> = ({ ex, busy, onDownload, onCsv }) => {
  const [expanded, setExpanded] = useState(false);
  const totalRows = ex.rows.filter((r) => !!r._total);
  const bodyRows = ex.rows.filter((r) => !r._total && !r._group);

  const print = () => openPrintWindow({
    title: ex.title,
    subtitle: ex.printMeta?.[0]?.[1] || '',
    meta: [
      ['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')],
      ...(ex.printMeta || []),
    ],
    tables: [{
      title: ex.title,
      header: ex.columns.map((c) => c.label),
      rows: ex.rows.map((r) => ex.columns.map((c) => { const v = r[c.key]; return typeof v === 'boolean' ? '' : (v ?? ''); })),
    }],
    totals: totalRows.length > 0 ? totalRows.map((r) =>
      [r[ex.columns[0]?.key] as string, cellText(r[ex.columns[ex.columns.length - 1]?.key], ex.columns[ex.columns.length - 1]?.type)] as [string, string]
    ) : undefined,
    footer: ex.printFooter || 'RestoCost ERP Pro',
  });

  return (
    <Card className="p-4 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
      <SectionHeader
        title={ex.title}
        subtitle={ex.subtitle}
        icon={ex.icon}
        extra={
          <div className="flex items-center gap-1">
            {ex.kpis && ex.kpis.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {expanded ? 'إخفاء المؤشرات' : `${ex.kpis.length} مؤشر`}
              </button>
            )}
            <button title="تصدير PDF احترافي" onClick={() => onDownload(ex.title, ex.spec())} disabled={busy === ex.id} className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 disabled:opacity-40 transition-colors">
              {busy === ex.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            </button>
            <button title="تصدير CSV" onClick={() => onCsv(ex.title, ex.csvHeader, ex.rows.map((r) => ex.columns.map((c) => String(r[c.key] ?? ''))))} className="p-1.5 text-emerald-500 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"><FileSpreadsheet className="w-4 h-4" /></button>
            <button title="طباعة" onClick={print} className="p-1.5 text-blue-500 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"><Printer className="w-4 h-4" /></button>
          </div>
        }
      />

      {ex.kpis && ex.kpis.length > 0 && expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
          {ex.kpis.map((kpi, i) => (
            <div key={i} className="bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-[10px] text-slate-400 font-bold block">{kpi.label}</span>
              <span className="text-sm font-extrabold font-mono text-slate-800 block mt-0.5">{kpi.value}</span>
            </div>
          ))}
        </div>
      )}

      {bodyRows.length === 0 ? (
        <p className="text-xs text-slate-400 font-bold py-6 text-center">لا توجد بيانات لهذا التقرير</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 font-extrabold border-b-2 border-slate-200">
                <th className="p-2.5 text-center text-[10px] w-8">#</th>
                {ex.columns.map((c, i) => (
                  <th key={i} className="p-2.5 text-right whitespace-nowrap text-[11px]">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ex.rows.map((r, ri) => (
                r._group ? (
                  <tr key={ri} className="bg-indigo-50/40">
                    <td colSpan={ex.columns.length + 1} className="p-2 font-extrabold text-indigo-700 text-xs border-r-3 border-indigo-300">{String(r.name)}</td>
                  </tr>
                ) : (
                  <tr key={ri} className={`hover:bg-blue-50/30 transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="p-2 text-center text-[10px] text-slate-300 font-mono">{ri + 1}</td>
                    {ex.columns.map((c, ci) => (
                      <td key={ci} className={`p-2 whitespace-nowrap ${c.type === 'money' || c.type === 'num' ? 'font-mono font-bold text-slate-800' : 'text-slate-600'}`}>
                        {cellText(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                )
              ))}
            </tbody>
            {totalRows.length > 0 && (
              <tfoot>
                {totalRows.map((r, ri) => (
                  <tr key={ri} className="bg-gradient-to-r from-slate-700 to-slate-800 text-white font-extrabold">
                    <td className="p-2.5"></td>
                    {ex.columns.map((c, ci) => (
                      <td key={ci} className={`p-2.5 whitespace-nowrap ${c.type === 'money' || c.type === 'num' ? 'font-mono' : ''}`}>
                        {cellText(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      )}

      {bodyRows.length > 0 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {bodyRows.length} صف
          </span>
        </div>
      )}
    </Card>
  );
};
