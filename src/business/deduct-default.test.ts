import { describe, it, expect, beforeEach } from 'vitest';
import { useLegacyCompatStore } from '../stores/legacyCompatStore';
import { useFinancialStore } from '../context/domains/financial';
import { getCollectionSetter, getCollectionValue } from '../stores/collectionRegistry';
import { ensureCollectionSources } from '../stores/collectionSources';

// ⭐ المتطلب: **لا خصم افتراضياً**. الخصم يحدث فقط عند تفعيل الخيار من الضبط.
//
// كان الإعداد منشوراً في مكانين، وثلاث جهات غير متسقة:
//   writes : legacyCompatStore.setDeductSalesFromInventory  (بلا markPending ⇒ لا تُرفع)
//   reads  : financialStore.deductSalesFromInventory       (له markPending ⇒ تُرفع)
//   server : collectionSources ⇒ legacyCompatStore
// ⇒ زرّ "مفعّل" يكتب في متجر ويقرأ من آخر ولا الخادم يعرف شيئاً.
// والأخطر: الخصم المطبَّق يقرأ financialStore ⇒ لا يُفعَّل أبداً من الواجهة.

describe('إعداد خصم المبيعات — مالك واحد ومسار كامل', () => {
  beforeEach(() => {
    useFinancialStore.setState({ deductSalesFromInventory: false });
  });

  it('الافتراضي معطّل في المالك', () => {
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(false);
  });

  it('لم يبقَ ظلّ في legacyCompatStore', () => {
    // وجوده كان سبب عدم استجابة الزرّ. لا يعود.
    expect('deductSalesFromInventory' in useLegacyCompatStore.getState()).toBe(false);
    expect('setDeductSalesFromInventory' in useLegacyCompatStore.getState()).toBe(false);
  });

  // ── المسار الثالث الجاه: الخادم ⇄ المالك ───────────────────────────────
  it('سجل الخادم rcerp_deduct_sales مربوط بالمالك لا بغيره', () => {
    ensureCollectionSources();
    const set = getCollectionSetter('rcerp_deduct_sales');
    expect(set).toBeTypeOf('function');

    // محمّل من الخادم ⇒ المالك يتبع
    set!(true);
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(true);

    // والقيمة المرفوعة هي قيمة المالك
    expect(getCollectionValue('rcerp_deduct_sales')).toBe(true);
  });

  it('القيمة المنطقية لا تُرقَّم كشاهد محذوف', () => {
    // filterTombstones كان true ⇒ true→false يُسجَّل "حذف true" فيرتفع للخادم
    // فيحذف الإعداد. ولا داعي لشاهد على قيمة منطقية أصلاً.
    ensureCollectionSources();
    const set = getCollectionSetter('rcerp_deduct_sales');
    set!(true);
    useFinancialStore.getState().setDeductSalesFromInventory(false);
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(false);
    expect(getCollectionValue('rcerp_deduct_sales')).toBe(false);
  });

  it('الضغط على المفتاح يُغيّر حالة المالك فعلاً', () => {
    // هذا ما تفعله الشاشة: useApp().setDeductSalesFromInventory ← المالك
    useFinancialStore.getState().setDeductSalesFromInventory(true);
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(true);
    useFinancialStore.getState().setDeductSalesFromInventory(false);
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(false);
  });

  it('الكتابة ترفع للخادم عبر markPending', () => {
    useFinancialStore.getState().markPending('__probe__', 1);      // تفريغ
    useFinancialStore.getState().setDeductSalesFromInventory(true);
    const pending = useFinancialStore.getState().pendingChanges;
    expect(pending.get('rcerp_deduct_sales')).toBe(true);
  });
});