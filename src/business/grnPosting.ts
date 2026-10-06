// ترحيل إشعار الاستلام إلى المخزون — منطق نقي مُختبَر منفصل عن المتجر.
//
// المشكلة التي تحلّها: المسار يعرض «مسودة ← مراجعة ← اعتماد ← ترحيل»، لكن
// الحالة في النوع 'draft' | 'submitted' | 'approved' | 'rejected' — لا 'posted'.
// فالخطوة الرابعة لا تُبلَغ أبداً، والاعتماد لا يرفع المخزون: 415 إشعاراً
// «معتمد» بلا أثر على الكميات.
//
// المخاطرة الأساسية في الترحيل التلقائي: التكرار. إن رُحّل إشعار له حركات
// أصلاً (مستوردة من بناء أقدم) تتضاعف الكميات. لذلك نرفض الترحيل إن وُجدت
// حركات بنفس المرجع — وهذا ما تفحصه hasMovements.

export interface PostItem {
  rawMaterialId: string;
  quantityReceived: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface PostPlanInput {
  status: string;
  items: PostItem[];
  /** حركات موجودة مسبقاً بنفس المرجع */
  existingMovementRefs: string[];
  /** أقل كمية تُرحَّل — لا معنى لترحيل صفر */
  minQty?: number;
}

export interface PostLine {
  rawMaterialId: string;
  qty: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
}

export type PostPlan =
  | { ok: true; lines: PostLine[]; total: number }
  | { ok: false; reason: 'not_approved' | 'no_items' | 'already_posted' | 'missing_material' | 'zero_qty'; detail?: string };

/**
 * يبني خطة الترحيل أو يرفضها بسبب محدَّد.
 *
 * reasons:
 *  - not_approved     : لا يُرحَّل إلا المعتمد
 *  - already_posted   : حركات موجودة بنفس المرجع ⇒ ترحيل ثانٍ = مضاعفة
 *  - no_items         : لا أصناف
 *  - missing_material : صنف بلا معرّف ⇒ يتعذّر تحديد أي فرع/مخزون
 *  - zero_qty         : كل الكميات صفرية
 */
export function planPosting(ref: string, input: PostPlanInput): PostPlan {
  if (input.status !== 'approved') {
    return { ok: false, reason: 'not_approved', detail: `الحالة ${input.status} — الترحيل للمعتمد فقط` };
  }
  if (input.existingMovementRefs.includes(ref)) {
    return { ok: false, reason: 'already_posted', detail: 'توجد حركات مخزون بهذا الإشعار مسبقاً — الترحيل سيضاعف الكميات' };
  }
  if (!input.items.length) return { ok: false, reason: 'no_items' };

  const min = input.minQty ?? 0.0001;
  const lines: PostLine[] = [];
  for (const it of input.items) {
    if (!it.rawMaterialId) return { ok: false, reason: 'missing_material' };
    const qty = Number(it.quantityReceived) || 0;
    if (qty < min) continue;                       // نتجاوز الصفوف الفارغة بدل رفض الكل
    lines.push({
      rawMaterialId: it.rawMaterialId,
      qty: Math.round(qty * 10000) / 10000,
      unitPrice: Number(it.unitPrice) || 0,
      batchNumber: it.batchNumber || undefined,
      expiryDate: it.expiryDate || undefined,
    });
  }
  if (!lines.length) return { ok: false, reason: 'zero_qty' };

  return { ok: true, lines, total: lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) };
}

/** خطة الترحيل العكسي: نفس البنود لكن سالبة، لعكس أثر رُحِّل. */
export function planUnposting(lines: PostLine[]): { deltas: { rawMaterialId: string; delta: number; batchNumber?: string; expiryDate?: string }[]; total: number } {
  const deltas = lines.map((l) => ({ rawMaterialId: l.rawMaterialId, delta: -l.qty, batchNumber: l.batchNumber, expiryDate: l.expiryDate }));
  return { deltas, total: deltas.reduce((s, d) => s + d.delta * (lines.find((l) => l.rawMaterialId === d.rawMaterialId)?.unitPrice || 0), 0) };
}