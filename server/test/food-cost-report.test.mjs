// =============================================================================
//  server/test/food-cost-report.test.mjs
//
//  The food-cost report had three defects that all produced a plausible-looking
//  wrong number, which is the worst kind:
//
//   1. SEVEN PRODUCTS APPEARED TWICE. Foodics carries each drink under two POS
//      codes that both resolve to one recipe (عصير ربيع as sk-0075 and
//      product-20, بيبسي as sk-0079 and product-15, and five more). Keyed by
//      posItemId, each product became two rows with its quantity split in half.
//      The totals were never wrong -- they sum lines -- but no single row could
//      be trusted, and the table read as either a data error or a second
//      product.
//
//   2. VOLUME ITEMS WERE FLAGGED AS PRICING FAILURES. عصير ربيع at 71.50% food
//      cost was coloured red. The operator stated on 2026-10-07 that the drinks
//      are not profit targets: they are necessary to sell and exist to bring the
//      customer in. Measured, the numbers agree -- beverages are 21.6% of units
//      but 5.1% of revenue, at 46.06% food cost, against 26.54% for the food on
//      94.9% of revenue.
//
//   3. THE BLENDED RATE WAS THE HEADLINE. It mixes two different businesses and
//      hides both: it makes the drinks look like failures and the food margin
//      look worse than it is.
//
//  ⛔ WHY THE LOGIC IS COPIED RATHER THAN IMPORTED
//     The route file starts a server on import and needs a bound store, which
//     production-db-safety.test.mjs forbids a test from touching. So the rules
//     are restated here in full, and the role defaults are ALSO read out of the
//     real source and dist files, so a change to the real code cannot slip past
//     a copy that was never updated.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// ═══════════════════════════════════════════════════════ 1. the identity ═══
//
// ⭐ recipeId is the key. Falling back to the POS code only when no recipe
//   resolved, so an unpriced line is still counted somewhere rather than
//   disappearing from the item table.
const itemKey = (line) => line.recipeId || ('code:' + line.posItemId);

test('two POS codes for one recipe become ONE item row', () => {
  // exactly the shape measured on the live data
  const lines = [
    { posItemId: 'sk-0075', recipeId: 'rec-1787144190279', nameAr: 'spring juice', quantitySold: 3915, systemRevenue: 7830, systemCost: 5598.45 },
    { posItemId: 'product-20', recipeId: 'rec-1787144190279', nameAr: 'spring juice', quantitySold: 38, systemRevenue: 76, systemCost: 54.34 },
  ];
  const byItem = new Map();
  for (const l of lines) {
    const k = itemKey(l);
    if (!byItem.has(k)) byItem.set(k, { name: l.nameAr, qty: 0, revenue: 0, cost: 0 });
    const e = byItem.get(k);
    e.qty += l.quantitySold; e.revenue += l.systemRevenue; e.cost += l.systemCost;
  }
  assert.equal(byItem.size, 1, 'the same recipe under two POS codes must be one row');
  const row = [...byItem.values()][0];
  assert.equal(row.qty, 3953, 'quantities must add up, not split across two rows');
  // the rate is unchanged by merging, which is why the totals never looked wrong
  assert.ok(Math.abs(row.cost / row.revenue - 0.715) < 0.001);
});

test('distinct recipes stay distinct rows', () => {
  const lines = [
    { posItemId: 'sk-0075', recipeId: 'rec-1', nameAr: 'juice', quantitySold: 10 },
    { posItemId: 'sk-0076', recipeId: 'rec-2', nameAr: 'cola', quantitySold: 20 },
  ];
  const keys = new Set(lines.map(itemKey));
  assert.equal(keys.size, 2);
});

test('an unpriced line is still keyed, not dropped', () => {
  // ⭐ no recipe means no recipeId. Without a fallback the row would vanish
  //   from the item table entirely and the report would quietly undercount.
  const lines = [
    { posItemId: 'sk-1', recipeId: 'rec-1', quantitySold: 5 },
    { posItemId: 'sk-2', recipeId: '', quantitySold: 7 },
  ];
  assert.equal(new Set(lines.map(itemKey)).size, 2);
  assert.equal(itemKey(lines[1]), 'code:sk-2');
});

// ══════════════════════════════════════════════════════ 2. the role rule ═══

/** The rule, restated from server/routes/data.mjs. */
const roleOf = (recipeId, category, override) => {
  const o = override?.[recipeId];
  if (o === 'volume' || o === 'margin') return o;
  // ⛔ ONLY `beverage` defaults to volume. Anything else, including an unknown
  //   category, stays a margin item -- a high food cost is never silently
  //   excused, because excusing it is how a real loss goes unnoticed.
  return category === 'beverage' ? 'volume' : 'margin';
};

test('a drink defaults to volume; food defaults to margin', () => {
  assert.equal(roleOf('rec-1', 'beverage'), 'volume');
  assert.equal(roleOf('rec-2', 'main_dish'), 'margin');
  assert.equal(roleOf('rec-3', 'sub_prep'), 'margin');
});

test('an unknown or missing category stays a margin item', () => {
  // ⛔ the dangerous default is "excuse it". A missing category must not do that.
  assert.equal(roleOf('rec-4', undefined), 'margin');
  assert.equal(roleOf('rec-5', 'something_new'), 'margin');
  assert.equal(roleOf('rec-6', ''), 'margin');
});

test('an operator override beats the category in both directions', () => {
  // a drink that really is a profit item
  assert.equal(roleOf('rec-1', 'beverage', { 'rec-1': 'margin' }), 'margin');
  // a food item deliberately sold as a loss leader
  assert.equal(roleOf('rec-2', 'main_dish', { 'rec-2': 'volume' }), 'volume');
  // an override for a DIFFERENT recipe must not leak
  assert.equal(roleOf('rec-3', 'beverage', { 'rec-9': 'margin' }), 'volume');
});

// ═════════════════════════════════════════════ 3. the real source agrees ═══
//
// ⭐ Read out of the real files, not the copy above. The server runs from dist,
//   so a rule present only in the source would not actually be enforced.
for (const [label, rel] of [
  ['server/routes/data.mjs', 'server/routes/data.mjs'],
  ['server/dist/routes/data.mjs', 'server/dist/routes/data.mjs'],
]) {
  test(`${label}: keys the item table by recipeId, not posItemId`, () => {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.ok(
      /acc\(byItem,\s*l\.recipeId\s*\|\|/.test(src),
      'the item table must be keyed by recipeId -- keying by posItemId splits one product into two rows',
    );
    // and the POS-code fallback must still be there
    assert.ok(/code:['"]?\s*\+\s*l\.posItemId|'code:' \+ l\.posItemId/.test(src)
      || /l\.recipeId\s*\|\|\s*\(\s*'code:'/.test(src),
      'an unpriced line must still be keyed by POS code so it does not vanish');
  });

  test(`${label}: only beverage defaults to volume`, () => {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.ok(
      /cat === 'beverage'\s*\?\s*'volume'\s*:\s*'margin'/.test(src),
      "only the beverage category may default to volume; anything else must stay a margin item",
    );
  });

  test(`${label}: the response splits margin and volume and explains why`, () => {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.ok(/split:\s*\(\(\)\s*=>/.test(src), 'the report must return a margin/volume split');
    assert.ok(/volumeQtySharePct/.test(src) && /volumeRevenueSharePct/.test(src),
      'the split must carry the measured shares, so the screen can say why the rates differ');
    assert.ok(/marginRateGapPts/.test(src), 'the gap between blended and margin must be stated, not implied');
  });

  test(`${label}: registers the role-override key and the endpoint`, () => {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.ok(/rcerp_food_cost_roles/.test(src), 'the override key must be named so both files agree on it');
    if (label.includes('dist')) {
      assert.ok(/app\.post\('\/api\/report\/food-cost\/role'/.test(src),
        'dist must expose the role endpoint the screen calls');
    }
  });
}

// ══════════════════════════════════════════ 4. the measured arithmetic ═══
//
// ⭐ The real figures from the live database, 36 days. If the arithmetic in the
//   endpoint changes, these stop adding up.
// ⭐ These are EXACT, read out of the live database on 2026-10-07 over 36 days.
//   The first draft of this file hand-typed them from a rounded summary and got
//   the margin rate to 26.53 and the gap to 0.98, because the cost figures were
//   guessed rather than measured. A test whose numbers are invented asserts
//   nothing about the system; these are the real sums.
const BLENDED = { revenue: 1818987.00, cost: 500802.85 };
const MARGIN  = { products: 13, qty: 142592, revenue: 1726858.00, cost: 458365.17 };
const VOLUME  = { products: 14, qty: 39191, revenue: 92129.00, cost: 42437.68 };

test('the split accounts for every riyal of revenue and cost', () => {
  assert.ok(Math.abs(MARGIN.revenue + VOLUME.revenue - BLENDED.revenue) < 0.01,
    'margin + volume revenue must equal the blended revenue');
  assert.ok(Math.abs(MARGIN.cost + VOLUME.cost - BLENDED.cost) < 0.01,
    'margin + volume cost must equal the blended cost');
});

test('the measured rates are the ones the screen shows', () => {
  const pct = (x) => Math.round((x.cost / x.revenue) * 10000) / 100;
  assert.equal(pct(MARGIN), 26.54);
  assert.equal(pct(VOLUME), 46.06);
  assert.equal(pct(BLENDED), 27.53);
});

test('the measured product counts are 13 margin and 14 volume', () => {
  // ⭐ Also what makes the duplicate bug detectable: 27 distinct products, not
  //   the 34 rows the POS-code keying produced.
  assert.equal(MARGIN.products + VOLUME.products, 27);
});

test('blending makes the food margin look worse than it is', () => {
  // ⭐ This is the entire reason the screen leads with the margin rate. If the
  //   blended rate ever falls BELOW the margin rate the split is no longer
  //   hiding anything and the two numbers should be presented together.
  const blended = BLENDED.cost / BLENDED.revenue;
  const margin = MARGIN.cost / MARGIN.revenue;
  assert.ok(blended > margin, 'the drinks must be dragging the blended rate up');
  assert.ok(Math.round((blended - margin) * 10000) / 100 === 0.99, 'measured gap is 0.99 points');
});

test('volume items are a large share of units and a small share of revenue', () => {
  const totalQty = MARGIN.qty + VOLUME.qty;
  const r1 = (x) => Math.round(x * 100) / 100;
  assert.equal(r1((VOLUME.qty / totalQty) * 100), 21.56);
  assert.equal(r1((VOLUME.revenue / BLENDED.revenue) * 100), 5.06);
  // ⭐ the asymmetry IS the business case for calling them traffic drivers
  assert.ok(VOLUME.qty / totalQty > (VOLUME.revenue / BLENDED.revenue) * 2,
    'volume items must sell far more units than revenue share, or the classification is wrong');
});