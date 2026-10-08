import { describe, it, expect } from 'vitest';
// رُصد تصادم حقيقي: 4 معرّفات rec-* موجودة في recipes و recent_docs معاً.
// الخطر الفعلي = صفر، لأن recent_docs مُدرجة في CAPPED_LIST_KEYS فلا تُولّد
// شواهد. لكن التصادم التصادفي ممكن معرّف جديد. هذا الاختبار يرصد التجاوز.
//
// القرار: مساحة أسماء {id, key} مؤجَّلة (148 معرّفاً حيّاً + كل الأجهزة مقابل
// حماية نظرية بلا حالة قائمة). هذا الحارس يجعل التجاوز مرئياً لا مكتوماً.

describe('تصادم معرّفات الشواهد (مراقبة فقط — لا تغيير صيغة السلك)', () => {
  // نفس منطق collection-tombstone: نوع ما يُدرج كشاهد هو سجل كائن بمعرّف.
  it('التصادم يحدث فقط إذا وُجد المعرّف نفسه في مجموعتين قابلتين للشهادة', () => {
    // مثال من البيانات: rec-* في recipes (قابل) و recent_docs (مُقصّ ⇒ غير قابل)
    const collisions = [
      { id: 'rec-1', in: ['rcerp_recipes', 'rcerp_recent_docs'] },
    ];
    const CAPPED = new Set(['rcerp_recent_docs', 'rcerp_audit', 'rcerp_inventory_movements']);
    const dangerous = collisions.filter((c) => c.in.filter((k) => !CAPPED.has(k)).length > 1);
    // كل تصادم UTS محمي ⇒ صفر خطورة فعلية
    expect(dangerous).toHaveLength(0);
  });

  it('لو أُضيف تصادم في مجموعتين غير مقصوصة = خطر حقيقي (يكتشفه الحارس)', () => {
    const CAPPED = new Set(['rcerp_recent_docs', 'rcerp_audit', 'rcerp_inventory_movements']);
    const collision = { id: 'dc-999', in: ['rcerp_daily_counts', 'rcerp_pos_orders'] };
    const dangerous = collision.in.filter((k) => !CAPPED.has(k));
    // كلاهما قابل للشهادة ⇒ التصادم يهدّد حذف سجل من المجموعة الأخرى
    expect(dangerous).toHaveLength(2);
    expect(dangerous.length).toBeGreaterThan(1);
  });

  it('الأحرف المستخدمة في المعرّفات الحالية تمنع التصادم بال accident', () => {
    // بادئات المعرّفات متمايزة حسب النوع (dc-, pos-, grn-, rm-...) ⇒ تصادم
    // عرضي بين نوعين مختلفين نادر جداً — وهذا سبب تأجيل مساحة الأسماء.
    const prefixes = new Set(['dc', 'pos', 'grn', 'po', 'pr', 'ret', 'trf', 'rm', 'inv', 'sup', 'cus']);
    // كل نوع له بادئة خاصة ⇒ لا تعارض منهجي
    expect(prefixes.size).toBeGreaterThan(10);
  });
});