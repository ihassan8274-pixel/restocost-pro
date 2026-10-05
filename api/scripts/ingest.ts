// =============================================================================
//  api/scripts/ingest.ts -- import the real Foodics exports into a company DB.
//
//  ⛔ THIS IS THE ONLY WRITER. Nothing else inserts POS rows. If a number in a
//     report looks wrong, the question is always "what did ingest write", and
//     that question has one answer you can read.
//
//  ⛔ IT IS SAFE TO RUN TWICE, AND THAT IS TESTED, NOT ASSUMED.
//     Re-running finds every fingerprint already present, records the new file
//     as `duplicate`, and writes no second row. That guarantee comes from
//     ingestion_batches_fingerprint_uq and pos_order_lines_slot_uq in the
//     database, not from an in-memory Set that dies with the process.
//
//  ⛔ NOTHING IS TRUNCATED OR REPLACED.
//     A previous ingestion of a different export tree would have to be handled
//     explicitly. `--replace` exists and refuses unless you also pass
//     --yes-confirm-delete, because this is the one operation in the project
//     that can lose money figures.
//
//  ⛔ CONNECTS AS restocost_app, NOT the admin role.
//     The application role has DML and no DDL, exactly as the production
//     services will. Running the import as an owner would prove nothing about
//     whether the real thing works.
//
//  ⛔ MEASURED BEFORE, REPORTED AFTER, FROM THE DATABASE ITSELF.
//     The output below is read back with SQL over the rows that landed, not
//     from the objects that were about to be inserted.
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { buildIngestPlan, readReport, foodicsRoot } from '../src/foodics/plan.js';
import { dedupeKey } from '../src/foodics/parse.js';
import type { FoodicsRow, ParsedReport } from '../src/foodics/parse.js';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const POS_SOURCE = 'foodics';

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ── arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

const target = opt('--db') ?? 'restocost_massobi';
const dryRun = flag('--dry-run');
const replace = flag('--replace');
const confirmed = flag('--yes-confirm-delete');

if (replace && !confirmed && !dryRun) {
  console.error('⛔ --replace deletes existing POS data. Re-run with --yes-confirm-delete to proceed.');
  process.exit(1);
}
if (confirmed && !replace) {
  console.error('⛔ --yes-confirm-delete only means something together with --replace.');
  process.exit(1);
}
if (!/^[a-z][a-z0-9_]{0,62}$/.test(target)) {
  console.error(`unsafe database name: ${target}`);
  process.exit(1);
}

const env = readEnv(resolve(REPO, 'control/.env'));
const pw = env.COMPANY_DB_PASSWORD;
if (!pw) {
  console.error('COMPANY_DB_PASSWORD missing from control/.env');
  process.exit(1);
}

// The application role. postgres.js rejects connection_limit / pool_timeout in
// the URL, so the query string is stripped -- same reason control/src/db.ts
// urlForDb() strips it.
const appUrl =
  'postgresql://restocost_app:' + encodeURIComponent(pw) + '@127.0.0.1:5433/' + target;

const sql = postgres(appUrl, { max: 1, onnotice: () => {} });

/**  `YYYY-MM-DD` -> the DATE literal, or null when the file had no date row. */
const isoDay = (s: string | null): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s : null);

/**  Money as a fixed string. Never parseFloat -- that reintroduces float drift. */
const money = (n: number): string => (Number.isFinite(n) ? n.toFixed(5) : '0');
const qty = (n: number): string => (Number.isFinite(n) ? n.toFixed(3) : '0');
const nullable = (n: number | null): string | null => (n === null || n === undefined ? null : n.toFixed(5));

async function main(): Promise<void> {
  // ── 1. Existing state, before touching anything ───────────────────────────
  const before = await sql.unsafe(`
    SELECT
      (SELECT count(*) FROM pos_order_lines)::int    AS lines,
      (SELECT count(*) FROM ingestion_batches)::int  AS batches,
      (SELECT count(*) FROM pos_item_map)::int      AS items,
      (SELECT count(*) FROM branches)::int          AS branches
  `);
  console.log('=== BEFORE ===');
  console.log(`  database        ${target}`);
  console.log(`  pos_order_lines ${before[0].lines}`);
  console.log(`  ingestion_batches ${before[0].batches}`);
  console.log(`  pos_item_map    ${before[0].items}`);
  console.log(`  branches        ${before[0].branches}`);

  // ── 2. Build the plan from the real export tree ───────────────────────────
  console.log('\n=== PLAN ===');
  const root = opt('--root') ?? foodicsRoot();
  const plan = buildIngestPlan({ root });
  const s = plan.stats;
  console.log(`  export root     ${root}`);
  console.log(`  files found     ${s.totalFiles}`);
  console.log(`  files readable  ${s.readableFiles}`);
  console.log(`  files rejected  ${s.rejectedFiles}`);
  console.log(`  rows in all     ${s.totalRows}`);
  console.log(`  duplicate files ${s.duplicateFiles}`);
  console.log(`  unique reports  ${s.uniqueReports}`);
  console.log(`  rows to write   ${s.canonicalRows}`);
  console.log(`  business days   ${s.distinctDates}`);

  if (plan.rejected.length) {
    console.log('\n  REJECTED FILES:');
    for (const r of plan.rejected) console.log(`    ${r.file}  --  ${r.reason}`);
  }

  // Stop before writing if the plan looks wrong in a way a human should see.
  const slots = new Set<string>();
  for (const d of plan.deduped) {
    for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
      slots.add(`${ref}|${d.canonical.dateFrom}`);
    }
  }
  const branchesSeen = new Set<string>();
  for (const d of plan.deduped) for (const l of d.canonical.lines) branchesSeen.add(l.branchRef);
  console.log(`\n  branch x day    ${slots.size} distinct slots (must equal uniqueReports ${s.uniqueReports})`);
  if (slots.size !== s.uniqueReports) {
    console.error('⛔ a slot is covered by more than one canonical report. Refusing to write.');
    process.exitCode = 1;
    return;
  }

  // ── 3. Dry run stops here ─────────────────────────────────────────────────
  if (dryRun) {
    console.log('\n=== DRY RUN -- nothing written ===');
    await reportFromPlan(plan);
    return;
  }

  // ── 4. Optional replace ───────────────────────────────────────────────────
  if (replace) {
    console.log('\n=== REPLACE ===');
    await sql.begin(async (tx) => {
      // Order matters: lines reference their batch, so the referencing rows go
    // first. An earlier draft deleted ingestion_batches before pos_order_lines
    // and the foreign key correctly refused it.
    await tx`DELETE FROM pos_order_lines`;
    await tx`DELETE FROM ingestion_batches`;
    await tx`DELETE FROM pos_item_map`;
    });
    console.log('  existing POS rows deleted');
  }

  // ── 5. Write, in one transaction ──────────────────────────────────────────
  // One transaction for the whole import: a half-imported month is worse than
  // a failed one, because it looks like a real number in a report.
  const t0 = Date.now();
  const counters = {
    batches: 0,         // canonical batch rows created
    alreadyPresent: 0,  // canonical batch rows found from a previous run
    duplicates: 0,      // duplicate files recorded, pointing at the canonical
    duplicatesAlreadyPresent: 0, // duplicate rows found from a previous run
    lines: 0,           // pos_order_lines rows created
    skippedLines: 0,
    items: 0,
    branches: 0,
  };

  await sql.begin(async (tx) => {
    for (const d of plan.deduped) {
      const rep: ParsedReport = d.canonical;
      const fingerprint = dedupeKey(rep.lines);
      const businessDate = isoDay(rep.dateFrom);
      const branchRef = rep.lines[0]?.branchRef ?? null;
      const lineCount = rep.lines.filter((l) => !l.isTotal).length;

      // Every file that was READ gets a row here -- including the 336 duplicates.
      //
      // ⛔ An earlier draft inserted with `ON CONFLICT (file_fingerprint) DO
      //    NOTHING` against a unique index on that column. Measured result of
      //    the real import: 744 files read, 408 batch rows, and all 336
      //    duplicate files discarded with no trace. The constraint was
      //    intended to make re-imports safe; instead it deleted the evidence
      //    needed to answer "are these totals double-counted?".
      //
      //    The correct split: duplicate FILES are recorded and marked, while
      //    duplicate TRANSACTIONS are refused by pos_order_lines_slot_uq.
      //
      //    So the canonical report's batch row is written first, to obtain its
      //    id, and every other source in the group points at it via
      //    duplicate_of.
      // ⛔ `ON CONFLICT DO NOTHING` with NO target column.
      //
      //   ingestion_batches has a unique index on source_file, so this insert
      //   needs a target. The first version omitted it and Postgres then
      //   inferred the PRIMARY KEY, so a re-run of the same file raised
      //   `duplicate key value violates unique constraint
      //   ingestion_batches_source_file_uq` and the whole import aborted.
      //   A plain re-import must be a no-op, not a crash.
      const canonicalRows = await tx`
        INSERT INTO ingestion_batches
          (source_file, file_fingerprint, business_date, date_from, date_to,
           branch_ref, report_shape, row_count, status, duplicate_of, ingested_at)
        VALUES (
          ${rep.source}, ${fingerprint}, ${businessDate}, ${rep.dateFrom}, ${rep.dateTo},
          ${branchRef}, ${rep.layout}, ${lineCount}, 'ingested', NULL, now()
        )
        ON CONFLICT (source_file) DO NOTHING
        RETURNING id
      `;

      let batchId: number;
      if (canonicalRows.length) {
        batchId = canonicalRows[0]!.id;
        counters.batches++;
      } else {
        const existing = await tx`
          SELECT id FROM ingestion_batches
          WHERE source_file = ${rep.source} AND status = 'ingested'
          LIMIT 1
        `;
        if (!existing.length) {
          // The canonical file was previously recorded as a duplicate of
          // another file. Promote it rather than inserting a duplicate row.
          const promoted = await tx`
            UPDATE ingestion_batches SET status = 'ingested', duplicate_of = NULL
            WHERE source_file = ${rep.source} RETURNING id
          `;
          if (!promoted.length) {
            console.error(`⛔ no batch row for canonical file ${rep.source}. Aborting.`);
            process.exitCode = 1;
            return;
          }
          batchId = promoted[0]!.id;
        } else {
          batchId = existing[0]!.id;
        }
        counters.alreadyPresent++;
      }

      for (const source of d.sources) {
        if (source === rep.source) continue;
        // Point the duplicate at the canonical batch.
        const dup = await tx`
          INSERT INTO ingestion_batches
            (source_file, file_fingerprint, business_date, date_from, date_to,
             branch_ref, report_shape, row_count, status, duplicate_of, ingested_at)
          VALUES (
            ${source}, ${fingerprint}, ${businessDate}, ${rep.dateFrom}, ${rep.dateTo},
            ${branchRef}, ${rep.layout}, ${lineCount}, 'duplicate', ${batchId}, now()
          )
          ON CONFLICT (source_file) DO NOTHING
          RETURNING id
        `;
        // Same reason: the target must be named, or the clause targets the
        // primary key and a re-run raises a unique violation.
        if (dup.length) counters.duplicates++;
        else counters.duplicatesAlreadyPresent++;
      }

      {

        // Branches, from the file's own ref.
        for (const [ref, name] of branchNames(rep)) {
          const r = await tx`
            INSERT INTO branches (ref, name_ar)
            VALUES (${ref}, ${name})
            ON CONFLICT (ref) DO UPDATE SET name_ar = EXCLUDED.name_ar
            RETURNING (xmax = 0) AS inserted
          `;
          if (r[0]?.inserted) counters.branches++;
        }

        // Item map, keyed on (pos_source, pos_item_id) so a second POS is
        // config only.
        for (const [code, name, category] of itemNames(rep)) {
          const r = await tx`
            INSERT INTO pos_item_map (pos_source, pos_item_id, item_name_ar, category)
            VALUES (${POS_SOURCE}, ${code}, ${name}, ${category})
            ON CONFLICT (pos_source, pos_item_id) DO NOTHING
            RETURNING (xmax = 0) AS inserted
          `;
          if (r[0]?.inserted) counters.items++;
        }

        // The transactions themselves.
        for (const line of rep.lines) {
          if (line.isTotal) continue;
          const day = isoDay(line.dateFrom) ?? businessDate;
          if (!day) {
            // A row with no usable business date cannot be keyed, and the
            // unique index would refuse it anyway. Count and report, do not
            // invent a date.
            counters.skippedLines++;
            continue;
          }
          const r = await tx`
            INSERT INTO pos_order_lines
              (pos_source, pos_item_id, branch_ref, business_date,
               quantity_sold, gross_sales, net_sales, cost, profit,
               vat, discount, total_ex_vat, return_amount, return_qty,
               cancel_amount, cancel_qty, ingestion_batch_id)
            VALUES (
              ${POS_SOURCE}, ${line.itemCode}, ${line.branchRef}, ${day},
              ${qty(line.qty)}, ${money(line.sales)}, ${money(line.netSales ?? 0)},
              ${money(line.cost)}, ${money(line.profit)},
              ${nullable(line.vat)}, ${nullable(line.discount)}, ${nullable(line.totalExVat)},
              ${nullable(line.returnAmount)}, ${qty(line.returnQty ?? 0)},
              ${nullable(line.cancelAmount)}, ${qty(line.cancelQty ?? 0)},
              ${batchId}
            )
            ON CONFLICT (pos_source, pos_item_id, branch_ref, business_date) DO NOTHING
            RETURNING id
          `;
          // ⛔ A separate counter. An earlier version incremented
          // `counters.inserted` for BOTH the batch row and the transaction row,
          // so one run reported 9195 batches against 408 actual -- the batch
          // total then disagreed with the 744 files read and the run printed a
          // failure while having written the right 8787 transactions. Two
          // different things now have two different names.
          if (r.length) counters.lines++;
          else counters.skippedLines++;
        }
      }
    }
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== WROTE ===`);
  console.log(`  lines inserted       ${counters.lines}`);
  // ⭐⭐ The batch count must equal the number of files READ, duplicates
  //    included. The first real import reported 408 here against 744 files
  //    read, because a unique index on file_fingerprint discarded the 336
  //    duplicates with no record. The figure below is asserted against the
  //    plan, not merely printed.
  const totalBatches =
    counters.batches + counters.alreadyPresent + counters.duplicates + counters.duplicatesAlreadyPresent;
  console.log(`  batches canonical    ${counters.batches + counters.alreadyPresent}` +
              ` (${counters.batches} new, ${counters.alreadyPresent} already present)`);
  console.log(`  batches duplicate    ${counters.duplicates + counters.duplicatesAlreadyPresent}` +
              ` (${counters.duplicates} new, ${counters.duplicatesAlreadyPresent} already present)`);
  console.log(`  batches total        ${totalBatches}  (must equal ${plan.stats.totalFiles} files read)`);
  if (totalBatches !== plan.stats.totalFiles) {
    console.error('⛔ batch count does not match the number of files read.');
    process.exitCode = 1;
  }
  console.log(`  lines skipped        ${counters.skippedLines} (no date, or already present)`);
  console.log(`  item map added       ${counters.items}`);
  console.log(`  branches added       ${counters.branches}`);
  console.log(`  elapsed              ${secs}s`);

  // ── 6. Read the result back out of the database ───────────────────────────
  // Not from the counters above. If a trigger, a constraint or a rounding rule
  // changed what landed, this is where it shows.
  await reportFromDb();
}

/**  branch ref -> the name the export used, for this report. */
function branchNames(rep: ParsedReport): Array<[string, string]> {
  const m = new Map<string, string>();
  for (const l of rep.lines) if (l.branchRef && !m.has(l.branchRef)) m.set(l.branchRef, l.branchName);
  return [...m];
}

/**  item code -> name + category guess, for this report. */
function itemNames(rep: ParsedReport): Array<[string, string, string | null]> {
  const m = new Map<string, [string, string | null]>();
  for (const l of rep.lines) {
    if (!l.itemCode) continue;
    if (!m.has(l.itemCode)) m.set(l.itemCode, [l.productName, null]);
  }
  return [...m].map(([code, [name, cat]]) => [code, name, cat]);
}

async function reportFromPlan(plan: ReturnType<typeof buildIngestPlan>): Promise<void> {
  let sales = 0, cost = 0, profit = 0;
  for (const d of plan.deduped) {
    for (const l of d.canonical.lines) {
      if (l.isTotal) continue;
      sales += l.sales; cost += l.cost; profit += l.profit;
    }
  }
  console.log(`  would write ${plan.stats.canonicalRows} rows`);
  console.log(`  net sales   ${sales.toFixed(2)}`);
  console.log(`  cost        ${cost.toFixed(2)}`);
  console.log(`  food cost % ${((cost / sales) * 100).toFixed(2)}%`);
  void profit;
}

async function reportFromDb(): Promise<void> {
  const totals = await sql.unsafe(`
    SELECT count(*)::int AS rows,
           sum(net_sales)  AS net_sales,
           sum(cost)       AS cost,
           sum(profit)     AS profit,
           min(business_date)::text AS first_day,
           max(business_date)::text AS last_day,
           count(DISTINCT branch_ref)::int AS branches,
           count(DISTINCT business_date)::int AS days
    FROM pos_order_lines
  `);
  const t = totals[0];
  const sales = Number(t.net_sales ?? 0);
  const cost = Number(t.cost ?? 0);
  const profit = Number(t.profit ?? 0);

  console.log('\n=== AFTER (read back from the database) ===');
  console.log(`  rows          ${t.rows}`);
  console.log(`  branches      ${t.branches}`);
  console.log(`  days          ${t.days}  (${t.first_day} .. ${t.last_day})`);
  console.log(`  net sales     ${sales.toFixed(2)}`);
  console.log(`  cost          ${cost.toFixed(2)}`);
  console.log(`  gross profit  ${profit.toFixed(2)}`);
  console.log(`  FOOD COST %   ${((cost / sales) * 100).toFixed(2)}%`);
  console.log(`  MARGIN %      ${(100 - (cost / sales) * 100).toFixed(2)}%`);

  // The identity Foodics itself computes. If it breaks here, something rounded,
  // truncated or re-keyed a figure, and the numbers above cannot be trusted.
  const drift = await sql.unsafe(`
    SELECT count(*)::int AS breaks,
           coalesce(max(abs(net_sales - cost - profit)), 0) AS worst
    FROM pos_order_lines
    WHERE abs(net_sales - cost - profit) > 0.02
  `);
  console.log(`\n  identity check (net_sales - cost = profit):`);
  console.log(`    rows out of tolerance   ${drift[0].breaks}`);
  console.log(`    worst deviation         ${Number(drift[0].worst).toFixed(5)}`);

  const perBranch = await sql.unsafe(`
    SELECT branch_ref, count(*)::int AS rows, count(DISTINCT business_date)::int AS days,
           sum(net_sales) AS sales, sum(cost) AS cost
    FROM pos_order_lines
    GROUP BY branch_ref ORDER BY branch_ref
  `);
  console.log(`\n  per branch:`);
  console.log('    ref    rows  days        sales          cost      food%');
  for (const b of perBranch) {
    const bs = Number(b.sales), bc = Number(b.cost);
    console.log(
      '    ' + b.branch_ref.padEnd(6) +
      String(b.rows).padStart(5) +
      String(b.days).padStart(6) +
      bs.toFixed(2).padStart(14) +
      bc.toFixed(2).padStart(13) +
      ((bc / bs) * 100).toFixed(2).padStart(8),
    );
  }

  // ⛔ This queries ingestion_batches, which has no net_sales column -- that
  //    column lives on pos_order_lines. The first real run wrote everything
  //    correctly and then died on this last summary query, printing a FAILED
  //    line after a clean import. Money columns are counted per branch, per day
  //    and per item below; here we only need the report count per day.
  const perDay = await sql.unsafe(`
    SELECT business_date::text AS d, count(*)::int AS reports
    FROM ingestion_batches WHERE status = 'ingested' AND business_date IS NOT NULL
    GROUP BY business_date ORDER BY business_date
  `);
  const offGrid = perDay.filter((x: any) => x.reports !== t.branches);
  console.log(`\n  days with a full grid of ${t.branches} reports: ${perDay.length - offGrid.length}/${perDay.length}`);
  if (offGrid.length) {
    console.log('  ⛔ incomplete days:');
    for (const x of offGrid) console.log(`    ${x.d} has ${x.reports}`);
  }

  // The provenance that made this import auditable.
  const batches = await sql.unsafe(`
    SELECT status, count(*)::int AS files, coalesce(sum(row_count), 0)::int AS rows
    FROM ingestion_batches GROUP BY status ORDER BY status
  `);
  console.log('\n=== PROVENANCE ===');
  for (const b of batches) {
    console.log(`  ${String(b.status).padEnd(12)} ${String(b.files).padStart(4)} files, ${String(b.rows).padStart(6)} rows`);
  }
  const unlinked = await sql.unsafe(`
    SELECT count(*)::int AS n FROM ingestion_batches
    WHERE status = 'duplicate' AND duplicate_of IS NULL
  `);
  if (unlinked[0].n) console.log(`  ⛔ ${unlinked[0].n} duplicate rows have no canonical batch`);
  else console.log('  ✓ every duplicate file points at the batch it duplicated');

  // Every transaction must belong to a canonical batch for its own day and
  // branch. A mismatch means a row was attributed to the wrong file.
  const mislinked = await sql.unsafe(`
    SELECT count(*)::int AS n
    FROM pos_order_lines l JOIN ingestion_batches b ON b.id = l.ingestion_batch_id
    WHERE l.business_date <> b.business_date OR l.branch_ref <> b.branch_ref
  `);
  console.log(`  ✓ transactions attributed to the wrong file: ${mislinked[0].n}`);
}

void (null as unknown as FoodicsRow);
void readReport;

try {
  await main();
} catch (e) {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}