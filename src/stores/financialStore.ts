import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Account, JournalEntry, JournalLine, POSReturn, FixedAsset,
  OperatingExpense, ExpenseBudget, BranchPLSummary,
} from '../types';
import { today } from '../utils/helpers';

interface FinancialState {
  accounts: Account[];
  journalEntries: JournalEntry[];
  posReturns: POSReturn[];
  fixedAssets: FixedAsset[];
  operatingExpenses: OperatingExpense[];
  expenseBudgets: ExpenseBudget[];
  plSummaries: BranchPLSummary[];
  addAccount: (data: Omit<Account, 'id'>) => void;
  postEntry: (description: string, lines: JournalLine[], source?: 'manual' | 'auto', refNumber?: string) => void;
  addJournalEntry: (e: { date: string; description: string; lines: JournalLine[] }) => { ok: boolean; error?: string };
  addPOSReturn: (orderId: string, items: { recipeId: string; quantity: number }[], reason: string) => { ok: boolean; error?: string };
  addFixedAsset: (data: Omit<FixedAsset, 'id' | 'code'>) => void;
  updateFixedAsset: (id: string, d: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;
  recordDepreciation: (monthKey: string) => { ok: boolean; message: string };
  getMonthlyDepreciation: (a: FixedAsset) => number;
  addOperatingExpense: (data: Omit<OperatingExpense, 'id' | 'expenseNumber' | 'createdAt'>) => void;
  updateOperatingExpense: (id: string, data: Partial<OperatingExpense>) => void;
  deleteOperatingExpense: (id: string) => void;
  setExpenseBudget: (branchId: string, month: string, items: ExpenseBudget['items']) => void;
  rebuildPLSummaries: (monthKey?: string) => void;
  getFoodCostAlerts: () => any[];
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set, get) => ({
      accounts: [],
      journalEntries: [],
      posReturns: [],
      fixedAssets: [],
      operatingExpenses: [],
      expenseBudgets: [],
      plSummaries: [],

      addAccount: (data) => set((state) => ({ accounts: [{ ...data, id: `acc-${Date.now()}`, isActive: data.isActive ?? true }, ...state.accounts] })),

      postEntry: (description, lines, source = 'auto', refNumber) => {
        if (lines.length === 0) return;
        const total = lines.reduce((s, l) => s + l.debit, 0);
        const creditTotal = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(total - creditTotal) > 0.01) return;
        set((state) => ({
          journalEntries: [{ id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, entryNumber: `JE-${new Date().getFullYear()}-${String(state.journalEntries.length + 1).padStart(4, '0')}`, date: today(), description, lines, source, refNumber }, ...state.journalEntries],
        }));
      },

      addJournalEntry: (e) => {
        const lines = e.lines.filter((l) => l.debit > 0 || l.credit > 0);
        const debit = lines.reduce((s, l) => s + l.debit, 0);
        const credit = lines.reduce((s, l) => s + l.credit, 0);
        if (lines.length < 2) return { ok: false, error: 'يجب إدخال سطرين على الأقل (مدين ودائن)' };
        if (Math.abs(debit - credit) > 0.01) return { ok: false, error: 'القيد غير متوازن' };
        set((state) => ({ journalEntries: [{ id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, entryNumber: `JE-${new Date().getFullYear()}-${String(state.journalEntries.length + 1).padStart(4, '0')}`, date: e.date || today(), description: e.description, lines, source: 'manual' }, ...state.journalEntries] }));
        return { ok: true };
      },

      addPOSReturn: () => ({ ok: false, error: 'Not implemented' }),

      addFixedAsset: (data) => {
        const asset: FixedAsset = { ...data, id: `fa-${Date.now()}`, code: `FA-${Math.floor(100 + Math.random() * 900)}` };
        set((state) => ({ fixedAssets: [asset, ...state.fixedAssets] }));
      },
      updateFixedAsset: (id, d) => set((state) => ({ fixedAssets: state.fixedAssets.map((a) => (a.id === id ? { ...a, ...d } : a)) })),
      deleteFixedAsset: (id) => set((state) => ({ fixedAssets: state.fixedAssets.filter((a) => a.id !== id) })),

      getMonthlyDepreciation: (a) => {
        if (!a.purchaseCost || !a.usefulLifeYears) return 0;
        return Math.round(((a.purchaseCost - (a.salvageValue || 0)) / (a.usefulLifeYears * 12)) * 100) / 100;
      },

      recordDepreciation: (monthKey) => {
        let totalDep = 0;
        let posted = 0;
        const updated = get().fixedAssets.map((a) => {
          if (!a.isActive || a.lastDepreciationDate === monthKey) return a;
          const monthly = get().getMonthlyDepreciation(a);
          const cap = Math.max(0, a.purchaseCost - (a.salvageValue || 0));
          const newAcc = Math.min(cap, a.accumulatedDepreciation + monthly);
          if (newAcc <= a.accumulatedDepreciation + 0.001) return { ...a, lastDepreciationDate: monthKey };
          totalDep += newAcc - a.accumulatedDepreciation;
          posted++;
          return { ...a, accumulatedDepreciation: Number(newAcc.toFixed(2)), lastDepreciationDate: monthKey };
        });
        if (posted === 0) return { ok: false, message: 'لا توجد أصول تحتاج ترحيل اهتلاك لهذا الشهر' };
        set({ fixedAssets: updated });
        const amount = Number(totalDep.toFixed(2));
        get().postEntry(`اهتلاك الأصول الثابتة - ${monthKey}`, [{ accountId: 'acc-dep', debit: amount, credit: 0 }, { accountId: 'acc-acc-dep', debit: 0, credit: amount }], 'auto', `DEPR-${monthKey}`);
        return { ok: true, message: `تم ترحيل اهتلاك ${posted} أصل بقيمة ${amount} ر.س` };
      },

      addOperatingExpense: (data) => {
        set((state) => ({ operatingExpenses: [{ ...data, id: `exp-${Date.now()}`, expenseNumber: `EXP-${Date.now()}`, createdAt: new Date().toISOString() }, ...state.operatingExpenses] }));
      },
      updateOperatingExpense: (id, data) => set((state) => ({ operatingExpenses: state.operatingExpenses.map((e) => (e.id === id ? { ...e, ...data } : e)) })),
      deleteOperatingExpense: (id) => set((state) => ({ operatingExpenses: state.operatingExpenses.filter((e) => e.id !== id) })),

      setExpenseBudget: (branchId, month, items) => set((state) => {
        const existing = state.expenseBudgets.find((b) => b.branchId === branchId && b.month === month);
        if (existing) return { expenseBudgets: state.expenseBudgets.map((b) => (b.branchId === branchId && b.month === month ? { ...b, items } : b)) };
        return { expenseBudgets: [...state.expenseBudgets, { branchId, month, items }] };
      }),

      rebuildPLSummaries: () => {},

      getFoodCostAlerts: () => {
        // placeholder - will be implemented later
        return [];
      },
    }),
    { name: 'rcerp_financial' }
  )
);
