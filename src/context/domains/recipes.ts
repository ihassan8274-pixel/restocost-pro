import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StandardRecipe, RecipeInventory, ProductionRun, WastageLog, WorkOrder, ButcherTest } from '../../types';

interface RecipesState {
  recipes: StandardRecipe[];
  recipeInventory: RecipeInventory[];
  productionRuns: ProductionRun[];
  wastageLogs: WastageLog[];
  workOrders: WorkOrder[];
  butcherTests: ButcherTest[];
  recipeSections: Record<string, string[]>;
  pendingChanges: Map<string, unknown>;
  
  setRecipes: (data: StandardRecipe[]) => void;
  setRecipeInventory: (data: RecipeInventory[]) => void;
  setProductionRuns: (data: ProductionRun[]) => void;
  setWastageLogs: (data: WastageLog[]) => void;
  setWorkOrders: (data: WorkOrder[]) => void;
  setButcherTests: (data: ButcherTest[]) => void;
  setRecipeSections: (data: Record<string, string[]>) => void;
  
  addRecipe: (r: Omit<StandardRecipe, 'id' | 'code' | 'totalCalculatedCost' | 'suggestedPrice'>) => void;
  updateRecipe: (id: string, r: Partial<StandardRecipe>) => void;
  deleteRecipe: (id: string) => void;
  updateRecipeSections: (category: string, sections: string[]) => void;
  
  manufactureRecipe: (data: { branchId: string; recipeId: string; batchSize: number; producedBy: string }) => { ok: boolean; error?: string };
  deleteProductionRun: (id: string) => void;
  adjustRecipeInventory: (branchId: string, recipeId: string, delta: number) => void;
  getRecipeStock: (branchId: string, recipeId: string) => number;
  
  addWastageLog: (l: Omit<WastageLog, 'id' | 'date'>) => void;
  addWorkOrder: (o: Omit<WorkOrder, 'id' | 'orderNumber'>) => void;
  updateWorkOrderStatus: (id: string, status: WorkOrder['status']) => void;
  
  addButcherTest: (t: Omit<ButcherTest, 'id'>) => void;
  updateButcherTest: (id: string, t: Partial<ButcherTest>) => void;
  deleteButcherTest: (id: string) => void;
  postButcherTest: (id: string) => { ok: boolean; error?: string };
  
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useRecipesStore = create<RecipesState>()(
  persist(
    (set, get) => ({
      recipes: [],
      recipeInventory: [],
      productionRuns: [],
      wastageLogs: [],
      workOrders: [],
      butcherTests: [],
      recipeSections: {},
      pendingChanges: new Map(),
      
      setRecipes: (data) => { set({ recipes: data }); get().markPending('rcerp_recipes', data); },
      setRecipeInventory: (data) => { set({ recipeInventory: data }); get().markPending('rcerp_recipe_inventory', data); },
      setProductionRuns: (data) => { set({ productionRuns: data }); get().markPending('rcerp_production_runs', data); },
      setWastageLogs: (data) => { set({ wastageLogs: data }); get().markPending('rcerp_wastage', data); },
      setWorkOrders: (data) => { set({ workOrders: data }); get().markPending('rcerp_work_orders', data); },
      setButcherTests: (data) => { set({ butcherTests: data }); get().markPending('rcerp_butcher_tests', data); },
      setRecipeSections: (data) => { set({ recipeSections: data }); get().markPending('rcerp_recipe_sections', data); },
      
      addRecipe: (r) => {
        const recipe: StandardRecipe = { ...r, id: uid('rec'), code: `REC-${Date.now().toString(36).toUpperCase()}`, totalCalculatedCost: 0, suggestedPrice: 0 };
        set((state) => ({ recipes: [...state.recipes, recipe] }));
        get().markPending('rcerp_recipes', get().recipes);
      },
      updateRecipe: (id, r) => { set((state) => ({ recipes: state.recipes.map(rc => rc.id === id ? { ...rc, ...r } : rc) })); get().markPending('rcerp_recipes', get().recipes); },
      deleteRecipe: (id) => { set((state) => ({ recipes: state.recipes.filter(rc => rc.id !== id) })); get().markPending('rcerp_recipes', get().recipes); },
      updateRecipeSections: (category, sections) => { set((state) => ({ recipeSections: { ...state.recipeSections, [category]: sections } })); get().markPending('rcerp_recipe_sections', get().recipeSections); },
      
      manufactureRecipe: (data) => {
        const run: ProductionRun = { 
          id: uid('pr'), 
          branchId: data.branchId, 
          recipeId: data.recipeId, 
          recipeCode: '', 
          recipeName: '', 
          batchSize: data.batchSize, 
          producedQty: data.batchSize, 
          unit: 'pcs', 
          producedBy: data.producedBy, 
          date: new Date().toISOString().split('T')[0], 
          items: [], 
          totalCost: 0, 
          status: 'completed' 
        };
        set((state) => ({ productionRuns: [...state.productionRuns, run] }));
        get().markPending('rcerp_production_runs', get().productionRuns);
        return { ok: true };
      },
      deleteProductionRun: (id) => { set((state) => ({ productionRuns: state.productionRuns.filter(r => r.id !== id) })); get().markPending('rcerp_production_runs', get().productionRuns); },
      adjustRecipeInventory: (branchId, recipeId, delta) => { set((state) => ({ recipeInventory: state.recipeInventory.map(ri => ri.branchId === branchId && ri.recipeId === recipeId ? { ...ri, quantity: (ri.quantity || 0) + delta } : ri) })); get().markPending('rcerp_recipe_inventory', get().recipeInventory); },
      getRecipeStock: (branchId, recipeId) => get().recipeInventory.find(ri => ri.branchId === branchId && ri.recipeId === recipeId)?.quantity || 0,
      
      addWastageLog: (l) => { set((state) => ({ wastageLogs: [...state.wastageLogs, { ...l, id: uid('was'), date: new Date().toISOString().split('T')[0] }] })); get().markPending('rcerp_wastage', get().wastageLogs); },
      addWorkOrder: (o) => { set((state) => ({ workOrders: [...state.workOrders, { ...o, id: uid('wo'), orderNumber: `WO-${Date.now().toString(36).toUpperCase()}`, status: 'planned' as const }] })); get().markPending('rcerp_work_orders', get().workOrders); },
      updateWorkOrderStatus: (id, status) => { set((state) => ({ workOrders: state.workOrders.map(wo => wo.id === id ? { ...wo, status } : wo) })); get().markPending('rcerp_work_orders', get().workOrders); },
      
      addButcherTest: (t) => { set((state) => ({ butcherTests: [...state.butcherTests, { ...t, id: uid('bt') }] })); get().markPending('rcerp_butcher_tests', get().butcherTests); },
      updateButcherTest: (id, t) => { set((state) => ({ butcherTests: state.butcherTests.map(bt => bt.id === id ? { ...bt, ...t } : bt) })); get().markPending('rcerp_butcher_tests', get().butcherTests); },
      deleteButcherTest: (id) => { set((state) => ({ butcherTests: state.butcherTests.filter(bt => bt.id !== id) })); get().markPending('rcerp_butcher_tests', get().butcherTests); },
      postButcherTest: (id) => { set((state) => ({ butcherTests: state.butcherTests.map(bt => bt.id === id ? { ...bt, posted: true } : bt) })); get().markPending('rcerp_butcher_tests', get().butcherTests); return { ok: true }; },
      
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-recipes',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        recipes: state.recipes,
        recipeInventory: state.recipeInventory,
        productionRuns: state.productionRuns,
        wastageLogs: state.wastageLogs,
        workOrders: state.workOrders,
        butcherTests: state.butcherTests,
        recipeSections: state.recipeSections,
      }),
    }
  )
);

export const useRecipes = () => useRecipesStore(state => state.recipes);
export const useRecipeInventory = () => useRecipesStore(state => state.recipeInventory);
export const useProductionRuns = () => useRecipesStore(state => state.productionRuns);
export const useWastageLogs = () => useRecipesStore(state => state.wastageLogs);
export const useWorkOrders = () => useRecipesStore(state => state.workOrders);
export const useButcherTests = () => useRecipesStore(state => state.butcherTests);
export const useRecipeSections = () => useRecipesStore(state => state.recipeSections);

export const useRecipesActions = () => useRecipesStore(state => ({
  addRecipe: state.addRecipe,
  updateRecipe: state.updateRecipe,
  deleteRecipe: state.deleteRecipe,
  updateRecipeSections: state.updateRecipeSections,
  manufactureRecipe: state.manufactureRecipe,
  deleteProductionRun: state.deleteProductionRun,
  adjustRecipeInventory: state.adjustRecipeInventory,
  getRecipeStock: state.getRecipeStock,
  addWastageLog: state.addWastageLog,
  addWorkOrder: state.addWorkOrder,
  updateWorkOrderStatus: state.updateWorkOrderStatus,
  addButcherTest: state.addButcherTest,
  updateButcherTest: state.updateButcherTest,
  deleteButcherTest: state.deleteButcherTest,
  postButcherTest: state.postButcherTest,
}));

export const useRecipesSyncActions = () => useRecipesStore(state => ({
  setRecipes: state.setRecipes,
  setRecipeInventory: state.setRecipeInventory,
  setProductionRuns: state.setProductionRuns,
  setWastageLogs: state.setWastageLogs,
  setWorkOrders: state.setWorkOrders,
  setButcherTests: state.setButcherTests,
  setRecipeSections: state.setRecipeSections,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));