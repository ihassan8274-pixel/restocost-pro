import type { RawMaterial } from '../types';

// ==== نظام الوحدات الثلاث: شراء → مخزون → تداول (وصفات) ====
// وحدة الشراء: ما تُشترى به المادة (كرتون/جالون/صندوق)
// وحدة المخزون: الوحدة التي يُخزَّن بها (حبة/زجاجة/كجم)
// وحدة التداول: وحدة القياس المعيارية المستخدمة في الوصفات (لتر/كغم/جرام)

// عدد وحدات المخزون التي تُنتجها وحدة شراء واحدة
export const stockPerPurchase = (m?: Pick<RawMaterial, 'purchaseUnitConversion'> | null): number =>
  m && m.purchaseUnitConversion && m.purchaseUnitConversion > 0 ? m.purchaseUnitConversion : 1;

// عدد وحدات القياس (التداول) التي تُنتجها وحدة مخزون واحدة — معامل خاص لكل صنف
export const tradePerStock = (m?: Pick<RawMaterial, 'tradeUomConversion'> | null): number =>
  m && m.tradeUomConversion && m.tradeUomConversion > 0 ? m.tradeUomConversion : 1;

// عدد وحدات القياس التي تُنتجها وحدة شراء واحدة (من الشراء مباشرة إلى التداول)
export const tradePerPurchase = (m?: Pick<RawMaterial, 'purchaseUnitConversion' | 'tradeUomConversion'> | null): number =>
  stockPerPurchase(m) * tradePerStock(m);

// اسم وحدة التداول (الوحدة التي تُقيَّم بها الوصفة) — عند غيابها تلجأ لوحدة المخزون
export const tradeUnitName = (m?: ({ tradeUomName?: string } & Partial<Pick<RawMaterial, 'unit'>>) | null): string =>
  m && m.tradeUomName && m.tradeUomName.trim() ? m.tradeUomName : m?.unit || '';

// سعر وحدة القياس الواحدة (السعر الذي تُحسب عليه الوصفات)
// = سعر وحدة المخزون ÷ معامل التحويل (زجاجة بسعر 8.00 ÷ 0.7 = 11.43/لتر)
// priceOverride: سعر بديل لوحدة المخزون (مثل متوسط التكلفة من الاستلامات) — يُستخدم بدل السعر القياسي
export const tradeUnitPrice = (
  m?: Pick<RawMaterial, 'standardPrice' | 'tradeUomConversion'> | null,
  priceOverride?: number,
): number => {
  if (!m) return 0;
  const base = typeof priceOverride === 'number' && Number.isFinite(priceOverride) && priceOverride > 0
    ? priceOverride
    : m.standardPrice;
  const per = tradePerStock(m);
  return per > 0 ? base / per : base;
};

// تحويل كمية من وحدات المخزون إلى وحدات القياس (12 زجاجة × 0.7 = 8.4 لتر)
export const stockToTrade = (qty: number, m?: Pick<RawMaterial, 'tradeUomConversion'> | null): number =>
  qty * tradePerStock(m);

// تحويل كمية تداول إلى وحدات مخزون (للاستهلاك/الخصم من المخزون: 8.4 لتر ÷ 0.7 = 12 زجاجة)
export const tradeToStock = (qty: number, m?: Pick<RawMaterial, 'tradeUomConversion'> | null): number => {
  const per = tradePerStock(m);
  return per > 0 ? qty / per : qty;
};

// اسم وحدة الشراء — عند غيابها تلجأ لوحدة المخزون
export const purchaseUnitName = (m?: ({ purchaseUnit?: string } & Partial<Pick<RawMaterial, 'unit'>>) | null): string =>
  m && m.purchaseUnit && m.purchaseUnit.trim() ? m.purchaseUnit : m?.unit || '';

// سعر وحدة الشراء الواحدة = سعر الشراء المباشر أو (سعر المخزون × معامل التحويل)
export const purchaseUnitPrice = (m?: Pick<RawMaterial, 'purchaseUnitPrice' | 'standardPrice' | 'purchaseUnitConversion'> | null): number => {
  if (!m) return 0;
  if (m.purchaseUnitPrice && m.purchaseUnitPrice > 0) return m.purchaseUnitPrice;
  return (m.standardPrice || 0) * stockPerPurchase(m);
};

// وصف مقروء لسلسلة التحويل الكاملة للمادة: "كرتون (12 زجاجة) → 8.4 لتر"
export const conversionSummary = (m?: Pick<RawMaterial, 'purchaseUnit' | 'purchaseUnitConversion' | 'unit' | 'tradeUomConversion' | 'tradeUomName'> | null): string => {
  if (!m) return '';
  const parts: string[] = [];
  if (m.purchaseUnitConversion && m.purchaseUnitConversion > 1 && m.purchaseUnit) {
    parts.push(`${m.purchaseUnit} = ${m.purchaseUnitConversion} ${m.unit}`);
  }
  const per = tradePerStock(m);
  if (per !== 1 && m.tradeUomName) {
    const tradeQty = Number(tradePerPurchase(m).toFixed(4));
    parts.push(`${stockPerPurchase(m)} ${m.unit} = ${tradeQty} ${m.tradeUomName}`);
  }
  return parts.join(' — ');
};