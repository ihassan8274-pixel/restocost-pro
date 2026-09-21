import { describe, it, expect } from 'vitest';
import { buildCountItems, cleanCountInput, countFilled, countProgress } from '../business/counting';

interface Mat {
  id: string;
  nameAr: string;
  purchaseUnit: string | undefined;
  purchaseUnitConversion: number;
  unit: string;
  standardPrice: number;
  purchaseUnitPrice: number;
}

const carton = (): Mat => ({
  id: 'm-carton', nameAr: 'زيت', purchaseUnit: 'كرتون', purchaseUnitConversion: 12, unit: 'زجاجة',
  standardPrice: 8, purchaseUnitPrice: 96,
});
const single = (): Mat => ({
  id: 'm-single', nameAr: 'ملح', purchaseUnit: undefined, purchaseUnitConversion: 1, unit: 'كغم',
  standardPrice: 2, purchaseUnitPrice: 0,
});

describe('counting — عمودا كمية جرد الموبايل', () => {
  it('cleanCountInput: يزيل كل ما ليس رقماً أو نقطة', () => {
    expect(cleanCountInput('12abc')).toBe('12');
    expect(cleanCountInput('-3.5')).toBe('3.5');
    expect(cleanCountInput('')).toBe('');
  });

  it('countFilled: يُعدّ الإدخال الصحيح فقط', () => {
    expect(countFilled()).toBe(false);
    expect(countFilled({ p: '', s: '' })).toBe(false);
    expect(countFilled({ p: '0', s: '' })).toBe(true);
    expect(countFilled({ p: '42', s: '' })).toBe(true);
    expect(countFilled({ p: '', s: '3.5' })).toBe(true);
  });

  it('countProgress: نسبة الأصناف المعدودة', () => {
    const counts = { a: { p: '1', s: '' }, b: { p: '', s: '' } };
    expect(countProgress(counts, 4)).toBe(25);
    expect(countProgress(counts, 0)).toBe(0);
  });

  it('بناء السطر: كرتون (معامل 12) → يجمع الصندوق × 12 + الزجاجات في المخزون الفعلي', () => {
    const items = buildCountItems([carton()], { 'm-carton': { p: '2', s: '3' } });
    expect(items).toHaveLength(1);
    expect(items[0].countedStorage).toBe(2 * 12 + 3); // 27 زجاجة
    expect(items[0].countedQty).toBeCloseTo(27 / 12, 3); // وحدات الشراء
    expect(items[0].unit).toBe('كرتون');
  });

  it('المادة بلا وحدة شراء: p مباشرة ككمية مخزون', () => {
    const items = buildCountItems([single()], { 'm-single': { p: '4', s: '1' } });
    expect(items[0].countedStorage).toBe(5);
    expect(items[0].countedQty).toBe(5);
  });

  it('استبعاد الأصناف غير المعدودة', () => {
    const items = buildCountItems([carton(), single()], { 'm-carton': { p: '1', s: '' } });
    expect(items).toHaveLength(1);
    expect(items[0].rawMaterialId).toBe('m-carton');
  });

  it('النظري والاستهلاك: النظامي من مجاميع المخزون بالكمية المنقوصة (هدر)', () => {
    const theo = { 'm-carton': 30 }; // 30 زجاجة نظامية
    const items = buildCountItems([carton()], { 'm-carton': { p: '2', s: '0' } }, theo);
    // معدود = 24 زجاجة → نقص 6 زجاجات = 0.5 كرتون
    expect(items[0].theoreticalStorage).toBe(30);
    expect(items[0].theoreticalQty).toBeCloseTo(30 / 12, 3);
    expect(items[0].consumedQty).toBeCloseTo((30 - 24) / 12, 3);
  });

  it('قيمة الهدر = الاستهلاك × سعر وحدة الشراء', () => {
    const theo = { 'm-carton': 30 };
    const items = buildCountItems([carton()], { 'm-carton': { p: '2', s: '0' } }, theo);
    expect(items[0].consumedValue).toBeCloseTo(((30 - 24) / 12) * 96, 2);
  });

  it('تثبيت الأخطاء العشرية في كميات المخزون (3 خانات)', () => {
    const items = buildCountItems([{ ...carton(), purchaseUnitConversion: 0.7 }], { 'm-carton': { p: '3', s: '' } });
    expect(items[0].countedStorage).toBe(Number((2.1).toFixed(3)));
  });
});