import { describe, it, expect } from 'vitest';
import { isPrimitiveArray, removedValuesBetween, removedIdsBetween } from './collection-tombstone';
import { useSettingsStore } from '../stores/settingsStore';

// customRoles قائمة نصوص بلا id ⇒ isRecordArray ترفضها ⇒ لا شاهد (فحذف دور
// مخصص كان يعود). currencies مفتاحه code لا id ⇒ كان mergeById يسقطها من كل
// دمج (أسوأ من الحذف: Malaysia عملات تختفي). كلاهما أُصلح.

describe('شواهد القيم النصية (customRoles)', () => {
  it('isPrimitiveArray يفرّق عن isRecordArray', () => {
    expect(isPrimitiveArray(['أ', 'ب'])).toBe(true);
    expect(isPrimitiveArray([1, 2, 3])).toBe(true);
    expect(isPrimitiveArray([{ id: 'x' }])).toBe(false);
    expect(isPrimitiveArray(['أ', { id: 'x' }])).toBe(false); // مختلط
    expect(isPrimitiveArray([])).toBe(true); // فارغ يُعامل كنصوص
  });

  it('removedValuesBetween يلتقط القيم النصية المحذوفة', () => {
    expect(removedValuesBetween(['مدير', 'شيف', 'كاشير'], ['مدير', 'كاشير'])).toEqual(['شيف']);
  });

  it('لاвидrink شاهد على القيم غير النصية', () => {
    expect(removedValuesBetween([{ id: 'a' }], [])).toEqual([]);
    expect(removedValuesBetween(null, [])).toEqual([]);
  });

  it('يطبّع الأرقام إلى نصوص ويزيل التكرار', () => {
    expect(removedValuesBetween([1, 2, 2, 3], [1])).toEqual(['2', '3']);
  });

  it('الفارغ‑إلى‑الفارغ لا شاهد (لا إفراغ Wider قائمة)', () => {
    expect(removedValuesBetween([], [])).toEqual([]);
    // تحويل من كائنات إلى نصوص: لاDestructive شواهد
    expect(removedValuesBetween([{ id: 'a' }], ['x'])).toEqual([]);
  });

  it('removedIdsBetween لا يزال يتطلب سجلات (سلوكه لم يتغيّر)', () => {
    expect(removedIdsBetween([{ id: 'a' }], [])).toEqual(['a']);
    expect(removedIdsBetween(['نص'], [])).toEqual([]);
  });
});

describe('currencies لها id للدمج على الخادم', () => {
  it('addCurrency يولّد id مشتقاً من code', () => {
    useSettingsStore.setState({ currencies: [] });
    useSettingsStore.getState().addCurrency({ code: 'usd', nameAr: 'دولار', symbol: '$', rateToBase: 3.75, isActive: true });
    const cur = useSettingsStore.getState().currencies[0];
    expect(cur.code).toBe('USD'); // يُطبّع لكبير
    expect(cur.id).toBe('cur-USD'); // id مشتق — ثابت
  });

  it('updateCurrency لا يفقد id', () => {
    useSettingsStore.setState({ currencies: [{ id: 'cur-EUR', code: 'EUR', nameAr: 'يورو', symbol: '€', rateToBase: 4.1, isActive: true }] });
    useSettingsStore.getState().updateCurrency('EUR', { rateToBase: 4.2 });
    expect(useSettingsStore.getState().currencies[0].id).toBe('cur-EUR');
    expect(useSettingsStore.getState().currencies[0].rateToBase).toBe(4.2);
  });

  it('لا تكرار: نفس الرمز يُتجاهل', () => {
    useSettingsStore.setState({ currencies: [{ id: 'cur-SAR', code: 'SAR', nameAr: 'ريال', symbol: 'ر', rateToBase: 1, isActive: true }] });
    useSettingsStore.getState().addCurrency({ code: 'SAR', nameAr: 'مكرر', symbol: 'ر', rateToBase: 1, isActive: true });
    expect(useSettingsStore.getState().currencies.length).toBe(1);
  });
});