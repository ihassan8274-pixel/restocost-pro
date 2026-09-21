// ============================================================
// عميل API للوصول لبيانات النظام الفعلي
// يستخدم endpoints الموجودة: /api/bootstrap, /api/collections/:key
// ============================================================

import type { 
  RawBatchSale, RawGRN, RawInventory, RawInventoryMovement,
  RawDailyCount, RawRecipe, RawOperatingExpense,
  RawJournalEntry, RawAccount, RawBranch, RawRawMaterial,
  RawSupplier, RawStockTransfer, RawDistribution, RawAudit,
  RawPurchaseOrder, RawShift, RawPayroll
} from './sources';

const API_BASE = '/api';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rcerp_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// أنواع الاستجابة
interface BootstrapResponse {
  ok: boolean;
  error?: string;
  data: {
    rcerp_batch_sales?: RawBatchSale[];
    rcerp_grn?: RawGRN[];
    rcerp_inventory?: RawInventory[];
    rcerp_inventory_movements?: RawInventoryMovement[];
    rcerp_daily_counts?: RawDailyCount[];
    rcerp_recipes?: RawRecipe[];
    rcerp_operating_expenses?: RawOperatingExpense[];
    rcerp_journal?: RawJournalEntry[];
    rcerp_accounts?: RawAccount[];
    rcerp_branches?: RawBranch[];
    rcerp_raw_materials?: RawRawMaterial[];
    rcerp_suppliers?: RawSupplier[];
    rcerp_stock_transfers?: RawStockTransfer[];
    rcerp_distributions?: RawDistribution[];
    rcerp_audit?: RawAudit[];
    rcerp_purchase_orders?: RawPurchaseOrder[];
    rcerp_shifts?: RawShift[];
    rcerp_payroll?: RawPayroll[];
    rcerp_vat_percent?: string;
    rcerp_vat_inclusive?: string;
    rcerp_target_margin?: string;
    [key: string]: unknown;
  };
  user: unknown;
}

interface SyncStateResponse {
  ok: boolean;
  error?: string;
  rev: number;
  boot: number;
}

interface CollectionResponse<T> {
  ok: boolean;
  error?: string;
  data: T;
}

// ذاكرة تخزين مؤقت للبيانات المحملة
let bootstrapCache: BootstrapResponse['data'] | null = null;
let bootstrapPromise: Promise<BootstrapResponse['data']> | null = null;

// تحميل الـ bootstrap (كل البيانات مرة واحدة)
export async function loadBootstrap(): Promise<BootstrapResponse['data']> {
  if (bootstrapCache) return bootstrapCache;
  
  if (bootstrapPromise) return bootstrapPromise;
  
  bootstrapPromise = (async () => {
    const res = await fetch(`${API_BASE}/bootstrap`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    
    if (!res.ok) {
      throw new Error(`Bootstrap failed: ${res.status}`);
    }
    
    const json: BootstrapResponse = await res.json();
    if (!json.ok) throw new Error(json.error || 'Bootstrap failed');
    
    bootstrapCache = json.data;
    return json.data;
  })();
  
  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

// الحصول على حالة المزامنة (للتحقق من الـ cache)
export async function getSyncState(): Promise<SyncStateResponse> {
  const res = await fetch(`${API_BASE}/sync-state`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  
  if (!res.ok) throw new Error(`Sync state failed: ${res.status}`);
  
  const json: SyncStateResponse = await res.json();
  if (!json.ok) throw new Error(json.error || 'Sync state failed');
  
  return json;
}

// تحميل مجموعة واحدة عند الطلب
export async function loadCollection<T>(key: string): Promise<T> {
  const res = await fetch(`${API_BASE}/collections/${key}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  
  if (!res.ok) throw new Error(`Load collection ${key} failed: ${res.status}`);
  
  const json: CollectionResponse<T> = await res.json();
  if (!json.ok) throw new Error(json.error || `Load ${key} failed`);
  
  return json.data;
}

// محولات لكل نوع بيانات
export async function getBatchSales(): Promise<RawBatchSale[]> {
  const data = await loadBootstrap();
  return data.rcerp_batch_sales || [];
}

export async function getGRN(): Promise<RawGRN[]> {
  const data = await loadBootstrap();
  return data.rcerp_grn || [];
}

export async function getInventory(): Promise<RawInventory[]> {
  const data = await loadBootstrap();
  return data.rcerp_inventory || [];
}

export async function getInventoryMovements(): Promise<RawInventoryMovement[]> {
  const data = await loadBootstrap();
  return data.rcerp_inventory_movements || [];
}

export async function getDailyCounts(): Promise<RawDailyCount[]> {
  const data = await loadBootstrap();
  return data.rcerp_daily_counts || [];
}

export async function getRecipes(): Promise<RawRecipe[]> {
  const data = await loadBootstrap();
  return data.rcerp_recipes || [];
}

export async function getOperatingExpenses(): Promise<RawOperatingExpense[]> {
  const data = await loadBootstrap();
  return data.rcerp_operating_expenses || [];
}

export async function getJournal(): Promise<RawJournalEntry[]> {
  const data = await loadBootstrap();
  return data.rcerp_journal || [];
}

export async function getAccounts(): Promise<RawAccount[]> {
  const data = await loadBootstrap();
  return data.rcerp_accounts || [];
}

export async function getBranches(): Promise<RawBranch[]> {
  const data = await loadBootstrap();
  return data.rcerp_branches || [];
}

export async function getRawMaterials(): Promise<RawRawMaterial[]> {
  const data = await loadBootstrap();
  return data.rcerp_raw_materials || [];
}

export async function getSuppliers(): Promise<RawSupplier[]> {
  const data = await loadBootstrap();
  return data.rcerp_suppliers || [];
}

export async function getStockTransfers(): Promise<RawStockTransfer[]> {
  const data = await loadBootstrap();
  return data.rcerp_stock_transfers || [];
}

export async function getDistributions(): Promise<RawDistribution[]> {
  const data = await loadBootstrap();
  return data.rcerp_distributions || [];
}

export async function getAudit(): Promise<RawAudit[]> {
  const data = await loadBootstrap();
  return data.rcerp_audit || [];
}

export async function getPurchaseOrders(): Promise<RawPurchaseOrder[]> {
  const data = await loadBootstrap();
  return data.rcerp_purchase_orders || [];
}

export async function getShifts(): Promise<RawShift[]> {
  const data = await loadBootstrap();
  return data.rcerp_shifts || [];
}

export async function getPayroll(): Promise<RawPayroll[]> {
  const data = await loadBootstrap();
  return data.rcerp_payroll || [];
}

export async function getVatPercent(): Promise<number> {
  const data = await loadBootstrap();
  return parseFloat(data.rcerp_vat_percent || '15');
}

export async function getVatInclusive(): Promise<boolean> {
  const data = await loadBootstrap();
  return data.rcerp_vat_inclusive === 'true';
}

export async function getTargetMargin(): Promise<number> {
  const data = await loadBootstrap();
  return parseFloat(data.rcerp_target_margin || '68');
}

// مسح الكاش (يُستدعى عند تغيير البيانات)
export function invalidateCache(): void {
  bootstrapCache = null;
  bootstrapPromise = null;
}

// التحقق مما إذا كان الكاش صالحًا
export async function isCacheValid(): Promise<boolean> {
  try {
    const state = await getSyncState();
    return !bootstrapCache || state.rev === (bootstrapCache as any)?.__rev;
  } catch {
    return false;
  }
}

// حفظ إعدادات التقرير المجدول
export async function saveScheduledReport(config: unknown): Promise<{ ok: boolean; id?: string }> {
  const res = await fetch(`${API_BASE}/collections/rcerp_scheduled_reports`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify(config),
  });
  
  const json = await res.json();
  return json;
}

// تصدير تقرير
export async function exportReport(params: {
  reportId: string;
  format: 'pdf' | 'excel';
  filters: Record<string, unknown>;
}): Promise<Blob> {
  const searchParams = new URLSearchParams();
  searchParams.set('reportId', params.reportId);
  searchParams.set('format', params.format);
  Object.entries(params.filters).forEach(([k, v]) => {
    searchParams.set(k, JSON.stringify(v));
  });
  
  const res = await fetch(`${API_BASE}/reports/export?${searchParams}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  
  return res.blob();
}