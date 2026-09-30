import { useProductionStore } from '@stores/productionStore';

export const useProduction = () => {
  const {
    recipes, recipeSections, productionRuns, butcherTests, workOrders, foodMenus, menuPlans,
    addRecipe, updateRecipe, deleteRecipe, updateRecipeSections,
    manufactureRecipe, deleteProductionRun,
    addButcherTest, updateButcherTest, deleteButcherTest, postButcherTest,
    addWorkOrder, updateWorkOrderStatus,
    addFoodMenu, updateFoodMenu, deleteFoodMenu,
    addMenuPlan, updateMenuPlan, deleteMenuPlan,
  } = useProductionStore();

  return {
    recipes, recipeSections, productionRuns, butcherTests, workOrders, foodMenus, menuPlans,
    addRecipe, updateRecipe, deleteRecipe, updateRecipeSections,
    manufactureRecipe, deleteProductionRun,
    addButcherTest, updateButcherTest, deleteButcherTest, postButcherTest,
    addWorkOrder, updateWorkOrderStatus,
    addFoodMenu, updateFoodMenu, deleteFoodMenu,
    addMenuPlan, updateMenuPlan, deleteMenuPlan,
  };
};