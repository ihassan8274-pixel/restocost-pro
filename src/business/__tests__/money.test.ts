import { describe, it, expect } from 'vitest';
import {
  roundMoney, addMoney, subMoney, mulMoney, applyVat, vatOf,
  divMoney, formatMoney, isZero, moneyEquals,
} from '../money';

describe('roundMoney — تقريب مصرفي يمنع التراكم', () => {
  it('0.1 + 0.2 يصبح 0.3 لا 0.30000000000000004', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('8.33 * 3 * 1.15 يصبح 28.74 لا 28.7385', () => {
    expect(roundMoney(8.33 * 3 * 1.15)).toBe(28.74);
  });

  it('100 * 1.15 يصبح 115 لا 114.99999999999999', () => {
    expect(roundMoney(100 * 1.15)).toBe(115);
  });

  it('القيم غير المنتهية تصفر', () => {
    expect(roundMoney(Infinity)).toBe(0);
    expect(roundMoney(NaN)).toBe(0);
  });
});

describe('addMoney — جمع آمن يمنع التراكم', () => {
  it('جمع ثلاثة مبالغ عشرية', () => {
    expect(addMoney(19.99, 19.99, 19.99)).toBe(59.97);
  });

  it('جمع مبلغ كبير من مبالغ صغيرة', () => {
    let sum = 0;
    for (let i = 0; i < 100; i++) sum = addMoney(sum, 0.1);
    expect(sum).toBe(10);
  });

  it('طرح آمن', () => {
    expect(subMoney(100, 33.33)).toBe(66.67);
  });
});

describe('mulMoney و applyVat — ضرب آمن', () => {
  it('ضرب في عدد صحيح', () => {
    expect(mulMoney(8.33, 3)).toBe(24.99);
  });

  it('ضرب في نسبة', () => {
    expect(mulMoney(100, 1.15)).toBe(115);
  });

  it('applyVat يضيف الضريبة', () => {
    expect(applyVat(100, 0.15)).toBe(115);
  });

  it('vatOf يحسب الضريبة فقط', () => {
    expect(vatOf(100, 0.15)).toBe(15);
  });

  it('قسمة آمنة على صفر تصفر', () => {
    expect(divMoney(100, 0)).toBe(0);
  });

  it('قسمة آمنة عادية', () => {
    expect(divMoney(100, 3)).toBe(33.33);
  });
});

describe('formatMoney و isZero و moneyEquals', () => {
  it('تنسيق بمنزلتين', () => {
    expect(formatMoney(10)).toBe('10.00');
    expect(formatMoney(10.5)).toBe('10.50');
  });

  it('isZero', () => {
    expect(isZero(0)).toBe(true);
    expect(isZero(0.001)).toBe(true);
    expect(isZero(0.01)).toBe(false);
  });

  it('moneyEquals تقارن بعد التقريب', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    // 1.005 تُقرَّب إلى 1.01 (تقريب مصرفي) — فهما متساويان بعد التقريب
    expect(moneyEquals(1.005, 1.01)).toBe(true);
    expect(moneyEquals(1.004, 1.01)).toBe(false);
  });
});
