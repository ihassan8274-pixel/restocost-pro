import { describe, it, expect, beforeEach } from 'vitest';
import { summariseMovement, buildItemLedger, buildOpeningMap } from './inventory-movement-report';
import type { MovementSummaryInput, MovementSource } from './inventory-movement-report';

// ── مصانع بيانات ──────────────────────────────────────────────────────
const day = (d: string) => String(d).slice(0, 10);

const mat = (id: string) => ({ id, code: id, nameAr: id, category: 'dry_goods', unit: 'كغم', standardPrice: 10, minStockLevel: 0, yieldPercentage: 100, supplierId: '', storageType: 'dry', isActive: true } as any);

const baseInput = (over: Partial<any> = {}): any => ({
  rawMaterialId: 'm1',
  branches: [{ id: 'b1' }, { id: 'b2' }],
  inventory: [{ branchId: 'b1', rawMaterialId: 'm1', quantity: 100 }],
  movements: [],
  openingBalances: [],
  grnNotes: [],
  stockTransfers: [],
  productionRuns: [],
  wastageLogs: [],
  physicalCounts: [],
  supplierReturns: [],
  branchFilter: 'all',
  fromDate: '',
  toDate: '',
  ...over,
});

const grn = (branchId: string, date: string, qty: number, status = 'approved') => ({
  status, branchId, date,
  items: [{ rawMaterialId: 'm1', quantityReceived: qty }],
});

const mv = (branchId: string, delta: number, type: string, date = '2026-10-05') => ({
  rawMaterialId: 'm1', branchId, delta, type, date, ref: 'test',
});

describe('summariseMovement — المولد من مصدر واحد: الدفتر', () => {
  beforeEach(() => {});

  it('الافتتاحي + الحركات = المحسوب من الدفتر', () => {
    const out = summariseMovement({
      rawMaterialId: 'm1',
      branches: [{ id: 'b1' }],
      inventory: [{ branchId: 'b1', rawMaterialId: 'm1', quantity: 500 }],
      movements: [mv('b1', 100, 'استقبال استلام'), mv('b1', -30, 'إنتاج')],
      openingBalances: [{ branchId: 'b1', date: '2026-10-01', items: [{ rawMaterialId: 'm1', quantity: 200 }] }],
      grnNotes: [], stockTransfers: [], productionRuns: [], wastageLogs: [],
      physicalCounts: [], supplierReturns: [],
      branchFilter: 'all', fromDate: '', toDate: '',
    });
    expect(out.opening).toBe(200);
    expect(out.ledgerNet).toBe(70);
    expect(out.ledgerCalculated).toBe(270);
    expect(out.current).toBe(500);   // الرصيد المخزَّن
    expect(out.ledgerGap).toBe(230); // الرصيد المخزَّن لا يطابق الحركات (500 vs 270) ← هذا ما يجب أن يكشفه التقرير
    expect(out.docCalculated).toBe(200); // لا مستندات
    expect(out.docGap).toBe(-70);      // المستندات (200) - الحركات (270) = -70
  });

  it('بدون حركات ⇒ الرصيد المحسوب = الافتتاحي', () => {
    const out = summariseMovement({
      rawMaterialId: 'm1',
      branches: [{ id: 'b1' }],
      inventory: [{ branchId: 'b1', rawMaterialId: 'm1', quantity: 200 }],
      movements: [],
      openingBalances: [{ branchId: 'b1', date: '2026-10-01', items: [{ rawMaterialId: 'm1', quantity: 200 }] }],
      grnNotes: [], stockTransfers: [], productionRuns: [], wastageLogs: [],
      physicalCounts: [], supplierReturns: [],
      branchFilter: 'all', fromDate: '', toDate: '',
    });
    expect(out.ledgerNet).toBe(0);
    expect(out.ledgerCalculated).toBe(200);
    expect(out.current).toBe(200);
    expect(out.ledgerGap).toBe(0);
  });

  it('يتجاهل المستندات غير المعتمدة أو خارج الفترة/الفرع', () => {
    const out = summariseMovement({
      rawMaterialId: 'm1',
      branches: [{ id: 'b1' }, { id: 'b2' }],
      inventory: [],
      movements: [mv('b1', 100, 'استقبال استلام', '2026-10-05')],
      openingBalances: [{ branchId: 'b1', date: '2026-10-01', items: [{ rawMaterialId: 'm1', quantity: 0 }] }],
      grnNotes: [
        { status: 'approved', branchId: 'b1', date: '2026-10-05', items: [{ rawMaterialId: 'm1', quantityReceived: 500 }] },
        { status: 'rejected', branchId: 'b1', date: '2026-10-05', items: [{ rawMaterialId: 'm1', quantityReceived: 999 }] },
        { status: 'approved', branchId: 'b2', date: '2026-10-05', items: [{ rawMaterialId: 'm1', quantityReceived: 777 }] },
        { status: 'approved', branchId: 'b1', date: '2026-09-01', items: [{ rawMaterialId: 'm1', quantityReceived: 555 }] },
      ],
      stockTransfers: [], productionRuns: [], wastageLogs: [], physicalCounts: [], supplierReturns: [],
      branchFilter: 'b1', fromDate: '2026-10-01', toDate: '2026-10-31',
    });
    expect(out.docPurchases).toBe(500); // rejected خارجي، b2 خارجي، سبتمبر خارج الفترة
  });
});

describe('buildItemLedger — دفتر الحركة مع رصيد جارٍ', () => {
  it('يرتب الحركات تاريخياً ويحسب الرصيد الجارٍ', () => {
    const res = buildItemLedger(
      [mv('b1', -20, 'إنتاج', '2026-10-10'), mv('b1', 100, 'استلام', '2026-10-01')],
      { rawMaterialId: 'm1', branchFilter: 'all', fromDate: '', toDate: '', opening: 200, costFor: () => 10 },
    );
    // يجب أن يرتب حسب التاريخ: الاستلام أولاً ثم الإنتاج
    expect(res.rows[0].delta).toBe(100);
    expect(res.rows[0].running).toBe(300); // 200 + 100
    expect(res.rows[1].delta).toBe(-20);
    expect(res.rows[1].running).toBe(280); // 300 - 20
    expect(res.final).toBe(280);
    expect(res.inTotal).toBe(100);
    expect(res.outTotal).toBe(20);
  });
});

describe('buildOpeningMap — أحدث سجل افتتاحي لكل فرع', () => {
  it('يختار الأحدث فقط (بالتاريخ)، ويجمع الكمية', () => {
    const out = buildOpeningMap([
      { branchId: 'b1', date: '2026-09-01', items: [{ rawMaterialId: 'm1', quantity: 100 }] },
      { branchId: 'b1', date: '2026-09-15', items: [{ rawMaterialId: 'm1', quantity: 200 }] },
      { branchId: 'b1', date: '2026-09-20', items: [{ rawMaterialId: 'm1', quantity: 50 }] }, // أحدث بالتاريخ
      { branchId: 'b2', date: '2026-09-01', items: [{ rawMaterialId: 'm1', quantity: 50 }] },
    ]);
    // يختار أحدث بالتاريخ (2026-09-20) وليس الأكبر بالكمية
    expect(out.get('b1|m1')).toBe(50);
    expect(out.get('b2|m1')).toBe(50);
  });
});