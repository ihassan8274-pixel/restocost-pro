// ترقيم خفيف بالنقطة (cursor) لمفتاح قائمة واحد — للمجموعات الكبيرة (مثل Recipes).
// cursor معتم (base64url) يحمل المؤشر {i, id}: يقفز بعد آخر سجل أرسلناه؛ إذا تغيّر
// الترتيب/حُذف سجل نعيد التموضع بمعرّف آخر سجل، فيبقى الترحيل مستقراً وسط التعديلات.

export const decodeCursor = (c) => {
  try {
    const parsed = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    return { i: Number(parsed.i) || 0, id: parsed.id != null ? String(parsed.id) : null };
  } catch {
    return { i: 0, id: null };
  }
};

export const encodeCursor = (i, last) => {
  const id = last && last.id !== undefined ? String(last.id) : null;
  return Buffer.from(JSON.stringify({ i, id })).toString('base64url');
};

const recordId = (r) => (r && r.id !== undefined ? String(r.id) : null);

export const paginateCollection = (arr, rawCursor, limit) => {
  const total = Array.isArray(arr) ? arr.length : 0;
  if (total === 0) return { items: [], total: 0, nextCursor: null, start: 0 };
  const lim = Math.max(1, Math.min(2000, Number(limit) || 500));
  let start = 0;
  if (rawCursor) {
    const c = decodeCursor(rawCursor);
    if (c.id != null) {
      const idx = Array.isArray(arr) ? arr.findIndex((r) => recordId(r) === c.id) : -1;
      start = idx >= 0 ? idx + 1 : c.i;
    } else {
      start = c.i;
    }
  }
  const items = Array.isArray(arr) ? arr.slice(start, start + lim) : [];
  const nextCursor = start + items.length < total ? encodeCursor(start + items.length, items[items.length - 1]) : null;
  return { items, total, nextCursor, start };
};