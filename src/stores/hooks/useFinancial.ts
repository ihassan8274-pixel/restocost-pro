import { useFinancialStore } from '@stores/financialStore';

export const useFinancial = () => {
  const {
    accounts, journalEntries, posReturns, fixedAssets, operatingExpenses, expenseBudgets, plSummaries,
    addAccount, postEntry, addJournalEntry, addPOSReturn,
    addFixedAsset, updateFixedAsset, deleteFixedAsset, recordDepreciation, getMonthlyDepreciation,
    addOperatingExpense, updateOperatingExpense, deleteOperatingExpense,
    setExpenseBudget, rebuildPLSummaries,
    getFoodCostAlerts,
  } = useFinancialStore();

  return {
    accounts, journalEntries, posReturns, fixedAssets, operatingExpenses, expenseBudgets, plSummaries,
    addAccount, postEntry, addJournalEntry, addPOSReturn,
    addFixedAsset, updateFixedAsset, deleteFixedAsset, recordDepreciation, getMonthlyDepreciation,
    addOperatingExpense, updateOperatingExpense, deleteOperatingExpense,
    setExpenseBudget, rebuildPLSummaries,
    getFoodCostAlerts,
  };
};