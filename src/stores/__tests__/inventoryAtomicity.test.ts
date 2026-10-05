import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from '../inventoryStore';

// الرصيد والحركة يجب أن يُكتبا معاً أو لا يُكتب أيٌّ.
//
// كانت adjustInventory تكتب في ثلاث set() منفصلة. أي انقطاع بينها — إعادة
// تحميل، إغلاق تبويب، مزامنة تلتقط الحالة — يُحدّث الرصيد بلا حركة، فتصير
// «رصيد ≠ افتتاح + حركات» بفرق موجب. قِستُها على البيانات: 311 من 961.
// الاختبار هنا يثبت الذرّية نفسها: بعد أي استدعاء، الرصيد = مجموع الحركات.
// الاختبار هنا يثبت الذرّية نفسها: بعد أي استدعاء، الرصيد = مجموع
// الحركات. لو عاد anybody Set منفصل، يكسر هذا.

const branch = 'b-test';
const mat = 'rm-test';

function reset() {
  useInventoryStore.setState({
    inventory: [],
    inventoryMovements: [],
    inventoryBatches: [],
  });
}

describe('ذرّية تعديل المخزون', () => {
  beforeEach(reset);

  it('الرصيد = مجموع الحركات بعد استدعاء واحد', () => {
    useInventoryStore.getState().adjustInventory(branch, mat, 50, undefined, { type: 'استقبال استلام', ref: 'grn-1' });
    const s = useInventoryStore.getState();
    const bal = s.inventory.find((i) => i.branchId === branch && i.rawMaterialId === mat)?.quantity ?? 0;
    const sum = s.inventoryMovements.filter((m) => m.branchId === branch && m.rawMaterialId === mat)
      .reduce((a, m) => a + m.delta, 0);
    expect(bal).toBe(sum);
    expect(bal).toBe(50);
  });

  it('يبقى متسقاً بعد 20 استدعاء متتالٍ', () => {
    for (let i = 1; i <= 20; i++) {
      useInventoryStore.getState().adjustInventory(branch, mat, i, undefined, { type: 'تست', ref: `grn-${i}` });
      const s = useInventoryStore.getState();
      const bal = s.inventory.find((x) => x.branchId === branch && x.rawMaterialId === mat)?.quantity ?? 0;
      const sum = s.inventoryMovements.filter((m) => m.branchId === branch && m.rawMaterialId === mat)
        .reduce((a, m) => a + m.delta, 0);
      expect(bal).toBe(sum);
    }
    const s = useInventoryStore.getState();
    const bal = s.inventory.find((x) => x.branchId === branch && x.rawMaterialId === mat)?.quantity ?? 0;
    expect(bal).toBe(210);   // 1+2+…+20
  });

  it('الصنف الجديد ينشأ مع حركته في نفس العملية', () => {
    useInventoryStore.getState().adjustInventory(branch, 'rm-brand-new', 12, undefined, { type: 'استقبال', ref: 'x' });
    const s = useInventoryStore.getState();
    expect(s.inventory.some((i) => i.rawMaterialId === 'rm-brand-new')).toBe(true);
    expect(s.inventoryMovements.some((m) => m.ref === 'x')).toBe(true);
  });

  it('delta صفر لا يولّد حركة', () => {
    useInventoryStore.getState().adjustInventory(branch, mat, 0, undefined, { type: 'تسوية' });
    expect(useInventoryStore.getState().inventoryMovements).toHaveLength(0);
  });

  it('السالب يخصم من الرصيد ويسجّل حركة سالبة', () => {
    const st = () => useInventoryStore.getState();
    st().adjustInventory(branch, mat, 100, undefined, { type: 'استقبال', ref: 'a' });
    st().adjustInventory(branch, mat, -30, undefined, { type: 'صرف', ref: 'b' });
    const s = st();
    const bal = s.inventory.find((i) => i.branchId === branch && i.rawMaterialId === mat)?.quantity ?? 0;
    const sum = s.inventoryMovements.filter((m) => m.rawMaterialId === mat).reduce((a, m) => a + m.delta, 0);
    expect(bal).toBe(70);
    expect(bal).toBe(sum);
  });
});
