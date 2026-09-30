import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Supplier, GoodsReceiptNote, PurchaseOrder, PurchaseRequest,
  SupplierQuote, SupplierReturn,
} from '../types';
import { nextDocSequence } from '../business/docNumbers';

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
  getQuotePrice: (supplierId: string, rawMaterialId: string) => number;
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
        const newGrn: GoodsReceiptNote = { ...data, id: `grn-${Date.now()}`, grnNumber: nextDocSequence('GRN', { existing: get().grnNotes.map((g) => g.grnNumber) }) };
        set((state) => ({ grnNotes: [newGrn, ...state.grnNotes] }));
      },
      updateGoodsReceiptNote: (id, data) => set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, ...data } : g)) })),
      updateGRNStatus: (id, status) => set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, status } : g)) })),
      revertGoodsReceiptToDraft: (id) => { set((state) => ({ grnNotes: state.grnNotes.map((g) => (g.id === id ? { ...g, status: 'draft' as const } : g)) })); return 0; },

      addPurchaseOrder: (data) => {
        const newPO: PurchaseOrder = { ...data, id: `po-${Date.now()}`, poNumber: nextDocSequence('PO', { existing: get().purchaseOrders.map((p) => p.poNumber) }) };
        set((state) => ({ purchaseOrders: [newPO, ...state.purchaseOrders] }));
      },
      updatePurchaseOrder: (id, data) => set((state) => ({ purchaseOrders: state.purchaseOrders.map((p) => (p.id === id ? { ...p, ...data } : p)) })),

      addPurchaseRequest: (r) => {
        const rec: PurchaseRequest = { ...r, id: `pr-${Date.now()}`, requestNumber: nextDocSequence('PR', { existing: get().purchaseRequests.map((r) => r.requestNumber) }), createdAt: new Date().toISOString() };
        set((state) => ({ purchaseRequests: [rec, ...state.purchaseRequests] }));
        return rec;
      },
      updatePurchaseRequest: (id, data) => set((state) => ({ purchaseRequests: state.purchaseRequests.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      deletePurchaseRequest: (id) => set((state) => ({ purchaseRequests: state.purchaseRequests.filter((r) => r.id !== id) })),
      convertRequestToPOs: () => ({ ok: false, count: 0, poIds: [], error: 'Not implemented' }),

      addSupplierQuote: (data) => set((state) => ({ supplierQuotes: [{ ...data, id: `quote-${Date.now()}` }, ...state.supplierQuotes] })),
      updateSupplierQuote: (id, data) => set((state) => ({ supplierQuotes: state.supplierQuotes.map((q) => (q.id === id ? { ...q, ...data } : q)) })),
      deleteSupplierQuote: (id) => set((state) => ({ supplierQuotes: state.supplierQuotes.filter((q) => q.id !== id) })),
      getQuotePrice: () => 0,

      addSupplierReturn: (data) => {
        const newReturn: SupplierReturn = { ...data, id: `sr-${Date.now()}`, returnNumber: nextDocSequence('RET', { existing: get().supplierReturns.map((r) => r.returnNumber) }) };
        set((state) => ({ supplierReturns: [newReturn, ...state.supplierReturns] }));
      },
      updateSupplierReturn: (id, data) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      approveSupplierReturn: (id) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)) })),
      reprocessSupplierReturn: () => {},
      revertSupplierReturnToDraft: (id) => set((state) => ({ supplierReturns: state.supplierReturns.map((r) => (r.id === id ? { ...r, status: 'draft' as const, approvedBy: undefined } : r)) })),
      reprocessAllApprovedReturns: () => {},
      getReturnedQtyForGrn: () => 0,
    }),
    { name: 'rcerp_procurement' }
  )
);
