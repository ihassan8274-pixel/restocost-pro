import type { BranchStockLimit, RawMaterial, StockLevels } from '../types';

// تعيد الحدود الفعلية للصنف في الفرع: المخصص للفرع إن وجد وإلا الافتراضي العام
export const stockLevelsFor = (
  rawMaterials: RawMaterial[],
  branchStockLimits: BranchStockLimit[],
  rawMaterialId: string,
  branchId: string,
): StockLevels => {
  const mat = rawMaterials.find((m) => m.id === rawMaterialId);
  const override = branchStockLimits.find((b) => b.branchId === branchId && b.rawMaterialId === rawMaterialId);
  if (override) {
    return { minStockLevel: override.minStockLevel, maxStockLevel: override.maxStockLevel, alwaysOrderFullMax: override.alwaysOrderFullMax, isOverride: true };
  }
  return {
    minStockLevel: mat?.minStockLevel || 0,
    maxStockLevel: mat?.maxStockLevel || 0,
    alwaysOrderFullMax: false,
    isOverride: false,
  };
};