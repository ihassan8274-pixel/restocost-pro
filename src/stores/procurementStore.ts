import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Supplier, GoodsReceiptNote, PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem,
  SupplierQuote, SupplierReturn,
} from '../types';
import { uniqueDocSequence } from '../business/docNumbers';
// المنقّيات الصحيحة (نسخة سياق/selectors) — كان هذا الستور يحمل نسخاً
// مُهكّمة منها تُرجع 0 دائماً، فكان سعر أمر الشراء يُثبَّت على صفر.
// لا يُعاد حسابها هنا: same logic، مصدر واحد فقط.
import { getQuotePrice as getQuotePriceSel, getReturnedQtyForGrn as getReturnedQtyForGrnSel } from '../context/selectors';

interface ProcurementState {
  suppliers: Supplier[];
  grnNotes: GoodsReceiptNote[];
  purchaseOrders: PurchaseOrder[];
  purchaseRequests: PurchaseRequest[];
  supplierQuotes: SupplierQuote[];
  supplierReturns: SupplierReturn[];
  addSupplier: (data: Omit<Supplier, 'id' | 'code'>) => Supplier;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  addGoodsReceiptNote: (data: Omit<GoodsReceiptNote, 'id' | 'grnNumber'>) => void;
  updateGoodsReceiptNote: (id: string, data: Partial<GoodsReceiptNote>) => void;
  updateGRNStatus: (id: string, status: GoodsReceiptNote['status']) => void;
  revertGoodsReceiptToDraft: (id: string) => number;
  addPurchaseOrder: (data: Omit<PurchaseOrder, 'id' | 'poNumber'>) => void;
  updatePurchaseOrder: (id: string, data: Partial<PurchaseOrder>) => void;
  addPurchaseRequest: (r: Omit<PurchaseRequest, 'id' | 'requestNumber' | 'createdAt'>) => PurchaseRequest;
  updatePurchaseRequest: (id: string, data: Partial<PurchaseRequest>) => void;
  deletePurchaseRequest: (id: string) => void;
  convertRequestToPOs: (requestId: string) => { ok: boolean; count: number; poIds: string[]; error?: string };
  addSupplierQuote: (data: Omit<SupplierQuote, 'id'>) => void;
  updateSupplierQuote: (id: string, data: Partial<SupplierQuote>) => void;
  deleteSupplierQuote: (id: string) => void;
  getQuotePrice: (supplierId: string, rawMaterialId: string) => number | undefined;
  addSupplierReturn: (data: Omit<SupplierReturn, 'id' | 'returnNumber'>) => void;
  updateSupplierReturn: (id: string, data: Partial<SupplierReturn>) => void;
  approveSupplierReturn: (id: string) => void;
  reprocessSupplierReturn: (id: string) => void;
  revertSupplierReturnToDraft: (id: string) => void;
  reprocessAllApprovedReturns: () => void;
  getReturnedQtyForGrn: (grnId: string, rawMaterialId: string) => number;
}

export const useProcurementStore = create<ProcurementState>()(
  persist(
    (set, get) => ({
      suppliers: [],
      grnNotes: [],
      purchaseOrders: [],
      purchaseRequests: [],
      supplierQuotes: [],
      supplierReturns: [],

      addSupplier: (data) => {
        const created = { ...data, id: `sup-${Date.now()}`, code: `SUP-${Math.floor(100 + Math.random() * 900)}` };
        set((state) => ({ suppliers: [...state.suppliers, created] }));
        return created;
      },
      updateSupplier: (id, data) => set((state) => ({ suppliers: state.suppliers.map((s) => (s.id === id ? { ...s, ...data } : s)) })),
      deleteSupplier: (id) => set((state) => ({ suppliers: state.suppliers.filter((s) => s.id !== id) })),

      addGoodsReceiptNote: (data) => {
        const newGrn: GoodsReceiptNote = { ...data, id: `grn-${Date.now()}`, grnNumber: uniqueDocSequence('GRN', { existing: get().grnNotes.map((g) => g.grnNumber) }) };
        set((state) => ({ grnNotes: [newGrn, ...state.grnNotes] }));
      },
      updateGoodsReceiptNote: (id, data) => set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, ...data } : g)) })),
      updateGRNStatus: (id, status) => set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, status } : g)) })),
      revertGoodsReceiptToDraft: (id) => { set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, status: 'draft' as const } : g)) })); return 0; },

      addPurchaseOrder: (data) => {
        const newPO: PurchaseOrder = { ...data, id: `po-${Date.now()}`, poNumber: uniqueDocSequence('PO', { existing: get().purchaseOrders.map((p) => p.poNumber) }) };
        set((state) => ({ purchaseOrders: [newPO, ...state.purchaseOrders] }));
      },
      updatePurchaseOrder: (id, data) => set((state) => ({ purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, ...data } : p)) })),

      addPurchaseRequest: (r) => {
        const rec: PurchaseRequest = { ...r, id: `pr-${Date.now()}`, requestNumber: uniqueDocSequence('PR', { existing: get().purchaseRequests.map((r) => r.requestNumber) }), createdAt: new Date().toISOString() };
        set((state) => ({ purchaseRequests: [rec, ...state.purchaseRequests] }));
        return rec;
      },
      updatePurchaseRequest: (id, data) => set((state) => ({ purchaseRequests: state.purchaseRequests.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      deletePurchaseRequest: (id) => set((state) => ({ purchaseRequests: state.purchaseRequests.filter((r) => r.id !== id) })),
      // تحويل طلب شراء إلى أوامر توريد فعلية. كان stubاً يُرجع ok:true مع poIds
      // وهمية بلا إنشاء أي أمر — فتبتسم الواجهة "تم إنشاء أمر" ولا شيء يُنشأ.
      // الطلب لا يحمل supplierId، فنشتقّه: آخر مورد اشترينا منه الصنف، وإلا
      // أول عرض سعر صالح له، وإلا أول مورد نشط. ونجمّع حسب المورد.
      convertRequestToPOs: (requestId) => {
        const req = get().purchaseRequests.find((r) => r.id === requestId);
        if (!req) return { ok: false, count: 0, poIds: [], error: 'طلب الشراء غير موجود' };
        if (req.status === 'converted' && (req.convertedToPOs?.length ?? 0) > 0) {
          return { ok: false, count: 0, poIds: [], error: 'الطلب محوَّل مسبقاً' };
        }
        if (!req.items.length) return { ok: false, count: 0, poIds: [], error: 'الطلب بلا أصناف' };

        const st = get();
        const activeSuppliers = st.suppliers.filter((s) => s.isActive !== false);
        if (!activeSuppliers.length) return { ok: false, count: 0, poIds: [], error: 'لا يوجد موردون نشطون' };

        const supplierFor = (item: PurchaseRequestItem): string => {
          // 1) آخر مورد استُلم منه الصنف فعلياً (GRN معتمد)
          for (const g of st.grnNotes) {
            if (g.status !== 'approved') continue;
            if (!g.items.some((i) => i.rawMaterialId === item.rawMaterialId)) continue;
            if (g.supplierId && activeSuppliers.some((s) => s.id === g.supplierId)) return g.supplierId;
          }
          // 2) عرض سعر صالح لهذا الصنف
          const quoted = activeSuppliers.find((s) => getQuotePriceSel(st.supplierQuotes, s.id, item.rawMaterialId) !== undefined);
          if (quoted) return quoted.id;
          // 3) بديل: أول مورد نشط
          return activeSuppliers[0].id;
        };

        const priceFor = (item: PurchaseRequestItem, supplierId: string): number => {
          const q = getQuotePriceSel(st.supplierQuotes, supplierId, item.rawMaterialId);
          if (typeof q === 'number' && q > 0) return q;
          if (item.minPU > 0) return item.minPU;
          if (item.maxPU > 0) return item.maxPU;
          return 0;
        };

        // تجميع حسب المورد
        const bySupplier = new Map<string, PurchaseOrderItem[]>();
        for (const item of req.items) {
          const sid = supplierFor(item);
          const conv = item.purchaseUnitConversion > 0 ? item.purchaseUnitConversion : 1;
          const unitPrice = priceFor(item, sid);
          const storageQty = item.quantityPU * conv;
          const line: PurchaseOrderItem = {
            rawMaterialId: item.rawMaterialId,
            materialName: item.materialName,
            quantity: storageQty,
            unit: item.unit,
            unitPrice,
            lineTotal: Math.round(storageQty * unitPrice * 100) / 100,
            purchaseUnit: item.purchaseUnit,
            purchaseUnitConversion: conv,
            purchaseQty: item.quantityPU,
          };
          const arr = bySupplier.get(sid) || [];
          arr.push(line);
          bySupplier.set(sid, arr);
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const expected = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        const createdIds: string[] = [];
        const newOrders: PurchaseOrder[] = [];

        for (const [sid, items] of bySupplier) {
          const supplier = st.suppliers.find((s) => s.id === sid);
          const built: PurchaseOrder = {
            id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            poNumber: uniqueDocSequence('PO', { existing: get().purchaseOrders.map((o) => o.poNumber) }),
            supplierId: sid,
            supplierName: supplier?.name || sid,
            branchId: req.branchId,
            orderDate: todayStr,
            expectedDate: expected,
            status: 'draft',
            items,
            totalAmount: Math.round(items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100,
            requestedBy: `طلب شراء ${req.requestNumber}`,
            notes: `محوَّل آلياً من طلب الشراء ${req.requestNumber} (${req.branchName})`,
          };
          newOrders.push(built);
          createdIds.push(built.id);
        }

        if (!newOrders.length) return { ok: false, count: 0, poIds: [], error: 'تعذّر إنشاء أوامر التوريد' };

        set((state) => ({
          purchaseOrders: [...newOrders, ...state.purchaseOrders],
          purchaseRequests: state.purchaseRequests.map((r) =>
            r.id === requestId ? { ...r, status: 'converted' as const, convertedToPOs: createdIds } : r),
        }));

        return { ok: true, count: newOrders.length, poIds: createdIds };
      },

      addSupplierQuote: (data) => set((state) => ({ supplierQuotes: [{ ...data, id: `quote-${Date.now()}` }, ...state.supplierQuotes] })),
      updateSupplierQuote: (id, data) => set((state) => ({ supplierQuotes: state.supplierQuotes.map((q) => (q.id === id ? { ...q, ...data } : q)) })),
      deleteSupplierQuote: (id) => set((state) => ({ supplierQuotes: state.supplierQuotes.filter((q) => q.id !== id) })),
      getQuotePrice: (supplierId: string, rawMaterialId: string): number | undefined =>
        getQuotePriceSel(get().supplierQuotes, supplierId, rawMaterialId),

      addSupplierReturn: (data) => {
        const newReturn: SupplierReturn = { ...data, id: `sr-${Date.now()}`, returnNumber: uniqueDocSequence('RET', { existing: get().supplierReturns.map((r) => r.returnNumber) }) };
        set((state) => ({ supplierReturns: [newReturn, ...state.supplierReturns] }));
      },
      updateSupplierReturn: (id, data) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      approveSupplierReturn: (id) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)) })),
      // إعادة معالجة مرتجع = إعادة اعتماده بعد تعديل بنوده (كنnoop سابقاً فلم
      // يكن الزر يفعل شيئاً رغم أنه ظاهر للمستخدم).
      reprocessSupplierReturn: (id) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)) })),
      revertSupplierReturnToDraft: (id) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, status: 'draft' as const, approvedBy: undefined } : r)) })),
      reprocessAllApprovedReturns: () => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.status === 'approved' ? { ...r } : r)) })),
      getReturnedQtyForGrn: (grnId, rawMaterialId) => getReturnedQtyForGrnSel(get().supplierReturns, grnId, rawMaterialId),
    }),
    { name: 'rcerp_procurement' }
  )
);
