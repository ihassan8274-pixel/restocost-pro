import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  RawMaterial, WastageLog, DepartmentRequisition, CustomerOrder, CustomerOrderStatus,
  AuditLogEntry, CustomReport,
} from '../types';
import { nextDocSequence } from '../business/docNumbers';
import { useAuthStore } from './authStore';

export type RecentDoc = { id: string; type: string; title: string; tab: string; at: number };

// ستور التوافق: المجموعات والعلامات التي لم يتبنَّها أي من الستورات الحديثة تُحفظ هنا
// (مصدر وحيد للحقيقة تُقرأه كل استدعاءات useApp عبر useAppCompat). يُدمج بياناته كذلك
// في تدفق المزامنة عبر collectionSources (مفتاح rcerp_raw_materials / rcerp_wastage ...).
interface LegacyCompatState {
  rawMaterials: RawMaterial[];
  wastageLogs: WastageLog[];
  requisitions: DepartmentRequisition[];
  customerOrders: CustomerOrder[];
  auditLogs: AuditLogEntry[];
  customReports: CustomReport[];
  recentDocs: RecentDoc[];
  acknowledgedAlertIds: string[];
  deletedIds: string[];
  globalTargetMarginPercent: number;
  vatPercent: number;
  vatInclusive: boolean;
  // ⭐ أُزيل deductSalesFromInventory من هنا. كان يقرأه ولا يكتبه شيء —
  // ظلّ ميت كان يجعل شارة الضبط تعرض قيمة لا تساوي ما يُضغط عليه:
  //   - writes : legacy.setDeductSalesFromInventory  (بلا markPending ⇒ لا تُرفع)
  //   - reads  : financialStore.deductSalesFromInventory (صاحب المزامنة)
  //   - server : collectionSources ⇒ legacy
  // ⇒ زرّ "مفعّل" لم يكن يُغيّر شيئاً مرئياً ولا مُفعِّل الخصم.
  // المالك الوحيد الآن: src/context/domains/financial (له markPending + Hydrate).

  setRawMaterials: (v: RawMaterial[]) => void;
  setWastageLogs: (v: WastageLog[]) => void;
  setRequisitions: (v: DepartmentRequisition[]) => void;
  setCustomerOrders: (v: CustomerOrder[]) => void;
  setAuditLogs: (v: AuditLogEntry[]) => void;
  setCustomReports: (v: CustomReport[] | ((prev: CustomReport[]) => CustomReport[])) => void;
  setRecentDocs: (v: RecentDoc[]) => void;
  setAcknowledgedAlertIds: (v: string[]) => void;
  setDeletedIds: (v: string[]) => void;
  setGlobalTargetMarginPercent: (v: number) => void;
  setVatPercent: (v: number) => void;
  setVatInclusive: (v: boolean) => void;
  // setDeductSalesFromInventory انتقل إلى src/context/domains/financial (المالك).

  tombstoneIds: (ids: string[]) => void;
  dropTombstoneIds: (ids: string[]) => void;
  addRecentDoc: (doc: { type: string; title: string; tab: string }, id?: string) => void;
  clearRecentDocs: () => void;
  logAudit: (action: string, module: string, details?: string, entity?: { type: string; id: string }) => void;
  addCustomerOrder: (o: Omit<CustomerOrder, 'id' | 'orderNumber' | 'createdAt' | 'status'>) => CustomerOrder;
  updateCustomerOrderStatus: (id: string, status: CustomerOrderStatus, paymentMethod?: string) => void;
}

export const useLegacyCompatStore = create<LegacyCompatState>()(
  persist(
    (set, get) => ({
      rawMaterials: [],
      wastageLogs: [],
      requisitions: [],
      customerOrders: [],
      auditLogs: [],
      customReports: [],
      recentDocs: [],
      acknowledgedAlertIds: [],
      deletedIds: [],
      globalTargetMarginPercent: 30,
      vatPercent: 0,
      vatInclusive: true,

      setRawMaterials: (rawMaterials) => set({ rawMaterials }),
      setWastageLogs: (wastageLogs) => set({ wastageLogs }),
      setRequisitions: (requisitions) => set({ requisitions }),
      setCustomerOrders: (customerOrders) => set({ customerOrders }),
      setAuditLogs: (auditLogs) => set({ auditLogs }),
      setCustomReports: (v) => set((state) => ({ customReports: typeof v === 'function' ? v(state.customReports) : v })),
      setRecentDocs: (recentDocs) => set({ recentDocs }),
      setAcknowledgedAlertIds: (acknowledgedAlertIds) => set({ acknowledgedAlertIds }),
      setDeletedIds: (deletedIds) => set({ deletedIds: Array.from(new Set(deletedIds)) }),
      setGlobalTargetMarginPercent: (globalTargetMarginPercent) => set({ globalTargetMarginPercent }),
      setVatPercent: (vatPercent) => set({ vatPercent }),
      setVatInclusive: (vatInclusive) => set({ vatInclusive }),

      tombstoneIds: (ids) => set((state) => ({ deletedIds: Array.from(new Set([...state.deletedIds, ...ids])) })),

      // إسقاط شواهد رفضها الخادم (لا يملك المستخدم حقّ قطعها): تُزال من
      // القائمة المحلية وإلا أُعيد إرسالها في كل محاولة إلى الأبد — وهي الحلقة
      // التي كانت تجمّد المزامنة كاملة وتُسقط حفظ الجرد.
      dropTombstoneIds: (ids) => set((state) => {
        const drop = new Set(ids);
        const next = state.deletedIds.filter((x) => !drop.has(x));
        return next.length === state.deletedIds.length ? {} : { deletedIds: next };
      }),

      addRecentDoc: (doc, id) => set((state) => ({
        recentDocs: [{ ...doc, id: id || `${doc.type}-${Date.now()}`, at: Date.now() }, ...state.recentDocs
          .filter((d) => !(d.type === doc.type && d.id === (id || d.id)))].slice(0, 8),
      })),

      clearRecentDocs: () => set({ recentDocs: [] }),

      logAudit: (action, module, details, entity) => {
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        const entry: AuditLogEntry = {
          id: `aud-${Date.now()}`,
          userId: currentUser.id,
          userName: currentUser.name,
          action,
          module,
          timestamp: new Date().toISOString(),
          details,
          entityType: entity?.type,
          entityId: entity?.id,
        };
        set((state) => ({ auditLogs: [entry, ...state.auditLogs].slice(0, 500) }));
      },

      addCustomerOrder: (o) => {
        const { customerOrders } = get();
        const rec: CustomerOrder = {
          ...o,
          id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderNumber: nextDocSequence('ORD', { existing: customerOrders.map((x) => x.orderNumber) }),
          status: 'new',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ customerOrders: [rec, ...state.customerOrders] }));
        get().logAudit('طلب عميل جديد', 'الطلبات', `${rec.orderNumber} — ${rec.branchName}`);
        return rec;
      },

      updateCustomerOrderStatus: (id, status, paymentMethod) => {
        set((state) => ({
          customerOrders: state.customerOrders.map((o) => (o.id === id ? { ...o, status, paymentMethod: paymentMethod ?? o.paymentMethod } : o)),
        }));
        get().logAudit('تحديث حالة طلب عميل', 'الطلبات', id);
      },
    }),
    { name: 'rcerp_legacy' }
  )
);