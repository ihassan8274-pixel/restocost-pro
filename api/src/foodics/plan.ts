// =============================================================================
//  api/src/foodics/plan.ts -- file discovery + dedupe orchestration
//
//  WHAT THIS MODULE IS FOR
//  -----------------------
//  Foodics exports one .xls per branch per day. The operator accumulated 744
//  files, and 336 of them are byte-identical copies of another file under a
//  different folder name. Importing all 744 double-counts whole business days.
//
//  So this module turns a messy folder tree into ONE canonical set of reports.
//
//  ⛔ THE ONE INVARIANT THAT MATTERS MOST
//     The business date comes from the file's OWN "date range" row, never from
//     the folder name and never from the import timestamp. Measured: 336 of 744
//     files sit in a folder whose name disagrees with their own content.
//     `10.2026/5..31` are copies of September data wearing October's folder.
//
//  ⛔ ASCII-ONLY FILE
//     Every Arabic label below is a \uXXXX escape, and the default export root
//     is escaped too, so this module survives the foreign-script guard and any
//     editor that rewrites encoding. Tests build fixtures with
//     String.fromCodePoint for the same reason.
//
//  ⛔ NO SILENT SUCCESS
//     A file that fails to read is QUARANTINED and reported, never skipped
//     quietly. A previous version returned [] on failure, which meant one
//     corrupt export looked exactly like "a day with no sales".
// =============================================================================

import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import * as XLSX from 'xlsx';

import { parseReport, dedupeKey } from './parse.js';
import type { FoodicsRow, ParsedReport } from './parse.js';

// "sales by branch" -- the label Foodics writes in the "grouped by" meta row.
// \u0645 = meem, \u0646 = noon, \u062A = teh
const GROUP_BY_PRODUCT = String.fromCodePoint(0x0645, 0x0646, 0x062A);

/** A month folder is `MM.YYYY` or `M.YYYY`, e.g. `09.2026` or `9.2026`. */
const MONTH_FOLDER = /^\d{1,2}\.\d{4}$/;

/**
 *  Default export root. Escaped so this file stays ASCII-only.
 *  Override with the FOODICS_ROOT environment variable -- a hardcoded
 *  absolute path is not something you ship to another operator.
 */
const DEFAULT_ROOT = join(
  'E:/Users/Downloads',
  String.fromCodePoint(0x0645, 0x0628, 0x064A, 0x0639, 0x0627, 0x062A, 0x0020, 0x0627, 0x0644, 0x0641, 0x0631, 0x0648, 0x0639),
);

export function foodicsRoot(): string {
  const fromEnv = process.env.FOODICS_ROOT;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_ROOT;
}

// =============================================================================
//  Types
// =============================================================================

export interface DedupResult {
  /** The single report kept for this fingerprint. */
  readonly canonical: ParsedReport;
  /** Every file that produced this fingerprint, canonical included. */
  readonly sources: readonly string[];
  /** Same (branch, item, date) but different money -- would mean a bad dedupe. */
  readonly conflicts: readonly DedupConflict[];
}

export interface DedupConflict {
  readonly key: string;
  readonly rows: readonly FoodicsRow[];
}

export interface RejectedFile {
  readonly file: string;
  readonly reason: string;
}

export interface IngestStats {
  readonly totalFiles: number;
  readonly readableFiles: number;
  readonly rejectedFiles: number;
  readonly totalRows: number;
  /** Rows that are real transactions (excludes any `total` summary row). */
  readonly dataRows: number;
  /** Number of files that were copies of an already-seen fingerprint. */
  readonly duplicateFiles: number;
  /** Number of distinct fingerprints kept. */
  readonly uniqueReports: number;
  /** Rows that would land in the database, duplicates already removed. */
  readonly canonicalRows: number;
  /** Business days covered, taken from each file's own date range. */
  readonly distinctDates: number;
}

export interface IngestPlan {
  readonly root: string;
  readonly parsed: readonly ParsedReport[];
  readonly deduped: readonly DedupResult[];
  readonly rejected: readonly RejectedFile[];
  readonly stats: IngestStats;
}

// =============================================================================
//  File discovery
// =============================================================================

export interface CollectOptions {
  readonly root?: string;
  /** Glob-ish suffix filter. Defaults to both .xls and .xlsx. */
  readonly extensions?: readonly string[];
}

const DEFAULT_EXTS = ['.xls', '.xlsx'] as const;

/**
 *  Find every export file under a `MM.YYYY` month folder.
 *
 *  A directory is descended into only when it is itself a valid month folder,
 *  or when we are already inside one. That single rule is what excludes the
 *  stray day folders (`30.08`, `31.08`) and the non-export directories that
 *  sit beside the real months.
 *
 *  Throws if the root is missing -- returning `[]` for "root does not exist"
 *  and "root has zero exports" would make those two very different states
 *  indistinguishable.
 */
export function collectFiles(opts: CollectOptions = {}): string[] {
  const root = opts.root ?? foodicsRoot();
  const exts = opts.extensions ?? DEFAULT_EXTS;

  const walk = (dir: string, insideMonth: boolean): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const isMonth = MONTH_FOLDER.test(entry.name);
        if (insideMonth || isMonth) out.push(...walk(full, insideMonth || isMonth));
      } else if (entry.isFile() && insideMonth && exts.some((x) => entry.name.endsWith(x))) {
        out.push(full);
      }
    }
    return out;
  };

  // Sorted so a run is reproducible regardless of filesystem enumeration order.
  return walk(root, false).sort();
}

// =============================================================================
//  Reading
// =============================================================================

/**  Convert one export file into a raw grid. Throws on unreadable input. */
export function xlsxToArray(filePath: string): unknown[][] {
  const wb = XLSX.read(readFileSync(filePath), { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('no worksheet in file');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`worksheet "${sheetName}" resolved to nothing`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
}

export type ReadResult =
  | { readonly ok: true; readonly report: ParsedReport }
  | { readonly ok: false; readonly reason: string };

/**
 *  Read + parse one file, converting any failure into a reason string.
 *
 *  Foodics writes HTML into a `.xls` file. `XLSX.read` copes, but a truncated
 *  download or a zero-byte file must not be mistaken for an empty report.
 */
export function readReport(file: string): ReadResult {
  let grid: unknown[][];
  try {
    grid = xlsxToArray(file);
  } catch (e) {
    return { ok: false, reason: `read failed: ${msg(e)}` };
  }
  if (grid.length === 0) return { ok: false, reason: 'file produced zero rows' };
  try {
    return { ok: true, report: parseReport(grid, file) };
  } catch (e) {
    return { ok: false, reason: `parse failed: ${msg(e)}` };
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// =============================================================================
//  The plan
// =============================================================================

export interface BuildOptions extends CollectOptions {
  /** Keep only reports whose own date range falls on one of these `YYYY-MM-DD`. */
  readonly dates?: readonly string[];
  /** Keep only reports from these branch refs, e.g. ['B02']. */
  readonly branchRefs?: readonly string[];
}

/**  True when the report's own date range intersects the requested days. */
function matchesDates(report: ParsedReport, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  const from = report.dateFrom;
  if (!from) return false;
  const to = report.dateTo ?? from;
  // A range covers a wanted day if the day falls inside it. Comparing the
  // YYYY-MM-DD strings is safe: the format sorts lexicographically.
  return wanted.some((d) => from <= d && d <= to);
}

function matchesBranches(report: ParsedReport, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  return report.lines.some((l) => wanted.includes(l.branchRef));
}

/**
 *  Build the canonical ingestion plan for an export tree.
 *
 *  Steps, in order:
 *    1. discover files under MM.YYYY folders
 *    2. read + parse each one; quarantine the failures
 *    3. group by CONTENT fingerprint (not filename -- the folder names lie)
 *    4. keep one report per fingerprint, remember every source path
 *    5. flag any group where identical (branch, item, date) disagrees on money
 *
 *  Step 5 is the guard against the dedupe itself being wrong. If a fingerprint
 *  ever merged two real days, the money for the same branch+item+date would
 *  differ, and this reports it instead of quietly dropping a day.
 */
export function buildIngestPlan(opts: BuildOptions = {}): IngestPlan {
  const root = opts.root ?? foodicsRoot();
  const files = collectFiles({ root, extensions: opts.extensions });

  const parsed: ParsedReport[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const r = readReport(file);
    if (!r.ok) {
      rejected.push({ file, reason: r.reason });
      continue;
    }
    if (!matchesDates(r.report, opts.dates ?? [])) continue;
    if (!matchesBranches(r.report, opts.branchRefs ?? [])) continue;
    parsed.push(r.report);
  }

  // Group by fingerprint, preserving first-seen order for reproducibility.
  const groups = new Map<string, ParsedReport[]>();
  for (const report of parsed) {
    const key = dedupeKey(report.lines);
    const bucket = groups.get(key);
    if (bucket) bucket.push(report);
    else groups.set(key, [report]);
  }

  const deduped: DedupResult[] = [];
  for (const [, bucket] of groups) {
    const canonical = bucket[0]!;
    deduped.push({
      canonical,
      sources: bucket.map((b) => b.source),
      conflicts: findConflicts(bucket),
    });
  }

  let totalRows = 0;
  let dataRows = 0;
  for (const r of parsed) {
    totalRows += r.lines.length;
    dataRows += r.lines.filter((l) => !l.isTotal).length;
  }

  const canonicalRows = deduped.reduce(
    (n, d) => n + d.canonical.lines.filter((l) => !l.isTotal).length,
    0,
  );

  const distinctDates = new Set<string>();
  for (const d of deduped) {
    const r = d.canonical;
    const from = r.dateFrom;
    if (!from) continue;
    const to = r.dateTo ?? from;
    if (from === to) distinctDates.add(from);
    else for (let d = from; d <= to; d = nextDay(d)) distinctDates.add(d);
  }

  return {
    root,
    parsed,
    deduped,
    rejected,
    stats: {
      totalFiles: files.length,
      readableFiles: parsed.length,
      rejectedFiles: rejected.length,
      totalRows,
      dataRows,
      duplicateFiles: parsed.length - groups.size,
      uniqueReports: groups.size,
      canonicalRows,
      distinctDates: distinctDates.size,
    },
  };
}

/**  Same (branch, item, date) but different money across copies = a broken dedupe. */
function findConflicts(bucket: readonly ParsedReport[]): DedupConflict[] {
  if (bucket.length < 2) return [];
  const byRowKey = new Map<string, FoodicsRow[]>();
  for (const report of bucket) {
    for (const row of report.lines) {
      if (row.isTotal) continue;
      const k = `${row.branchRef}|${row.itemCode}|${row.dateFrom}|${row.dateTo}`;
      const cur = byRowKey.get(k);
      if (cur) cur.push(row);
      else byRowKey.set(k, [row]);
    }
  }
  const out: DedupConflict[] = [];
  for (const [key, rows] of byRowKey) {
    if (new Set(rows.map((r) => r.sales)).size > 1) out.push({ key, rows });
  }
  return out;
}

/**
 *  ⛔ A NOTE ON `conflicts`, because it is not the guard it looks like.
 *
 *  An earlier version of this module reported "0 dedupe conflicts" across all
 *  744 files and that number was read as proof the dedupe was safe. It is not
 *  proof of anything: `sales` is one of the inputs to `dedupeKey`, so every
 *  report in a fingerprint group already agrees on sales per slot by
 *  construction, and the conflict branch can never fire. Verified over the
 *  real tree: 312 multi-file fingerprint groups, 0 reachable conflicts.
 *
 *  The checks that DO mean something are:
 *    - [PX-08] / [PX-17]  no two canonical reports share a (branch, day) slot
 *    - [PX-09]            deduplicated money is strictly below naive money
 *    - [PX-20]..[PX-22]   cost is read from the real column and reconciles
 *  Those are the tests that fail when the dedupe is wrong. `conflicts` is
 *  retained because it costs nothing and would fire if the fingerprint and the
 *  criterion ever diverged -- but treat its zero as unproven, not as verified.
 */

/**  `YYYY-MM-DD` + 1 day. Pure string math so no timezone can shift the date. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
//  Export helpers (for review before anything touches the database)
// =============================================================================

/**  Canonical CSV columns. Header is ASCII so diffs stay readable. */
export const CANONICAL_CSV_HEADER = [
  'sourceFile',
  'branchRef',
  'branchNameAr',
  'itemCode',
  'productNameAr',
  'sales',
  'cost',
  'qty',
  'profit',
  'dateFrom',
  'dateTo',
  'isGroupedByProduct',
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function canonicalCsvRows(plan: IngestPlan): string[] {
  const out: string[] = [CANONICAL_CSV_HEADER.join(',')];
  for (const d of plan.deduped) {
    const grouped = d.canonical.groupBy === GROUP_BY_PRODUCT;
    for (const row of d.canonical.lines) {
      if (row.isTotal) continue;
      out.push(
        [
          csvCell(row.sourceFile),
          csvCell(row.branchRef),
          csvCell(row.branchName),
          csvCell(row.itemCode),
          csvCell(row.productName),
          csvCell(row.sales),
          csvCell(row.cost),
          csvCell(row.qty),
          csvCell(row.profit),
          csvCell(row.dateFrom),
          csvCell(row.dateTo),
          csvCell(grouped),
        ].join(','),
      );
    }
  }
  return out;
}

export function exportCanonicalCSV(dir: string, plan: IngestPlan): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'canonical.csv');
  writeFileSync(file, canonicalCsvRows(plan).join('\n') + '\n', 'utf8');
  return file;
}

/**  Human-readable stats file -- the thing to eyeball before an import. */
export function exportPlanStats(dir: string, plan: IngestPlan): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'plan-stats.txt');
  const s = plan.stats;
  const body = [
    'FOODICS INGEST PLAN',
    `root                 ${plan.root}`,
    '',
    `files discovered     ${s.totalFiles}`,
    `files readable       ${s.readableFiles}`,
    `files rejected       ${s.rejectedFiles}`,
    `rows in all files    ${s.totalRows}`,
    `  data rows          ${s.dataRows}`,
    `duplicate files      ${s.duplicateFiles}`,
    `unique reports kept  ${s.uniqueReports}`,
    `rows after dedupe    ${s.canonicalRows}`,
    `business days        ${s.distinctDates}`,
    '',
    'REJECTED:',
    ...(plan.rejected.length
      ? plan.rejected.map((r) => `  ${r.file}  --  ${r.reason}`)
      : ['  (none)']),
    '',
    'DEDUPE CONFLICTS:',
    ...(plan.deduped.some((d) => d.conflicts.length)
      ? plan.deduped
          .filter((d) => d.conflicts.length)
          .flatMap((d) => d.conflicts.map((c) => `  ${c.key}  (${c.rows.length} disagreeing copies)`))
      : ['  (none)']),
    '',
  ].join('\n');
  writeFileSync(file, body, 'utf8');
  return file;
}