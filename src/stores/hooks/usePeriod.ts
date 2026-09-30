import { usePeriodStore } from '@stores/periodStore';

export const usePeriod = () => {
  const {
    closedMonths, closedDays, eodClosures, monthlyInventory,
    isMonthClosed, isDateClosed, closeDay, reopenDay,
    startMonthlyInventory, saveMonthlyInventoryCounts,
    closeMonthlyInventory, deleteMonthlyInventory, reopenMonthlyInventory,
  } = usePeriodStore();

  return {
    closedMonths, closedDays, eodClosures, monthlyInventory,
    isMonthClosed, isDateClosed, closeDay, reopenDay,
    startMonthlyInventory, saveMonthlyInventoryCounts,
    closeMonthlyInventory, deleteMonthlyInventory, reopenMonthlyInventory,
  };
};