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

/**
 * مثل nextDocSequence لكن لا تُعيد رقماً موجوداً في existing.
 *
 * يحمي: استدعاءان على الجهاز نفسه قبل تحديث الحالة (كان يُنتجان نفس الرقم).
 * لا يحمي: جهازان يكتبان في اللحظة نفسها — كلٌّ يقرأ max من نسخته المحلية
 * فيحسب max+1 نفسه (وقع ذلك في GRN-2026-0394: معرّفان، رقم واحد، نفس المورّد
 * والمبلغ). الحل الجذري تخصيص التسلسل على الخادم (مسار API)، وهو تغيير
 * معماري أوسع من هذا الملف.
 */
export const uniqueDocSequence = (prefix: string, opts: DocNumberOpts = {}): string => {
  const { existing = [], segment = '', year = true } = opts;
  const scratch = existing.filter((n) => typeof n === 'string');
  for (let i = 0; i < 500; i++) {
    const candidate = nextDocSequence(prefix, { ...opts, existing: scratch });
    if (!scratch.includes(candidate)) return candidate;
    scratch.push(candidate);   // ادفع الحد الأقصى واحداً وأعد الحساب
  }
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  return year
    ? `${segment ? `${prefix}-${segment}` : prefix}-${new Date().getFullYear()}-${stamp}`
    : `${prefix}-${stamp}`;
};