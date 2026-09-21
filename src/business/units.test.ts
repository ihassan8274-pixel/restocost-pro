import { describe, it, expect } from 'vitest';
import {
  stockPerPurchase, tradePerStock, tradePerPurchase, tradeUnitName, tradeUnitPrice,
  stockToTrade, tradeToStock, purchaseUnitName, purchaseUnitPrice, conversionSummary,
} from '../business/units';

describe('units — نظام الوحدات الثلاث (شراء → مخزون → تداول)', () => {
  it('stockPerPurchase: المعامل الغائب أو الصحيح يساوي 1', () => {
    expect(stockPerPurchase()).toBe(1);
    expect(stockPerPurchase(null)).toBe(1);
    expect(stockPerPurchase({})).toBe(1);
    expect(stockPerPurchase({ purchaseUnitConversion: 0 })).toBe(1);
    expect(stockPerPurchase({ purchaseUnitConversion: 12 })).toBe(12);
  });

  it('tradePerStock: المعامل الغائب يساوي 1', () => {
    expect(tradePerStock()).toBe(1);
    expect(tradePerStock({ tradeUomConversion: 0 })).toBe(1);
    expect(tradePerStock({ tradeUomConversion: 0.7 })).toBe(0.7);
  });

  it('tradePerPurchase = purchase × trade (12 زجاجة كانتون × 0.7 لتر = 8.4 لتر)', () => {
    expect(tradePerPurchase({ purchaseUnitConversion: 12, tradeUomConversion: 0.7 })).toBeCloseTo(8.4, 5);
  });

  it('tradeUnitName: يعود لاسم التداول وإن غاب للوحدة المخزونية', () => {
    expect(tradeUnitName({ tradeUomName: 'لتر' })).toBe('لتر');
    expect(tradeUnitName({ unit: 'زجاجة' })).toBe('زجاجة');
    expect(tradeUnitName({ tradeUomName: '  ' })).toBe('');
  });

  it('tradeUnitPrice: سعر وحدة المخزون مقسوم على معامل التداول', () => {
    expect(tradeUnitPrice({ standardPrice: 8, tradeUomConversion: 0.7 })).toBeCloseTo(11.4286, 3);
    expect(tradeUnitPrice({ standardPrice: 8 })).toBe(8);
    expect(tradeUnitPrice(null)).toBe(0);
  });

  it('tradeUnitPrice: priceOverride يتخطى السعر القياسي', () => {
    expect(tradeUnitPrice({ standardPrice: 8, tradeUomConversion: 0.7 }, 14)).toBeCloseTo(20, 3);
  });

  it('stockToTrade / tradeToStock: تحويل دائري صحيح', () => {
    const m = { tradeUomConversion: 0.7 };
    expect(stockToTrade(12, m)).toBeCloseTo(8.4, 5);
    expect(tradeToStock(8.4, m)).toBeCloseTo(12, 5);
    expect(tradeToStock(5, {})).toBe(5);
  });

  it('purchaseUnitName: اللجوء لوحدة المخزون عند الغياب', () => {
    expect(purchaseUnitName({ purchaseUnit: 'كرتون' })).toBe('كرتون');
    expect(purchaseUnitName({ unit: 'زجاجة' })).toBe('زجاجة');
  });

  it('purchaseUnitPrice: السعر المباشر يغلب، وإلا (مخزون × معامل)', () => {
    expect(purchaseUnitPrice({ purchaseUnitPrice: 95, standardPrice: 8, purchaseUnitConversion: 12 })).toBe(95);
    expect(purchaseUnitPrice({ standardPrice: 8, purchaseUnitConversion: 12 })).toBe(96);
  });

  it('conversionSummary: يلخص سلاسل التحويل القابلة للعرض', () => {
    const s = conversionSummary({ purchaseUnit: 'كرتون', purchaseUnitConversion: 12, unit: 'زجاجة', tradeUomConversion: 0.7, tradeUomName: 'لتر' });
    expect(s).toContain('كرتون = 12 زجاجة');
    expect(s).toContain('12 زجاجة = 8.4 لتر');
    expect(conversionSummary(null)).toBe('');
  });
});