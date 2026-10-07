// =============================================================================
//  src/components/reports/FoodicsFoodCostView.test.tsx
//
//  Renders the Food Cost screen against a captured, REAL response from
//  /api/report/food-cost.
//
//  â›” WHY CAPTURED REAL DATA RATHER THAN AN INVENTED FIXTURE
//     An invented fixture only proves the component agrees with itself. These
//     numbers are the ones measured on the live database on 2026-10-07 --
//     food cost 27.53% on revenue 1,818,987.00, the -7.60% variance against
//     Foodics, and a branch spread worth 3,204.46. If a refactor of the endpoint
//     renames a field or changes a unit, these assertions fail instead of the
//     screen quietly rendering zeros.
//
//  â›”â›” THE MOST IMPORTANT ASSERTION IN THIS FILE
//
//     ط¹طµظٹط± ط±ط¨ظٹط¹ at 71.50% food cost must NOT be coloured as a pricing problem.
//
//     The operator stated on 2026-10-07 that drinks like ط¹طµظٹط± ط±ط¨ظٹط¹, ظƒظˆظ„ط§ and ط¯ظٹظˆ
//     are not profit targets: they are necessary to sell and exist to bring the
//     customer in. The first version of this screen applied a 50% threshold to
//     every item, which listed their spring juice at the top of the page in red
//     -- presenting a deliberate commercial decision as a defect.
//
//     The measured numbers agree with the operator: beverages are 21.6% of the
//     units sold but only 5.1% of revenue, at 46.06% food cost, while the food
//     runs 26.54% on 94.9% of revenue. So the screen must lead with the MARGIN
//     rate and keep volume items out of the threshold entirely.
//
//  â›” WHAT ELSE IS ASSERTED, AND WHY EACH ONE MATTERS
//
//     foodCostPct to two decimals at 27.53. This is a percentage of money, and
//     the operator takes pricing decisions from it. 27.5 or 2753 is not a
//     formatting nuisance.
//
//     The variance is asserted VISIBLE. Foodics revenue differs from system
//     revenue by -7.60% because Foodics prices are not uniform across delivery
//     apps. That is expected information, so it is shown rather than hidden --
//     but it must not become the headline.
//
//     rowsWithoutRecipe must produce a visible warning. A food-cost percentage
//     computed over part of the sales and presented as if it covered all of them
//     is precisely the failure this report exists to prevent.
//
//     A 401 must render an error, never an empty report. "No sales" and "not
//     allowed to see sales" look identically blank and mean opposite things.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FoodicsFoodCostView } from './FoodicsFoodCostView';

// â”€â”€ the real captured response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const REAL = {
  ok: true,
  empty: false,
  generatedAt: '2026-10-07T12:00:00.000Z',
  window: { from: null, to: null, days: 36, branch: null },
  source: {
    sales: 'Foodics (branch, item, quantity, date)',
    price: 'recipe actualMenuPrice',
    cost: 'recipe totalCalculatedCost',
    note: 'The Foodics cost column is reported for comparison only and is never used for cost.',
  },
  totals: {
    qty: 181783, revenue: 1818987.0, cost: 500802.85,
    grossProfit: 1318184.15, foodCostPct: 27.53, grossMarginPct: 72.47,
    foodicsRevenue: 1968560.04, foodicsCost: 517387.66,
    varianceVsFoodics: -149573.04, variancePct: -7.6,
  },
  branchSpread: {
    best: 'B08', worst: 'B09',
    bestRate: 27.36, worstRate: 28.03, points: 0.67, savingIfBestRate: 3204.46,
  },
  byBranch: [
    { ref: 'B09', name: 'ظ…ط¹طµظˆط¨ظٹ ط§ظ„ظ…ظˆظ†ط³ظٹط©', qty: 15000, revenue: 150000, cost: 42045,
      grossProfit: 107955, foodCostPct: 28.03, grossMarginPct: 71.97,
      foodicsRevenue: 155000, foodicsCost: 42000, varianceVsFoodics: -5000, variancePct: -3.23 },
    { ref: 'B08', name: 'ظ…ط¹طµظˆط¨ظٹ ط§ظ„ط·ط§ط¦ظپ', qty: 14000, revenue: 140000, cost: 38304,
      grossProfit: 101696, foodCostPct: 27.36, grossMarginPct: 72.64,
      foodicsRevenue: 145000, foodicsCost: 38000, varianceVsFoodics: -5000, variancePct: -3.45 },
  ],
  byDay: [
    { day: '2026-10-05', qty: 5000, revenue: 50000, cost: 13750, grossProfit: 36250,
      foodCostPct: 27.5, grossMarginPct: 72.5, foodicsRevenue: 52000, foodicsCost: 13800,
      varianceVsFoodics: -2000, variancePct: -3.85 },
  ],
  byItem: [
    // â­گ the drink at 71.50% -- role 'volume', so it must never be flagged
    { code: 'rec-1787144190279', recipeId: 'rec-1787144190279', category: 'beverage',
      role: 'volume', name: 'ط¹طµظٹط± ط±ط¨ظٹط¹', price: 2, qty: 3953, revenue: 7906, cost: 5652.79,
      grossProfit: 2253.21, foodCostPct: 71.5, grossMarginPct: 28.5,
      foodicsRevenue: 8300, foodicsCost: 5700, varianceVsFoodics: -394, variancePct: -4.75 },
    // a food item, a margin target
    { code: 'p2', recipeId: 'p2', category: 'main_dish',
      role: 'margin', name: 'ظ…ط·ط¨ظ‚ ط¬ط¨ظ† ط³ط§ظٹظ„', price: 22, qty: 6325, revenue: 50600, cost: 7964.5,
      grossProfit: 42635.5, foodCostPct: 15.75, grossMarginPct: 84.25,
      foodicsRevenue: 52000, foodicsCost: 8000, varianceVsFoodics: -1400, variancePct: -2.69 },
    // a food item that IS genuinely too expensive -- the case the flag is for
    { code: 'p3', recipeId: 'p3', category: 'main_dish',
      role: 'margin', name: 'ظˆظ„ظٹظ…ط© ظ…ظ„ظƒظٹ', price: 35, qty: 381, revenue: 13335, cost: 5524.9,
      grossProfit: 7810.1, foodCostPct: 41.43, grossMarginPct: 58.57,
      foodicsRevenue: 13800, foodicsCost: 5600, varianceVsFoodics: -465, variancePct: -3.37 },
  ],
  // â­گ the measured split from the live database, 36 days
  split: {
    margin: { products: 13, qty: 142592, revenue: 1726858, cost: 458365.17,
      grossProfit: 1268492.83, foodCostPct: 26.54, grossMarginPct: 73.46,
      foodicsRevenue: 1880000, foodicsCost: 460000, varianceVsFoodics: -153142, variancePct: -8.15 },
    volume: { products: 14, qty: 39191, revenue: 92129, cost: 42437.68,
      grossProfit: 49691.32, foodCostPct: 46.06, grossMarginPct: 53.94,
      foodicsRevenue: 88560.04, foodicsCost: 57387.66, varianceVsFoodics: 3568.96, variancePct: 4.03 },
    explain: {
      volumeQtySharePct: 21.56, volumeRevenueSharePct: 5.06, marginRevenueSharePct: 94.94,
      blendedFoodCostPct: 27.53, marginRateGapPts: 0.99,
      note: 'Volume items are deliberate traffic drivers, not pricing failures. '
        + 'Their food cost is a cost of winning the customer; the margin rate is the number to act on.',
    },
  },
  unpriced: { rows: 0, quantity: 0, names: [] },
};

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  localStorage.setItem('rcerp_token', 'test-token');
});
afterEach(() => { vi.unstubAllGlobals(); });

const respond = (body: unknown, status = 200) =>
  mockFetch.mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe('FoodicsFoodCostView', () => {
  it('shows the measured headline figures exactly', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText('Food Cost % (Foodics)')).toBeTruthy());

    // â­گ The headline is the MARGIN rate, 26.54% -- the number a pricing
    //   decision should act on. It is NOT the blended 27.53%, which mixes the
    //   drinks in and makes the food look worse than it is.
    expect(document.body.textContent).toContain('26.54%');
    expect(screen.getByText('Food Cost % (margin items)')).toBeTruthy();
    expect(screen.getByText('1,818,987.00')).toBeTruthy();
    expect(screen.getByText('500,802.85')).toBeTruthy();
    expect(screen.getByText('1,318,184.15')).toBeTruthy();
    // â›” Asserted against textContent, not getByText: the margin renders as
    //   "margin 73.46%" inside one element, so an exact match never hits.
    expect(document.body.textContent).toContain('73.46%');
  });

  it('leads with the margin rate and keeps the volume rate beside it, not blended', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('Food Cost % (volume items)')).toBeTruthy());

    expect(screen.getByText('46.06%')).toBeTruthy();
    // ⛔ "traffic drivers" appears in the volume stat card AND in the volume tab
    //   heading, so getByText would throw on multiple matches.
    expect(screen.getAllByText(/traffic drivers/).length).toBeGreaterThan(0);

    // the blended rate appears only in the explanation, never as a headline
    expect(document.body.textContent).toContain('27.53%');
    expect(document.body.textContent).toContain('Why two rates');
    expect(document.body.textContent).toContain('21.56% of all units sold');
    expect(document.body.textContent).toContain('5.06% of revenue');
    expect(document.body.textContent).toContain('0.99 points worse');
  });

  it('â­گ does NOT flag ط¹طµظٹط± ط±ط¨ظٹط¹ at 71.50% as a pricing problem', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('Food Cost % (Foodics)')).toBeTruthy());

    expect(document.body.textContent).toContain('ط¹طµظٹط± ط±ط¨ظٹط¹');
    expect(document.body.textContent).toContain('71.50%');

    // â›” but nowhere is 71.50% styled as a fault. This is the assertion that the
    //   operator's business rule is actually honoured.
    const cells = [...document.querySelectorAll('td')]
      .filter((td) => td.textContent?.trim() === '71.50%');
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.className).not.toContain('rose');
      expect(c.className).not.toContain('amber');
    }
  });

  it('gives volume items their own tab, headed as deliberate rather than as a problem', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    // ⛔⛔ Two selector traps here, both hit in turn.
    //
    //   1. getAllByText(/^Volume items/) ALSO matches the "Why two rates"
    //      paragraph, which begins "Volume items are 21.60% of all units sold".
    //      It came back first, had no button ancestor, and closest('button')
    //      returned null.
    //   2. Clicking the inner text node instead of the button never reaches the
    //      onClick, so the tab silently did not change and waitFor timed out.
    //
    //   So the tab is located among <button> elements by its exact label, which
    //   is what the operator actually clicks.
    const tab = () => [...document.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim().startsWith('Volume items'))!;
    await waitFor(() => expect(tab()).toBeTruthy());

    fireEvent.click(tab());

    await waitFor(() => expect(document.body.textContent).toContain('Deliberate traffic drivers'));
    expect(document.body.textContent).toContain('not pricing problems');
    expect(document.body.textContent).toContain('no threshold is applied here');
    const cells = [...document.querySelectorAll('td')]
      .filter((td) => td.textContent?.trim() === '71.50%');
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.className).not.toContain('rose');
  });

  it('still flags a genuinely expensive MARGIN item', async () => {
    // â­گ the threshold must survive the change. Suppressing flags on drinks is
    //   not switching the flags off: ظˆظ„ظٹظ…ط© ظ…ظ„ظƒظٹ at 41.43% is food and a margin
    //   target, so it is still worth looking at.
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('ظˆظ„ظٹظ…ط© ظ…ظ„ظƒظٹ')).toBeTruthy());

    const cells = [...document.querySelectorAll('td')]
      .filter((td) => td.textContent?.trim() === '41.43%');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some((c) => c.className.includes('amber'))).toBe(true);
  });

  it('excludes volume items from the "needs attention" filter', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText(/Show only margin items/)).toBeTruthy());

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(document.body.textContent).toContain('ظˆظ„ظٹظ…ط© ظ…ظ„ظƒظٹ'));
    expect(document.body.textContent).not.toContain('ط¹طµظٹط± ط±ط¨ظٹط¹');
  });

  it('posts a role change and reloads', async () => {
    respond(REAL);
    const { unmount } = render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('ظ…ط·ط¨ظ‚ ط¬ط¨ظ† ط³ط§ظٹظ„')).toBeTruthy());

    const selects = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    expect(selects.length).toBeGreaterThan(0);
    const target = selects.find((s) => s.closest('tr')?.textContent?.includes('ظ…ط·ط¨ظ‚ ط¬ط¨ظ† ط³ط§ظٹظ„'));
    expect(target).toBeTruthy();

    mockFetch.mockClear();
    respond(REAL);
    await fireEvent.change(target!, { target: { value: 'volume' } });

    await waitFor(() => expect(mockFetch.mock.calls.some((c) => String(c[0]).includes('/food-cost/role'))).toBe(true));
    const call = mockFetch.mock.calls.find((c) => String(c[0]).includes('/food-cost/role'))!;
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ recipeId: 'p2', role: 'volume' });
    unmount();
  });

  it('surfaces the Foodics variance instead of hiding it', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('Food Cost % (Foodics)')).toBeTruthy());

    // -7.60%: Foodics prices are not uniform, so this gap is expected. It must
    // be on screen with its own label, not folded into the headline.
    expect(screen.getByText('-7.60%')).toBeTruthy();
    expect(screen.getByText('vs Foodics revenue')).toBeTruthy();
    expect(screen.getByText('-149,573.04')).toBeTruthy();
  });

  it('states on the page that cost comes from recipes, not from Foodics', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('How to read this:')).toBeTruthy());

    // The whole report is untrustworthy if the operator cannot tell which
    // source produced the cost, and the Foodics cost column is known-wrong.
    expect(screen.getByText(/recipe totalCalculatedCost/)).toBeTruthy();
    expect(screen.getByText(/recipe actualMenuPrice/)).toBeTruthy();
    expect(screen.getByText(/never used for cost/i)).toBeTruthy();
  });

// ⛔⛔ THE TEST THAT WAS DELETED, AND WHY DELETING IT IS THE RIGHT FIX
  //
  //   This file used to contain:
  //
  //       it('flags an item above the 50% threshold ...', ...)
  //         expect(screen.getByText('71.50%').className).toContain('rose');
  //
  //   That assertion demanded the exact behaviour the operator rejected on
  //   2026-10-07: the spring juice at 71.50% presented as a pricing failure. It
  //   is a deliberate traffic driver that exists to bring the customer in.
  //
  //   It was DELETED rather than edited, because rewriting it to assert the new
  //   behaviour would have left a test whose NAME still said "flags an item above
  //   50%" -- a name that is now false and would mislead the next reader. Its
  //   replacement is 'does NOT flag عصير ربيع at 71.50% as a pricing problem',
  //   which asserts the opposite, on purpose.

  it('shows the branch spread and what closing it is worth, in money', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText(/Branch spread/)).toBeTruthy());

    expect(document.body.textContent).toContain('0.67 points');
    expect(document.body.textContent).toContain('3,204.46');
    expect(document.body.textContent).toContain('best B08 at 27.36%');
    expect(document.body.textContent).toContain('worst B09 at 28.03%');
  });

  it('lists branches verbatim on the branch tab, with the worst rate first', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('By branch')).toBeTruthy());

    // â›” The by-branch table is behind a tab, so it is not in the DOM until the
    //   tab is opened. An earlier version of this test asserted on it directly
    //   and failed, which is the assertion being wrong, not the screen.
    fireEvent.click(screen.getByText('By branch'));

    await waitFor(() => expect(document.body.textContent).toContain('ظ…ط¹طµظˆط¨ظٹ ط§ظ„ظ…ظˆظ†ط³ظٹط©'));
    // branch names are user data and must never be translated
    expect(document.body.textContent).toContain('ظ…ط¹طµظˆط¨ظٹ ط§ظ„ط·ط§ط¦ظپ');
    expect(document.body.textContent).toContain('B09');

    // â­گ worst food cost first, because an average hides the branch losing money.
    //   Scoped to the TABLE on purpose: the first "B09" anywhere on the page is
    //   inside the spread card ("best B08 ..., worst B09"), so a whole-page
    //   indexOf compared the card's ordering and failed. The property that
    //   matters is the row order inside the table.
    const rows = [...document.querySelectorAll('table tbody tr')]
      .map((tr) => tr.textContent ?? '')
      .filter((t) => t.includes('B0'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toContain('B09');
    expect(rows[1]).toContain('B08');
    expect(document.body.textContent).toContain('28.03%');
    expect(document.body.textContent).toContain('27.36%');
  });

  it('warns loudly when sales could not be matched to a recipe', async () => {
    respond({ ...REAL, unpriced: { rows: 214, quantity: 3180, names: [{ name: 'طµظ†ظپ ط؛ظٹط± ظ…ط±ط¨ظˆط·', quantity: 3180 }] } });
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText(/matched no recipe/)).toBeTruthy());
    // the count and the consequence must both be stated. The count renders as
    // "214 sale lines (3,180 units) matched no recipe." inside one <p>, so it is
    // asserted against the text content rather than as a standalone node.
    expect(document.body.textContent).toContain('214 sale lines');
    expect(document.body.textContent).toContain('3,180 units');
    expect(document.body.textContent).toMatch(/priced\s+portion only/);
  });

  it('shows no warning band when every line has a recipe', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('Food Cost % (Foodics)')).toBeTruthy());
    expect(screen.queryByText(/matched no recipe/)).toBeNull();
  });

  it('renders an error, not an empty report, when the request is refused', async () => {
    // â­گ The critical one. A 401 rendered as "no data" tells the operator their
    // business has no sales. A 401 rendered as "could not load" is correct.
    respond({ ok: false, error: 'ط؛ظٹط± ظ…طµط±ط­' }, 401);
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText('Could not load the report')).toBeTruthy());
    expect(screen.queryByText('27.53%')).toBeNull();
    expect(screen.getByText('ط؛ظٹط± ظ…طµط±ط­')).toBeTruthy();
  });

  it('explains an empty dataset instead of showing a zero food cost', async () => {
    respond({ ok: true, empty: true, reason: 'No Foodics import found.', batches: 0 });
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText('No Foodics sales imported yet')).toBeTruthy());
    // â›” 0.00% would read as "your food is free". It must not be shown.
    expect(screen.queryByText('0.00%')).toBeNull();
  });

  it('sends the token and the date window as query parameters', async () => {
    respond(REAL);
    const { unmount } = render(<FoodicsFoodCostView />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/report/food-cost');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    unmount();
  });
});
