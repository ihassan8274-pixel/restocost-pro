import { create } from 'zustand';
import { planPosting, planUnposting, type PostLine } from '../business/grnPosting';
import type { GoodsReceiptNote } from '../types';
import { persist } from 'zustand/middleware';
import {
  InventoryRecord, InventoryBatch, InventoryMovementLog, StockTransfer,
  Distribution, IntakeInboxEntry, RecipeInventory, PhysicalStockCount,
  DailyInventoryCount, OpeningBalanceRecord, OpeningBalanceItem, BranchStockLimit, StockLevels,
  GoodsReceiptItem,
} from '../types';
import { today } from '../utils/helpers';
import { usePeriodStore } from './periodStore';

interface InventoryState {
  inventory: InventoryRecord[];
  inventoryBatches: InventoryBatch[];
  inventoryMovements: InventoryMovementLog[];
  recipeInventory: RecipeInventory[];
  physicalCounts: PhysicalStockCount[];
  dailyCounts: DailyInventoryCount[];
  openingBalances: OpeningBalanceRecord[];
  branchStockLimits: BranchStockLimit[];
  stockTransfers: StockTransfer[];
  distributions: Distribution[];
  intakeInbox: IntakeInboxEntry[];
  setInventory: (inventory: InventoryRecord[]) => void;
  setInventoryBatches: (batches: InventoryBatch[]) => void;
  setInventoryMovements: (movements: InventoryMovementLog[]) => void;
  setRecipeInventory: (inventory: RecipeInventory[]) => void;
  adjustInventory: (branchId: string, rawMaterialId: string, delta: number, batchInfo?: { batchNumber?: string; expiryDate?: string }, reason?: { type: string; ref?: string }) => void;
  /** ترحيل إشعار استلام معتمد إلى المخزون: يولّد حركات استلام ويضبط 'posted'.
   *  يرفض إن وُجدت حركات بنفس المرجع — الترحيل مرّة واحدة لا يتكرّر. */
  postGRN: (grn: GoodsReceiptNote) => { ok: boolean; reason?: string; detail?: string; moved?: number; total?: number };
  /** عكس الترحيل: حركات سالبة والحالة العودة إلى 'approved'. */
  unpostGRN: (grn: GoodsReceiptNote) => { ok: boolean; reason?: string; detail?: string; moved?: number };
  adjustRecipeInventory: (branchId: string, recipeId: string, delta: number) => void;
  getRecipeStock: (branchId: string, recipeId: string) => number;
  addInventoryBatches: (grnId: string, branchId: string, items: GoodsReceiptItem[]) => void;
  consumeInventoryBatch: (batchId: string, qty: number) => void;
  getFefoBatches: (branchId?: string, rawMaterialId?: string) => InventoryBatch[];
  expiringBatches: (days: number) => { expired: InventoryBatch[]; soon: InventoryBatch[] };
  getStockLevelsFor: (rawMaterialId: string, branchId: string) => StockLevels;
  upsertBranchStockLimit: (branchId: string, rawMaterialId: string, data: Partial<Omit<BranchStockLimit, 'id' | 'branchId' | 'rawMaterialId'>>) => void;
  removeBranchStockLimit: (branchId: string, rawMaterialId: string) => void;
  recordPhysicalCount: (data: Omit<PhysicalStockCount, 'id' | 'date'>) => void;
  addDailyCount: (data: Omit<DailyInventoryCount, 'id'>) => void;
  updateDailyCount: (id: string, data: Partial<Omit<DailyInventoryCount, 'id'>>) => void;
  deleteDailyCount: (id: string) => void;
  setOpeningBalances: (branchId: string, quantities: Record<string, number>) => void;
  addOpeningBalance: (r: Omit<OpeningBalanceRecord, 'id'>) => void;
  updateOpeningBalance: (id: string, r: Partial<OpeningBalanceRecord>) => void;
  deleteOpeningBalance: (id: string) => void;
  addStockTransfer: (t: Omit<StockTransfer, 'id' | 'transferNumber' | 'date' | 'status'>) => void;
  updateStockTransfer: (id: string, data: Partial<StockTransfer>) => void;
  submitStockTransfer: (id: string) => void;
  approveStockTransfer: (id: string) => void;
  rejectStockTransfer: (id: string, reason: string) => void;
  revertStockTransferToDraft: (id: string) => void;
  deleteStockTransfer: (id: string) => void;
  approveDistribution: (id: string) => void;
  rejectDistribution: (id: string) => void;
  updateDistribution: (id: string, data: Partial<Distribution>) => void;
  raiseInboxItem: (id: string) => void;
  rejectInboxItem: (id: string) => void;
  raiseAllMatchedInbox: () => Promise<number>;
  bindAndRaiseInboxItem: (id: string, body: { itemId?: string; fromId?: string; targets?: { index: number; toBranchId: string }[] }) => Promise<{ ok: boolean; distId?: string; transferNumbers?: string[]; learned?: number } | undefined>;
}

const nextId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      inventory: [],
      inventoryBatches: [],
      inventoryMovements: [],
      recipeInventory: [],
      physicalCounts: [],
      dailyCounts: [],
      openingBalances: [],
      branchStockLimits: [],
      stockTransfers: [],
      distributions: [],
      intakeInbox: [],

      setInventory: (inventory: InventoryRecord[]) => set({ inventory }),
      setInventoryBatches: (inventoryBatches: InventoryBatch[]) => set({ inventoryBatches }),
      setInventoryMovements: (inventoryMovements: InventoryMovementLog[]) => set({ inventoryMovements }),
      setRecipeInventory: (recipeInventory: RecipeInventory[]) => set({ recipeInventory }),

      // ── تعديل المخزون — كتابة ذرّية ──
      //
      // كانت ثلاث set() منفصلة: الدفعات (سالب)، ثم الرصيد، ثم الحركة. أي
      // انقطاع بينهما — إعادة تحميل، إغلاق تبويب، أو مزامنة تلتقط الحالة —
      // يُحدِث الرصيد بلا حركة. والنتيجة رصيد ≠ افتتاح + حركات، وفرق موجب
      // دائماً، بلا تفسير. قِستُها: 311 من 961 رصيداً، كلها أعلى.
      //
      // الآن set() واحدة: الرصيد والحركة (والدفعات) يولدون معاً أو لا يولد
      // شيء. لا حالة وسطى يمكن أن تُلاحَظ أو تُزامن.
      adjustInventory: (branchId, rawMaterialId, delta, batchInfo, reason) => {
        set((state) => {
          const patch: Partial<typeof state> = {};

          // ① دفعات(FEFO): السالب فقط، وهو أقدم صلاحية أولاً
          if (delta < 0) {
            const qty = -delta;
            const lots = state.inventoryBatches
              .filter((b) => b.branchId === branchId && b.rawMaterialId === rawMaterialId && b.remainingQty > 1e-9 && (!batchInfo?.batchNumber || b.batchNumber === batchInfo.batchNumber))
              .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') || (a.receivedAt || '').localeCompare(b.receivedAt || ''));
            if (lots.length > 0) {
              let remaining = qty;
              patch.inventoryBatches = state.inventoryBatches.map((b) => {
                if (remaining <= 1e-9) return b;
                const lot = lots.find((l) => l.id === b.id);
                if (!lot) return b;
                const take = Math.min(remaining, lot.remainingQty);
                remaining -= take;
                return { ...b, remainingQty: Math.max(0, Number((b.remainingQty - take).toFixed(4))) };
              });
            }
          }

          // ② الرصيد
          const idx = state.inventory.findIndex((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId);
          const nextInv = [...state.inventory];
          if (idx >= 0) {
            nextInv[idx] = {
              ...nextInv[idx],
              quantity: nextInv[idx].quantity + delta,
              lastUpdated: today(),
              ...(batchInfo?.batchNumber ? { batchNumber: batchInfo.batchNumber } : {}),
              ...(batchInfo?.expiryDate ? { expiryDate: batchInfo.expiryDate } : {}),
            };
          } else {
            nextInv.push({
              id: nextId('inv'), branchId, rawMaterialId, quantity: delta, lastUpdated: today(),
              batchNumber: batchInfo?.batchNumber, expiryDate: batchInfo?.expiryDate,
            } as InventoryRecord);
          }
          patch.inventory = nextInv;

          // ③ الحركة — في نفس الـset، فلا رصيد بلا حركة
          if (Math.abs(delta) > 1e-9) {
            patch.inventoryMovements = [
              {
                id: nextId('mv'), date: new Date().toISOString(),
                branchId, rawMaterialId,
                delta: Math.round(delta * 10000) / 10000,
                type: reason?.type || 'تسوية',
                ref: reason?.ref,
              } as InventoryMovementLog,
              ...state.inventoryMovements,
            ].slice(0, 5000);
          }

          return patch;
        });
      },

      // ── ترحيل إشعار الاستلام إلى المخزون ──
      // الاعتماد وحده لا يمسّ الكميات — updateGRNStatus سطرٌ واحد يغيّر الحالة
      // فقط — فكان 137 إشعاراً «معتمد» بلا حركات. الترحيل هو ما يرفع الرصيد.
      postGRN: (grn) => {
        const plan = planPosting(grn.id, {
          status: grn.status,
          items: grn.items.map((it) => ({
            rawMaterialId: it.rawMaterialId,
            quantityReceived: it.quantityReceived,
            unitPrice: it.unitPrice,
            batchNumber: it.batchNumber,
            expiryDate: it.expiryDate,
          })),
          existingMovementRefs: get().inventoryMovements.map((m) => m.ref).filter(Boolean) as string[],
        });
        if (!plan.ok) return { ok: false, reason: plan.reason, detail: plan.detail };

        for (const l of plan.lines) {
          get().adjustInventory(
            grn.branchId,
            l.rawMaterialId,
            l.qty,
            { batchNumber: l.batchNumber, expiryDate: l.expiryDate },
            { type: 'استقبال استلام', ref: grn.id },
          );
        }
        return { ok: true, moved: plan.lines.length, total: plan.total };
      },

      unpostGRN: (grn) => {
        if (grn.status !== 'posted') return { ok: false, reason: 'not_posted', detail: 'الإشعار غير مرحَّل' };
        const lines: PostLine[] = grn.items
          .filter((it) => it.rawMaterialId && (Number(it.quantityReceived) || 0) > 0)
          .map((it) => ({
            rawMaterialId: it.rawMaterialId,
            qty: Number(it.quantityReceived) || 0,
            unitPrice: Number(it.unitPrice) || 0,
            batchNumber: it.batchNumber || undefined,
            expiryDate: it.expiryDate || undefined,
          }));
        const rev = planUnposting(lines);
        for (const d of rev.deltas) {
          get().adjustInventory(
            grn.branchId,
            d.rawMaterialId,
            d.delta,
            { batchNumber: d.batchNumber, expiryDate: d.expiryDate },
            { type: 'تراجع ترحيل استلام', ref: grn.id },
          );
        }
        return { ok: true, moved: rev.deltas.length };
      },

      adjustRecipeInventory: (branchId, recipeId, delta) => {
        set((state) => {
          const idx = state.recipeInventory.findIndex((r) => r.branchId === branchId && r.recipeId === recipeId);
          const next = [...state.recipeInventory];
          if (idx >= 0) {
            next[idx] = { ...next[idx], quantity: Math.max(0, next[idx].quantity + delta), lastUpdated: today() };
          } else if (delta > 0) {
            next.push({ id: nextId('ri'), branchId, recipeId, quantity: delta, lastUpdated: today() });
          }
          return { recipeInventory: next };
        });
      },

      getRecipeStock: (branchId, recipeId) => {
        const { recipeInventory } = get();
        return recipeInventory.find((r) => r.branchId === branchId && r.recipeId === recipeId)?.quantity || 0;
      },

      addInventoryBatches: (grnId, branchId, items) => {
        set((state) => ({
          inventoryBatches: [...state.inventoryBatches, ...items.map((item) => ({
            id: nextId('batch'),
            grnId, branchId, rawMaterialId: item.rawMaterialId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            receivedAt: new Date().toISOString(),
            receivedQty: item.quantityReceived,
            remainingQty: item.quantityReceived,
            unitPrice: item.unitPrice,
          }))].filter((b) => !!b.batchNumber),
        }));
      },

      consumeInventoryBatch: (batchId, qty) => {
        set((state) => ({
          inventoryBatches: state.inventoryBatches.map((b) => (b.id === batchId ? { ...b, remainingQty: Math.max(0, Number((b.remainingQty - qty).toFixed(4))) } : b)),
        }));
      },

      getFefoBatches: (branchId, rawMaterialId) => {
        const { inventoryBatches } = get();
        return inventoryBatches
          .filter((b) => (!branchId || b.branchId === branchId) && (!rawMaterialId || b.rawMaterialId === rawMaterialId) && b.remainingQty > 1e-9)
          .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') || (a.receivedAt || '').localeCompare(b.receivedAt || ''));
      },

      expiringBatches: (days) => {
        const { inventoryBatches } = get();
        const now = Date.now();
        const soon: InventoryBatch[] = [];
        const expired: InventoryBatch[] = [];
        inventoryBatches.forEach((b) => {
          if (b.remainingQty <= 1e-9 || !b.expiryDate) return;
          const daysLeft = Math.floor((new Date(b.expiryDate).getTime() - now) / 86400000);
          if (daysLeft <= 0) expired.push(b);
          else if (daysLeft <= days) soon.push(b);
        });
        return { expired, soon };
      },

      getStockLevelsFor: (_rawMaterialId, branchId) => {
        const { branchStockLimits } = get();
        const limit = branchStockLimits.find((b) => b.branchId === branchId);
        return {
          minStockLevel: limit?.minStockLevel ?? 0,
          maxStockLevel: limit?.maxStockLevel ?? 0,
          alwaysOrderFullMax: limit?.alwaysOrderFullMax ?? false,
          isOverride: !!limit,
        };
      },

      upsertBranchStockLimit: (branchId, rawMaterialId, data) => {
        set((state) => {
          const idx = state.branchStockLimits.findIndex((b) => b.branchId === branchId && b.rawMaterialId === rawMaterialId);
          const id = `${branchId}__${rawMaterialId}`;
          if (idx >= 0) {
            const next = [...state.branchStockLimits];
            next[idx] = { ...next[idx], ...data };
            return { branchStockLimits: next };
          }
          return { branchStockLimits: [...state.branchStockLimits, { id, branchId, rawMaterialId, minStockLevel: data.minStockLevel ?? 0, maxStockLevel: data.maxStockLevel ?? 0, alwaysOrderFullMax: data.alwaysOrderFullMax ?? false }] };
        });
      },

      removeBranchStockLimit: (branchId, rawMaterialId) => {
        set((state) => ({ branchStockLimits: state.branchStockLimits.filter((b) => !(b.branchId === branchId && b.rawMaterialId === rawMaterialId)) }));
      },

      recordPhysicalCount: (data) => {
        const newCount: PhysicalStockCount = { ...data, id: nextId('psc'), date: today() };
        set((state) => ({ physicalCounts: [newCount, ...state.physicalCounts] }));
        newCount.items.forEach((item) => {
          set((state) => ({ inventory: state.inventory.map((i) => i.branchId === newCount.branchId && i.rawMaterialId === item.rawMaterialId ? { ...i, quantity: item.actualQty, lastUpdated: today() } : i) }));
        });
      },

      addDailyCount: (data) => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const newCount: DailyInventoryCount = { ...data, id: nextId('dc'), docNo: data.docNo || '', today: data.today || todayStr };
        set((state) => ({ dailyCounts: [newCount, ...state.dailyCounts] }));
      },

      updateDailyCount: (id, data) => {
        set((state) => ({ dailyCounts: state.dailyCounts.map((c) => (c.id === id ? { ...c, ...data } : c)) }));
      },

      deleteDailyCount: (id) => {
        set((state) => ({ dailyCounts: state.dailyCounts.filter((c) => c.id !== id) }));
      },

      setOpeningBalances: (branchId, quantities) => {
        set((state) => {
          const next = [...state.inventory];
          Object.entries(quantities).forEach(([rawMaterialId, quantity]) => {
            if (!(quantity > 0)) return;
            const idx = next.findIndex((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId);
            if (idx >= 0) next[idx] = { ...next[idx], quantity, lastUpdated: today() };
            else next.push({ id: nextId('inv'), branchId, rawMaterialId, quantity, lastUpdated: today() });
          });
          return { inventory: next };
        });
        const items: OpeningBalanceItem[] = Object.entries(quantities).filter(([, q]) => q > 0).map(([rawMaterialId, quantity]) => ({
          rawMaterialId, quantity, unitCost: 0,
        }));
        set((state) => ({ openingBalances: [{ id: nextId('ob'), branchId, date: today(), items }, ...state.openingBalances] }));
      },

      addOpeningBalance: (r) => {
        set((state) => ({ openingBalances: [{ ...r, id: nextId('ob') }, ...state.openingBalances] }));
      },

      updateOpeningBalance: (id, r) => {
        set((state) => ({ openingBalances: state.openingBalances.map((x) => (x.id === id ? { ...x, ...r } : x)) }));
      },

      deleteOpeningBalance: (id) => {
        set((state) => ({ openingBalances: state.openingBalances.filter((x) => x.id !== id) }));
      },

      addStockTransfer: (data) => {
        const newTransfer: StockTransfer = { ...data, id: nextId('trf'), transferNumber: `TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`, date: today(), status: 'draft' };
        set((state) => ({ stockTransfers: [newTransfer, ...state.stockTransfers] }));
      },

      updateStockTransfer: (id, data) => {
        set((state) => ({ stockTransfers: state.stockTransfers.map((t) => (t.id === id ? { ...t, ...data } : t)) }));
      },

      submitStockTransfer: (id) => {
        set((state) => ({ stockTransfers: state.stockTransfers.map((t) => (t.id === id ? { ...t, status: 'submitted' } : t)) }));
      },

      approveStockTransfer: (id) => {
        const { stockTransfers } = get();
        const target = stockTransfers.find((t) => t.id === id);
        if (!target || target.status !== 'submitted') return;
        if (usePeriodStore.getState().isDateClosed(target.date)) return;
        target.items.forEach((item) => {
          if (item.itemType === 'recipe' && item.recipeId) {
            get().adjustRecipeInventory(target.fromBranchId, item.recipeId, -item.quantity);
            get().adjustRecipeInventory(target.toBranchId, item.recipeId, item.quantity);
          } else {
            get().adjustInventory(target.fromBranchId, item.rawMaterialId!, -item.quantity, undefined, { type: 'تحويل صادر', ref: target.id });
            get().adjustInventory(target.toBranchId, item.rawMaterialId!, item.quantity, undefined, { type: 'تحويل وارد', ref: target.id });
          }
        });
        set((state) => ({ stockTransfers: state.stockTransfers.map((t) => (t.id === id ? { ...t, status: 'approved' } : t)) }));
      },

      rejectStockTransfer: (id, reason) => {
        set((state) => ({ stockTransfers: state.stockTransfers.map((t) => (t.id === id ? { ...t, status: 'rejected', rejectReason: reason } : t)) }));
      },

      revertStockTransferToDraft: (id) => {
        set((state) => ({ stockTransfers: state.stockTransfers.map((t) => (t.id === id ? { ...t, status: 'draft' } : t)) }));
      },

      deleteStockTransfer: (id) => {
        set((state) => ({ stockTransfers: state.stockTransfers.filter((t) => t.id !== id) }));
      },

      approveDistribution: (id) => {
        set((state) => ({ distributions: state.distributions.map((d) => (d.id === id ? { ...d, status: 'approved' } : d)) }));
      },

      rejectDistribution: (id) => {
        set((state) => ({ distributions: state.distributions.map((d) => (d.id === id ? { ...d, status: 'rejected' } : d)) }));
      },

      updateDistribution: (id, data) => {
        set((state) => ({ distributions: state.distributions.map((d) => (d.id === id ? { ...d, ...data } : d)) }));
      },

      raiseInboxItem: (id) => {
        set((state) => ({ intakeInbox: state.intakeInbox.map((item) => (item.id === id ? { ...item, status: 'raised' } : item)) }));
      },

      rejectInboxItem: (id) => {
        set((state) => ({ intakeInbox: state.intakeInbox.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item)) }));
      },

      raiseAllMatchedInbox: async () => {
        const { intakeInbox } = get();
        const matched = intakeInbox.filter((item) => item.status === 'pending');
        matched.forEach((item) => get().raiseInboxItem(item.id));
        return matched.length;
      },

      bindAndRaiseInboxItem: async () => ({ ok: false }),
    }),
    { name: 'rcerp_inventory' }
  )
);