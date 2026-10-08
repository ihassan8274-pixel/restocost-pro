import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from '../stores/inventoryStore';
import { useFinancialStore } from '../context/domains/financial';
import { useProductionStore } from '../stores/productionStore';
import { useLegacyCompatStore } from '../stores/legacyCompatStore';
import { applySaleDeduction } from './sales-deduction';
import type { RawMaterial, StandardRecipe } from '../types';

// ⭐ هذا هو عقد المستخدم، مكتوباً كاختبار لا كنص:
//
//     "لا أريد تفعيل خصم المبيعات. أريد عدم الخصم.
//      الخصم فقط في حال إذا فعّلت الخيار من الضبط."
//
// أي: معطّل ⇒ صفر حركة مخزون، مهما تمرّ عمليات بيع. مفعّل ⇒ خصم.
// الاختبار يشغّل المحرك الحقيقي على متجر المخزون الحقيقي — لا stub.

const MAT = 'rm-flour';
const RECIPE = 'rc-bread';

const material = (): RawMaterial => ({
  id: MAT, code: 'RM-1', nameAr: 'دقيق', nameEn: 'Flour', category: 'dry_goods',
  unit: 'كغم', standardPrice: 4, minStockLevel: 0, yieldPercentage: 100,
  supplierId: '', storageType: 'dry', isActive: true,
} as RawMaterial);

const recipe = (): StandardRecipe => ({
  id: RECIPE, code: 'D-1', nameAr: 'عيش', nameEn: 'Bread', category: 'main_dish',
  portionSize: '1', prepTimeMins: 0,
  ingredients: [{ rawMaterialId: MAT, quantity: 0.25, wastagePercent: 0 }],
  directLaborCost: 0, packagingCost: 0, totalCalculatedCost: 0,
  suggestedPrice: 0, actualMenuPrice: 0, isCentralKitchenPrep: false, isActive: true,
} as StandardRecipe);

const BRANCH = 'b-01';
const START_QTY = 100;

/** يشغّل مسار الخصم كما يفعل useApp: نفس المحرّك، نفس البوابة. */
const runSale = (quantitySold: number) =>
  applySaleDeduction(
    BRANCH,
    [{ recipeId: RECIPE, quantitySold }],
    { recipes: useProductionStore.getState().recipes, rawMaterials: useLegacyCompatStore.getState().rawMaterials },
    useInventoryStore.getState().adjustInventory,
    {
      ref: 'BS-TEST',
      enabled: useFinancialStore.getState().deductSalesFromInventory,
      sign: -1,
      type: 'خصم مبيعات',
    },
  );

/** عكس الخصم — كما يفعله الحذف: يعتمد البصمة لا حالة المفتاح. */
const runReversal = (quantitySold: number, deducted: boolean) =>
  applySaleDeduction(
    BRANCH,
    [{ recipeId: RECIPE, quantitySold }],
    { recipes: useProductionStore.getState().recipes, rawMaterials: useLegacyCompatStore.getState().rawMaterials },
    useInventoryStore.getState().adjustInventory,
    {
      ref: 'BS-TEST',
      enabled: useFinancialStore.getState().deductSalesFromInventory,
      sign: 1,
      type: 'عكس خصم مبيعات',
      // البصمة هي ما يسمح بالعكس: force لا يُمرَّر إلا إذا خُصم فعلاً.
      force: deducted,
    },
  );

const qtyOf = (matId: string) =>
  useInventoryStore.getState().inventory.find((i) => i.branchId === BRANCH && i.rawMaterialId === matId)?.quantity ?? 0;

const movementsOf = (matId: string) =>
  useInventoryStore.getState().inventoryMovements.filter((m) => m.branchId === BRANCH && m.rawMaterialId === matId);

describe('عقد المستخدم: لا خصم إلا بتفعيل الخيار', () => {
  beforeEach(() => {
    useInventoryStore.setState({ inventory: [], inventoryMovements: [] });
    useInventoryStore.getState().adjustInventory(BRANCH, MAT, START_QTY, undefined, { type: 'رصيد افتتاحي' });
    useProductionStore.setState({ recipes: [recipe()] } as never);
    useLegacyCompatStore.setState({ rawMaterials: [material()] } as never);
    useFinancialStore.setState({ deductSalesFromInventory: false });
  });

  // ── الافتراضي: معطّل ──────────────────────────────────────────
  it('الافتراضي معطّل — لا خصم ولا حركة', () => {
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(false);
    const before = movementsOf(MAT).length;
    runSale(50);
    expect(qtyOf(MAT)).toBe(START_QTY);                    // الرصيد لم يتحرك
    expect(movementsOf(MAT).length).toBe(before);           // ولا حركة جديدة
  });

  it('عشر عمليات بيع والخصم معطّل ⇒ الرصيد سليم تماماً', () => {
    for (let i = 0; i < 10; i++) runSale(25);
    expect(qtyOf(MAT)).toBe(START_QTY);
    expect(movementsOf(MAT).some((m) => m.type === 'خصم مبيعات')).toBe(false);
  });

  it('500 قطعة مباعة والخيار معطّل ⇒ لا خصم إطلاقاً', () => {
    // الموقف الحقيقي: مطعم يبيع كثيراً والمفتاح معطّل عمداً (تكلفة بالجرد).
    for (let i = 0; i < 20; i++) runSale(25);
    expect(qtyOf(MAT)).toBe(START_QTY);
    expect(movementsOf(MAT).filter((m) => m.type === 'خصم مبيعات')).toHaveLength(0);
  });

  it('الإعداد يبقى معطّلاً بعد كل عملية بيع (لا تسريب حالة)', () => {
    runSale(10);
    runSale(10);
    expect(useFinancialStore.getState().deductSalesFromInventory).toBe(false);
  });

  // ── بعد التفعيل ──────────────────────────────────────────────
  it('بعد التفعيل: البيع يخصم 0.25 × الكمية', () => {
    useFinancialStore.getState().setDeductSalesFromInventory(true);
    runSale(40);
    expect(qtyOf(MAT)).toBe(START_QTY - 10);               // 40 × 0.25
    expect(movementsOf(MAT).some((m) => m.type === 'خصم مبيعات')).toBe(true);
  });

  it('إعادة التعطيل توقف الخصم فوراً دون المساس بما سبق', () => {
    useFinancialStore.getState().setDeductSalesFromInventory(true);
    runSale(40);                                            // −10
    const afterFirst = qtyOf(MAT);
    useFinancialStore.getState().setDeductSalesFromInventory(false);
    runSale(40);                                            // لا شيء
    expect(qtyOf(MAT)).toBe(afterFirst);
  });

  // ── البصمة: العكس لا يعتمد على حالة المفتاح ──────────────────
  it('حذف فاتورة خُصمت سابقاً يُرجع الرصيد حتى مع تعطيل المفتاح', () => {
    // ⭐ هذه الحالة التي كان الخصم يعلق فيها للأبد: يعطّل المستخدم المفتاح
    // ثم يحذف الفاتورة، فلا يجد من يعكس ما خصم.
    useFinancialStore.getState().setDeductSalesFromInventory(true);
    runSale(40);
    expect(qtyOf(MAT)).toBe(START_QTY - 10);

    useFinancialStore.getState().setDeductSalesFromInventory(false);
    // العكس يعتمد على البصمة (rawMaterialsDeducted = true) لا على المفتاح
    runReversal(40, true);
    expect(qtyOf(MAT)).toBe(START_QTY);
  });

  it('حذف فاتورة لم تُخصم أصلاً لا يزيد الرصيد', () => {
    // البصمة false ⇒ لا force ⇒ لا عكس. لو انعكس لتضاعف المخزون.
    runReversal(40, false);
    expect(qtyOf(MAT)).toBe(START_QTY);
  });
});