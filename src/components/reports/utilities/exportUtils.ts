// ==========================================================
// exportUtils.ts — تصدير موحّد لكل التقارير
// Excel + CSV + طباعة/PDF من نتيجة ReportResult مباشرة.
// يتجنب تكرار كود التصدير في كل تقرير.
// ==========================================================
import { exportExcel } from '../../../utils/excel';
import { downloadCSV } from '../../../utils/helpers';
import { openPrintWindow, captureCharts } from '../../../utils/print';
import { roundCell } from '../../ui/ViewToolbar';
import type { ReportResult, ReportSheet } from '../_core/ReportTypes';

export type ExportFormat = 'excel' | 'csv' | 'print' | 'pdf';

// تلطيف التسمية لاسم ملف آمن عبر أنظمة
const safeName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'تقرير';

/** تحويل ورقات ReportSheet إلى صيغة Excel المتوقعة */
const toExcelSheets = (sheets: ReportSheet[]): { name: string; header: string[]; rows: (string | number)[][] }[] =>
  sheets.map((s) => ({
    name: safeName(s.name),
    header: s.header,
    rows: s.rows.map((r) => r.map(roundCell)),
  }));

/** وحدة التصدير الموحدة */
export class ReportExporter {
  static excel(report: ReportResult, filename?: string): void {
    if (!report.exportSheets.length) return;
    void exportExcel(filename || safeName(report.title), toExcelSheets(report.exportSheets)).catch((e) => alert(`فشل تصدير Excel: ${(e as Error)?.message || e}`));
  }

  static csv(report: ReportResult, filename?: string): void {
    const sheet = report.exportSheets[0];
    if (!sheet) return;
    downloadCSV(filename || `${safeName(report.title)}.csv`, sheet.header, sheet.rows.map((r) => r.map(roundCell)));
  }

  static async print(report: ReportResult): Promise<void> {
    const charts = await captureCharts();
    openPrintWindow({
      title: report.title,
      subtitle: report.subtitle,
      charts,
      meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['نطاق التقرير', report.subtitle || 'كامل البيانات']],
      tables: report.tables.map((t) => ({
        title: t.columns.map((c) => c.label).join(' • '),
        header: t.columns.map((c) => c.label),
        rows: t.rows.map((r) => t.columns.map((c) => roundCell(r.values[c.key] ?? ''))),
      })),
      totals: report.summaries.map((s) => [s.label, String(typeof s.value === 'number' ? (Number.isInteger(s.value) ? s.value : s.value.toFixed(2)) : s.value ?? '—')]),
      footer: 'تقرير مولّد آلياً — RestoCost ERP',
    });
  }

  static run(format: ExportFormat, report: ReportResult, filename?: string): void {
    switch (format) {
      case 'excel': this.excel(report, filename); break;
      case 'csv': this.csv(report, filename); break;
      case 'print':
      case 'pdf':
        void this.print(report);
        break;
      default: break;
    }
  }
}

export { safeName, toExcelSheets };