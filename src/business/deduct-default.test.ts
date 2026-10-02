import { describe, it, expect } from 'vitest';
import { useLegacyCompatStore } from '../stores/legacyCompatStore';
import { useFinancialStore } from '../context/domains/financial';

// إعداد "خصم المبيعات من المخزون" كان منشوراً في مكانين:
//   - legacyCompatStore.deductSalesFromInventory  (الافتراضي true، غير متزامن)
//   - financialStore.deductSalesFromInventory    (الافتراضي false، يرسل للخادم)
// و...legacy كان يكتب فوق financial في useApp، فالواجهة كانت تعرض قيمة لا
// تساوي ما يُرفع. الافتراضي المطلوب: معطّل — تكلفة المبيعات بالجرد.
describe('deductSalesFromInventory default', () => {
  it('legacyCompatStore 默认 معطّل (لا خصم تلقائي)', () => {
    const v = useLegacyCompatStore.getState().deductSalesFromInventory;
    expect(v).toBe(false);
  });

  it('financialStore 默认 معطّل', () => {
    const v = useFinancialStore.getState().deductSalesFromInventory;
    expect(v).toBe(false);
  });

  it('الستوران متّفقان على الافتراضي — لا分裂 ولا مصدر واحدTruth', () => {
    expect(useLegacyCompatStore.getState().deductSalesFromInventory)
      .toBe(useFinancialStore.getState().deductSalesFromInventory);
  });
});