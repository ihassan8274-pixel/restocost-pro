import { describe, it, expect } from 'vitest';
import {
  roundMoney, addMoney, subMoney, mulMoney, applyVat, vatOf,
  divMoney, formatMoney, isZero, moneyEquals,
  toCents, fromCents, centsOf, addCents, subCents, qtyTimesCents,
  rateToBps, bpsToRate, vatOfCents, applyVatCents, pctOfCents,
  avgUnitCents, formatCents,
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

describe('toCents و fromCents — التحويل بين العشري والهللات', () => {
  it('0.1 + 0.2 بالهللات = 30 هلالة = 0.3 تماماً', () => {
    expect(toCents(0.1)).toBe(10);
    expect(toCents(0.2)).toBe(20);
    expect(addCents(toCents(0.1), toCents(0.2))).toBe(30);
    expect(fromCents(30)).toBe(0.3);
  });

  it('8.33×3×1.15 بالهللات = 2874 = 28.74 — بلا 28.7385 وسيطة', () => {
    const cents = qtyTimesCents(3, toCents(8.33)); // 833×3 = 2499
    expect(cents).toBe(2499);
    expect(applyVatCents(cents, rateToBps(0.15))).toBe(2874);
    expect(fromCents(2874)).toBe(28.74);
  });

  it('الإبسيلون يمنع فخ 0.575×100 = 57.499…', () => {
    expect(toCents(0.575)).toBe(58);
  });

  it('القيم غير المنتهية تصفر', () => {
    expect(toCents(NaN)).toBe(0);
    expect(toCents(Infinity)).toBe(0);
    expect(fromCents(NaN)).toBe(0);
  });

  it('مبالغ سالبة تنقل علامتها', () => {
    expect(toCents(-1.5)).toBe(-150);
    expect(fromCents(-150)).toBe(-1.5);
  });
});

describe('addCents و subCents — جمع صحيح بلا تراكم خطأ', () => {
  it('مئة مرة 0.1 = 1000 هلالة = 10.00 تماماً', () => {
    const sum = addCents(...Array.from({ length: 100 }, () => toCents(0.1)));
    expect(sum).toBe(1000);
    expect(fromCents(sum)).toBe(10);
  });

  it('طرح صحيح', () => {
    expect(subCents(toCents(100), toCents(33.33))).toBe(6667);
    expect(fromCents(subCents(toCents(100), toCents(33.33)))).toBe(66.67);
  });

  it('المدخلات تُقرَّب نحو الصحيح حمايةً من الأخطاء', () => {
    expect(addCents(10.4, 20.6)).toBe(31);
  });
});

describe('qtyTimesCents و avgUnitCents', () => {
  it('كمية كسرية × سعر بالهللات — تقريب واحد فقط', () => {
    expect(qtyTimesCents(2.35, toCents(28.74))).toBe(6754); // 67.54
    expect(fromCents(6754)).toBe(67.54);
  });

  it('متوسط سعر الوحدة من إجمالي هللات وكمية', () => {
    expect(avgUnitCents(addCents(toCents(8.33), toCents(8.33), toCents(8.33)), 3)).toBe(833);
    expect(avgUnitCents(2499, 2)).toBe(1250); // 12.50
    expect(avgUnitCents(100, 0)).toBe(0);
  });
});

describe('rateToBps و bpsToRate — الضريبة كنقاط أساس', () => {
  it('تحويل بين النسبة المئوية ونقاط الأساس ذهاباً وإياباً', () => {
    expect(rateToBps(0.15)).toBe(1500);
    expect(bpsToRate(1500)).toBe(0.15);
    expect(rateToBps(0.125)).toBe(1250);
    expect(bpsToRate(250)).toBe(0.025);
    expect(bpsToRate(rateToBps(0.15))).toBe(0.15);
  });

  it('ضريبة فقط من هللات: 1499 هلالة × 15%', () => {
    expect(vatOfCents(1499, 1500)).toBe(225); // 22.49 × 0.15 = 3.3735 → 3.37
    expect(fromCents(225)).toBe(2.25);
    expect(vatOfCents(833, 1500)).toBe(125);
  });

  it('مبلغ شامل الضريبة بالهللات', () => {
    expect(applyVatCents(1000, 1500)).toBe(1150);
    expect(fromCents(applyVatCents(1000, 1500))).toBe(11.5);
  });
});

describe('centsOf — قراءة ثنائية بأولوية الصحيح', () => {
  it('يأخذ Cents إن وُجدت مهما خالف العشري', () => {
    expect(centsOf(2874, 28.74)).toBe(2874);
    expect(centsOf(0, 28.74)).toBe(0);
  });

  it('يقع على العشري عند غياب Cents', () => {
    expect(centsOf(undefined, 28.74)).toBe(2874);
    expect(centsOf(null, 28.74)).toBe(2874);
    expect(centsOf(NaN, 28.74)).toBe(2874);
    expect(centsOf(undefined, undefined)).toBe(0);
  });
});

describe('pctOfCents و formatCents', () => {
  it('نسبة مئوية من مبلغ بالهللات', () => {
    expect(pctOfCents(10000, 10)).toBe(1000); // 10% من 100.00
    expect(fromCents(pctOfCents(10000, 10))).toBe(10);
  });

  it('تنسيق للعرض بمنزلتين من عدد صحيح', () => {
    expect(formatCents(2874)).toBe('28.74');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(-150)).toBe('-1.50');
    expect(formatCents(NaN)).toBe('0.00');
  });
});
