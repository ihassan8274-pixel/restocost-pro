// بناء سطور الجرد الشهري — منطق نقي مستخرج من useAppCompat (كان 1,277 سطراً
// يجمع getters و getters وأفعال حالة في مكان واحد).
//
// ⭐ المعادلة (2026-10): الرصيد الدفتري = **دفتر الحركات**، لا افتتاحي + مشتريات.
// السبب: الاستهلاك (المبيعات) غير مُسجَّل حركة في المخزون لأن إعداد "خصم
// المبيعات" غير مُنفَّذ. فمعادلة "افتتاحي + مشتريات" رصيدٌ لا ينزل أبداً:
// يرتفع مع كل استلام ويبقى معلّقاً رغم أن المخزون الحقيقي ينزف بالبيع. عند
// الإقفال كان الفرق = استهلاك الشهر كله يُكتب حركة واحدة سالبة ضخمة باسم
// "تسوية جرد"، فيصير الرصيد سالباً بلا حركة يدوية من المستخدم.
// دفتر الحركات هو المرجع الوحيد: إن كان منه رصيد نستخدمه، وإلا نرجع
// للمعادلة القديمة (سلوك ما قبل هذا الإصلاح، للمختبرات وللمستدعين القدامى).
// الطرف المستهلِك يمرّر البيانات ويعيد MonthlyInventoryItem[]؛ لا حالة هنا.

import type {
  MonthlyInventoryItem, RawMaterial, GoodsReceiptNote, StockTransfer, OpeningBalanceRecord,
} from '../types';

export interface MonthlyCountSources {
  rawMaterials: Pick<RawMaterial, 'id' | 'nameAr' | 'unit' | 'isActive'>[];
  grnNotes: Pick<GoodsReceiptNote, 'status' | 'branchId' | 'date' | 'items'>[];
  stockTransfers: Pick<StockTransfer, 'status' | 'fromBranchId' | 'toBranchId' | 'date' | 'items'>[];
  openingBalances: Pick<OpeningBalanceRecord, 'branchId' | 'date' | 'items'>[];
  /**
   * الرصيد الدفتري الفعلي من دفتر حركات المخزون.
   * `undefined` ⇒ لا يوجد صف دفتر للصنف ⇒ ترجع الدالة للمعادلة القديمة.
   * الصفر الصادق (دفتر يقول صفر) يُحترم ولا يُعامل كغياب.
   */
  ledgerBalanceOf?: (branchId: string, rawMaterialId: string) => number | undefined;
  /** متوسط تكلفة الفرع للصنف عند بداية الشهر. */
  unitCostOf: (branchId: string, rawMaterialId: string) => number;
}

/**
 * الجرد الشهري لفرع وشهر. تُرجع فقط الأصناف التي لها حركة أو
 * رصيد (صفر لا معنى لأرقامه)، مع theoreticalUsage = الرصيد النظري.
 */
export const buildMonthlyCountItems = (
  branchId: string,
  monthKey: string,
  src: MonthlyCountSources,
): MonthlyInventoryItem[] => {
  const monthStart = `${monthKey}-01`;
  const inMonth = (d: string) => String(d).slice(0, 7) === monthKey;
  // محرّكات وحدها (بلا recipes) — الصنف لا يُحوَّل كصنف مصنّع
  const isRaw = (i: { itemType?: string; rawMaterialId?: string }) =>
    i.itemType !== 'recipe' && typeof i.rawMaterialId === 'string';

  const latestOpening = src.openingBalances
    .filter((ob) => ob.branchId === branchId && String(ob.date).slice(0, 10) <= monthStart)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  const items: MonthlyInventoryItem[] = [];
  for (const mat of src.rawMaterials) {
    if (!mat.isActive) continue;
    const mid = mat.id;

    const openingQty = latestOpening?.items.find((i) => i.rawMaterialId === mid)?.quantity ?? 0;

    const purchasedQty = src.grnNotes
      .filter((g) => g.status === 'approved' && g.branchId === branchId && inMonth(g.date))
      .reduce((sum, g) => sum + g.items.filter((i) => i.rawMaterialId === mid)
        .reduce((s, i) => s + (Number(i.quantityReceived) || 0), 0), 0);

    const transferredIn = src.stockTransfers
      .filter((t) => t.status === 'approved' && t.toBranchId === branchId && inMonth(t.date))
      .reduce((sum, t) => sum + t.items.filter(isRaw)
        .filter((i) => i.rawMaterialId === mid)
        .reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);

    const transferredOut = src.stockTransfers
      .filter((t) => t.status === 'approved' && t.fromBranchId === branchId && inMonth(t.date))
      .reduce((sum, t) => sum + t.items.filter(isRaw)
        .filter((i) => i.rawMaterialId === mid)
        .reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);

    // الدفتر أولاً: إن كان له صف رصيد فهو المرجع (يشمل الاستهلاك المسجَّل
    // كحركة: هدر، تصنيع، تحويلات). وإلا فالمعادلة القديمة احتياطاً.
    const ledger = src.ledgerBalanceOf?.(branchId, mid);
    const hasLedger = typeof ledger === 'number' && Number.isFinite(ledger);
    const rawTheoretical = hasLedger
      ? (ledger as number)
      : openingQty + purchasedQty + transferredIn - transferredOut;
    // بلا Math.max(0): كان يقصّ السالب ويخفي أن الدفتر عليه رصيد سالب.
    // الصادق أن يظهر سالباً ويُراجَع، لا أن يُعرض صفراً.
    const theoreticalUsage = rawTheoretical;

    // بلا حركة وبلا رصيد: لا صفّ يُدخله المستخدم ويضخّم الجدول بلا فائدة.
    if (rawTheoretical === 0 && openingQty === 0 && purchasedQty === 0 && transferredIn === 0 && transferredOut === 0) continue;

    items.push({
      rawMaterialId: mid,
      itemName: mat.nameAr,
      unit: mat.unit,
      openingQty,
      purchasedQty,
      transferredIn,
      transferredOut,
      theoreticalQty: theoreticalUsage,
      countedQty: 0,
      varianceQty: 0,
      unitCost: src.unitCostOf(branchId, mid),
      varianceCost: 0,
      theoreticalUsage,
      actualUsage: 0,
      usageVariance: 0,
    });
  }
  return items;
};