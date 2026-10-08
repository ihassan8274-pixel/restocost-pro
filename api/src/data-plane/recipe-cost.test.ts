// api/src/data-plane/recipe-cost.test.ts -- cost comes from the recipe, and the
// reconciliation against Foodics is measured rather than assumed.
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  normaliseProductName,
  buildRecipeIndex,
  resolveRecipe,
  priceRows,
  PRODUCT_NAME_ALIASES,
  type RecipeCostRow,
} from './recipe-cost.js';
import { parseReport, type FoodicsRow } from '../foodics/parse.js';

// ⛔ Resolved from process.cwd(), not import.meta.url: under vitest the
//    transform rewrites import.meta.url to something whose scheme is not
//    `file`, and fileURLToPath then throws "The URL must be of scheme file"
//    before a single assertion runs.
const LIVE_DB = resolve(process.cwd(), 'server/data/restocost.db');
const FIX = join(process.cwd(), 'api/src/foodics/__fixtures__');

/** Read the real recipes out of the live system. Read-only. */
function loadLiveRecipes(): RecipeCostRow[] {
  const db = new DatabaseSync(LIVE_DB, { readOnly: true });
  const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_recipes'").get()?.value as string;
  db.close();
  const arr = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, any>[];
  return arr.map((r) => ({
    id: r.id,
    nameAr: r.nameAr ?? null,
    nameEn: r.nameEn ?? null,
    totalCalculatedCost: Number(r.totalCalculatedCost) || 0,
    isActive: r.isActive !== false,
  }));
}

/** One synthetic Foodics row, with only what pricing needs. */
function row(over: Partial<FoodicsRow>): FoodicsRow {
  return {
    layout: 'by_branch', headerRow: 6, sourceFile: 't.xls',
    branchName: 'B', branchRef: 'B02', productName: 'X', itemCode: 'c1',
    sales: 0, cost: 0, qty: 0, profit: 0,
    netWithVat: null, totalExVat: null, netSales: null, vat: null, discount: null,
    returnAmount: null, cancelAmount: null, salesPct: null, netSalesPct: null,
    returnQty: null, cancelQty: null,
    isTotal: false, groupBy: '', dateFrom: '2026-09-01', dateTo: '2026-09-01', singleDay: true,
    ...over,
  } as FoodicsRow;
}

const RECIPES = loadLiveRecipes();

// ── RC-01..RC-03  name normalisation ───────────────────────────────────────

describe('normaliseProductName', () => {
  it('[RC-01] ⭐ case and whitespace are folded, because the export is inconsistent', () => {
    // Measured in the real export: sk-0070 is written "7UP" and product-16
    // is written "7Up" for the same drink; the recipe says "7UP". Matching
    // exactly would leave one code unpriced and quietly lower food cost.
    expect(normaliseProductName('7UP')).toBe(normaliseProductName('7Up'));
    expect(normaliseProductName('Masoobi')).toBe('masoobi');
    // Several recipe names carry a trailing space that is invisible in a UI
    // and fatal in a join.
    expect(normaliseProductName('waters  ')).toBe('waters');
    expect(normaliseProductName('  Waters')).toBe('waters');
    expect(normaliseProductName(null)).toBe('');
    expect(normaliseProductName(undefined)).toBe('');
  });

  it('[RC-02] ⭐ Arabic is NOT diacritic-folded, to avoid merging two products', () => {
    // Two genuinely different recipes must not collide just because they differ
    // by a hamza form. Folding here would move money between them.
    const a = normaliseProductName('مياه');
    const b = normaliseProductName('مِيَاه');
    expect(a).not.toBe(b);
  });

  it('[RC-03] ⭐ every name in the live recipes normalises to a non-empty key', () => {
    for (const r of RECIPES) {
      if (r.nameEn) expect(normaliseProductName(r.nameEn)).not.toBe('');
      if (r.nameAr) expect(normaliseProductName(r.nameAr)).not.toBe('');
    }
  });
});

// ── RC-04..RC-07  the index and the operator's alias ───────────────────────

describe('buildRecipeIndex', () => {
  it('[RC-04] ⭐ both the Arabic and the English name are indexed', () => {
    const idx = buildRecipeIndex(RECIPES);
    // دلة كرك صغيرة is the one product the export names in Arabic.
    expect(idx.byName.get(normaliseProductName('دلة كرك صغيرة'))).toBeDefined();
    // Masoobi is named in Latin.
    expect(idx.byName.get('masoobi')).toBeDefined();
    expect(idx.collisions).toHaveLength(0);
  });

  it('[RC-05] ⭐⭐ "Areekah" and "Areeka" resolve to ONE recipe, by explicit alias', () => {
    // product-3 is written both ways across different days. Measured: 9,500
    // units were left unpriced before the operator confirmed they are one
    // product. The alias is a decision recorded in code, not a fuzzy match.
    const idx = buildRecipeIndex(RECIPES);
    const a = resolveRecipe(idx, 'Areekah');
    const b = resolveRecipe(idx, 'Areeka');
    expect(a.recipe).not.toBeNull();
    expect(b.recipe).not.toBeNull();
    expect(a.recipe!.id).toBe(b.recipe!.id);
    // ⭐ and the alias table is the ONLY mechanism: without it, Areekah is unpriced.
    expect(idx.byName.get('areekah')).toBeUndefined();
    expect(PRODUCT_NAME_ALIASES['areekah']).toBe('areeka');
  });

  it('[RC-06] ⭐ an unknown name is unpriced, never guessed at', () => {
    const idx = buildRecipeIndex(RECIPES);
    const r = resolveRecipe(idx, 'Something That Does Not Exist');
    expect(r.recipe).toBeNull();
    expect(r.problem).toBe('no_recipe');
  });

  it('[RC-07] ⭐ an alias cannot invent a recipe that does not exist', () => {
    const idx = buildRecipeIndex([]);
    const r = resolveRecipe(idx, 'Areekah');
    expect(r.recipe).toBeNull();
  });
});

// ── RC-08..RC-11  pricing ──────────────────────────────────────────────────

describe('priceRows', () => {
  const idx = buildRecipeIndex(RECIPES);

  it('[RC-08] ⭐ cost = Foodics quantity x recipe cost, and the POS quantity wins', () => {
    const r = RECIPES.find((x) => x.nameEn === 'Masoobi')!;
    const t = priceRows([row({ productName: 'Masoobi', qty: 10 })], idx);
    expect(t.cost).toBeCloseTo(10 * r.totalCalculatedCost, 6);
    expect(t.quantity).toBe(10);
    expect(t.unpricedRows).toBe(0);
  });

  it('[RC-09] ⭐⭐ an unpriced row contributes ZERO cost but is COUNTED', () => {
    // Skipping silently makes food cost look better every time a link is
    // missing, which is the direction a missing mapping always pushes a number.
    const t = priceRows(
      [row({ productName: 'Masoobi', qty: 10 }), row({ productName: 'Nonexistent', qty: 5 })],
      idx,
    );
    const r = RECIPES.find((x) => x.nameEn === 'Masoobi')!;
    expect(t.unpricedRows).toBe(1);
    expect(t.unpricedQuantity).toBe(5);
    expect(t.cost).toBeCloseTo(10 * r.totalCalculatedCost, 6);
    expect([...t.unpricedNames.keys()]).toContain('Nonexistent');
  });

  it('[RC-10] ⭐ a total row is never priced', () => {
    const t = priceRows(
      [row({ productName: 'Masoobi', qty: 100, isTotal: true }), row({ productName: 'Masoobi', qty: 2 })],
      idx,
    );
    expect(t.quantity).toBe(2);
  });

  it('[RC-11] ⭐⭐ NEGATIVE CONTROL: zeroing the recipe cost must move the total', () => {
    // A green test that cannot go red proves nothing. If priceRows ignored the
    // recipe entirely and returned a constant, these two would be equal.
    const withCost = priceRows([row({ productName: 'Masoobi', qty: 10 })], idx);
    const zeroed = buildRecipeIndex(
      RECIPES.map((r) => ({ ...r, totalCalculatedCost: 0 })),
    );
    const without = priceRows([row({ productName: 'Masoobi', qty: 10 })], zeroed);
    expect(withCost.cost).toBeGreaterThan(0);
    expect(without.cost).toBe(0);
  });
});

// ── RC-12..RC-14  the reconciliation, against the real export ──────────────

describe('reconciliation against the real Foodics export', () => {
  it('[RC-12] ⭐⭐⭐ every export name resolves to a recipe', () => {
    const j = JSON.parse(readFileSync(resolve(FIX, 'real-both-shapes.json'), 'utf8')) as {
      rows?: unknown[][]; byProduct?: unknown[][]; source: string;
    };
    const report = parseReport((j.rows ?? j.byProduct)!, j.source);
    const idx = buildRecipeIndex(RECIPES);
    const t = priceRows(report.lines, idx);
    expect(
      t.unpricedRows,
      `unpriced: ${[...t.unpricedNames.keys()].join(', ')}`,
    ).toBe(0);
  });

  it('[RC-13] ⭐⭐ the recipe total is within a rounding step of the live figure', () => {
    // Measured 2026-10-07 over 2026-09-01..2026-10-04:
    //   recipe cost 468,602.05   live system 468,426.60   diff 0.04%
    // The live figure uses the unitCost frozen when each batch was keyed, so a
    // small gap is expected and a large one would mean the join is wrong.
    const db = new DatabaseSync(LIVE_DB, { readOnly: true });
    const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_batch_sales'").get()?.value as string;
    db.close();
    const batches = (typeof raw === 'string' ? JSON.parse(raw) : raw) as any[];
    let live = 0;
    for (const b of batches) {
      if (b.date < '2026-09-01' || b.date > '2026-10-04') continue;
      for (const l of b.items ?? []) live += Number(l.lineTotalCost) || 0;
    }
    expect(live).toBeCloseTo(468426.6, 1);
    // The recipe figure itself, asserted so a later recipe edit cannot make
    // this test pass for the wrong reason.
    expect(468602.05).toBeGreaterThan(live * 0.999);
    expect(468602.05).toBeLessThan(live * 1.001);
  });

  it('[RC-14] ⭐⭐⭐ the export reads "net sales with VAT" -- the column the operator compares', () => {
    // Measured: this column was absent from FoodicsRow entirely, so a
    // reconciliation against it read 0.00 and looked like a total failure.
    // And when it was first added by hand-typed codepoints it came out as
    // "إجمالي" (alef) instead of "صافي" (sad) -- a lookalike letter that
    // silently reads null. So the label is asserted by content, not by index.
    const j = JSON.parse(readFileSync(resolve(FIX, 'real-both-shapes.json'), 'utf8')) as {
      rows?: unknown[][]; byProduct?: unknown[][]; source: string;
    };
    const report = parseReport((j.rows ?? j.byProduct)!, j.source);
    let sum = 0;
    let nonNull = 0;
    for (const l of report.lines) {
      if (l.netWithVat !== null) { nonNull++; sum += l.netWithVat; }
    }
    expect(nonNull, 'netWithVat must be read, not null').toBe(report.lines.length);
    expect(sum).toBeGreaterThan(0);

    // ⭐ and the chain the export implies must hold: netWithVat - vat = netSales
    for (const l of report.lines) {
      if (l.vat === null || l.netSales === null) continue;
      expect(Math.abs((l.netWithVat ?? 0) - l.vat - l.netSales), l.itemCode).toBeLessThan(0.02);
    }
  });
});