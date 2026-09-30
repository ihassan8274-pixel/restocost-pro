import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth, visibleBranchIdsFor } from './useAuth';
import { useInventory } from './useInventory';
import { useProcurement } from './useProcurement';
import { useProduction } from './useProduction';
import { useFinancial } from './useFinancial';
import { useSales } from './useSales';
import { useSettings } from './useSettings';
import { useHR } from './useHR';
import { usePeriod } from './usePeriod';
import { useSync } from './useSync';
import { usePreferencesContext } from './usePreferences';
import { useLegacyCompatStore } from '@stores/legacyCompatStore';
import { useInventoryStore } from '@stores/inventoryStore';
import { useProductionStore } from '@stores/productionStore';
import { useProcurementStore } from '@stores/procurementStore';
import { useSalesStore } from '@stores/salesStore';
import { useFinancialStore } from '@stores/financialStore';
import { useSettingsStore } from '@stores/settingsStore';
import { useHRStore } from '@stores/hrStore';
import { usePeriodStore } from '@stores/periodStore';
import { useAuthStore } from '@stores/authStore';
import { useSyncStore } from '@stores/syncStore';

import { computeRecipeCosts, recipeUsesAnyMaterial, type RecipeCostBreakdown } from '../../business/recipes';
import { averageUnitCostFromReceipts } from '../../business/costs';
import { stockPerPurchase, tradeToStock } from '../../business/units';
import { lowestPrice30Days, lastSupplierIdFor } from '../../business/purchaseRequests';
import { nextDocSequence } from '../../business/docNumbers';
import { parseNum } from '../../utils/excel';
import { fmtMoney, today } from '../../utils/helpers';

import {
  getBranchName as getBranchNameSel,
  getRawMaterialUnitCost as getRawMaterialUnitCostSel,
  getAverageUnitCost as getAverageUnitCostSel,
  getBranchAverageUnitCost as getBranchAverageUnitCostSel,
  getLastPurchaseCost as getLastPurchaseCostSel,
  getCurrencyRate as getCurrencyRateSel,
  convertToBase as convertToBaseSel,
  computeFoodCostAlerts,
} from '../../context/selectors';

import type {
  RawMaterial, Supplier, Customer, WastageLog, DepartmentRequisition,
  SystemNotification, ProductionRun, ProductionRunItem, StandardRecipe, RecipeCostHistoryEntry,
  InventoryRecord, GoodsReceiptNote, FoodCostAlert, User, SubPrepIngredient,
  MaterialCategory, PurchaseOrder, POSOrder, StockTransfer, FoodMenu,
} from '../../types';
import { ROLE_PERMISSIONS } from '../../types';

import type { SystemCheckResult, DataHealthScore, SystemRebuildResult } from '../../context/AppContext';
import { useAuthCore } from '../../context/useAuthCore';
import { SyncBridge } from './useSyncBridge';

import {
  INITIAL_CATEGORIES, INITIAL_BRANCHES, INITIAL_COMPANIES, INITIAL_UNITS, INITIAL_CURRENCIES,
  INITIAL_SUPPLIERS, INITIAL_RAW_MATERIALS, DEFAULT_RECIPE_SECTIONS, INITIAL_RECIPES,
  INITIAL_INVENTORY, INITIAL_GRN_NOTES, INITIAL_PURCHASE_ORDERS, INITIAL_WORK_ORDERS,
  INITIAL_WASTAGE_LOGS, INITIAL_EMPLOYEES, INITIAL_LABOR_SHIFTS, INITIAL_POS_ORDERS,
  INITIAL_STOCK_TRANSFERS, INITIAL_RECIPE_INVENTORY, INITIAL_PL_SUMMARIES, INITIAL_FOOD_MENUS,
  INITIAL_BATCH_SALES, INITIAL_OPERATING_EXPENSES, INITIAL_EXPENSE_BUDGETS, INITIAL_CUSTOMERS,
  INITIAL_RESERVATIONS, INITIAL_INVOICES, INITIAL_ACCOUNTS, INITIAL_FIXED_ASSETS,
  INITIAL_SCHEDULED_REPORTS, INITIAL_AUTOMATION_RULES, INITIAL_JOURNAL_ENTRIES,
} from '../../mockData';

const OPTIONAL_CATEGORIES: MaterialCategory[] = ['meat_poultry', 'seafood', 'vegetables_fruits', 'dairy_eggs', 'dry_goods', 'oils_sauces', 'packaging', 'beverages'];

type ToastLevel = 'success' | 'error' | 'info' | 'warning';
interface ToastEntry {
  message: string;
  level: ToastLevel;
  undo?: () => void;
  duration?: number;
}

const recipeStockQty = (rawMaterials: RawMaterial[], matId: string, tradeQty: number): number =>
  tradeToStock(tradeQty, rawMaterials.find((m) => m.id === matId));

export const useApp = () => {
  const auth = useAuth();
  const inventory = useInventory();
  const procurement = useProcurement();
  const production = useProduction();
  const financial = useFinancial();
  const sales = useSales();
  const settings = useSettings();
  const hr = useHR();
  const period = usePeriod();
  const sync = useSync();
  const preferences = usePreferencesContext();
  const legacy = useLegacyCompatStore();

  // مشتقة من المستخدم الحالي + الفروع — تستعيد سلوك AppContext القديم
  const visibleBranchIds = useMemo<string[]>(
    () => visibleBranchIdsFor(auth.currentUser, settings.branches),
    [auth.currentUser, settings.branches],
  );

  const [toast, setToast] = useState<ToastEntry | null>(null);
  const showToast = useCallback((message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => {
    setToast({ message, level: opts?.level ?? 'info', undo: opts?.undo, duration: opts?.duration });
  }, []);

  const setUsersCompat: Dispatch<SetStateAction<User[]>> = useCallback((v) => {
    useAuthStore.setState((s) => ({ users: typeof v === 'function' ? v(s.users) : v }));
  }, []);
  const setCurrentUserCompat: Dispatch<SetStateAction<User | null>> = useCallback((v) => {
    useAuthStore.setState((s) => ({ currentUser: typeof v === 'function' ? v(s.currentUser) : v }));
  }, []);

  const authCore = useAuthCore({
    users: useAuthStore.getState().users,
    setUsers: setUsersCompat,
    currentUser: useAuthStore.getState().currentUser,
    setCurrentUser: setCurrentUserCompat,
    setMustChangePassword: (v) => useAuthStore.getState().setMustChangePassword(v),
    setAuthExpired: (v) => useAuthStore.getState().setAuthExpired(v),
    pendingSaves: useSyncStore.getState().pendingSaves,
    flushSaves: () => useSyncStore.getState().flushSaves(),
    retryBootstrap: () => useSyncStore.getState().retryBootstrap(),
  });

  // ---- مزامنة دورية في الخلفية (كل 5 دقائق) لجلب تحديثات الأجهزة الأخرى ----
  useEffect(() => {
    if (!auth.currentUser) return;
    const interval = setInterval(() => {
      useSyncStore.getState().retryBootstrap();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [auth.currentUser]);

  // ---- مزامنة سريعة للمجموعات الحرجة (الجرد، المبيعات، الهالك) كل دقيقة ----
  useEffect(() => {
    if (!auth.currentUser) return;
    const criticalKeys = ['rcerp_daily_counts', 'rcerp_pos_orders', 'rcerp_batch_sales', 'rcerp_wastage'];
    const interval = setInterval(() => {
      criticalKeys.forEach((key) => {
        useSyncStore.getState().syncNow(key);
      });
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [auth.currentUser]);

  // ---- Getters (قراءة مباشرة من الستورات لحظياً — بلا ركود مغلق) ----
  const getRawMaterialName = useCallback((id: string): string => {
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    return rawMaterials.find((m) => m.id === id)?.nameAr || id;
  }, []);

  const getAverageUnitCost = useCallback((id: string): number => {
    const grnNotes = useProcurementStore.getState().grnNotes;
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    return getAverageUnitCostSel(grnNotes, rawMaterials, id);
  }, []);

  const getBranchAverageUnitCost = useCallback((branchId: string, id: string, asOf?: string): number => {
    const grnNotes = useProcurementStore.getState().grnNotes;
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const stockTransfers = useInventoryStore.getState().stockTransfers;
    const openingBalances = useInventoryStore.getState().openingBalances;
    return getBranchAverageUnitCostSel(openingBalances, grnNotes, stockTransfers, rawMaterials, branchId, id, asOf);
  }, []);

  const getLastPurchaseCost = useCallback((branchId: string, id: string): number => {
    const grnNotes = useProcurementStore.getState().grnNotes;
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    return getLastPurchaseCostSel(grnNotes, rawMaterials, branchId, id);
  }, []);

  const getBranchName = useCallback((id: string): string => {
    const branches = useSettingsStore.getState().branches;
    return getBranchNameSel(branches, id);
  }, []);

  const getRawMaterialUnitCost = useCallback((id: string): number => {
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    return getRawMaterialUnitCostSel(rawMaterials, id);
  }, []);

  const convertToBase = useCallback((amount: number, code: string): number => {
    const currencies = useSettingsStore.getState().currencies;
    return convertToBaseSel(currencies, amount, code);
  }, []);

  const calculateRecipeCosts = useCallback(
    (ingredients: StandardRecipe['ingredients'], directLabor: number, packaging: number, subPrep?: SubPrepIngredient[], yieldPieces?: number, _depth = 0): RecipeCostBreakdown => {
      const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
      const recipes = useProductionStore.getState().recipes;
      return computeRecipeCosts(rawMaterials, recipes, ingredients, directLabor, packaging, subPrep, yieldPieces, _depth, (id) => getAverageUnitCost(id));
    },
    [getAverageUnitCost],
  );

  const getFoodCostAlerts = useCallback((): FoodCostAlert[] => {
    const leg = useLegacyCompatStore.getState();
    const recipes = useProductionStore.getState().recipes;
    const grnNotes = useProcurementStore.getState().grnNotes;
    return computeFoodCostAlerts(recipes, leg.acknowledgedAlertIds, leg.globalTargetMarginPercent, leg.rawMaterials, grnNotes, today());
  }, []);

  const acknowledgeAlert = useCallback((recipeId: string) => {
    const leg = useLegacyCompatStore.getState();
    leg.setAcknowledgedAlertIds(leg.acknowledgedAlertIds.includes(recipeId) ? leg.acknowledgedAlertIds : [...leg.acknowledgedAlertIds, recipeId]);
  }, []);
  const unacknowledgeAlert = useCallback((recipeId: string) => {
    const leg = useLegacyCompatStore.getState();
    leg.setAcknowledgedAlertIds(leg.acknowledgedAlertIds.filter((id) => id !== recipeId));
  }, []);

  // ---- إعادة حساب تكاليف الوصفات عند تغيّر سعر/تحويل خام ----
  const refreshRecipesCosts = useCallback((grnList: GoodsReceiptNote[], matList: RawMaterial[], changedMaterialIds: string[], reason: string): void => {
    const prod = useProductionStore.getState();
    const next = prod.recipes.map((r) => {
      if (changedMaterialIds.length && !recipeUsesAnyMaterial(r, prod.recipes, changedMaterialIds)) return r;
      const costs = computeRecipeCosts(
        matList, prod.recipes, r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces, 0,
        (id) => averageUnitCostFromReceipts(grnList, id, matList.find((m) => m.id === id)?.standardPrice || 0),
      );
      const oldCost = Number(r.totalCalculatedCost ?? 0);
      if (!isFinite(costs.totalCost) || Math.abs(costs.totalCost - oldCost) < 0.005) return r;
      const entry: RecipeCostHistoryEntry = {
        id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        oldTotalCost: oldCost,
        newTotalCost: costs.totalCost,
        oldSuggestedPrice: Number(r.suggestedPrice ?? 0),
        newSuggestedPrice: costs.suggestedPrice,
        reason,
        changedMaterials: changedMaterialIds,
      };
      return { ...r, totalCalculatedCost: costs.totalCost, suggestedPrice: costs.suggestedPrice, costHistory: [...(r.costHistory || []), entry] };
    });
    useProductionStore.setState({ recipes: next });
  }, []);

  // ---- المواد الخام ----
  const addRawMaterial = useCallback((data: Omit<RawMaterial, 'id' | 'code'>) => {
    const leg = useLegacyCompatStore.getState();
    useLegacyCompatStore.setState({
      rawMaterials: [...leg.rawMaterials, { ...data, id: `rm-${Date.now()}`, code: `RM-${Math.floor(100 + Math.random() * 900)}` }],
    });
    leg.logAudit('إضافة مادة خام', 'المخزون', data.nameAr);
  }, []);

  const updateRawMaterial = useCallback((id: string, data: Partial<RawMaterial>) => {
    const leg = useLegacyCompatStore.getState();
    const updated = leg.rawMaterials.map((m) => (m.id === id ? { ...m, ...data } : m));
    useLegacyCompatStore.setState({ rawMaterials: updated });
    const priceFields: (keyof RawMaterial)[] = ['standardPrice', 'purchaseUnitPrice', 'purchaseUnitConversion', 'tradeUomConversion', 'tradeUomId', 'tradeUomName', 'yieldPercentage'];
    if (priceFields.some((f) => data[f] !== undefined)) {
      refreshRecipesCosts(useProcurementStore.getState().grnNotes, updated, [id], 'تعديل سعر مادة خام');
    }
    if (data.nameAr) {
      const nm = data.nameAr;
      const proc = useProcurementStore.getState();
      useProcurementStore.setState({
        purchaseOrders: proc.purchaseOrders.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.materialName !== nm ? { ...it, materialName: nm } : it)) })),
        supplierReturns: proc.supplierReturns.map((r) => ({ ...r, items: r.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })),
      });
      const period = usePeriodStore.getState();
      usePeriodStore.setState({
        monthlyInventory: period.monthlyInventory.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })),
      });
      const inv = useInventoryStore.getState();
      useInventoryStore.setState({
        dailyCounts: inv.dailyCounts.map((c) => ({ ...c, items: c.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })),
        stockTransfers: inv.stockTransfers.map((t) => ({ ...t, items: t.items.map((it) => (it.rawMaterialId === id ? { ...it, itemName: nm, materialName: it.materialName ? nm : undefined } : it)) })),
      });
      useProductionStore.setState({
        productionRuns: useProductionStore.getState().productionRuns.map((p) => ({ ...p, items: p.items.map((it) => (it.rawMaterialId === id && it.materialName !== nm ? { ...it, materialName: nm } : it)) })),
      });
      useLegacyCompatStore.setState({
        requisitions: leg.requisitions.map((r) => ({ ...r, items: r.items.map((it) => (it.rawMaterialId === id && it.itemName !== nm ? { ...it, itemName: nm } : it)) })),
        wastageLogs: leg.wastageLogs.map((w) => (w.rawMaterialId === id && w.itemName !== nm ? { ...w, itemName: nm } : w)),
      });
    }
    leg.logAudit('تعديل مادة خام', 'المخزون', data.nameAr);
  }, [refreshRecipesCosts]);

  const deleteRawMaterial = useCallback((id: string): { ok: boolean; error?: string } => {
    const leg = useLegacyCompatStore.getState();
    const recipes = useProductionStore.getState().recipes;
    const inventoryArr = useInventoryStore.getState().inventory;
    const grnNotes = useProcurementStore.getState().grnNotes;
    const { wastageLogs, requisitions } = leg;
    const stockTransfers = useInventoryStore.getState().stockTransfers;
    const productionRuns = useProductionStore.getState().productionRuns;
    const dailyCounts = useInventoryStore.getState().dailyCounts;
    const openingBalances = useInventoryStore.getState().openingBalances;
    const physicalCounts = useInventoryStore.getState().physicalCounts;
    const purchaseOrders = useProcurementStore.getState().purchaseOrders;
    const supplierReturns = useProcurementStore.getState().supplierReturns;

    if (recipes.some((r) => r.ingredients.some((ing) => ing.rawMaterialId === id))) {
      return { ok: false, error: 'لا يمكن الحذف — المادة مستخدمة في وصفة معيارية. أوقفها بدلاً من ذلك.' };
    }
    const hasMovement = wastageLogs.some((w) => w.rawMaterialId === id)
      || stockTransfers.some((t) => t.items.some((i) => i.rawMaterialId === id))
      || productionRuns.some((p) => p.items.some((i) => i.rawMaterialId === id))
      || dailyCounts.some((d) => d.items.some((i) => i.rawMaterialId === id))
      || openingBalances.some((ob) => ob.items.some((i) => i.rawMaterialId === id))
      || physicalCounts.some((pc) => pc.items.some((i) => i.rawMaterialId === id))
      || requisitions.some((rq) => rq.items.some((i) => i.rawMaterialId === id))
      || purchaseOrders.some((po) => po.items.some((i) => i.rawMaterialId === id))
      || supplierReturns.some((sr) => sr.items.some((i) => i.rawMaterialId === id));
    if (inventoryArr.some((i) => i.rawMaterialId === id) || grnNotes.some((g) => g.items.some((i) => i.rawMaterialId === id)) || hasMovement) {
      return { ok: false, error: 'لا يمكن الحذف — توجد حركات مخزون (استلامات، تحويلات، هالك، جرد، فواتير، أوامر شراء/مرتجعات) لهذه المادة. أوقفها بدلاً من ذلك.' };
    }
    leg.tombstoneIds([id]);
    useLegacyCompatStore.setState({ rawMaterials: leg.rawMaterials.filter((m) => m.id !== id) });
    useSettingsStore.setState({ materialBarcodes: useSettingsStore.getState().materialBarcodes.filter((b) => b.rawMaterialId !== id) });
    leg.logAudit('حذف مادة خام', 'المخزون', id);
    return { ok: true };
  }, []);

  const importRawMaterials = useCallback((records: Record<string, unknown>[]): { added: number; updated: number } => {
    const leg = useLegacyCompatStore.getState();
    let added = 0, updated = 0;
    const next = [...leg.rawMaterials];
    records.forEach((rec) => {
      const nameAr = String(rec.nameAr || rec.name || '').trim();
      if (!nameAr) return;
      const code = String(rec.code || '').trim();
      const exists = next.find((m) => m.code === code || m.nameAr === nameAr);
      const base: Omit<RawMaterial, 'id' | 'code'> = {
        nameAr,
        nameEn: String(rec.nameEn || rec.name_en || ''),
        category: (OPTIONAL_CATEGORIES as string[]).includes(rec.category as string) ? rec.category as RawMaterial['category'] : 'dry_goods',
        unit: String(rec.unit || 'كغم'),
        standardPrice: parseNum(rec.standardPrice ?? rec.price ?? rec.cost),
        minStockLevel: parseNum(rec.minStockLevel ?? rec.min_stock),
        maxStockLevel: parseNum(rec.maxStockLevel ?? rec.max_stock) || parseNum(rec.minStockLevel ?? rec.min_stock) * 2,
        yieldPercentage: parseNum(rec.yieldPercentage ?? rec.yield) || 100,
        supplierId: String(rec.supplierId ?? rec.supplier ?? ''),
        storageType: (rec.storageType === 'frozen' || rec.storageType === 'chilled' || rec.storageType === 'dry') ? rec.storageType as RawMaterial['storageType'] : 'dry',
        isActive: !(rec.isActive === false || String(rec.isActive).toLowerCase() === 'false' || String(rec.isActive).toLowerCase() === 'no'),
      };
      if (exists) { Object.assign(exists, base); updated++; }
      else { next.push({ ...base, id: `rm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `RM-${Math.floor(100 + Math.random() * 900)}` }); added++; }
    });
    useLegacyCompatStore.setState({ rawMaterials: next });
    if (added > 0 || updated > 0) refreshRecipesCosts(useProcurementStore.getState().grnNotes, next, [], 'استيراد أصناف من Excel');
    leg.logAudit('استيراد أصناف من Excel', 'المخزون', `${records.length} صف`);
    return { added, updated };
  }, [refreshRecipesCosts]);

  const importSuppliers = useCallback((records: Record<string, unknown>[]): { added: number; updated: number } => {
    let added = 0, updated = 0;
    const proc = useProcurementStore.getState();
    const next = [...proc.suppliers];
    records.forEach((rec) => {
      const name = String(rec.name || rec.nameAr || '').trim();
      if (!name) return;
      const code = String(rec.code || '').trim();
      const exists = next.find((s) => s.code === code || s.name === name);
      const cats = String(rec.categories || '').split(/[,،]/).map((c) => c.trim()).filter(Boolean);
      const base: Omit<Supplier, 'id' | 'code'> = {
        name,
        contactPerson: String(rec.contactPerson || rec.contact || ''),
        phone: String(rec.phone || rec.mobile || ''),
        email: String(rec.email || ''),
        rating: Math.max(1, Math.min(5, Math.round(parseNum(rec.rating) || 3))),
        paymentTermsDays: parseNum(rec.paymentTermsDays ?? rec.payment_terms) || 30,
        categories: (cats as MaterialCategory[]).filter((c) => (OPTIONAL_CATEGORIES as string[]).includes(c)),
        isActive: !(rec.isActive === false || String(rec.isActive).toLowerCase() === 'false'),
        notes: String(rec.notes || ''),
      };
      if (exists) { Object.assign(exists, base); updated++; }
      else { next.push({ ...base, id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `SUP-${Math.floor(100 + Math.random() * 900)}` }); added++; }
    });
    useProcurementStore.setState({ suppliers: next });
    useLegacyCompatStore.getState().logAudit('استيراد موردين من Excel', 'الموردون', `${records.length} صف`);
    return { added, updated };
  }, []);

  const importCustomers = useCallback((records: Record<string, unknown>[]): { added: number; updated: number } => {
    let added = 0, updated = 0;
    const sales = useSalesStore.getState();
    const next = [...sales.customers];
    records.forEach((rec) => {
      const name = String(rec.name || '').trim();
      if (!name) return;
      const code = String(rec.code || '').trim();
      const exists = next.find((c) => c.code === code || (c.name === name && c.phone === String(rec.phone || '')));
      const base: Omit<Customer, 'id' | 'code'> = {
        name,
        phone: String(rec.phone || ''),
        email: String(rec.email || ''),
        type: (rec.type === 'corporate' || rec.type === 'loyalty') ? rec.type as Customer['type'] : 'individual',
        city: String(rec.city || ''),
        branchId: String(rec.branchId || 'b-01'),
        joinDate: String(rec.joinDate || new Date().toISOString().split('T')[0]),
        totalSpent: parseNum(rec.totalSpent ?? rec.spent),
        visits: parseNum(rec.visits),
        lastVisit: String(rec.lastVisit || ''),
        notes: String(rec.notes || ''),
        isVip: rec.isVip === true || String(rec.isVip).toLowerCase() === 'true' || String(rec.isVip).toLowerCase() === 'نعم',
      };
      if (exists) { Object.assign(exists, base); updated++; }
      else { next.push({ ...base, id: `cus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, code: code || `C-${Math.floor(1000 + Math.random() * 9000)}` }); added++; }
    });
    useSalesStore.setState({ customers: next });
    useLegacyCompatStore.getState().logAudit('استيراد عملاء من Excel', 'العملاء', `${records.length} صف`);
    return { added, updated };
  }, []);

  // ---- استلام أوامر الشراء ----
  const receivePurchaseOrder = useCallback((id: string) => {
    const po = useProcurementStore.getState().purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    if (usePeriodStore.getState().isDateClosed(po.orderDate)) { showToast('شهر مقفل — لا يمكن استلام أمر شراء في شهر مغلق'); return; }
    const remaining = po.items.filter((it) => (it.receivedQty || 0) < it.quantity);
    if (remaining.length === 0) { showToast('تم استلام هذا الأمر بالكامل بالفعل'); return; }
    useProcurementStore.setState({
      purchaseOrders: useProcurementStore.getState().purchaseOrders.map((p) => {
        if (p.id !== id) return p;
        return { ...p, status: 'received' as const, items: p.items.map((it) => ({ ...it, receivedQty: it.quantity })) };
      }),
    });
    remaining.forEach((item) => useInventoryStore.getState().adjustInventory(po.branchId, item.rawMaterialId, item.quantity - (item.receivedQty || 0)));
    const total = remaining.reduce((s, i) => s + (i.quantity - (i.receivedQty || 0)) * i.unitPrice, 0);
    if (total > 0) {
      useFinancialStore.getState().postEntry(`استلام أمر شراء ${po.poNumber} - ${getBranchName(po.branchId)}`, [
        { accountId: 'acc-inv', debit: total, credit: 0 },
        { accountId: 'acc-ap', debit: 0, credit: total },
      ], 'auto', po.poNumber);
    }
    useLegacyCompatStore.getState().logAudit('استلام أمر شراء', 'المشتريات', po.poNumber, { type: 'po', id: po.id });
  }, [getBranchName, showToast]);

  const recordPurchaseReceipt = useCallback((id: string, itemsReceived: { rawMaterialId: string; quantity: number }[]) => {
    const po = useProcurementStore.getState().purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    if (usePeriodStore.getState().isDateClosed(po.orderDate)) { showToast('شهر مقفل — لا يمكن تسجيل استلام في شهر مغلق'); return; }
    useProcurementStore.setState({
      purchaseOrders: useProcurementStore.getState().purchaseOrders.map((p) => {
        if (p.id !== id) return p;
        const items = p.items.map((it) => {
          const rec = itemsReceived.find((x) => x.rawMaterialId === it.rawMaterialId);
          return rec ? { ...it, receivedQty: (it.receivedQty || 0) + rec.quantity } : it;
        });
        const allReceived = items.every((it) => (it.receivedQty || 0) >= it.quantity);
        return { ...p, items, status: allReceived ? 'received' as const : 'partially_received' as const };
      }),
    });
    useLegacyCompatStore.getState().logAudit('تسجيل استلام (جزئي/كامل)', 'المشتريات', id, { type: 'po', id });
  }, [showToast]);

  // ---- أذون الصرف الداخلي ----
  const addRequisition = useCallback((data: Omit<DepartmentRequisition, 'id' | 'reqNumber' | 'status' | 'totalQty'>) => {
    if (usePeriodStore.getState().isDateClosed(data.date || new Date().toISOString())) { showToast('شهر مقفل — لا يمكن إنشاء إذن صرف في شهر مغلق'); return; }
    const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
    const leg = useLegacyCompatStore.getState();
    const newReq: DepartmentRequisition = {
      ...data, totalQty, id: `req-${Date.now()}`,
      reqNumber: nextDocSequence('ISSUE', { existing: leg.requisitions.map((r) => r.reqNumber) }),
      status: 'draft',
    };
    useLegacyCompatStore.setState({ requisitions: [newReq, ...leg.requisitions] });
    leg.logAudit('إنشاء إذن صرف داخلي', 'المشتريات', `${newReq.reqNumber} — ${newReq.department}`, { type: 'requisition', id: newReq.id });
  }, [showToast]);

  const submitRequisition = useCallback((id: string) => {
    const leg = useLegacyCompatStore.getState();
    useLegacyCompatStore.setState({ requisitions: leg.requisitions.map((r) => (r.id === id && r.status === 'draft' ? { ...r, status: 'pending' as const } : r)) });
  }, []);

  const approveRequisition = useCallback((id: string) => {
    const leg = useLegacyCompatStore.getState();
    const r0 = leg.requisitions.find((r) => r.id === id);
    if (!r0) return;
    if (usePeriodStore.getState().isDateClosed(r0.date)) { showToast('شهر مقفل — لا يمكن اعتماد إذن صرف في شهر مغلق'); return; }
    const shortage: string[] = [];
    const inventoryArr = useInventoryStore.getState().inventory;
    r0.items.forEach((item) => {
      const available = inventoryArr.filter((i) => i.branchId === r0.branchId && i.rawMaterialId === item.rawMaterialId).reduce((s, i) => s + i.quantity, 0);
      if (available < item.quantity) shortage.push(`${item.itemName} (المتوفر ${available} ${item.unit}، المطلوب ${item.quantity})`);
    });
    if (shortage.length > 0) { showToast(`رصيد غير كافٍ لاعتماد الصرف: ${shortage.join('، ')}`); return; }
    const totalCost = r0.items.reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
    const currentUser = useAuthStore.getState().currentUser;
    useLegacyCompatStore.setState({
      requisitions: leg.requisitions.map((r) => {
        if (r.id !== id) return r;
        if (r.status === 'pending') {
          r.items.forEach((item) => useInventoryStore.getState().adjustInventory(r.branchId, item.rawMaterialId, -item.quantity));
          if (totalCost > 0) {
            useFinancialStore.getState().postEntry(`صرف داخلي ${r.reqNumber} - ${r.department} (${getBranchName(r.branchId)})`, [
              { accountId: 'acc-cogs', debit: totalCost, credit: 0 },
              { accountId: 'acc-inv', debit: 0, credit: totalCost },
            ], 'auto', r.reqNumber);
          }
        }
        return { ...r, status: 'approved' as const, approvedBy: currentUser?.name || 'النظام', approvedAt: new Date().toISOString() };
      }),
    });
    leg.logAudit('اعتماد إذن صرف داخلي', 'المشتريات', `${r0.reqNumber} — ${r0.department} بقيمة ${totalCost.toFixed(2)} ر.س`, { type: 'requisition', id: r0.id });
  }, [getAverageUnitCost, getBranchName, showToast]);

  const rejectRequisition = useCallback((id: string, reason: string) => {
    const leg = useLegacyCompatStore.getState();
    useLegacyCompatStore.setState({ requisitions: leg.requisitions.map((r) => (r.id === id && r.status === 'pending' ? { ...r, status: 'rejected' as const, rejectReason: reason } : r)) });
  }, []);

  const cancelRequisition = useCallback((id: string) => {
    const leg = useLegacyCompatStore.getState();
    useLegacyCompatStore.setState({ requisitions: leg.requisitions.map((r) => (r.id === id && (r.status === 'draft' || r.status === 'pending') ? { ...r, status: 'cancelled' as const } : r)) });
  }, []);

  const deleteRequisition = useCallback((id: string) => {
    const leg = useLegacyCompatStore.getState();
    const r0 = leg.requisitions.find((r) => r.id === id);
    if (r0 && r0.status === 'approved') { showToast('لا يمكن حذف إذن صرف معتمد'); return; }
    useLegacyCompatStore.setState({ requisitions: leg.requisitions.filter((r) => r.id !== id) });
  }, [showToast]);

  // ---- هالك ----
  const addWastageLog = useCallback((data: Omit<WastageLog, 'id' | 'date'>) => {
    if (usePeriodStore.getState().isDateClosed(today())) { showToast('شهر مقفل — لا يمكن تسجيل هالك في شهر مغلق'); return; }
    const leg = useLegacyCompatStore.getState();
    const newLog: WastageLog = { ...data, id: `wst-${Date.now()}`, date: today() };
    useLegacyCompatStore.setState({ wastageLogs: [newLog, ...leg.wastageLogs] });
    if (newLog.rawMaterialId) useInventoryStore.getState().adjustInventory(newLog.branchId, newLog.rawMaterialId, -newLog.quantity, undefined, { type: 'هدر', ref: newLog.itemName });
    leg.logAudit('تسجيل هالك', 'الهالك', newLog.itemName);
  }, [showToast]);

  // ---- تصنيع (تشغيل وصفة أساسية) ----
  const manufactureRecipe = useCallback((data: { branchId: string; recipeId: string; batchSize: number; producedBy: string }): { ok: boolean; error?: string } => {
    if (usePeriodStore.getState().isDateClosed(today())) { showToast('شهر مقفل — لا يمكن التصنيع'); return { ok: false, error: 'شهر مغلق — لا يمكن التصنيع' }; }
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const recipes = useProductionStore.getState().recipes;
    const recipe = recipes.find((r) => r.id === data.recipeId);
    if (!recipe) return { ok: false, error: 'الوصفة غير موجودة' };
    if (data.batchSize <= 0) return { ok: false, error: 'أدخل عدد الدفعات' };
    const inventoryArr = useInventoryStore.getState().inventory;
    const items: ProductionRunItem[] = recipe.ingredients.map((ing) => {
      const availableQty = inventoryArr.find((i) => i.branchId === data.branchId && i.rawMaterialId === ing.rawMaterialId)?.quantity || 0;
      return {
        rawMaterialId: ing.rawMaterialId,
        materialName: getRawMaterialName(ing.rawMaterialId),
        unit: rawMaterials.find((m) => m.id === ing.rawMaterialId)?.unit || '',
        requiredQty: recipeStockQty(rawMaterials, ing.rawMaterialId, ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * data.batchSize),
        availableQty,
        unitCost: getAverageUnitCost(ing.rawMaterialId),
      };
    });
    const short = items.find((i) => i.requiredQty > i.availableQty + 0.0001);
    if (short) return { ok: false, error: `رصيد غير كافٍ لـ ${short.materialName}` };
    items.forEach((i) => useInventoryStore.getState().adjustInventory(data.branchId, i.rawMaterialId, -i.requiredQty, undefined, { type: 'تصنيع' }));
    useInventoryStore.getState().adjustRecipeInventory(data.branchId, recipe.id, data.batchSize);
    const totalCost = items.reduce((s, i) => s + i.requiredQty * i.unitCost, 0);
    const run: ProductionRun = {
      id: `pr-${Date.now()}`,
      branchId: data.branchId,
      recipeId: recipe.id,
      recipeCode: recipe.code,
      recipeName: recipe.nameAr,
      batchSize: data.batchSize,
      producedQty: data.batchSize,
      unit: recipe.portionSize || 'وحدة',
      producedBy: data.producedBy || 'المستخدم',
      date: today(),
      items,
      totalCost,
      status: 'completed',
    };
    useProductionStore.setState({ productionRuns: [run, ...useProductionStore.getState().productionRuns] });
    useLegacyCompatStore.getState().logAudit('تصنيع صف أساسي', 'الجزاطات', `${recipe.nameAr} - ${data.batchSize} ${recipe.portionSize || 'وحدة'} بقيمة ${totalCost.toFixed(2)}`);
    return { ok: true };
  }, [getAverageUnitCost, getRawMaterialName, showToast]);

  // ---- ترحيل اختبار الجزارة (تحديث سعر المعطاة) ----
  const postButcherTest = useCallback((id: string): { ok: boolean; error?: string } => {
    const prod = useProductionStore.getState();
    const test = prod.butcherTests.find((t) => t.id === id);
    if (!test) return { ok: false, error: 'الاختبار غير موجود' };
    if (test.posted) return { ok: false, error: 'تم ترحيل الاختبار مسبقاً' };
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const material = rawMaterials.find((m) => m.id === test.rawMaterialId);
    if (!material) return { ok: false, error: 'مادة خام غير موجودة' };
    const newPrice = Number(test.costPerUsableKg.toFixed(2));
    updateRawMaterial(test.rawMaterialId, { standardPrice: newPrice });
    useProductionStore.setState({ butcherTests: prod.butcherTests.map((t) => (t.id === id ? { ...t, posted: true } : t)) });
    useLegacyCompatStore.getState().logAudit('ترحيل اختبار جزارة', 'المخزون', `${test.rawMaterialName}: السعر الجديد ${fmtMoney(newPrice)}/كغم`);
    showToast(`تم تحديث سعر ${material.nameAr} إلى ${fmtMoney(newPrice)}/كغم`);
    return { ok: true };
  }, [updateRawMaterial, showToast]);

  // ---- هامش الربح المستهدف للوصفة ----
  const updateRecipeTargetMargin = useCallback((recipeId: string, targetMarginPercent: number) => {
    useProductionStore.setState({
      recipes: useProductionStore.getState().recipes.map((r) => (r.id === recipeId ? { ...r, targetMarginPercent, targetFoodCostPercent: 100 - targetMarginPercent } : r)),
    });
  }, []);

  // ---- فحص النظام ----
  const runSystemCheck = useCallback((ctx?: {
    recipes?: StandardRecipe[];
    inventory?: InventoryRecord[];
    grnNotes?: GoodsReceiptNote[];
    purchaseOrders?: PurchaseOrder[];
    posOrders?: POSOrder[];
    stockTransfers?: StockTransfer[];
    foodMenus?: FoodMenu[];
  }): SystemCheckResult[] => {
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const recipes = ctx?.recipes ?? useProductionStore.getState().recipes;
    const inventoryArr = ctx?.inventory ?? useInventoryStore.getState().inventory;
    const grnNotes = ctx?.grnNotes ?? useProcurementStore.getState().grnNotes;
    const purchaseOrders = ctx?.purchaseOrders ?? useProcurementStore.getState().purchaseOrders;
    const posOrders = ctx?.posOrders ?? useSalesStore.getState().posOrders;
    const stockTransfers = ctx?.stockTransfers ?? useInventoryStore.getState().stockTransfers;
    const foodMenus = ctx?.foodMenus ?? useProductionStore.getState().foodMenus;
    const branches = useSettingsStore.getState().branches;
    const customers = useSalesStore.getState().customers;
    const suppliers = useProcurementStore.getState().suppliers;
    const workOrders = useProductionStore.getState().workOrders;
    const invoices = useSalesStore.getState().invoices;
    const reservations = useSalesStore.getState().reservations;
    const users = useAuthStore.getState().users;
    const journalEntries = useFinancialStore.getState().journalEntries;
    const currencies = useSettingsStore.getState().currencies;
    const recipeInventory = useInventoryStore.getState().recipeInventory;
    const leg = useLegacyCompatStore.getState();

    const res: SystemCheckResult[] = [];
    const ok = (id: string, label: string, detail: string) => res.push({ id, label, status: 'ok', detail });
    const warn = (id: string, label: string, detail: string) => res.push({ id, label, status: 'warn', detail });
    const fail = (id: string, label: string, detail: string) => res.push({ id, label, status: 'fail', detail });
    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));
    const branchIds = new Set(branches.map((b) => b.id));
    const custIds = new Set(customers.map((c) => c.id));
    const supIds = new Set(suppliers.map((s) => s.id));

    let orphanIng = 0;
    recipes.forEach((r) => r.ingredients.forEach((ing) => { if (!matIds.has(ing.rawMaterialId)) orphanIng++; }));
    orphanIng > 0 ? fail('ing', 'الوصفات ← المواد الخام', `${orphanIng} مكوّناً يشر إلى خامة غير موجودة`) : ok('ing', 'الوصفات ← المواد الخام', `${recipes.length} وصفة بمراجع سليمة`);

    const orphanInv = inventoryArr.filter((i) => !matIds.has(i.rawMaterialId));
    orphanInv.length > 0 ? fail('inv', 'سجلات المخزون', `${orphanInv.length} سجلاً بخامة غير موجودة`) : ok('inv', 'سجلات المخزون', `${inventoryArr.length} سجلاً سليماً`);

    const orphanGrn = grnNotes.filter((g) => g.items.some((i) => !matIds.has(i.rawMaterialId))).length;
    orphanGrn > 0 ? warn('grn', 'حوالات الاستلام (GRN)', `${orphanGrn} حوالة فيها أصناف مكسورة`) : ok('grn', 'حوالات الاستلام (GRN)', `${grnNotes.length} حوالة سليمة`);

    const orphanPo = purchaseOrders.filter((p) => p.items.some((i) => !matIds.has(i.rawMaterialId)) || (p.supplierId ? !supIds.has(p.supplierId) : false)).length;
    orphanPo > 0 ? warn('po', 'أوامر الشراء', `${orphanPo} أمراً بمرجع مكسور`) : ok('po', 'أوامر الشراء', `${purchaseOrders.length} أمراً سليماً`);

    const orphanPos = posOrders.filter((o) => o.items.some((i) => !recipeIds.has(i.recipeId))).length;
    orphanPos > 0 ? warn('pos', 'أوامر نقطة البيع', `${orphanPos} أمراً فيه أصناف مكسورة`) : ok('pos', 'أوامر نقطة البيع', `${posOrders.length} أمراً سليماً`);

    const orphanTrf = stockTransfers.filter((t) => t.items.some((i) => (i.itemType === 'recipe' ? !recipeIds.has(i.recipeId!) : (i.rawMaterialId ? !matIds.has(i.rawMaterialId) : true)))).length;
    orphanTrf > 0 ? warn('trf', 'تحويلات المخزون', `${orphanTrf} تحويلاً بمرجع مكسور`) : ok('trf', 'تحويلات المخزون', `${stockTransfers.length} تحويلاً سليماً`);

    const orphanWo = workOrders.filter((w) => !recipeIds.has(w.recipeId)).length;
    orphanWo > 0 ? warn('wo', 'أوامر التصنيع', `${orphanWo} أمراً لوصفة غير موجودة`) : ok('wo', 'أوامر التصنيع', `${workOrders.length} أمراً سليماً`);

    const orphanMenu = foodMenus.filter((m) => m.items.some((i) => !recipeIds.has(i.recipeId))).length;
    orphanMenu > 0 ? warn('menu', 'قوائم الطعام', `${orphanMenu} قائمة فيها أصناف مكسورة`) : ok('menu', 'قوائم الطعام', `${foodMenus.length} قائمة سليمة`);

    const badInv = invoices.filter((i) => (i.type === 'sales' ? !custIds.has(i.partyId) : !supIds.has(i.partyId))).length;
    badInv > 0 ? warn('inv9', 'الفواتير', `${badInv} فاتورة بمرجع عميل/مورد مكسور`) : ok('inv9', 'الفواتير', `${invoices.length} فاتورة سليمة`);

    const badRes = reservations.filter((r) => (r.customerId ? !custIds.has(r.customerId) : false) || (r.branchId ? !branchIds.has(r.branchId) : false)).length;
    badRes > 0 ? warn('res', 'الحجوزات', `${badRes} حجزاً بمرجع مكسور`) : ok('res', 'الحجوزات', `${reservations.length} حجزاً سليماً`);

    const badUser = users.filter((u) => u.branchId !== 'all' && !branchIds.has(u.branchId)).length;
    badUser > 0 ? warn('user', 'المستخدمون ← الفروع', `${badUser} مستخدماً بفرع غير موجود`) : ok('user', 'المستخدمون ← الفروع', `${users.length} مستخدماً سليماً`);

    const unbalanced = journalEntries.filter((j) => Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) > 0.01).length;
    unbalanced > 0 ? fail('jrn', 'توازن القيود المحاسبية', `${unbalanced} قيداً غير متوازن`) : ok('jrn', 'توازن القيود المحاسبية', `${journalEntries.length} قيداً متوازناً`);

    const overPaid = invoices.filter((i) => i.paidAmount > i.totalAmount).length;
    overPaid > 0 ? warn('pay', 'التحصيلات والمدفوعات', `${overPaid} فاتورة مدفوعة بأكثر من قيمتها`) : ok('pay', 'التحصيلات والمدفوعات', 'المدفوعات ضمن حدود الفواتير');

    const posBad = posOrders.filter((o) => {
      const subtotal = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const vat = leg.vatInclusive ? 0 : Number(((subtotal * leg.vatPercent) / 100).toFixed(2));
      return Math.abs(o.totalAmount - (subtotal + vat)) > 0.5;
    }).length;
    posBad > 0 ? warn('poscalc', 'حساب فاتورة نقطة البيع', `${posBad} أمراً لا يطابق مجموع أصنافه`) : ok('poscalc', 'حساب فاتورة نقطة البيع', 'جميع الأوامر محسوبة بشكل صحيح');

    const negStock = inventoryArr.filter((i) => i.quantity < 0).length;
    negStock > 0 ? fail('neg', 'أرصدة المخزون السالبة', `${negStock} رصيداً سالباً`) : ok('neg', 'أرصدة المخزون السالبة', 'لا توجد أرصدة سالبة');

    const negRecipeStock = recipeInventory.filter((r) => r.quantity < 0).length;
    negRecipeStock > 0 ? warn('negr', 'مخزون الأصناف المصنّعة', `${negRecipeStock} رصيداً سالباً`) : ok('negr', 'مخزون الأصناف المصنّعة', 'لا توجد أرصدة سالبة');

    let badCost = 0;
    recipes.forEach((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      if (!isFinite(c.foodCost) || c.foodCost < 0) badCost++;
    });
    badCost > 0 ? fail('cost', 'محرك حساب التكاليف', `${badCost} وصفة بتكلفة غير صحيحة`) : ok('cost', 'محرك حساب التكاليف', 'يعمل على جميع الوصفات بدون أخطاء');

    const badCur = currencies.filter((c) => getCurrencyRateSel(currencies, c.code) <= 0).length;
    badCur > 0 ? warn('cur', 'أسعار الصرف', `${badCur} عملة بسعر صرف غير صالح`) : ok('cur', 'أسعار الصرف', `${currencies.length} عملة بسعر سليم`);

    const roles = [...new Set(users.map((u) => u.role))];
    const missingPerm = roles.filter((r) => !(ROLE_PERMISSIONS as Record<string, string[]>)[r]);
    missingPerm.length > 0 ? fail('perm', 'خريطة الصلاحيات', `${missingPerm.join('، ')} غير معرّف`) : ok('perm', 'خريطة الصلاحيات', `${roles.length} دوراً معرّفاً`);

    let plOk = true;
    try {
      useFinancialStore.getState().rebuildPLSummaries(undefined);
    } catch { plOk = false; }
    plOk ? ok('pl', 'محرك قائمة الدخل الموحدة', 'يعيد بناء توقيع-الربح لجميع الفروع بنجاح') : fail('pl', 'محرك قائمة الدخل الموحدة', 'حدث خطأ أثناء إعادة بناء البنية');

    return res;
  }, [calculateRecipeCosts]);

  // ---- صحة البيانات ----
  const dataHealth = useMemo<DataHealthScore>(() => {
    const rawMaterials = legacy.rawMaterials;
    const recipes = production.recipes;
    const suppliers = procurement.suppliers;
    const usersArr = auth.users;
    const journalEntries = financial.journalEntries;
    const inventoryArr = inventory.inventory;
    const recipeInventory = inventory.recipeInventory;

    const pct = (okCount: number, total: number) => (total > 0 ? Number(((okCount / total) * 100).toFixed(0)) : 100);
    const activeMats = rawMaterials.filter((m) => m.isActive);
    const matsWithCost = activeMats.filter((m) => getAverageUnitCost(m.id) > 0).length;
    const partMats = { label: 'المواد الخام (سعر تكلفة)', pct: pct(matsWithCost, activeMats.length), detail: `${matsWithCost.toLocaleString('en')} / ${activeMats.length.toLocaleString('en')} صنفاً له سعر تكلفة` };

    const activeRecipes = recipes.filter((r) => r.isActive);
    const completeRecipes = activeRecipes.filter((r) => (r.ingredients?.length || 0) > 0 && (r.actualMenuPrice > 0 || (r.suggestedPrice || 0) > 0)).length;
    const partRecipes = { label: 'الوصفات (مكونات + سعر)', pct: pct(completeRecipes, activeRecipes.length), detail: `${completeRecipes.toLocaleString('en')} / ${activeRecipes.length.toLocaleString('en')} وصفة بمقادير وسعر بيع` };

    const activeSuppliers = suppliers.filter((s) => s.isActive);
    const suppliersWithContact = activeSuppliers.filter((s) => !!(s.phone || s.email || s.contactPerson)).length;
    const partSuppliers = { label: 'الموردون (بيانات التواصل)', pct: pct(suppliersWithContact, activeSuppliers.length), detail: `${suppliersWithContact.toLocaleString('en')} / ${activeSuppliers.length.toLocaleString('en')} مورداً بمعلومات تواصل` };

    const roleMap = ROLE_PERMISSIONS as Record<string, string[]>;
    const activeUsers = usersArr.filter((u) => u.isActive);
    const readyUsers = activeUsers.filter((u) => !!roleMap[u.role] || !!u.roleId).length;
    const partUsers = { label: 'المستخدمون (أدوار/صلاحيات)', pct: pct(readyUsers, activeUsers.length), detail: `${readyUsers.toLocaleString('en')} / ${activeUsers.length.toLocaleString('en')} مستخدماً نشطاً بدور محدد` };

    const balancedEntries = journalEntries.filter((j) => Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) <= 0.01).length;
    const partLedger = { label: 'القيود المحاسبية (توازن)', pct: pct(balancedEntries, journalEntries.length), detail: `${balancedEntries.toLocaleString('en')} / ${journalEntries.length.toLocaleString('en')} قيداً متوازناً` };

    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));
    const invBroken = inventoryArr.filter((i) => !matIds.has(i.rawMaterialId)).length;
    const recBroken = recipes.filter((r) => r.ingredients.some((ing) => !matIds.has(ing.rawMaterialId))).length + recipeInventory.filter((r) => !recipeIds.has(r.recipeId)).length;
    const refTotal = inventoryArr.length + recipes.length + recipeInventory.length;
    const refOk = refTotal - invBroken - recBroken;
    const partRefs = { label: 'المراجع التكاملية (لا يتام)', pct: pct(refOk, refTotal), detail: invBroken || recBroken ? `${invBroken + recBroken} مرجعاً مكسوراً` : `لا توجد مراجع مكسورة في ${refTotal.toLocaleString('en')} سجل` };

    const parts = [partMats, partRecipes, partSuppliers, partUsers, partLedger, partRefs];
    const score = Math.round(parts.reduce((s, p) => s + p.pct, 0) / parts.length);
    const grade: DataHealthScore['grade'] = score >= 90 ? 'excellent' : score >= 70 ? 'good' : 'attention';
    return { score, grade, parts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy.rawMaterials, production.recipes, procurement.suppliers, auth.users, financial.journalEntries, inventory.inventory, inventory.recipeInventory, getAverageUnitCost]);

  // ---- إعادة بناء النظام ----
  const rebuildSystem = useCallback((): SystemRebuildResult => {
    const fixes: string[] = [];
    const recalcs: string[] = [];
    const issues: string[] = [];
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const recipes = useProductionStore.getState().recipes;
    const matIds = new Set(rawMaterials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));

    let removedInv = 0;
    const healedInv = useInventoryStore.getState().inventory.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedInv++; return false; } return true; });
    useInventoryStore.setState({ inventory: healedInv });
    if (removedInv > 0) fixes.push(`حُذف ${removedInv} سجل مخزون بخامة غير موجودة`);

    let removedGrn = 0;
    const healedGrn = useProcurementStore.getState().grnNotes.map((g) => ({ ...g, items: g.items.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedGrn++; return false; } return true; }) })).filter((g) => g.items.length > 0);
    useProcurementStore.setState({ grnNotes: healedGrn });
    if (removedGrn > 0) fixes.push(`أُزيل ${removedGrn} سطراً مكسوراً من حوالات الاستلام`);

    let removedPo = 0;
    const healedPo = useProcurementStore.getState().purchaseOrders.map((p) => ({ ...p, items: p.items.filter((i) => { if (!matIds.has(i.rawMaterialId)) { removedPo++; return false; } return true; }) })).filter((p) => p.items.length > 0);
    useProcurementStore.setState({ purchaseOrders: healedPo });
    if (removedPo > 0) fixes.push(`أُزيل ${removedPo} سطراً مكسوراً من أوامر الشراء`);

    let removedPos = 0;
    const healedPos = useSalesStore.getState().posOrders.map((o) => ({ ...o, items: o.items.filter((i) => { if (!recipeIds.has(i.recipeId)) { removedPos++; return false; } return true; }) })).filter((o) => o.items.length > 0);
    useSalesStore.setState({ posOrders: healedPos });
    if (removedPos > 0) fixes.push(`أُزيل ${removedPos} صنفاً مكسوراً من أوامر نقطة البيع`);

    let removedTrf = 0;
    const healedTrf = useInventoryStore.getState().stockTransfers.map((t) => ({ ...t, items: t.items.filter((i) => { const bad = i.itemType === 'recipe' ? !recipeIds.has(i.recipeId!) : (i.rawMaterialId ? !matIds.has(i.rawMaterialId) : true); if (bad) removedTrf++; return !bad; }) })).filter((t) => t.items.length > 0);
    useInventoryStore.setState({ stockTransfers: healedTrf });
    if (removedTrf > 0) fixes.push(`أُزيل ${removedTrf} سطراً مكسوراً من تحويلات المخزون`);

    let removedIng = 0;
    let recalcCount = 0;
    const healedRecipes = recipes.map((r) => {
      const ingredients = r.ingredients.filter((ing) => { if (!matIds.has(ing.rawMaterialId)) { removedIng++; return false; } return true; });
      const c = calculateRecipeCosts(ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      if (isFinite(c.foodCost)) {
        recalcCount++;
        const oldCost = Number(r.totalCalculatedCost ?? 0);
        if (Math.abs(c.totalCost - oldCost) < 0.005) return { ...r, ingredients, totalCalculatedCost: c.totalCost, suggestedPrice: c.suggestedPrice };
        const entry: RecipeCostHistoryEntry = {
          id: `rch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          oldTotalCost: oldCost,
          newTotalCost: c.totalCost,
          oldSuggestedPrice: Number(r.suggestedPrice ?? 0),
          newSuggestedPrice: c.suggestedPrice,
          reason: 'تصحيح النظام — إعادة حساب',
        };
        return { ...r, ingredients, totalCalculatedCost: c.totalCost, suggestedPrice: c.suggestedPrice, costHistory: [...(r.costHistory || []), entry] };
      }
      return { ...r, ingredients };
    });
    useProductionStore.setState({ recipes: healedRecipes });
    if (removedIng > 0) fixes.push(`أُزيل ${removedIng} مكوّناً مكسوراً من الوصفات`);
    recalcs.push(`أُعيد حساب تكاليف ${recalcCount} وصفة (خامات + تشغيل + سعر مقترح)`);

    let removedMenu = 0;
    const healedMenu = useProductionStore.getState().foodMenus.map((m) => ({ ...m, items: m.items.filter((i) => { if (!recipeIds.has(i.recipeId)) { removedMenu++; return false; } return true; }) }));
    useProductionStore.setState({ foodMenus: healedMenu });
    if (removedMenu > 0) fixes.push(`أُزيل ${removedMenu} صنفاً مكسوراً من قوائم الطعام`);

    let clampedNeg = 0;
    const clampedInv = healedInv.map((i) => { if (i.quantity < 0) { clampedNeg++; return { ...i, quantity: 0 }; } return i; });
    if (clampedNeg > 0) { useInventoryStore.setState({ inventory: clampedInv }); fixes.push(`صُفّر ${clampedNeg} رصيد مخزون سالباً`); }

    useFinancialStore.getState().rebuildPLSummaries(undefined);
    recalcs.push('أُعيد بناء بنية قائمة الدخل الموحدة لجميع الفروع وضُبط سجل تدقيق');

    recalcs.push(`أُعيد التحقق من متوسط تكلفة ${rawMaterials.length} خامة وارتباطها بالأسعار المعيارية`);

    const checks = runSystemCheck({
      recipes: healedRecipes,
      inventory: clampedNeg > 0 ? clampedInv : healedInv,
      grnNotes: healedGrn,
      purchaseOrders: healedPo,
      posOrders: healedPos,
      stockTransfers: healedTrf,
      foodMenus: healedMenu,
    });
    const fails = checks.filter((c) => c.status === 'fail');
    const warns = checks.filter((c) => c.status === 'warn');
    if (fails.length === 0) recalcs.push(`نجح فحص التكامل الشامل: ${checks.length} فحصاً، ${warns.length} ملاحظة تستحق الانتباه`);
    else issues.push(`${fails.length} فحصاً فاشلاً بعد الهيكلة: ${fails.map((f) => f.label).join('، ')}`);

    useLegacyCompatStore.getState().logAudit('إعادة هيكلة النظام', 'النظام', `تصحيحات ${fixes.length}، إعادة حساب ${recalcCount} وصفة، فحوصات ${checks.length}`);
    return { fixes, recalcs, issues };
  }, [calculateRecipeCosts, runSystemCheck]);

  // ---- الأتمتة ----
  const runAutomation = useCallback((): { ok: boolean; message: string } => {
    const results: string[] = [];
    const leg = useLegacyCompatStore.getState();
    const automationRules = useSettingsStore.getState().automationRules;
    const enabledKeys = automationRules.filter((r) => r.enabled).map((r) => r.key);
    const visibleBranchIds = visibleBranchIdsFor(useAuthStore.getState().currentUser, useSettingsStore.getState().branches);
    const rawMaterials = leg.rawMaterials;
    const inventoryArr = useInventoryStore.getState().inventory;
    const purchaseOrders = useProcurementStore.getState().purchaseOrders;
    const requisitions = leg.requisitions;
    const suppliers = useProcurementStore.getState().suppliers;
    const grnNotes = useProcurementStore.getState().grnNotes;
    const recipes = useProductionStore.getState().recipes;
    const getStockLevelsFor = useInventoryStore.getState().getStockLevelsFor;

    if (enabledKeys.includes('auto_po')) {
      const openKey = (bid: string, rid: string) => `${bid}|${rid}`;
      const openBy: Record<string, number> = {};
      purchaseOrders
        .filter((p) => ['submitted', 'approved', 'partially_received'].includes(p.status))
        .forEach((p) => p.items.forEach((it) => {
          const k = openKey(p.branchId, it.rawMaterialId);
          openBy[k] = (openBy[k] || 0) + (it.quantity || 0);
        }));
      const reqQty: Record<string, number> = {};
      requisitions
        .filter((r) => r.status === 'pending')
        .forEach((r) => r.items.forEach((it) => {
          const k = openKey(r.branchId, it.rawMaterialId);
          reqQty[k] = (reqQty[k] || 0) + (it.quantity || 0);
        }));
      const alreadyDrafted = (bid: string, rid: string) =>
        purchaseOrders.some((p) => p.status === 'draft' && p.branchId === bid && p.items.some((it) => it.rawMaterialId === rid));

      const poGroups: Record<string, {
        branchId: string;
        supplierId: string;
        supplierName: string;
        items: { rawMaterialId: string; materialName: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; purchaseUnit?: string; purchaseUnitConversion?: number; purchaseQty?: number }[];
      }> = {};
      inventoryArr.forEach((i) => {
        if (!visibleBranchIds.includes(i.branchId)) return;
        const bid = i.branchId;
        const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
        if (!mat || !mat.isActive) return;
        if ((mat.minStockLevel || 0) <= 0 && (mat.maxStockLevel || 0) <= 0) return;
        if (alreadyDrafted(bid, mat.id)) return;
        const lim = getStockLevelsFor(mat.id, bid);
        const max = lim.maxStockLevel;
        if (max <= 0) return;
        const min = lim.minStockLevel;
        const always = lim.alwaysOrderFullMax;
        const k = openKey(bid, mat.id);
        const stock = i.quantity;
        const onOrder = openBy[k] || 0;
        const reqs = reqQty[k] || 0;
        const available = stock + onOrder;
        const belowMin = always || available <= min;
        const needReorder = always ? Math.max(0, max - onOrder) : Math.max(0, max - available);
        const needReqs = Math.max(0, reqs - onOrder);
        const need = Math.max(belowMin ? needReorder : 0, needReqs);
        if (need <= 0) return;
        const conv = stockPerPurchase(mat);
        const quantity = conv > 0 ? Math.ceil(need / conv) * conv : Math.ceil(need);
        if (quantity <= 0) return;
        const cheapest = lowestPrice30Days(grnNotes, mat);
        const unitPrice = cheapest && cheapest.pricePU != null
          ? cheapest.pricePU / (conv > 0 ? conv : 1)
          : getBranchAverageUnitCost(bid, mat.id);
        const supplierId = lastSupplierIdFor(grnNotes, mat.id, mat.supplierId || '');
        const supplier = suppliers.find((s) => s.id === supplierId);
        const gKey = `${bid}__${supplierId}`;
        poGroups[gKey] = poGroups[gKey] || { branchId: bid, supplierId, supplierName: supplier ? supplier.name : (supplierId ? '' : 'بدون مورد'), items: [] };
        poGroups[gKey].items.push({
          rawMaterialId: mat.id,
          materialName: mat.nameAr,
          quantity: Math.round(quantity * 100) / 100,
          unit: mat.unit,
          unitPrice: Math.round(unitPrice * 100) / 100,
          lineTotal: Math.round(quantity * unitPrice * 100) / 100,
          purchaseUnit: mat.purchaseUnit || mat.unit,
          purchaseUnitConversion: conv,
          purchaseQty: conv > 0 ? Math.round((quantity / conv) * 100) / 100 : quantity,
        });
      });

      let poCount = 0;
      let skippedNoSupplier = 0;
      Object.values(poGroups).forEach((grp) => {
        if (grp.items.length === 0) return;
        if (!grp.supplierId) { skippedNoSupplier += grp.items.length; return; }
        useProcurementStore.getState().addPurchaseOrder({
          supplierId: grp.supplierId,
          supplierName: grp.supplierName,
          branchId: grp.branchId,
          orderDate: today(),
          expectedDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
          status: 'draft',
          poType: 'regular',
          items: grp.items,
          totalAmount: Math.round(grp.items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100,
          requestedBy: 'أتمتة - النظام',
          notes: `توليد تلقائي من حدود المخزون والطلبات المعلّقة — فرع ${getBranchName(grp.branchId)} (مسودة للمراجعة)`,
        });
        poCount++;
      });
      const extra = skippedNoSupplier > 0 ? ` (تخطّى ${skippedNoSupplier} صنف بدون مورد)` : '';
      results.push(poCount > 0 ? `أُنشئ ${poCount} مسودة أمر شراء${extra}` : `لا توجد أصناف تحتاج شراء${extra}`);
    }

    if (enabledKeys.includes('auto_workorder')) {
      const prepRecipes = recipes.filter((r) => r.isCentralKitchenPrep || r.category === 'sub_prep');
      const minStock = 50;
      let woCount = 0;
      prepRecipes.forEach((r) => {
        const stock = useInventoryStore.getState().getRecipeStock('b-ck', r.id);
        if (stock >= minStock) return;
        const qty = Math.max((minStock * 2) - stock, minStock);
        useProductionStore.getState().addWorkOrder({
          recipeId: r.id,
          recipeName: r.nameAr,
          centralKitchenId: 'b-ck',
          targetBranchId: 'b-ck',
          targetQuantity: Math.round(qty),
          prepChef: 'الشيف - أتمتة',
          producedQuantity: 0,
        });
        woCount++;
      });
      results.push(woCount > 0 ? `أُنشئ ${woCount} أمر تصنيع تلقائي` : 'الأصناف المصنّعة ضمن الحدود');
    }

    return { ok: true, message: results.join(' · ') || 'لا توجد قواعد أتمتة مفعّلة' };
  }, [getBranchAverageUnitCost, getBranchName]);

  // ---- الإشعارات ----
  const getNotifications = useCallback((): SystemNotification[] => {
    const notes: SystemNotification[] = [];
    const scope = visibleBranchIdsFor(useAuthStore.getState().currentUser, useSettingsStore.getState().branches);
    const rawMaterials = useLegacyCompatStore.getState().rawMaterials;
    const inventoryArr = useInventoryStore.getState().inventory;
    const branches = useSettingsStore.getState().branches;
    const automationRules = useSettingsStore.getState().automationRules;
    const invoices = useSalesStore.getState().invoices;
    const operatingExpenses = useFinancialStore.getState().operatingExpenses;
    const tasks = useHRStore.getState().tasks;
    const scheduledReports = useSettingsStore.getState().scheduledReports;
    const currentUser = useAuthStore.getState().currentUser;
    const getStockLevelsFor = useInventoryStore.getState().getStockLevelsFor;

    const daysToExpiry = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
    const matName = (id: string) => rawMaterials.find((m) => m.id === id)?.nameAr || id;
    const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;

    inventoryArr.filter((i) => scope.includes(i.branchId)).forEach((i) => {
      const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
      if (!mat || !mat.isActive) return;
      const lv = getStockLevelsFor(mat.id, i.branchId);
      const belowMin = lv.minStockLevel > 0 && i.quantity <= lv.minStockLevel;
      if (!lv.alwaysOrderFullMax && !belowMin) return;
      const suggested = lv.alwaysOrderFullMax ? Math.max(0, lv.maxStockLevel) : Math.max(0, lv.maxStockLevel - i.quantity);
      notes.push({
        id: `ls-${i.id}`, type: 'low_stock',
        severity: belowMin ? 'critical' : 'warning',
        title: lv.alwaysOrderFullMax && !belowMin ? `طلب دوري كامل: ${mat.nameAr}` : `نقص مخزون: ${mat.nameAr}`,
        description: `${branchName(i.branchId)} — الرصيد ${i.quantity} ${mat.unit}، الحد الأدنى ${lv.minStockLevel}، المقدار المقترح طلبه ${suggested} ${mat.unit}${lv.isOverride ? ' (حدود فرع مخصصة)' : ''}`,
        tab: 'low_stock_alerts',
      });
    });

    const expiryRule = automationRules.find((r) => r.key === 'expiry_alert');
    const expiryDays = expiryRule?.enabled ? (expiryRule.config?.daysBefore ?? 14) : 14;
    inventoryArr.filter((i) => scope.includes(i.branchId) && i.expiryDate).forEach((i) => {
      const rem = daysToExpiry(i.expiryDate!);
      if (rem <= expiryDays) {
        notes.push({
          id: `ex-${i.id}`, type: 'expiry',
          severity: rem <= 7 ? 'critical' : 'warning',
          title: `${rem <= 0 ? 'انتهت صلاحية' : 'اقتراب انتهاء الصلاحية'}: ${matName(i.rawMaterialId)}`,
          description: `${branchName(i.branchId)} — ${rem <= 0 ? 'منتهي منذ' : 'متبقٍ'} ${Math.abs(rem)} يوم (${i.expiryDate})، الكمية ${i.quantity}`,
          tab: 'inventory',
        });
      }
    });

    invoices.filter((inv) => inv.type === 'sales' && inv.status === 'overdue').forEach((inv) => {
      notes.push({ id: `ov-${inv.id}`, type: 'overdue_invoice', severity: 'critical', title: `فاتورة متأخرة: ${inv.partyName}`, description: `${inv.invoiceNumber} — متبقٍّ ${(inv.totalAmount - inv.paidAmount).toFixed(2)} ر.س`, tab: 'cash_flow' });
    });

    operatingExpenses.filter((e) => e.paymentStatus === 'overdue').forEach((e) => {
      notes.push({ id: `ed-${e.id}`, type: 'expense_due', severity: 'warning', title: `مصروف متأخر: ${e.description}`, description: `${branchName(e.branchId)} — ${e.amount.toFixed(2)} ر.س (${e.dueDate})`, tab: 'cash_flow' });
    });

    getFoodCostAlerts().filter((a) => !a.isAcknowledged && a.severity === 'critical').forEach((a) => {
      notes.push({ id: `ca-${a.recipeId}`, type: 'cost_alert', severity: 'critical', title: `انحراف تكلفة حاد: ${a.recipeNameAr}`, description: `Food Cost ${a.actualFoodCostPercent.toFixed(1)}% مقابل هدف ${a.targetFoodCostPercent.toFixed(1)}%`, tab: 'recipes' });
    });

    const myId = currentUser?.id;
    const myName = currentUser?.name;
    tasks.filter((t) => t.status === 'open' && (t.assigneeIds.includes(myId || '') || t.assigneeIds.includes(myName || ''))).forEach((t) => {
      notes.push({
        id: `ta-${t.id}`, type: 'task_assigned',
        severity: t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'warning' : 'info',
        title: t.title,
        description: `${t.type === 'approval' ? 'اعتماد' : t.type === 'stock_count' ? 'جرد' : t.type === 'grn_verify' ? 'تدقيق GRN' : t.type === 'purchase_request' ? 'طلب شراء' : t.type === 'review' ? 'مراجعة' : 'مهمة'}${t.dueDate ? ' — مستحقة ' + t.dueDate : ''}`,
        tab: 'tasks',
      });
    });

    const reportsRule = automationRules.find((r) => r.key === 'reports_due');
    if (reportsRule?.enabled) {
      const dayMs = 86400000;
      const overdue = (r: { lastRun?: string; frequency: 'daily' | 'weekly' | 'monthly' }) => {
        if (!r.lastRun) return true;
        const since = Math.floor((Date.now() - new Date(r.lastRun).getTime()) / dayMs);
        const maxDays = r.frequency === 'daily' ? 1 : r.frequency === 'weekly' ? 7 : 30;
        return since >= maxDays;
      };
      scheduledReports.filter((r) => r.enabled && overdue(r)).forEach((r) => {
        const fr = { daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً' }[r.frequency];
        notes.push({ id: `rd-${r.id}`, type: 'report_due', severity: 'info', title: `تقرير مستحق: ${r.name}`, description: `الجَدولة ${fr} — لم يُشغّل منذ ${r.lastRun || 'البداية'}`, tab: 'automation' });
      });
    }

    return notes.slice(0, 50);
  }, [getFoodCostAlerts]);

  // ---- إعادة تعيين/مسح البيانات ----
  const resetDemoData = useCallback(() => {
    useSettingsStore.setState({
      branches: INITIAL_BRANCHES,
      unitsOfMeasure: INITIAL_UNITS,
      currencies: INITIAL_CURRENCIES,
      companies: INITIAL_COMPANIES,
      customCategories: INITIAL_CATEGORIES,
      scheduledReports: INITIAL_SCHEDULED_REPORTS,
      automationRules: INITIAL_AUTOMATION_RULES,
    });
    useLegacyCompatStore.setState({
      rawMaterials: INITIAL_RAW_MATERIALS,
      wastageLogs: INITIAL_WASTAGE_LOGS,
      requisitions: [],
      customerOrders: [],
      auditLogs: [],
      customReports: [],
      recentDocs: [],
    });
    useProductionStore.setState({
      recipes: INITIAL_RECIPES,
      recipeSections: DEFAULT_RECIPE_SECTIONS,
      workOrders: INITIAL_WORK_ORDERS,
      productionRuns: [],
      butcherTests: [],
      foodMenus: INITIAL_FOOD_MENUS,
      menuPlans: [],
    });
    useInventoryStore.setState({
      inventory: INITIAL_INVENTORY,
      inventoryBatches: [],
      recipeInventory: INITIAL_RECIPE_INVENTORY,
      physicalCounts: [],
      dailyCounts: [],
      openingBalances: [],
      stockTransfers: INITIAL_STOCK_TRANSFERS,
      inventoryMovements: [],
      intakeInbox: [],
    });
    useProcurementStore.setState({
      suppliers: INITIAL_SUPPLIERS,
      grnNotes: INITIAL_GRN_NOTES,
      purchaseOrders: INITIAL_PURCHASE_ORDERS,
      purchaseRequests: [],
      supplierQuotes: [],
      supplierReturns: [],
    });
    useSalesStore.setState({
      posOrders: INITIAL_POS_ORDERS,
      customers: INITIAL_CUSTOMERS,
      reservations: INITIAL_RESERVATIONS,
      invoices: INITIAL_INVOICES,
      batchSalesRecords: INITIAL_BATCH_SALES,
      deliverySales: [],
    });
    useFinancialStore.setState({
      accounts: INITIAL_ACCOUNTS,
      journalEntries: INITIAL_JOURNAL_ENTRIES,
      posReturns: [],
      fixedAssets: INITIAL_FIXED_ASSETS,
      operatingExpenses: INITIAL_OPERATING_EXPENSES,
      expenseBudgets: INITIAL_EXPENSE_BUDGETS,
      plSummaries: INITIAL_PL_SUMMARIES,
    });
    useHRStore.setState({
      employees: INITIAL_EMPLOYEES,
      shifts: INITIAL_LABOR_SHIFTS,
      attendance: [],
      payrollPeriods: [],
      employeeMeals: [],
      tasks: [],
      tempLogs: [],
      haccpInspections: [],
    });
    usePeriodStore.setState({ closedMonths: [], closedDays: [], eodClosures: [], monthlyInventory: [] });
  }, []);

  const clearSystemData = useCallback(() => {
    useSettingsStore.setState({
      branches: [], unitsOfMeasure: [], materialBarcodes: [], materialCategories: [], customCategories: INITIAL_CATEGORIES,
      currencies: [], companies: [], customRoles: [], automationRules: [], scheduledReports: [],
    });
    useLegacyCompatStore.setState({ rawMaterials: [], wastageLogs: [], requisitions: [], customerOrders: [], auditLogs: [], customReports: [], recentDocs: [] });
    useProductionStore.setState({ recipes: [], recipeSections: DEFAULT_RECIPE_SECTIONS, workOrders: [], productionRuns: [], butcherTests: [], foodMenus: [], menuPlans: [] });
    useInventoryStore.setState({
      inventory: [], inventoryBatches: [], recipeInventory: [], physicalCounts: [], dailyCounts: [], openingBalances: [],
      stockTransfers: [], inventoryMovements: [], intakeInbox: [], branchStockLimits: [],
    });
    useProcurementStore.setState({ suppliers: [], grnNotes: [], purchaseOrders: [], purchaseRequests: [], supplierQuotes: [], supplierReturns: [] });
    useSalesStore.setState({ posOrders: [], customers: [], reservations: [], invoices: [], batchSalesRecords: [], deliveryApps: [], deliverySales: [] });
    useFinancialStore.setState({ accounts: [], journalEntries: [], posReturns: [], fixedAssets: [], operatingExpenses: [], expenseBudgets: [], plSummaries: [] });
    useHRStore.setState({ employees: [], shifts: [], attendance: [], payrollPeriods: [], employeeMeals: [], tasks: [], tempLogs: [], haccpInspections: [] });
    usePeriodStore.setState({ closedMonths: [], closedDays: [], eodClosures: [], monthlyInventory: [] });
    const token = localStorage.getItem('rcerp_token');
    if (token) fetch('/api/clear', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }, []);

  const clearCollections = useCallback((keys: string[]) => {
    const s = useSettingsStore.setState;
    const i = useInventoryStore.setState;
    const p = useProcurementStore.setState;
    const r = useProductionStore.setState;
    const a = useSalesStore.setState;
    const f = useFinancialStore.setState;
    const h = useHRStore.setState;
    const e = usePeriodStore.setState;
    const l = useLegacyCompatStore.setState;
    const map: Record<string, () => void> = {
      rcerp_branches: () => s({ branches: [] }),
      rcerp_units: () => s({ unitsOfMeasure: [] }),
      rcerp_currencies: () => s({ currencies: [] }),
      rcerp_companies: () => s({ companies: [] }),
      rcerp_custom_roles: () => s({ customRoles: [] }),
      rcerp_automation_rules: () => s({ automationRules: [] }),
      rcerp_scheduled_reports: () => s({ scheduledReports: [] }),
      rcerp_raw_materials: () => l({ rawMaterials: [] }),
      rcerp_wastage: () => l({ wastageLogs: [] }),
      rcerp_requisitions: () => l({ requisitions: [] }),
      rcerp_customer_orders: () => l({ customerOrders: [] }),
      rcerp_audit: () => l({ auditLogs: [] }),
      rcerp_custom_reports: () => l({ customReports: [] }),
      rcerp_recent_docs: () => l({ recentDocs: [] }),
      rcerp_inventory: () => i({ inventory: [] }),
      rcerp_inventory_batches: () => i({ inventoryBatches: [] }),
      rcerp_recipe_inventory: () => i({ recipeInventory: [] }),
      rcerp_physical_counts: () => i({ physicalCounts: [] }),
      rcerp_daily_counts: () => i({ dailyCounts: [] }),
      rcerp_opening_balances: () => i({ openingBalances: [] }),
      rcerp_stock_transfers: () => i({ stockTransfers: [] }),
      rcerp_inventory_movements: () => i({ inventoryMovements: [] }),
      rcerp_intake_inbox: () => i({ intakeInbox: [] }),
      rcerp_recipes: () => r({ recipes: [] }),
      rcerp_work_orders: () => r({ workOrders: [] }),
      rcerp_production_runs: () => r({ productionRuns: [] }),
      rcerp_food_menus: () => r({ foodMenus: [] }),
      rcerp_menu_plans: () => r({ menuPlans: [] }),
      rcerp_suppliers: () => p({ suppliers: [] }),
      rcerp_grn: () => p({ grnNotes: [] }),
      rcerp_purchase_orders: () => p({ purchaseOrders: [] }),
      rcerp_purchase_requests: () => p({ purchaseRequests: [] }),
      rcerp_supplier_quotes: () => p({ supplierQuotes: [] }),
      rcerp_supplier_returns: () => p({ supplierReturns: [] }),
      rcerp_pos_orders: () => a({ posOrders: [] }),
      rcerp_customers: () => a({ customers: [] }),
      rcerp_reservations: () => a({ reservations: [] }),
      rcerp_invoices: () => a({ invoices: [] }),
      rcerp_batch_sales: () => a({ batchSalesRecords: [] }),
      rcerp_delivery_sales: () => a({ deliverySales: [] }),
      rcerp_journal: () => f({ journalEntries: [] }),
      rcerp_accounts: () => f({ accounts: [] }),
      rcerp_pos_returns: () => f({ posReturns: [] }),
      rcerp_fixed_assets: () => f({ fixedAssets: [] }),
      rcerp_operating_expenses: () => f({ operatingExpenses: [] }),
      rcerp_expense_budgets: () => f({ expenseBudgets: [] }),
      rcerp_pl_summaries: () => f({ plSummaries: [] }),
      rcerp_employees: () => h({ employees: [] }),
      rcerp_shifts: () => h({ shifts: [] }),
      rcerp_attendance: () => h({ attendance: [] }),
      rcerp_payroll: () => h({ payrollPeriods: [] }),
      rcerp_employee_meals: () => h({ employeeMeals: [] }),
      rcerp_tasks: () => h({ tasks: [] }),
      rcerp_temp_logs: () => h({ tempLogs: [] }),
      rcerp_haccp_inspections: () => h({ haccpInspections: [] }),
      rcerp_closed_months: () => e({ closedMonths: [] }),
      rcerp_closed_days: () => e({ closedDays: [] }),
      rcerp_eod_closures: () => e({ eodClosures: [] }),
      rcerp_monthly_inventory: () => e({ monthlyInventory: [] }),
    };
    const keysToClear = keys.filter((k) => !!map[k]);
    keysToClear.forEach((k) => map[k]());
    if (keys.includes('rcerp_categories')) useSettingsStore.setState({ customCategories: INITIAL_CATEGORIES });
    const token = localStorage.getItem('rcerp_token');
    if (token) {
      fetch('/api/clear-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collections: keysToClear }),
      }).catch(() => {});
    }
  }, []);

  const canUndo = false;
  const canRedo = false;
  const undo = useCallback(() => {}, []);
  const redo = useCallback(() => {}, []);

  return {
    ...auth,
    visibleBranchIds,
    ...inventory,
    ...procurement,
    ...production,
    ...financial,
    ...sales,
    ...settings,
    ...hr,
    ...period,
    ...sync,
    ...preferences,
    ...legacy,
    ...authCore,
    toast,
    showToast,
    getFoodCostAlerts,
    acknowledgedAlertIds: legacy.acknowledgedAlertIds,
    acknowledgeAlert,
    unacknowledgeAlert,
    getRawMaterialName,
    getAverageUnitCost,
    getBranchAverageUnitCost,
    getLastPurchaseCost,
    getBranchName,
    getRawMaterialUnitCost,
    convertToBase,
    calculateRecipeCosts,
    addRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    importRawMaterials,
    importSuppliers,
    importCustomers,
    receivePurchaseOrder,
    recordPurchaseReceipt,
    addRequisition,
    submitRequisition,
    approveRequisition,
    rejectRequisition,
    cancelRequisition,
    deleteRequisition,
    addWastageLog,
    manufactureRecipe,
    postButcherTest,
    updateRecipeTargetMargin,
    runSystemCheck,
    dataHealth,
    rebuildSystem,
    runAutomation,
    getNotifications,
    resetDemoData,
    clearSystemData,
    clearCollections,
    canUndo,
    canRedo,
    undo,
    redo,
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, React.createElement(SyncBridge, null), children);