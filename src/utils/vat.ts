export interface VatSplit {
  vat: number;
  total: number;
  net: number;
}

// تقسيم الضريبة الموحّد: rate = الكسر العشري (0.15)، inclusive = هل السعر المعطى شامل الضريبة؟
// عندما يكون شامل — net = صافي الإيراد، vat محسوبة من المبلغ الشامل، total = المبلغ كما هو.
// عند الاستبعاد — vat تُضاف فوق المبلغ، total = gross + vat، net = gross.
// القيم تُقرب إلى هللتين، والتخزين دائماً بالصافي (net) حتى لا تتغير التحليلات.
export const vatSplit = (gross: number, rate: number, inclusive: boolean): VatSplit => {
  const vat = Math.round(gross * rate * (inclusive ? 1 / (1 + rate) : 1) * 100) / 100;
  const total = Math.round((inclusive ? gross : gross + vat) * 100) / 100;
  const net = Math.round((inclusive ? gross - vat : gross) * 100) / 100;
  return { vat, total, net };
};

export const vatSplitOfPercent = (gross: number, percent: number, inclusive: boolean): VatSplit =>
  vatSplit(gross, percent / 100, inclusive);