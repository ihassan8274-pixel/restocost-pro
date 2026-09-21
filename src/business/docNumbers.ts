export interface DocNumberOpts {
  /** أرقام النماذج الموجودة من نفس النوع — يُحسب أعلى تسلسل +1 */
  existing?: string[];
  /** قسم وسيط اختياري بين الاختصار والسنة (مثل فرع أو نوع فاتورة) */
  segment?: string;
  /** تضمين السنة في الرقم (افتراضي نعم) */
  year?: boolean;
  /** عدد خانات الرقم التسلسلي (افتراضي 4) */
  digits?: number;
}

/**
 * توليد رقم تسلسلي منتظم لنموذج (مش عشوائي):
 * يفحص أعلى رقم موجود بصيغة الاختصار الحالية ثم يليه برقم واحد.
 * مثال: PO-2026-0007 → PO-2026-0008
 */
export const nextDocSequence = (prefix: string, opts: DocNumberOpts = {}): string => {
  const { existing = [], segment = '', year = true, digits = 4 } = opts;
  const cy = new Date().getFullYear();
  const base = segment ? `${prefix}-${segment}` : prefix;
  const re = year
    ? new RegExp(`^${base}-${cy}-(\\d+)$`)
    : new RegExp(`^${base}-(\\d+)$`);
  let max = 0;
  for (const n of existing) {
    if (typeof n !== 'string') continue;
    const m = n.match(re);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v > max) max = v;
    }
  }
  const seq = String(max + 1).padStart(digits, '0');
  return year ? `${base}-${cy}-${seq}` : `${base}-${seq}`;
};