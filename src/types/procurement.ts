import type { MaterialCategory } from './structure';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  rating: number;
  paymentTermsDays: number;
  categories: MaterialCategory[];
  isActive: boolean;
  notes?: string;
}

export interface GoodsReceiptItem {
  rawMaterialId: string;
  quantityReceived: number;
  unitPrice: number;
  lineTotal?: number;
  batchNumber: string;
  expiryDate: string;
  qualityPassed: boolean;
  notes?: string;
}

export interface GoodsReceiptNote {
  id: string;
  grnNumber: string;
  purchaseOrderId?: string;
  poNumber?: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  date: string;
  invoiceNumber: string;
  invoiceDate?: string;
  totalAmount: number;
  vatRate?: number;
  vatAmount?: number;
  vatInclusive?: boolean;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  receivedBy: string;
  items: GoodsReceiptItem[];
  notes?: string;
  currencyCode?: string;
  exchangeRate?: number;
}

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'partially_received' | 'received' | 'cancelled' | 'rejected';

export interface PurchaseOrderItem {
  rawMaterialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  receivedQty?: number;
  // Purchase-cycle metadata: order expressed in purchase units (e.g. carton/sack)
  // while `quantity` stays in storage units for inventory integration.
  purchaseUnit?: string;
  purchaseUnitConversion?: number;
  purchaseQty?: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  totalAmount: number;
  requestedBy: string;
  approvedBy?: string;
  approvalSignature?: string;
  notes?: string;
  currencyCode?: string;
  exchangeRate?: number;
  // Preliminary supply order (أمر توريد مبدئي): generated from a purchase request,
  // price = lowest 30-day price, supplier = last actual supplier for each item.
  poType?: 'regular' | 'preliminary';
  sourceRequestId?: string;
}

// ═══════════════ طلبات الشراء (Purchase Requests) ═══════════════
// تُنشأ لكل فرع بعد الجرد من الجوال: يُحسب الطلب تلقائياً من الفرق بين
// الحد الأدنى/الأقصى وآخر جرد — فقط عند بلوغ الصنف الحد الأدنى أو أقل.
export interface PurchaseRequestItem {
  rawMaterialId: string;
  materialName: string;
  code: string;
  unit: string;                        // وحدة المخزون
  purchaseUnit: string;                // وحدة الشراء (كرتون/جالون/...)
  purchaseUnitConversion: number;      // 1 وحدة شراء = N وحدة مخزون
  minStockLevel: number;               // حد أدنى فعال (وحدات مخزون)
  maxStockLevel: number;               // حد أقصى فعال (وحدات مخزون)
  alwaysOrderFullMax: boolean;
  minPU: number;                       // الحد الأدنى بوحدة الشراء
  maxPU: number;                       // الحد الأقصى بوحدة الشراء
  currentPU: number;                   // آخر جرد من الجوال بوحدة الشراء
  currentStockQty?: number;            // الرصيد الحالي (وحدات مخزون) — للمعلومة/الاحتياط
  quantityPU: number;                  // الكمية المطلوبة بوحدة الشراء (محسوبة)
  lastPricePU: number;                 // آخر سعر توريد = أقل سعر خلال 30 يوم (بوحدة الشراء)
  lastPriceDate?: string;              // تاريخ آخر استلام يمثل السعر
  lastSupplierId?: string;             // آخر مورد تم الشراء منه فعلياً
  lastSupplierName?: string;
}

export interface PurchaseRequest {
  id: string;
  requestNumber: string;               // PR-YYYY-NNNN
  branchId: string;
  branchName: string;
  date: string;
  createdBy: string;
  status: 'draft' | 'submitted' | 'converted';
  items: PurchaseRequestItem[];
  totalQtyPU: number;                  // إجمالي الكميات بوحدة الشراء
  totalValue: number;                  // القيمة التقديرية بأقل سعر 30 يوم
  convertedToPOs?: string[];           // poIds الناتجة عن التحويل
  createdAt: string;
  notes?: string;
}

export interface SupplierQuote {
  id: string;
  supplierId: string;
  rawMaterialId: string;
  price: number;
  validFrom: string;
  validTo?: string;
  notes?: string;
  currencyCode?: string;
  updatedAt?: string;                 // آخر تعديل على السعر
  updatedBy?: string;                 // من عدّل السعر آخر مرة
  history?: SupplierQuoteVersion[];   // إصدارات الأسعار السابقة (سجل زمني)
}

// إصدار سابق لسعر مورد — يُضاف تلقائياً عند التعديل على سعر قائم (بند 56)
export interface SupplierQuoteVersion {
  price: number;
  validFrom: string;
  validTo?: string;
  currencyCode?: string;
  changedAt: string;   // متى أُصدر هذا الإصدار (لحظة الاستبدال)
  changedBy?: string;  // من نفّذ التعديل
}

export interface SupplierReturnItem {
  rawMaterialId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export type SupplierReturnStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface SupplierReturn {
  id: string;
  returnNumber: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  date: string;
  reason: string;
  items: SupplierReturnItem[];
  totalAmount: number;
  vatRate?: number;
  vatAmount?: number;
  vatInclusive?: boolean;
  status: SupplierReturnStatus;
  createdBy: string;
  approvedBy?: string;
  currencyCode?: string;
  exchangeRate?: number;
  sourceGrnId?: string;
  sourceGrnNumber?: string;
}

// ============ DEPARTMENT REQUISITIONS (internal issue) ============
export type RequisitionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface RequisitionItem {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface DepartmentRequisition {
  id: string;
  reqNumber: string;
  branchId: string;
  department: string;
  requestedBy: string;
  date: string;
  status: RequisitionStatus;
  items: RequisitionItem[];
  totalQty: number;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  notes?: string;
}