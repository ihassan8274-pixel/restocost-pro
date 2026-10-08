import { describe, it, expect } from 'vitest';
import { buildMonthlyCountItems, type MonthlyCountSources } from './monthly-count';

// الكيانات بناء جرد شهري: افتتاحي + مشتريات معتمدة + تحويلات واردة
// − تحويلات صادرة. كانت داخل useAppCompat (1,4xx سطر) فلم تكن قابلة للاختبار
// وحدها؛ نُقلت إلى هنا نقيّة بلا حالة.

const src = (over: Partial<MonthlyCountSources> = {}): MonthlyCountSources => ({
  rawMaterials: [
    { id: 'm1', nameAr: 'سكر', unit: 'كغم', isActive: true },
    { id: 'm2', nameAr: 'دجاج', unit: 'كغم', isActive: false },
    { id: 'm3', nameAr: 'زيت', unit: 'لتر', isActive: true },
  ],
  grnNotes: [],
  stockTransfers: [],
  openingBalances: [],
  unitCostOf: () => 10,
  ...over,
});

describe('buildMonthlyCountItems', () => {
  it('يتجاهل الأصناف غير الفعّالة', () => {
    const out = buildMonthlyCountItems('b1', '2026-10', src({
      grnNotes: [{ status: 'approved', branchId: 'b1', date: '2026-10-05', items: [
        { rawMaterialId: 'm1', quantityReceived: 50 }, { rawMaterialId: 'm2', quantityReceived: 99 },
      ] }] as never,
    }));
    expect(out.map((i) => i.rawMaterialId)).not.toContain('m2');
  });

  it('opening + purchases − transfers out = theoretical', () => {
    const out = buildMonthlyCountItems('b1', '2026-10', src({
      openingBalances: [{ branchId: 'b1', date: '2026-09-30', items: [{ rawMaterialId: 'm1', quantity: 20 }] }] as never,
      grnNotes: [
        { status: 'approved', branchId: 'b1', date: '2026-10-03', items: [{ rawMaterialId: 'm1', quantityReceived: 30 }] },
        { status: 'draft', branchId: 'b1', date: '2026-10-04', items: [{ rawMaterialId: 'm1', quantityReceived: 999 }] },
        { status: 'approved', branchId: 'b2', date: '2026-10-05', items: [{ rawMaterialId: 'm1', quantityReceived: 777 }] },
        { status: 'approved', branchId: 'b1', date: '2026-09-30', items: [{ rawMaterialId: 'm1', quantityReceived: 555 }] },
      ] as never,
      stockTransfers: [
        { status: 'approved', fromBranchId: 'b1', toBranchId: 'b2', date: '2026-10-10', items: [{ itemType: 'raw_material', rawMaterialId: 'm1', quantity: 5 }] },
        { status: 'approved', fromBranchId: 'b2', toBranchId: 'b1', date: '2026-10-11', items: [{ itemType: 'raw_material', rawMaterialId: 'm1', quantity: 2 }] },
      ] as never,
    }));
    const m1 = out.find((i) => i.rawMaterialId === 'm1');
    expect(m1).toBeDefined();
    // 20 افتتاحي + 30 مشتريات (المعتمد فقط، فرعنا، داخل الشهر) + 2 وارد − 5 صادر = 47
    expect(m1!.openingQty).toBe(20);
    expect(m1!.purchasedQty).toBe(30);
    expect(m1!.transferredIn).toBe(2);
    expect(m1!.transferredOut).toBe(5);
    expect(m1!.theoreticalQty).toBe(47);
    expect(m1!.theoreticalUsage).toBe(47);
  });

  it('لا يطلب latest opening بعد بداية الشهر', () => {
    // افتتاحي بتاريخ داخل الشهر لا يُحتسب (الرصيد الافتتاحي سابق على الشهر)
    const out = buildMonthlyCountItems('b1', '2026-10', src({
      openingBalances: [{ branchId: 'b1', date: '2026-10-15', items: [{ rawMaterialId: 'm1', quantity: 40 }] }] as never,
    }));
    // لا شراء ولا تحويل ⇒ لا صفّ إطلاقاً (لا حركة وبلا رصيد سابق)
    expect(out).toEqual([]);
  });

  // ── دفتر الحركات هو المرجع (2026-10) ──────────────────────────────────────
  // الخلل: الرصيد = افتتاحي + مشتريات، ولا يُخصم منه الاستهلاك (المبيعات غير
  // مُسجَّلة حركة). فالدفتري ينمو بلا سقط، ويظهر الجرد كله عجزاً، والإقفال
  // يكتب الفرق حركة سالبة ضخمة باسم "تسوية جرد" ⇒ رصيد سالب بلا حركة يدوية.
  describe('دفتر الحركات يتقدّم على افتتاحي+مشتريات', () => {
    it('theoreticalQty = رصيد الدفتر لا افتتاحي+مشتريات', () => {
      const out = buildMonthlyCountItems('b1', '2026-10', src({
        openingBalances: [{ branchId: 'b1', date: '2026-09-30', items: [{ rawMaterialId: 'm1', quantity: 100 }] }] as never,
        grnNotes: [{ status: 'approved', branchId: 'b1', date: '2026-10-03', items: [{ rawMaterialId: 'm1', quantityReceived: 300 }] }] as never,
        // الدفتر يقول 70: استُهلك 330 بلا حركة (مبيعات) ⇒ هذا هو الرصيد
        ledgerBalanceOf: () => 70,
      }));
      const m1 = out.find((i) => i.rawMaterialId === 'm1');
      // 400 هي المعادلة القديمة — وهي بالضبط مصدر العجز الوهمي
      expect(m1!.theoreticalQty).toBe(70);
      expect(m1!.theoreticalUsage).toBe(70);
      // أعمدة العرض تبقى كما هي (توثّق ما ورد في الشهر)
      expect(m1!.openingQty).toBe(100);
      expect(m1!.purchasedQty).toBe(300);
    });

    it('رصيد الدفتر الصفري يُحترم ولا يُسقط بالقيمة القديمة', () => {
      // صفر صادق: الدفتر يقول صفر، والمعادلة القديمة تعطي 300 ⇒ نأخذ صفراً.
      const out = buildMonthlyCountItems('b1', '2026-10', src({
        grnNotes: [{ status: 'approved', branchId: 'b1', date: '2026-10-03', items: [{ rawMaterialId: 'm1', quantityReceived: 300 }] }] as never,
        ledgerBalanceOf: () => 0,
      }));
      expect(out.find((i) => i.rawMaterialId === 'm1')?.theoreticalQty).toBe(0);
    });

    it('undefined ⇒ ترجع للمعادلة القديمة (سلوك ما قبل الإصلاح)', () => {
      const out = buildMonthlyCountItems('b1', '2026-10', src({
        openingBalances: [{ branchId: 'b1', date: '2026-09-30', items: [{ rawMaterialId: 'm1', quantity: 20 }] }] as never,
        grnNotes: [{ status: 'approved', branchId: 'b1', date: '2026-10-03', items: [{ rawMaterialId: 'm1', quantityReceived: 30 }] }] as never,
        ledgerBalanceOf: () => undefined,
      }));
      expect(out.find((i) => i.rawMaterialId === 'm1')?.theoreticalQty).toBe(50);
    });

    it('سالب الدفتر يُعرض سالباً — لا قصّ Math.max(0)', () => {
      // كان يقصّه صفراً فيخفي أن الدفتر عليه رصيد سالب
      const out = buildMonthlyCountItems('b1', '2026-10', src({
        ledgerBalanceOf: () => -15,
      }));
      expect(out.find((i) => i.rawMaterialId === 'm1')?.theoreticalQty).toBe(-15);
    });

    it('صنف رصيده في الدفتر فقط يُدرَج — حتى بلا حركة في الشهر', () => {
      // الشهر الثاني بعد تسوية: لا شراء ولا تحويل ولا افتتاح في الشهر،
      // لكن الدفتر فيه رصيد ⇒ يجب أن يظهر صفّ الجرد لهذا الصنف.
      const out = buildMonthlyCountItems('b1', '2026-10', src({
        openingBalances: [{ branchId: 'b1', date: '2026-09-30', items: [{ rawMaterialId: 'm1', quantity: 40 }] }] as never,
        ledgerBalanceOf: (b, m) => (m === 'm1' ? 40 : undefined),
      }));
      expect(out.find((i) => i.rawMaterialId === 'm1')?.theoreticalQty).toBe(40);
    });
  });

  it('يتجاهل تحويلات الأصناف المصنّعة (recipes)', () => {
    const out = buildMonthlyCountItems('b1', '2026-10', src({
      stockTransfers: [{ status: 'approved', fromBranchId: 'b1', toBranchId: 'b2', date: '2026-10-10',
        items: [{ itemType: 'recipe', recipeId: 'r1', quantity: 100 }, { itemType: 'raw_material', rawMaterialId: 'm1', quantity: 3 }] }] as never,
    }));
    const m1 = out.find((i) => i.rawMaterialId === 'm1');
    expect(m1?.transferredOut).toBe(3); //Recipe لا يُحتسب
  });

  it('يتعامل معلا لا-رقمية وnull بأمان', () => {
    const out = buildMonthlyCountItems('b1', '2026-10', src({
      grnNotes: [{ status: 'approved', branchId: 'b1', date: '2026-10-05', items: [
        { rawMaterialId: 'm1', quantityReceived: 'abc' }, { rawMaterialId: 'm1', quantityReceived: 5 },
      ] }] as never,
    }));
    expect(out.find((i) => i.rawMaterialId === 'm1')?.purchasedQty).toBe(5);
  });
});
