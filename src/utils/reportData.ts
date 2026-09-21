// ═══ طبقة البيانات الموحّدة للتقارير المخصصة (باني داخلي + jsreport) ═══
// أي مصدر بيانات يحوّل سجلات النظام إلى { columns, rows } بصيغة JSON واحدة
// تستهلكها واجهة المعاينة الداخلية، وتصدير Excel/PDF، ومحرك jsreport على الخادم.
export type ReportValue = string | number | boolean | null | undefined;
export type CellValue = string | number;

export interface ReportColumnDef {
  key: string;
  label: string;
  kind?: 'money' | 'number' | 'pct' | 'date' | 'text';
  groupable?: boolean; // يظهر في قائمة التجميع
  filterable?: boolean; // يظهر في فلاتر التشغيل السريع
  defaultSelected?: boolean;
}

export interface ReportRecord {
  [key: string]: ReportValue;
}

export interface ReportDataset {
  id: string;
  label: string;
  description?: string;
  columns: ReportColumnDef[];
  load: () => ReportRecord[]; // يسحب أحدث البيانات لحظة التشغيل
}

export interface ReportSelection {
  columns: string[]; // مفاتيح الأعمدة المختارة
  filters: Record<string, string>; // key -> 'all' أو قيمة الاختيار
  groupBy: string; // مفتاح التجميع أو '' بدون تجميع
}

export interface ReportTable {
  columns: string[]; // عناوين (تسميات عربية)
  keys: string[]; // مفاتيح موازية لكل عمود
  rows: CellValue[][]; // صفوف منسّقة (مقربة للأرقام)
  rowCount: number;
  hasTotals: boolean;
}

const round2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? r : Math.round(r * 100) / 100;
};

export const dkey = (v: ReportValue): string => String(v ?? '').slice(0, 10);

export const fmtCell = (v: ReportValue, kind?: ReportColumnDef['kind']): CellValue => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (kind === 'pct') return round2(v);
    if (kind === 'money' || kind === 'number') return round2(v);
    return v;
  }
  return String(v);
};

// قيم مميزة للفلاتر — مع معالجة التواريخ (شهر فقط) والنصوص
export const distinctOptions = (records: ReportRecord[], key: string, kind?: ReportColumnDef['kind']): string[] => {
  const set = new Set<string>();
  records.forEach((r) => {
    const v = r[key];
    if (v === null || v === undefined || v === '') return;
    set.add(kind === 'date' ? dkey(v) : String(v));
  });
  const arr = [...set];
  return arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const matchesFilter = (r: ReportRecord, key: string, kind: ReportColumnDef['kind'], selected: string): boolean => {
  const v = r[key];
  if (v === null || v === undefined || v === '') return selected === '';
  return kind === 'date' ? dkey(v) === selected : String(v) === selected;
};

const isNumericKind = (kind?: ReportColumnDef['kind']) => kind === 'money' || kind === 'number' || kind === 'pct';

// يجمع قيم رقمية عبر مجموعة صفوف (لصفوف التجميع والإجمالي)
const sumGroup = (rows: ReportRecord[], keys: string[], defs: ReportColumnDef[]): Record<string, number> => {
  const sums: Record<string, number> = {};
  keys.forEach((k) => {
    const def = defs.find((c) => c.key === k);
    if (!def || !isNumericKind(def.kind)) return;
    sums[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  });
  return sums;
};

// الباني الموحّد: فلاتر → تجميع (اختياري) → صفوف منسّقة → صف إجمالي
export const buildTable = (dataset: ReportDataset, selection: ReportSelection): ReportTable => {
  const defs = dataset.columns;
  const selectedDefs = defs.filter((d) => selection.columns.includes(d.key));
  const records = dataset.load();

  const activeFilters = Object.entries(selection.filters || {}).filter(([, v]) => v !== 'all' && v !== '');
  const filtered = activeFilters.length
    ? records.filter((r) =>
        activeFilters.every(([k, v]) => {
          const d = defs.find((c) => c.key === k);
          return matchesFilter(r, k, d?.kind ?? 'text', v);
        })
      )
    : [...records];

  const numericSelected = selectedDefs.filter((d) => isNumericKind(d.kind));
  const hasTotals = numericSelected.length > 0 && filtered.length > 0;

  const buildRow = (rec: ReportRecord): CellValue[] =>
    selectedDefs.map((d) => fmtCell(rec[d.key], d.kind));

  let rows: CellValue[][];
  if (selection.groupBy && selectedDefs.some((d) => d.key === selection.groupBy)) {
    const groups = new Map<string, ReportRecord[]>();
    filtered.forEach((r) => {
      const g = String(r[selection.groupBy] ?? '') || 'بدون';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    });
    rows = [...groups.entries()].map(([name, recs]) => {
      const sums = sumGroup(recs, selection.columns, defs);
      return selectedDefs.map((d) => {
        if (d.key === selection.groupBy) return name;
        if (isNumericKind(d.kind)) return fmtCell(sums[d.key] ?? 0, d.kind);
        const first = recs.find((r) => r[d.key] !== undefined && r[d.key] !== null && r[d.key] !== '');
        return fmtCell(first?.[d.key], d.kind);
      });
    });
  } else {
    rows = filtered.map(buildRow);
  }

  if (rows.length && hasTotals) {
    const sums = sumGroup(filtered, selection.columns, defs);
    const totalRow: CellValue[] = selectedDefs.map((d, i) => {
      if (i === 0) return 'الإجمالي';
      return fmtCell(sums[d.key] ?? '', d.kind);
    });
    rows = [...rows, totalRow];
  }

  return {
    columns: selectedDefs.map((d) => d.label),
    keys: selectedDefs.map((d) => d.key),
    rows,
    rowCount: rows.length,
    hasTotals,
  };
};