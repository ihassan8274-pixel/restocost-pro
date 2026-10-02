import type { MaterialCategory } from './structure';

export interface RawMaterial {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: MaterialCategory;
  unit: string;
  purchaseUnit?: string;
  purchaseUnitConversion?: number;
  purchaseUnitPrice?: number;
  // وحدة التداول في الوصفات (من ماديول وحدات القياس): تحويل وحدة المخزون إلى وحدات قياس
  tradeUomId?: string;           // مرجع لمعرّف الوحدة القياسية (لتر/كغم/جرام)
  tradeUomName?: string;         // اسم الوحدة القياسية مخزّن للعرض السريع
  tradeUomConversion?: number;   // معامل خاص للصنف: 1 وحدة مخزون = N وحدة قياس
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint?: number;      // نقطة إعادة الطلب: عند هبوط المتاح (رصيد + أوامر مفتوحة) دونها يُقترح الشراء
  leadTimeDays?: number;      // مهلة التوريد بالأيام: تُضرب في الاستهلاك اليومي لحساب كمية الطلب المقترحة
  standardPrice: number;
  yieldPercentage: number;
  supplierId: string;
  storageType: 'frozen' | 'chilled' | 'dry';
  isActive: boolean;
}

// وحدة قياس قياسية (ماديول إدارة الوحدات) — تُستخدم لتحويل المخزون إلى وحدات الوصفات
export interface UnitOfMeasure {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  uomClass: 'volume' | 'weight' | 'count' | 'length';
  isActive: boolean;
}

// باركودات المواد الخام — نفس المنتج قد يُورد من أكثر من مورد، وكل مورد يملك باركود
// مختلف (GTIN / EAN / UPC / CODE128)، كما قد يختلف الباركود حسب مستوى التعبئة
// (الكرتون / الوحدة / الباليت). تُستخدم في الاستلام والجرد بمسح الباركود.
export interface MaterialBarcode {
  id: string;
  rawMaterialId: string;
  supplierId?: string; // المورد الذي يحمل هذه الباركود (فارغ = عام)
  barcode: string;     // رقم الباركود كما يُمسح
  barcodeType?: 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' | 'QR';
  packagingLevel?: 'unit' | 'carton' | 'pallet' | 'custom'; // مستوى التعبئة
  packagingQty?: number; // كم وحدة تخزين داخل العبوة (كرتون=24، باليت=144...)
  isPrimary?: boolean;   // الباركود الافتراضي للطباعة/البحث السريع
  notes?: string;
}

// حدود المخزون لكل فرع — كل فرع له حد أدنى/أقصى مختلف لكل صنف
// alwaysOrderFullMax: استثناء الصنف من منطق "الوصول للحد الأدنى" — يُطلب كامل الحد الأقصى دون النظر للرصيد
export interface BranchStockLimit {
  id: string; // `${branchId}__${rawMaterialId}`
  branchId: string;
  rawMaterialId: string;
  minStockLevel: number;
  maxStockLevel: number;
  alwaysOrderFullMax: boolean;
}

export interface StockLevels {
  minStockLevel: number;
  maxStockLevel: number;
  alwaysOrderFullMax: boolean;
  isOverride: boolean; // true إذا كان للفرع حد مخصص (غير الافتراضي العام)
}

export interface InventoryRecord {
  id: string;
  branchId: string;
  rawMaterialId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: string;
  lastUpdated: string;
}

export interface InventoryMovementLog {
  id: string;
  date: string;
  branchId: string;
  rawMaterialId: string;
  delta: number;
  type: string;
  ref?: string;
}

// Finished goods (sub-prep recipes) stock per branch
export interface RecipeInventory {
  id: string;
  branchId: string;
  recipeId: string;
  quantity: number;
  lastUpdated: string;
}

export interface PhysicalStockCount {
  id: string;
  branchId: string;
  date: string;
  countedBy: string;
  items: { rawMaterialId: string; theoreticalQty: number; actualQty: number; varianceQty: number; unitCost: number; varianceCost: number; reason?: string }[];
  totalVarianceCost: number;
}

// دفعة/تشغيلة استلام (FEFO): تتبُّع كميات الصلاحية لكل دفعة لاتخاذ قرار الاستهلاك الأسبق صلاحية
export interface InventoryBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  rawMaterialId: string;
  branchId: string;
  grnId?: string;
  receivedQty: number;
  remainingQty: number;
  receivedAt: string;
  unitPrice: number;
}

export interface DailyInventoryItem {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  openingQty: number;
  purchasedQty: number;
  theoreticalQty: number;
  countedQty: number;
  consumedQty: number;
  unitCost: number;
  consumedValue: number;
}

export interface DailyInventoryCount {
  id: string;
  branchId: string;
  date: string;
  countedBy: string;
  status: 'saved' | 'approved';
  items: DailyInventoryItem[];
  totalConsumedQty: number;
  totalConsumedValue: number;
  docNo?: string;
  today?: string;
}

export interface OpeningBalanceItem {
  rawMaterialId: string;
  quantity: number;
  unitCost: number;
}

export interface OpeningBalanceRecord {
  id: string;
  branchId: string;
  date: string;
  items: OpeningBalanceItem[];
}

export interface MonthlyInventoryItem {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  openingQty: number;
  purchasedQty: number;
  transferredIn: number;
  transferredOut: number;
  theoreticalQty: number;
  countedQty: number;
  varianceQty: number;
  unitCost: number;
  varianceCost: number;
  theoreticalUsage: number;
  actualUsage: number;
  usageVariance: number;
}

export interface MonthlyInventoryPeriod {
  id: string;
  branchId: string;
  monthKey: string; // '2026-09'
  status: 'counting' | 'review' | 'closed';
  createdAt: string;
  startedAt?: string;
  closedAt?: string;
  closedBy?: string;
  items: MonthlyInventoryItem[];
  // بصمة تطبيق التسوية على المخزون وقت الإقفال (فرق الدفتري عن الفعلي)
  settlementAppliedAt?: string;
  settlementShortages?: number;
  settlementSurpluses?: number;
  settlementNetVariance?: number;
  originalItems?: MonthlyInventoryItem[];
  totalSystemCost?: number;
  totalCountedCost?: number;
  totalVariance?: number;
  totalVarianceCost: number;
  varianceRate?: number;
  totalTheoreticalUsage: number;
  totalActualUsage: number;
  totalUsageVariance: number;
  approvedItems?: string[]; // ids of variance items approved for adjustment
}

// إقفال نهاية يوم لكل فرع — يُسجَّل عند إقفال اليوم من معالج نهاية اليوم (بند 66)
export interface EodClosure {
  id: string;
  branchId: string;
  date: string;            // YYYY-MM-DD
  closedAt: string;        // ISO timestamp لحظة الإقفال
  closedBy: string;        // اسم المستخدم الذي نفّذ الإقفال
  revenue?: number;        // إيراد اليوم الفعلي (نقاط بيع + إدخال دفعاتي)
  foodCost?: number;       // تكلفة الطعام المستهلك
  laborCost?: number;      // تكلفة العمالة ليوم الإقفال
  operatingCost?: number;  // المصروفات التشغيلية المدفوعة لنفس التاريخ
  wastageCost?: number;    // قيمة الهالك المسجل ليوم الإقفال
  profit?: number;         // ربح اليوم الصافي
  marginPct?: number;      // نسبة الهامش
  notes?: string;
}

export type StockItemType = 'raw_material' | 'recipe';

export interface StockTransferItem {
  itemType?: StockItemType; // raw_material (مخزني) or recipe (صنف مصنّع من وصفة)
  rawMaterialId?: string;
  recipeId?: string;
  itemName: string;
  materialName?: string; // legacy field from older records
  quantity: number;
  unit: string;
  unitCost: number;
  purchaseUnit?: string;    // وحدة الشراء (للتوزيعات الواردة من البوت)
  purchaseUnitQty?: number; // الكمية بوحدة الشراء كما وردت
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  toBranchId: string;
  date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  items: StockTransferItem[];
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  transportCost?: number;  // تكلفة النقل/الشحن الإجمالية لهذا التحويل (بند 61)
  transportNote?: string;  // ملاحظة عن وسيلة/تكلفة النقل (مثال: شاحنة 3.5 طن)
}

export interface DistributionRow {
  toBranchId: string;
  toBranchName: string;
  qty: number;                 // كمية وحدة الشراء كما وردت بالرسالة
  purchaseUnit: string;        // وحدة الشراء (كرتون/صندوق/...)
  conversion: number;          // 1 وحدة شراء = N وحدة مخزون
  unit: string;                // وحدة المخزون
  inventoryQty: number;        // الكمية المحوّلة بوحدة المخزون
  unitCost: number;            // سعر وحدة المخزون
  _match?: {
    confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
    source?: string;
    candidates?: { id: string; name: string }[];
  };
}

export interface DistributionMatchInfo {
  item: {
    confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
    source: string;
    matchedId: string | null;
    matchedName: string | null;
    candidates?: { id: string; name: string }[];
  };
  from: {
    confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
    source: string;
    matchedId: string | null;
    matchedName: string | null;
    candidates?: { id: string; name: string }[];
  };
}

export interface Distribution {
  id: string;
  fromBranchId: string;
  fromBranchName: string;
  itemName: string;
  rawMaterialId: string;
  unit: string;
  purchaseUnit: string;
  conversion: number;
  unitCost: number;
  rows: DistributionRow[];
  unknownTargets?: string[];
  parsedTotal?: number;
  total: number;               // مجموع الكميات بوحدة الشراء (كما وردت)
  inventoryTotal: number;      // مجموع الكميات بوحدة المخزون
  date?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  createdAt: string;
  convertedAt?: string;
  source?: string;
  rawText?: string | null;
  matchInfo?: DistributionMatchInfo;
  multiSource?: { branchName: string; qty: number | null }[];
  warnings?: string[];
  notes?: string[];
}

export interface IntakeMatchQuality {
  score: number;
  itemConf: 'exact' | 'alias' | 'fuzzy' | 'none';
  fromConf: 'exact' | 'alias' | 'fuzzy' | 'none';
  targetConfs: ('exact' | 'alias' | 'fuzzy' | 'none')[];
  hasUnknown: boolean;
  hasWarnings: boolean;
}

export interface IntakeInboxEntry {
  id: string;
  rawText: string;
  chatId: number | null;
  senderName: string;
  receivedAt: string;
  draft: Distribution;
  quality: IntakeMatchQuality;
  status: 'pending' | 'raised' | 'rejected';
  raisedAt?: string | null;
  raisedDistId?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string;
}

export interface ButcherTest {
  id: string;
  date: string;
  branchId: string;
  rawMaterialId: string;
  rawMaterialName?: string;
  grossWeight: number;
  pricePerKg: number;
  usableWeight: number;
  wasteWeight: number;
  yieldPercent: number;
  costPerUsableKg: number;
  notes?: string;
  posted: boolean;
  createdBy: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// تصنيفات المواد المخصصة — تُخزَّن في `rcerp_material_categories` على السيرفر
// والقيم الافتراضية الثمانية (DEFAULT_MATERIAL_CATEGORIES في structure.ts)
// مدمجة دائمًا في القائمة ولا يمكن حذفها.
// ═══════════════════════════════════════════════════════════════════════════
export interface MaterialCategoryDef {
  id: string;
  key: string;            // مفتاح فريد يُستخدم كقيمة في RawMaterial.category
  labelAr: string;        // الاسم بالعربي
  labelEn: string;        // الاسم بالإنجليزي
  color: string;          // لون hex للعرض في الواجهة
  order: number;          // ترتيب الظهور
  isDefault: boolean;     // true للتصنيفات الثمانية المدمجة — لا يمكن حذفها
  isActive: boolean;
  createdAt: string;
}