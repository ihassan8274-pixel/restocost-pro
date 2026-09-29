import React from 'react';
import { FileSpreadsheet, Printer, Upload } from 'lucide-react';
import { exportStyledReport, sheetsToStyledReport, cellDisplay, type ExcelCellValue, type ExcelSheet, type StyledReportSheet } from '../../utils/excel';
import { captureCharts, openPrintWindow } from '../../utils/print';

interface ViewToolbarProps {
  sheets?: ExcelSheet[];
  styled?: StyledReportSheet[];
  filename?: string;
  onImport?: () => void;
  importLabel?: string;
}

const btnCls = 'flex items-center gap-1.5 font-bold px-3 py-2 rounded-xl text-xs shadow-xs border transition-colors';

// توحيد عرض الكسور العشرية: تقريب أي قيمة رقمية إلى منزلتين قبل الطباعة أو التصدير
export const roundCell = (v: ExcelCellValue): string | number => {
  const s = cellDisplay(v);
  if (typeof s !== 'number' || !Number.isFinite(s)) return s;
  const r = Math.round(s * 100) / 100;
  return Number.isInteger(r) ? r : r.toFixed(2);
};

export const ViewToolbar: React.FC<ViewToolbarProps> = ({ sheets, styled, filename, onImport, importLabel }) => (
  <div className="print:hidden flex flex-wrap items-center gap-2">
    <button
      onClick={() => { void (async () => {
        try {
          if (styled?.length) {
            await exportStyledReport(filename || styled[0]?.name || 'تقرير', styled);
          } else if (sheets?.length) {
            await exportStyledReport(filename || sheets[0]?.name || 'تقرير', sheetsToStyledReport(sheets));
          }
        } catch (e) { alert(`فشل تصدير Excel: ${(e as Error)?.message || e}`); }
      })(); }}
      className={`${btnCls} bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700`}
      title="تصدير البيانات إلى ملف Excel"
    >
      <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
    </button>
    <button
      onClick={() => { void (async () => {
        const charts = await captureCharts();
        let src: { title: string; header: string[]; rows: (string | number)[][] }[] = [];
        if (styled?.length) {
          src = styled.flatMap((sh) => (sh.tables?.length ? sh.tables : [{ title: undefined, header: sh.header ?? [], rows: sh.rows ?? [] }]).map((t) => ({ title: t.title ?? sh.name, header: t.header, rows: t.rows.map((row) => row.map(roundCell)) })));
        } else if (sheets?.length) {
          src = sheets.map((sh) => ({ title: sh.name, header: sh.header, rows: sh.rows.map((row) => row.map(roundCell)) }));
        }
        openPrintWindow({
          title: filename || styled?.[0]?.name || sheets?.[0]?.name || 'تقرير',
          subtitle: 'تقرير مفصل',
          meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')]],
          charts,
          tables: src,
          footer: 'تقرير مولّد آلياً — RestoCost ERP',
        });
      })(); }}
      className={`${btnCls} bg-slate-900 hover:bg-slate-800 text-white border-slate-800`}
      title="طباعة التقرير"
    >
      <Printer className="w-4 h-4" /> طباعة
    </button>
    {onImport && (
      <button
        onClick={onImport}
        className={`${btnCls} bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700`}
        title={importLabel || 'استيراد بيانات من Excel'}
      >
        <Upload className="w-4 h-4" /> {importLabel || 'استيراد Excel'}
      </button>
    )}
  </div>
);
