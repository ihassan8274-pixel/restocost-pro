import { describe, it, expect } from 'vitest';
import { ReportEngine, ReportTable, filterCollection } from '../ReportEngine';
import {
  emptyReportFilter,
  sumField,
  groupCount,
  inRange,
  pct,
  type ReportColumn,
  type ReportCollection,
} from '../ReportTypes';

const columns: ReportColumn[] = [
  { key: 'branch', label: 'الفرع' },
  { key: 'revenue', label: 'الإيراد', align: 'end' },
];

describe('ReportTable', () => {
  it('keeps insertion order and exposes rows', () => {
    const t = new ReportTable(columns);
    t.add('b1', { branch: 'الرياض', revenue: 100 });
    t.add('b2', { branch: 'جدة', revenue: 250 });
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].id).toBe('b1');
  });

  it('addAll appends every row in one pass', () => {
    const t = new ReportTable(columns);
    t.addAll([
      { id: 'a', values: { branch: 'أ', revenue: 1 } },
      { id: 'b', values: { branch: 'ب', revenue: 2 } },
    ]);
    expect(t.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('toSheet projects column order onto row values', () => {
    const t = new ReportTable(columns);
    t.add('b1', { branch: 'الرياض', revenue: 100 });
    const sheet = t.toSheet('مبيعات');
    expect(sheet.name).toBe('مبيعات');
    expect(sheet.header).toEqual(['الفرع', 'الإيراد']);
    expect(sheet.rows[0]).toHaveLength(2);
  });

  it('drops cells with no matching column', () => {
    const t = new ReportTable(columns);
    t.add('b1', { branch: 'الرياض', revenue: 100, stray: 'x' } as never);
    const sheet = t.toSheet('s');
    expect(sheet.rows[0]).toHaveLength(2); // only the 2 declared columns
  });
});

describe('filterCollection', () => {
  // ReportCollection exposes accessors (date/branch/status), not raw field
  // names — filterCollection reads those functions to pull each row's value.
  const coll: ReportCollection<{ date: string; branch: string; amount: number }> = {
    name: 'sales',
    date: (r) => (r as { date: string }).date,
    branch: (r) => (r as { branch: string }).branch,
    rows: [
      { date: '2026-01-10', branch: 'b1', amount: 10 },
      { date: '2026-02-10', branch: 'b2', amount: 20 },
      { date: '2026-03-10', branch: 'b1', amount: 30 },
    ],
  };

  it('returns everything when the filter is empty', () => {
    expect(filterCollection(coll, emptyReportFilter())).toHaveLength(3);
  });

  it('restricts to the selected branch ids', () => {
    const f = { ...emptyReportFilter(), branchIds: ['b1'] };
    expect(filterCollection(coll, f)).toHaveLength(2);
  });

  it('restricts to an inclusive date window', () => {
    const f = { ...emptyReportFilter(), from: '2026-02-01', to: '2026-02-28' };
    const out = filterCollection(coll, f) as { amount: number }[];
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(20);
  });
});

describe('aggregation helpers', () => {
  const rows = [{ branch: 'b1', n: 1 }, { branch: 'b1', n: 2 }, { branch: 'b2', n: 4 }];

  it('sumField totals the picked values', () => {
    expect(sumField(rows, (r) => r.n)).toBe(7);
  });

  it('groupCount buckets by key', () => {
    expect(groupCount(rows, (r) => r.branch)).toEqual({ b1: 2, b2: 1 });
  });

  it('pct guards against divide-by-zero', () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBe(0);
  });

  it('inRange is inclusive on both ends and open when unbounded', () => {
    expect(inRange('2026-01-01', '2026-01-01', '2026-01-31')).toBe(true);
    expect(inRange('2026-01-31', '2026-01-01', '2026-01-31')).toBe(true);
    expect(inRange('2026-02-01', '2026-01-01', '2026-01-31')).toBe(false);
    expect(inRange('2026-05-05', '', '')).toBe(true);
  });
});

describe('ReportEngine.register', () => {
  it('returns the engine so registrations can chain', () => {
    const e = new ReportEngine();
    const def = {
      id: 'r1',
      title: 'تقرير',
      columns,
      rowBuilders: [],
      render: (src: unknown) => ({ rows: [], summaries: [], tables: [] }),
    } as never;
    expect(e.register(def, [])).toBe(e);
  });
});
