import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Branch, Currency, Company, DeliveryApp, UnitOfMeasure, MaterialBarcode, CustomCategory, FoodMenu, MenuPlan, BranchStockLimit, AccessRole, MaterialCategoryDef, Supplier, ToastEntry, FoodCostAlert } from '../../types';

interface SettingsState {
  branches: Branch[];
  currencies: Currency[];
  companies: Company[];
  deliveryApps: DeliveryApp[];
  unitsOfMeasure: UnitOfMeasure[];
  materialBarcodes: MaterialBarcode[];
  customCategories: CustomCategory[];
  foodMenus: FoodMenu[];
  menuPlans: MenuPlan[];
  branchStockLimits: BranchStockLimit[];
  accessRoles: AccessRole[];
  materialCategories: MaterialCategoryDef[];
  
  logo: string | null;
  numerals: 'arabic' | 'english';
  decimals: number;
  density: 'comfortable' | 'compact';
  hijriMode: boolean;
  preferences: Record<string, unknown>;
  
  // Settings that were in AppContext but belong here
  vatPercent: number;
  vatInclusive: boolean;
  addRecentDoc: (doc: { type: string; title: string; tab: string }, id?: string) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void;
  addSupplier: (s: Omit<Supplier, 'id' | 'code'>) => Supplier;
  
  pendingChanges: Map<string, unknown>;
  
  setBranches: (data: Branch[]) => void;
  setCurrencies: (data: Currency[]) => void;
  setCompanies: (data: Company[]) => void;
  setDeliveryApps: (data: DeliveryApp[]) => void;
  setUnitsOfMeasure: (data: UnitOfMeasure[]) => void;
  setMaterialBarcodes: (data: MaterialBarcode[]) => void;
  setCustomCategories: (data: CustomCategory[]) => void;
  setFoodMenus: (data: FoodMenu[]) => void;
  setMenuPlans: (data: MenuPlan[]) => void;
  setBranchStockLimits: (data: BranchStockLimit[]) => void;
  setAccessRoles: (data: AccessRole[]) => void;
  setMaterialCategories: (data: MaterialCategoryDef[]) => void;
  
  setLogo: (value: string | null) => void;
  setNumerals: (v: 'arabic' | 'english') => void;
  setDecimals: (v: number) => void;
  setDensity: (v: 'comfortable' | 'compact') => void;
  setHijriMode: (v: boolean) => void;
  setPreference: (key: string, value: unknown) => void;
  
  // Injection setters for DomainBridge
  setVatPercent: (v: number) => void;
  setVatInclusive: (v: boolean) => void;
  setAddRecentDoc: (fn: (doc: { type: string; title: string; tab: string }, id?: string) => void) => void;
  setShowToast: (fn: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void) => void;
  setAddSupplier: (fn: (s: Omit<Supplier, 'id' | 'code'>) => Supplier) => void;
  setGetFoodCostAlerts: (fn: () => FoodCostAlert[]) => void;
  
  addBranch: (b: Omit<Branch, 'id' | 'code'>) => void;
  updateBranch: (id: string, b: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  
  addCurrency: (c: Omit<Currency, 'code'> & { code: string }) => void;
  updateCurrency: (code: string, d: Partial<Currency>) => void;
  deleteCurrency: (code: string) => void;
  
  addCompany: (c: Omit<Company, 'id' | 'code'>) => void;
  updateCompany: (id: string, c: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  
  addDeliveryApp: (a: Omit<DeliveryApp, 'id'>) => void;
  updateDeliveryApp: (id: string, a: Partial<DeliveryApp>) => void;
  deleteDeliveryApp: (id: string) => void;
  
  addUnitOfMeasure: (u: Omit<UnitOfMeasure, 'id'>) => void;
  updateUnitOfMeasure: (id: string, u: Partial<UnitOfMeasure>) => void;
  deleteUnitOfMeasure: (id: string) => { ok: boolean; error?: string };
  
  addMaterialBarcode: (b: Omit<MaterialBarcode, 'id'>) => void;
  updateMaterialBarcode: (id: string, b: Partial<MaterialBarcode>) => void;
  deleteMaterialBarcode: (id: string) => void;
  
  addCustomCategory: (c: Omit<CustomCategory, 'id'>) => void;
  deleteCustomCategory: (id: string) => void;
  
  addFoodMenu: (m: Omit<FoodMenu, 'id' | 'code'>) => void;
  updateFoodMenu: (id: string, m: Partial<FoodMenu>) => void;
  deleteFoodMenu: (id: string) => void;
  
  addMenuPlan: (p: Omit<MenuPlan, 'id'>) => void;
  updateMenuPlan: (id: string, p: Partial<MenuPlan>) => void;
  deleteMenuPlan: (id: string) => void;
  
  upsertBranchStockLimit: (branchId: string, rawMaterialId: string, data: Partial<Omit<BranchStockLimit, 'id' | 'branchId' | 'rawMaterialId'>>) => void;
  removeBranchStockLimit: (branchId: string, rawMaterialId: string) => void;
  
  upsertAccessRole: (role: AccessRole) => void;
  removeAccessRole: (id: string) => void;
  
  addMaterialCategory: (d: Omit<MaterialCategoryDef, 'id' | 'createdAt'>) => void;
  updateMaterialCategory: (id: string, d: Partial<MaterialCategoryDef>) => void;
  deleteMaterialCategory: (id: string) => void;
  
  getCurrencyRate: (code: string) => number;
  getRawMaterialName: (id: string) => string;
  getBranchName: (id: string) => string;
  getBranchAverageUnitCost: (branchId: string, id: string) => number;
  getAverageUnitCost: (id: string) => number;
  getRawMaterialUnitCost: (id: string) => number;
  getFoodCostAlerts: () => FoodCostAlert[];
  
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      branches: [],
      currencies: [],
      companies: [],
      deliveryApps: [],
      unitsOfMeasure: [],
      materialBarcodes: [],
      customCategories: [],
      foodMenus: [],
      menuPlans: [],
      branchStockLimits: [],
      accessRoles: [],
      materialCategories: [],
logo: null,
      numerals: 'arabic',
      decimals: 2,
      density: 'comfortable',
      hijriMode: false,
      preferences: {},
      
      // Settings that were in AppContext but belong here
      vatPercent: 15,
      vatInclusive: true,
      addRecentDoc: () => {},
      showToast: () => {},
      addSupplier: () => ({ id: '', code: '', name: '', contactPerson: '', phone: '', email: '', rating: 3, paymentTermsDays: 15, categories: [], isActive: true, notes: '' }),
      getFoodCostAlerts: () => [],
      
      pendingChanges: new Map(),
      
      setBranches: (data) => { set({ branches: data }); get().markPending('rcerp_branches', data); },
      setCurrencies: (data) => { set({ currencies: data }); get().markPending('rcerp_currencies', data); },
      setCompanies: (data) => { set({ companies: data }); get().markPending('rcerp_companies', data); },
      setDeliveryApps: (data) => { set({ deliveryApps: data }); get().markPending('rcerp_delivery_apps', data); },
      setUnitsOfMeasure: (data) => { set({ unitsOfMeasure: data }); get().markPending('rcerp_units', data); },
      setMaterialBarcodes: (data) => { set({ materialBarcodes: data }); get().markPending('rcerp_material_barcodes', data); },
      setCustomCategories: (data) => { set({ customCategories: data }); get().markPending('rcerp_categories', data); },
      setFoodMenus: (data) => { set({ foodMenus: data }); get().markPending('rcerp_food_menus', data); },
      setMenuPlans: (data) => { set({ menuPlans: data }); get().markPending('rcerp_menu_plans', data); },
      setBranchStockLimits: (data) => { set({ branchStockLimits: data }); get().markPending('rcerp_branch_stock_limits', data); },
      setAccessRoles: (data) => { set({ accessRoles: data }); get().markPending('rcerp_access_roles', data); },
      setMaterialCategories: (data) => { set({ materialCategories: data }); get().markPending('rcerp_material_categories', data); },
      
      setLogo: (value) => { set({ logo: value }); if (value) localStorage.setItem('rcerp_logo', value); else localStorage.removeItem('rcerp_logo'); },
      setNumerals: (v) => { set({ numerals: v }); get().markPending('rcerp_numerals', v); },
      setDecimals: (v) => { set({ decimals: v }); get().markPending('rcerp_decimals', v); },
      setDensity: (v) => { set({ density: v }); get().markPending('rcerp_density', v); },
      setHijriMode: (v) => { set({ hijriMode: v }); get().markPending('rcerp_hijri_mode', v); },
      setPreference: (key, value) => { set((state) => ({ preferences: { ...state.preferences, [key]: value } })); get().markPending('rcerp_preferences', get().preferences); },
      
      // Settings that were in AppContext but belong here
      setVatPercent: (v: number) => { set({ vatPercent: v }); get().markPending('rcerp_vat_percent', v); },
      setVatInclusive: (v: boolean) => { set({ vatInclusive: v }); get().markPending('rcerp_vat_inclusive', v); },
      setAddRecentDoc: (fn: (doc: { type: string; title: string; tab: string }, id?: string) => void) => { set({ addRecentDoc: fn }); },
      setShowToast: (fn: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void) => { set({ showToast: fn }); },
      setAddSupplier: (fn: (s: Omit<Supplier, 'id' | 'code'>) => Supplier) => { set({ addSupplier: fn }); },
      setGetFoodCostAlerts: (fn: () => FoodCostAlert[]) => { set({ getFoodCostAlerts: fn }); },
      
      addBranch: (b) => { set((state) => ({ branches: [...state.branches, { ...b, id: uid('br'), code: `BR-${Date.now().toString(36).toUpperCase()}` }] })); get().markPending('rcerp_branches', get().branches); },
      updateBranch: (id, b) => { set((state) => ({ branches: state.branches.map(br => br.id === id ? { ...br, ...b } : br) })); get().markPending('rcerp_branches', get().branches); },
      deleteBranch: (id) => { set((state) => ({ branches: state.branches.filter(br => br.id !== id) })); get().markPending('rcerp_branches', get().branches); },
      
      addCurrency: (c) => { set((state) => ({ currencies: [...state.currencies, { ...c }] })); get().markPending('rcerp_currencies', get().currencies); },
      updateCurrency: (code, d) => { set((state) => ({ currencies: state.currencies.map(c => c.code === code ? { ...c, ...d } : c) })); get().markPending('rcerp_currencies', get().currencies); },
      deleteCurrency: (code) => { set((state) => ({ currencies: state.currencies.filter(c => c.code !== code) })); get().markPending('rcerp_currencies', get().currencies); },
      
      addCompany: (c) => { set((state) => ({ companies: [...state.companies, { ...c, id: uid('co'), code: `CO-${Date.now().toString(36).toUpperCase()}` }] })); get().markPending('rcerp_companies', get().companies); },
      updateCompany: (id, c) => { set((state) => ({ companies: state.companies.map(co => co.id === id ? { ...co, ...c } : co) })); get().markPending('rcerp_companies', get().companies); },
      deleteCompany: (id) => { set((state) => ({ companies: state.companies.filter(co => co.id !== id) })); get().markPending('rcerp_companies', get().companies); },
      
      addDeliveryApp: (a) => { set((state) => ({ deliveryApps: [...state.deliveryApps, { ...a, id: uid('da') }] })); get().markPending('rcerp_delivery_apps', get().deliveryApps); },
      updateDeliveryApp: (id, a) => { set((state) => ({ deliveryApps: state.deliveryApps.map(da => da.id === id ? { ...da, ...a } : da) })); get().markPending('rcerp_delivery_apps', get().deliveryApps); },
      deleteDeliveryApp: (id) => { set((state) => ({ deliveryApps: state.deliveryApps.filter(da => da.id !== id) })); get().markPending('rcerp_delivery_apps', get().deliveryApps); },
      
      addUnitOfMeasure: (u) => { set((state) => ({ unitsOfMeasure: [...state.unitsOfMeasure, { ...u, id: uid('uom') }] })); get().markPending('rcerp_units', get().unitsOfMeasure); },
      updateUnitOfMeasure: (id, u) => { set((state) => ({ unitsOfMeasure: state.unitsOfMeasure.map(uom => uom.id === id ? { ...uom, ...u } : uom) })); get().markPending('rcerp_units', get().unitsOfMeasure); },
      deleteUnitOfMeasure: (id) => { const inUse = get().materialCategories?.some(m => m.key === id); if (inUse) return { ok: false, error: 'الوحدة مستخدمة ولا يمكن حذفها' }; set((state) => ({ unitsOfMeasure: state.unitsOfMeasure.filter(uom => uom.id !== id) })); get().markPending('rcerp_units', get().unitsOfMeasure); return { ok: true }; },
      
      addMaterialBarcode: (b) => { set((state) => ({ materialBarcodes: [...state.materialBarcodes, { ...b, id: uid('bc') }] })); get().markPending('rcerp_material_barcodes', get().materialBarcodes); },
      updateMaterialBarcode: (id, b) => { set((state) => ({ materialBarcodes: state.materialBarcodes.map(bc => bc.id === id ? { ...bc, ...b } : bc) })); get().markPending('rcerp_material_barcodes', get().materialBarcodes); },
      deleteMaterialBarcode: (id) => { set((state) => ({ materialBarcodes: state.materialBarcodes.filter(bc => bc.id !== id) })); get().markPending('rcerp_material_barcodes', get().materialBarcodes); },
      
      addCustomCategory: (c) => { set((state) => ({ customCategories: [...state.customCategories, { ...c, id: uid('cat') }] })); get().markPending('rcerp_categories', get().customCategories); },
      deleteCustomCategory: (id) => { set((state) => ({ customCategories: state.customCategories.filter(c => c.id !== id) })); get().markPending('rcerp_categories', get().customCategories); },
      
      addFoodMenu: (m) => { set((state) => ({ foodMenus: [...state.foodMenus, { ...m, id: uid('fm'), code: `FM-${Date.now().toString(36).toUpperCase()}` }] })); get().markPending('rcerp_food_menus', get().foodMenus); },
      updateFoodMenu: (id, m) => { set((state) => ({ foodMenus: state.foodMenus.map(fm => fm.id === id ? { ...fm, ...m } : fm) })); get().markPending('rcerp_food_menus', get().foodMenus); },
      deleteFoodMenu: (id) => { set((state) => ({ foodMenus: state.foodMenus.filter(fm => fm.id !== id) })); get().markPending('rcerp_food_menus', get().foodMenus); },
      
      addMenuPlan: (p) => { set((state) => ({ menuPlans: [...state.menuPlans, { ...p, id: uid('mp') }] })); get().markPending('rcerp_menu_plans', get().menuPlans); },
      updateMenuPlan: (id, p) => { set((state) => ({ menuPlans: state.menuPlans.map(mp => mp.id === id ? { ...mp, ...p } : mp) })); get().markPending('rcerp_menu_plans', get().menuPlans); },
      deleteMenuPlan: (id) => { set((state) => ({ menuPlans: state.menuPlans.filter(mp => mp.id !== id) })); get().markPending('rcerp_menu_plans', get().menuPlans); },
      
      upsertBranchStockLimit: (branchId, rawMaterialId, data) => { set((state) => { const idx = state.branchStockLimits.findIndex(l => l.branchId === branchId && l.rawMaterialId === rawMaterialId); const newLimits = [...state.branchStockLimits]; const limit: BranchStockLimit = { id: idx >= 0 ? newLimits[idx].id : uid('bsl'), branchId, rawMaterialId, minStockLevel: data.minStockLevel ?? 0, maxStockLevel: data.maxStockLevel ?? 0, alwaysOrderFullMax: data.alwaysOrderFullMax ?? false, ...data }; if (idx >= 0) newLimits[idx] = limit; else newLimits.push(limit); return { branchStockLimits: newLimits }; }); get().markPending('rcerp_branch_stock_limits', get().branchStockLimits); },
      removeBranchStockLimit: (branchId, rawMaterialId) => { set((state) => ({ branchStockLimits: state.branchStockLimits.filter(l => !(l.branchId === branchId && l.rawMaterialId === rawMaterialId)) })); get().markPending('rcerp_branch_stock_limits', get().branchStockLimits); },
      
      upsertAccessRole: (role) => { set((state) => ({ accessRoles: state.accessRoles.some(r => r.id === role.id) ? state.accessRoles.map(r => r.id === role.id ? role : r) : [...state.accessRoles, role] })); get().markPending('rcerp_access_roles', get().accessRoles); },
      removeAccessRole: (id) => { set((state) => ({ accessRoles: state.accessRoles.filter(r => r.id !== id) })); get().markPending('rcerp_access_roles', get().accessRoles); },
      
      addMaterialCategory: (d) => { set((state) => ({ materialCategories: [...state.materialCategories, { ...d, id: uid('mc'), createdAt: new Date().toISOString() }] })); get().markPending('rcerp_material_categories', get().materialCategories); },
      updateMaterialCategory: (id, d) => { set((state) => ({ materialCategories: state.materialCategories.map(mc => mc.id === id ? { ...mc, ...d } : mc) })); get().markPending('rcerp_material_categories', get().materialCategories); },
      deleteMaterialCategory: (id) => { set((state) => ({ materialCategories: state.materialCategories.filter(mc => mc.id !== id) })); get().markPending('rcerp_material_categories', get().materialCategories); },
      
      getCurrencyRate: (code) => get().currencies.find(c => c.code === code)?.rateToBase || 1,
      getRawMaterialName: (id) => get().materialCategories?.find(m => m.id === id)?.labelAr || id,
      getBranchName: (id) => get().branches.find(b => b.id === id)?.nameAr || id,
      getBranchAverageUnitCost: (_branchId, _id) => 0,
      getAverageUnitCost: (_id) => 0,
      getRawMaterialUnitCost: (_id) => 0,
      
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        branches: state.branches,
        currencies: state.currencies,
        companies: state.companies,
        deliveryApps: state.deliveryApps,
        unitsOfMeasure: state.unitsOfMeasure,
        materialBarcodes: state.materialBarcodes,
        customCategories: state.customCategories,
        foodMenus: state.foodMenus,
        menuPlans: state.menuPlans,
        branchStockLimits: state.branchStockLimits,
        accessRoles: state.accessRoles,
        materialCategories: state.materialCategories,
        logo: state.logo,
        numerals: state.numerals,
        decimals: state.decimals,
        density: state.density,
        hijriMode: state.hijriMode,
        preferences: state.preferences,
      }),
    }
  )
);

export const useBranches = () => useSettingsStore(state => state.branches);
export const useCurrencies = () => useSettingsStore(state => state.currencies);
export const useCompanies = () => useSettingsStore(state => state.companies);
export const useDeliveryApps = () => useSettingsStore(state => state.deliveryApps);
export const useUnitsOfMeasure = () => useSettingsStore(state => state.unitsOfMeasure);
export const useMaterialBarcodes = () => useSettingsStore(state => state.materialBarcodes);
export const useCustomCategories = () => useSettingsStore(state => state.customCategories);
export const useFoodMenus = () => useSettingsStore(state => state.foodMenus);
export const useMenuPlans = () => useSettingsStore(state => state.menuPlans);
export const useBranchStockLimits = () => useSettingsStore(state => state.branchStockLimits);
export const useAccessRoles = () => useSettingsStore(state => state.accessRoles);
export const useMaterialCategories = () => useSettingsStore(state => state.materialCategories);
export const useLogo = () => useSettingsStore(state => state.logo);
export const useNumerals = () => useSettingsStore(state => state.numerals);
export const useDecimals = () => useSettingsStore(state => state.decimals);
export const useDensity = () => useSettingsStore(state => state.density);
export const useHijriMode = () => useSettingsStore(state => state.hijriMode);
export const usePreferences = () => useSettingsStore(state => state.preferences);
export const useGetFoodCostAlerts = () => useSettingsStore(state => state.getFoodCostAlerts);

export const useSettingsActions = () => useSettingsStore(state => ({
  addBranch: state.addBranch,
  updateBranch: state.updateBranch,
  deleteBranch: state.deleteBranch,
  addCurrency: state.addCurrency,
  updateCurrency: state.updateCurrency,
  deleteCurrency: state.deleteCurrency,
  addCompany: state.addCompany,
  updateCompany: state.updateCompany,
  deleteCompany: state.deleteCompany,
  addDeliveryApp: state.addDeliveryApp,
  updateDeliveryApp: state.updateDeliveryApp,
  deleteDeliveryApp: state.deleteDeliveryApp,
  addUnitOfMeasure: state.addUnitOfMeasure,
  updateUnitOfMeasure: state.updateUnitOfMeasure,
  deleteUnitOfMeasure: state.deleteUnitOfMeasure,
  addMaterialBarcode: state.addMaterialBarcode,
  updateMaterialBarcode: state.updateMaterialBarcode,
  deleteMaterialBarcode: state.deleteMaterialBarcode,
  addCustomCategory: state.addCustomCategory,
  deleteCustomCategory: state.deleteCustomCategory,
  addFoodMenu: state.addFoodMenu,
  updateFoodMenu: state.updateFoodMenu,
  deleteFoodMenu: state.deleteFoodMenu,
  addMenuPlan: state.addMenuPlan,
  updateMenuPlan: state.updateMenuPlan,
  deleteMenuPlan: state.deleteMenuPlan,
  upsertBranchStockLimit: state.upsertBranchStockLimit,
  removeBranchStockLimit: state.removeBranchStockLimit,
  upsertAccessRole: state.upsertAccessRole,
  removeAccessRole: state.removeAccessRole,
  addMaterialCategory: state.addMaterialCategory,
  updateMaterialCategory: state.updateMaterialCategory,
  deleteMaterialCategory: state.deleteMaterialCategory,
  setLogo: state.setLogo,
  setNumerals: state.setNumerals,
  setDecimals: state.setDecimals,
  setDensity: state.setDensity,
  setHijriMode: state.setHijriMode,
  setPreference: state.setPreference,
}));

export const useSettingsSyncActions = () => useSettingsStore(state => ({
  setBranches: state.setBranches,
  setCurrencies: state.setCurrencies,
  setCompanies: state.setCompanies,
  setDeliveryApps: state.setDeliveryApps,
  setUnitsOfMeasure: state.setUnitsOfMeasure,
  setMaterialBarcodes: state.setMaterialBarcodes,
  setCustomCategories: state.setCustomCategories,
  setFoodMenus: state.setFoodMenus,
  setMenuPlans: state.setMenuPlans,
  setBranchStockLimits: state.setBranchStockLimits,
  setAccessRoles: state.setAccessRoles,
  setMaterialCategories: state.setMaterialCategories,
  setVatPercent: state.setVatPercent,
  setVatInclusive: state.setVatInclusive,
  setAddRecentDoc: state.setAddRecentDoc,
  setShowToast: state.setShowToast,
  setAddSupplier: state.setAddSupplier,
  setGetFoodCostAlerts: state.setGetFoodCostAlerts,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));