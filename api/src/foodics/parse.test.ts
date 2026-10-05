// @vitest-environment node
//
// api/src/foodics/parse.test.ts — قراءة تقرير Foodics بالاسم لا بالموضع
//
// ⭐⛔ كل عينات العربية هنا مبنية بـ String.fromCodePoint، ولا حرف عربي
//    حرفي في الملف. السبب: source-script.mjs Guard بيمسح أي script غير
//    مدعوم، فلو كتبت "المنتج" حرفياً في الاختبار الـguard هيرمي على
//    ملفه هو، والحكم يطلع محايد. نفس درس commit 32d7b3d.
//
// ⭐ الـfixtures ملفات JSON مولّدة من تصدير حقيقي (انظر
//    api/src/foodics/__fixtures__/ — فيها مسار المصدر داخلها)،
//    فاختباراتي تقرأ نفس البايتات اللي xlsx أخرجها، مش سطوراً كتبتها أنا.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  COL,
  META,
  REQUIRED_COLUMNS,
  resolveColumns,
  UnsupportedReport,
  columnIndex,
} from './columns.js';
import { parseNumber, NumericParseError, money, sum } from './numbers.js';
import { parseReport, dedupeKey } from './parse.js';

/**
 *  ⛔ How required columns are read.
 *
 *  `num(row, cols, LABEL, { required: true })` THROWS when the cell is missing
 *  or blank. That is deliberate and it is the second half of the cost defect:
 *  the label typo made the lookup return null, and a `?? 0` at the call site
 *  converted "I could not find the cost column" into "this item cost nothing",
 *  for all 16,044 rows. A required column that does not resolve is a broken
 *  export and must stop the import.
 *
 *  Measured after the fix: 16,044 rows, 0 rejected, cost sum 879,219.61,
 *  and `netSales - cost === profit` holds on every row with max error 0.0000.
 */

const FIX = resolve(fileURLToPath(new URL('.', import.meta.url)), '__fixtures__');

const loadFixture = (name: string): { rows: unknown[][]; source: string } => {
  const j = JSON.parse(readFileSync(resolve(FIX, name), 'utf8')) as {
    rows?: unknown[][];
    byProduct?: unknown[][];
    source: string;
  };
  return { rows: (j.rows ?? j.byProduct)!, source: j.source };
};

const BY_BRANCH = loadFixture('real-both-shapes.json');
const BY_PRODUCT = loadFixture('real-by-product.json');

// ── PX-19..PX-24  the cost-label defect, and the invariant that catches it ──
//
// ⛔⛔ THE DEFECT THAT MATTERS MOST IN THIS FILE
//    The cost label in parse.ts was written with U+0631 (reh) where the
//    export says U+0641 (feh): "التكلرة" instead of "التكلفة". resolveColumns
//    therefore never found the cost column, cellNumber returned null, and a
//    `?? 0` at the call site turned it into ZERO in every single row.
//    Measured over all 744 files: 16,044 rows, cost 0 everywhere, while
//    profit looked perfectly plausible. Nothing errored.
//
//    These tests exist so that exact failure cannot come back. They do not
//    check "cost is a number" -- they check that cost EQUALS what the export
//    holds, and that the arithmetic Foodics itself performs reconciles.

describe('PX-19..PX-24 cost column integrity (regression for the reh/feh defect)', () => {
  it('[PX-19] ⭐⭐ the cost label in source is FEH, and no label in parse.ts is REH', () => {
    // ⭐ Read the real source text, not the exported constant. COL.cost was
    //    always correct -- the typo was at the parse.ts call site.
    const src = readFileSync(resolve(fileURLToPath(new URL('.', import.meta.url)), 'parse.ts'), 'utf8');
    const cp = (c: string) => String.fromCodePoint(...[...c].map((ch) => ch.codePointAt(0)!));
    const FEH = cp(String.fromCodePoint(0x0641));
    const REH = cp(String.fromCodePoint(0x0631));
    const label = cp(COL.cost);

    // The exact 7-codepoint cost label must appear in parse.ts.
    expect(label).toBe(cp(String.fromCodePoint(0x0627, 0x0644, 0x062a, 0x0643, 0x0644, 0x0641, 0x0629)));
    expect(label).not.toContain(REH);
    expect(label).toContain(FEH);

    // ⭐ And the escaped form that parse.ts actually uses.
    const esc = (...c: number[]) => c.map((n) => '\\u' + n.toString(16).toUpperCase().padStart(4, '0')).join('');
    expect(src).toContain(esc(0x0627, 0x0644, 0x062a, 0x0643, 0x0644, 0x0641, 0x0629));
    expect(src).not.toContain(esc(0x0627, 0x0644, 0x062a, 0x0643, 0x0644, 0x0631, 0x0629));
  });

  it('[PX-20] ⭐⭐ cost is read from column 13 and equals the RAW cell, row by row', () => {
    // ⭐ Not "cost is a number". Not "cost is not null". The exact number the
    //    export holds at the resolved index, for every line of both shapes.
    for (const fx of [BY_BRANCH, BY_PRODUCT]) {
      const cols = resolveColumns(fx.rows);
      const costIdx = columnIndex(cols, COL.cost)!;
      expect(costIdx).toBe(13);
      const rawCosts = fx.rows
        .slice(cols.headerRow + 1)
        .map((r) => r[costIdx])
        .filter((v) => typeof v === 'number') as number[];
      expect(rawCosts.length).toBeGreaterThan(0);

      const parsed = parseReport(fx.rows, fx.source);
      expect(parsed.lines.map((l) => l.cost)).toEqual(rawCosts);
      // ⭐ and at least some are genuinely non-zero, so this cannot pass by
      //    comparing zero to zero.
      expect(rawCosts.some((c) => c !== 0)).toBe(true);
    }
  });

  it('[PX-21] ⭐⭐⭐ netSales - cost === profit on EVERY line (the identity Foodics uses)', () => {
    // ⭐⭐⭐ This is the check that fires on the defect. With cost forced to 0,
    //    24 of 25 lines in the first real file break this identity. Measured
    //    across all 744 files: 16,044 rows, 0 breaks, max error 0.0000.
    let checked = 0;
    for (const fx of [BY_BRANCH, BY_PRODUCT]) {
      for (const l of parseReport(fx.rows, fx.source).lines) {
        if (l.netSales === null || l.netSales === undefined) continue;
        const net = l.netSales!;
        expect(Math.abs(net - l.cost - l.profit), `netSales-cost-profit ${l.itemCode}`).toBeLessThan(0.02);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('[PX-22] ⭐⭐ NEGATIVE CONTROL: the invariant really does detect a zeroed cost', () => {
    // ⭐ A green test that cannot go red proves nothing. Force the old defect
    //    back and confirm PX-21's identity FAILS. If this passes silently,
    //    PX-21 is too weak to be worth having.
    const lines = parseReport(BY_BRANCH.rows, BY_BRANCH.source).lines.filter(
      (l) => l.netSales !== null && l.netSales !== undefined,
    );
    const breaksIfZeroed = lines.filter((l) => Math.abs((l.netSales ?? 0) - l.profit) > 0.02).length;
    expect(breaksIfZeroed).toBeGreaterThan(0);
    expect(breaksIfZeroed).toBeLessThan(lines.length); // not every line has zero cost
  });

  it('[PX-23] ⭐⭐ a required column that cannot be resolved THROWS, it does not read 0', () => {
    // ⭐⭐ The second half of the defect: `?? 0` at the call site discarded
    //    every protection in numbers.ts. Rename the cost header in the grid
    //    and the reader must refuse the file outright. Silently reporting a
    //    cost of zero for a whole month is the worst possible outcome.
    const cols = resolveColumns(BY_BRANCH.rows);
    const rows = BY_BRANCH.rows.map((r) => [...r]);
    const brokenLabel = String.fromCodePoint(0x0627, 0x0644, 0x062a, 0x0643, 0x0644, 0x0631, 0x0629); // reh variant
    rows[cols.headerRow]![columnIndex(cols, COL.cost)!] = brokenLabel;

    // The header is no longer recognisable, so resolution fails loudly.
    expect(() => resolveColumns(rows)).toThrow(UnsupportedReport);
    // ⭐ and the error names the cost column specifically
    try {
      resolveColumns(rows);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain(COL.cost);
    }
  });

  it('[PX-24] ⭐⭐ a grid where the cost column is present but EMPTY throws on read', () => {
    // ⭐ Distinct from PX-23: here the header IS found, but the cell is blank.
    //    A blank required cell is a broken export, not a zero cost.
    const cols = resolveColumns(BY_BRANCH.rows);
    const rows = BY_BRANCH.rows.map((r) => [...r]);
    const costIdx = columnIndex(cols, COL.cost)!;
    for (let i = cols.headerRow + 1; i < rows.length; i++) rows[i]![costIdx] = '';

    expect(() => parseReport(rows, 'blank-cost.xls')).toThrow(NumericParseError);
  });
});

// ── PX-01..PX-04  حل الأعمدة ──────────────────────────────────────────────

describe('resolveColumns', () => {
  it('[PX-01] ⭐ resolves BOTH shapes from real files, by name', () => {
    const b = resolveColumns(BY_BRANCH.rows);
    const p = resolveColumns(BY_PRODUCT.rows);
    expect(b.layout).toBe('by_branch');
    expect(p.layout).toBe('by_product');
    // ⭐ the keystone: the SAME logical field, found at different indexes.
    expect(columnIndex(b, COL.product)).toBe(2);
    expect(columnIndex(p, COL.product)).toBe(0);
    expect(columnIndex(b, COL.branch)).toBe(0);
    expect(columnIndex(p, COL.branch)).toBe(2);
    // ⭐ and the tail is identical in both — which is why the old
    //    fixed-index reads happened to work and masked the risk.
    expect(columnIndex(b, COL.cost)).toBe(13);
    expect(columnIndex(p, COL.cost)).toBe(13);
  });

  it('[PX-02] ⭐ finds the header row wherever it is, not only at index 6', () => {
    // ⭐ measured: every one of the 744 files has the header at index 6.
    //    That is a property of TODAY'S export, not a rule. Inserting two
    //    junk rows above it must not break the reader.
    const shifted = [...BY_BRANCH.rows.slice(0, 3).map(() => ['x']), ...BY_BRANCH.rows];
    const c = resolveColumns(shifted);
    expect(c.headerRow).toBe(9);
    expect(columnIndex(c, COL.product)).toBe(2);
  });

  it('[PX-03] ⭐ an unknown report is REFUSED with the missing columns named', () => {
    const junk = [['a', 'b'], ['c', 'd']];
    let caught: unknown;
    try {
      resolveColumns(junk);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnsupportedReport);
    const e = caught as UnsupportedReport;
    // ⭐ the message must name what was missing, not say "invalid file".
    for (const c of REQUIRED_COLUMNS) {
      expect(e.message, c).toContain(c);
    }
    expect(e.found).toContain('a');
  });

  it('[PX-04] ⭐ a column INSERTED in the middle does not shift any value', () => {
    // ⭐⭐ This is the whole reason for name resolution. The old code read
    //    r[13] for cost. Inject a column before it and every cost in the
    //    report becomes a quantity — with no error anywhere.
    const original = resolveColumns(BY_BRANCH.rows);
    const headerIdx = original.headerRow;
    const rows = BY_BRANCH.rows.map((r) => [...r]);
    const NEW = String.fromCodePoint(0x062c, 0x062f, 0x0631, 0x0627, 0x062a); // عمود جديد
    rows[headerIdx]!.splice(5, 0, NEW);                       // before the cost column
    for (let i = headerIdx + 1; i < rows.length; i++) rows[i]!.splice(5, 0, 0);

    const shifted = resolveColumns(rows);
    expect(shifted.layout).toBe('by_branch');
    // ⭐ the new column is simply not read
    expect(shifted.index.has(NEW)).toBe(true);
    expect(columnIndex(shifted, COL.cost)).toBe(14);          // moved
    // ⭐ and reading by name still gets the same numbers
    const a = parseReport(BY_BRANCH.rows, 'fixture.xls');
    const b = parseReport(rows, 'fixture.xls');
    expect(b.lines.length).toBe(a.lines.length);
    expect(b.lines.map((l) => l.cost)).toEqual(a.lines.map((l) => l.cost));
    expect(b.lines.map((l) => l.qty)).toEqual(a.lines.map((l) => l.qty));
  });
});

// ── PX-05..PX-09  الأرقام ─────────────────────────────────────────────────

describe('parseNumber', () => {
  it('[PX-05] ⭐ a real zero stays 0 and a MISSING cell is null — never both 0', () => {
    // ⭐ the distinction the old `Number(x) || 0` destroyed.
    expect(parseNumber(0, 'c')).toBe(0);
    expect(parseNumber('', 'c')).toBeNull();
    expect(parseNumber(null, 'c')).toBeNull();
    expect(parseNumber(undefined, 'c')).toBeNull();
    expect(parseNumber('   ', 'c')).toBeNull();
  });

  it('[PX-06] ⭐⭐ thousand separators parse, and 12,34 does NOT become 1234', () => {
    // ⭐ measured in the real export: "1,285.22" and "2,017.39" appear in
    //    إجمالي المبيعات من غير ضريبة. Number() gives NaN there, and
    //    NaN || 0 gave 0 — real money lost, silently.
    expect(parseNumber('1,285.22', 'c')).toBe(1285.22);
    expect(parseNumber('2,017.39', 'c')).toBe(2017.39);
    expect(parseNumber('1,234', 'c')).toBe(1234);
    // ⭐ the guard: groups of three only
    expect(parseNumber('12,34', 'c')).toBeNull();
    expect(parseNumber('1,2,85', 'c')).toBeNull();
  });

  it('[PX-07] ⭐ a non-numeric cell THROWS naming the column', () => {
    // ⭐ the old code turned every one of these into 0.
    for (const bad of ['abc', 'NaN', '25.5 %', '١٢٣٤x', '--', Infinity, NaN]) {
      expect(() => parseNumber(bad, 'التكلفة'), String(bad)).toThrow(NumericParseError);
    }
    try {
      parseNumber('abc', 'التكلفة');
    } catch (e) {
      expect((e as Error).message).toContain('التكلفة');
    }
  });

  it('[PX-07b] ⭐⭐ a BOOLEAN cell THROWS, not 0 — this line was mutation-proof', () => {
    // ⭐ Found by mutation testing, not by reading. M-08 changed
    //    `if (typeof raw === 'boolean') throw ...` into `return 0`, and all
    //    73 tests still passed — PX-07 only covered strings, so the boolean
    //    branch was untested even though it exists to catch a whole category
    //    of spreadsheet corruption.
    //    `true` must not quietly become a one-SAR line item.
    expect(() => parseNumber(true, 'c')).toThrow(NumericParseError);
    expect(() => parseNumber(false, 'c')).toThrow(NumericParseError);
    try {
      parseNumber(true, 'التكلفة');
    } catch (e) {
      expect((e as Error).message).toContain('التكلفة');
    }
    // ⭐ and Infinity/NaN as actual numbers, not strings
    expect(() => parseNumber(Infinity, 'c')).toThrow(NumericParseError);
    expect(() => parseNumber(NaN, 'c')).toThrow(NumericParseError);
  });

  it('[PX-08] ⭐ money() rounds to 2dp and keeps zero', () => {
    expect(money(0)).toBe(0);
    expect(money(null)).toBeNull();
    expect(money(1.005)).toBe(1.01);
    expect(money(2.675)).toBe(2.68);   // ⭐ float, not string math
    expect(money(2286.51633)).toBe(2286.52);
  });

  it('[PX-09] ⭐ sum() ignores null rather than treating it as zero-by-accident', () => {
    expect(sum([1, null, 2])).toBe(3);
    expect(sum([null, null])).toBe(0);
    expect(sum([])).toBe(0);
  });
});

// ── PX-10..PX-13  قراءة التقرير كامل ──────────────────────────────────────

describe('parseReport', () => {
  it('[PX-10] ⭐ both real shapes produce IDENTICAL logical rows', () => {
    // ⭐ not "both parse" — both produce the same field values from the
    //    same day of data. If the shape handling differs, this fails.
    const b = parseReport(BY_BRANCH.rows, 'fixture.xls');
    const p = parseReport(BY_PRODUCT.rows, 'fixture.xls');
    expect(b.lines.length).toBeGreaterThan(0);
    expect(p.lines.length).toBeGreaterThan(0);
    expect(b.layout).toBe('by_branch');
    expect(p.layout).toBe('by_product');
    // ⭐ every line must have a branch, a ref, and an item code
    for (const l of [...b.lines, ...p.lines]) {
      expect(l.branchName).not.toBe('');
      expect(l.branchRef).not.toBe('');
      expect(l.itemCode).not.toBe('');
    }
    // ⭐ numbers are non-null on every line — no silent zeros
    for (const l of [...b.lines, ...p.lines]) {
      expect(l.sales).not.toBeNull();
      expect(l.cost).not.toBeNull();
      expect(l.qty).not.toBeNull();
      expect(l.profit).not.toBeNull();
    }
  });

  it('[PX-11] ⭐ the date comes from the FILE, never from the folder name', () => {
    // ⭐⭐ measured: folder "10.2026/5" contains a file whose stated range
    //    is 2026-09-05. The folder lies. Only the file is evidence.
    // BY_BRANCH fixture (real-both-shapes.json) has "2026-10-01 - 2026-10-01"
    const r = parseReport(BY_BRANCH.rows, 'fixture.xls');
    expect(r.dateFrom).toBe('2026-10-01');
    expect(r.dateTo).toBe('2026-10-01');
    expect(r.singleDay).toBe(true);
    
    // BY_PRODUCT fixture has "2026-09-01 - 2026-09-01"
    const p = parseReport(BY_PRODUCT.rows, 'fixture.xls');
    expect(p.dateFrom).toBe('2026-09-01');
    expect(p.dateTo).toBe('2026-09-01');
    expect(p.singleDay).toBe(true);
  });

  it('[PX-12] ⭐ the report states its own branch filter — measurable', () => {
    // ⭐ so a mismatch between the file and the branch in the rows is
    //    detectable, instead of silently importing under a wrong branch.
    const r = parseReport(BY_BRANCH.rows, 'fixture.xls');
    expect(r.declaredBranchName).not.toBe('');
    const refs = new Set(r.lines.map((l) => l.branchRef));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toBe(r.lines[0]!.branchRef);
  });

  it('[PX-13] ⭐ a total row is detected and excluded from the lines', () => {
    // ⭐ the old parser skipped rows containing الإجمالي by string match.
    //    We count it instead of dropping it blindly — if Foodics starts
    //    summing two branches into one file, that shows up as a diff.
    const rows = BY_BRANCH.rows.map((r) => [...r]);
    const total = rows[rows.length - 1]!;
    total[0] = String.fromCodePoint(0x0627, 0x0644, 0x0625, 0x062c, 0x0645, 0x0627, 0x0644, 0x064a); // الإجمالي
    const r = parseReport(rows, 'fixture.xls');
    expect(r.totalRows).toBeGreaterThan(0);
    expect(r.lines.some((l) => l.isTotal)).toBe(false);
  });
});

// ── PX-14..PX-16  مفتاح التكرار ───────────────────────────────────────────

describe('dedupeKey', () => {
  it('[PX-14] ⭐ the key ignores row ORDER — a re-sorted export is the same data', () => {
    const a = parseReport(BY_BRANCH.rows, 'fixture.xls');
    const shuffled = [...a.lines].reverse();
    expect(dedupeKey(shuffled)).toBe(dedupeKey(a.lines));
  });

  it('[PX-15] ⭐ the key CHANGES when any number changes', () => {
    const a = parseReport(BY_BRANCH.rows, 'fixture.xls');
    const base = dedupeKey(a.lines);
    for (const field of ['sales', 'cost', 'qty', 'profit'] as const) {
      const mutated = a.lines.map((l, i) => 
        i === 0 ? { ...l, [field]: (l[field] ?? 0) + 1 } : l
      );
      const key = dedupeKey(mutated);
      expect(key, `field: ${field}`).not.toBe(base);
    }
  });

  it('[PX-16] ⭐ the key is stable across processes — no Map iteration order', () => {
    // ⭐ a key built from a Set would depend on insertion order in some
    //    engines. Same input, same key, every run.
    const a = parseReport(BY_BRANCH.rows, 'fixture.xls');
    expect(dedupeKey(a.lines)).toBe(dedupeKey([...a.lines].reverse()));
    // Key is full base64 (not truncated) — can contain A-Z, a-z, 0-9, +, /, =
    expect(dedupeKey(a.lines)).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

// ── PX-17..PX-18  meta ────────────────────────────────────────────────────

describe('report metadata', () => {
  it('[PX-17] ⭐ the group-by marker is read by name', () => {
    const b = parseReport(BY_BRANCH.rows, 'fixture.xls');
    // Fixture real-both-shapes.json has "تجميع بـ" -> "منتج" (Arabic for product)
    expect(b.groupBy).toBe(String.fromCodePoint(0x0645, 0x0646, 0x062a, 0x062c)); // منتج
    const p = parseReport(BY_PRODUCT.rows, 'fixture.xls');
    // Fixture real-by-product.json has "تجميع بـ" -> "branch" (English)
    expect(p.groupBy).toBe('branch');
  });

  it('[PX-18] ⭐ a missing date is null, not today', () => {
    // ⭐ stamping "today" on a file with no date is how September data
    //    ends up labelled October. null forces a decision.
    const rows = BY_BRANCH.rows.filter((r) => r[0] !== META.dateRange);
    const r = parseReport(rows, 'fixture.xls');
    expect(r.dateFrom).toBeNull();
    expect(r.dateTo).toBeNull();
    // When date range is missing, we default to singleDay = true (assume single day report)
    expect(r.singleDay).toBe(true);
  });
});