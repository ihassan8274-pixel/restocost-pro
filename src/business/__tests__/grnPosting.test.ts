import { describe, it, expect } from 'vitest';
import { planPosting, planUnposting, type PostLine } from '../grnPosting';

const REF = 'grn-123';
const item = (id: string, q: number, price = 10) => ({ rawMaterialId: id, quantityReceived: q, unitPrice: price });

describe('planPosting', () => {
  it('يبني خطة للإشعار المعتمد', () => {
    const r = planPosting(REF, { status: 'approved', items: [item('rm-1', 50), item('rm-2', 24)], existingMovementRefs: [] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toHaveLength(2);
      expect(r.total).toBe(740);   // 50*10 + 24*10
    }
  });

  it('يرفض ما ليس معتمداً — المسار يحترم الترتيب', () => {
    for (const s of ['draft', 'submitted', 'rejected', 'posted']) {
      const r = planPosting(REF, { status: s, items: [item('rm-1', 5)], existingMovementRefs: [] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not_approved');
    }
  });

  it('يرفض الترحيل الثاني — هذا هو خطر مضاعفة الكميات', () => {
    const r = planPosting(REF, { status: 'approved', items: [item('rm-1', 50)], existingMovementRefs: [REF] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already_posted');
  });

  it('يتخطّى الصفوف الفارغة بدل رفض الإشعار كله', () => {
    const r = planPosting(REF, {
      status: 'approved',
      items: [item('rm-1', 50), item('rm-2', 0), item('rm-3', 0)],
      existingMovementRefs: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toHaveLength(1);
  });

  it('يرفض صنفاً بلا معرّف — لا نعرف أي مخزون نزيد', () => {
    const r = planPosting(REF, {
      status: 'approved',
      items: [{ rawMaterialId: '', quantityReceived: 5, unitPrice: 1 }],
      existingMovementRefs: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing_material');
  });

  it('يرفض إشعاراً كل كمياته صفر', () => {
    const r = planPosting(REF, { status: 'approved', items: [item('rm-1', 0)], existingMovementRefs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('zero_qty');
  });

  it('يرفض إشعاراً بلا أصناف', () => {
    const r = planPosting(REF, { status: 'approved', items: [], existingMovementRefs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_items');
  });

  it('يحمل الدفعة وتاريخ الانتهاء — بها تُعتمد صلاحية الأصناف', () => {
    const r = planPosting(REF, {
      status: 'approved',
      items: [{ rawMaterialId: 'rm-1', quantityReceived: 10, unitPrice: 5, batchNumber: 'B-44', expiryDate: '2026-12-31' }],
      existingMovementRefs: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines[0].batchNumber).toBe('B-44');
      expect(r.lines[0].expiryDate).toBe('2026-12-31');
    }
  });

  it('يقرّب الكميات لأربع خانات مثل adjustInventory', () => {
    const r = planPosting(REF, { status: 'approved', items: [item('rm-1', 1.23456789, 1)], existingMovementRefs: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines[0].qty).toBe(1.2346);
  });
});

describe('planUnposting', () => {
  it('يعكس المبالغ wholeheartedly بالسالب', () => {
    const lines: PostLine[] = [{ rawMaterialId: 'rm-1', qty: 50, unitPrice: 10 }];
    const r = planUnposting(lines);
    expect(r.deltas[0].delta).toBe(-50);
    expect(r.total).toBe(-500);
  });

  it('التراجع عن عدة بنود يعكس الكل', () => {
    const r = planUnposting([
      { rawMaterialId: 'rm-1', qty: 50, unitPrice: 10 },
      { rawMaterialId: 'rm-2', qty: 24, unitPrice: 4 },
    ]);
    expect(r.deltas.map((d) => d.delta)).toEqual([-50, -24]);
    expect(r.total).toBe(-596);
  });
});