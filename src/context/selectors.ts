import type {
  Branch, RawMaterial, GoodsReceiptNote, StockTransfer, OpeningBalanceRecord,
  BranchStockLimit, StockLevels, StandardRecipe, SubPrepIngredient, FoodCostAlert,
  SupplierQuote, SupplierReturn, FixedAsset, DeliveryApp, Currency, Company,
  RecipeInventory,
} from '../types';
import { averageUnitCostFromReceipts, movingWeightedAverage } from '../business/costs';
import { stockLevelsFor } from '../business/stock';
import { computeRecipeCosts, type RecipeCostBreakdown } from '../business/recipes';

export const getBranchName = (branches: Branch[], id: string): string => {
  if (id === 'all') return 'جميع الفروع';
  return branches.find((b) => b.id === id)?.nameAr || id;
};

export const getRawMaterialUnitCost = (rawMaterials: RawMaterial[], id: string): number =>
  rawMaterials.find((m) => m.id === id)?.standardPrice || 0;

export const getAverageUnitCost = (grnNotes: GoodsReceiptNote[], rawMaterials: RawMaterial[], id: string): number =>
  averageUnitCostFromReceipts(grnNotes, id, getRawMaterialUnitCost(rawMaterials, id));

export const getBranchAverageUnitCost = (
  openingBalances: OpeningBalanceRecord[],
  grnNotes: GoodsReceiptNote[],
  stockTransfers: StockTransfer[],
  rawMaterials: RawMaterial[],
  branchId: string,
  id: string,
  asOf?: string,
): number =>
  movingWeightedAverage(openingBalances, grnNotes, stockTransfers, branchId, id, asOf, getRawMaterialUnitCost(rawMaterials, id));

// آخر سعر شراء فعلي للصنف في الفرع (أحدث استلام معتمد) — يتوافق مع الخادم
export const getLastPurchaseCost = (
  grnNotes: GoodsReceiptNote[],
  rawMaterials: RawMaterial[],
  branchId: string,
  id: string,
): number => {
  const approved = grnNotes
    .filter((g) => g.status === 'approved' && g.branchId === branchId)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const g of approved) {
    const item = g.items.find((i) => i.rawMaterialId === id && Number(i.quantityReceived) > 0 && Number(i.unitPrice) > 0);
    if (item) return Number(item.unitPrice);
  }
  return getRawMaterialUnitCost(rawMaterials, id);
};

export const getStockLevelsFor = (
  rawMaterials: RawMaterial[],
  branchStockLimits: BranchStockLimit[],
  rawMaterialId: string,
  branchId: string,
): StockLevels =>
  stockLevelsFor(rawMaterials, branchStockLimits, rawMaterialId, branchId);

export const calculateRecipeCosts = (
  rawMaterials: RawMaterial[],
  recipes: StandardRecipe[],
  ingredients: StandardRecipe['ingredients'],
  directLabor: number,
  packaging: number,
  subPrep?: SubPrepIngredient[],
  yieldPieces?: number,
  _depth = 0,
  getAvgUnitCost?: (id: string) => number,
): RecipeCostBreakdown =>
  computeRecipeCosts(
    rawMaterials,
    recipes,
    ingredients,
    directLabor,
    packaging,
    subPrep,
    yieldPieces,
    _depth,
    (id) => getAvgUnitCost ? getAvgUnitCost(id) : getRawMaterialUnitCost(rawMaterials, id),
  );

export const computeFoodCostAlerts = (
  recipes: StandardRecipe[],
  acknowledgedAlertIds: string[],
  globalTargetMarginPercent: number,
  rawMaterials: RawMaterial[],
  grnNotes: GoodsReceiptNote[],
  todayStr: string,
): FoodCostAlert[] => {
  const alerts: FoodCostAlert[] = [];
  recipes.forEach((recipe) => {
    if (!recipe.actualMenuPrice || recipe.actualMenuPrice <= 0 || recipe.isCentralKitchenPrep || !recipe.isActive) return;
    const costs = calculateRecipeCosts(
      rawMaterials,
      recipes,
      recipe.ingredients,
      recipe.directLaborCost,
      recipe.packagingCost,
      recipe.subPrepIngredients,
      recipe.yieldPieces,
      0,
      (id) => getAverageUnitCost(grnNotes, rawMaterials, id),
    );
    const targetMargin = recipe.targetMarginPercent ?? globalTargetMarginPercent;
    const targetFoodCost = recipe.targetFoodCostPercent ?? (100 - targetMargin);
    const actualFoodCostPercent = Number(((costs.foodCost / recipe.actualMenuPrice) * 100).toFixed(1));
    const actualMarginPercent = Number((((recipe.actualMenuPrice - costs.totalCost) / recipe.actualMenuPrice) * 100).toFixed(1));
    if (actualFoodCostPercent > targetFoodCost || actualMarginPercent < targetMargin) {
      const excessCostPercent = Number((actualFoodCostPercent - targetFoodCost).toFixed(1));
      const maxAllowedFoodCost = recipe.actualMenuPrice * (targetFoodCost / 100);
      alerts.push({
        recipeId: recipe.id, recipeCode: recipe.code, recipeNameAr: recipe.nameAr, category: recipe.category,
        actualMenuPrice: recipe.actualMenuPrice, totalCost: costs.totalCost, foodCostOnly: costs.foodCost,
        actualFoodCostPercent, targetFoodCostPercent: targetFoodCost, actualMarginPercent, targetMarginPercent: targetMargin,
        excessCostPercent,
        excessCostPerPortion: Number((costs.foodCost - maxAllowedFoodCost).toFixed(2)),
        suggestedPriceForTarget: Number((costs.foodCost / (targetFoodCost / 100)).toFixed(2)),
        severity: excessCostPercent >= 5 ? 'critical' : 'warning',
        isAcknowledged: acknowledgedAlertIds.includes(recipe.id),
        dateTriggered: todayStr,
      });
    }
  });
  return alerts.sort((a, b) => {
    if (a.isAcknowledged !== b.isAcknowledged) return a.isAcknowledged ? 1 : -1;
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.excessCostPercent - a.excessCostPercent;
  });
};

export const monthOfKey = (date: string): string => date.slice(0, 7);
export const isMonthClosed = (closedMonths: string[], monthKey: string): boolean => closedMonths.includes(monthKey);
export const isDateClosed = (closedMonths: string[], closedDays: string[], date: string): boolean =>
  closedMonths.includes(monthOfKey(date)) || closedDays.includes((date || '').slice(0, 10));

export const getQuotePrice = (supplierQuotes: SupplierQuote[], supplierId: string, rawMaterialId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const q = supplierQuotes
    .filter((x) => x.supplierId === supplierId && x.rawMaterialId === rawMaterialId && (!x.validTo || x.validTo >= today))
    .sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))[0];
  return q?.price;
};

export const getReturnedQtyForGrn = (
  supplierReturns: SupplierReturn[],
  grnId: string,
  rawMaterialId: string,
): number =>
  supplierReturns
    .filter((r) => r.sourceGrnId === grnId && r.status === 'approved')
    .reduce((s, r) => s + r.items.filter((i) => i.rawMaterialId === rawMaterialId).reduce((si, i) => si + i.quantity, 0), 0);

export const getMonthlyDepreciation = (a: FixedAsset): number => {
  const base = Math.max(0, a.purchaseCost - a.salvageValue);
  return a.usefulLifeYears > 0 ? Number((base / (a.usefulLifeYears * 12)).toFixed(2)) : 0;
};

export const getDeliveryAppName = (deliveryApps: DeliveryApp[], id: string): string =>
  deliveryApps.find((a) => a.id === id)?.name || id;

export const getRecipeStock = (recipeInventory: RecipeInventory[], branchId: string, recipeId: string): number =>
  recipeInventory.find((r) => r.branchId === branchId && r.recipeId === recipeId)?.quantity || 0;

export const getCurrencyRate = (currencies: Currency[], code: string): number => {
  if (!code || code === 'SAR') return 1;
  return currencies.find((c) => c.code === code)?.rateToBase ?? 1;
};

export const convertToBase = (currencies: Currency[], amount: number, code: string): number =>
  amount * getCurrencyRate(currencies, code);

export const getCompanyName = (companies: Company[], id: string): string =>
  companies.find((c) => c.id === id)?.nameAr || id;