import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  POSOrder, BatchSalesRecord, Customer, Reservation,
  Invoice, DeliveryApp, DeliverySale,
} from '../types';
import { nextDocSequence } from '../business/docNumbers';

// معرّف فريد يتضمّن عشوائية لتفادي تصادم Time.now() عند الاستيراد المجمّع
// (فودكس يستدعي الإضافة عشرات المرات في حلقة واحدة بنفس المللي ثانية).
const genId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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

      addPOSOrder: (data) => {
        const orderDate = data.date || new Date().toISOString();
        const items = data.items || [];
        const gross = items.reduce((s, i) => s + (i.lineTotal || 0), 0);
        const totalCost = items.reduce((s, i) => s + (i.unitCost || 0) * (i.quantity || 0), 0);
        const vat = Math.round(gross * 0.15 * 100) / 100;
        const net = Math.round((gross - vat) * 100) / 100;
        const total = Math.round(gross * 100) / 100;
        const newOrder = {
          ...data,
          id: genId('ord'),
          orderNumber: `POS-${(data.branchId || 'BR').toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: orderDate,
          subtotal: net,
          vatAmount: vat,
          totalAmount: total,
          totalCost,
        } as POSOrder;
        set((state) => ({ posOrders: [newOrder, ...state.posOrders] }));
        return { ok: true, autoSupplied: [] };
      },
      updatePOSOrder: (id, data) => set((state) => ({ posOrders: state.posOrders.map((o) => (o.id === id ? { ...o, ...data } : o)) })),
      deletePOSOrder: (id) => set((state) => ({ posOrders: state.posOrders.filter((o) => o.id !== id) })),

      // foodCostPercent يُقرّب إلى رقمين عند الحفظ حتى تتطابق كل السجلات
      // المستوردة والمُدخلة يدوياً في العرض.
      addBatchSalesRecord: (data) => {
        const existing = get().batchSalesRecords.map((b) => b.batchNumber);
        const rec = {
          ...data,
          foodCostPercent: Math.round((data.foodCostPercent || 0) * 100) / 100,
          id: genId('bs'),
          batchNumber: nextDocSequence('BS', { existing }),
          createdAt: new Date().toISOString(),
        } as BatchSalesRecord;
        set((state) => ({ batchSalesRecords: [rec, ...state.batchSalesRecords] }));
      },
      updateBatchSalesRecord: (id, data) => set((state) => ({
        batchSalesRecords: state.batchSalesRecords.map((b) => (b.id === id
          ? { ...b, ...data, foodCostPercent: data.foodCostPercent !== undefined ? Math.round(data.foodCostPercent * 100) / 100 : b.foodCostPercent }
          : b)),
      })),
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
      recordInvoicePayment: (id, amount) => {
        set((state) => ({
          invoices: state.invoices.map((i) => {
            if (i.id !== id) return i;
            const paidAmount = Math.min(i.totalAmount, (i.paidAmount || 0) + amount);
            const status: Invoice['status'] = paidAmount >= i.totalAmount - 1e-6
              ? 'paid'
              : paidAmount > 1e-6 ? 'partially_paid' : i.status;
            return { ...i, paidAmount, status };
          }),
        }));
      },

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
