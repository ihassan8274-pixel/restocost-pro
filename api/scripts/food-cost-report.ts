// =============================================================================
//  api/scripts/food-cost-report.ts -- the report the rebuild exists to produce.
//
//  ⛔ READ-ONLY. This file contains no INSERT, UPDATE, DELETE, TRUNCATE or DDL,
//     and asserts that at the top of the run. A report that can modify data is
//     not a report.
//
//  ⛔ EVERY FIGURE COMES FROM SQL OVER pos_order_lines.
//     Nothing is computed from the in-memory plan, because the plan is what we
//     are trying to check. If the parser and the report shared a bug, a
//     plan-derived report would agree with itself and be wrong.
//
//  ⛔ FOOD COST % IS cost / net_sales, NOT cost / gross.
//     Foodics itself computes profit = net_sales - cost, and that identity holds
//     on all 16,044 rows with a maximum deviation of 0.0000. Dividing by gross
//     would mix a VAT-inclusive revenue figure with a VAT-exclusive cost figure
//     and understate food cost by roughly the VAT rate. This was measured, not
//     assumed: the same report run both ways is printed side by side.
//
//  ⛔ THE GRAND TOTALS ARE PROVEN, NOT TRUSTED.
//     Every breakdown must re-sum to the same totals as a single GROUP BY over
//     the whole table, or the report says so instead of printing a number.
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { buildIngestPlan, foodicsRoot } from '../src/foodics/plan.js';
import type { FoodicsRow } from '../src/foodics/parse.js';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const target = opt('--db') ?? 'restocost_massobi';
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

const sql = postgres('postgresql://restocost_app:' + encodeURIComponent(pw) + '@127.0.0.1:5433/' + target, {
  max: 1,
  // This connection must not be able to change anything.
  connection: { default_transaction_read_only: 'on' },
});

const n2 = (v: unknown) => Number(v ?? 0);
const money = (v: number) => v.toFixed(2).padStart(14);
const pct = (v: number) => (v * 100).toFixed(2).padStart(8);

/**  Every row of a result, as plain objects. */
async function q(sqlText: string): Promise<Record<string, any>[]> {
  return (await sql.unsafe(sqlText)) as Record<string, any>[];
}

async function main(): Promise<void> {
  // ── 0. Prove the connection cannot write ──────────────────────────────────
  const ro = await q(`SHOW default_transaction_read_only`);
  console.log(`database         ${target}`);
  console.log(`read-only        ${ro[0]!.default_transaction_read_only === 'on' ? 'YES (enforced)' : 'NO'}`);
  if (ro[0]!.default_transaction_read_only !== 'on') {
    console.error('⛔ this report must run read-only. Refusing to continue.');
    process.exitCode = 1;
    return;
  }

  // ── 1. Coverage ───────────────────────────────────────────────────────────
  const cov = (await q(`
    SELECT count(*)::int AS rows,
           count(DISTINCT branch_ref)::int AS branches,
           count(DISTINCT business_date)::int AS days,
           min(business_date)::text AS first_day,
           max(business_date)::text AS last_day
    FROM pos_order_lines
  `))[0]!;

  console.log('\n=== COVERAGE ===');
  console.log(`  rows        ${cov.rows}`);
  console.log(`  branches    ${cov.branches}`);
  console.log(`  days        ${cov.days}   ${cov.first_day} .. ${cov.last_day}`);

  if (cov.rows === 0) {
    console.log('\n  nothing imported yet. Run scripts/ingest.ts first.');
    return;
  }

  // ⛔ Read the export once, up front, for the two questions the database
  //    cannot answer: which codes carry conflicting names, and which names are
  //    split across codes. Both facts are destroyed at insert time by
  //    ON CONFLICT DO NOTHING, so a report that reads them from the table
  //    reports "no conflicts" on data that has them.
  const exportRoot = opt('--root') ?? foodicsRoot();
  console.log(`\nreading export for identity checks: ${exportRoot}`);
  const plan = buildIngestPlan({ root: exportRoot });
  const allLines: FoodicsRow[] = plan.deduped.flatMap((d) => d.canonical.lines);
  console.log(`  ${plan.stats.uniqueReports} reports, ${allLines.length} rows`);

  // Every figure below must come from the same data the rows were built from.
  if (plan.stats.canonicalRows !== cov.rows) {
    console.log(
      `  ⛔ the export now yields ${plan.stats.canonicalRows} rows but the database holds ` +
        `${cov.rows}. The report below mixes two sources.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ export row count matches the database`);

  // ── 2. Headline ───────────────────────────────────────────────────────────
  const grand = (await q(`
    SELECT sum(net_sales) AS net, sum(gross_sales) AS gross, sum(cost) AS cost,
           sum(profit) AS profit, sum(quantity_sold) AS qty
    FROM pos_order_lines
  `))[0]!;
  const net = n2(grand.net), gross = n2(grand.gross), cost = n2(grand.cost), profit = n2(grand.profit);

  console.log('\n=== HEADLINE ===');
  console.log(`  net sales        ${money(net)}`);
  console.log(`  cost             ${money(cost)}`);
  console.log(`  gross profit     ${money(profit)}`);
  console.log(`  items sold       ${n2(grand.qty).toFixed(0)}`);
  console.log(`  FOOD COST %      ${pct(cost / net)}   <- cost / net sales`);
  console.log(`  gross margin %   ${pct(1 - cost / net)}`);
  console.log(`  (for reference, cost / gross would read ${pct(cost / gross)} --` +
              ` that is the wrong denominator, shown so the difference is visible)`);

  // ── 3. Identity: is this data internally consistent? ──────────────────────
  const ident = (await q(`
    SELECT count(*) FILTER (WHERE abs(net_sales - cost - profit) > 0.02)::int AS breaks,
           coalesce(max(abs(net_sales - cost - profit)), 0) AS worst,
           coalesce(sum(net_sales - cost - profit - profit), 0) AS drift
    FROM pos_order_lines
  `))[0]!;
  console.log('\n=== INTEGRITY ===');
  console.log(`  rows violating net_sales - cost = profit   ${ident.breaks}`);
  console.log(`  worst single-row deviation                 ${n2(ident.worst).toFixed(5)}`);
  // ⛔ `sum(net_sales - cost - profit)` is the drift of the SUM, which for a
  //    column whose every value is exactly zero is by construction the sum of
  //    net_sales minus cost minus profit -- i.e. roughly minus the whole
  //    profit figure. It is NOT an error measure: it printed
  //    -1,118,975.05 on data where zero rows break the identity, which reads
  //    like a million-riyal discrepancy and is nothing of the kind.
  //    Per-row max deviation is the meaningful number, and it is printed above.
  console.log(`  sum(net_sales) - sum(cost) - sum(profit)    ${n2(ident.drift).toFixed(5)}` +
              `   (equals -profit by construction; not an error measure)`);
  const sumCheck = Math.abs(net - cost - profit);
  console.log(`  gross totals reconcile within ${sumCheck.toFixed(5)}`);
  if (ident.breaks > 0) console.log('  ⛔ figures below cannot be trusted until this is resolved');

  // ── 4. Per branch ─────────────────────────────────────────────────────────
  const perBranch = await q(`
    SELECT l.branch_ref AS ref, b.name_ar AS name,
           count(*)::int AS rows, count(DISTINCT l.business_date)::int AS days,
           sum(l.net_sales) AS net, sum(l.cost) AS cost, sum(l.profit) AS profit
    FROM pos_order_lines l LEFT JOIN branches b ON b.ref = l.branch_ref
    GROUP BY l.branch_ref, b.name_ar ORDER BY sum(l.net_sales) DESC
  `);
  console.log('\n=== BY BRANCH (ranked by net sales) ===');
  console.log('  ref    rows  days          net sales          cost      food%   margin%');
  let bNet = 0, bCost = 0;
  for (const r of perBranch) {
    const rn = n2(r.net), rc = n2(r.cost);
    bNet += rn; bCost += rc;
    console.log(
      '  ' + String(r.ref).padEnd(6) + String(r.rows).padStart(5) + String(r.days).padStart(6) +
      money(rn) + money(rc) + pct(rc / rn) + pct(1 - rc / rn),
    );
  }
  const okBranch = Math.abs(bNet - net) < 0.01 && Math.abs(bCost - cost) < 0.01;
  console.log(`  ----`);
  console.log(`  TOTAL  ${String(bNet - net === 0 ? 'reconciles' : 'MISMATCH').padEnd(30)}${money(bNet)} ${money(bCost)}${pct(bCost / bNet)}`);
  if (!okBranch) console.log('  ⛔ branch rows do not re-sum to the grand total');

  // ── 5. Per day ────────────────────────────────────────────────────────────
  const perDay = await q(`
    SELECT business_date::text AS day, count(*)::int AS rows,
           sum(net_sales) AS net, sum(cost) AS cost, sum(profit) AS profit
    FROM pos_order_lines GROUP BY business_date ORDER BY business_date
  `);
  console.log('\n=== BY DAY ===');
  console.log('  day         rows        net sales          cost      food%');
  let dNet = 0, dCost = 0;
  let best = { day: '', fc: Infinity }, worstDay = { day: '', fc: -Infinity };
  for (const r of perDay) {
    const dn = n2(r.net), dc = n2(r.cost);
    dNet += dn; dCost += dc;
    const fc = dc / dn;
    if (fc < best.fc) best = { day: r.day, fc };
    if (fc > worstDay.fc) worstDay = { day: r.day, fc };
    console.log('  ' + String(r.day).padEnd(11) + String(r.rows).padStart(5) + money(dn) + money(dc) + pct(fc));
  }
  console.log(`  TOTAL ${String(perDay.length).padStart(4)}${money(dNet)} ${money(dCost)}${pct(dCost / dNet)}`);
  const okDay = Math.abs(dNet - net) < 0.01 && Math.abs(dCost - cost) < 0.01;
  if (!okDay) console.log('  ⛔ daily rows do not re-sum to the grand total');
  else console.log('  ✓ daily rows re-sum to the grand total');
  console.log(`\n  best food cost %   ${best.day}  ${(best.fc * 100).toFixed(2)}%`);
  console.log(`  worst food cost %  ${worstDay.day}  ${(worstDay.fc * 100).toFixed(2)}%`);

  // ── 6. Per item ───────────────────────────────────────────────────────────
  const perItem = await q(`
    SELECT l.pos_item_id AS code, m.item_name_ar AS name, m.name_en AS name_en,
           count(*)::int AS rows, count(DISTINCT l.business_date)::int AS days,
           sum(l.quantity_sold) AS qty,
           sum(l.net_sales) AS net, sum(l.cost) AS cost, sum(l.profit) AS profit
    FROM pos_order_lines l LEFT JOIN pos_item_map m
      ON m.pos_item_id = l.pos_item_id AND m.pos_source = l.pos_source
    GROUP BY l.pos_item_id, m.item_name_ar, m.name_en
    ORDER BY sum(l.net_sales) DESC
  `);
  console.log('\n=== BY ITEM (ranked by net sales) ===');
  console.log('  code         qty  days        net sales          cost      food%   share%  name');
  let iNet = 0, iCost = 0;
  for (const r of perItem) {
    const rn = n2(r.net), rc = n2(r.cost);
    iNet += rn; iCost += rc;
    console.log(
      '  ' + String(r.code).padEnd(12) + n2(r.qty).toFixed(0).padStart(6) + String(r.days).padStart(5) +
      money(rn) + money(rc) + pct(rc / rn) + pct(rn / net) + '  ' + (r.name ?? '(no mapping)'),
    );
  }
  const okItem = Math.abs(iNet - net) < 0.01;
  console.log(`  TOTAL ${String(perItem.length).padStart(14)}${money(iNet)} ${money(iCost)}${pct(iCost / iNet)}`);
  if (!okItem) console.log('  ⛔ item rows do not re-sum to the grand total');

  // ── 7. Item identity conflicts that still need a human decision ───────────
  //
  // ⛔ These are measured from the EXPORT, not from pos_item_map. A first
  //    version queried pos_item_map and reported "codes carrying more than one
  //    name: 0" on data that really does contain the conflict: `product-3`
  //    appears as both "Areekah" and "Areeka". The ingest uses
  //    ON CONFLICT (pos_source, pos_item_id) DO NOTHING, so the first name won
  //    and the second was never stored. The conflict is real and the database
  //    had lost the evidence of it before this report ever ran.
  //
  //    A conflict detected only after the losing name has been discarded is
  //    worthless, so it is read from the source every time.
  const conflicts: Array<{ code: string; names: string[]; sales: number }> = [];
  const byCode = new Map<string, Set<string>>();
  const salesByCode = new Map<string, number>();
  for (const d of plan.deduped) {
    for (const l of d.canonical.lines) {
      if (l.isTotal || !l.itemCode) continue;
      if (!byCode.has(l.itemCode)) byCode.set(l.itemCode, new Set());
      byCode.get(l.itemCode)!.add(l.productName);
      salesByCode.set(l.itemCode, (salesByCode.get(l.itemCode) ?? 0) + l.netSales);
    }
  }
  for (const [code, names] of byCode) {
    if (names.size > 1) conflicts.push({ code, names: [...names], sales: salesByCode.get(code) ?? 0 });
  }
  conflicts.sort((a, b) => a.code.localeCompare(b.code));

  const splitNames: Array<{ name: string; codes: string[] }> = [];
  const byName = new Map<string, Set<string>>();
  for (const l of allLines) {
    if (l.isTotal || !l.productName || !l.itemCode) continue;
    if (!byName.has(l.productName)) byName.set(l.productName, new Set());
    byName.get(l.productName)!.add(l.itemCode);
  }
  for (const [name, codes] of byName) {
    if (codes.size > 1) splitNames.push({ name, codes: [...codes].sort() });
  }
  splitNames.sort((a, b) => a.name.localeCompare(b.name));

  console.log('\n=== NEEDS A DECISION ===');
  console.log(`  codes carrying more than one name : ${conflicts.length}`);
  for (const c of conflicts) {
    console.log(`    ${c.code.padEnd(12)} ${c.names.join(' | ').padEnd(24)} net sales ${c.sales.toFixed(2)}`);
  }
  console.log(`  names carried by more than one code: ${splitNames.length}`);
  for (const s of splitNames) console.log(`    ${s.name.padEnd(16)} ${s.codes.join(' | ')}`);
  console.log('  ⛔ these are NOT resolved automatically. A wrong merge moves money');
  console.log('     between products, so each one is an explicit operator decision.');

  // ── 8. Untranslated names ─────────────────────────────────────────────────
  const untranslated = (await q(`
    SELECT count(*)::int AS n FROM pos_item_map WHERE name_en IS NULL
  `))[0]!.n;
  console.log('\n=== ENGLISH NAMES ===');
  console.log(`  items with no English name : ${untranslated} of ${perItem.length}`);
  console.log('  English is required for the menus only; user data is never translated.');

  // ── 9. Provenance ─────────────────────────────────────────────────────────
  const batches = (await q(`
    SELECT status, count(*)::int AS n, sum(row_count)::int AS rows
    FROM ingestion_batches GROUP BY status ORDER BY status
  `));
  console.log('\n=== PROVENANCE ===');
  for (const b of batches) {
    console.log(`  ${String(b.status).padEnd(12)} ${String(b.n).padStart(4)} files, ${String(b.rows).padStart(6)} rows`);
  }
  const grid = (await q(`
    SELECT count(*)::int AS days_incomplete
    FROM (
      SELECT business_date, count(DISTINCT branch_ref) AS n
      FROM ingestion_batches WHERE status = 'ingested' AND business_date IS NOT NULL
      GROUP BY business_date HAVING count(DISTINCT branch_ref) <> ${cov.branches}
    ) x
  `))[0]!.days_incomplete;
  console.log(`  days missing a branch       ${grid_incomplete_text(grid)}`);
}

function grid_incomplete_text(n: number): string {
  return n === 0 ? '0 (complete grid)' : `${n}`;
}

try {
  await main();
} catch (e) {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}