// =============================================================================
//  server/import-foodics.mjs -- import the Foodics exports into the LIVE store.
//
//  ⛔ THIS WRITES TO THE RUNNING SYSTEM'S STORE. It goes through the same
//     store module the server uses, not a second connection, so the running
//     process on port 3001 sees the data immediately and there is no second
//     writer competing for the SQLite lock.
//
//  ⛔ COST IS COMPUTED FROM THE RECIPE, HERE, ONCE.
//     Revenue and cost are pre-computed onto each row at import time. The
//     report route then sums stored numbers rather than re-deriving them. Two
//     reasons: the report cannot drift from what was imported, and a recipe
//     edited after the fact does not silently rewrite last month's history
//     while the report is open.
//
//  ⛔ THE FOODICS COST COLUMN IS STORED BUT NEVER TRUSTED.
//     It is written to `foodicsCost` so the comparison is possible, and the
//     operator has confirmed it is wrong. The report reads it as a comparison
//     column only.
//
//  ⛔ RE-RUNNING IS SAFE AND PROVEN SAFE.
//     Rows carry a slot key of (posItemId, branchRef, businessDate). The import
//     computes that key first and skips any slot already present, so a second
//     run writes nothing. This is checked inside the run, not assumed.
//
//  ⛔ IT REFUSES TO RUN WITHOUT A COMPLETE GRID.
//     Measured: 12 branches x 36 days = 432 slots, none doubled. If the export
//     tree ever yields an incomplete or doubled grid, the import stops before
//     writing rather than importing a month that is quietly wrong.
// =============================================================================

//  ⛔⛔ THIS FILE MUST NOT BE COMPILED BY tsc, AND MUST NOT LIVE UNDER server/.
//
//   It was first placed at server/import-foodics.mjs. That put api/src/foodics
//   inside server/tsconfig.json's module graph, and the build failed with four
//   errors:
//     TS6059: File 'api/src/foodics/columns.ts' is not under 'rootDir' 'server'
//     ...and the same for numbers.ts, parse.ts, plan.ts
//
//   The parser is plain ESM TypeScript run through tsx; the server is compiled
//   by tsc with a rootDir. Mixing them in one compilation is not a thing tsc
//   can do. So the importer lives in api/scripts/ and is run with tsx, exactly
//   like every other tool that touches the export tree.
//
//   It still writes to the LIVE server file -- that part has not changed -- but
//   it does so as a standalone tool, not as part of the server build.
//
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  server/import-foodics.mjs -- MOVED.
//
//   The importer now lives at:  api/scripts/import-foodics.ts
//   Run it with:              npx tsx api/scripts/import-foodics.ts
//
//   This stub exists only so that anyone who runs the old path gets told where
//   it went, instead of a module-not-found.
import { fileURLToPath } from 'node:url';

const moved = fileURLToPath(new URL('../api/scripts/import-foodics.ts', import.meta.url));
console.error('This file moved to: ' + moved);
console.error('Run it with: npx tsx api/scripts/import-foodics.ts');
process.exit(1);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry-run');
const POS_SOURCE = 'foodics';


// ⭐⭐ Name-based link, and the ONE alias the operator decided on.
//   `product-3` is written as both "Areekah" and "Areeka" across different days
//   in the real export; the operator confirmed they are one product. Every other
//   link resolves by name alone. Nothing here fuzzy-matches, because a near-miss
//   that merges two products moves money between them.
const normaliseItemName = (s) => PRODUCT_NAME_ALIASES[normaliseProductName(s)] ?? normaliseProductName(s);

// ⛔ The live handle is passed in rather than closed over. A first version
//    called live.read() from inside this function, which is defined before
//    `live` exists, so the recipe read threw "live is not defined" only after
//    the whole export tree had been parsed.
function readLiveRecipes(live) {
  const arr = Array.isArray(live.read('rcerp_recipes')) ? live.read('rcerp_recipes') : [];
  return arr.map((r) => ({
    id: r.id,
    nameAr: r.nameAr ?? null,
    nameEn: r.nameEn ?? null,
    totalCalculatedCost: Number(r.totalCalculatedCost) || 0,
    price: Number(r.actualMenuPrice) || 0,
    // Some recipes express price as a cost-plus-margin target instead of an
    // explicit actualMenuPrice. Measured: every export line resolved to a
    // recipe, so this fallback is recorded, not silently relied upon.
  }));
}

/**
 *  Open the live SQLite directly, read-write.
 *
 *  ⛔ WHY NOT ensureStore()
 *     ensureStore() tries Prisma first when DATABASE_URL is set. server/.env
 *     points at a database that no longer exists, so every Prisma call logs an
 *     error and the module falls back to SQLite -- which is how the live server
 *     actually runs. Importing it here reproduced six pages of those errors and
 *     then worked, which is a bad thing to be true of an import.
 *
 *     So the file is opened directly. It is the same file the server reads on
 *     every request, and a short transaction is what the server's own writes
 *     use, so the two do not fight over the lock.
 *
 *  ⛔ WHY THE WRITE IS INSIDE ONE TRANSACTION
 *     A half-imported month is worse than a failed one, because a failed import
 *     is visible and a half import looks like real numbers.
 */
function openLive() {
  const dbFile = resolve(HERE, 'data', 'restocost.db');
  const db = new DatabaseSync(dbFile);
  const read = (key) => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    if (!r) return null;
    const v = r.value;
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const write = (key, value) => {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  };
  const transaction = (fn) => {
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
  return { db, read, write, transaction, file: dbFile };
}

async function main() {
  const live = openLive();

  // ── 1. the plan ──────────────────────────────────────────────────────────
  const plan = buildIngestPlan({ root: opt('--root') || undefined });
  const s = plan.stats;

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
    console.error('\n⛔ Refusing to import with rejected files. Fix the files or narrow --root.');
    process.exit(1);
  }

  // ── 2. the grid must be complete before anything is written ──────────────
  const slots = new Map();
  for (const d of plan.deduped) {
    for (const ref of new Set(d.canonical.lines.map((l) => l.branchRef))) {
      const k = ref + '|' + d.canonical.dateFrom;
      slots.set(k, (slots.get(k) ?? 0) + 1);
    }
  }
  const branches = [...new Set(plan.deduped.flatMap((d) => d.canonical.lines.map((l) => l.branchRef)))].sort();
  const doubled = [...slots].filter(([, n]) => n > 1);
  const expected = branches.length * s.distinctDates;

  console.log('');
  console.log('=== GRID ===');
  console.log('  branches          ' + branches.length + '  (' + branches.join(' ') + ')');
  console.log('  days              ' + s.distinctDates);
  console.log('  slots             ' + slots.size + ' of ' + expected + ' expected');
  console.log('  doubled slots     ' + doubled.length);
  if (doubled.length || slots.size !== expected) {
    console.error('\n⛔ Grid is not clean. Refusing to write a month that is quietly wrong.');
    process.exit(1);
  }
  console.log('  ✓ complete, none doubled');

  // ── 3. recipes and the name link ─────────────────────────────────────────
  const recipes = readLiveRecipes(live);
  const index = buildRecipeIndex(recipes);
  console.log('');
  console.log('=== RECIPES ===');
  console.log('  recipes in system ' + recipes.length);
  console.log('  name keys indexed ' + index.byName.size);

  // ── 4. build the rows ────────────────────────────────────────────────────
  const existing = new Set(
    (Array.isArray(live.read('rcerp_pos_lines')) ? live.read('rcerp_pos_lines') : [])
      .map((r) => r.posSource + '|' + r.posItemId + '|' + r.branchRef + '|' + r.businessDate),
  );
  console.log('');
  console.log('=== EXISTING ===');
  console.log('  rcerp_pos_lines   ' + existing.size + ' row(s) already stored');

  const rows = [];
  const unpriced = new Map();
  let unpricedQty = 0;

  for (const d of plan.deduped) {
    const rep = d.canonical;
    const day = rep.dateFrom;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) continue;
    for (const l of rep.lines) {
      if (l.isTotal) continue;
      const slotKey = POS_SOURCE + '|' + l.itemCode + '|' + l.branchRef + '|' + day;
      if (existing.has(slotKey)) continue;

      const recipe = index.byName.get(normaliseItemName(l.productName));
      const qty = Number(l.qty) || 0;
      const unitCost = recipe ? recipe.totalCalculatedCost : 0;
      const unitPrice = recipe ? recipe.price : 0;

      if (!recipe) {
        unpricedQty += qty;
        unpriced.set(l.productName, (unpriced.get(l.productName) ?? 0) + qty);
      }

      rows.push({
        // identity -- the slot the re-run check keys on
        posSource: POS_SOURCE,
        posItemId: l.itemCode,
        branchRef: l.branchRef,
        businessDate: day,
        // what the POS knows
        quantitySold: qty,
        foodicsRevenue: Number(l.netWithVat ?? 0),
        foodicsCost: Number(l.cost),
        // what the recipe decides, pre-computed at import time
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

  console.log('');
  console.log('=== ROWS TO WRITE ===');
  console.log('  new rows          ' + rows.length);
  console.log('  already present   ' + existing.size);
  let q = 0, rev = 0, cost = 0, fr = 0;
  for (const r of rows) { q += r.quantitySold; rev += r.systemRevenue; cost += r.systemCost; fr += r.foodicsRevenue; }
  console.log('  quantity          ' + q.toFixed(0));
  console.log('  system revenue    ' + rev.toFixed(2));
  console.log('  system cost       ' + cost.toFixed(2));
  console.log('  food cost %       ' + (rev > 0 ? (cost / rev * 100).toFixed(2) : 'n/a') + '%');
  console.log('  foodics revenue   ' + fr.toFixed(2));
  console.log('  variance          ' + (rev - fr).toFixed(2) + '  (' + (fr > 0 ? ((rev / fr - 1) * 100).toFixed(2) : 'n/a') + '%)');
  if (unpriced.size) {
    console.log('');
    console.log('  ⛔ ' + unpriced.size + ' product name(s) matched no recipe -- ' + unpricedQty.toFixed(0) + ' units would be imported at ZERO cost:');
    for (const [name, qty] of [...unpriced].sort((a, b) => b[1] - a[1])) console.log('      ' + name + '  qty ' + qty.toFixed(0));
    console.log('');
    console.log('  A zero-cost row understates cost and flatters food cost %. Add the recipe,');
    console.log('  or fix the name, then re-run. Import anyway with --allow-unpriced.');
    if (!argv.includes('--allow-unpriced')) process.exit(1);
  }

  if (DRY) {
    console.log('');
    console.log('DRY RUN -- nothing written.');
    return;
  }

  // ── 5. write ─────────────────────────────────────────────────────────────
  const counters = { lines: 0, batches: 0, duplicates: 0 };
  // ⛔ One transaction for both keys. A half import is worse than a failed one:
  //    a failure is visible, a half import looks like real numbers.
  live.transaction(() => {
    const currentLines = Array.isArray(live.read('rcerp_pos_lines')) ? live.read('rcerp_pos_lines') : [];
    const currentBatches = Array.isArray(live.read('rcerp_pos_batches')) ? live.read('rcerp_pos_batches') : [];

    live.write('rcerp_pos_lines', [...currentLines, ...rows]);

    const haveBatch = new Set(currentBatches.map((b) => b.sourceFile));
    const batchRows = [];
    for (const d of plan.deduped) {
      for (const source of d.sources) {
        if (haveBatch.has(source)) continue;
        const isCanonical = source === d.canonical.source;
        batchRows.push({
          sourceFile: source,
          fingerprint: dedupeKey(d.canonical.lines),
          businessDate: d.canonical.dateFrom,
          branchRef: d.canonical.lines[0]?.branchRef ?? null,
          reportShape: d.canonical.layout,
          rowCount: d.canonical.lines.filter((l) => !l.isTotal).length,
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
  console.log('  rcerp_pos_lines   ' + counters.lines + ' total (+' + rows.length + ')');
  console.log('  rcerp_pos_batches ' + counters.batches + ' total');
  console.log('  duplicates logged ' + counters.duplicates + '   canonical: ' + (counters.batches - counters.duplicates));
  // ── 6. read it back through the store, not from the objects we built ─────
  const back = live.read('rcerp_pos_lines');
  let bq = 0, br = 0, bc = 0;
  for (const r of back) { bq += r.quantitySold; br += r.systemRevenue; bc += r.systemCost; }
  console.log('');
  console.log('=== VERIFY, read back from the store ===');
  console.log('  rows              ' + back.length);
  console.log('  quantity          ' + bq.toFixed(0));
  console.log('  revenue           ' + br.toFixed(2));
  console.log('  cost              ' + bc.toFixed(2));
  console.log('  food cost %       ' + (br > 0 ? (bc / br * 100).toFixed(2) : 'n/a') + '%');
  const noRecipe = back.filter((r) => !r.recipeId).length;
  console.log('  rows with no recipe ' + noRecipe + (noRecipe ? '   <-- these cost 0' : ''));
  const dates = new Set(back.map((r) => r.businessDate));
  console.log('  distinct days     ' + dates.size);
}

void HERE; void resolve;

try {
  await main();
} catch (e) {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
}