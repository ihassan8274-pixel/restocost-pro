// ============ AUTH & ROLES ============
export type UserRole =
  | 'executive'
  | 'admin'
  | 'branch_manager'
  | 'cost_controller'
  | 'chef'
  | 'storekeeper'
  | 'waiter'
  | 'counter';

export type Permission =
  | 'view_dashboard'
  | 'mobile_count'
  | 'manage_branches'
  | 'manage_inventory'
  | 'manage_grn'
  | 'approve_grn'
  | 'manage_recipes'
  | 'manage_central_kitchen'
  | 'manage_wastage'
  | 'manage_labor'
  | 'manage_pos'
  | 'manage_expenses'
  | 'approve_expenses'
  | 'manage_customers'
  | 'manage_reservations'
  | 'manage_purchase_orders'
  | 'approve_purchase_orders'
  | 'manage_invoices'
  | 'manage_suppliers'
  | 'manage_users'
  | 'manage_requisitions'
  | 'approve_requisitions'
  | 'view_reports'
  | 'view_accounting'
  | 'manage_accounting'
  | 'export_data'
  | 'delete_data'
  | 'manage_menus'
  | 'manage_batch_sales'
  | 'use_ai'
  | 'reset_system';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'view_dashboard', 'manage_branches', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn',
    'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos',
    'manage_expenses', 'approve_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices', 'manage_suppliers',
    'manage_users', 'view_reports', 'view_accounting', 'manage_accounting', 'export_data', 'delete_data', 'manage_menus',
    'manage_batch_sales', 'use_ai', 'reset_system', 'manage_requisitions', 'approve_requisitions',
  ],
  executive: [
    'view_dashboard', 'manage_branches', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn',
    'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos',
    'manage_expenses', 'approve_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices', 'manage_suppliers',
    'view_reports', 'view_accounting', 'manage_accounting', 'export_data', 'delete_data', 'manage_menus', 'manage_batch_sales', 'use_ai',
    'manage_requisitions', 'approve_requisitions',
  ],
  branch_manager: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'manage_recipes', 'manage_wastage',
    'manage_labor', 'manage_pos', 'manage_expenses', 'manage_customers', 'manage_reservations',
    'manage_purchase_orders', 'manage_invoices', 'manage_suppliers', 'view_reports', 'export_data',
    'manage_menus', 'manage_batch_sales', 'manage_requisitions', 'approve_requisitions',
  ],
  cost_controller: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'approve_grn', 'manage_recipes',
    'manage_central_kitchen', 'manage_wastage', 'manage_labor', 'manage_pos', 'manage_expenses',
    'approve_expenses', 'manage_purchase_orders', 'approve_purchase_orders', 'manage_invoices',
    'manage_suppliers', 'view_reports', 'view_accounting', 'manage_accounting', 'export_data', 'manage_menus', 'manage_batch_sales', 'use_ai',
    'manage_requisitions', 'approve_requisitions',
  ],
  chef: [
    'view_dashboard', 'manage_recipes', 'manage_central_kitchen', 'manage_wastage', 'manage_labor',
    'manage_inventory', 'mobile_count', 'view_reports', 'manage_requisitions',
  ],
  storekeeper: [
    'view_dashboard', 'manage_inventory', 'mobile_count', 'manage_grn', 'manage_purchase_orders', 'manage_suppliers',
    'view_reports', 'export_data', 'manage_requisitions',
  ],
  waiter: [
    'view_dashboard', 'manage_reservations', 'manage_pos', 'manage_customers',
  ],
  counter: [
    'mobile_count',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مسؤول النظام',
  executive: 'المدير العام / المالك',
  branch_manager: 'مدير الفرع',
  cost_controller: 'محاسب التكاليف',
  chef: 'الشيف الرئيسي',
  storekeeper: 'أمين المخزن',
  waiter: 'مقدم خدمة / كاشير',
  counter: 'عداد الجرد (الجوال)',
};

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  roleId?: string; // دور مخصص من نموذج صلاحيات الشاشات
  branchId: string; // 'all' or specific branch
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  totpEnabled?: boolean;
  needsActivation?: boolean; // طلب انضمام بانتظار موافقة المسؤول (لا يمكنه الدخول)
  requestedRole?: UserRole;  // الدور الذي طلبه المستخدم عند التسجيل الذاتي
  requestedBranchId?: string; // الفرع الذي طلبه المستخدم
}

// ============ نموذج صلاحيات الشاشات الاحترافي ============
export interface ScreenPermission {
  view: boolean;
  add: boolean;
  edit: boolean;
  del: boolean;
}

export interface AccessRole {
  id: string;
  nameAr: string;
  baseRole: UserRole;
  inheritBase: boolean; // وراثة مشاهدة الشاشات المتاحة للدور الأساسي غير المحددة يدوياً
  screenPerms: Record<string, ScreenPermission>;
}

export type NotificationType = 'low_stock' | 'expiry' | 'overdue_invoice' | 'expense_due' | 'cost_alert' | 'report_due' | 'task_assigned';

export interface SystemNotification {
  id: string;
  type: NotificationType;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  tab?: string;
}

export type TaskType = 'approval' | 'stock_count' | 'grn_verify' | 'purchase_request' | 'review' | 'general';
export type TaskStatus = 'open' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  branchId?: string;
  assigneeIds: string[];
  assignedBy: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  tab?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  timestamp: string;
  details?: string;
  entityType?: string;
  entityId?: string;
}

export type ReportType = 'sales_summary' | 'cost_report' | 'pl_statement' | 'inventory_report' | 'wastage_report' | 'variance_report';
export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface ScheduledReport {
  id: string;
  name: string;
  type: ReportType;
  frequency: ReportFrequency;
  branchScope: 'all' | 'current';
  enabled: boolean;
  lastRun?: string;
}

export interface AutomationRule {
  id: string;
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  config?: { daysBefore?: number };
}