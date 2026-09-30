// Server-side period-lock enforcement.
// Mirrors the client's isDateClosed: a write is rejected (409) when it
// creates, modifies, or deletes a document whose business date falls in a
// closed month (rcerp_closed_months) or closed day (rcerp_closed_days).

const PERIOD_DATE_FIELDS = {
  rcerp_grn: ['date'],
  rcerp_purchase_orders: ['orderDate', 'date'],
  rcerp_purchase_requests: ['date', 'requestDate'],
  rcerp_pos_orders: ['orderDate', 'date'],
  rcerp_pos_returns: ['date'],
  rcerp_stock_transfers: ['date'],
  rcerp_wastage: ['date'],
  rcerp_supplier_returns: ['date'],
  rcerp_physical_counts: ['date'],
  rcerp_daily_counts: ['date'],
  rcerp_batch_sales: ['date'],
  rcerp_invoices: ['date'],
  rcerp_customer_orders: ['orderDate', 'date'],
  rcerp_operating_expenses: ['date'],
  rcerp_distributions: ['date'],
  rcerp_production_runs: ['date'],
  rcerp_employee_meals: ['date'],
};

const EXEMPT_KEYS = new Set([
  'rcerp_closed_months',
  'rcerp_closed_days',
  'rcerp_monthly_inventory',
  'rcerp_inventory_movements',
  'rcerp_audit',
]);

const monthOf = (s) => (s || '').slice(0, 7);
const dayOf = (s) => (s || '').slice(0, 10);

export const findPeriodViolation = (key, incoming, prev, getKV) => {
  if (EXEMPT_KEYS.has(key)) return null;
  const dateFields = PERIOD_DATE_FIELDS[key];
  if (!dateFields) return null;

  const closedMonths = new Set(Array.isArray(getKV('rcerp_closed_months')) ? getKV('rcerp_closed_months') : []);
  const closedDays = new Set(Array.isArray(getKV('rcerp_closed_days')) ? getKV('rcerp_closed_days') : []);
  if (closedMonths.size === 0 && closedDays.size === 0) return null;

  const isClosed = (dateStr) => {
    const d = dayOf(dateStr);
    if (!d) return false;
    return closedDays.has(d) || closedMonths.has(monthOf(d));
  };

  const extractDate = (rec) => {
    for (const f of dateFields) {
      const v = rec && rec[f];
      if (typeof v === 'string' && v.length >= 10) return v;
    }
    return null;
  };

  const arr = Array.isArray(incoming) ? incoming : [];
  const prevArr = Array.isArray(prev) ? prev : [];
  const prevById = new Map(prevArr.filter((r) => r && r.id !== undefined).map((r) => [r.id, r]));

  for (const rec of arr) {
    if (!rec || rec.id === undefined) continue;
    const d = extractDate(rec);
    if (!d) continue;
    if (isClosed(d)) {
      const isNew = !prevById.has(rec.id);
      return { date: d, kind: isNew ? 'create' : 'update' };
    }
  }

  const incomingIds = new Set(arr.filter((r) => r && r.id !== undefined).map((r) => r.id));
  for (const [id, old] of prevById) {
    if (incomingIds.has(id)) continue;
    const d = extractDate(old);
    if (d && isClosed(d)) {
      return { date: d, kind: 'delete' };
    }
  }

  return null;
};
