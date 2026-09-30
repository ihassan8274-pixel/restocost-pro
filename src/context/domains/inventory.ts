import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InventoryRecord, InventoryBatch, InventoryMovementLog, BranchStockLimit, StockLevels, RawMaterial } from '../../types';

interface InventoryState {
  inventory: InventoryRecord[];
  batches: InventoryBatch[];
  movements: InventoryMovementLog[];
  branchStockLimits: BranchStockLimit[];
  rawMaterials: RawMaterial[];
  pendingChanges: Map<string, unknown>;
  
  setInventory: (data: InventoryRecord[]) => void;
  setBatches: (data: InventoryBatch[]) => void;
  setMovements: (data: InventoryMovementLog[]) => void;
  setBranchStockLimits: (data: BranchStockLimit[]) => void;
  setRawMaterials: (data: RawMaterial[]) => void;
  
  adjustInventory: (branchId: string, materialId: string, delta: number, batchInfo?: { batchNumber?: string; expiryDate?: string }, reason?: { type: string; ref?: string }) => void;
  addBatches: (grnId: string, branchId: string, items: Array<{ rawMaterialId: string; quantity: number; unitPrice: number; batchNumber: string; expiryDate: string; purchaseUnit?: string; unitFactor?: number }>) => void;
  consumeBatch: (batchId: string, qty: number) => void;
  getFefoBatches: (branchId?: string, rawMaterialId?: string) => InventoryBatch[];
  expiringBatches: (days: number) => { expired: InventoryBatch[]; soon: InventoryBatch[] };
  
  upsertBranchStockLimit: (branchId: string, rawMaterialId: string, data: Partial<Omit<BranchStockLimit, 'id' | 'branchId' | 'rawMaterialId'>>) => void;
  removeBranchStockLimit: (branchId: string, rawMaterialId: string) => void;
  getStockLevelsFor: (rawMaterialId: string, branchId: string, rawMaterials: RawMaterial[]) => StockLevels;
  
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      inventory: [],
      batches: [],
      movements: [],
      branchStockLimits: [],
      rawMaterials: [],
      pendingChanges: new Map(),
      
      setInventory: (data) => { set({ inventory: data }); get().markPending('rcerp_inventory', data); },
      setBatches: (data) => { set({ batches: data }); get().markPending('rcerp_inventory_batches', data); },
      setMovements: (data) => { set({ movements: data }); get().markPending('rcerp_inventory_movements', data); },
      setBranchStockLimits: (data) => { set({ branchStockLimits: data }); get().markPending('rcerp_branch_stock_limits', data); },
      setRawMaterials: (data) => { set({ rawMaterials: data }); get().markPending('rcerp_raw_materials', data); },
      
      adjustInventory: (branchId, materialId, delta, _batchInfo, reason) => {
        set((state) => {
          const idx = state.inventory.findIndex(i => i.branchId === branchId && i.rawMaterialId === materialId);
          const newInv = [...state.inventory];
          if (idx >= 0) {
            newInv[idx] = { ...newInv[idx], quantity: (newInv[idx].quantity || 0) + delta, lastUpdated: new Date().toISOString() };
          } else {
            newInv.push({ id: uid('inv'), branchId, rawMaterialId: materialId, quantity: delta, lastUpdated: new Date().toISOString() });
          }
          const movement: InventoryMovementLog = {
            id: uid('mov'),
            date: new Date().toISOString().split('T')[0],
            branchId,
            rawMaterialId: materialId,
            delta,
            type: delta > 0 ? 'in' : 'out',
            ref: reason?.ref,
          };
          return {
            inventory: newInv,
            movements: [movement, ...state.movements].slice(0, 10000),
          };
        });
        get().markPending('rcerp_inventory', get().inventory);
        get().markPending('rcerp_inventory_movements', get().movements);
      },
      
      addBatches: (grnId, branchId, items) => {
        set((state) => {
          const newBatches: InventoryBatch[] = items.map(item => ({
            id: uid('bat'),
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            rawMaterialId: item.rawMaterialId,
            branchId,
            grnId,
            receivedQty: item.quantity,
            remainingQty: item.quantity,
            receivedAt: new Date().toISOString(),
            unitPrice: item.unitPrice,
          }));
          return { batches: [...state.batches, ...newBatches] };
        });
        get().markPending('rcerp_inventory_batches', get().batches);
      },
      
      consumeBatch: (batchId, qty) => {
        set((state) => ({
          batches: state.batches.map(b => 
            b.id === batchId ? { ...b, remainingQty: Math.max(0, b.remainingQty - qty) } : b
          ),
        }));
        get().markPending('rcerp_inventory_batches', get().batches);
      },
      
      getFefoBatches: (branchId, rawMaterialId) => {
        const { batches } = get();
        return batches
          .filter(b => b.remainingQty > 0 && (!branchId || b.branchId === branchId) && (!rawMaterialId || b.rawMaterialId === rawMaterialId))
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
      },
      
      expiringBatches: (days) => {
        const { batches } = get();
        const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
        const expired: InventoryBatch[] = [];
        const soon: InventoryBatch[] = [];
        batches.forEach(b => {
          if (b.remainingQty <= 0) return;
          const exp = new Date(b.expiryDate).getTime();
          if (exp < Date.now()) expired.push(b);
          else if (exp < cutoff) soon.push(b);
        });
        return { expired, soon };
      },
      
      upsertBranchStockLimit: (branchId, rawMaterialId, data) => {
        set((state) => {
          const idx = state.branchStockLimits.findIndex(l => l.branchId === branchId && l.rawMaterialId === rawMaterialId);
          const newLimits = [...state.branchStockLimits];
          const limit: BranchStockLimit = {
            id: idx >= 0 ? newLimits[idx].id : uid('bsl'),
            branchId,
            rawMaterialId,
            minStockLevel: data.minStockLevel ?? 0,
            maxStockLevel: data.maxStockLevel ?? 0,
            alwaysOrderFullMax: data.alwaysOrderFullMax ?? false,
          };
          if (idx >= 0) newLimits[idx] = limit;
          else newLimits.push(limit);
          return { branchStockLimits: newLimits };
        });
        get().markPending('rcerp_branch_stock_limits', get().branchStockLimits);
      },
      
      removeBranchStockLimit: (branchId, rawMaterialId) => {
        set((state) => ({
          branchStockLimits: state.branchStockLimits.filter(l => !(l.branchId === branchId && l.rawMaterialId === rawMaterialId)),
        }));
        get().markPending('rcerp_branch_stock_limits', get().branchStockLimits);
      },
      
      getStockLevelsFor: (rawMaterialId, branchId, _rawMaterials) => {
        const { branchStockLimits } = get();
        const limit = branchStockLimits.find(l => l.branchId === branchId && l.rawMaterialId === rawMaterialId);
        const minStockLevel = limit?.minStockLevel ?? 0;
        const maxStockLevel = limit?.maxStockLevel ?? 0;
        const alwaysOrderFullMax = limit?.alwaysOrderFullMax ?? false;
        return {
          minStockLevel,
          maxStockLevel,
          alwaysOrderFullMax,
          isOverride: !!limit,
        };
      },
      
      markPending: (key, data) => {
        set((state) => {
          const newMap = new Map(state.pendingChanges);
          newMap.set(key, data);
          return { pendingChanges: newMap };
        });
      },
      
      clearPending: (key) => {
        set((state) => {
          const newMap = new Map(state.pendingChanges);
          newMap.delete(key);
          return { pendingChanges: newMap };
        });
      },
    }),
    {
      name: 'rcerp-inventory',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        inventory: state.inventory,
        batches: state.batches,
        branchStockLimits: state.branchStockLimits,
        rawMaterials: state.rawMaterials,
      }),
    }
  )
);

export const useInventory = () => useInventoryStore(state => state.inventory);
export const useInventoryBatches = () => useInventoryStore(state => state.batches);
export const useInventoryMovements = () => useInventoryStore(state => state.movements);
export const useBranchStockLimits = () => useInventoryStore(state => state.branchStockLimits);
export const useRawMaterials = () => useInventoryStore(state => state.rawMaterials);
export const useInventoryActions = () => useInventoryStore(state => ({
  adjustInventory: state.adjustInventory,
  addBatches: state.addBatches,
  consumeBatch: state.consumeBatch,
  getFefoBatches: state.getFefoBatches,
  expiringBatches: state.expiringBatches,
  upsertBranchStockLimit: state.upsertBranchStockLimit,
  removeBranchStockLimit: state.removeBranchStockLimit,
  getStockLevelsFor: state.getStockLevelsFor,
}));
export const usePendingInventoryChanges = () => useInventoryStore(state => state.pendingChanges);
export const useInventorySyncActions = () => useInventoryStore(state => ({
  setInventory: state.setInventory,
  setBatches: state.setBatches,
  setMovements: state.setMovements,
  setBranchStockLimits: state.setBranchStockLimits,
  setRawMaterials: state.setRawMaterials,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));