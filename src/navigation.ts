import type { ComponentType } from 'react';
import {
  LayoutDashboard, ShoppingCart, Calculator, Utensils, PackageSearch,
  PackageCheck, Warehouse, Truck, ChefHat, Factory, Trash2, PieChart,
  TrendingUp, FileSpreadsheet, Compass, ShieldCheck, ScrollText, Sparkles, Printer, Crown,
  ArrowRightLeft, BarChart3, ShoppingBag, Building2, RotateCcw, Scale, Zap, Inbox,
  ClipboardList, Hammer, DatabaseBackup, Activity, BadgeCheck, BellRing, Layers, Network, Boxes, FileText, Lock, Coins, FileDown, Settings, MessageSquare, BadgeDollarSign,
  SlidersHorizontal, GitCompare, BrainCircuit, Bike, Smartphone, Gauge, CalendarDays, LayoutGrid, Scissors,
  Palette, BarChart2, Lock as LockIcon, Link2,
  FileChartColumn, Ruler, ListChecks as ListChecks2,
  LayoutTemplate, Wand2,
} from 'lucide-react';
import { Permission } from './types';

export interface NavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: Permission;
  badge?: string;
  highlight?: boolean;
  adminOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'الرئيسية',
    items: [
      { id: 'dashboard', label: 'لوحة التحكم والتحليلات', icon: LayoutDashboard, permission: 'view_dashboard' },
      { id: 'executive', label: 'لوحة القيادة التنفيذية (CEO)', icon: Crown, permission: 'view_reports', badge: 'جديد' },
      { id: 'owner_live', label: 'لوحة المالك اللحظية (Live)', icon: Activity, permission: 'view_reports', badge: 'جديد' },
      { id: 'analytics', label: 'التحليلات والرسوم البيانية', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'notifications', label: 'مركز التنبيهات', icon: BellRing, permission: 'view_dashboard', badge: 'جديد', adminOnly: true },
      { id: 'tasks', label: 'المهام والتكليفات', icon: ListChecks2, permission: 'view_dashboard', badge: 'جديد', adminOnly: true },
    ],
  },
  {
    title: 'المبيعات ونقاط البيع',
    items: [
      { id: 'pos', label: 'نقاط البيع (POS)', icon: ShoppingCart, permission: 'manage_pos' },
      { id: 'returns', label: 'المرتجعات والاسترداد', icon: RotateCcw, permission: 'manage_pos' },
      { id: 'batch_sales', label: 'إدخال مبيعات مجمعة', icon: Calculator, permission: 'manage_batch_sales' },
      { id: 'customer_order', label: 'طلب العميل الذاتي (كشك)', icon: Smartphone, permission: 'manage_pos', badge: 'جديد' },
      { id: 'delivery_integrations', label: 'تكامل تطبيقات التوصيل', icon: Bike, permission: 'manage_pos', badge: 'جديد' },
      { id: 'foodics_integration', label: 'تكامل فودكس (Foodics)', icon: BarChart3, permission: 'manage_pos', badge: 'جديد' },
      { id: 'sales_ledger', label: 'دفتر المبيعات التحليلي', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'advanced_analytics', label: 'منصة التحليلات المتقدمة', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'sales_excel_import', label: 'استيراد المبيعات من Excel', icon: FileSpreadsheet, permission: 'manage_batch_sales', badge: 'جديد' },
      { id: 'menus', label: 'قوائم الطعام', icon: Utensils, permission: 'manage_menus' },
    ],
  },
  {
    title: 'المشتريات والموردون',
    items: [
      { id: 'purchase_orders', label: 'أوامر الشراء (PO)', icon: PackageSearch, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'purchase_requests', label: 'طلبات الشراء', icon: ClipboardList, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'preliminary_supply_orders', label: 'أوامر التوريد المبدئي', icon: BadgeDollarSign, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'purchase_suggestions', label: 'اقتراحات الشراء الذكية', icon: ShoppingBag, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'seasonal_forecast', label: 'التوقعات الموسمية', icon: TrendingUp, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'purchase_variance', label: 'انحراف أوامر الشراء', icon: Scale, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'three_way_match', label: 'المطابقة الثلاثية + دفتر الدائنين', icon: Link2, permission: 'manage_invoices', badge: 'جديد' },
      { id: 'supplier_pricing', label: 'ذكاء أسعار الموردين', icon: BadgeDollarSign, permission: 'manage_suppliers', badge: 'جديد' },
      { id: 'suppliers', label: 'الموردون', icon: Truck, permission: 'manage_suppliers', badge: 'محدث' },
      { id: 'supplier_scorecard', label: 'بطاقة أداء الموردين', icon: BadgeCheck, permission: 'manage_suppliers', badge: 'جديد' },
      { id: 'supplier_returns', label: 'إذن إرجاع الموردين', icon: RotateCcw, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'messages_center', label: 'الرسائل التلقائية (واتساب/بريد)', icon: MessageSquare, permission: 'view_reports', badge: 'جديد' },
    ],
  },
  {
    title: 'دورة المواد والاستلام',
    items: [
      { id: 'material_control', label: 'دورة المواد (Material Control)', icon: RotateCcw, permission: 'manage_purchase_orders', badge: 'جديد' },
      { id: 'goods_receiving', label: 'استلام المواد (GRN)', icon: PackageCheck, permission: 'manage_grn' },
      { id: 'stock_transfers', label: 'تحويل الأصناف بين الفروع', icon: ArrowRightLeft, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'stock_transfer_costs', label: 'مقارنة تكاليف التحويل/النقل', icon: GitCompare, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'distribution_review', label: 'توزيعات واردة للمراجعة (بوت)', icon: Inbox, permission: 'manage_inventory', badge: 'بوت' },
      { id: 'intake_inbox', label: 'صندوق التحقق قبل الرفع', icon: ShieldCheck, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'requisitions', label: 'أذون الصرف الداخلي', icon: ClipboardList, permission: 'manage_requisitions', badge: 'جديد' },
    ],
  },
  {
    title: 'المخزون والجرد',
    items: [
      { id: 'inventory', label: 'المخزون والتحويلات', icon: Warehouse, permission: 'manage_inventory' },
      { id: 'batch_tracking', label: 'الدفعات FEFO وملصقات الباركود', icon: PackageSearch, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'haccp', label: 'سلامة الغذاء (HACCP)', icon: ShieldCheck, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'units', label: 'وحدات القياس (التداول)', icon: Ruler, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'low_stock_alerts', label: 'تنبيهات نقص المخزون', icon: BellRing, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'branch_stock_limits', label: 'حدود المخزون للفروع (أدنى/أقصى)', icon: SlidersHorizontal, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'ops_control', label: 'مركز الرقابة التشغيلية', icon: PackageSearch, permission: 'view_reports', badge: 'جديد' },
      { id: 'branch_stock_comparison', label: 'مقارنة الفروع (حدود المخزون)', icon: GitCompare, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'daily_inventory', label: 'الجرد اليومي للفروع', icon: ClipboardList, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'mobile_count', label: 'جرد من الجوال (سريع)', icon: Smartphone, permission: 'mobile_count', badge: 'جديد' },
      { id: 'monthly_inventory', label: 'الجرد الشهري والإقفال', icon: Lock, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'monthly_branch_report', label: 'تقرير الإيرادات والتكاليف الشهري', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'opening_balances', label: 'الأرصدة الافتتاحية للفروع', icon: FileSpreadsheet, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'inventory_movement', label: 'حركة المخزون', icon: Activity, permission: 'view_reports', badge: 'جديد' },
      { id: 'inventory_valuation', label: 'تقييم المخزون (FIFO)', icon: Layers, permission: 'view_reports', badge: 'جديد' },
      { id: 'stock_cover', label: 'تغطية المخزون (أيام)', icon: Gauge, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'potential_usage', label: 'الاستهلاك المتوقع (POT vs ACT)', icon: Calculator, permission: 'view_reports', badge: 'جديد' },
    ],
  },
  {
    title: 'الإنتاج والتكاليف المباشرة',
    items: [
      { id: 'recipes', label: 'الوصفات المعيارية (BOM)', icon: ChefHat, permission: 'manage_recipes' },
      { id: 'menu_planning', label: 'تخطيط القوائم والأطعمة', icon: CalendarDays, permission: 'manage_menus', badge: 'جديد' },
      { id: 'production_planning', label: 'تخطيط الإنتاج', icon: Factory, permission: 'manage_central_kitchen', badge: 'جديد' },
      { id: 'manufacturing', label: 'شاشة التصنيع', icon: Hammer, permission: 'manage_central_kitchen', badge: 'جديد' },
      { id: 'butcher_tests', label: 'اختبارات الجزارة والانتاجية', icon: Scissors, permission: 'manage_inventory', badge: 'جديد' },
      { id: 'central_kitchen', label: 'المطبخ المركزي', icon: Factory, permission: 'manage_central_kitchen' },
      { id: 'wastage', label: 'الهوالك والفاقد', icon: Trash2, permission: 'manage_wastage' },
    ],
  },
  {
    title: 'المصاريف والمالية',
    items: [
      { id: 'currencies', label: 'العملات المتعددة', icon: Coins, permission: 'manage_accounting', badge: 'جديد' },
      { id: 'cash_flow', label: 'قائمة التدفقات النقدية', icon: ArrowRightLeft, permission: 'view_accounting', badge: 'جديد' },
    ],
  },
{
    title: 'التقارير والتحليل',
    items: [
      { id: 'reports_dashboard', label: 'لوحة التقارير الرئيسية', icon: LayoutGrid, permission: 'view_reports', badge: 'جديد' },
      { id: 'reports_center', label: 'مركز التقارير الشامل', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'cost_reports', label: 'تقارير التكلفة', icon: PieChart, permission: 'view_reports' },
      { id: 'detailed_reports', label: 'التقارير التفصيلية والدمج الموحد', icon: FileDown, permission: 'view_reports', badge: 'جديد' },
      { id: 'food_cost_category', label: 'تكلفة الأصناف حسب المجموعات', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      // ⭐ Food Cost % from the Foodics POS export. Placed next to the existing
      //   food-cost entry because the two answer different questions: the
      //   existing ones cost HAND-ENTERED batch sales, this one costs the
      //   actual POS lines. Same permission, same badge vocabulary.
      { id: 'foodics_food_cost', label: 'نسبة تكلفة الطعام (فودكس)', icon: Utensils, permission: 'view_reports', badge: 'جديد' },
      { id: 'cost_centers', label: 'مراكز التكلفة (الفروع)', icon: Boxes, permission: 'view_reports', badge: 'جديد' },
      { id: 'cost_analysis', label: 'تحليل التكلفة المتقدم', icon: Activity, permission: 'view_reports', badge: 'جديد' },
      { id: 'profit_heatmap', label: 'خريطة الربحية الحرارية (فئة×فرع×فترة)', icon: BarChart3, permission: 'view_reports', badge: 'جديد' },
      { id: 'what_if', label: 'محاكاة ماذا لو (التكلفة)', icon: SlidersHorizontal, permission: 'view_reports', badge: 'جديد' },
      { id: 'cost_intelligence', label: 'مركز تقارير التكلفة المتقدمة', icon: BrainCircuit, permission: 'view_reports', badge: 'جديد' },
      { id: 'true_cost', label: 'التكلفة الحقيقية والشراء الذكي', icon: Layers, permission: 'view_reports', badge: 'جديد' },
      { id: 'menu_engineering', label: 'هندسة القائمة', icon: TrendingUp, permission: 'view_reports' },
      { id: 'pl_statement', label: 'القوائم المالية (P&L)', icon: FileSpreadsheet, permission: 'view_reports' },
      { id: 'management_ratios', label: 'المؤشرات الإدارية (KPI)', icon: Activity, permission: 'view_reports', badge: 'جديد' },
      { id: 'cost_center_comparison', label: 'مقارنة مراكز التكلفة', icon: GitCompare, permission: 'view_reports', badge: 'جديد' },
      { id: 'theoretical_consumption', label: 'الاستهلاك النظري (مبيعات → مواد)', icon: BarChart2, permission: 'view_reports', badge: 'جديد' },
      { id: 'consumption_matrix', label: 'استهلاك يومي مصفوفي (الصنف × الفروع)', icon: CalendarDays, permission: 'view_reports', badge: 'جديد', highlight: true },
      { id: 'report_designer', label: 'مصمّم التقارير المخصصة (باني داخلي + jsreport)', icon: LayoutTemplate, permission: 'view_reports', badge: 'جديد', highlight: true },
    ],
  },
  {
    title: 'المالية والإقفال',
    items: [
      { id: 'month_end_close', label: 'معالج إقفال نهاية الشهر', icon: LockIcon, permission: 'manage_accounting', badge: 'جديد' },
      { id: 'day_end_close', label: 'معالج إغلاق اليوم (نهاية الدوام)', icon: LockIcon, permission: 'manage_accounting', badge: 'جديد' },
      { id: 'eod_board', label: 'لوحة الإقفال اليومي الموحدة', icon: LockIcon, permission: 'manage_accounting', badge: 'جديد' },
    ],
  },
  {
    title: 'النظام والإدارة',
    items: [
      { id: 'branches', label: 'إدارة الفروع', icon: Building2, permission: 'manage_branches', badge: 'جديد' },
      { id: 'companies', label: 'شركات النظام والمجموعة', icon: Building2, permission: 'manage_users', badge: 'جديد' },
      { id: 'user_management', label: 'إدارة المستخدمين والصلاحيات', icon: ShieldCheck, permission: 'manage_users', badge: 'جديد' },
      { id: 'webhooks', label: 'ويب هوك الأحداث (Webhooks)', icon: Link2, permission: 'manage_users', badge: 'جديد', adminOnly: true },
      { id: 'access_roles', label: 'نموذج صلاحيات الشاشات (متقدم)', icon: ShieldCheck, permission: 'manage_users', badge: 'جديد' },
      { id: 'audit_log', label: 'سجل التدقيق', icon: ScrollText, permission: 'manage_users', badge: 'جديد' },
      { id: 'automation', label: 'الأتمتة والتقارير المجدولة', icon: Zap, permission: 'view_reports', badge: 'جديد' },
      { id: 'backup_center', label: 'النسخ الاحتياطي المتطور', icon: DatabaseBackup, permission: 'reset_system', badge: 'جديد' },
      { id: 'system_center', label: 'مركز النظام (طباعة/تصدير)', icon: Printer, permission: 'view_reports' },
      { id: 'system_settings', label: 'إعدادات النظام', icon: Settings, permission: 'reset_system' },
      { id: 'category_management', label: 'إدارة تصنيفات المواد', icon: Palette, permission: 'reset_system', badge: 'جديد' },
    ],
  },
  {
    title: 'منظومة التقارير المتطورة المتكاملة',
    items: [
      { id: 'advanced_reporting', label: 'منظومة التقارير المتطورة المتكاملة', icon: FileChartColumn, permission: 'view_reports', badge: 'جديد', highlight: true },
      { id: 'reporting_module', label: 'التقارير الموحدة (جديد)', icon: FileChartColumn, permission: 'view_reports', badge: 'جديد' },
      { id: 'multi_branch_reports', label: 'الرؤية المتعددة الفروع (تقارير موحّدة)', icon: LayoutGrid, permission: 'view_reports', badge: 'جديد' },
    ],
  },
  {
    title: 'الذكاء الاصطناعي والدعم',
    items: [
      { id: 'ai_advisor', label: 'المستشار الذكي', icon: Sparkles, permission: 'use_ai' },
      { id: 'ai_branches', label: 'الشاشة المجمعة للفروع (ذكاء اصطناعي)', icon: Network, permission: 'use_ai', badge: 'جديد' },
      { id: 'ai_report', label: 'التقرير التنفيذي الذكي', icon: FileText, permission: 'use_ai', badge: 'جديد' },
      { id: 'ai_dev', label: 'مساعد التطوير المدمج', icon: Wand2, permission: 'use_ai', badge: 'جديد' },
      { id: 'guide', label: 'دليل الاستخدام', icon: Compass, permission: 'view_dashboard' },
    ],
  },
];

export const getNavItem = (id: string): NavItem | undefined =>
  NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === id);

// سجل كل شاشات النظام (يستخدمه نموذج الصلاحيات المتقدم)
export const SCREENS: { id: string; label: string; section: string }[] =
  NAV_SECTIONS.flatMap((s) => s.items.map((it) => ({ id: it.id, label: it.label, section: s.title })));