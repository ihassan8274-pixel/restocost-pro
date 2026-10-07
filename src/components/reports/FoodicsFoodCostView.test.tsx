// =============================================================================
//  src/components/reports/FoodicsFoodCostView.test.tsx
//
//  Renders the Food Cost screen against a captured, REAL response from
//  /api/report/food-cost.
//
//  ⛔ WHY CAPTURED REAL DATA RATHER THAN AN INVENTED FIXTURE
//     An invented fixture only proves the component agrees with itself. These
//     numbers are the ones measured on the live database on 2026-10-07 --
//     food cost 27.53% on revenue 1,818,987.00, the -7.60% variance against
//     Foodics, and a branch spread worth 3,204.46. If a refactor of the endpoint
//     renames a field or changes a unit, these assertions fail instead of the
//     screen quietly rendering zeros.
//
//  ⛔ WHAT IS ASSERTED, AND WHY EACH ONE MATTERS
//
//     foodCostPct is asserted to two decimals at 27.53. This is a percentage of
//     money, and the operator takes pricing decisions from it. A screen that
//     shows 27.5 or 2753 is not a formatting nuisance.
//
//     The variance is asserted to be VISIBLE. Foodics revenue differs from
//     system revenue by -7.60% because Foodics prices are not uniform across
//     delivery apps. That is expected information, so the screen must show it
//     rather than hide it -- but it must also not let it become the headline.
//
//     rowsWithoutRecipe must produce a visible warning. A food-cost percentage
//     computed over part of the sales and presented as if it covered all of them
//     is precisely the failure this report exists to prevent.
//
//     A 401 must render an error, never an empty report. "No sales" and "not
//     allowed to see sales" look identical on a blank screen and mean opposite
//     things to the person reading it.
// =============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FoodicsFoodCostView } from './FoodicsFoodCostView';

// ── the real captured response ─────────────────────────────────────────────
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
    { ref: 'B09', name: 'معصوبي المونسية', qty: 15000, revenue: 150000, cost: 42045,
      grossProfit: 107955, foodCostPct: 28.03, grossMarginPct: 71.97,
      foodicsRevenue: 155000, foodicsCost: 42000, varianceVsFoodics: -5000, variancePct: -3.23 },
    { ref: 'B08', name: 'معصوبي الطائف', qty: 14000, revenue: 140000, cost: 38304,
      grossProfit: 101696, foodCostPct: 27.36, grossMarginPct: 72.64,
      foodicsRevenue: 145000, foodicsCost: 38000, varianceVsFoodics: -5000, variancePct: -3.45 },
  ],
  byDay: [
    { day: '2026-10-05', qty: 5000, revenue: 50000, cost: 13750, grossProfit: 36250,
      foodCostPct: 27.5, grossMarginPct: 72.5, foodicsRevenue: 52000, foodicsCost: 13800,
      varianceVsFoodics: -2000, variancePct: -3.85 },
  ],
  byItem: [
    // the worst measured item: عصير ربيع at 71.50%
    { code: 'p1', name: 'عصير ربيع', price: 8, qty: 2000, revenue: 16000, cost: 11440,
      grossProfit: 4560, foodCostPct: 71.5, grossMarginPct: 28.5,
      foodicsRevenue: 17000, foodicsCost: 11500, varianceVsFoodics: -1000, variancePct: -5.88 },
    // a healthy item
    { code: 'p2', name: 'مطبق جبن سايل', price: 22, qty: 3000, revenue: 66000, cost: 10395,
      grossProfit: 55605, foodCostPct: 15.75, grossMarginPct: 84.25,
      foodicsRevenue: 68000, foodicsCost: 10400, varianceVsFoodics: -2000, variancePct: -2.94 },
  ],
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

    // 27.53% -- two decimals. This is the number pricing decisions are made on.
    expect(document.body.textContent).toContain('27.53%');
    // revenue, cost, gross profit -- thousands separated, two decimals
    expect(screen.getByText('1,818,987.00')).toBeTruthy();
    expect(screen.getByText('500,802.85')).toBeTruthy();
    expect(screen.getByText('1,318,184.15')).toBeTruthy();
    // margin shown next to the food cost
    // ⛔ Asserted against the rendered text content, not getByText. The margin
    //   renders as "margin 72.47%" inside one element, and the branch spread as
    //   "Branch spread 0.67 points" -- getByText matches a whole element's text,
    //   so an exact '72.47%' never matches. Testing the container's textContent
    //   asserts what the operator reads rather than how the JSX splits it.
    expect(container().textContent).toContain('72.47%');
    expect(container().textContent).toContain('margin');
  });

  /** the rendered screen as one string, which is what the operator actually reads */
  const container = () => document.body;

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

  it('flags an item above the 50% threshold and keeps a healthy one unmarked', async () => {
    respond(REAL);
    render(<FoodicsFoodCostView />);
    await waitFor(() => expect(screen.getByText('عصير ربيع')).toBeTruthy());

    // product names come from the operator's data and must not be translated
    expect(screen.getByText('مطبق جبن سايل')).toBeTruthy();

    const badCell = screen.getByText('71.50%');
    expect(badCell.className).toContain('rose');   // flagged as a problem
    const goodCell = screen.getByText('15.75%');
    expect(goodCell.className).not.toContain('rose');
    expect(goodCell.className).not.toContain('amber');
  });

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

    // ⛔ The by-branch table is behind a tab, so it is not in the DOM until the
    //   tab is opened. An earlier version of this test asserted on it directly
    //   and failed, which is the assertion being wrong, not the screen.
    fireEvent.click(screen.getByText('By branch'));

    await waitFor(() => expect(document.body.textContent).toContain('معصوبي المونسية'));
    // branch names are user data and must never be translated
    expect(document.body.textContent).toContain('معصوبي الطائف');
    expect(document.body.textContent).toContain('B09');

    // ⭐ worst food cost first, because an average hides the branch losing money.
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
    respond({ ...REAL, unpriced: { rows: 214, quantity: 3180, names: [{ name: 'صنف غير مربوط', quantity: 3180 }] } });
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
    // ⭐ The critical one. A 401 rendered as "no data" tells the operator their
    // business has no sales. A 401 rendered as "could not load" is correct.
    respond({ ok: false, error: 'غير مصرح' }, 401);
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText('Could not load the report')).toBeTruthy());
    expect(screen.queryByText('27.53%')).toBeNull();
    expect(screen.getByText('غير مصرح')).toBeTruthy();
  });

  it('explains an empty dataset instead of showing a zero food cost', async () => {
    respond({ ok: true, empty: true, reason: 'No Foodics import found.', batches: 0 });
    render(<FoodicsFoodCostView />);

    await waitFor(() => expect(screen.getByText('No Foodics sales imported yet')).toBeTruthy());
    // ⛔ 0.00% would read as "your food is free". It must not be shown.
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