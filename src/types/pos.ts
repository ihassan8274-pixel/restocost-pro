export interface DeliveryApp {
  id: string;
  name: string;
  commissionPercent: number;
  isActive: boolean;
  // أسعار الأصناف على قائمة هذا التطبيق (recipeId → السعر شامل الضريبة)
  prices?: Record<string, number>;
}

// مبيعات تطبيقات التوصيل المستوردة (جاهز / هنقرستيشن / كيك ...)
// الأسعار شاملة الضريبة؛ العمولة تُحسب على الصافي؛ المستلم = الصافي - العمولة
export interface DeliverySaleItem {
  recipeId: string;
  recipeNameAr: string;
  category: string;
  quantitySold: number;
  unitPrice: number; // سعر القائمة على المنصة (شامل الضريبة)
  unitCost: number; // تكلفة الطبق الكلية
}

export interface DeliverySale {
  id: string;
  platformId: string; // معرف من قائمة deliveryApps أو 'custom'
  platformName: string;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  ordersCount: number;
  items: DeliverySaleItem[];
  grossRevenue: number; // إجمالي المبيعات شامل الضريبة
  vatAmount: number;
  netRevenue: number; // الصافي قبل عمولة المنصة
  commissionPercent: number;
  commissionAmount: number; // قيمة العمولة (على الصافي)
  payoutAmount: number; // الصافي المستلم فعلياً
  enteredBy?: string;
  createdAt?: string;
}

export interface CustomerOrderItem {
  recipeId: string;
  nameAr: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type CustomerOrderStatus = 'new' | 'confirmed' | 'paid' | 'cancelled';

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  items: CustomerOrderItem[];
  totalGross: number;
  vatAmount: number;
  netTotal: number;
  status: CustomerOrderStatus;
  paymentMethod?: string;
  note?: string;
  createdAt: string;
}

export interface POSOrderItem {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  ckRawUsed?: Record<string, number>;
  ckRecipeUsed?: Record<string, number>;
}

export interface POSOrder {
  id: string;
  branchId: string;
  orderNumber: string;
  date: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery_app';
  items: POSOrderItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  totalCost: number;
  cashierName: string;
  customerId?: string;
  rawMaterialsDeducted?: boolean;
  status: 'draft' | 'submitted' | 'approved' | 'partially_received' | 'received' | 'cancelled' | 'rejected';
}

export interface POSReturnItem {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface POSReturn {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  branchId: string;
  date: string;
  items: POSReturnItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  totalCost: number;
  reason: string;
  refundedBy: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export interface BatchSalesItem {
  recipeId: string;
  recipeNameAr: string;
  category: string;
  quantitySold: number;
  unitPrice: number;
  unitCost: number;
  lineTotalRevenue: number;
  lineTotalCost: number;
}

export interface BatchSalesRecord {
  id: string;
  batchNumber: string;
  branchId: string;
  branchName: string;
  menuId?: string;
  menuName?: string;
  date: string;
  items: BatchSalesItem[];
  totalRevenue: number;
  totalFoodCost: number;
  foodCostPercent: number;
  enteredBy: string;
  createdAt: string;
  rawMaterialsDeducted?: boolean;
  vatRate?: number;
  vatAmount?: number;
  netRevenue?: number;
  source?: 'branch' | 'delivery' | 'foodics';
  deliveryAppId?: string;
  appName?: string;
  commissionPercent?: number;
  commissionAmount?: number;
  netAfterCommission?: number;
}

export interface MenuItem {
  id: string;
  recipeId: string;
  recipeNameAr: string;
  category: string;
  menuPrice: number;
  isAvailable: boolean;
  displayOrder?: number;
}

export interface FoodMenu {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  description?: string;
  mealType: 'all_day' | 'breakfast' | 'lunch' | 'dinner' | 'special_event';
  branchIds: string[];
  isActive: boolean;
  items: MenuItem[];
}

// تخطيط القوائم والأطعمة: خطة إنتاج/مبيعات مستهدفة لوجبة في يوم وفرع محددين
// يُستخدم لتغذية تخطيط الإنتاج والمشتريات ومقارنة المخطَّط بالمحقق لاحقاً.
export interface MenuPlanItem {
  recipeId: string;
  recipeNameAr: string;
  plannedQty: number;
  targetPrice: number;
}

export interface MenuPlan {
  id: string;
  date: string; // YYYY-MM-DD
  branchId: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'all_day' | 'special_event';
  items: MenuPlanItem[];
  notes?: string;
}