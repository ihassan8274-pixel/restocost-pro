// ==========================================================
// ReportEngine.ts — المحرك المركزي للتقارير
// مسؤول عن: الفلترة الموحدة، التجميع، حساب الإجماليات،
// تجهيز صفوف العرض + صفوف التصدير دفعة واحدة.
// ==========================================================
import {
  emptyReportFilter, inRange, pct, sumField,
  type ReportFilter, type ReportColumn, type ReportDefinition,
  type ReportRow, type ReportResult, type ReportSheet, type ReportSummaryItem,
  type CellValue,
} from './ReportTypes';

/** مصدر يساهم بتقرير: أيّ قائمة سجلات + دوال استخراج الأبعاد */
export interface ReportCollection<T> {
  name: string;
  rows: T[];
  // دوال استخراج (لم تُطبَّق القيمة): تقبل any لتجاوز قيود التباين عند دمج مصادر مختلفة
  date?: (r: any) => string;
  branch?: (r: any) => string;
  status?: (r: any) => string;
}

/** نسخة بدون قيود توافقية — تُستخدم داخل التخزين وتطبيق الفلاتر */
export type AnyCollection = ReportCollection<unknown>;

/** صف خام داخلي موحّد قبل التحويل لصف عرض */
export interface ReportRowBuilder {
  id: string;
  values: Record<string, CellValue>;
}

/** النتيجة النهائية لدالة البناء الخاصة بكل تقرير */
export interface ReportRendered {
  summaries: ReportSummaryItem[];
  tables: ReportTable[];
  sheets?: ReportSheet[];
}

/** امتداد لقائمة صفوف لعرض/تصدير موحّد */
export class ReportTable {
  columns: ReportColumn[];
  rows: ReportRow[] = [];

  constructor(columns: ReportColumn[]) {
    this.columns = columns;
  }

  add(id: string, values: Record<string, CellValue>): void {
    this.rows.push({ id, values });
  }

  addAll(items: ReportRowBuilder[]): void {
    items.forEach((i) => this.add(i.id, i.values));
  }

  get totals(): Record<string, CellValue> {
    const out: Record<string, CellValue> = {};
    this.columns.forEach((c) => {
      if (c.aggregate === 'sum') {
        out[c.key] = this.rows.reduce((s, r) => s + (Number(r.values[c.key]) || 0), 0);
      }
    });
    return out;
  }

  /** تحويل الجدول إلى ورقة تصدير (رؤوس + صفوف نصية/رقمية) */
  toSheet(name: string): ReportSheet {
    return {
      name,
      header: this.columns.map((c) => c.label),
      rows: this.rows.map((r) => this.columns.map((c) => this.fmtCell(r.values[c.key], c) ?? '')),
    };
  }

  private fmtCell(v: CellValue, c: ReportColumn): string | number {
    if (v === null || v === undefined) return '';
    if (c.format) return c.format(v);
    if (typeof v === 'number') return Number.isInteger(v) ? v : Number(v.toFixed(2));
    return v;
  }
}

/** فلاتر عامة لكل المصادر بمفتاح تاريخ/فرع/حالة مرن */
export function filterCollection(coll: AnyCollection, filter: ReportFilter): unknown[] {
  const date = coll.date as ((r: unknown) => string) | undefined;
  const branch = coll.branch as ((r: unknown) => string) | undefined;
  const status = coll.status as ((r: unknown) => string) | undefined;
  return coll.rows.filter((r) => {
    if (date && !inRange(date(r) || '', filter.from, filter.to)) return false;
    if (filter.branchIds.length && branch && !filter.branchIds.includes(branch(r) || '')) return false;
    if (filter.statuses.length && status && !filter.statuses.includes(status(r) || '')) return false;
    return true;
  });
}

/**
 * محرك التقرير: يطبّق الفلاتر الموحدة على مصادر مسجلة،
 * ثم يستدعي دالة البناء الخاصة بالتقرير ليتسلم (summaries, tables, sheets).
 */
export class ReportEngine {
  private definitions = new Map<string, ReportDefinition>();
  private sources = new Map<string, ReportCollection<unknown>[]>();

  register(definition: ReportDefinition, sourceList: ReportCollection<unknown>[]): this {
    this.definitions.set(definition.id, definition);
    this.sources.set(definition.id, sourceList);
    return this;
  }

  /** تطبيق الفلاتر على كل المصادر المسجلة للتقرير وعودتها محفوظة كنوع المصدر */
  applyFilters<T extends ReportCollection<unknown>[]>(
    reportId: string,
    filters?: ReportFilter,
  ): T {
    const list = this.sources.get(reportId) || [];
    const f = filters || emptyReportFilter();
    return list.map((coll) => ({ ...coll, rows: filterCollection(coll, f) })) as unknown as T;
  }

  /** تشغيل التقرير: دالة البناء تستقبل المصادر المفلترة وتعيد النتيجة الكاملة */
  run<T extends ReportCollection<unknown>[]>(
    reportId: string,
    render: (filteredSources: T) => ReportRendered,
    filters?: ReportFilter,
  ): ReportResult {
    const definition = this.definitions.get(reportId) ?? { id: reportId, title: reportId };
    const filtered = this.applyFilters<T>(reportId, filters);
    const result = render(filtered);
    const tables: ReportSheet[] = result.sheets && result.sheets.length
      ? result.sheets
      : result.tables.map((t, i) => t.toSheet(result.tables.length === 1 ? definition.title : `${definition.title} ${i + 1}`));
    return {
      id: definition.id,
      title: definition.title,
      subtitle: definition.subtitle,
      summaries: result.summaries,
      tables: result.tables,
      exportSheets: tables,
      generatedAt: new Date().toISOString(),
    };
  }
}

/** إعادة تصدير الدوال المساعدة الأساسية */
export const enginePct = pct;
export const engineSum = sumField;

export type {
  ReportFilter, ReportColumn, ReportRow, ReportResult, ReportSheet, ReportSummaryItem, CellValue,
};