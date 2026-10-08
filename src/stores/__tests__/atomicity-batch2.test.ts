import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from '../inventoryStore';
import { usePeriodStore } from '../periodStore';

// كل دالة تعدّل أكثر من مخزن يجب أن تفعل ذلك في set واحدة.
//
// اكتُشف هذا النمط في خمس دوال. الأولى (adjustInventory) كانت تنتج بالقياس
// 311 رصيداً من 961 لا يساوي الافتتاح + الحركات، وكلها أعلى — لأن تحديث
// الرصيد نجح وتحديث الحركة لم. الباقي كان سيُنتج النتيجة نفسها عند أول
// انقطاع.
//
// الفحص هنا: بعد كل استدعاء، المخازن المتأثرة متسقة فيما بينها. ولو عاد
// أي set منفصل لأمكن أن يُلاحَظ حالة وسطى — وهذا ما يفحصه الاختبار indirectly
// عبر ثبات المراجع داخل الاستدعاء الواحد.

const B = 'b-atomic';
const M = 'rm-atomic';

beforeEach(() => {
  useInventoryStore.setState({ inventory: [], inventoryMovements: [], inventoryBatches: [], physicalCounts: [], openingBalances: [] });
  usePeriodStore.setState({ closedDays: [], eodClosures: [], closedMonths: [], monthlyInventory: [] });
});

describe('الذرّية — الجرد الفعلي', () => {
  it('يسجّل الجرد ويعدّل الأرصدة في عملية واحدة', () => {
    const st = () => useInventoryStore.getState();
    // صنفان موجودان مسبقاً + صنف ثالث غير موجود
    st().setInventory([
      { id: 'i1', branchId: B, rawMaterialId: M, quantity: 100, lastUpdated: '' },
      { id: 'i2', branchId: B, rawMaterialId: 'rm-2', quantity: 50, lastUpdated: '' },
    ]);
    st().recordPhysicalCount({
      branchId: B,
      items: [
        { rawMaterialId: M, actualQty: 97, systemQty: 100 },
        { rawMaterialId: 'rm-2', actualQty: 48, systemQty: 50 },
      ],
    } as never);

    const s = st();
    expect(s.physicalCounts).toHaveLength(1);
    expect(s.inventory.find((i) => i.rawMaterialId === M)?.quantity).toBe(97);
    expect(s.inventory.find((i) => i.rawMaterialId === 'rm-2')?.quantity).toBe(48);
  });

  it('صنف الجرد بلا سجل مخزون يُنشأ — كان يُتجاهل بصمت', () => {
    const st = () => useInventoryStore.getState();
    st().recordPhysicalCount({
      branchId: B,
      items: [{ rawMaterialId: 'rm-new', actualQty: 12, systemQty: 0 }],
    } as never);
    expect(st().inventory.find((i) => i.rawMaterialId === 'rm-new')?.quantity).toBe(12);
  });

  it('فرع آخر لا يُمسّ', () => {
    const st = () => useInventoryStore.getState();
    st().setInventory([
      { id: 'x', branchId: 'b-other', rawMaterialId: M, quantity: 999, lastUpdated: '' },
      { id: 'y', branchId: B, rawMaterialId: M, quantity: 100, lastUpdated: '' },
    ]);
    st().recordPhysicalCount({ branchId: B, items: [{ rawMaterialId: M, actualQty: 5, systemQty: 100 }] } as never);
    expect(st().inventory.find((i) => i.branchId === 'b-other')?.quantity).toBe(999);
  });
});

describe('الذرّية — الأرصدة الافتتاحية', () => {
  it('الرصيد وسجل الافتتاحي يُكتبان معاً', () => {
    const st = () => useInventoryStore.getState();
    st().setOpeningBalances(B, { [M]: 500, 'rm-x': 250, 'rm-zero': 0 });

    const s = st();
    expect(s.openingBalances).toHaveLength(1);
    // الصنف صاحب الكمية صفر لا يُنشأ (كما كان)
    expect(s.openingBalances[0].items).toHaveLength(2);
    expect(s.inventory.find((i) => i.rawMaterialId === M)?.quantity).toBe(500);
    expect(s.inventory.find((i) => i.rawMaterialId === 'rm-x')?.quantity).toBe(250);
    expect(s.inventory.some((i) => i.rawMaterialId === 'rm-zero')).toBe(false);
  });

  it('الرصيد يطابق مجموع سجل الافتتاحي — الفارق الذي قِستُه 311 مرة', () => {
    const st = () => useInventoryStore.getState();
    st().setOpeningBalances(B, { a: 100, b: 200, c: 300 } as never);
    const s = st();
    const opening = s.openingBalances[0].items.reduce((a, i) => a + i.quantity, 0);
    const bal = s.inventory
      .filter((i) => i.branchId === B)
      .reduce((a, i) => a + i.quantity, 0);
    expect(bal).toBe(opening);
  });
});

describe('الذرّية — periodStore', () => {
  it('إعادة فتح اليوم تحذفه من القائمتين معاً', () => {
    const st = () => usePeriodStore.getState();
    usePeriodStore.setState({
      closedDays: ['2026-10-01', '2026-10-02'],
      eodClosures: [
        { id: 'e1', date: '2026-10-01', closedAt: '' },
        { id: 'e2', date: '2026-10-02', closedAt: '' },
      ],
    } as never);
    st().reopenDay('2026-10-01');
    const s = st();
    expect(s.closedDays).not.toContain('2026-10-01');
    expect(s.eodClosures.some((c) => c.date === '2026-10-01')).toBe(false);
    // واليوم الآخر يبقى
    expect(s.closedDays).toContain('2026-10-02');
  });

  it('إعادة فتح الجرد الشهري: الحالة وإزالة الشهر المغلق معاً', () => {
    usePeriodStore.setState({
      monthlyInventory: [
        { id: 'mi-1', branchId: B, monthKey: '2026-10', status: 'closed', items: [] },
      ],
      closedMonths: ['2026-10', '2026-09'],
    } as never);
    usePeriodStore.getState().reopenMonthlyInventory('mi-1');
    const s = usePeriodStore.getState();
    expect(s.monthlyInventory[0].status).toBe('counting');
    expect(s.closedMonths).not.toContain('2026-10');
    expect(s.closedMonths).toContain('2026-09');
  });

  it('جرد شهري قيد العدّ لا يُعاد فتحه', () => {
    usePeriodStore.setState({
      monthlyInventory: [{ id: 'mi-2', branchId: B, monthKey: '2026-11', status: 'counting', items: [] }],
      closedMonths: ['2026-11'],
    } as never);
    usePeriodStore.getState().reopenMonthlyInventory('mi-2');
    expect(usePeriodStore.getState().closedMonths).toContain('2026-11');
  });

  // ── بصمة التسوية: تُحفظ السطور وتُصفَّر عند إعادة الفتح ──────────────────
  // بالإجماليات وحدها (settlementNetVariance) كان العكس مستحيلاً، فتُطبَّق
  // التسوية مرة ثانية عند كل فتح/إقفال ويتاكم العجز حتى يصير الرصيد سالباً.
  it('الإقفال يحفظ سطور التسوية لا مجاميعها فقط', () => {
    usePeriodStore.setState({
      monthlyInventory: [{ id: 'mi-3', branchId: B, monthKey: '2026-12', status: 'counting', items: [] }],
      closedMonths: [],
    } as never);
    usePeriodStore.getState().closeMonthlyInventory('mi-3', {
      appliedAt: '2026-12-31T00:00:00.000Z',
      shortages: 2, surplus: 1, netVariance: -500,
      lines: [{ rawMaterialId: 'rm-1', delta: -300 }, { rawMaterialId: 'rm-2', delta: -200 }],
    });
    const p = usePeriodStore.getState().monthlyInventory[0];
    expect(p.status).toBe('closed');
    expect(p.settlementLines).toHaveLength(2);
    // الأرقام لكل صنف — هذا ما يجعل العكس ممكناً
    expect(p.settlementLines!.find((l) => l.rawMaterialId === 'rm-1')?.delta).toBe(-300);
  });

  it('إعادة الفتح تُصفّر بصمة التسوية (تُعكَس في الشاشة قبل النداء)', () => {
    usePeriodStore.setState({
      monthlyInventory: [{
        id: 'mi-4', branchId: B, monthKey: '2027-01', status: 'closed', items: [],
        settlementAppliedAt: 'x', settlementShortages: 2, settlementNetVariance: -500,
        settlementLines: [{ rawMaterialId: 'rm-1', delta: -300 }],
      }],
      closedMonths: ['2027-01'],
    } as never);
    usePeriodStore.getState().reopenMonthlyInventory('mi-4');
    const p = usePeriodStore.getState().monthlyInventory[0];
    expect(p.status).toBe('counting');
    // البصمة صُفِّرت: الفترة عادت قيد الجرد، وأي تسوية متبقية كانت ستُقفل
    // مرتين بلا سجل لما طُبِّق.
    expect(p.settlementLines).toBeUndefined();
    expect(p.settlementNetVariance).toBeUndefined();
    expect(p.settlementAppliedAt).toBeUndefined();
    expect(usePeriodStore.getState().closedMonths).not.toContain('2027-01');
  });
});