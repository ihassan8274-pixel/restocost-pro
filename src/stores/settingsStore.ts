import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Branch, UnitOfMeasure, MaterialBarcode, MaterialCategoryDef,
  CustomCategory, Currency, Company, AutomationRule, ScheduledReport,
} from '../types';
import { today } from '../utils/helpers';
// المواد الخام في legacyCompatStore (لا settingsStore) — نحتاجها لتعرف هل
// وحدة القياس مرتبطة بأصناف قبل حذفها.
import { useLegacyCompatStore } from './legacyCompatStore';

interface SettingsState {
  branches: Branch[];
  unitsOfMeasure: UnitOfMeasure[];
  materialBarcodes: MaterialBarcode[];
  materialCategories: MaterialCategoryDef[];
  customCategories: CustomCategory[];
  currencies: Currency[];
  companies: Company[];
  customRoles: string[];
  automationRules: AutomationRule[];
  scheduledReports: ScheduledReport[];
  addBranch: (data: Omit<Branch, 'id' | 'code'>) => void;
  updateBranch: (id: string, data: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  addUnitOfMeasure: (u: Omit<UnitOfMeasure, 'id'>) => void;
  updateUnitOfMeasure: (id: string, u: Partial<UnitOfMeasure>) => void;
  deleteUnitOfMeasure: (id: string) => { ok: boolean; error?: string };
  addMaterialBarcode: (b: Omit<MaterialBarcode, 'id'>) => void;
  updateMaterialBarcode: (id: string, b: Partial<MaterialBarcode>) => void;
  deleteMaterialBarcode: (id: string) => void;
  barcodesForMaterial: (rawMaterialId: string) => MaterialBarcode[];
  findByBarcode: (code: string) => MaterialBarcode | undefined;
  addMaterialCategory: (d: Omit<MaterialCategoryDef, 'id' | 'createdAt'>) => void;
  updateMaterialCategory: (id: string, d: Partial<MaterialCategoryDef>) => void;
  deleteMaterialCategory: (id: string) => void;
  addCategory: (data: Omit<CustomCategory, 'id'>) => void;
  deleteCategory: (id: string) => void;
  addCurrency: (c: { code: string; nameAr: string; symbol: string; rateToBase: number; isActive: boolean }) => void;
  updateCurrency: (code: string, d: Partial<Currency>) => void;
  deleteCurrency: (code: string) => void;
  getCurrencyRate: (code: string) => number;
  addCompany: (data: Omit<Company, 'id' | 'code'>) => void;
  updateCompany: (id: string, data: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  getCompanyName: (id: string) => string;
  addRole: (role: string) => void;
  deleteRole: (role: string) => void;
  setAutomationRule: (id: string, enabled: boolean) => void;
  addScheduledReport: (d: Omit<ScheduledReport, 'id'>) => void;
  setScheduledReport: (id: string, d: Partial<ScheduledReport>) => void;
  runScheduledReport: (id: string) => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      branches: [],
      unitsOfMeasure: [],
      materialBarcodes: [],
      materialCategories: [],
      customCategories: [],
      currencies: [],
      companies: [],
      customRoles: [],
      automationRules: [],
      scheduledReports: [],

      addBranch: (data) => set((state) => ({ branches: [...state.branches, { ...data, id: `b-${Date.now()}`, code: `BR-${Math.floor(100 + Math.random() * 900)}` }] })),
      updateBranch: (id, data) => set((state) => ({ branches: state.branches.map((b) => (b.id === id ? { ...b, ...data } : b)) })),
      deleteBranch: (id) => set((state) => ({ branches: state.branches.filter((b) => b.id !== id) })),

      addUnitOfMeasure: (u) => set((state) => ({ unitsOfMeasure: [...state.unitsOfMeasure, { ...u, id: `u-${Date.now()}` }] })),
      updateUnitOfMeasure: (id, u) => set((state) => ({ unitsOfMeasure: state.unitsOfMeasure.map((x) => (x.id === id ? { ...x, ...u } : x)) })),
      // كان stub يُرجع {ok:true} بلا حذف — الواجهة تقول "تم" والوحدة باقية.
      // الآن يحذف فعلاً، ويرفض إن كانت مرتبطة بأصناف أو باركود (وحدة بلا
      // مرجع آمنة للحذف).
      deleteUnitOfMeasure: (id) => {
        const st = get();
        const mats = useLegacyCompatStore.getState().rawMaterials;
        const unit = st.unitsOfMeasure.find((u) => u.id === id);
        if (!unit) return { ok: false, error: 'وحدة القياس غير موجودة' };
        const inUse = mats.filter((m) => m.unit === unit.code || m.purchaseUnit === unit.code);
        if (inUse.length) {
          return { ok: false, error: `لا يمكن الحذف — الوحدة مستخدمة في ${inUse.length} صنف (${inUse.slice(0, 3).map((m) => m.nameAr).join('، ')})` };
        }
        const barcodes = st.materialBarcodes.filter((b) => (b as { unit?: string }).unit === unit.code);
        if (barcodes.length) return { ok: false, error: `لا يمكن الحذف — الوحدة مرتبطة بـ${barcodes.length} باركود` };
        set((state) => ({ unitsOfMeasure: state.unitsOfMeasure.filter((u) => u.id !== id) }));
        return { ok: true };
      },

      addMaterialBarcode: (b) => set((state) => ({ materialBarcodes: [...state.materialBarcodes, { ...b, id: `bc-${Date.now()}` }] })),
      updateMaterialBarcode: (id, b) => set((state) => ({ materialBarcodes: state.materialBarcodes.map((x) => (x.id === id ? { ...x, ...b } : x)) })),
      deleteMaterialBarcode: (id) => set((state) => ({ materialBarcodes: state.materialBarcodes.filter((x) => x.id !== id) })),
      barcodesForMaterial: (rawMaterialId) => get().materialBarcodes.filter((b) => b.rawMaterialId === rawMaterialId),
      findByBarcode: (code) => get().materialBarcodes.find((b) => b.barcode === code),

      addMaterialCategory: (d) => set((state) => ({ materialCategories: [{ ...d, id: `mc-${Date.now()}`, createdAt: new Date().toISOString() }, ...state.materialCategories] })),
      updateMaterialCategory: (id, d) => set((state) => ({ materialCategories: state.materialCategories.map((c) => (c.id === id ? { ...c, ...d } : c)) })),
      deleteMaterialCategory: (id) => set((state) => ({ materialCategories: state.materialCategories.filter((c) => c.id !== id) })),

      addCategory: (data) => set((state) => ({ customCategories: [{ ...data, id: `cat-${Date.now()}` }, ...state.customCategories] })),
      deleteCategory: (id) => set((state) => ({ customCategories: state.customCategories.filter((c) => c.id !== id) })),

      // مفتاح العمل للعملة هو code (SAR, USD...)، لكن mergeById على الخادم
      // يسقط أي سجل بلا id — فبلا id كانت العملات تُمحى من كل دمج. نضيف
      // id مشتقاً من code: ثابت عبر التحديث (لا يتغيّر بتغيير الاسم) وبلا
      // تصادم مع مفتاح أي مجموعة أخرى.
      addCurrency: (c) => {
        const code = c.code.trim().toUpperCase();
        if (get().currencies.some((x) => x.code === code)) return;
        set((state) => ({ currencies: [{ ...c, code, id: `cur-${code}`, isBase: false }, ...state.currencies] }));
      },
      updateCurrency: (code, d) => set((state) => ({ currencies: state.currencies.map((c) => (c.code === code ? { ...c, ...d, id: c.id || `cur-${code}` } : c)) })),
      deleteCurrency: (code) => {
        if (code === 'SAR') return;
        set((state) => ({ currencies: state.currencies.filter((c) => c.code !== code) }));
      },
      getCurrencyRate: (code) => get().currencies.find((c) => c.code === code)?.rateToBase || 1,

      addCompany: (data) => set((state) => ({ companies: [{ ...data, id: `co-${Date.now()}`, code: `CO-${Math.floor(100 + Math.random() * 900)}` }, ...state.companies] })),
      updateCompany: (id, data) => set((state) => ({ companies: state.companies.map((c) => (c.id === id ? { ...c, ...data } : c)) })),
      deleteCompany: (id) => set((state) => ({ companies: state.companies.filter((c) => c.id !== id) })),
      getCompanyName: (id) => get().companies.find((c) => c.id === id)?.nameAr || id,

      addRole: (role) => set((state) => ({ customRoles: state.customRoles.includes(role) ? state.customRoles : [...state.customRoles, role] })),
      deleteRole: (role) => set((state) => ({ customRoles: state.customRoles.filter((r) => r !== role) })),

      setAutomationRule: (id, enabled) => set((state) => ({ automationRules: state.automationRules.map((r) => (r.id === id ? { ...r, enabled } : r)) })),

      addScheduledReport: (d) => set((state) => ({ scheduledReports: [{ ...d, id: `sr-${Date.now()}` }, ...state.scheduledReports] })),
      setScheduledReport: (id, d) => set((state) => ({ scheduledReports: state.scheduledReports.map((r) => (r.id === id ? { ...r, ...d } : r)) })),
      runScheduledReport: (id) => {
        set((state) => ({ scheduledReports: state.scheduledReports.map((r) => (r.id === id ? { ...r, lastRun: today() } : r)) }));
        return 'dashboard';
      },
    }),
    { name: 'rcerp_settings' }
  )
);
