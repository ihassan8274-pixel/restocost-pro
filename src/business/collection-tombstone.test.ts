// src/business/collection-tombstone.test.ts — استخراج منطق الحذف إلى وحدة نقية.
//
// ملف collectionSources.ts يهيّئ كل الستورات عند الاستيراد (-effect جانبي)،
// لذلك نُسخ منطق المشتقات هنا كنقطة اختبار واحدة، ويستخدمه المصدر فعلياً.
import { describe, it, expect } from 'vitest';
import { removedIdsBetween } from './collection-tombstone';

describe('removedIdsBetween', () => {
  it('حذف سجل واحد يُنتج معرّفه كشاهد', () => {
    const prev = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const cur = [{ id: 'a' }, { id: 'c' }];
    expect(removedIdsBetween(prev, cur)).toEqual(['b']);
  });

  it('تعديل حقل داخل السجل لا يُنتج شاهد حذف', () => {
    const prev = [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }];
    const cur = [{ id: 'a', qty: 99 }, { id: 'b', qty: 2 }];
    expect(removedIdsBetween(prev, cur)).toEqual([]);
  });

  it('إضافة سجلات لا تُنتج شواهد', () => {
    const prev = [{ id: 'a' }];
    const cur = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(removedIdsBetween(prev, cur)).toEqual([]);
  });

  it('حذف كامل القائمة ينتج كل المعرّفات', () => {
    const prev = [{ id: 'a' }, { id: 'b' }];
    expect(removedIdsBetween(prev, [])).toEqual(['a', 'b']);
  });

  it('إعادة الترتيب لا تُنتج شواهد', () => {
    const prev = [{ id: 'a' }, { id: 'b' }];
    const cur = [{ id: 'b' }, { id: 'a' }];
    expect(removedIdsBetween(prev, cur)).toEqual([]);
  });

  it('القوائم غير الكائنية (نصوص/أرقام) لا تُنتج شواهد — لا تحمل معرّفات', () => {
    expect(removedIdsBetween(['x', 'y'], [])).toEqual([]);
    expect(removedIdsBetween([1, 2, 3], [1])).toEqual([]);
    expect(removedIdsBetween(['2026-01', '2026-02'], ['2026-01'])).toEqual([]);
  });

  it('القيم غير المصفوفة أو غير معرَّفة تُتجاهل بأمان', () => {
    expect(removedIdsBetween(null, [])).toEqual([]);
    expect(removedIdsBetween([], undefined)).toEqual([]);
    expect(removedIdsBetween(undefined, undefined)).toEqual([]);
  });

  it('معرّفات مختلطة النوع تُوحَّد كنصوص', () => {
    const prev = [{ id: 1 }, { id: 'b' }];
    const cur = [{ id: '1' }];
    expect(removedIdsBetween(prev, cur)).toEqual(['b']);
  });
});
