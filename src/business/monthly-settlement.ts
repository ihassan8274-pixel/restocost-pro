// تسوية إقفال الجرد الشهري — منطق نقي مستخرج من periodStore.
// كان closeMonthlyInventory يكتفي بـ status:'closed': لا يمسّ المخزون ولا
// يقيّد قيداً محاسبياً، رغم أن نص الشاشة يعد بـ"يُحوَّل الفرق إلى المخزون
// مع قيد محاسبي (acc-inv مقابل acc-cogs)". فالفرق بين الدفتري والفعلي كان
// يختفي بلا أثر — وهو ما يجعل الجرد بلا قيمة محاسبية.
//
// القواعد:
//   shortfall = الرصيد الدفتري − المعدود  ⇒ موجب = عجز (استهلاك/هدر غير مُسجَّل)
//   surplus   = المعدود − الرصيد الدفتري  ⇒ موجب = فائض
// التسوية = differencePassed: كل فرق يُعدَّل ليطابق المعدود بالضبط.

export interface SettlementLine {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  /** الرصيد الدفتري وقت الجرد (الافتراضي النظري في الشهر). */
  bookQty: number;
  /** العد الفعلي الذي أدخله المستخدم. */
  countedQty: number;
  /** countedQty − bookQty : موجب فائض، سالب عجز. */
  delta: number;
  unitCost: number;
  /** قيمة الفرق بالتكلفة (سالب = عجز يُقيَّد كمصروف). */
  varianceCost: number;
  kind: 'shortage' | 'surplus';
}

export interface SettlementPlan {
  lines: SettlementLine[];
  shortages: SettlementLine[];
  surpluses: SettlementLine[];
  totalShortageValue: number;
  totalSurplusValue: number;
  netVarianceValue: number;
  /** صنف واحد على الأقل اختلف ⇒ يستحق قيداً محاسبياً. */
  hasVariance: boolean;
}

/** يُعيد تسوية بين الدفتري والمعدود، صفراً للأصناف المتطابقة. */
export const buildMonthlySettlement = (items: {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  theoreticalQty: number;
  countedQty: number;
  unitCost: number;
}[]): SettlementPlan => {
  const lines: SettlementLine[] = [];
  for (const it of items) {
    const book = Number(it.theoreticalQty) || 0;
    const counted = Number(it.countedQty) || 0;
    const delta = Number((counted - book).toFixed(4));
    if (Math.abs(delta) < 0.0001) continue;   // متطابق — لا حركة ولا قيد
    const unitCost = Number(it.unitCost) || 0;
    lines.push({
      rawMaterialId: it.rawMaterialId,
      itemName: it.itemName,
      unit: it.unit,
      bookQty: book,
      countedQty: counted,
      delta,
      unitCost,
      varianceCost: Number((delta * unitCost).toFixed(2)),
      kind: delta < 0 ? 'shortage' : 'surplus',
    });
  }
  const shortages = lines.filter((l) => l.kind === 'shortage');
  const surpluses = lines.filter((l) => l.kind === 'surplus');
  const totalShortageValue = Number(shortages.reduce((s, l) => s + l.varianceCost, 0).toFixed(2));
  const totalSurplusValue = Number(surpluses.reduce((s, l) => s + l.varianceCost, 0).toFixed(2));
  return {
    lines,
    shortages,
    surpluses,
    totalShortageValue,
    totalSurplusValue,
    netVarianceValue: Number((totalSurplusValue + totalShortageValue).toFixed(2)),
    hasVariance: lines.length > 0,
  };
};

/**
 * وصف القيد المحاسبي الناتج (لعرضه على المستخدم قبل الترحيل).
 * ملاحظة: يقبل acc-cogs أو acc-inv (لأن المطبخ = مخزون فرعي من المخزون).
 * الفائض: مدين acc-inv / مدين acc-cogs (زيادة مخزون = تكلفة مخزون مضافة).
 * ملاحظة: الاتجاه الدقيق للمدين/الدائن علىifecycle التكلفة يُراجَع مع المحاسب،
 * هنا نوثّق الأثر (استهلاك/زيادة) والقيم فقط.
 */
export const describeSettlementEntry = (plan: SettlementPlan, monthLabel: string) => {
  if (!plan.hasVariance) return null;
  const parts: string[] = [];
  if (plan.totalShortageValue !== 0) {
    parts.push(`عجز مخزون بقيمة ${Math.abs(plan.totalShortageValue).toFixed(2)} ر.س على ${plan.shortages.length} صنف (استهلاك/هدر غير مُسجَّل)`);
  }
  if (plan.totalSurplusValue !== 0) {
    parts.push(`فائض مخزون بقيمة ${plan.totalSurplusValue.toFixed(2)} ر.س على ${plan.surpluses.length} صنف (زيادة غير مُسجَّلة)`);
  }
  return `تسوية إقفال جرد ${monthLabel}: ${parts.join(' · ')}. صافي الأثر ${plan.netVarianceValue.toFixed(2)} ر.س`;
};
