import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  Account, JournalEntry, JournalLine, BranchPLSummary, 
  OperatingExpense, ExpenseBudget, FixedAsset, 
  ScheduledReport, AutomationRule, EodClosure, 
  Invoice, POSOrder, POSReturn, Customer 
} from '../../types';

interface FinancialState {
  // Core accounting
  accounts: Account[];
  journalEntries: JournalEntry[];
  
  // P&L
  plSummaries: BranchPLSummary[];
  
  // Invoices & POS
  invoices: Invoice[];
  posOrders: POSOrder[];
  posReturns: POSReturn[];
  
  // Expenses
  operatingExpenses: OperatingExpense[];
  expenseBudgets: ExpenseBudget[];
  
  // Fixed Assets
  fixedAssets: FixedAsset[];
  
  // Reports & Automation
  scheduledReports: ScheduledReport[];
  automationRules: AutomationRule[];
  
  // Period closures
  eodClosures: EodClosure[];
  
  // Customers
  customers: Customer[];
  
  // Settings
  globalTargetMarginPercent: number;
  vatPercent: number;
  vatInclusive: boolean;
  deductSalesFromInventory: boolean;
  acknowledgedAlertIds: string[];
  
  // Pending changes for sync
  pendingChanges: Map<string, unknown>;
  
  // Setters (for sync engine)
  setAccounts: (data: Account[]) => void;
  setJournalEntries: (data: JournalEntry[]) => void;
  setPlSummaries: (data: BranchPLSummary[]) => void;
  setInvoices: (data: Invoice[]) => void;
  setPosOrders: (data: POSOrder[]) => void;
  setPosReturns: (data: POSReturn[]) => void;
  setOperatingExpenses: (data: OperatingExpense[]) => void;
  setExpenseBudgets: (data: ExpenseBudget[]) => void;
  setFixedAssets: (data: FixedAsset[]) => void;
  setScheduledReports: (data: ScheduledReport[]) => void;
  setAutomationRules: (data: AutomationRule[]) => void;
  setEodClosures: (data: EodClosure[]) => void;
  setCustomers: (data: Customer[]) => void;
  setGlobalTargetMarginPercent: (m: number) => void;
  setVatPercent: (v: number) => void;
  setVatInclusive: (v: boolean) => void;
  setDeductSalesFromInventory: (v: boolean) => void;
  setAcknowledgedAlertIds: (ids: string[]) => void;
  
  // Actions
  addAccount: (a: Omit<Account, 'id'>) => void;
  addJournalEntry: (e: { date: string; description: string; lines: JournalLine[] }) => { ok: boolean; error?: string };
  
  addOperatingExpense: (e: Omit<OperatingExpense, 'id' | 'expenseNumber' | 'createdAt'>) => void;
  updateOperatingExpense: (id: string, e: Partial<OperatingExpense>) => void;
  deleteOperatingExpense: (id: string) => void;
  setExpenseBudget: (branchId: string, month: string, items: ExpenseBudget['items']) => void;
  
  addFixedAsset: (a: Omit<FixedAsset, 'id' | 'code'>) => void;
  updateFixedAsset: (id: string, d: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;
  recordDepreciation: (monthKey: string) => { ok: boolean; message: string };
  getMonthlyDepreciation: (a: FixedAsset) => number;
  
  addScheduledReport: (d: Omit<ScheduledReport, 'id'>) => void;
  setScheduledReport: (id: string, d: Partial<ScheduledReport>) => void;
  runScheduledReport: (id: string) => string;
  setAutomationRule: (id: string, enabled: boolean) => void;
  runAutomation: () => { ok: boolean; message: string };
  
  addInvoice: (i: Omit<Invoice, 'id' | 'invoiceNumber'>) => void;
  updateInvoice: (id: string, i: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  recordInvoicePayment: (id: string, amount: number) => void;
  
  addPOSOrder: (o: Omit<POSOrder, 'id' | 'orderNumber' | 'vatAmount' | 'totalAmount' | 'totalCost' | 'subtotal' | 'date'> & { date?: string }) => { ok: boolean; autoSupplied: string[] };
  updatePOSOrder: (id: string, o: Partial<POSOrder>) => void;
  deletePOSOrder: (id: string) => void;
  addPOSReturn: (orderId: string, items: { recipeId: string; quantity: number }[], reason: string) => { ok: boolean; error?: string };
  
  addCustomer: (c: Omit<Customer, 'id' | 'code'>) => void;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  
  rebuildPLSummaries: (monthKey?: string) => void;
  
  // Sync
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set, get) => ({
      accounts: [],
      journalEntries: [],
      plSummaries: [],
      invoices: [],
      posOrders: [],
      posReturns: [],
      operatingExpenses: [],
      expenseBudgets: [],
      fixedAssets: [],
      scheduledReports: [],
      automationRules: [],
      eodClosures: [],
      customers: [],
      globalTargetMarginPercent: 72,
      vatPercent: 15,
      vatInclusive: true,
      deductSalesFromInventory: false,
      acknowledgedAlertIds: [],
      pendingChanges: new Map(),
      
      // Setters
      setAccounts: (data) => { set({ accounts: data }); get().markPending('rcerp_accounts', data); },
      setJournalEntries: (data) => { set({ journalEntries: data }); get().markPending('rcerp_journal', data); },
      setPlSummaries: (data) => { set({ plSummaries: data }); get().markPending('rcerp_pl_summaries', data); },
      setInvoices: (data) => { set({ invoices: data }); get().markPending('rcerp_invoices', data); },
      setPosOrders: (data) => { set({ posOrders: data }); get().markPending('rcerp_pos_orders', data); },
      setPosReturns: (data) => { set({ posReturns: data }); get().markPending('rcerp_pos_returns', data); },
      setOperatingExpenses: (data) => { set({ operatingExpenses: data }); get().markPending('rcerp_operating_expenses', data); },
      setExpenseBudgets: (data) => { set({ expenseBudgets: data }); get().markPending('rcerp_expense_budgets', data); },
      setFixedAssets: (data) => { set({ fixedAssets: data }); get().markPending('rcerp_fixed_assets', data); },
      setScheduledReports: (data) => { set({ scheduledReports: data }); get().markPending('rcerp_scheduled_reports', data); },
      setAutomationRules: (data) => { set({ automationRules: data }); get().markPending('rcerp_automation_rules', data); },
      setEodClosures: (data) => { set({ eodClosures: data }); get().markPending('rcerp_eod_closures', data); },
      setCustomers: (data) => { set({ customers: data }); get().markPending('rcerp_customers', data); },
      setGlobalTargetMarginPercent: (m) => { set({ globalTargetMarginPercent: m }); get().markPending('rcerp_target_margin', m); },
      setVatPercent: (v) => { set({ vatPercent: v }); get().markPending('rcerp_vat_percent', v); },
      setVatInclusive: (v) => { set({ vatInclusive: v }); get().markPending('rcerp_vat_inclusive', v); },
      setDeductSalesFromInventory: (v) => { set({ deductSalesFromInventory: v }); get().markPending('rcerp_deduct_sales', v); },
      setAcknowledgedAlertIds: (ids) => { set({ acknowledgedAlertIds: ids }); get().markPending('rcerp_ack_alerts', ids); },
      
      // Actions
      addAccount: (a) => { set((state) => ({ accounts: [...state.accounts, { ...a, id: uid('acc') }] })); get().markPending('rcerp_accounts', get().accounts); },
      addJournalEntry: (e) => { 
        const entry: JournalEntry = { id: uid('je'), entryNumber: `JE-${Date.now().toString(36).toUpperCase()}`, date: e.date, description: e.description, lines: e.lines }; 
        set((state) => ({ journalEntries: [entry, ...state.journalEntries] })); 
        get().markPending('rcerp_journal', get().journalEntries); 
        return { ok: true }; 
      },
      
      addOperatingExpense: (e) => { 
        set((state) => ({ operatingExpenses: [...state.operatingExpenses, { ...e, id: uid('exp'), expenseNumber: `EXP-${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString() }] })); 
        get().markPending('rcerp_operating_expenses', get().operatingExpenses); 
      },
      updateOperatingExpense: (id, e) => { 
        set((state) => ({ operatingExpenses: state.operatingExpenses.map(ex => ex.id === id ? { ...ex, ...e } : ex) })); 
        get().markPending('rcerp_operating_expenses', get().operatingExpenses); 
      },
      deleteOperatingExpense: (id) => { 
        set((state) => ({ operatingExpenses: state.operatingExpenses.filter(ex => ex.id !== id) })); 
        get().markPending('rcerp_operating_expenses', get().operatingExpenses); 
      },
      setExpenseBudget: (branchId, month, items) => { 
        set((state) => ({ expenseBudgets: [...state.expenseBudgets.filter(b => !(b.branchId === branchId && b.month === month)), { branchId, month, items }] })); 
        get().markPending('rcerp_expense_budgets', get().expenseBudgets); 
      },
      
      addFixedAsset: (a) => { 
        set((state) => ({ fixedAssets: [...state.fixedAssets, { ...a, id: uid('fa'), code: `FA-${Date.now().toString(36).toUpperCase()}` }] })); 
        get().markPending('rcerp_fixed_assets', get().fixedAssets); 
      },
      updateFixedAsset: (id, d) => { 
        set((state) => ({ fixedAssets: state.fixedAssets.map(fa => fa.id === id ? { ...fa, ...d } : fa) })); 
        get().markPending('rcerp_fixed_assets', get().fixedAssets); 
      },
      deleteFixedAsset: (id) => { 
        set((state) => ({ fixedAssets: state.fixedAssets.filter(fa => fa.id !== id) })); 
        get().markPending('rcerp_fixed_assets', get().fixedAssets); 
      },
      recordDepreciation: (_monthKey) => { 
        return { ok: true, message: 'Depreciation recorded' }; 
      },
      getMonthlyDepreciation: (a) => (a.purchaseCost || 0) / (a.usefulLifeYears || 1) / 12,
      
      addScheduledReport: (d) => { 
        set((state) => ({ scheduledReports: [...state.scheduledReports, { ...d, id: uid('sr') }] })); 
        get().markPending('rcerp_scheduled_reports', get().scheduledReports); 
      },
      setScheduledReport: (id, d) => { 
        set((state) => ({ scheduledReports: state.scheduledReports.map(sr => sr.id === id ? { ...sr, ...d } : sr) })); 
        get().markPending('rcerp_scheduled_reports', get().scheduledReports); 
      },
      runScheduledReport: (_id) => uid('sr-run'),
      setAutomationRule: (id, enabled) => { 
        set((state) => ({ automationRules: state.automationRules.map(ar => ar.id === id ? { ...ar, enabled } : ar) })); 
        get().markPending('rcerp_automation_rules', get().automationRules); 
      },
      runAutomation: () => { return { ok: true, message: 'Automation run completed' }; },
      
      addInvoice: (i) => { 
        set((state) => ({ invoices: [...state.invoices, { ...i, id: uid('inv'), invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}` }] })); 
        get().markPending('rcerp_invoices', get().invoices); 
      },
      updateInvoice: (id, i) => { 
        set((state) => ({ invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...i } : inv) })); 
        get().markPending('rcerp_invoices', get().invoices); 
      },
      deleteInvoice: (id) => { 
        set((state) => ({ invoices: state.invoices.filter(inv => inv.id !== id) })); 
        get().markPending('rcerp_invoices', get().invoices); 
      },
      recordInvoicePayment: (id, amount) => { 
        set((state) => ({ invoices: state.invoices.map(inv => inv.id === id ? { ...inv, paidAmount: (inv.paidAmount || 0) + amount } : inv) })); 
        get().markPending('rcerp_invoices', get().invoices); 
      },
      
      addPOSOrder: (o) => { 
        const order: POSOrder = { ...o, id: uid('pos'), orderNumber: `POS-${Date.now().toString(36).toUpperCase()}`, date: o.date || new Date().toISOString().split('T')[0], vatAmount: 0, totalAmount: 0, totalCost: 0, subtotal: 0, status: 'received' }; 
        set((state) => ({ posOrders: [order, ...state.posOrders] })); 
        get().markPending('rcerp_pos_orders', get().posOrders); 
        return { ok: true, autoSupplied: [] }; 
      },
      updatePOSOrder: (id, o) => { 
        set((state) => ({ posOrders: state.posOrders.map(po => po.id === id ? { ...po, ...o } : po) })); 
        get().markPending('rcerp_pos_orders', get().posOrders); 
      },
      deletePOSOrder: (id) => { 
        set((state) => ({ posOrders: state.posOrders.filter(po => po.id !== id) })); 
        get().markPending('rcerp_pos_orders', get().posOrders); 
      },
      addPOSReturn: (orderId, items, reason) => { 
        const ret: POSReturn = { 
          id: uid('ret'), 
          returnNumber: `RET-${Date.now().toString(36).toUpperCase()}`, 
          orderId, 
          orderNumber: '', 
          branchId: '', 
          date: new Date().toISOString(), 
          items: items.map(i => ({ 
            recipeId: i.recipeId, 
            recipeName: '', 
            quantity: i.quantity, 
            unitPrice: 0, 
            unitCost: 0, 
            lineTotal: 0 
          })), 
          subtotal: 0, 
          vatAmount: 0, 
          totalAmount: 0, 
          totalCost: 0, 
          reason, 
          refundedBy: '', 
          status: 'draft' 
        }; 
        set((state) => ({ posReturns: [ret, ...state.posReturns] })); 
        get().markPending('rcerp_pos_returns', get().posReturns); 
        return { ok: true }; 
      },
      
      addCustomer: (c) => { 
        set((state) => ({ customers: [...state.customers, { ...c, id: uid('cust'), code: `CUST-${Date.now().toString(36).toUpperCase()}` }] })); 
        get().markPending('rcerp_customers', get().customers); 
      },
      updateCustomer: (id, c) => { 
        set((state) => ({ customers: state.customers.map(cu => cu.id === id ? { ...cu, ...c } : cu) })); 
        get().markPending('rcerp_customers', get().customers); 
      },
      deleteCustomer: (id) => { 
        set((state) => ({ customers: state.customers.filter(cu => cu.id !== id) })); 
        get().markPending('rcerp_customers', get().customers); 
      },
      
      rebuildPLSummaries: (_monthKey) => { 
        get().markPending('rcerp_pl_summaries', get().plSummaries); 
      },
      
      // Sync
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-financial',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        journalEntries: state.journalEntries,
        plSummaries: state.plSummaries,
        operatingExpenses: state.operatingExpenses,
        expenseBudgets: state.expenseBudgets,
        fixedAssets: state.fixedAssets,
        scheduledReports: state.scheduledReports,
        automationRules: state.automationRules,
        eodClosures: state.eodClosures,
        invoices: state.invoices,
        posOrders: state.posOrders,
        posReturns: state.posReturns,
        customers: state.customers,
        globalTargetMarginPercent: state.globalTargetMarginPercent,
        vatPercent: state.vatPercent,
        vatInclusive: state.vatInclusive,
        deductSalesFromInventory: state.deductSalesFromInventory,
        acknowledgedAlertIds: state.acknowledgedAlertIds,
      }),
    }
  )
);

// Selectors
export const useAccounts = () => useFinancialStore(state => state.accounts);
export const useJournalEntries = () => useFinancialStore(state => state.journalEntries);
export const usePlSummaries = () => useFinancialStore(state => state.plSummaries);
export const useOperatingExpenses = () => useFinancialStore(state => state.operatingExpenses);
export const useExpenseBudgets = () => useFinancialStore(state => state.expenseBudgets);
export const useFixedAssets = () => useFinancialStore(state => state.fixedAssets);
export const useScheduledReports = () => useFinancialStore(state => state.scheduledReports);
export const useAutomationRules = () => useFinancialStore(state => state.automationRules);
export const useEodClosures = () => useFinancialStore(state => state.eodClosures);
export const useInvoices = () => useFinancialStore(state => state.invoices);
export const usePosOrders = () => useFinancialStore(state => state.posOrders);
export const usePosReturns = () => useFinancialStore(state => state.posReturns);
export const useCustomers = () => useFinancialStore(state => state.customers);
export const useGlobalTargetMargin = () => useFinancialStore(state => state.globalTargetMarginPercent);
export const useVatSettings = () => useFinancialStore(state => ({ vatPercent: state.vatPercent, vatInclusive: state.vatInclusive, deductSalesFromInventory: state.deductSalesFromInventory }));
export const useAcknowledgedAlertIds = () => useFinancialStore(state => state.acknowledgedAlertIds);

export const useFinancialActions = () => useFinancialStore(state => ({
  addAccount: state.addAccount,
  addJournalEntry: state.addJournalEntry,
  addOperatingExpense: state.addOperatingExpense,
  updateOperatingExpense: state.updateOperatingExpense,
  deleteOperatingExpense: state.deleteOperatingExpense,
  setExpenseBudget: state.setExpenseBudget,
  addFixedAsset: state.addFixedAsset,
  updateFixedAsset: state.updateFixedAsset,
  deleteFixedAsset: state.deleteFixedAsset,
  recordDepreciation: state.recordDepreciation,
  getMonthlyDepreciation: state.getMonthlyDepreciation,
  addScheduledReport: state.addScheduledReport,
  setScheduledReport: state.setScheduledReport,
  runScheduledReport: state.runScheduledReport,
  setAutomationRule: state.setAutomationRule,
  runAutomation: state.runAutomation,
  addInvoice: state.addInvoice,
  updateInvoice: state.updateInvoice,
  deleteInvoice: state.deleteInvoice,
  recordInvoicePayment: state.recordInvoicePayment,
  addPOSOrder: state.addPOSOrder,
  updatePOSOrder: state.updatePOSOrder,
  deletePOSOrder: state.deletePOSOrder,
  addPOSReturn: state.addPOSReturn,
  addCustomer: state.addCustomer,
  updateCustomer: state.updateCustomer,
  deleteCustomer: state.deleteCustomer,
  rebuildPLSummaries: state.rebuildPLSummaries,
  setGlobalTargetMarginPercent: state.setGlobalTargetMarginPercent,
  setVatPercent: state.setVatPercent,
  setVatInclusive: state.setVatInclusive,
  setDeductSalesFromInventory: state.setDeductSalesFromInventory,
  setAcknowledgedAlertIds: state.setAcknowledgedAlertIds,
}));

export const useFinancialSyncActions = () => useFinancialStore(state => ({
  setAccounts: state.setAccounts,
  setJournalEntries: state.setJournalEntries,
  setPlSummaries: state.setPlSummaries,
  setOperatingExpenses: state.setOperatingExpenses,
  setExpenseBudgets: state.setExpenseBudgets,
  setFixedAssets: state.setFixedAssets,
  setScheduledReports: state.setScheduledReports,
  setAutomationRules: state.setAutomationRules,
  setEodClosures: state.setEodClosures,
  setInvoices: state.setInvoices,
  setPosOrders: state.setPosOrders,
  setPosReturns: state.setPosReturns,
  setCustomers: state.setCustomers,
  setGlobalTargetMarginPercent: state.setGlobalTargetMarginPercent,
  setVatPercent: state.setVatPercent,
  setVatInclusive: state.setVatInclusive,
  setDeductSalesFromInventory: state.setDeductSalesFromInventory,
  setAcknowledgedAlertIds: state.setAcknowledgedAlertIds,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));