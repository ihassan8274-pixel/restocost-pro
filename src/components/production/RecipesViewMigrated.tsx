import React, { useState } from 'react';
import { ChefHat, Plus } from 'lucide-react';
import { useRecipesStore } from '../../context/domains/recipes';
import { useSettingsStore } from '../../context/domains/settings';
import { useFinancialStore } from '../../context/domains/financial';
import { useUIStore } from '../../context/domains/ui';
import { PageHeader, Btn, TabBar } from '../ui';
import type { StandardRecipe, RecipeIngredient, SubPrepIngredient } from '../../types';

export const RecipesViewMigrated: React.FC = () => {
  // Domain store selectors - isolated subscriptions
  useRecipesStore(state => state.recipes);
  useSettingsStore(state => state.materialCategories);
  useFinancialStore(state => state.globalTargetMarginPercent);
  useRecipesStore(state => state.addRecipe);
  useRecipesStore(state => state.updateRecipe);
  useRecipesStore(state => state.deleteRecipe);
  useRecipesStore(state => state.setRecipeSections);
  useFinancialStore();
  useUIStore();
  
  // Local state
  const [tab, setTab] = useState<'bom' | 'alerts' | 'where-used' | 'cost-report'>('bom');
  const [_showModal, _setShowModal] = useState(false);
  const [_editingId, _setEditingId] = useState<string | null>(null);
  
  // Form state
  const [_form, _setForm] = useState({
    nameAr: '', nameEn: '', category: 'main_dish' as StandardRecipe['category'], section: '', portionSize: '', yieldPieces: 1, prepTimeMins: 15,
    directLaborCost: 0, packagingCost: 0, actualMenuPrice: 0, isCentralKitchenPrep: false, isActive: true,
    targetMarginPercent: 72, ingredients: [] as RecipeIngredient[],
    subPrepIngredients: [] as SubPrepIngredient[],
  });
  
  // This is a migration skeleton - full implementation would follow the same pattern
  // using domain store selectors instead of useApp()
  
  return (
    <div className="space-y-6">
      <PageHeader title="الوصفات المعيارية" subtitle="إدارة وصفات الطعام، حساب التكاليف، وتحليل الهامش" icon={<ChefHat className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <Btn onClick={() => {}}><Plus className="w-4 h-4" /> وصفة جديدة</Btn>
        </>} />
      
      <TabBar tabs={[{ id: 'bom', label: 'BOM الوصفات' }, { id: 'alerts', label: 'تنبيهات التكلفة' }, { id: 'where-used', label: 'أين يُستخدم الصنف' }, { id: 'cost-report', label: 'تقرير التكلفة' }]} active={tab} onChange={(id) => setTab(id as 'bom' | 'alerts' | 'where-used' | 'cost-report')} />
      
      <div className="text-center py-8 text-slate-500">
        <p>Migration in progress - using domain stores (useRecipesStore, useSettingsStore, useAuthStore, useFinancialStore, useUIStore)</p>
        <p className="text-sm mt-2">Full component migration replaces useApp() with domain store selectors</p>
      </div>
    </div>
  );
};

export default RecipesViewMigrated;