export interface RecipeIngredient {
  rawMaterialId: string;
  quantity: number;
  wastagePercent: number;
  notes?: string;
}

export interface SubPrepIngredient {
  recipeId: string; // reference to a sub-prep / central-kitchen recipe (finished good)
  quantity: number; // amount consumed per portion
}

export interface StandardRecipe {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: 'main_dish' | 'appetizer' | 'beverage' | 'dessert' | 'sub_prep';
  // قسم فرعي داخل التصنيف (مثل: مشويات / مقبلات باردة) — يستخدم لترتيب الطباعة والتصدير
  section?: string;
  portionSize: string;
  yieldPieces?: number;
  prepTimeMins: number;
  ingredients: RecipeIngredient[];
  subPrepIngredients?: SubPrepIngredient[];
  directLaborCost: number;
  packagingCost: number;
  totalCalculatedCost: number;
  suggestedPrice: number;
  actualMenuPrice: number;
  deliveryPrice?: number;
  isCentralKitchenPrep: boolean;
  targetMarginPercent?: number;
  targetFoodCostPercent?: number;
  isActive: boolean;
  description?: string;
  // سجل تغييرات التكلفة داخل الوصفة — يوثّق كل إعادة احتساب (تلقائية/يدوية) مع سببها
  costHistory?: RecipeCostHistoryEntry[];
}

export interface RecipeCostHistoryEntry {
  id: string;
  timestamp: string; // ISO
  oldTotalCost: number;
  newTotalCost: number;
  oldSuggestedPrice?: number;
  newSuggestedPrice?: number;
  reason: string;
  changedMaterials?: string[];
}

export interface FoodCostAlert {
  recipeId: string;
  recipeCode: string;
  recipeNameAr: string;
  category: string;
  actualMenuPrice: number;
  totalCost: number;
  foodCostOnly: number;
  actualFoodCostPercent: number;
  targetFoodCostPercent: number;
  actualMarginPercent: number;
  targetMarginPercent: number;
  excessCostPercent: number;
  excessCostPerPortion: number;
  suggestedPriceForTarget: number;
  severity: 'critical' | 'warning';
  isAcknowledged: boolean;
  dateTriggered: string;
}

export interface WorkOrder {
  id: string;
  orderNumber: string;
  centralKitchenId: string;
  targetBranchId: string;
  recipeId: string;
  recipeName: string;
  targetQuantity: number;
  producedQuantity: number;
  startDate: string;
  completionDate?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  rawMaterialsDeducted: boolean;
  prepChef: string;
  notes?: string;
}

export type WastageCategory = 'prep_waste' | 'cooking_burn' | 'expired' | 'damaged_storage' | 'returned_food' | 'sample_taste';

export interface WastageLog {
  id: string;
  branchId: string;
  date: string;
  rawMaterialId?: string;
  recipeId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCostImpact: number;
  category: WastageCategory;
  responsibleStaff: string;
  reason: string;
  isApproved: boolean;
  photo?: string;
}

// Manufacturing a base (sub-prep) recipe into finished stock per branch
export interface ProductionRunItem {
  rawMaterialId: string;
  materialName: string;
  unit: string;
  requiredQty: number;
  availableQty: number;
  unitCost: number;
}

export interface ProductionRun {
  id: string;
  branchId: string;
  recipeId: string;
  recipeCode: string;
  recipeName: string;
  batchSize: number;
  producedQty: number;
  unit: string;
  producedBy: string;
  date: string;
  items: ProductionRunItem[];
  totalCost: number;
  status: 'completed' | 'cancelled';
}

export type EmployeeMealType = 'breakfast' | 'lunch' | 'dinner';
export interface EmployeeMealRecord {
  id: string;
  branchId: string;
  date: string;
  mealType: EmployeeMealType;
  employeeId: string;
  employeeName: string;
  menuItem: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
}