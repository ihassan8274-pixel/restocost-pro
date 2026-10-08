// منطق تقرير حركة المخزون — نقيّ، بلا حالة ولا JSX.
//
// ⭐ لماذا مستخرج؟ المنطق كان داخل InventoryMovementView: كل حساب غير قابل
// للاختبار، والأخطر أن حساب "الرصيد المحسوب" كان يجمع **المستندات** بينما
// "الرصيد الحالي" يقرأ **دفتر الحركات**. مصدران لا يلتقيان أبداً، فالفرق
// عموده مضمون أن يكون كاذباً.
//
// القاعدة التي اتبعناها: المستندات تُعرض لأنها تُعلمك أمراً (وارداً معتمداً
// لم يُرحَّل)، لكن **الرصيد لا يُبنى منها أبداً** — يُبنى من الحركات.

export interface MovementSource {
  id: string;
  branchId: string;
  rawMaterialId: string;
  delta: number;
  type: string;
  date: string;
  ref?: string;
  reference?: string;
  branchName?: string;
  qty?: number;
  cost?: number;
  value?: number;
  running?: number;
}

export interface OpeningSource {
  branchId: string;
  date: string;
  items: { rawMaterialId: string; quantity: number; unitCost?: number }[];
}

export interface MovementSummaryInput {
  rawMaterialId: string;
  branches: { id: string }[];
  inventory: { branchId: string; rawMaterialId: string; quantity: number }[];
  movements: MovementSource[];
  openingBalances: OpeningSource[];
  grnNotes: { status: string; branchId: string; date: string; items: { rawMaterialId: string; quantityReceived: number }[] }[];
  stockTransfers: { status: string; fromBranchId: string; toBranchId: string; date: string; items: { rawMaterialId: string; quantity: number }[] }[];
  productionRuns: { status: string; branchId: string; date: string; items: { rawMaterialId: string; requiredQty: number }[] }[];
  wastageLogs: { rawMaterialId: string; branchId: string; date: string; quantity: number }[];
  physicalCounts: { branchId: string; date: string; items: { rawMaterialId: string; varianceQty: number }[] }[];
  supplierReturns: { status: string; branchId: string; date: string; items: { rawMaterialId: string; quantity: number }[] }[];
  branchFilter: string;
  fromDate: string;
  toDate: string;
}

export interface MaterialMovementRow {
  opening: number;
  /** المستندات: ما يقوله الورق. */
  docPurchases: number;
  docTransIn: number;
  docTransOut: number;
  docProduction: number;
  docWastage: number;
  docAdjustment: number;
  docSupplierReturns: number;
  docCalculated: number;
  /** الدفتر: ما حدث فعلاً. */
  ledgerNet: number;
  ledgerCalculated: number;
  /** الرصيد المخزَّن في inventory. */
  current: number;
  /** ⭐ الفحص الحقيقي: يجب أن يكون ~0. إن لم يكن فالدفتر والرصيد متفرقان. */
  ledgerGap: number;
  /** فجوة المستندات عن الدفتر — وارد معتمد لم يُرحَّل، أو حركة بلا مستند. */
  docGap: number;
  movementCount: number;
}

/** تاريخ الحركة قد يكون YYYY-MM-DD أو ISO كامل — نطبّعه للمقارنة النصية. */
const day = (d: string) => String(d || '').slice(0, 10);

/** أحدث سجل افتتاحي لكل فرع (التاريخ الأقصى ≤ بداية الفترة لا يُهمّ هنا). */
export const buildOpeningMap = (balances: OpeningSource[]): Map<string, number> => {
  const latest = new Map<string, OpeningSource>();
  for (const r of balances) {
    const cur = latest.get(r.branchId);
    if (!cur || r.date > cur.date) latest.set(r.branchId, r);
  }
  const out = new Map<string, number>();
  latest.forEach((r, branchId) => {
    r.items.forEach((i) => {
      const k = `${branchId}|${i.rawMaterialId}`;
      out.set(k, (out.get(k) || 0) + (Number(i.quantity) || 0));
    });
  });
  return out;
};

export const summariseMovement = (input: MovementSummaryInput): MaterialMovementRow => {
  const { rawMaterialId: mid, branchFilter, fromDate, toDate } = input;
  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const inBranch = (b: string) => branchFilter === 'all' || b === branchFilter;

  // ── الافتتاحي ────────────────────────────────────────────────────────
  const openingMap = buildOpeningMap(input.openingBalances);
  let opening = 0;
  if (branchFilter === 'all') {
    for (const b of input.branches) opening += openingMap.get(`${b.id}|${mid}`) || 0;
  } else {
    opening = openingMap.get(`${branchFilter}|${mid}`) || 0;
  }

  // ── المستندات (ما يقوله الورق) ────────────────────────────────────────
  let docPurchases = 0, docTransIn = 0, docTransOut = 0, docProduction = 0;
  let docWastage = 0, docAdjustment = 0, docSupplierReturns = 0;

  for (const g of input.grnNotes) {
    if (g.status === 'rejected' || !inBranch(g.branchId) || !inDate(g.date)) continue;
    for (const i of g.items || []) if (i.rawMaterialId === mid) docPurchases += Number(i.quantityReceived) || 0;
  }
  for (const t of input.stockTransfers) {
    if (t.status !== 'approved' || !inDate(t.date)) continue;
    for (const i of t.items || []) {
      if (i.rawMaterialId !== mid) continue;
      if (inBranch(t.toBranchId)) docTransIn += Number(i.quantity) || 0;
      if (inBranch(t.fromBranchId)) docTransOut += Number(i.quantity) || 0;
    }
  }
  for (const r of input.productionRuns) {
    if (r.status !== 'completed' || !inBranch(r.branchId) || !inDate(r.date)) continue;
    for (const i of r.items || []) if (i.rawMaterialId === mid) docProduction += Number(i.requiredQty) || 0;
  }
  for (const w of input.wastageLogs) {
    if (w.rawMaterialId !== mid || !inBranch(w.branchId) || !inDate(w.date)) continue;
    docWastage += Number(w.quantity) || 0;
  }
  for (const p of input.physicalCounts) {
    if (!inBranch(p.branchId) || !inDate(p.date)) continue;
    for (const i of p.items || []) if (i.rawMaterialId === mid) docAdjustment += Number(i.varianceQty) || 0;
  }
  for (const r of input.supplierReturns) {
    if (r.status !== 'approved' || !inBranch(r.branchId) || !inDate(r.date)) continue;
    for (const i of r.items || []) if (i.rawMaterialId === mid) docSupplierReturns += Number(i.quantity) || 0;
  }
  const docCalculated = opening + docPurchases + docTransIn - docTransOut
    - docProduction - docWastage + docAdjustment - docSupplierReturns;

  // ── الدفتر (ما حدث فعلاً) ─────────────────────────────────────────────
  // ⭐ هذا هو مصدر الرصيد الوحيد: adjustInventory يكتب الحركة والرصيد في
  // set واحدة، فلا يمكن أن يخترق مستندٌ الرصيد بلا حركة، ولا حركةٌ بلا أثر.
  let ledgerNet = 0, movementCount = 0;
  for (const m of input.movements) {
    if (m.rawMaterialId !== mid || !inBranch(m.branchId) || !inDate(day(m.date))) continue;
    ledgerNet += Number(m.delta) || 0;
    movementCount++;
  }
  const ledgerCalculated = opening + ledgerNet;

  // ── الرصيد المخزَّن ───────────────────────────────────────────────────
  let current = 0;
  for (const rec of input.inventory) {
    if (rec.rawMaterialId !== mid || !inBranch(rec.branchId)) continue;
    current += Number(rec.quantity) || 0;
  }

  const ledgerGap = current - ledgerCalculated;
  return {
    opening,
    docPurchases, docTransIn, docTransOut, docProduction, docWastage,
    docAdjustment, docSupplierReturns, docCalculated,
    ledgerNet, ledgerCalculated, current,
    ledgerGap,
    docGap: docCalculated - ledgerCalculated,
    movementCount,
  };
};

/**
 * دفتر حركة صنف من الحركات نفسها، مع رصيد جارٍ.
 * `costFor` يعطي تكلفة الوحدة (تقديرية للباقي من cost من متوسط الفرع).
 */
export interface LedgerResult {
  rows: (MovementSource & { reference: string; branchName: string; qty: number; cost: number; value: number; running: number })[];
  opening: number;
  inTotal: number;
  outTotal: number;
  final: number;
}

/**
 * دفتر حركة صنف من الحركات نفسها، مع رصيد جارٍ.
 * `costFor` يعطي تكلفة الوحدة (تقديرية للباقي من cost من متوسط الفرع).
 */
export const buildItemLedger = (
  movements: MovementSource[],
  opts: { rawMaterialId: string; branchFilter: string; fromDate: string; toDate: string; opening: number; costFor: () => number; getBranchName?: (branchId: string) => string },
): LedgerResult => {
  const inDate = (d: string) => (!opts.fromDate || d >= opts.fromDate) && (!opts.toDate || d <= opts.toDate);
  const getBranchName = opts.getBranchName || ((id) => id);
  const rows = movements
    .filter((m) => m.rawMaterialId === opts.rawMaterialId
      && (opts.branchFilter === 'all' || m.branchId === opts.branchFilter)
      && inDate(day(m.date)))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
    .map((m) => ({ ...m }));

  let running = opts.opening;
  const priced = rows.map((m) => {
    running += Number(m.delta) || 0;
    const c = opts.costFor();
    return {
      ...m,
      reference: m.ref || '',
      branchName: getBranchName(m.branchId),
      qty: Number(m.delta) || 0,
      cost: c,
      value: (Number(m.delta) || 0) * c,
      running,
    };
  });
  return {
    rows: priced,
    opening: opts.opening,
    inTotal: priced.reduce((s, r) => s + Math.max(0, r.delta), 0),
    outTotal: priced.reduce((s, r) => s + Math.max(0, -r.delta), 0),
    final: running,
  };
};