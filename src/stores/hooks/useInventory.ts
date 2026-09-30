import { useInventoryStore } from '@stores/inventoryStore';

export const useInventory = () => {
  const {
    inventory, setInventory, inventoryBatches, setInventoryBatches,
    inventoryMovements, setInventoryMovements, recipeInventory, setRecipeInventory,
    physicalCounts, dailyCounts, openingBalances, branchStockLimits,
    stockTransfers, distributions, intakeInbox,
    adjustInventory, adjustRecipeInventory, getRecipeStock,
    addInventoryBatches, consumeInventoryBatch, getFefoBatches, expiringBatches,
    getStockLevelsFor, upsertBranchStockLimit, removeBranchStockLimit,
    recordPhysicalCount, addDailyCount, updateDailyCount, deleteDailyCount,
    setOpeningBalances, addOpeningBalance, updateOpeningBalance, deleteOpeningBalance,
    addStockTransfer, updateStockTransfer, submitStockTransfer, approveStockTransfer,
    rejectStockTransfer, revertStockTransferToDraft, deleteStockTransfer,
    approveDistribution, rejectDistribution, updateDistribution,
    raiseInboxItem, rejectInboxItem, raiseAllMatchedInbox, bindAndRaiseInboxItem,
  } = useInventoryStore();

  return {
    inventory, setInventory, inventoryBatches, setInventoryBatches,
    inventoryMovements, setInventoryMovements, recipeInventory, setRecipeInventory,
    physicalCounts, dailyCounts, openingBalances, branchStockLimits,
    stockTransfers, distributions, intakeInbox,
    adjustInventory, adjustRecipeInventory, getRecipeStock,
    addInventoryBatches, consumeInventoryBatch, getFefoBatches, expiringBatches,
    getStockLevelsFor, upsertBranchStockLimit, removeBranchStockLimit,
    recordPhysicalCount, addDailyCount, updateDailyCount, deleteDailyCount,
    setOpeningBalances, addOpeningBalance, updateOpeningBalance, deleteOpeningBalance,
    addStockTransfer, updateStockTransfer, submitStockTransfer, approveStockTransfer,
    rejectStockTransfer, revertStockTransferToDraft, deleteStockTransfer,
    approveDistribution, rejectDistribution, updateDistribution,
    raiseInboxItem, rejectInboxItem, raiseAllMatchedInbox, bindAndRaiseInboxItem,
  };
};