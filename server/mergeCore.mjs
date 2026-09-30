// server/mergeCore.mjs — دمج المجموعات الكاملة بمعرّف السجل مع تحكيم بالأحدثية.
// منفصلة عن مسارات الويب لتُختبَر وحدها (node --test) بلا سحب telegram/intake/pdf.

// ختم زمني لكل سجل: آخر تعديل مسجّل لدى الكاتب (ملليثانية). غيابه (بيانات قديمة) = 0.
export const mtimeOf = (r) =>
  (r && typeof r._mtime === 'number' && Number.isFinite(r._mtime)) ? r._mtime : 0;

// دمج مجموعة كاملة بمعرّف السجل:
// - السجل الأحدث (أعلى _mtime) يفوز عند تعارضه مع سجل آخر لنفس المعرّف —
//   نسخة قديمة من جهاز/تبويب آخر لا تعيد الاعتماد (إلى "قيد المراجعة") بعد وصولها.
// - عند تساوي/غياب _mtime يُحافظ على سلوك "الوارد يفوز" السابق (توافق مع البيانات القديمة).
// - يحترم شواهد الحذف: سجل مُحذف نهائياً لا يعود مهما حاول أي جهاز دفعه.
const isPrimitive = (v) => v === null || (typeof v !== 'object' && typeof v !== 'function');

// مصفوفات القيم البدائية (أشهر/أيام الإغلاق وغيرها): تُدمج بالاتحاد (union) —
// تضاف الجديدة فقط ولا يُحذف شيء (حذفها عبر rcerp_deleted_ids).
// كانت السلاسل تُسقط صامتاً (mergeById يسقط من لا يحمل id) فكان الإغلاق
// لا يصل الخادم إطلاقاً — أصل عطل قفل الفترات عبر الأجهزة.
export const mergeById = (existing, incoming, tombstones = new Set()) => {
  const ex = existing || [];
  const inc = incoming || [];
  if ((ex.length === 0 || ex.every(isPrimitive)) && inc.every(isPrimitive)) {
    const out = [];
    const seen = new Set();
    for (const v of [...ex, ...inc]) {
      if (v === null) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }
  const merged = new Map();
  (ex).forEach((r) => { if (r && r.id !== undefined) merged.set(r.id, r); });
  (inc).forEach((r) => {
    if (!r || r.id === undefined) return;
    const cur = merged.get(r.id);
    if (!cur) { merged.set(r.id, r); return; }
    if (mtimeOf(r) >= mtimeOf(cur)) merged.set(r.id, r);
  });
  if (tombstones.size === 0) return Array.from(merged.values());
  const out = [];
  merged.forEach((v) => { if (!v || v.id === undefined || tombstones.has(v.id)) return; out.push(v); });
  return out;
};

// حماية "الكتابة فوق المختصرة": هل هذا الاستبدال الوارد نسخة تجريبية صغيرة تطمس
// مجموعة كبيرة حقيقية مخزنة؟ تُرفَض هذه الأنماط فقط (مع محتوى صغير واضح) كي لا
// يعود جهازٌ خامل يُعيد إرسال سجلته الفارغة بالكامل فوق بيانات حية.
// القواعد:
//  - لا نملك بيانات سابقة (existing فارغ) → لا رفض أبداً.
//  - لا يوجد محتوى وارد (فارغ/غير مصفوفة) → لا رفض (تجاوز للمسحة اليدوية الصحيحة).
//  - المجموعات الـصغيرة (≤10000 بايت) لا تحتاج الحماية (لا جدوى من الخسارة).
//  - الوارد كبير نسبياً (≥500 بايت أو أكبر من 1/5 من الحالي) → وافِق (محادثة جادة).
// تُرجع reason في الحالة المرفوضة لتتبعه في السجلات.
export const shouldRejectShrink = (existing, incoming) => {
  try {
    if (existing === null || existing === undefined) return null;
    const incomingStr = JSON.stringify(incoming ?? null);
    if (!incomingStr) return null;
    const existingStr = JSON.stringify(existing);
    const inLen = incomingStr.length;
    const exLen = existingStr.length;
    if (exLen > 10000 && inLen > 0 && inLen < 500 && exLen > inLen * 5) {
      return { reason: 'shrink-overwrite-guard', inLen, exLen };
    }
    return null;
  } catch { return null; }
};