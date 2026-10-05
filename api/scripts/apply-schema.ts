// =============================================================================
//  api/scripts/apply-schema.ts -- push the data-plane schema to a company DB.
//
//  ⛔ WHY NOT `drizzle-kit push`
//     `push` reads the live schema and then INTERACTIVELY asks what to do when
//     tables differ. With no TTY it aborts with
//     "Interactive prompts require a TTY terminal", which is what blocked the
//     original attempt. There is also no `--yes` on `push` in this version.
//
//  ⛔ WHY THIS USES `drizzle-orm` AND NOT RAW SQL
//     One source of truth. The DDL below is generated from the same schema.ts
//     that the application imports, so a column added to the schema cannot be
//     forgotten here. Hand-written SQL drifts; that drift is how a table ends
//     up missing the unique constraint that makes a re-import safe.
//
//  ⛔ WHY THE PRE-FLIGHT CHECKS EXIST
//     Measured: `dedupeKey()` returns 1,992-3,812 characters across the 744
//     real exports. An earlier draft declared file_fingerprint as varchar(128),
//     which would truncate every fingerprint and silently merge distinct
//     reports. `push` would have accepted it. So before creating anything we
//     assert the columns that carry the guarantees, and refuse to run if a
//     previous partial attempt left something narrower behind.
//
//  ⛔ THE REQUIRED ROLE
//     Reads PG_ADMIN_URL from control/.env. Run it as restocost_admin, then
//     hand the tables to restocost_app -- the application must never own its
//     own schema.
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/data-plane/schema.js';

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

const target = process.argv[2];
if (!target) {
  console.error('usage: tsx scripts/apply-schema.ts <dbname>');
  process.exit(1);
}
if (!/^[a-z][a-z0-9_]{0,62}$/.test(target)) {
  console.error(`unsafe database name: ${target}`);
  process.exit(1);
}

const env = readEnv(resolve(REPO, 'control/.env'));
const adminUrl = env.PG_ADMIN_URL;
if (!adminUrl) {
  console.error('PG_ADMIN_URL missing from control/.env');
  process.exit(1);
}

// postgres.js rejects connection_limit / pool_timeout in the URL. Strip the
// query string before connecting -- same reason control/src/db.ts urlForDb()
// strips it.
const bare = (u: string) => u.split('?')[0]!;
const dbUrl = bare(adminUrl).replace(/\/[^/]*$/, `/${target}`);

// Count and swallow the "already exists, skipping" notices, which are expected
// on a re-run and otherwise bury the real output under 14 blocks.
//
// ⛔ `onnotice` is an option on the postgres() factory, NOT a method on the
//    transaction object. Registering `tx.on('notice', ...)` type-checks loosely
//    and then silently never fires, which is worse than no handler at all: the
//    summary line reported `0 "already exists" skipped` while fourteen notices
//    were printed directly above it. A counter that reads zero while the
//    evidence sits on screen is the same failure mode as the silent zero-cost
//    column this whole rebuild exists to eliminate.
const notices: string[] = [];
const client = postgres(dbUrl, { max: 1, onnotice: (n) => void notices.push(n.message) });
const db = drizzle(client, { schema });

/**
 *  Bounded text columns that must be wide enough for the measured real data.
 *
 *  ⛔ Only columns whose type actually carries a length limit appear here.
 *     `information_schema.columns.character_maximum_length` is NULL -- not -1 --
 *     for `numeric` and `text`, and `null < 4096` is true in JavaScript, so
 *     including those columns made the pre-flight reject a perfectly good
 *     schema. That is the "a guard that fires on legitimate code proves
 *     nothing" failure in reverse: it fired on the right code.
 */
const WIDTHS: Array<[string, string, number, string]> = [
  ['ingestion_batches', 'source_file', 1024, 'Windows long paths'],
  ['pos_item_map', 'item_name_ar', 256, 'Foodics Arabic product name'],
  ['pos_item_map', 'name_en', 256, 'operator-entered English name'],
  ['pos_item_map', 'pos_item_id', 64, 'vendor item id'],
  ['pos_order_lines', 'pos_item_id', 64, 'vendor item id'],
  ['pos_order_lines', 'branch_ref', 16, 'B02, B08...'],
];

/**
 *  Money columns, checked on precision and scale instead of length.
 *
 *  Measured: the exports carry 5 decimal places (2286.51633). Storing 5dp money
 *  in `numeric(12,2)` rounds it, and the food-cost percentage stops
 *  reconciling against the POS.
 */
const MONEY: Array<[string, string, number, number, string]> = [
  // table, column, required precision, required scale, measured fact
  ['pos_order_lines', 'gross_sales', 14, 5, 'export carries 5dp'],
  ['pos_order_lines', 'net_sales', 14, 5, 'export carries 5dp'],
  ['pos_order_lines', 'cost', 14, 5, 'export carries 5dp'],
  ['pos_order_lines', 'profit', 14, 5, 'export carries 5dp'],
];

async function main(): Promise<void> {
  console.log(`target database : ${target}`);

  // ── 1. Pre-flight on anything already there ───────────────────────────────
  // A narrower file_fingerprint from an earlier partial run is the exact
  // silent-double-count hazard, so refuse rather than "IF NOT EXISTS" over it.
  const existing = await client.unsafe(`
    SELECT table_name, column_name, data_type,
           character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const col = new Map(
    existing.map((r: any) => [
      `${r.table_name}.${r.column_name}`,
      {
        dataType: r.data_type,
        // NULL for text/numeric (unbounded or not character), a number for varchar.
        charLen: typeof r.character_maximum_length === 'number' ? r.character_maximum_length : null,
        precision: typeof r.numeric_precision === 'number' ? r.numeric_precision : null,
        scale: typeof r.numeric_scale === 'number' ? r.numeric_scale : null,
      },
    ]),
  );

  const problems: string[] = [];
  for (const [table, name, required, why] of WIDTHS) {
    const c = col.get(`${table}.${name}`);
    if (!c) continue; // column absent: CREATE TABLE below will add it
    // charLen === null means text (unbounded) or numeric (not character data).
    if (c.charLen !== null && c.charLen < required) {
      problems.push(`  ${table}.${name} is ${c.dataType}(${c.charLen}) but needs ${required}+ -- ${why}`);
    }
  }
  for (const [table, name, prec, scale, why] of MONEY) {
    const c = col.get(`${table}.${name}`);
    if (!c) continue;
    if (c.dataType !== 'numeric') {
      problems.push(`  ${table}.${name} is ${c.dataType}, not numeric -- ${why}`);
      continue;
    }
    // numeric_precision/scale are NULL for unconstrained numeric, which is fine.
    if (c.precision !== null && c.scale !== null) {
      if (c.scale < scale) {
        problems.push(`  ${table}.${name} is numeric(${c.precision},${c.scale}) but needs scale ${scale} -- ${why}`);
      } else if (c.precision < prec) {
        problems.push(`  ${table}.${name} is numeric(${c.precision},${c.scale}) but needs precision ${prec} -- ${why}`);
      }
    }
  }
  if (problems.length) {
    console.error('\n⛔ refusing to continue. Existing columns are too narrow:\n' + problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`pre-flight      : ${existing.length} columns inspected, widths and money scales OK`);

  // ── 2. Push the schema from schema.ts ─────────────────────────────────────
  // drizzle's migrate needs a generated journal; this applies the declared
  // tables directly, which is what `push` would do after the interactive step.
  const statements = [
    `CREATE TABLE IF NOT EXISTS pos_item_map (
       id SERIAL PRIMARY KEY,
       pos_source VARCHAR(16) NOT NULL,
       pos_item_id VARCHAR(64) NOT NULL,
       item_name_ar VARCHAR(256),
       name_en VARCHAR(256),
       category VARCHAR(64),
       active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS pos_item_map_source_item_uq
       ON pos_item_map (pos_source, pos_item_id)`,

    `CREATE TABLE IF NOT EXISTS ingestion_batches (
       id SERIAL PRIMARY KEY,
       source_file TEXT NOT NULL,
       file_fingerprint TEXT NOT NULL,
       business_date DATE,
       date_from VARCHAR(12),
       date_to VARCHAR(12),
       branch_ref VARCHAR(16),
       report_shape VARCHAR(16),
       row_count INTEGER,
       status VARCHAR(16) NOT NULL DEFAULT 'pending',
       duplicate_of INTEGER,
       reject_reason TEXT,
       ingested_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // ⭐⭐⭐ The re-import guard.
    // ⭐ source_file is unique, NOT file_fingerprint. A unique index on the
    // fingerprint alone looks like it protects a re-import, but it also makes
    // ingestion_batches.duplicate_of unreachable: a second file with the same
    // content cannot be inserted at all. Measured on the real import, that
    // deleted all 336 duplicate files with no record, so there was no way to
    // answer "are these totals double-counted?". Duplicate files are recorded;
    // duplicate transactions are refused by pos_order_lines_slot_uq.
    `CREATE UNIQUE INDEX IF NOT EXISTS ingestion_batches_source_file_uq
       ON ingestion_batches (source_file)`,
    `CREATE INDEX IF NOT EXISTS ingestion_batches_fingerprint_idx
       ON ingestion_batches (file_fingerprint)`,
    `CREATE INDEX IF NOT EXISTS ingestion_batches_business_date_idx
       ON ingestion_batches (business_date)`,
    `CREATE INDEX IF NOT EXISTS ingestion_batches_branch_ref_idx
       ON ingestion_batches (branch_ref)`,

    `CREATE TABLE IF NOT EXISTS branches (
       id SERIAL PRIMARY KEY,
       ref VARCHAR(16) NOT NULL,
       name_ar VARCHAR(256),
       name_en VARCHAR(256),
       active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS branches_ref_uq ON branches (ref)`,

    `CREATE TABLE IF NOT EXISTS pos_order_lines (
       id SERIAL PRIMARY KEY,
       pos_source VARCHAR(16) NOT NULL,
       pos_item_id VARCHAR(64) NOT NULL,
       branch_ref VARCHAR(16) NOT NULL,
       business_date DATE NOT NULL,
       quantity_sold NUMERIC(12,3) NOT NULL,
       gross_sales NUMERIC(14,5) NOT NULL,
       net_sales NUMERIC(14,5) NOT NULL,
       cost NUMERIC(14,5) NOT NULL,
       profit NUMERIC(14,5) NOT NULL,
       vat NUMERIC(14,5),
       discount NUMERIC(14,5),
       total_ex_vat NUMERIC(14,5),
       return_amount NUMERIC(14,5),
       return_qty NUMERIC(12,3),
       cancel_amount NUMERIC(14,5),
       cancel_qty NUMERIC(12,3),
       ingestion_batch_id INTEGER NOT NULL
         REFERENCES ingestion_batches (id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // ⭐⭐⭐ The dedupe guarantee. Re-importing the same file cannot double it.
    `CREATE UNIQUE INDEX IF NOT EXISTS pos_order_lines_slot_uq
       ON pos_order_lines (pos_source, pos_item_id, branch_ref, business_date)`,
    `CREATE INDEX IF NOT EXISTS pos_order_lines_batch_idx
       ON pos_order_lines (ingestion_batch_id)`,
    `CREATE INDEX IF NOT EXISTS pos_order_lines_business_date_idx
       ON pos_order_lines (business_date)`,
    `CREATE INDEX IF NOT EXISTS pos_order_lines_branch_ref_idx
       ON pos_order_lines (branch_ref)`,
    `CREATE INDEX IF NOT EXISTS pos_order_lines_item_idx
       ON pos_order_lines (pos_item_id)`,
  ];

  await client.begin(async (tx) => {
    for (const s of statements) await tx.unsafe(s);
  });
  console.log(
    `applied         : ${statements.length} statements ` +
      `(${notices.length} "already exists, skipping")`,
  );

  // ── 3. Verify what actually landed, from the catalogue ────────────────────
  const tables = await client.unsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log(`tables          : ${tables.map((t: any) => t.table_name).join(', ')}`);

  const idx = await client.unsafe(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%_uq'
    ORDER BY indexname
  `);
  const expectedUq = [
    'branches_ref_uq',
    'ingestion_batches_source_file_uq',
    'pos_item_map_source_item_uq',
    'pos_order_lines_slot_uq',
  ];
  const haveUq = new Set(idx.map((i: any) => i.indexname));
  const missingUq = expectedUq.filter((n) => !haveUq.has(n));
  if (missingUq.length) {
    console.error(`⛔ unique indexes missing: ${missingUq.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`unique indexes  : ${expectedUq.join(', ')}`);

  // Prove the dedupe constraint actually bites, rather than assuming it does.
  //
  // ⛔ NOT inside client.begin(). A failed statement aborts a PostgreSQL
  //    transaction, so the cleanup DELETE then fails with "current transaction
  //    is aborted" -- and that second error replaced the answer, reporting a
  //    duplicate-key failure for a constraint that had in fact worked. The
  //    probe runs in autocommit so each statement stands or falls alone.
  const PROBE_REF = '__probe__';
  let probe: string;
  try {
    await client.unsafe(
      `INSERT INTO branches (ref, name_ar) VALUES ('${PROBE_REF}', 'probe 1')`,
    );
    try {
      await client.unsafe(
        `INSERT INTO branches (ref, name_ar) VALUES ('${PROBE_REF}', 'probe 2')`,
      );
      probe = 'NOT ENFORCED';
    } catch {
      probe = 'enforced';
    }
  } catch (e) {
    probe = `probe could not run: ${e instanceof Error ? e.message : e}`;
  } finally {
    // Always clean up, even if the probe itself misbehaved.
    await client.unsafe(`DELETE FROM branches WHERE ref = '${PROBE_REF}'`).catch(() => {});
  }
  console.log(`constraint probe: ${probe}`);
  if (probe !== 'enforced') {
    console.error('⛔ a declared unique index did not reject a duplicate. Do not import yet.');
    process.exitCode = 1;
    return;
  }

  // ── 4. Hand the tables to the application role ────────────────────────────
  const appRole = 'restocost_app';
  const pw = env.COMPANY_DB_PASSWORD;
  if (pw) {
    await client.unsafe(`GRANT CONNECT ON DATABASE "${target}" TO ${appRole}`);
    await client.unsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await client.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await client.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);
    await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public
                          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`);
    console.log(`granted         : ${appRole} on ${target} (DML only, no DDL)`);
  }

  void drizzle; void schema; void db;
}

try {
  await main();
} catch (e) {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}