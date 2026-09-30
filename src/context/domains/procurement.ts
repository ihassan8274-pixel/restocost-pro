import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Supplier, PurchaseOrder, PurchaseRequest, GoodsReceiptNote, SupplierQuote, SupplierReturn, DepartmentRequisition, MaterialCategoryDef } from '../../types';

interface ProcurementState {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseRequests: PurchaseRequest[];
  grnNotes: GoodsReceiptNote[];
  supplierQuotes: SupplierQuote[];
  supplierReturns: SupplierReturn[];
  requisitions: DepartmentRequisition[];
  materialCategories: MaterialCategoryDef[];
  pendingChanges: Map<string, unknown>;
  
  setSuppliers: (data: Supplier[]) => void;
  setPurchaseOrders: (data: PurchaseOrder[]) => void;
  setPurchaseRequests: (data: PurchaseRequest[]) => void;
  setGrnNotes: (data: GoodsReceiptNote[]) => void;
  setSupplierQuotes: (data: SupplierQuote[]) => void;
  setSupplierReturns: (data: SupplierReturn[]) => void;
  setRequisitions: (data: DepartmentRequisition[]) => void;
  setMaterialCategories: (data: MaterialCategoryDef[]) => void;
  
  addSupplier: (s: Omit<Supplier, 'id' | 'code'>) => Supplier;
  updateSupplier: (id: string, s: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  
  addPurchaseOrder: (p: Omit<PurchaseOrder, 'id' | 'poNumber'>) => void;
  updatePurchaseOrder: (id: string, p: Partial<PurchaseOrder>) => void;
  receivePurchaseOrder: (id: string) => void;
  
  addPurchaseRequest: (r: Omit<PurchaseRequest, 'id' | 'requestNumber' | 'createdAt'>) => PurchaseRequest;
  updatePurchaseRequest: (id: string, r: Partial<PurchaseRequest>) => void;
  deletePurchaseRequest: (id: string) => void;
  convertRequestToPOs: (requestId: string) => { ok: boolean; count: number; poIds: string[]; error?: string };
  
  addGoodsReceiptNote: (g: Omit<GoodsReceiptNote, 'id' | 'grnNumber'>) => void;
  updateGRNStatus: (id: string, status: GoodsReceiptNote['status']) => void;
  revertGoodsReceiptToDraft: (id: string) => number;
  updateGoodsReceiptNote: (id: string, g: Partial<GoodsReceiptNote>) => void;
  
  addSupplierQuote: (q: Omit<SupplierQuote, 'id'>) => void;
  updateSupplierQuote: (id: string, q: Partial<SupplierQuote>) => void;
  deleteSupplierQuote: (id: string) => void;
  getQuotePrice: (supplierId: string, rawMaterialId: string) => number | undefined;
  
  addSupplierReturn: (r: Omit<SupplierReturn, 'id' | 'returnNumber'>) => void;
  updateSupplierReturn: (id: string, r: Partial<SupplierReturn>) => void;
  approveSupplierReturn: (id: string) => void;
  reprocessSupplierReturn: (id: string) => void;
  revertSupplierReturnToDraft: (id: string) => void;
  
  addRequisition: (r: Omit<DepartmentRequisition, 'id' | 'reqNumber' | 'status' | 'totalQty'>) => void;
  submitRequisition: (id: string) => void;
  approveRequisition: (id: string) => void;
  rejectRequisition: (id: string, reason: string) => void;
  cancelRequisition: (id: string) => void;
  deleteRequisition: (id: string) => void;
  
  addMaterialCategory: (d: Omit<MaterialCategoryDef, 'id' | 'createdAt'>) => void;
  updateMaterialCategory: (id: string, d: Partial<MaterialCategoryDef>) => void;
  deleteMaterialCategory: (id: string) => void;
  
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useProcurementStore = create<ProcurementState>()(
  persist(
    (set, get) => ({
      suppliers: [],
      purchaseOrders: [],
      purchaseRequests: [],
      grnNotes: [],
      supplierQuotes: [],
      supplierReturns: [],
      requisitions: [],
      materialCategories: [],
      pendingChanges: new Map(),
      
      setSuppliers: (data) => { set({ suppliers: data }); get().markPending('rcerp_suppliers', data); },
      setPurchaseOrders: (data) => { set({ purchaseOrders: data }); get().markPending('rcerp_purchase_orders', data); },
      setPurchaseRequests: (data) => { set({ purchaseRequests: data }); get().markPending('rcerp_purchase_requests', data); },
      setGrnNotes: (data) => { set({ grnNotes: data }); get().markPending('rcerp_grn', data); },
      setSupplierQuotes: (data) => { set({ supplierQuotes: data }); get().markPending('rcerp_supplier_quotes', data); },
      setSupplierReturns: (data) => { set({ supplierReturns: data }); get().markPending('rcerp_supplier_returns', data); },
      setRequisitions: (data) => { set({ requisitions: data }); get().markPending('rcerp_requisitions', data); },
      setMaterialCategories: (data) => { set({ materialCategories: data }); get().markPending('rcerp_material_categories', data); },
      
      addSupplier: (s) => {
        const supplier: Supplier = { ...s, id: uid('sup'), code: `SUP-${Date.now().toString(36).toUpperCase()}` };
        set((state) => ({ suppliers: [...state.suppliers, supplier] }));
        get().markPending('rcerp_suppliers', get().suppliers);
        return supplier;
      },
      updateSupplier: (id, s) => { set((state) => ({ suppliers: state.suppliers.map(u => u.id === id ? { ...u, ...s } : u) })); get().markPending('rcerp_suppliers', get().suppliers); },
      deleteSupplier: (id) => { set((state) => ({ suppliers: state.suppliers.filter(u => u.id !== id) })); get().markPending('rcerp_suppliers', get().suppliers); },
      
      addPurchaseOrder: (p) => {
        const po: PurchaseOrder = { ...p, id: uid('po'), poNumber: `PO-${Date.now().toString(36).toUpperCase()}`, status: 'draft' };
        set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] }));
        get().markPending('rcerp_purchase_orders', get().purchaseOrders);
      },
      updatePurchaseOrder: (id, p) => { set((state) => ({ purchaseOrders: state.purchaseOrders.map(o => o.id === id ? { ...o, ...p } : o) })); get().markPending('rcerp_purchase_orders', get().purchaseOrders); },
      receivePurchaseOrder: (id) => { set((state) => ({ purchaseOrders: state.purchaseOrders.map(o => o.id === id ? { ...o, status: 'received' as const } : o) })); get().markPending('rcerp_purchase_orders', get().purchaseOrders); },
      
      addPurchaseRequest: (r) => {
        const pr: PurchaseRequest = { ...r, id: uid('pr'), requestNumber: `PR-${Date.now().toString(36).toUpperCase()}`, status: 'draft', totalQtyPU: 0, totalValue: 0, createdAt: new Date().toISOString() };
        set((state) => ({ purchaseRequests: [...state.purchaseRequests, pr] }));
        get().markPending('rcerp_purchase_requests', get().purchaseRequests);
        return pr;
      },
      updatePurchaseRequest: (id, r) => { set((state) => ({ purchaseRequests: state.purchaseRequests.map(o => o.id === id ? { ...o, ...r } : o) })); get().markPending('rcerp_purchase_requests', get().purchaseRequests); },
      deletePurchaseRequest: (id) => { set((state) => ({ purchaseRequests: state.purchaseRequests.filter(o => o.id !== id) })); get().markPending('rcerp_purchase_requests', get().purchaseRequests); },
      convertRequestToPOs: (requestId) => {
        const req = get().purchaseRequests.find(r => r.id === requestId);
        if (!req) return { ok: false, count: 0, poIds: [], error: 'طلب الشراء غير موجود' };
        return { ok: true, count: 1, poIds: [uid('po')], error: undefined };
      },
      
      addGoodsReceiptNote: (g) => {
        const grn: GoodsReceiptNote = { ...g, id: uid('grn'), grnNumber: `GRN-${Date.now().toString(36).toUpperCase()}`, status: 'draft' };
        set((state) => ({ grnNotes: [...state.grnNotes, grn] }));
        get().markPending('rcerp_grn', get().grnNotes);
      },
      updateGRNStatus: (id, status) => { set((state) => ({ grnNotes: state.grnNotes.map(g => g.id === id ? { ...g, status } : g) })); get().markPending('rcerp_grn', get().grnNotes); },
      revertGoodsReceiptToDraft: (id) => { set((state) => ({ grnNotes: state.grnNotes.map(g => g.id === id ? { ...g, status: 'draft' as const } : g) })); get().markPending('rcerp_grn', get().grnNotes); return 1; },
      updateGoodsReceiptNote: (id, g) => { set((state) => ({ grnNotes: state.grnNotes.map(item => item.id === id ? { ...item, ...g } : item) })); get().markPending('rcerp_grn', get().grnNotes); },
      
      addSupplierQuote: (q) => { set((state) => ({ supplierQuotes: [...state.supplierQuotes, { ...q, id: uid('sq') }] })); get().markPending('rcerp_supplier_quotes', get().supplierQuotes); },
      updateSupplierQuote: (id, q) => { set((state) => ({ supplierQuotes: state.supplierQuotes.map(item => item.id === id ? { ...item, ...q } : item) })); get().markPending('rcerp_supplier_quotes', get().supplierQuotes); },
      deleteSupplierQuote: (id) => { set((state) => ({ supplierQuotes: state.supplierQuotes.filter(item => item.id !== id) })); get().markPending('rcerp_supplier_quotes', get().supplierQuotes); },
      getQuotePrice: (supplierId, rawMaterialId) => get().supplierQuotes.find(q => q.supplierId === supplierId && q.rawMaterialId === rawMaterialId)?.price,
      
      addSupplierReturn: (r) => { set((state) => ({ supplierReturns: [...state.supplierReturns, { ...r, id: uid('sr'), returnNumber: `RET-${Date.now().toString(36).toUpperCase()}`, status: 'draft' }] })); get().markPending('rcerp_supplier_returns', get().supplierReturns); },
      updateSupplierReturn: (id, r) => { set((state) => ({ supplierReturns: state.supplierReturns.map(item => item.id === id ? { ...item, ...r } : item) })); get().markPending('rcerp_supplier_returns', get().supplierReturns); },
      approveSupplierReturn: (id) => { set((state) => ({ supplierReturns: state.supplierReturns.map(item => item.id === id ? { ...item, status: 'approved' as const } : item) })); get().markPending('rcerp_supplier_returns', get().supplierReturns); },
      reprocessSupplierReturn: (id) => { set((state) => ({ supplierReturns: state.supplierReturns.map(item => item.id === id ? { ...item, status: 'approved' as const } : item) })); get().markPending('rcerp_supplier_returns', get().supplierReturns); },
      revertSupplierReturnToDraft: (id) => { set((state) => ({ supplierReturns: state.supplierReturns.map(item => item.id === id ? { ...item, status: 'draft' as const } : item) })); get().markPending('rcerp_supplier_returns', get().supplierReturns); },
      
      addRequisition: (r) => { set((state) => ({ requisitions: [...state.requisitions, { ...r, id: uid('req'), reqNumber: `REQ-${Date.now().toString(36).toUpperCase()}`, status: 'draft', totalQty: 0 }] })); get().markPending('rcerp_requisitions', get().requisitions); },
      submitRequisition: (id) => { set((state) => ({ requisitions: state.requisitions.map(r => r.id === id ? { ...r, status: 'pending' as const } : r) })); get().markPending('rcerp_requisitions', get().requisitions); },
      approveRequisition: (id) => { set((state) => ({ requisitions: state.requisitions.map(r => r.id === id ? { ...r, status: 'approved' as const } : r) })); get().markPending('rcerp_requisitions', get().requisitions); },
      rejectRequisition: (id, reason) => { set((state) => ({ requisitions: state.requisitions.map(r => r.id === id ? { ...r, status: 'rejected' as const, rejectReason: reason } : r) })); get().markPending('rcerp_requisitions', get().requisitions); },
      cancelRequisition: (id) => { set((state) => ({ requisitions: state.requisitions.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r) })); get().markPending('rcerp_requisitions', get().requisitions); },
      deleteRequisition: (id) => { set((state) => ({ requisitions: state.requisitions.filter(r => r.id !== id) })); get().markPending('rcerp_requisitions', get().requisitions); },
      
      addMaterialCategory: (d) => { set((state) => ({ materialCategories: [...state.materialCategories, { ...d, id: uid('mc'), createdAt: new Date().toISOString() }] })); get().markPending('rcerp_material_categories', get().materialCategories); },
      updateMaterialCategory: (id, d) => { set((state) => ({ materialCategories: state.materialCategories.map(c => c.id === id ? { ...c, ...d } : c) })); get().markPending('rcerp_material_categories', get().materialCategories); },
      deleteMaterialCategory: (id) => { set((state) => ({ materialCategories: state.materialCategories.filter(c => c.id !== id) })); get().markPending('rcerp_material_categories', get().materialCategories); },
      
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-procurement',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        suppliers: state.suppliers,
        purchaseOrders: state.purchaseOrders,
        purchaseRequests: state.purchaseRequests,
        grnNotes: state.grnNotes,
        supplierQuotes: state.supplierQuotes,
        supplierReturns: state.supplierReturns,
        requisitions: state.requisitions,
        materialCategories: state.materialCategories,
      }),
    }
  )
);

export const useSuppliers = () => useProcurementStore(state => state.suppliers);
export const usePurchaseOrders = () => useProcurementStore(state => state.purchaseOrders);
export const usePurchaseRequests = () => useProcurementStore(state => state.purchaseRequests);
export const useGrnNotes = () => useProcurementStore(state => state.grnNotes);
export const useSupplierQuotes = () => useProcurementStore(state => state.supplierQuotes);
export const useSupplierReturns = () => useProcurementStore(state => state.supplierReturns);
export const useRequisitions = () => useProcurementStore(state => state.requisitions);
export const useMaterialCategories = () => useProcurementStore(state => state.materialCategories);

export const useProcurementActions = () => useProcurementStore(state => ({
  addSupplier: state.addSupplier,
  updateSupplier: state.updateSupplier,
  deleteSupplier: state.deleteSupplier,
  addPurchaseOrder: state.addPurchaseOrder,
  updatePurchaseOrder: state.updatePurchaseOrder,
  receivePurchaseOrder: state.receivePurchaseOrder,
  addPurchaseRequest: state.addPurchaseRequest,
  updatePurchaseRequest: state.updatePurchaseRequest,
  deletePurchaseRequest: state.deletePurchaseRequest,
  convertRequestToPOs: state.convertRequestToPOs,
  addGoodsReceiptNote: state.addGoodsReceiptNote,
  updateGRNStatus: state.updateGRNStatus,
  revertGoodsReceiptToDraft: state.revertGoodsReceiptToDraft,
  updateGoodsReceiptNote: state.updateGoodsReceiptNote,
  addSupplierQuote: state.addSupplierQuote,
  updateSupplierQuote: state.updateSupplierQuote,
  deleteSupplierQuote: state.deleteSupplierQuote,
  getQuotePrice: state.getQuotePrice,
  addSupplierReturn: state.addSupplierReturn,
  updateSupplierReturn: state.updateSupplierReturn,
  approveSupplierReturn: state.approveSupplierReturn,
  reprocessSupplierReturn: state.reprocessSupplierReturn,
  revertSupplierReturnToDraft: state.revertSupplierReturnToDraft,
  addRequisition: state.addRequisition,
  submitRequisition: state.submitRequisition,
  approveRequisition: state.approveRequisition,
  rejectRequisition: state.rejectRequisition,
  cancelRequisition: state.cancelRequisition,
  deleteRequisition: state.deleteRequisition,
  addMaterialCategory: state.addMaterialCategory,
  updateMaterialCategory: state.updateMaterialCategory,
  deleteMaterialCategory: state.deleteMaterialCategory,
}));

export const useProcurementSyncActions = () => useProcurementStore(state => ({
  setSuppliers: state.setSuppliers,
  setPurchaseOrders: state.setPurchaseOrders,
  setPurchaseRequests: state.setPurchaseRequests,
  setGrnNotes: state.setGrnNotes,
  setSupplierQuotes: state.setSupplierQuotes,
  setSupplierReturns: state.setSupplierReturns,
  setRequisitions: state.setRequisitions,
  setMaterialCategories: state.setMaterialCategories,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));