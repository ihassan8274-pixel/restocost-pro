import { describe, it, expect, beforeEach } from 'vitest';
import { useProcurementStore } from '../stores/procurementStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useLegacyCompatStore } from '../stores/legacyCompatStore';

// هذه الدوال كانت stubs في الستور الفعلي (stores/*) الذي تستهلكه الواجهة عبر
// useProcurement — لا النسخة الميتة في context/domains. يعيد:
//   getQuotePrice => 0  ⇒ أمر الشراء يُثبَّت بسعر صفر (لا يسقط إلى standardPrice)
//   convertRequestToPOs => ok:true + poIds وهمية ⇒ الواجهة تقول "تم" ولا شيء يُنشأ
//   deleteUnitOfMeasure => ok:true ⇒ "تم الحذف" والوحدة باقية
describe('stubs الميتة', () => {
  beforeEach(() => {
    useProcurementStore.setState({ suppliers: [], grnNotes: [], purchaseOrders: [], purchaseRequests: [], supplierQuotes: [], supplierReturns: [] });
    useSettingsStore.setState({ unitsOfMeasure: [], materialBarcodes: [] });
    useLegacyCompatStore.setState({ rawMaterials: [] });
  });

  it('getQuotePrice يُرجع عرض السعر الساري لا 0', () => {
    const today = new Date().toISOString().slice(0, 10);
    useProcurementStore.setState({
      supplierQuotes: [
        { id: 'q1', supplierId: 's1', rawMaterialId: 'm1', price: 12.5, validFrom: '2020-01-01', validTo: '2099-01-01' },
      ],
    });
    expect(useProcurementStore.getState().getQuotePrice('s1', 'm1')).toBe(12.5);
    // لا يوجد عرض ⇒ undefined (وليس 0) فيستطيع المستدعي الرجوع لـ standardPrice
    expect(useProcurementStore.getState().getQuotePrice('s1', 'm-other')).toBeUndefined();
    expect(useProcurementStore.getState().getQuotePrice('s-other', 'm1')).toBeUndefined();
    void today;
  });

  it('getQuotePrice يتجاهل العرض المنتهي', () => {
    useProcurementStore.setState({
      supplierQuotes: [
        { id: 'q-old', supplierId: 's1', rawMaterialId: 'm1', price: 99, validFrom: '2020-01-01', validTo: '2020-12-31' },
      ],
    });
    expect(useProcurementStore.getState().getQuotePrice('s1', 'm1')).toBeUndefined();
  });

  it('getReturnedQtyForGrn يجمع المرتجعات المعتمدة فقط', () => {
    useProcurementStore.setState({
      supplierReturns: [
        { id: 'r1', sourceGrnId: 'g1', status: 'approved', returnNumber: 'RET-1', date: '', supplierId: '', branchId: '', createdBy: '', items: [{ rawMaterialId: 'm1', itemName: 'x', quantity: 3, unit: 'kg', unitCost: 0 }] },
        { id: 'r2', sourceGrnId: 'g1', status: 'draft', returnNumber: 'RET-2', date: '', supplierId: '', branchId: '', createdBy: '', items: [{ rawMaterialId: 'm1', itemName: 'x', quantity: 5, unit: 'kg', unitCost: 0 }] },
      ],
    });
    expect(useProcurementStore.getState().getReturnedQtyForGrn('g1', 'm1')).toBe(3);
  });

  it('convertRequestToPOs ينشئ أوامر توريد فعلية (لا poIds وهمية)', () => {
    useProcurementStore.setState({
      suppliers: [{ id: 's1', name: 'مورد', code: 'SUP-1', contactPerson: '', phone: '', email: '', rating: 3, paymentTermsDays: 30, categories: [], isActive: true, notes: '' }],
      purchaseRequests: [{
        id: 'pr1', requestNumber: 'PR-1', branchId: 'b1', branchName: 'فرع', date: '2026-10-01',
        createdBy: 'x', status: 'draft', totalQtyPU: 5, totalValue: 0, createdAt: '',
        items: [{
          rawMaterialId: 'm1', materialName: 'صنف', code: 'RM-1', unit: 'كغم', purchaseUnit: 'كرتون',
          purchaseUnitConversion: 10, minStockLevel: 0, maxStockLevel: 0, alwaysOrderFullMax: false,
          minPU: 5, maxPU: 8, currentPU: 0, quantityPU: 5,
        }],
      }],
    });
    const before = useProcurementStore.getState().purchaseOrders.length;
    const r = useProcurementStore.getState().convertRequestToPOs('pr1');
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    // أمر حقيقي أُضيف، ومعرّفه موجود فعلاً
    const after = useProcurementStore.getState().purchaseOrders;
    expect(after.length).toBe(before + 1);
    expect(after[0].id).toBe(r.poIds[0]);
    // لا سعر صفر: من minPU
    expect(after[0].items[0].unitPrice).toBe(5);
    expect(after[0].totalAmount).toBeGreaterThan(0);
    // الطلب صار محوَّلاً بربط صحيح
    const req = useProcurementStore.getState().purchaseRequests.find((x) => x.id === 'pr1');
    expect(req?.status).toBe('converted');
    expect(req?.convertedToPOs).toEqual(r.poIds);
  });

  it('convertRequestToPOs يرفض الطلب غير الموجود والبلا أصناف', () => {
    expect(useProcurementStore.getState().convertRequestToPOs('nope').ok).toBe(false);
    useProcurementStore.setState({ purchaseRequests: [{ id: 'pr2', requestNumber: 'PR-2', branchId: 'b1', branchName: 'f', date: '', createdBy: '', status: 'draft', items: [], totalQtyPU: 0, totalValue: 0, createdAt: '' }] });
    expect(useProcurementStore.getState().convertRequestToPOs('pr2').ok).toBe(false);
  });

  it('deleteUnitOfMeasure يحذف فعلاً ويرفض الوحدة المرتبطة بأصناف', () => {
    useSettingsStore.setState({ unitsOfMeasure: [
      { id: 'u1', code: 'كغم', nameAr: 'كيلو', nameEn: 'kg', uomClass: 'weight', isActive: true },
      { id: 'u2', code: 'كرتون', nameAr: 'كرتون', nameEn: 'carton', uomClass: 'count', isActive: true },
    ] });
    // مرتبط بصنف ⇒ رفض
    useLegacyCompatStore.setState({ rawMaterials: [
      { id: 'm1', code: 'RM-1', nameAr: 'سكر', nameEn: 'sugar', category: 'dry_goods', unit: 'كرتون', purchaseUnit: 'كرتون', purchaseUnitConversion: 1, purchaseUnitPrice: 0, standardPrice: 0, minStockLevel: 0, maxStockLevel: 0, reorderPoint: 0, leadTimeDays: 0, yieldPercentage: 100, supplierId: '', storageType: 'dry', isActive: true, tradeUomId: '', tradeUomName: '', tradeUomConversion: 0 },
    ] });
    const blocked = useSettingsStore.getState().deleteUnitOfMeasure('u2');
    expect(blocked.ok).toBe(false);
    expect(useSettingsStore.getState().unitsOfMeasure.length).toBe(2);
    // غير مرتبط ⇒ حذف حقيقي
    const okRes = useSettingsStore.getState().deleteUnitOfMeasure('u1');
    expect(okRes.ok).toBe(true);
    expect(useSettingsStore.getState().unitsOfMeasure.find((u) => u.id === 'u1')).toBeUndefined();
  });
});