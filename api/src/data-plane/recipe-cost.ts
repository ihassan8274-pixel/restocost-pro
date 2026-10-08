// =============================================================================
//  api/src/data-plane/recipe-cost.ts -- cost comes from the recipe, never from
//  the POS export.
//
//  WHY THIS FILE EXISTS
//  -------------------
//  The Foodics Excel export DOES carry a "cost" column, and it was read
//  faithfully for weeks. Measured against the live system over the same 34
//  days (2026-09-01 .. 2026-10-04):
//
//      quantity   sqlite 170,230   foodics 170,072    0.09% apart  -> same sales
//      revenue    sqlite 1,703,778 foodics net 1,603,027
//      cost       sqlite   468,427 foodics      484,052    3.2% apart
//
//  Quantity agreeing to a tenth of a percent proves both sources saw the same
//  transactions. The operator then confirmed the Foodics cost column is wrong
//  and that cost must come from the recipes. So:
//
//      SALES, QUANTITY, DATE, BRANCH, ITEM CODE  <- Foodics   (it knows what sold)
//      COST                                      <- recipe   (we know what it cost)
//
//  ⛔ THIS MODULE HAS NO KNOWLEDGE OF THE Foodics cost column. It is not
//     consulted, not compared, not "preferred when available". A cost number
//     that the recipes cannot produce is an error to report, not a number to
//     substitute.
//
//  ⛔ THE JOIN IS BY NAME, AND THAT IS THE OPERATOR'S RULE
//     Foodics item codes (`product-1`, `sk-0075`) have no counterpart in the
//     recipe list; the shared key is the product name. Measured: 33 of 34 codes
//     join cleanly. The one exception is `product-3`, which the export writes as
//     both "Areekah" and "Areeka" across different days; the operator confirmed
//     those are ONE product, so both spellings resolve to the same recipe.
//
//  ⛔ `unitCost` AS STORED IN OLD BATCHES IS NOT THE RECIPE
//     The live system's batch lines carry a `unitCost` frozen at entry time.
//     Across all priced lines, 4,868 match the recipe's current
//     `totalCalculatedCost` exactly and 4,738 do not -- e.g. Cola is 1.57 in the
//     batches and 1.80 in the recipe today. The batches are a historical record
//     of what the recipe cost THAT day; this module computes from the recipe as
//     it stands. Both figures are reported so the difference is visible rather
//     than silently resolved.
// =============================================================================

import type { FoodicsRow } from '../foodics/parse.js';

// ── the recipe, as the live system stores it ───────────────────────────────

export interface RecipeCostRow {
  readonly id: string;
  readonly nameAr: string | null;
  readonly nameEn: string | null;
  readonly totalCalculatedCost: number;
  readonly isActive: boolean;
}

export interface RecipeIndex {
  /** normalised name -> recipe. First recipe wins; see collision reporting. */
  readonly byName: ReadonlyMap<string, RecipeCostRow>;
  /** names that resolved to more than one recipe, for the operator to see. */
  readonly collisions: ReadonlyArray<{ name: string; recipes: readonly string[] }>;
  /** recipe ids referenced by nothing in the export. */
  readonly unused: readonly string[];
}

/**
 *  Normalise a product name for matching.
 *
 *  ⭐ Latin case is folded because the export writes `7UP` (sk-0070) and `7Up`
 *     (product-16) for the same drink, and the recipes carry `7UP`. Matching
 *     exactly would leave product-16 unpriced -- a silent hole in food cost.
 *
 *  ⭐ Whitespace collapses because several recipe names carry a trailing space
 *     (`مياه `) which is invisible in a UI and fatal in a join.
 *
 *  ⭐ Arabic is NOT folded beyond that. No diacritic stripping here: the export
 *     and the recipes are the same script for the same products, and a
 *     normaliser that folds hamza forms would merge two genuinely different
 *     products.
 */
export function normaliseProductName(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 *  Build the name -> recipe index.
 *
 *  Both `nameAr` and `nameEn` are indexed, because the export uses Arabic for
 *  two items (دلة كرك صغيرة / دلة كرك كبيرة) and Latin for the rest.
 */
export function buildRecipeIndex(recipes: readonly RecipeCostRow[]): RecipeIndex {
  const byName = new Map<string, RecipeCostRow>();
  const multi = new Map<string, Set<string>>();

  for (const r of recipes) {
    for (const name of [r.nameAr, r.nameEn]) {
      const k = normaliseProductName(name);
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, r);
      if (!multi.has(k)) multi.set(k, new Set());
      multi.get(k)!.add(r.id);
    }
  }

  const collisions = [...multi]
    .filter(([, ids]) => ids.size > 1)
    .map(([name, ids]) => ({ name, recipes: [...ids] }));

  return { byName, collisions, unused: [] };
}

// ── the one product the operator had to rule on ────────────────────────────

/**
 *  ⭐ Aliases the operator decided on, not guesses.
 *
 *  `product-3` appears in the export as "Areekah" on some days and "Areeka" on
 *  others: 16,214 units across the window, and the name join left 9,500 of them
 *  with no recipe. Confirmed by the operator as one product, so both spellings
 *  resolve to the same recipe.
 *
 *  Everything in this table is an explicit decision. Adding an entry here is how
 *  a new spelling gets taught; nothing resolves by fuzzy similarity, because a
 *  near-miss that silently merges two products moves money between them.
 */
export const PRODUCT_NAME_ALIASES: Readonly<Record<string, string>> = {
  areekah: 'areeka',
};

// ── resolving one row to a cost ────────────────────────────────────────────

export interface ResolvedRow {
  readonly recipe: RecipeCostRow | null;
  /** The name actually used for the lookup, after aliasing. */
  readonly lookupKey: string;
  /** Why a row could not be priced, when it could not. */
  readonly problem: 'no_recipe' | 'recipe_has_no_cost' | null;
}

/**  Find the recipe for one Foodics row, applying the operator's aliases. */
export function resolveRecipe(
  index: RecipeIndex,
  productName: string,
): ResolvedRow {
  const raw = normaliseProductName(productName);
  const aliased = PRODUCT_NAME_ALIASES[raw];
  const lookupKey = aliased ?? raw;

  const recipe = index.byName.get(lookupKey) ?? null;
  if (!recipe) return { recipe: null, lookupKey, problem: 'no_recipe' };
  if (!Number.isFinite(recipe.totalCalculatedCost)) {
    return { recipe, lookupKey, problem: 'recipe_has_no_cost' };
  }
  return { recipe, lookupKey, problem: null };
}

// ── aggregating ────────────────────────────────────────────────────────────

export interface CostTotals {
  quantity: number;
  /** Cost of the rows that could be priced. */
  cost: number;
  /** Rows with no recipe. */
  unpricedRows: number;
  unpricedQuantity: number;
  /** Distinct product names that could not be priced. */
  unpricedNames: Map<string, number>;
}

export function emptyTotals(): CostTotals {
  return {
    quantity: 0,
    cost: 0,
    unpricedRows: 0,
    unpricedQuantity: 0,
    unpricedNames: new Map(),
  };
}

/**
 *  Price a set of rows: cost = Foodics quantity x recipe cost.
 *
 *  ⛔ Quantity comes from the POS, not from anywhere near the recipe. The
 *     recipe decides what one unit costs; only the POS knows how many were
 *     sold. Mixing the two is how a food-cost percentage ends up measuring a
 *     number that never happened.
 *
 *  ⛔ An unpriced row contributes ZERO to the cost total and is COUNTED, so the
 *     caller can see that the total is incomplete. Silently skipping them makes
 *     food cost look better every time a link is missing, which is the exact
 *     direction a missing mapping pushes a number.
 */
export function priceRows(rows: readonly FoodicsRow[], index: RecipeIndex): CostTotals {
  const t: CostTotals = {
    quantity: 0,
    cost: 0,
    unpricedRows: 0,
    unpricedQuantity: 0,
    unpricedNames: new Map(),
  };

  for (const row of rows) {
    if (row.isTotal) continue;
    const qty = Number(row.qty) || 0;
    t.quantity += qty;

    const r = resolveRecipe(index, row.productName);
    if (!r.recipe) {
      t.unpricedRows++;
      t.unpricedQuantity += qty;
      const k = row.productName || '(blank)';
      t.unpricedNames.set(k, (t.unpricedNames.get(k) ?? 0) + qty);
      continue;
    }
    t.cost += qty * r.recipe.totalCalculatedCost;
  }

  return t;
}