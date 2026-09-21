// ==========================================================
// ReportFormat.ts — أدوات بناء الجداول والأعمدة الموحدة
// تُبني بيانات العرض (ReportTableData) وورقة التصدير (ReportSheet)
// من مصدر واحد حتى لا يتشعب التنسيق بين الشاشة والملفات.
// ==========================================================
import type { ReportColumn, ReportRow, ReportTableData, ReportSheet, CellValue } from './ReportTypes';

/** عمود نصي/عادي */
export const reportColumn = (key: string, label: string, opts: Partial<ReportColumn> = {}): ReportColumn => ({
  key, label, align: opts.align ?? 'right', ...opts,
});

/** عمود مالي مُنسّق بريال */
export const reportMoney = (key: string, label: string): ReportColumn =>
  reportColumn(key, label, { align: 'left', aggregate: 'sum' });

/** عمود نسبة مئوية (قيمة = عدد) */
export const reportPct = (key: string, label: string): ReportColumn =>
  reportColumn(key, label, { align: 'center', aggregate: 'none' });

/**
 * باني جدول: يضيف أعمدة وصفوف ثم يُنتج الصيغتين
 * (عرض + تصدير) بنفس الرؤوس والقيم.
 */
export class ReportTableBuilder {
  private columns: ReportColumn[] = [];
  private rows: ReportRow[] = [];

  addColumn(col: ReportColumn): ReportTableBuilder {
    this.columns.push(col);
    return this;
  }

  addRow(id: string, values: Record<string, CellValue>): ReportTableBuilder {
    this.rows.push({ id, values });
    return this;
  }

  addRows(items: { id: string; values: Record<string, CellValue> }[]): ReportTableBuilder {
    items.forEach((i) => this.addRow(i.id, i.values));
    return this;
  }

  /** حساب صف الإجمالي لأعمدة aggregate='sum' */
  private get totals(): Record<string, CellValue> {
    const out: Record<string, CellValue> = {};
    this.columns.forEach((c) => {
      if (c.aggregate === 'sum') {
        out[c.key] = this.rows.reduce((s, r) => s + (Number(r.values[c.key]) || 0), 0);
      }
    });
    return out;
  }

  /** بيانات العرض الجاهزة للمكوّن ReportTable */
  build(): ReportTableData {
    return { columns: this.columns, rows: this.rows, totals: this.totals };
  }

  /** ورقة تصدير بنفس أعمدة/صفوف العرض */
  toSheet(name: string): ReportSheet {
    return {
      name,
      header: this.columns.map((c) => c.label),
      rows: this.rows.map((r) => this.columns.map((c) => this.fmtCell(r.values[c.key], c))),
    };
  }

  private fmtCell(v: CellValue, c: ReportColumn): string | number {
    if (v === null || v === undefined) return '';
    if (c.format) return c.format(v);
    if (typeof v === 'number') return Number.isInteger(v) ? v : Number(v.toFixed(2));
    return String(v);
  }
}