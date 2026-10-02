import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EodClosure, MonthlyInventoryPeriod, MonthlyInventoryItem } from '../types';
import { today } from '../utils/helpers';

interface PeriodState {
  closedMonths: string[];
  closedDays: string[];
  eodClosures: EodClosure[];
  monthlyInventory: MonthlyInventoryPeriod[];
  isMonthClosed: (monthKey: string) => boolean;
  isDateClosed: (date: string) => boolean;
  closeDay: (date: string) => void;
  reopenDay: (date: string) => void;
  startMonthlyInventory: (branchId: string, monthKey: string, items?: MonthlyInventoryItem[]) => void;
  saveMonthlyInventoryCounts: (id: string, counted: Record<string, number>) => void;
  closeMonthlyInventory: (id: string, settlement?: {
    appliedAt?: string; shortages?: number; surplus?: number; netVariance?: number;
  }) => void;
  deleteMonthlyInventory: (id: string) => void;
  reopenMonthlyInventory: (id: string) => void;
}

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set, get) => ({
      closedMonths: [],
      closedDays: [],
      eodClosures: [],
      monthlyInventory: [],

      isMonthClosed: (monthKey) => get().closedMonths.includes(monthKey),
      isDateClosed: (date) => get().closedMonths.includes(date.slice(0, 7)) || get().closedDays.includes(date.slice(0, 10)),

      closeDay: (date) => {
        const d = (date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
        if (get().closedDays.includes(d)) return;
        set((state) => ({ closedDays: [...state.closedDays, d].sort() }));
      },

      reopenDay: (date) => {
        const d = (date || '').slice(0, 10);
        set((state) => ({ closedDays: state.closedDays.filter((x) => x !== d) }));
        set((state) => ({ eodClosures: state.eodClosures.filter((c) => c.date !== d) }));
      },

      startMonthlyInventory: (branchId, monthKey, items?: MonthlyInventoryItem[]) => {
        if (get().isMonthClosed(monthKey)) return;
        set((state) => ({ monthlyInventory: [{ id: `mi-${Date.now()}`, branchId, monthKey, status: 'counting' as const, createdAt: today(), items: items || [], totalTheoreticalUsage: 0, totalActualUsage: 0, totalUsageVariance: 0, totalVarianceCost: 0 }, ...state.monthlyInventory] }));
      },

      saveMonthlyInventoryCounts: (id, counted) => {
        set((state) => ({
          monthlyInventory: state.monthlyInventory.map((p) => {
            if (p.id !== id) return p;
            const items = p.items.map((it) => {
              const countedQty = counted[it.rawMaterialId];
              if (countedQty === undefined) return it;
              const varianceQty = Number((countedQty - it.theoreticalQty).toFixed(2));
              const actualUsage = Number((it.theoreticalUsage + varianceQty).toFixed(2));
              return { ...it, countedQty, varianceQty, varianceCost: Number((varianceQty * it.unitCost).toFixed(2)), actualUsage, usageVariance: Number((it.theoreticalUsage - actualUsage).toFixed(2)) };
            });
            return { ...p, items, totalVarianceCost: items.reduce((s, i) => s + i.varianceCost, 0), totalActualUsage: items.reduce((s, i) => s + i.actualUsage, 0), totalTheoreticalUsage: items.reduce((s, i) => s + i.theoreticalUsage, 0), totalUsageVariance: items.reduce((s, i) => s + i.usageVariance, 0) };
          }),
        }));
      },

// إقفال الشهر: يطبّق تسوية الجرد على المخزون (فرق الدفتري عن الفعلي)،
// ثم يقفل الشهر. كان يقفل فقط بلا تعديل للمخزون ولا قيد — فالفرق كان يختفي.
// التطبيق يتم في MonthlyInventoryView (startMonthlyInventoryClose) لأنه يحتاج
// الوصول إلى متجر المخزون+dفتر القيود؛ هنا نُبقي الفترة ونقفلها فقط.
closeMonthlyInventory: (id, settlement?: { appliedAt?: string; shortages?: number; surplus?: number; netVariance?: number }) => {
  const p = get().monthlyInventory.find((x) => x.id === id);
  if (!p) return;
  set((state) => ({
    monthlyInventory: state.monthlyInventory.map((x) => (x.id === id
      ? {
        ...x,
        status: 'closed' as const,
        closedAt: new Date().toISOString(),
        // بصمة التسوية: نثبت ما طُبِّق فعلاً على المخزون
        ...(settlement ? {
          settlementAppliedAt: settlement.appliedAt || new Date().toISOString(),
          settlementShortages: settlement.shortages ?? 0,
          settlementSurpluses: settlement.surplus ?? 0,
          settlementNetVariance: settlement.netVariance ?? 0,
        } : {}),
      }
      : x)),
  }));
  set((state) => ({ closedMonths: state.closedMonths.includes(p.monthKey) ? state.closedMonths : [...state.closedMonths, p.monthKey] }));
},

      deleteMonthlyInventory: (id) => {
        set((state) => ({ monthlyInventory: state.monthlyInventory.filter((x) => x.id !== id) }));
      },

      reopenMonthlyInventory: (id) => {
        const p = get().monthlyInventory.find((x) => x.id === id);
        if (!p) return;
        if (p.status === 'counting') return;
        set((state) => ({ monthlyInventory: state.monthlyInventory.map((x) => (x.id === id ? { ...x, status: 'counting' as const, closedAt: undefined } : x)) }));
        set((state) => ({ closedMonths: state.closedMonths.filter((m) => m !== p.monthKey) }));
      },
    }),
    { name: 'rcerp_period' }
  )
);