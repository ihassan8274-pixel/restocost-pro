// @vitest-environment node
//
// api/src/foodics/plan.test.ts -- discovery + dedupe orchestration.
//
// ⭐ These tests read the REAL 744-file export tree when it is present, and
//    fall back to a synthetic tree built in a temp dir when it is not. The
//    synthetic path is not a mock: it is genuine .xls files written to disk
//    and read back through the same XLSX parser.
//
// ⛔ THE DEDUPE TESTS THAT MATTER
//    An earlier version of this file asserted nothing about dedupe. It called
//    buildIngestPlan, then checked that rows were "defined", and one test
//    explicitly declined to check uniqueness with the comment
//    "don't check for uniqueness since different files can have the same
//    branchRef+itemCode+date combinations". That is the exact question the
//    dedupe exists to answer, and leaving it unasked is why a 336-file
//    double-count could reach the import stage unchallenged.
//
//    [PX-11] and [PX-12] below are the checks that were missing: no two
//    canonical reports may occupy the same (branch, business day) slot, and
//    importing every file must not exceed the deduplicated totals.
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import {
  buildIngestPlan,
  collectFiles,
  readReport,
  foodicsRoot,
  canonicalCsvRows,
  exportPlanJSON,
  CANONICAL_CSV_HEADER,
} from './plan.js';
import { parseReport, dedupeKey } from './parse.js';

// ── Synthetic tree: two identical days in three differently-named folders ──
//
//  The exact shape that bit the real data: a September report re-saved under
//  an October folder name. The business date inside the file never changes,
//  so folder names cannot be used to decide what is a duplicate.

const PRODUCT = String.fromCodePoint(0x0627, 0x0644, 0x0645, 0x0646, 0x062a, 0x062c); // المنتج
const ITEM_CODE = String.fromCodePoint(
  0x0643, 0x0648, 0x062f, 0x0020, 0x062a, 0x0639, 0x0631, 0x064a, 0x0641, 0x0020, 0x0627, 0x0644, 0x0645, 0x0646, 0x062a, 0x062c,
);
const BRANCH = String.fromCodePoint(0x0627, 0x0644, 0x0641, 0x0631, 0x0639); // الفرع
const BRANCH_REF = String.fromCodePoint(
  0x0645, 0x0631, 0x062c, 0x0639, 0x0020, 0x0627, 0x0644, 0x0641, 0x0631, 0x0639,
);
const SALES = String.fromCodePoint(0x0625, 0x062c, 0x0645, 0x0627, 0x0644, 0x064a, 0x0020, 0x0627, 0x0644, 0x0645, 0x0628, 0x064a, 0x0639, 0x0627, 0x062a);
const SALES_PCT = '(' + SALES + ' %' + ')';
const NET_WITH_VAT = String.fromCodePoint(
  0x0635, 0x0627, 0x0641, 0x064a, 0x0020, 0x0627, 0x0644, 0x0645, 0x0628, 0x064a, 0x0639, 0x0627, 0x062a, 0x0020, 0x0645, 0x0639, 0x0020, 0x0627, 0x0644, 0x0636, 0x0631, 0x064a, 0x0628, 0x0629,
);
const VAT = String.fromCodePoint(0x0627, 0x0644, 0x0636, 0x0631, 0x0627, 0x0626, 0x0628); // الضرائب
const DISCOUNT = String.fromCodePoint(0x0645, 0x0628, 0x0644, 0x063a, 0x0020, 0x0627, 0x0644, 0x062e, 0x0635, 0x0645);
const TOTAL_EX_VAT = String.fromCodePoint(
  0x0625, 0x062c, 0x0645, 0x0627, 0x0644, 0x064a, 0x0020, 0x0627, 0x0644, 0x0645, 0x0628, 0x064a, 0x0639, 0x0627, 0x062a,
  0x0020, 0x0645, 0x0646, 0x0020, 0x063a, 0x064a, 0x0631, 0x0020, 0x0636, 0x0631, 0x064a, 0x0628, 0x0629,
);
const NET_SALES = String.fromCodePoint(0x0635, 0x0627, 0x0641, 0x064a, 0x0020, 0x0627, 0x0644, 0x0645, 0x0628, 0x064a, 0x0639, 0x0627, 0x062a);
const NET_SALES_PCT = '(' + NET_SALES + ' %' + ')';
const NET_QTY = String.fromCodePoint(0x0635, 0x0627, 0x0641, 0x064a, 0x0020, 0x0627, 0x0644, 0x0643, 0x0645, 0x064a, 0x0629);
const COST = String.fromCodePoint(0x0627, 0x0644, 0x062a, 0x0643, 0x0644, 0x0641, 0x0629);
const RETURN_AMT = String.fromCodePoint(0x0645, 0x0628, 0x0644, 0x063a, 0x0020, 0x0627, 0x0644, 0x0625, 0x0631, 0x062c, 0x0627, 0x0639);
const RETURN_QTY = String.fromCodePoint(
  0x0643, 0x0645, 0x064a, 0x0629, 0x0020, 0x0627, 0x0644, 0x0645, 0x0631, 0x062a, 0x062c, 0x0639,
);
const CANCEL_AMT = String.fromCodePoint(
  0x0645, 0x0628, 0x0644, 0x063a, 0x0020, 0x0627, 0x0644, 0x0625, 0x0644, 0x063a, 0x0627, 0x0621,
);
const CANCEL_QTY = String.fromCodePoint(
  0x0643, 0x0645, 0x064a, 0x0629, 0x0020, 0x0627, 0x0644, 0x0625, 0x0644, 0x063a, 0x0627, 0x0621,
);
const PROFIT = String.fromCodePoint(0x0627, 0x0644, 0x0631, 0x0628, 0x062d);
const DATE_RANGE = String.fromCodePoint(
  0x0627, 0x0644, 0x0646, 0x0637, 0x0627, 0x0642, 0x0020, 0x0627, 0x0644, 0x0632, 0x0645, 0x0646, 0x064a,
);
const GROUP_BY = String.fromCodePoint(0x062a, 0x062c, 0x0645, 0x064a, 0x0639, 0x0020, 0x0628, 0x0640);

/**  One by_branch-shaped grid, matching the real export byte-for-byte in shape. */
interface GridSpec {
  dateFrom: string;
  dateTo: string;
  sales: number;
  cost: number;
  qty: number;
  discount: number;
}

function buildGrid(opts: GridSpec): unknown[][] {
  const netSales = opts.sales - opts.discount;
  const profit = netSales - opts.cost;
  return [
    ['Foodics'],
    [],
    [DATE_RANGE, `${opts.dateFrom} - ${opts.dateTo}`],
    [GROUP_BY, PRODUCT],
    [],
    [],
    [
      BRANCH, BRANCH_REF, PRODUCT, ITEM_CODE,
      SALES, SALES_PCT, NET_WITH_VAT, VAT, DISCOUNT, TOTAL_EX_VAT,
      NET_SALES, NET_SALES_PCT, NET_QTY, COST, RETURN_AMT, RETURN_QTY,
      CANCEL_AMT, CANCEL_QTY, PROFIT,
    ],
    [
      'Branch A', 'B02', 'Item One', 'product-1',
      opts.sales, 1, opts.sales - 100, 100, opts.discount, opts.sales - 208,
      netSales, 1, opts.qty, opts.cost, 0, 0, 0, 0, profit,
    ],
  ];
}

/**  Write a real .xls (HTML table, as Foodics actually does) to disk. */
async function writeExport(file: string, grid: unknown[][]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(grid as unknown[][]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ── The synthetic dedupe tree ─────────────────────────────────────────────

const SYNTH_ROOT = join(process.cwd(), 'api/src/foodics/.test-tmp/synth');

const DAY1: GridSpec = { dateFrom: '2026-09-19', dateTo: '2026-09-19', sales: 1000, cost: 400, qty: 10, discount: 100 };
const DAY2: GridSpec = { dateFrom: '2026-09-20', dateTo: '2026-09-20', sales: 2000, cost: 900, qty: 25, discount: 200 };
// ⭐⭐⭐ Identical money to DAY1, but a DIFFERENT business day.
//     Only the date-range row inside the file separates them, which is exactly
//     why the fingerprint cannot be built from the numbers alone. If this
//     collapses, a real business day disappears from the books.
//     The date must differ in the FILE, not in the folder name -- that is the
//     mistake the real export tree makes, and the reason for this fixture.
const TWIN_DAY = { ...DAY1, dateFrom: '2026-09-20', dateTo: '2026-09-20' };

beforeAll(async () => {
  const { rmSync, mkdirSync } = await import('node:fs');
  rmSync(join(process.cwd(), 'api/src/foodics/.test-tmp'), { recursive: true, force: true });
  mkdirSync(SYNTH_ROOT, { recursive: true });

  // 09.2026/19 and 10.2026/19 and 10.2026/31 are the SAME business day, saved
  // three times under two different month folders.
  await writeExport(join(SYNTH_ROOT, '09.2026/19/a.xls'), buildGrid(DAY1));
  await writeExport(join(SYNTH_ROOT, '10.2026/19/a.xls'), buildGrid(DAY1));
  await writeExport(join(SYNTH_ROOT, '10.2026/31/a.xls'), buildGrid(DAY1));
  // 09.2026/20 holds the same money as the 19th but its own date row says the
  // 20th. Both days must survive the dedupe.
  await writeExport(join(SYNTH_ROOT, '09.2026/20/a.xls'), buildGrid(TWIN_DAY));
  // Not under an MM.YYYY folder -> must be ignored entirely.
  await writeExport(join(SYNTH_ROOT, '30.08/a.xls'), buildGrid(DAY2));
  await writeExport(join(SYNTH_ROOT, 'misc/a.xls'), buildGrid(DAY2));
});

// ── PX-01..PX-05  discovery ────────────────────────────────────────────────

describe('collectFiles', () => {
  it('[PX-01] ⭐ finds only files under an MM.YYYY month folder', () => {
    const files = collectFiles({ root: SYNTH_ROOT });
    const rel = files.map((f) => f.replace(/\\/g, '/').split('/').slice(-3).join('/')).sort();
    expect(rel).toEqual([
      '09.2026/19/a.xls',
      '09.2026/20/a.xls',
      '10.2026/19/a.xls',
      '10.2026/31/a.xls',
    ]);
  });

  it('[PX-02] ⭐ discovery order is stable across calls', () => {
    const a = collectFiles({ root: SYNTH_ROOT });
    const b = collectFiles({ root: SYNTH_ROOT });
    expect(a).toEqual(b);
  });

  it('[PX-03] ⭐ a missing root THROWS instead of returning []', () => {
    // ⭐ Returning [] makes "the export folder is gone" and "the folder holds
    //    no exports" indistinguishable -- and the second case would let an
    //    import proceed as if there were simply nothing to do.
    expect(() => collectFiles({ root: join(SYNTH_ROOT, 'does-not-exist') })).toThrow();
  });

  it('[PX-04] ⭐ FOODICS_ROOT overrides the default root', () => {
    const prev = process.env.FOODICS_ROOT;
    try {
      process.env.FOODICS_ROOT = SYNTH_ROOT;
      expect(foodicsRoot()).toBe(SYNTH_ROOT);
      expect(collectFiles()).toHaveLength(4);
    } finally {
      if (prev === undefined) delete process.env.FOODICS_ROOT;
      else process.env.FOODICS_ROOT = prev;
    }
  });

  it('[PX-05] ⭐ a corrupt file is quarantined with a reason, not silently skipped', async () => {
    // ⭐ Written into the month folder the tree already uses, so it must be
    //    DISCOVERED and then rejected. A previous version of this test placed
    //    it in a fresh day folder and asserted rejectedFiles === 1, which
    //    passed while PX-01's exact file list proved the path was never walked.
    const { writeFileSync, rmSync } = await import('node:fs');
    const bad = join(SYNTH_ROOT, '09.2026/19/broken.xls');
    writeFileSync(bad, 'this is not a spreadsheet');
    try {
      // ⭐ first: is the file actually in scope for discovery?
      const found = collectFiles({ root: SYNTH_ROOT });
      expect(found.map((f) => f.replace(/\\/g, '/'))).toContain(bad.replace(/\\/g, '/'));

      const plan = buildIngestPlan({ root: SYNTH_ROOT });
      // ⭐ discovered (5 files) but only 4 usable
      expect(plan.stats.totalFiles).toBe(5);
      expect(plan.stats.rejectedFiles).toBe(1);
      expect(plan.rejected[0]!.file).toContain('broken.xls');
      expect(plan.rejected[0]!.reason).toMatch(/read failed|zero rows|parse failed/);
      // ⭐ and the good files still came through, deduplicated normally
      expect(plan.stats.readableFiles).toBe(4);
      expect(plan.stats.uniqueReports).toBe(2);
    } finally {
      rmSync(bad, { force: true });
    }
  });
});

// ── PX-06..PX-12  the dedupe, which is the point of the whole module ───────

describe('dedupe', () => {
  it('[PX-06] ⭐⭐ three copies of one business day collapse to ONE report', () => {
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    const s = plan.stats;
    expect(s.totalFiles).toBe(4);
    expect(s.readableFiles).toBe(4);
    // ⭐ 4 files -> 2 unique reports (one per business day)
    expect(s.uniqueReports).toBe(2);
    expect(s.duplicateFiles).toBe(2);

    const three = plan.deduped.find((d) => d.canonical.dateFrom === '2026-09-19');
    expect(three).toBeDefined();
    expect(three!.sources).toHaveLength(3);
  });

  it('[PX-07] ⭐⭐⭐ the canonical report carries the date from INSIDE the file', () => {
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    const d = plan.deduped.find((x) => x.canonical.dateFrom === '2026-09-19')!;
    // ⭐⭐⭐ All three copies claim to live in October folders, but the kept
    //    report says September, because that is what the file's own date-range
    //    row says. Folder names are not consulted for anything.
    for (const src of d.sources) {
      expect(src).toMatch(/09\.2026|10\.2026/);
    }
    expect(d.canonical.dateFrom).toBe('2026-09-19');
    expect(d.canonical.dateTo).toBe('2026-09-19');
    // ⭐ and the row-level dates agree
    for (const l of d.canonical.lines) expect(l.dateFrom).toBe('2026-09-19');
  });

  it('[PX-08] ⭐⭐⭐ NO two canonical reports share a (branch, business day) slot', () => {
    // ⭐⭐⭐ THE MISSING TEST. A double-count shows up here and nowhere else:
    //    the stats can look plausible while two reports cover one day.
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    const slots = new Map<string, number>();
    for (const d of plan.deduped) {
      for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
        const k = `${ref}|${d.canonical.dateFrom}`;
        slots.set(k, (slots.get(k) ?? 0) + 1);
      }
    }
    expect([...slots.values()].every((n) => n === 1)).toBe(true);
    expect(slots.size).toBe(plan.deduped.length);
  });

  it('[PX-09] ⭐⭐⭐ deduplicated totals are strictly below the naive totals', () => {
    // ⭐⭐⭐ Money proof, not a count proof. Reading all 4 files bills the
    //    19th three times. This is the number an operator would lose.
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    let naive = 0;
    for (const r of plan.parsed) for (const l of r.lines) if (!l.isTotal) naive += l.sales;
    let dedup = 0;
    for (const d of plan.deduped) for (const l of d.canonical.lines) if (!l.isTotal) dedup += l.sales;

    // 1000 (x3 copies) + 1000 = 4000 naive, 2000 correct
    expect(naive).toBeCloseTo(4000, 2);
    expect(dedup).toBeCloseTo(2000, 2);
    expect(dedup).toBeLessThan(naive);
    expect(naive - dedup).toBeCloseTo(2000, 2);
  });

  it('[PX-10] ⭐⭐ identical MONEY on a different day is NOT a duplicate', () => {
    // ⭐⭐ DAY1 and 09.2026/20 hold identical numbers and differ only in the
    //    date range inside the file. Both must survive. A money-only
    //    fingerprint would silently delete a real business day here.
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    expect(plan.stats.uniqueReports).toBe(2);
    const dates = plan.deduped.map((d) => d.canonical.dateFrom).sort();
    expect(dates).toEqual(['2026-09-19', '2026-09-20']);
    // ⭐ and their money is genuinely equal, so the money itself cannot
    //    distinguish them -- which is why the date has to be in the key.
    const money = plan.deduped.map((d) => d.canonical.lines[0]!.sales).sort();
    expect(money[0]).toBe(money[1]);
  });

  it('[PX-11] ⭐⭐ dedupe is stable: two builds produce identical output', () => {
    const a = buildIngestPlan({ root: SYNTH_ROOT });
    const b = buildIngestPlan({ root: SYNTH_ROOT });
    expect(a.deduped.map((d) => dedupeKey(d.canonical.lines))).toEqual(
      b.deduped.map((d) => dedupeKey(d.canonical.lines)),
    );
    expect(a.stats).toEqual(b.stats);
  });

  it('[PX-12] ⭐⭐ "0 conflicts" is NOT evidence -- proven by construction', () => {
    // ⭐⭐ This test replaced a weaker one that appeared to pass while
    //    measuring nothing. `conflicts` compares `sales`, and `sales` is
    //    also an input to dedupeKey, so a fingerprint group can never disagree
    //    on it. Verified on the real tree: 312 multi-file groups, 0 reachable
    //    conflicts. The guard is unreachable, so its zero proves nothing.
    //
    //    What this asserts instead: the fingerprint is genuinely sensitive to
    //    every number it claims to cover. If a field were silently dropped
    //    from dedupeKey, two reports that differ ONLY in that field would
    //    collide, and the day would be lost. So mutate each money field in
    //    turn and require the fingerprint to change.
    const grid = buildGrid(DAY1);
    const base = parseReport(grid, 'base.xls');
    const baseKey = dedupeKey(base.lines);

    // Column positions in the by_branch shape used by buildGrid().
    const FIELDS = [
      ['sales', 4], ['totalExVat', 9], ['netSales', 10],
      ['qty', 12], ['cost', 13], ['returnAmount', 14],
      ['cancelAmount', 16], ['profit', 18],
    ] as const;

    for (const [name, idx] of FIELDS) {
      const mutated = grid.map((r) => [...r]);
      const cell = mutated[7]![idx] as number;
      mutated[7]![idx] = cell + 1;
      const k = dedupeKey(parseReport(mutated, name + '.xls').lines);
      // ⭐ a changed number MUST change the fingerprint, or the dedupe will
      //    merge two genuinely different reports and lose revenue.
      expect(k, `${name} is not covered by dedupeKey`).not.toBe(baseKey);
    }

    // ⭐⭐ Every identifying field must be covered. itemCode was NOT covered by
    //    an earlier version, and mutation testing proved it: dropping
    //    itemCode from dedupeKey left all 73 tests green. A POS that reuses one
    //    code across two products would then merge their rows into one report.
    const otherCode = grid.map((r) => [...r]);
    otherCode[7]![3] = 'product-2';
    expect(dedupeKey(parseReport(otherCode, 'other-code.xls').lines)).not.toBe(baseKey);

    // ⭐ and the product NAME, which is the other half of the identity.
    const otherName = grid.map((r) => [...r]);
    otherName[7]![2] = 'Item Two';
    expect(dedupeKey(parseReport(otherName, 'other-name.xls').lines)).not.toBe(baseKey);

    // ⭐⭐ NEGATIVE CONTROL for the control above: a field the key deliberately
    //    ignores must NOT change the fingerprint, otherwise the key would
    //    reject genuine duplicates and re-import every copy of every day.
    const ignored = grid.map((r) => [...r]);
    ignored[7]![5] = 42; // (total sales %) -- not part of the identity
    expect(dedupeKey(parseReport(ignored, 'ignored.xls').lines)).toBe(baseKey);

    // ⭐ and an untouched copy has an identical fingerprint.
    const copy = parseReport(grid.map((r) => [...r]), 'copy.xls');
    expect(dedupeKey(copy.lines)).toBe(baseKey);
  });
});

// ── PX-13..PX-15  reading + CSV ───────────────────────────────────────────

describe('readReport', () => {
  it('[PX-13] ⭐ reads a real file through XLSX and resolves all 19 columns', () => {
    const files = collectFiles({ root: SYNTH_ROOT });
    const r = readReport(files[0]!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.lines).toHaveLength(1);
    const l = r.report.lines[0]!;
    expect(l.branchRef).toBe('B02');
    expect(l.itemCode).toBe('product-1');
    expect(l.sales).toBe(1000);
    expect(l.cost).toBe(400);
    expect(l.qty).toBe(10);
    expect(l.layout).toBe('by_branch');
  });

  it('[PX-14] ⭐ the cost identity holds on the synthetic export too', () => {
    const files = collectFiles({ root: SYNTH_ROOT });
    for (const f of files) {
      const r = readReport(f);
      expect(r.ok, f).toBe(true);
      if (!r.ok) continue;
      for (const l of r.report.lines) {
        // netSales - cost === profit, the identity Foodics itself computes.
        expect(Math.abs((l.netSales ?? 0) - l.cost - l.profit), f).toBeLessThan(0.02);
      }
    }
  });

  it('[PX-15] ⭐ CSV emits one header and one row per canonical transaction', () => {
    const plan = buildIngestPlan({ root: SYNTH_ROOT });
    const rows = canonicalCsvRows(plan);
    expect(rows[0]).toBe(CANONICAL_CSV_HEADER.join(','));
    // ⭐ 2 canonical reports x 1 line = 2 data rows + 1 header
    expect(rows).toHaveLength(3);
    for (const r of rows.slice(1)) {
      expect(r.split('","').length).toBe(CANONICAL_CSV_HEADER.length);
    }
  });

  // [PX-19] exportPlanJSON was documented in README.md (`buildIngestPlan() +
  // exportPlanJSON/CSV`) but never existed. It is now implemented, and this
  // pins the one property that matters: the JSON export must carry exactly the
  // same transactions as the CSV export, column for column — otherwise the two
  // exporters silently disagree about what "the plan" is.
  it('[PX-19] ⭐ JSON export matches the CSV export row-for-row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rc-plan-'));
    try {
      const plan = buildIngestPlan({ root: SYNTH_ROOT });
      const file = exportPlanJSON(dir, plan);
      expect(file).toBe(join(dir, 'ingest-plan.json'));
      expect(existsSync(file)).toBe(true);

      const doc = JSON.parse(readFileSync(file, 'utf8'));

      // Same data rows as the CSV path (CSV has one header line on top).
      const csvDataRows = canonicalCsvRows(plan).length - 1;
      expect(doc.rowCount).toBe(csvDataRows);
      expect(doc.rows).toHaveLength(csvDataRows);

      // Column-for-column with CANONICAL_CSV_HEADER.
      for (const row of doc.rows) {
        expect(Object.keys(row)).toEqual([...CANONICAL_CSV_HEADER]);
      }

      // Stats and root are carried through, not re-derived.
      expect(doc.root).toBe(plan.root);
      expect(doc.stats).toEqual(plan.stats);
      expect(typeof doc.generatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(doc.generatedAt))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── PX-16..PX-18  the real 744-file tree, when it is available ─────────────

const REAL_ROOT = foodicsRoot();
const realTreePresent = existsSync(REAL_ROOT);

describe.skipIf(!realTreePresent)('the real export tree', () => {
  it('[PX-16] ⭐⭐ every real file parses and nothing is rejected', () => {
    const plan = buildIngestPlan();
    // ⭐ Baseline, not an exact count. This suite reads the customer's live
    //    Foodics export directory, which GROWS whenever new months are
    //    exported: the measured figure was 744/408/8787 when these assertions
    //    were written, and months later the same tree yields more. Hard-coded
    //    equality made the suite fail on legitimate new data — which is the
    //    "reads real files off disk, therefore non-deterministic" defect this
    //    whole block exists to guard (P2-1), not to reproduce. A floor still
    //    catches discovery collapsing or dedupe swallowing reports.
    expect(plan.stats.totalFiles).toBeGreaterThan(700);
    expect(plan.stats.rejectedFiles).toBe(0);
    expect(plan.stats.readableFiles).toBe(plan.stats.totalFiles);
  }, 120000);

  it('[PX-17] ⭐⭐⭐ no (branch, day) slot is covered twice, across every real file', () => {
    const plan = buildIngestPlan();
    const slots = new Map<string, number>();
    for (const d of plan.deduped) {
      for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
        const k = `${ref}|${d.canonical.dateFrom}`;
        slots.set(k, (slots.get(k) ?? 0) + 1);
      }
    }
    const doubled = [...slots].filter(([, n]) => n > 1);
    // ⭐ THE property: dedupe must never leave two reports owning one slot.
    //    This is what would break if the fingerprint regressed.
    expect(doubled, `double-counted slots: ${JSON.stringify(doubled.slice(0, 5))}`).toHaveLength(0);

    // ⭐ Baselines are FLOORS, never exact counts — see the note on PX-16.
    //    `uniqueReports === slots.size` still catches a report being filed
    //    under two different (branch, day) keys, which is the skew that the
    //    old hard-coded `toBe(408)` on both was really standing in for.
    expect(slots.size, 'canonical slot count collapsed').toBeGreaterThan(300);
    expect(plan.stats.uniqueReports).toBe(slots.size);
  }, 120000);

  it('[PX-18] ⭐⭐⭐ cost is present and the identity holds on every real row', () => {
    // ⭐⭐⭐ This is the test for the reh/feh cost-label defect.
    const plan = buildIngestPlan();
    let rows = 0;
    let identityBreaks = 0;
    let zeroCost = 0;
    let costSum = 0;
    for (const d of plan.deduped) {
      for (const l of d.canonical.lines) {
        rows++;
        costSum += l.cost;
        if (l.cost === 0) zeroCost++;
        if (l.netSales === null || l.netSales === undefined) continue;
        if (Math.abs(l.netSales - l.cost - l.profit) > 0.02) identityBreaks++;
      }
    }
    // ⭐ THE defect assertion: netSales - cost === profit on every row. This is
    //    what went red when the cost label regressed, and it is a property —
    //    it holds whatever the row count happens to be.
    expect(identityBreaks, 'rows where netSales - cost !== profit').toBe(0);

    // ⭐ SHAPE, not absolutes. The measured baseline over the deduplicated set
    //    was 8787 rows / 483 zero-cost / 484,052.00 total, and every one of
    //    those moves whenever another month is exported from the live tree —
    //    the same disk-dependence noted on PX-16. (The older 16,044-row figure
    //    of 879,219.61 summed the 336 duplicate files in too; mixing the two
    //    is exactly the mistake the dedupe exists to prevent.) What must hold:
    //      * rows are actually being read (a near-total loss trips >8000)
    //      * zero-cost rows stay a minority — if the cost label broke again,
    //        zeroCost climbs toward `rows`, and rows/10 is the tripwire
    //        (it was 483/8787 ≈ 5.5%)
    //      * the cost total stays in the measured magnitude, so a wholesale
    //        zeroing of the column cannot hide behind the ratio
    expect(rows, 'row count collapsed — discovery or parse regressed').toBeGreaterThan(8000);
    expect(zeroCost, 'zero-cost rows must stay a minority').toBeLessThan(rows / 10);
    expect(costSum, 'cost total collapsed').toBeGreaterThan(400000);
  }, 120000);
});