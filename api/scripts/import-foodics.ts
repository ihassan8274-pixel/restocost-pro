// =============================================================================
//  api/scripts/import-foodics.ts -- import the Foodics exports into the LIVE
//  store that the server on port 3001 reads.
//
//  ⛔ WHY THIS LIVES HERE AND NOT UNDER server/
//     server/tsconfig.json compiles with rootDir=server. A file under server/
//     importing api/src/foodics/*.ts pulls those files into that compilation and
//     the build fails with four TS6059 errors. The parser is run through tsx,
//     not compiled, so the importer is a tool like every other tool here --
//     while still writing to the live server file.
//
//  ⛔ WHY IT OPENS SQLITE DIRECTLY
//     ensureStore() tries Prisma first when DATABASE_URL is set. server/.env
//     points at a database that no longer exists, so each Prisma call logs an
//     error before the module falls back to SQLite -- which is how the live
//     server actually runs. Reproducing that in an import meant a screenful of
//     errors followed by success, which is a bad property for a data import.
//
//  ⛔ COST IS COMPUTED FROM THE RECIPE, HERE, ONCE.
//     Revenue and cost are pre-computed onto each row at import time, so the
//     report route sums stored numbers and cannot drift from what was imported.
//     A recipe edited afterwards does not silently rewrite last month while the
//     report is open.
//
//  ⛔ THE FOODICS COST COLUMN IS STORED BUT NEVER TRUSTED.
//     Written to `foodicsCost` so the comparison is possible. The operator has
//     confirmed the column is wrong; the report reads it as a comparison only.
//
//  ⛔ RE-RUNNING IS SAFE, AND CHECKED INSIDE THE RUN.
//     Rows are keyed by (posItemId, branchRef, businessDate). The import builds
//     the key set from what is already stored and skips anything present, then
//     re-reads and reports the delta. Not assumed -- measured every run.
//
//  ⛔ IT REFUSES TO WRITE AN INCOMPLETE GRID.
//     Measured: 12 branches x 36 days = 432 slots, none doubled. If the export
//     tree ever yields a doubled or short grid, the run stops before writing.
// =============================================================================

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIngestPlan } from '../src/foodics/plan.js';
import { dedupeKey } from '../src/foodics/parse.js';
import {
  buildRecipeIndex,
  PRODUCT_NAME_ALIASES,
  normaliseProductName,
} from '../src/data-plane/recipe-cost.js';

// api/scripts/ -> repo root is two levels up.
const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry-run');
const ALLOW_UNPRICED = argv.includes('--allow-unpriced');
const POS_SOURCE = 'foodics';

/**
 *  Open the live SQLite read-write.
 *
 *  ⭐ busy_timeout: five devices write to this file through the server, and a
 *     write that meets another write would otherwise fail with SQLITE_BUSY and
 *     surface to the user as a lost save. Waiting is the correct behaviour for
 *     a single-file app; failing is not.
 */
function openLive() {
  const db = new DatabaseSync(LIVE_DB);
  db.exec('PRAGMA busy_timeout = 5000');
  const read = (key: string): any => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    if (!r) return null;
    const v = r.value as string;
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const write = (key: string, value: unknown) => {
    db.prepare(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, JSON.stringify(value));
  };
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return { db, read, write, transaction, file: LIVE_DB };
}

/**
 *  ⭐ The one name alias the operator decided on.
 *   `product-3` appears in the real export as both "Areekah" and "Areeka" on
 *   different days; the operator confirmed they are one product. Everything else
 *   links by name alone. Nothing fuzzy-matches: a near-miss that merges two
 *   products moves money between them.
 */
const linkName = (s: string) => PRODUCT_NAME_ALIASES[normaliseProductName(s)] ?? normaliseProductName(s);

function readLiveRecipes(live: ReturnType<typeof openLive>) {
  const arr = Array.isArray(live.read('rcerp_recipes')) ? live.read('rcerp_recipes') : [];
  return arr.map((r: any) => ({
    id: r.id,
    nameAr: r.nameAr ?? null,
    nameEn: r.nameEn ?? null,
    totalCalculatedCost: Number(r.totalCalculatedCost) || 0,
    price: Number(r.actualMenuPrice) || 0,
  }));
}

function main() {
  const live = openLive();
  console.log('live store      ' + live.file);

  // ── 1. the plan ──────────────────────────────────────────────────────────
  const plan = buildIngestPlan({ root: opt('--root') || undefined });
  const s = plan.stats;
  console.log('');
  console.log('=== PLAN ===');
  console.log('  export root       ' + plan.root);
  console.log('  files             ' + s.totalFiles + ' found, ' + s.rejectedFiles + ' rejected');
  console.log('  duplicate files   ' + s.duplicateFiles);
  console.log('  reports kept      ' + s.uniqueReports);
  console.log('  rows              ' + s.canonicalRows);
  console.log('  business days     ' + s.distinctDates);

  if (plan.rejected.length) {
    console.log('\n  REJECTED FILES:');
    for (const r of plan.rejected) console.log('    ' + r.file + '  --  ' + r.reason);
    console.error('\n⛔ Refusing to import with rejected files. Fix them or narrow --root.');
    live.db.close();
    process.exit(1);
  }

  // ── 2. the grid must be complete before anything is written ──────────────
  const slots = new Map<string, number>();
  for (const d of plan.deduped) {
    for (const ref of new Set(d.canonical.lines.map((l: any) => l.branchRef))) {
      const k = ref + '|' + d.canonical.dateFrom;
      slots.set(k, (slots.get(k) ?? 0) + 1);
    }
  }
  const branches = [...new Set(plan.deduped.flatMap((d: any) => d.canonical.lines.map((l: any) => l.branchRef)))].sort();
  const doubled = [...slots].filter(([, n]) => n > 1);
  const expected = branches.length * s.distinctDates;
  console.log('');
  console.log('=== GRID ===');
  console.log('  branches          ' + branches.length + '  (' + branches.join(' ') + ')');
  console.log('  slots             ' + slots.size + ' of ' + expected + ' expected');
  console.log('  doubled slots     ' + doubled.length);
  if (doubled.length || slots.size !== expected) {
    console.error('\n⛔ Grid is not clean. Refusing to write a month that is quietly wrong.');
    live.db.close();
    process.exit(1);
  }
  console.log('  ✓ complete, none doubled');

  // ── 3. recipes and the name link ─────────────────────────────────────────
  const recipes = readLiveRecipes(live);
  const index = buildRecipeIndex(recipes as any);
  console.log('');
  console.log('=== RECIPES ===');
  console.log('  recipes in system ' + recipes.length + '   name keys: ' + index.byName.size);

  // ── 4. build the rows ────────────────────────────────────────────────────
  const stored = Array.isArray(live.read('rcerp_pos_lines')) ? live.read('rcerp_pos_lines') : [];
  const existing = new Set(
    stored.map((r: any) => POS_SOURCE + '|' + r.posItemId + '|' + r.branchRef + '|' + r.businessDate),
  );
  console.log('');
  console.log('=== EXISTING ===');
  console.log('  rcerp_pos_lines   ' + existing.size + ' row(s) already stored');

  const rows: any[] = [];
  const unpriced = new Map<string, number>();
  let unpricedQty = 0;

  for (const d of plan.deduped as any[]) {
    const rep = d.canonical;
    const day = rep.dateFrom;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) continue;
    for (const l of rep.lines) {
      if (l.isTotal) continue;
      const slotKey = POS_SOURCE + '|' + l.itemCode + '|' + l.branchRef + '|' + day;
      if (existing.has(slotKey)) continue;

      const recipe: any = index.byName.get(linkName(l.productName));
      const qty = Number(l.qty) || 0;
      const unitCost = recipe ? recipe.totalCalculatedCost : 0;
      const unitPrice = recipe ? recipe.price : 0;
      if (!recipe) {
        unpricedQty += qty;
        unpriced.set(l.productName, (unpriced.get(l.productName) ?? 0) + qty);
      }

      rows.push({
        // identity -- what the re-run check keys on
        posSource: POS_SOURCE,
        posItemId: l.itemCode,
        branchRef: l.branchRef,
        businessDate: day,
        // what the POS knows
        quantitySold: qty,
        foodicsRevenue: Number(l.netWithVat ?? 0),
        foodicsCost: Number(l.cost),
        // what the recipe decides, frozen at import time
        recipeId: recipe ? recipe.id : null,
        recipePrice: unitPrice,
        recipeUnitCost: unitCost,
        systemRevenue: Math.round(qty * unitPrice * 100) / 100,
        systemCost: Math.round(qty * unitCost * 100) / 100,
        // display
        nameAr: recipe ? recipe.nameAr : l.productName,
        nameEn: recipe ? recipe.nameEn : null,
        posNameAr: l.productName,
        // provenance
        sourceFile: rep.source,
        reportShape: rep.layout,
      });
    }
  }

  let q = 0, rev = 0, cost = 0, fr = 0, fc = 0;
  for (const r of rows) { q += r.quantitySold; rev += r.systemRevenue; cost += r.systemCost; fr += r.foodicsRevenue; fc += r.foodicsCost; }
  console.log('');
  console.log('=== ROWS TO WRITE ===');
  console.log('  new rows          ' + rows.length);
  console.log('  already present   ' + existing.size + '   (skipped by the slot check)');
  console.log('  quantity          ' + q.toFixed(0));
  console.log('  system revenue    ' + rev.toFixed(2));
  console.log('  system cost       ' + cost.toFixed(2));
  console.log('  food cost %       ' + (rev > 0 ? ((cost / rev) * 100).toFixed(2) : 'n/a') + '%');
  console.log('  foodics revenue   ' + fr.toFixed(2) + '   variance ' + (rev - fr).toFixed(2) +
              '  (' + (fr > 0 ? (((rev / fr) - 1) * 100).toFixed(2) : 'n/a') + '%)');
  console.log('  foodics cost col  ' + fc.toFixed(2) + '   (reported, never used)');

  if (unpriced.size) {
    console.log('');
    console.log('  ⛔ ' + unpriced.size + ' product name(s) matched no recipe -- ' +
                unpricedQty.toFixed(0) + ' units would land at ZERO cost:');
    for (const [name, qty] of [...unpriced].sort((a, b) => b[1] - a[1])) {
      console.log('      ' + name + '  qty ' + qty.toFixed(0));
    }
    if (!ALLOW_UNPRICED) {
      console.log('');
      console.log('  A zero-cost row understates cost and flatters food cost %. Add the');
      console.log('  recipe or fix the name, then re-run. Override with --allow-unpriced.');
      live.db.close();
      process.exit(1);
    }
  }

  if (DRY) {
    console.log('');
    console.log('DRY RUN -- nothing written.');
    live.db.close();
    return;
  }

  // ── 5. write, both keys in one transaction ───────────────────────────────
  const counters = { lines: 0, batches: 0, duplicates: 0 };
  live.transaction(() => {
    const currentLines = Array.isArray(live.read('rcerp_pos_lines')) ? live.read('rcerp_pos_lines') : [];
    const currentBatches = Array.isArray(live.read('rcerp_pos_batches')) ? live.read('rcerp_pos_batches') : [];
    live.write('rcerp_pos_lines', [...currentLines, ...rows]);

    // Every file read, duplicates included, so "were these totals double
    // counted?" has an answer.
    const haveBatch = new Set(currentBatches.map((b: any) => b.sourceFile));
    const batchRows: any[] = [];
    for (const d of plan.deduped as any[]) {
      for (const source of d.sources) {
        if (haveBatch.has(source)) continue;
        const isCanonical = source === d.canonical.source;
        batchRows.push({
          sourceFile: source,
          fingerprint: dedupeKey(d.canonical.lines),
          businessDate: d.canonical.dateFrom,
          branchRef: d.canonical.lines[0]?.branchRef ?? null,
          reportShape: d.canonical.layout,
          rowCount: d.canonical.lines.filter((l: any) => !l.isTotal).length,
          status: isCanonical ? 'ingested' : 'duplicate',
          duplicateOf: isCanonical ? null : d.canonical.source,
        });
      }
    }
    live.write('rcerp_pos_batches', [...currentBatches, ...batchRows]);
    counters.lines = currentLines.length + rows.length;
    counters.batches = currentBatches.length + batchRows.length;
    counters.duplicates = batchRows.filter((b) => b.status === 'duplicate').length;
  });

  console.log('');
  console.log('=== WRITTEN ===');
  console.log('  rcerp_pos_lines   ' + counters.lines + ' total   (+' + rows.length + ')');
  console.log('  rcerp_pos_batches ' + counters.batches + ' total   (' + counters.duplicates + ' duplicates logged)');

  // ── 6. read back from the file, not from the objects we built ────────────
  const back = live.read('rcerp_pos_lines');
  let bq = 0, br = 0, bc = 0;
  for (const r of back) { bq += r.quantitySold; br += r.systemRevenue; bc += r.systemCost; }
  const days = new Set(back.map((r: any) => r.businessDate));
  const noRecipe = back.filter((r: any) => !r.recipeId).length;
  const dupSlots = new Set<string>();
  let dupCount = 0;
  for (const r of back) {
    const k = r.posSource + '|' + r.posItemId + '|' + r.branchRef + '|' + r.businessDate;
    if (dupSlots.has(k)) dupCount++;
    dupSlots.add(k);
  }

  console.log('');
  console.log('=== VERIFY, read back from the file ===');
  console.log('  rows                 ' + back.length);
  console.log('  quantity             ' + bq.toFixed(0));
  console.log('  revenue              ' + br.toFixed(2));
  console.log('  cost                 ' + bc.toFixed(2));
  console.log('  food cost %          ' + (br > 0 ? ((bc / br) * 100).toFixed(2) : 'n/a') + '%');
  console.log('  distinct days        ' + days.size);
  console.log('  rows with no recipe  ' + noRecipe + (noRecipe ? '   <-- these carry zero cost' : ''));
  console.log('  duplicated slots     ' + dupCount + (dupCount ? '   <-- DOUBLE COUNT' : '   (none)'));
  live.db.close();
}

try {
  main();
} catch (e) {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
}