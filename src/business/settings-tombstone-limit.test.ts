import { describe, it, expect } from 'vitest';
import { isRecordArray, idsOf, removedIdsBetween } from './collection-tombstone';

// المجموعات التي بقيت بلا witnessed بسبب بنيتها (ليست إهمالاً):
//  - rcerp_custom_roles : string[]  → لا id إطلاقاً، لا شاهد بمعرّف.
//  - rcerp_currencies   : المفتاح code لا id → لا يلتقط removedIdsBetween.
//  - rcerp_access_roles / automation_rules / scheduled_reports :
//    ADMIN_ONLY_KEYS على الخادم (canPurgeTombstone = false دائماً)، فحتى لو
//    أرسل العميل شاهداً يرفضه الخادم.
// هذا الاختبار يوثّق الحدّ الحالي ونقطة مداها، فأي توسّع لاحق مُغطّى.

describe('حدّ شاهد الحذف في مجموعات الإعدادات', () => {
  it('سجل بلا id لا يمكن أن يكون شاهداً (القيم النصية)', () => {
    const roles = ['شيف تنفيذي', 'مشرف وردية'];
    expect(isRecordArray(roles)).toBe(false);
    expect(removedIdsBetween(['مشرف'], roles)).toEqual([]);
  });

  it('سجل بمفتاح بديل (code) لا id لا يلتقطه removedIdsBetween', () => {
    const prev = [{ code: 'SAR', nameAr: 'ريال', symbol: 'ر', rateToBase: 1, isActive: true }];
    const cur: typeof prev = [];
    // كل عنصر كائن لكن بلا id ⇒ idsOf تُرجع [] ⇒ لا شاهد
    expect(removedIdsBetween(prev, cur)).toEqual([]);
    // وهذا بالضبط سبب استثناء rcerp_currencies
  });

  it('الشاهد يعمل للمجموعات التي لها id (الفروع/الشركات/الوحدات)', () => {
    const prev = [{ id: 'b-01', nameAr: 'فرع' }, { id: 'b-02', nameAr: 'فرع٢' }];
    const cur = [{ id: 'b-01', nameAr: 'فرع' }];
    expect(removedIdsBetween(prev, cur)).toEqual(['b-02']);
  });

  it('idsOf تتجاهل القيم بلا id بدل رمي undefined', () => {
    const arr = [{ id: 'a' }, { name: 'no id' }, { id: 'b' }] as { id?: unknown }[];
    expect(idsOf(arr)).toEqual(['a', 'b']);
  });
});