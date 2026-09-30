import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  StandardRecipe, ProductionRun, ButcherTest, WorkOrder,
  FoodMenu, MenuPlan,
} from '../types';
import { nextDocSequence } from '../business/docNumbers';
import { today } from '../utils/helpers';

interface ProductionState {
  recipes: StandardRecipe[];
  recipeSections: Record<string, string[]>;
  productionRuns: ProductionRun[];
  butcherTests: ButcherTest[];
  workOrders: WorkOrder[];
  foodMenus: FoodMenu[];
  menuPlans: MenuPlan[];
  addRecipe: (data: Omit<StandardRecipe, 'id' | 'code' | 'totalCalculatedCost' | 'suggestedPrice'>) => void;
  updateRecipe: (id: string, data: Partial<StandardRecipe>) => void;
  deleteRecipe: (id: string) => void;
  updateRecipeSections: (category: string, sections: string[]) => void;
  manufactureRecipe: (data: { branchId: string; recipeId: string; batchSize: number; producedBy: string }) => { ok: boolean; error?: string };
  deleteProductionRun: (id: string) => void;
  addButcherTest: (data: Omit<ButcherTest, 'id'>) => void;
  updateButcherTest: (id: string, data: Partial<ButcherTest>) => void;
  deleteButcherTest: (id: string) => void;
  postButcherTest: (id: string) => { ok: boolean; error?: string };
  addWorkOrder: (data: Omit<WorkOrder, 'id' | 'orderNumber' | 'startDate' | 'status' | 'rawMaterialsDeducted'>) => void;
  updateWorkOrderStatus: (id: string, status: WorkOrder['status']) => void;
  addFoodMenu: (data: Omit<FoodMenu, 'id' | 'code'>) => void;
  updateFoodMenu: (id: string, data: Partial<FoodMenu>) => void;
  deleteFoodMenu: (id: string) => void;
  addMenuPlan: (data: Omit<MenuPlan, 'id'>) => void;
  updateMenuPlan: (id: string, data: Partial<MenuPlan>) => void;
  deleteMenuPlan: (id: string) => void;
}

export const useProductionStore = create<ProductionState>()(
  persist(
    (set) => ({
      recipes: [],
      recipeSections: {},
      productionRuns: [],
      butcherTests: [],
      workOrders: [],
      foodMenus: [],
      menuPlans: [],

      addRecipe: (data) => {
        const newRecipe: StandardRecipe = { ...data, id: `rec-${Date.now()}`, code: `RCP-${data.category.toUpperCase().slice(0, 3)}-${Math.floor(100 + Math.random() * 900)}`, totalCalculatedCost: 0, suggestedPrice: 0, costHistory: [] };
        set((state) => ({ recipes: [newRecipe, ...state.recipes] }));
      },
      updateRecipe: (id, data) => set((state) => ({ recipes: state.recipes.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      deleteRecipe: (id) => set((state) => ({ recipes: state.recipes.filter((r) => r.id !== id) })),
      updateRecipeSections: (category, sections) => set((state) => ({ recipeSections: { ...state.recipeSections, [category]: sections.filter((s) => s.trim()).map((s) => s.trim()) } })),

      manufactureRecipe: () => ({ ok: false, error: 'Not implemented' }),
      deleteProductionRun: (id) => set((state) => ({ productionRuns: state.productionRuns.filter((r) => r.id !== id) })),

      addButcherTest: (data) => {
        const test: ButcherTest = { ...data, id: `bt-${Date.now()}` };
        set((state) => ({ butcherTests: [test, ...state.butcherTests] }));
      },
      updateButcherTest: (id, data) => set((state) => ({ butcherTests: state.butcherTests.map((t) => (t.id === id ? { ...t, ...data } : t)) })),
      deleteButcherTest: (id) => set((state) => ({ butcherTests: state.butcherTests.filter((t) => t.id !== id) })),
      postButcherTest: () => ({ ok: false, error: 'Not implemented' }),

      addWorkOrder: (data) => {
        set((state) => ({ workOrders: [{ ...data, id: `wo-${Date.now()}`, orderNumber: nextDocSequence('WO', { existing: state.workOrders.map((w) => w.orderNumber) }), startDate: today(), status: 'planned', rawMaterialsDeducted: false }, ...state.workOrders] }));
      },
      updateWorkOrderStatus: (id, status) => set((state) => ({ workOrders: state.workOrders.map((wo) => (wo.id === id ? { ...wo, status } : wo)) })),

      addFoodMenu: (data) => set((state) => ({ foodMenus: [{ ...data, id: `menu-${Date.now()}`, code: `MENU-${Math.floor(100 + Math.random() * 900)}` }, ...state.foodMenus] })),
      updateFoodMenu: (id, data) => set((state) => ({ foodMenus: state.foodMenus.map((m) => (m.id === id ? { ...m, ...data } : m)) })),
      deleteFoodMenu: (id) => set((state) => ({ foodMenus: state.foodMenus.filter((m) => m.id !== id) })),

      addMenuPlan: (data) => set((state) => ({ menuPlans: [{ ...data, id: `plan-${Date.now()}` }, ...state.menuPlans] })),
      updateMenuPlan: (id, data) => set((state) => ({ menuPlans: state.menuPlans.map((p) => (p.id === id ? { ...p, ...data } : p)) })),
      deleteMenuPlan: (id) => set((state) => ({ menuPlans: state.menuPlans.filter((p) => p.id !== id) })),
    }),
    { name: 'rcerp_production' }
  )
);
