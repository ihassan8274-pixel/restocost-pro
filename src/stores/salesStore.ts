import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  POSOrder, BatchSalesRecord, Customer, Reservation,
  Invoice, DeliveryApp, DeliverySale,
} from '../types';
import { nextDocSequence } from '../business/docNumbers';

interface SalesState {
  posOrders: POSOrder[];
  batchSalesRecords: BatchSalesRecord[];
  customers: Customer[];
  reservations: Reservation[];
  invoices: Invoice[];
  deliveryApps: DeliveryApp[];
  deliverySales: DeliverySale[];
  addPOSOrder: (data: Omit<POSOrder, 'id' | 'orderNumber' | 'vatAmount' | 'totalAmount' | 'totalCost' | 'subtotal' | 'date'> & { date?: string }) => { ok: boolean; autoSupplied: string[] };
  updatePOSOrder: (id: string, data: Partial<POSOrder>) => void;
  deletePOSOrder: (id: string) => void;
  addBatchSalesRecord: (data: Omit<BatchSalesRecord, 'id' | 'batchNumber' | 'createdAt'>) => void;
  updateBatchSalesRecord: (id: string, data: Partial<BatchSalesRecord>) => void;
  deleteBatchSalesRecord: (id: string) => void;
  addCustomer: (data: Omit<Customer, 'id' | 'code'>) => void;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addReservation: (data: Omit<Reservation, 'id' | 'reservationNumber' | 'createdAt'>) => void;
  updateReservationStatus: (id: string, status: Reservation['status']) => void;
  deleteReservation: (id: string) => void;
  addInvoice: (data: Omit<Invoice, 'id' | 'invoiceNumber'>) => void;
  updateInvoice: (id: string, data: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  recordInvoicePayment: (id: string, amount: number) => void;
  addDeliveryApp: (data: Omit<DeliveryApp, 'id'>) => void;
  updateDeliveryApp: (id: string, data: Partial<DeliveryApp>) => void;
  deleteDeliveryApp: (id: string) => void;
  getDeliveryAppName: (id: string) => string;
  addDeliverySale: (data: Omit<DeliverySale, 'id'>) => void;
  updateDeliverySale: (id: string, data: Partial<DeliverySale>) => void;
  deleteDeliverySale: (id: string) => void;
}

export const useSalesStore = create<SalesState>()(
  persist(
    (set, get) => ({
      posOrders: [],
      batchSalesRecords: [],
      customers: [],
      reservations: [],
      invoices: [],
      deliveryApps: [],
      deliverySales: [],

      addPOSOrder: () => ({ ok: false, autoSupplied: [] }),
      updatePOSOrder: (id, data) => set((state) => ({ posOrders: state.posOrders.map((o) => (o.id === id ? { ...o, ...data } : o)) })),
      deletePOSOrder: (id) => set((state) => ({ posOrders: state.posOrders.filter((o) => o.id !== id) })),

      addBatchSalesRecord: () => {},
      updateBatchSalesRecord: (id, data) => set((state) => ({ batchSalesRecords: state.batchSalesRecords.map((b) => (b.id === id ? { ...b, ...data } : b)) })),
      deleteBatchSalesRecord: (id) => set((state) => ({ batchSalesRecords: state.batchSalesRecords.filter((b) => b.id !== id) })),

      addCustomer: (data) => set((state) => ({ customers: [{ ...data, id: `cus-${Date.now()}`, code: `CUS-${String(state.customers.length + 1).padStart(3, '0')}` }, ...state.customers] })),
      updateCustomer: (id, data) => set((state) => ({ customers: state.customers.map((c) => (c.id === id ? { ...c, ...data } : c)) })),
      deleteCustomer: (id) => set((state) => ({ customers: state.customers.filter((c) => c.id !== id) })),

      addReservation: (data) => set((state) => ({ reservations: [{ ...data, id: `res-${Date.now()}`, reservationNumber: nextDocSequence('RES', { existing: state.reservations.map((r) => r.reservationNumber) }), createdAt: new Date().toISOString() }, ...state.reservations] })),
      updateReservationStatus: (id, status) => set((state) => ({ reservations: state.reservations.map((r) => (r.id === id ? { ...r, status } : r)) })),
      deleteReservation: (id) => set((state) => ({ reservations: state.reservations.filter((r) => r.id !== id) })),

      addInvoice: (data) => set((state) => ({ invoices: [{ ...data, id: `inv-${Date.now()}`, invoiceNumber: nextDocSequence('INV', { existing: state.invoices.map((i) => i.invoiceNumber) }) }, ...state.invoices] })),
      updateInvoice: (id, data) => set((state) => ({ invoices: state.invoices.map((i) => (i.id === id ? { ...i, ...data } : i)) })),
      deleteInvoice: (id) => set((state) => ({ invoices: state.invoices.filter((i) => i.id !== id) })),
      recordInvoicePayment: () => {},

      addDeliveryApp: (data) => set((state) => ({ deliveryApps: [{ ...data, id: `app-${Date.now()}` }, ...state.deliveryApps] })),
      updateDeliveryApp: (id, data) => set((state) => ({ deliveryApps: state.deliveryApps.map((a) => (a.id === id ? { ...a, ...data } : a)) })),
      deleteDeliveryApp: (id) => set((state) => ({ deliveryApps: state.deliveryApps.filter((a) => a.id !== id) })),
      getDeliveryAppName: (id) => get().deliveryApps.find((a) => a.id === id)?.name || id,

      addDeliverySale: (data) => set((state) => ({ deliverySales: [{ ...data, id: `dsale-${Date.now()}` }, ...state.deliverySales] })),
      updateDeliverySale: (id, data) => set((state) => ({ deliverySales: state.deliverySales.map((s) => (s.id === id ? { ...s, ...data } : s)) })),
      deleteDeliverySale: (id) => set((state) => ({ deliverySales: state.deliverySales.filter((s) => s.id !== id) })),
    }),
    { name: 'rcerp_sales' }
  )
);
