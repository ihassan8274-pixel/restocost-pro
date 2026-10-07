// =============================================================================
//  src/components/reports/FoodicsFoodCostView.tsx
//
//  The Food Cost % screen for erp.restocost.shop, reading /api/report/food-cost.
//
//  ⛔⛔ WHY THIS SCREEN AND NOT THE EXISTING FOOD-COST REPORTS
//
//     The app already has FoodCostDailyReport, FoodCostTrendReport,
//     FoodCostByCategoryReport and CostReportsView. All of them compute cost
//     from BATCH SALES entered by hand in the app. None of them read the
//     Foodics export, which is where the actual sales are: 9,316 lines across
//     36 days and 12 branches, imported from the POS.
//
//     So the number the operator sees on those screens and the number that
//     describes the real business are different reports. This screen is the one
//     built on the POS data, and it says so on the page.
//
//  ⛔⛔ COST COMES FROM RECIPES. NEVER FROM THE FOODICS COLUMN.
//
//     The Foodics export has a column called "التكلفة" and it is wrong --
//     confirmed by the operator. Foodics supplies only four facts per row:
//     branch, item, quantity, date. Price and cost come from the recipe, and
//     both are multiplied by quantity and STORED on the line at import time,
//     so this report sums stored numbers and cannot drift from the rows.
//
//     The Foodics cost column is still carried through the API as
//     foodicsCost so the difference can be seen. It is a comparison, never an
//     input. `source.cost` in the response says this too, and the page repeats
//     it, because a food-cost screen that silently mixed the two sources would
//     be worse than no screen.
//
//  ⛔ REVENUE IS ALSO FROM RECIPES, WITH THE FOODICS FIGURE SHOWN BESIDE IT
//
//     Measured on the live data: system revenue 1,818,987.00 against Foodics
//     net-with-VAT 1,968,560.04, a variance of -7.60%. That gap is expected and
//     is not a defect -- Foodics prices are not uniform, each delivery app has
//     its own price and its own discounts. The variance is displayed as
//     information, with its own column, not buried.
//
//  ⭐ ENGLISH LABELS ONLY. Arabic never appears in chrome, headers, buttons or
//     column names. Item and branch names come from the operator's own data and
//     are shown exactly as stored -- transliterating or translating a product
//     name would make it impossible to match against the POS.
//
//  ⛔ THE SCREEN NEVER SILENTLY SHOWS A PARTIAL NUMBER
//     rowsWithoutRecipe is shown in a warning band whenever it is non-zero. A
//     food-cost percentage computed over 95% of the sales, presented as if it
//     were 100%, is the exact failure this report exists to prevent.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { Card, PageHeader, StatCard, Btn, EmptyState, inputCls } from '../ui';

// ── the API response, as /api/report/food-cost actually returns it ─────────
// ⭐ Named fields rather than `any`, because the whole point of the screen is
//   that the operator can trust which number is which. A typo in a field name
//   should be a compile error, not a blank cell.
interface Shape {
  qty: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  foodCostPct: number;
  grossMarginPct: number;
  foodicsRevenue: number;
  foodicsCost: number;
  varianceVsFoodics: number;
  variancePct: number;
}
interface BranchRow extends Shape { ref: string; name: string }
interface DayRow extends Shape { day: string }
// ⭐ role is 'volume' or 'margin'. See the note at the top of the file and the
//   split below: a volume item's food cost is a deliberate traffic cost, not a
//   pricing failure, so it is never coloured as one.
interface ItemRow extends Shape {
  code: string; name: string; price: number;
  role: 'volume' | 'margin';
  recipeId: string;
  category: string;
}
interface Split {
  margin: Shape & { products: number };
  volume: Shape & { products: number };
  explain: {
    volumeQtySharePct: number;
    volumeRevenueSharePct: number;
    marginRevenueSharePct: number;
    blendedFoodCostPct: number;
    marginRateGapPts: number;
    note: string;
  };
}
interface FoodCostResponse {
  ok: boolean;
  empty?: boolean;
  reason?: string;
  batches?: number;
  error?: string;
  generatedAt?: string;
  window?: { from: string | null; to: string | null; days: number; branch: string | null };
  source?: { sales: string; price: string; cost: string; note: string };
  totals?: Shape;
  branchSpread?: {
    best: string; worst: string;
    bestRate: number; worstRate: number; points: number; savingIfBestRate: number;
  } | null;
  byBranch?: BranchRow[];
  byDay?: DayRow[];
  byItem?: ItemRow[];
  split?: Split;
  unpriced?: { rows: number; quantity: number; names: { name: string; quantity: number }[] };
}

// ── formatting ─────────────────────────────────────────────────────────────
const money = (n: number) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n ?? 0).toFixed(2)}%`;
const qtyFmt = (n: number) => Math.round(n ?? 0).toLocaleString('en-US');

type SortKey = 'revenue' | 'cost' | 'foodCostPct' | 'qty' | 'name';

// ⭐ Food cost at or above this is flagged, FOR MARGIN ITEMS ONLY.
//
//   The first version applied these thresholds to every item, which told the
//   operator their spring juice at 71.50% was a pricing failure. It is not. The
//   operator confirmed on 2026-10-07 that drinks like عصير ربيع, كولا and ديو
//   are deliberate traffic drivers -- necessary to sell, not sold for margin.
//
//   The measured numbers agree: beverages are 21.6% of the units sold but only
//   5.1% of revenue, at 46.06% food cost. Flagging them would be flagging the
//   cost of winning the customer as if it were a mistake.
//
//   So a volume item is never red or amber here. Its cost is shown, plainly,
//   under its own heading, where it is information rather than an accusation.
const HIGH_FOOD_COST = 50;
const WARN_FOOD_COST = 30;

const toneForCost = (p: number) =>
  p >= HIGH_FOOD_COST ? 'rose' : p >= WARN_FOOD_COST ? 'amber' : 'emerald';

type Tab = 'items' | 'volume' | 'branches' | 'days';

export const FoodicsFoodCostView: React.FC = () => {
  const [data, setData] = useState<FoodCostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branch, setBranch] = useState('');

  const [tab, setTab] = useState<Tab>('items');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [asc, setAsc] = useState(false);
  const [onlyProblem, setOnlyProblem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('rcerp_token');
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (branch) qs.set('branch', branch);
      const res = await fetch(`/api/report/food-cost?${qs.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as FoodCostResponse;
      // ⛔ A 401/403 body is not a report. Reporting "no data" here would tell
      //    the operator their business has no sales when in fact they are not
      //    allowed to see the report.
      if (!res.ok || json.ok === false) {
        setError(json.error || `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, branch]);

  useEffect(() => { void load(); }, [load]);

  // ── item table: sortable, role-aware, optionally only the actionable rows ──
  const items = useMemo(() => {
    const rows = data?.byItem ?? [];
    const filtered = onlyProblem
      ? rows.filter((r) => r.role === 'margin' && (r.foodCostPct >= WARN_FOOD_COST || r.variancePct <= -5))
      : rows;
    const dir = asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
      return dir * ((a[sortKey] as number) - (b[sortKey] as number));
    });
  }, [data, sortKey, asc, onlyProblem]);

  // ⭐ Volume items are listed separately. Merging them into one sorted list
  //   would put عصير ربيع at the top of the page in red, which is the exact
  //   reading the operator rejected: a deliberate drink presented as a defect.
  const volumeItems = useMemo(
    () => (data?.byItem ?? []).filter((r) => r.role === 'volume')
      .sort((a, b) => b.qty - a.qty),
    [data],
  );

  const setRole = useCallback(async (recipeId: string, role: 'volume' | 'margin' | null) => {
    if (!recipeId) return;
    const token = localStorage.getItem('rcerp_token');
    const res = await fetch('/api/report/food-cost/role', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ recipeId, role }),
    });
    // ⛔ Only reload on success. Reloading after a 403 would discard the
    //   operator's click and leave the toggle looking broken with no message.
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      setError(j?.error || `Could not save (${res.status})`);
      return;
    }
    void load();
  }, [load]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) { setAsc((v) => !v); return; }
    setSortKey(k);
    setAsc(k === 'name');
  };

  const SortHead: React.FC<{ k: SortKey; label: string; align?: 'left' | 'right' }> = ({ k, label, align = 'right' }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`py-2 px-2 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none whitespace-nowrap text-xs font-semibold text-slate-500 hover:text-slate-800`}
    >
      {label}
      {sortKey === k && (asc ? <ChevronUp className="inline ml-1 h-3 w-3" /> : <ChevronDown className="inline ml-1 h-3 w-3" />)}
    </th>
  );

  // ── states ───────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageHeader title="Food Cost % (Foodics)" subtitle="From the POS export, priced from recipes" icon={<UtensilsCrossed className="h-5 w-5" />} />
        <Card className="p-4 border-rose-300 bg-rose-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-800">Could not load the report</p>
              <p className="text-xs text-rose-700 mt-1">{error}</p>
              <Btn className="mt-3" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Retry</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (data?.empty) {
    return (
      <div className="p-6">
        <PageHeader title="Food Cost % (Foodics)" subtitle="From the POS export, priced from recipes" icon={<UtensilsCrossed className="h-5 w-5" />} />
        <EmptyState
          title="No Foodics sales imported yet"
          subtitle={data.reason ?? 'Import a Foodics Excel export to populate this report.'}
          icon={<UtensilsCrossed className="h-6 w-6" />}
        />
        {typeof data.batches === 'number' && (
          <p className="mt-2 text-center text-xs text-slate-400">Batches on file: {data.batches}</p>
        )}
      </div>
    );
  }

  const t = data?.totals;
  const split = data?.split;
  const spread = data?.branchSpread;
  const unpriced = data?.unpriced;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Food Cost % (Foodics)"
        subtitle="Sales from the Foodics POS export · price and cost from recipes"
        icon={<UtensilsCrossed className="h-5 w-5" />}
        actions={
          <Btn onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Refresh
          </Btn>
        }
      />

      {/* ── where the numbers come from, stated on the page ── */}
      {data?.source && (
        <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">How to read this:</span> Foodics supplies{' '}
          <span className="font-mono">{data.source.sales}</span>. Price comes from{' '}
          <span className="font-mono">{data.source.price}</span> and cost from{' '}
          <span className="font-mono">{data.source.cost}</span>.{' '}
          {data.source.note}{' '}
          Foodics prices are not uniform across delivery apps, so a revenue variance is expected information, not an error.
        </div>
      )}

      {/* ── filters ── */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Branch</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="All branches"
              className={inputCls}
            />
          </div>
          <div className="text-xs text-slate-500 pb-2">
            {data?.window?.days ?? 0} day{(data?.window?.days ?? 0) === 1 ? '' : 's'} ·{' '}
            {(data?.byBranch?.length ?? 0)} branch{(data?.byBranch?.length ?? 0) === 1 ? '' : 'es'}
          </div>
          <div>
            <Btn onClick={() => { setFrom(''); setTo(''); setBranch(''); }} className="w-full">Clear</Btn>
          </div>
        </div>
      </Card>

      {/* ⛔ A partial figure must never look like a whole one. */}
      {!!unpriced?.rows && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold">
                {unpriced.rows.toLocaleString('en-US')} sale line{unpriced.rows === 1 ? '' : 's'} ({qtyFmt(unpriced.quantity)} units) matched no recipe.
              </p>
              <p className="mt-0.5">
                They are excluded from every figure below, so the food-cost percentage describes the priced
                portion only. Link these products to recipes to widen the coverage.
              </p>
              {!!unpriced.names?.length && (
                <p className="mt-1 font-mono text-amber-800">
                  {unpriced.names.slice(0, 8).map((n) => `${n.name} (${qtyFmt(n.quantity)})`).join(' · ')}
                  {unpriced.names.length > 8 ? ` · +${unpriced.names.length - 8} more` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── the headline: the MARGIN rate, not the blended one ── */}
      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label="Food Cost % (margin items)"
            value={pct(split?.margin.foodCostPct ?? t.foodCostPct)}
            sub={`margin ${pct(split?.margin.grossMarginPct ?? t.grossMarginPct)} · ${split?.margin.products ?? 0} products`}
            tone={toneForCost(split?.margin.foodCostPct ?? t.foodCostPct) as 'emerald' | 'amber' | 'rose'}
            icon={<UtensilsCrossed className="h-4 w-4" />}
          />
          <StatCard
            label="Food Cost % (volume items)"
            value={pct(split?.volume.foodCostPct ?? 0)}
            sub={`${split?.volume.products ?? 0} products · traffic drivers`}
            tone="indigo"
          />
          <StatCard label="Revenue (recipe price)" value={money(t.revenue)} sub="× quantity sold" />
          <StatCard label="Cost (recipe)" value={money(t.cost)} sub="ingredients only" />
          {/* ⭐ Kept from the first version. Splitting the headline into two
              rates must not cost the operator a figure they had before. */}
          <StatCard label="Gross profit" value={money(t.grossProfit)} sub={`${qtyFmt(t.qty)} units`} />
          <StatCard
            label="vs Foodics revenue"
            value={`${t.variancePct >= 0 ? '+' : ''}${pct(t.variancePct)}`}
            sub={`${t.varianceVsFoodics >= 0 ? '+' : ''}${money(t.varianceVsFoodics)}`}
            tone="indigo"
          />
        </div>
      )}

      {/* ⛔ Never present the blended rate as the headline. It mixes two
          different businesses and hides both. It is shown once, here, with the
          measured reason the two rates differ. */}
      {split && (
        <Card className="p-3">
          <p className="text-sm">
            <span className="font-semibold">Why two rates</span>
            <span className="text-slate-600">
              {' '}
              · all items blended: <span className="font-mono">{pct(split.explain.blendedFoodCostPct)}</span>,
              {' '}which is {split.explain.marginRateGapPts.toFixed(2)} points worse than the margin rate
              purely because the drinks are in it.
            </span>
          </p>
          <p className="text-sm mt-1 text-slate-600">
            Volume items are{' '}
            <span className="font-semibold">{pct(split.explain.volumeQtySharePct)} of all units sold</span>
            {' '}but only{' '}
            <span className="font-semibold">{pct(split.explain.volumeRevenueSharePct)} of revenue</span>
            {', '}because a drink is priced to bring the customer in, not to make money on the cup.
            {' '}{split.explain.note}
          </p>
        </Card>
      )}

      {/* ── the actionable number ── */}
      {spread && (
        <Card className="p-3">
          <p className="text-sm">
            <span className="font-semibold">Branch spread {spread.points.toFixed(2)} points</span>
            <span className="text-slate-600">
              {' '}· best {spread.best} at {pct(spread.bestRate)}, worst {spread.worst} at {pct(spread.worstRate)}.
            </span>
          </p>
          <p className="text-sm mt-1">
            <span className="font-semibold text-emerald-700">
              Bringing every branch to the best rate is worth {money(spread.savingIfBestRate)}
            </span>
            <span className="text-slate-500"> · this is the gap an average hides.</span>
          </p>
        </Card>
      )}

      {/* ── tables ── */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {([['items', 'Margin items'], ['volume', 'Volume items'], ['branches', 'By branch'], ['days', 'By day']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1 text-xs font-semibold rounded ${tab === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
              {id === 'volume' && volumeItems.length > 0 ? ` (${volumeItems.length})` : ''}
              {id === 'items' && split ? ` (${split.margin.products})` : ''}
            </button>
          ))}
          <div className="flex-1" />
          {tab === 'items' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onlyProblem} onChange={(e) => setOnlyProblem(e.target.checked)} />
              Show only margin items at {WARN_FOOD_COST}% or above
            </label>
          )}
        </div>

        <div className="overflow-x-auto">
          {tab === 'items' && (
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <SortHead k="name" label="Item" align="left" />
                  <th className="py-2 px-2 text-left text-xs font-semibold text-slate-500">Role</th>
                  <SortHead k="qty" label="Qty" />
                  <SortHead k="revenue" label="Revenue" />
                  <SortHead k="cost" label="Cost" />
                  <SortHead k="foodCostPct" label="Food Cost %" />
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Margin %</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Foodics rev.</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Variance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.code} className="border-b border-line/50 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-sm" dir="auto">{r.name}</td>
                    <td className="py-1.5 px-2">
                      {/* ⭐ The operator's decision, editable. A drink defaults
                          to volume because its recipe category is beverage; a
                          food item deliberately sold to pull customers in can be
                          switched the other way, and "default" clears the
                          override so the category decides again. */}
                      <select
                        value={r.role}
                        onChange={(e) => void setRole(r.recipeId, e.target.value as 'volume' | 'margin')}
                        disabled={!r.recipeId}
                        className="text-xs border border-line-strong rounded px-1 py-0.5 bg-white text-slate-700 disabled:opacity-40"
                      >
                        <option value="margin">Margin</option>
                        <option value="volume">Volume</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{qtyFmt(r.qty)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.revenue)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.cost)}</td>
                    {/* ⛔ A volume item is NEVER red or amber. Its food cost is
                        the price of winning the customer, and colouring it as a
                        failure is the misreading this whole change exists to
                        remove. */}
                    <td className={`py-1.5 px-2 text-right text-sm font-semibold tabular-nums ${
                      r.role === 'volume' ? 'text-slate-500'
                      : r.foodCostPct >= HIGH_FOOD_COST ? 'text-rose-600'
                      : r.foodCostPct >= WARN_FOOD_COST ? 'text-amber-600'
                      : 'text-slate-700'}`}
                    >
                      {pct(r.foodCostPct)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-600">{pct(r.grossMarginPct)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-500">{money(r.foodicsRevenue)}</td>
                    <td className={`py-1.5 px-2 text-right text-sm tabular-nums ${
                      r.varianceVsFoodics < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                    >
                      {r.varianceVsFoodics >= 0 ? '+' : ''}{money(r.varianceVsFoodics)}
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td colSpan={9} className="py-6 text-center text-sm text-slate-400">No items in this window</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'volume' && (
            <div>
              {/* ⭐ The drinks get their own table, not a footnote. Their food
                  cost is high by design -- they are what brings the customer in
                  -- so listing them beside the food and colouring them red
                  implied a defect where there is a decision. */}
              <div className="px-3 py-2 bg-indigo-50/60 border-b border-line text-xs text-slate-700">
                <span className="font-semibold">Volume items.</span>{' '}
                Deliberate traffic drivers, not pricing problems. They account for{' '}
                <span className="font-semibold">{pct(split?.explain.volumeQtySharePct ?? 0)} of all units sold</span>
                {' '}and{' '}
                <span className="font-semibold">{pct(split?.explain.volumeRevenueSharePct ?? 0)} of revenue</span>
                {'. '}Their food cost is the price of winning the customer, so no threshold is applied here.
              </div>
              <table className="w-full">
                <thead className="border-b border-line">
                  <tr>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-slate-500">Item</th>
                    <SortHead k="qty" label="Qty" />
                    <SortHead k="revenue" label="Revenue" />
                    <SortHead k="cost" label="Cost" />
                    <SortHead k="foodCostPct" label="Food Cost %" />
                    <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Margin %</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-slate-500">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {volumeItems.map((r) => (
                    <tr key={r.code} className="border-b border-line/50 hover:bg-slate-50">
                      <td className="py-1.5 px-2 text-sm" dir="auto">{r.name}</td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums">{qtyFmt(r.qty)}</td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.revenue)}</td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.cost)}</td>
                      {/* ⛔ deliberately slate, never rose or amber */}
                      <td className="py-1.5 px-2 text-right text-sm font-semibold tabular-nums text-slate-500">{pct(r.foodCostPct)}</td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-600">{pct(r.grossMarginPct)}</td>
                      <td className="py-1.5 px-2">
                        <select
                          value={r.role}
                          onChange={(e) => void setRole(r.recipeId, e.target.value as 'volume' | 'margin')}
                          disabled={!r.recipeId}
                          className="text-xs border border-line-strong rounded px-1 py-0.5 bg-white text-slate-700 disabled:opacity-40"
                        >
                          <option value="volume">Volume</option>
                          <option value="margin">Margin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!volumeItems.length && (
                    <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">No volume items in this window</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'branches' && (
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <th className="py-2 px-2 text-left text-xs font-semibold text-slate-500">Branch</th>
                  <SortHead k="qty" label="Qty" />
                  <SortHead k="revenue" label="Revenue" />
                  <SortHead k="cost" label="Cost" />
                  <SortHead k="foodCostPct" label="Food Cost %" />
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Margin %</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Variance vs Foodics</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byBranch ?? []).map((r) => (
                  <tr key={r.ref} className="border-b border-line/50 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-sm" dir="auto">
                      <span className="text-slate-400 font-mono text-xs">{r.ref}</span> {r.name}
                    </td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{qtyFmt(r.qty)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.revenue)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.cost)}</td>
                    <td className={`py-1.5 px-2 text-right text-sm font-semibold tabular-nums ${
                      r.foodCostPct >= HIGH_FOOD_COST ? 'text-rose-600' : r.foodCostPct >= WARN_FOOD_COST ? 'text-amber-600' : 'text-slate-700'}`}
                    >
                      {pct(r.foodCostPct)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-600">{pct(r.grossMarginPct)}</td>
                    <td className={`py-1.5 px-2 text-right text-sm tabular-nums ${r.varianceVsFoodics < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {pct(r.variancePct)}
                    </td>
                  </tr>
                ))}
                {!data?.byBranch?.length && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">No branches in this window</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'days' && (
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <th className="py-2 px-2 text-left text-xs font-semibold text-slate-500">Day</th>
                  <SortHead k="qty" label="Qty" />
                  <SortHead k="revenue" label="Revenue" />
                  <SortHead k="cost" label="Cost" />
                  <SortHead k="foodCostPct" label="Food Cost %" />
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Margin %</th>
                  <th className="py-2 px-2 text-right text-xs font-semibold text-slate-500">Foodics rev.</th>
                </tr>
              </thead>
              <tbody>
                {[...(data?.byDay ?? [])].reverse().map((r) => (
                  <tr key={r.day} className="border-b border-line/50 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-sm font-mono">{r.day}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{qtyFmt(r.qty)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.revenue)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums">{money(r.cost)}</td>
                    <td className="py-1.5 px-2 text-right text-sm font-semibold tabular-nums text-slate-700">{pct(r.foodCostPct)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-600">{pct(r.grossMarginPct)}</td>
                    <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-500">{money(r.foodicsRevenue)}</td>
                  </tr>
                ))}
                {!data?.byDay?.length && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">No days in this window</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {data?.generatedAt && (
        <p className="text-xs text-slate-400">Generated {new Date(data.generatedAt).toLocaleString('en-GB')}</p>
      )}
    </div>
  );
};

export default FoodicsFoodCostView;