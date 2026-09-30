import React, { useState, useEffect, useRef, Suspense } from 'react';
import { AlertTriangle, AlertCircle, X, CheckCircle2, BellRing, ShieldAlert, Loader2, UtensilsCrossed, Undo2, Redo2 } from 'lucide-react';
import { AppProvider, useApp } from './stores/hooks/useAppCompat';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { SyncStrip } from './components/layout/SyncStrip';
import { VersionBanner } from './components/layout/VersionBanner';
import { GeometricPattern } from './components/decor/GeometricPattern';
import { LoginView } from './components/auth/LoginView';
import { ForcePasswordChangeView } from './components/auth/ForcePasswordChangeView';
import { Modal } from './components/ui';
import { CommandPalette } from './components/ui/CommandPalette';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { getNavItem, NAV_SECTIONS } from './navigation';
import { UserRole } from './types';

// ---- تقسيم الكود: كل شاشة تُحمَّل في حزمة مستقلة عند فتحها فقط ----
const lazyNamed = (f: () => Promise<Record<string, any>>, name: string): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(async () => ({ default: (await f())[name] }));
const lazyDefault = (f: () => Promise<{ default: React.ComponentType<any> }>): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(() => f());

const DashboardView = lazyNamed(() => import('./components/dashboard/DashboardViewMigrated'), 'DashboardViewMigrated');
const ExecutiveDashboardView = lazyNamed(() => import('./components/dashboard/ExecutiveDashboardView'), 'ExecutiveDashboardView');
const POSView = lazyNamed(() => import('./components/pos/POSView'), 'POSView');
const ReturnsView = lazyNamed(() => import('./components/pos/ReturnsView'), 'ReturnsView');
const PurchaseVarianceView = lazyNamed(() => import('./components/procurement/PurchaseVarianceView'), 'PurchaseVarianceView');
const AutomationView = lazyNamed(() => import('./components/automation/AutomationView'), 'AutomationView');
const BatchSalesView = lazyNamed(() => import('./components/pos/BatchSalesView'), 'BatchSalesView');
const BatchSalesEntryView = lazyNamed(() => import('./components/pos/BatchSalesEntryView'), 'BatchSalesEntryView');
const CustomerOrderView = lazyNamed(() => import('./components/pos/CustomerOrderView'), 'CustomerOrderView');
const BranchOrdersMonitorView = lazyNamed(() => import('./components/pos/CustomerOrderView'), 'BranchOrdersMonitorView');
const DeliveryIntegrationsView = lazyDefault(() => import('./components/delivery/DeliveryIntegrationsView'));
const FoodicsIntegrationView = lazyDefault(() => import('./components/delivery/FoodicsIntegrationView'));
const MenusView = lazyNamed(() => import('./components/menus/MenusView'), 'MenusView');
const CostReportsView = lazyNamed(() => import('./components/reports/CostReportsView'), 'CostReportsView');
const PLStatementView = lazyNamed(() => import('./components/reports/PLStatementView'), 'PLStatementView');
const FoodCostByCategoryReport = lazyNamed(() => import('./components/reports/FoodCostByCategoryReport'), 'FoodCostByCategoryReport');
const CashFlowView = lazyNamed(() => import('./components/reports/CashFlowView'), 'CashFlowView');
const InventoryMovementView = lazyNamed(() => import('./components/reports/InventoryMovementView'), 'InventoryMovementView');
const InventoryValuationView = lazyNamed(() => import('./components/reports/InventoryValuationView'), 'InventoryValuationView');
const ManagementRatiosView = lazyNamed(() => import('./components/reports/ManagementRatiosView'), 'ManagementRatiosView');
const CostCenterComparisonView = lazyNamed(() => import('./components/reports/CostCenterComparisonView'), 'CostCenterComparisonView');
const StockCoverView = lazyNamed(() => import('./components/inventory/StockCoverView'), 'StockCoverView');
const MenuPlanningView = lazyNamed(() => import('./components/menus/MenuPlanningView'), 'MenuPlanningView');
const ProductionPlanningView = lazyNamed(() => import('./components/production/ProductionPlanningView'), 'ProductionPlanningView');
const MonthlyBranchReportView = lazyNamed(() => import('./components/reports/MonthlyBranchReportView'), 'MonthlyBranchReportView');
const SalesLedgerView = lazyNamed(() => import('./components/reports/SalesLedgerView'), 'SalesLedgerView');
const ReportsAnalyticsView = lazyNamed(() => import('./components/reports/ReportsAnalyticsView'), 'ReportsAnalyticsView');
const SalesExcelBridgeView = lazyNamed(() => import('./components/sales/SalesExcelBridgeView'), 'SalesExcelBridgeView');
const MenuEngineeringView = lazyNamed(() => import('./components/reports/MenuEngineeringView'), 'MenuEngineeringView');
const PotentialUsageView = lazyNamed(() => import('./components/reports/PotentialUsageView'), 'PotentialUsageView');
const TheoreticalConsumptionReportView = lazyNamed(() => import('./components/reports/TheoreticalConsumptionReportView'), 'TheoreticalConsumptionReportView');
const ConsumptionMatrixReportView = lazyNamed(() => import('./components/reports/ConsumptionMatrixReportView'), 'ConsumptionMatrixReportView');
const ReportsHubView = lazyNamed(() => import('./components/reports/ReportsHubView'), 'ReportsHubView');
const ReportDesignerView = lazyNamed(() => import('./components/reports/ReportDesignerView'), 'ReportDesignerView');
const MultiBranchReportsView = lazyNamed(() => import('./components/reports/MultiBranchReportsView'), 'MultiBranchReportsView');
const MonthEndCloseWizardView = lazyNamed(() => import('./components/financial/MonthEndCloseWizardView'), 'MonthEndCloseWizardView');
const EndOfDayWizardView = lazyNamed(() => import('./components/financial/EndOfDayWizardView'), 'EndOfDayWizardView');
const UserManagementView = lazyNamed(() => import('./components/admin/UserManagementView'), 'UserManagementView');
const TasksView = lazyNamed(() => import('./components/admin/TasksView'), 'TasksView');
const AccessRolesView = lazyNamed(() => import('./components/admin/AccessRolesView'), 'AccessRolesView');
const AuditLogView = lazyNamed(() => import('./components/admin/AuditLogView'), 'AuditLogView');
const SystemCenterView = lazyNamed(() => import('./components/admin/SystemCenterView'), 'SystemCenterView');
const SystemSettingsView = lazyNamed(() => import('./components/admin/SystemSettingsView'), 'SystemSettingsView');
const MessagesCenterView = lazyNamed(() => import('./components/procurement/MessagesCenterView'), 'MessagesCenterView');
const SupplierReturnsView = lazyNamed(() => import('./components/procurement/SupplierReturnsView'), 'SupplierReturnsView');
const BackupCenterView = lazyNamed(() => import('./components/admin/BackupCenterView'), 'BackupCenterView');
const CategoryManagementView = lazyNamed(() => import('./components/admin/CategoryManagementView'), 'CategoryManagementView');
const AICostAdvisorView = lazyNamed(() => import('./components/ai/AICostAdvisorView'), 'AICostAdvisorView');
const AIBranchSummaryView = lazyNamed(() => import('./components/ai/AIBranchSummaryView'), 'AIBranchSummaryView');
const AIExecutiveReportView = lazyNamed(() => import('./components/ai/AIExecutiveReportView'), 'AIExecutiveReportView');
const DevAssistantView = lazyNamed(() => import('./components/ai/DevAssistantView'), 'DevAssistantView');
const OwnerLiveView = lazyNamed(() => import('./components/live/OwnerLiveView'), 'OwnerLiveView');
const WebhooksView = lazyNamed(() => import('./components/admin/WebhooksView'), 'WebhooksView');
const EodBoardView = lazyNamed(() => import('./components/financial/EodBoardView'), 'EodBoardView');
const ProfitHeatmapView = lazyNamed(() => import('./components/reports/ProfitHeatmapView'), 'ProfitHeatmapView');
const StockTransferCostsView = lazyNamed(() => import('./components/inventory/StockTransferCostsView'), 'StockTransferCostsView');
const CostCentersView = lazyNamed(() => import('./components/expenses/CostCentersView'), 'CostCentersView');
const AdvancedCostAnalysisView = lazyNamed(() => import('./components/reports/AdvancedCostAnalysisView'), 'AdvancedCostAnalysisView');
const CostIntelligenceView = lazyNamed(() => import('./components/reports/CostIntelligenceView'), 'CostIntelligenceView');
const TrueCostView = lazyNamed(() => import('./components/reports/TrueCostView'), 'TrueCostView');
const AdvancedReportingSystemView = lazyNamed(() => import('./components/advanced-reporting/AdvancedReportingSystemView'), 'AdvancedReportingSystemView');
const AnalyticsView = lazyNamed(() => import('./components/analytics/AnalyticsView'), 'AnalyticsView');
const WhatIfSimulationView = lazyNamed(() => import('./components/cost/WhatIfSimulationView'), 'WhatIfSimulationView');
const PurchaseSuggestionsView = lazyNamed(() => import('./components/procurement/PurchaseSuggestionsView'), 'PurchaseSuggestionsView');
const ThreeWayMatchView = lazyNamed(() => import('./components/procurement/ThreeWayMatchView'), 'ThreeWayMatchView');
const SupplierScorecardView = lazyNamed(() => import('./components/procurement/SupplierScorecardView'), 'SupplierScorecardView');
const BranchManagementView = lazyNamed(() => import('./components/branches/BranchManagementView'), 'BranchManagementView');
const CompaniesView = lazyNamed(() => import('./components/companies/CompaniesView'), 'CompaniesView');
const RequisitionsView = lazyNamed(() => import('./components/procurement/RequisitionsView'), 'RequisitionsView');
const CurrenciesView = lazyNamed(() => import('./components/accounting/CurrenciesView'), 'CurrenciesView');
const DetailedReportsView = lazyNamed(() => import('./components/reports/DetailedReportsView'), 'DetailedReportsView');
const ReportsCenterView = lazyNamed(() => import('./components/reports/ReportsCenterView'), 'ReportsCenterView');
const ReportsDashboardView = lazyNamed(() => import('./components/reports/ReportsDashboardView'), 'ReportsDashboardView');
const NotificationsView = lazyNamed(() => import('./components/notifications/NotificationsView'), 'NotificationsView');
const GoodsReceivingView = lazyNamed(() => import('./components/procurement/GoodsReceivingView'), 'GoodsReceivingView');
const PurchaseOrdersView = lazyNamed(() => import('./components/procurement/PurchaseOrdersView'), 'PurchaseOrdersView');
const PurchaseRequestView = lazyNamed(() => import('./components/procurement/PurchaseRequestView'), 'PurchaseRequestView');
const PreliminarySupplyOrderView = lazyNamed(() => import('./components/procurement/PreliminarySupplyOrderView'), 'PreliminarySupplyOrderView');
const MaterialControlView = lazyNamed(() => import('./components/procurement/MaterialControlView'), 'MaterialControlView');
const MonthlyInventoryView = lazyNamed(() => import('./components/inventory/MonthlyInventoryView'), 'MonthlyInventoryView');
const SuppliersView = lazyNamed(() => import('./components/procurement/SuppliersView'), 'SuppliersView');
const InventoryView = lazyNamed(() => import('./components/inventory/InventoryView'), 'InventoryView');
const BatchesFEFOView = lazyNamed(() => import('./components/inventory/BatchesFEFOView'), 'BatchesFEFOView');
const HACCPView = lazyNamed(() => import('./components/haccp/HACCPView'), 'HACCPView');
const SeasonalForecastView = lazyNamed(() => import('./components/procurement/SeasonalForecastView'), 'SeasonalForecastView');
const SupplierPricingView = lazyNamed(() => import('./components/procurement/SupplierPricingView'), 'SupplierPricingView');
const UnitsView = lazyNamed(() => import('./components/inventory/UnitsView'), 'UnitsView');
const LowStockAlertsView = lazyNamed(() => import('./components/inventory/LowStockAlertsView'), 'LowStockAlertsView');
const BranchStockLimitsView = lazyNamed(() => import('./components/inventory/BranchStockLimitsView'), 'BranchStockLimitsView');
const OperationsControlView = lazyNamed(() => import('./components/reports/OperationsControlView'), 'OperationsControlView');
const BranchComparisonView = lazyNamed(() => import('./components/inventory/BranchComparisonView'), 'BranchComparisonView');
const DailyInventoryView = lazyNamed(() => import('./components/inventory/DailyInventoryView'), 'DailyInventoryView');
const MobileCountView = lazyDefault(() => import('./components/inventory/MobileCountView'));
const OpeningBalancesView = lazyNamed(() => import('./components/inventory/OpeningBalancesView'), 'OpeningBalancesView');
const StockTransferView = lazyNamed(() => import('./components/inventory/StockTransferView'), 'StockTransferView');
const DistributionReviewView = lazyNamed(() => import('./components/inventory/DistributionReviewView'), 'DistributionReviewView');
const IntakeVerificationView = lazyNamed(() => import('./components/inventory/IntakeVerificationView'), 'IntakeVerificationView');
const RecipesView = lazyNamed(() => import('./components/production/RecipesView'), 'RecipesView');
const CentralKitchenView = lazyNamed(() => import('./components/production/CentralKitchenView'), 'CentralKitchenView');
const ManufacturingView = lazyNamed(() => import('./components/production/ManufacturingView'), 'ManufacturingView');
const ButcherTestsView = lazyNamed(() => import('./components/inventory/ButcherTestsView'), 'ButcherTestsView');
const WastageView = lazyNamed(() => import('./components/production/WastageView'), 'WastageView');

const LoadingScreen: React.FC<{ label?: string }> = ({ label = 'جارِ تحميل الشاشة...' }) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    <p className="text-sm font-bold text-slate-500">{label}</p>
  </div>
);

const Shell: React.FC = () => {
  const { currentUser, mustChangePassword, booting, getFoodCostAlerts, acknowledgeAlert, toast, showToast, can, screenCan, canUndo, canRedo, undo, redo } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [palette, setPalette] = useState<'search' | 'new' | 'export' | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      const k = e.key.toLowerCase();
      if (k === '/') { e.preventDefault(); setPalette('search'); }
      else if (k === 'n') { e.preventDefault(); setPalette('new'); }
      else if (k === 'e') { e.preventDefault(); setPalette('export'); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  const [batchSalesEditId, setBatchSalesEditId] = useState<string | null>(null);

  // فتح الشاشة المناسبة لكل دور عند التسجيل/إعادة التحميل (رؤى حسب الدور)
  const appliedRoleHomeFor = useRef<string>('');
  useEffect(() => {
    if (!currentUser) return;
    if (appliedRoleHomeFor.current === currentUser.id) return;
    appliedRoleHomeFor.current = currentUser.id;
    const homeMap: Partial<Record<UserRole, string>> = {
      executive: 'executive',
      admin: 'dashboard',
      branch_manager: 'dashboard',
      cost_controller: 'reports_dashboard',
      chef: 'recipes',
      storekeeper: 'inventory',
      waiter: 'pos',
      counter: 'mobile_count',
    };
    const target = homeMap[currentUser.role];
    if (target && target !== activeTab) {
      const navItem = getNavItem(target);
      if (navItem && (can(navItem.permission) || screenCan(target, 'view'))) setActiveTab(target);
    }
  }, [currentUser]);

  // Redirect counter users (and any role without dashboard access) to their first allowed screen
  useEffect(() => {
    if (!currentUser) return;
    const navItem = getNavItem(activeTab);
    if (navItem && ((!can(navItem.permission) && !screenCan(activeTab, 'view')) || (navItem.id === 'notifications' && !isAdmin))) {
      const firstAllowed =
        NAV_SECTIONS.flatMap((s) => s.items).find((it) => (can(it.permission) || screenCan(it.id, 'view')) && (isAdmin || !it.adminOnly))?.id
        || 'mobile_count';
      if (firstAllowed !== activeTab) setActiveTab(firstAllowed);
    }
  }, [currentUser, activeTab]);

  if (!currentUser) return <LoginView />;

  if (booting) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-primary-700 flex items-center justify-center shadow-card-hover">
            <UtensilsCrossed className="w-7 h-7 text-white" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <div className="font-bold text-primary-900 text-sm">جارِ تحميل بيانات النظام...</div>
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePassword) return <ForcePasswordChangeView />;

  const alerts = getFoodCostAlerts();
  const unackCount = alerts.filter((a) => !a.isAcknowledged).length;

  const renderView = () => {
    if (activeTab === 'notifications' && !isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><ShieldAlert className="w-8 h-8" /></div>
          <div>
            <p className="font-extrabold text-slate-900 text-base">لا تملك صلاحية الوصول لهذه الشاشة</p>
            <p className="text-xs text-slate-500 font-bold mt-1">هذه الصفحة متاحة لمدير النظام فقط</p>
          </div>
          <button onClick={() => setActiveTab('dashboard')} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-700">العودة للوحة التحكم</button>
        </div>
      );
    }
    const navItem = getNavItem(activeTab);
    if (navItem && !can(navItem.permission) && !screenCan(activeTab, 'view')) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><ShieldAlert className="w-8 h-8" /></div>
          <div>
            <p className="font-extrabold text-slate-900 text-base">لا تملك صلاحية الوصول لهذه الشاشة</p>
            <p className="text-xs text-slate-500 font-bold mt-1">هذه الصفحة تتطلب صلاحية <span className="text-rose-600">{navItem.permission}</span> — تواصل مع مسؤول النظام</p>
          </div>
          <button onClick={() => setActiveTab('dashboard')} className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-700">العودة للوحة التحكم</button>
        </div>
      );
    }
    switch (activeTab) {
      case 'executive': return <ExecutiveDashboardView onNavigate={setActiveTab} />;
      case 'pos': return <POSView />;
      case 'returns': return <ReturnsView />;
      case 'purchase_variance': return <PurchaseVarianceView />;
      case 'automation': return <AutomationView onNavigate={setActiveTab} />;
      case 'batch_sales': return <BatchSalesView onNavigate={setActiveTab} onStartEdit={(bid: string) => { setBatchSalesEditId(bid); setActiveTab('batch_sales_entry'); }} />;
      case 'batch_sales_entry': return <BatchSalesEntryView editId={batchSalesEditId} onDone={() => { setBatchSalesEditId(null); setActiveTab('batch_sales'); }} />;
      case 'customer_order': return <CustomerOrderView />;
      case 'orders_monitor': return <BranchOrdersMonitorView onNavigate={setActiveTab} />;
      case 'delivery_integrations': return <DeliveryIntegrationsView />;
      case 'foodics_integration': return <FoodicsIntegrationView />;
      case 'menus': return <MenusView />;
      case 'menu_planning': return <MenuPlanningView />;
      case 'purchase_orders': return <PurchaseOrdersView />;
      case 'purchase_requests': return <PurchaseRequestView />;
      case 'preliminary_supply_orders': return <PreliminarySupplyOrderView />;
      case 'material_control': return <MaterialControlView onNavigate={setActiveTab} />;
      case 'requisitions': return <RequisitionsView />;
      case 'currencies': return <CurrenciesView />;
      case 'detailed_reports': return <DetailedReportsView />;
      case 'monthly_inventory': return <MonthlyInventoryView />;
      case 'monthly_branch_report': return <MonthlyBranchReportView />;
      case 'purchase_suggestions': return <PurchaseSuggestionsView />;
      case 'three_way_match': return <ThreeWayMatchView />;
      case 'goods_receiving': return <GoodsReceivingView onNavigate={setActiveTab} />;
      case 'stock_transfers': return <StockTransferView />;
      case 'stock_transfer_costs': return <StockTransferCostsView />;
      case 'distribution_review': return <DistributionReviewView />;
      case 'intake_inbox': return <IntakeVerificationView />;
      case 'inventory': return <InventoryView />;
      case 'batch_tracking': return <BatchesFEFOView />;
      case 'haccp': return <HACCPView />;
      case 'seasonal_forecast': return <SeasonalForecastView />;
      case 'supplier_pricing': return <SupplierPricingView />;
      case 'units': return <UnitsView />;
      case 'low_stock_alerts': return <LowStockAlertsView />;
      case 'branch_stock_limits': return <BranchStockLimitsView />;
      case 'ops_control': return <OperationsControlView />;
      case 'branch_stock_comparison': return <BranchComparisonView />;
      case 'daily_inventory': return <DailyInventoryView />;
      case 'mobile_count': return <MobileCountView />;
      case 'opening_balances': return <OpeningBalancesView />;
      case 'suppliers': return <SuppliersView />;
      case 'supplier_scorecard': return <SupplierScorecardView />;
      case 'messages_center': return <MessagesCenterView />;
      case 'supplier_returns': return <SupplierReturnsView />;
      case 'analytics': return <AnalyticsView />;
      case 'notifications': return <NotificationsView onNavigate={setActiveTab} />;
      case 'recipes': return <RecipesView />;
      case 'manufacturing': return <ManufacturingView />;
      case 'butcher_tests': return <ButcherTestsView />;
      case 'production_planning': return <ProductionPlanningView />;
      case 'central_kitchen': return <CentralKitchenView />;
      case 'wastage': return <WastageView />;
      case 'cost_reports': return <CostReportsView />;
      case 'reports_dashboard': return <ReportsDashboardView onNavigate={setActiveTab} />;
      case 'reports_center': return <ReportsCenterView />;
      case 'report_designer': return <ReportDesignerView />;
      case 'cost_centers': return <CostCentersView />;
      case 'cost_analysis': return <AdvancedCostAnalysisView />;
      case 'profit_heatmap': return <ProfitHeatmapView />;
      case 'what_if': return <WhatIfSimulationView />;
      case 'cost_intelligence': return <CostIntelligenceView />;
      case 'true_cost': return <TrueCostView />;
      case 'menu_engineering': return <MenuEngineeringView />;
      case 'potential_usage': return <PotentialUsageView />;
      case 'theoretical_consumption': return <TheoreticalConsumptionReportView />;
      case 'consumption_matrix': return <ConsumptionMatrixReportView />;
      case 'month_end_close': return <MonthEndCloseWizardView />;
      case 'day_end_close': return <EndOfDayWizardView />;
      case 'eod_board': return <EodBoardView />;
      case 'pl_statement': return <PLStatementView />;
      case 'food_cost_category': return <FoodCostByCategoryReport />;
      case 'management_ratios': return <ManagementRatiosView />;
      case 'cost_center_comparison': return <CostCenterComparisonView />;
      case 'cash_flow': return <CashFlowView />;
      case 'inventory_movement': return <InventoryMovementView />;
      case 'inventory_valuation': return <InventoryValuationView />;
      case 'stock_cover': return <StockCoverView />;
      case 'sales_ledger': return <SalesLedgerView />;
      case 'advanced_analytics': return <ReportsAnalyticsView />;
      case 'sales_excel_import': return <SalesExcelBridgeView />;
      case 'user_management': return <UserManagementView />;
      case 'tasks': return <TasksView />;
      case 'access_roles': return <AccessRolesView />;
      case 'branches': return <BranchManagementView />;
      case 'companies': return <CompaniesView onNavigate={setActiveTab} />;
      case 'audit_log': return <AuditLogView />;
      case 'system_center': return <SystemCenterView />;
      case 'system_settings': return <SystemSettingsView onNavigate={setActiveTab} />;
      case 'category_management': return <CategoryManagementView />;
      case 'backup_center': return <BackupCenterView />;
      case 'ai_advisor': return <AICostAdvisorView />;
      case 'ai_branches': return <AIBranchSummaryView />;
      case 'ai_report': return <AIExecutiveReportView />;
      case 'ai_dev': return <DevAssistantView />;
      case 'owner_live': return <OwnerLiveView onNavigate={setActiveTab} />;
      case 'webhooks': return <WebhooksView />;
      case 'advanced_reporting': return <AdvancedReportingSystemView />;
      case 'reporting_module': return <ReportsHubView onNavigate={setActiveTab} />;
      case 'multi_branch_reports': return <MultiBranchReportsView />;
      case 'dashboard':
      default: return <DashboardView onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex relative">
      <GeometricPattern tone="gold" opacity={0.045} />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpenMobile={isOpenMobile} onCloseMobile={() => setIsOpenMobile(false)} />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header setActiveTab={setActiveTab} onToggleMobileMenu={() => setIsOpenMobile((v) => !v)} openAlerts={() => setShowAlerts(true)} />
        <SyncStrip />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Suspense fallback={<LoadingScreen />}>
            <ErrorBoundary label={getNavItem(activeTab)?.label || activeTab} onHome={() => setActiveTab('dashboard')} resetKey={activeTab}>
              {renderView()}
            </ErrorBoundary>
          </Suspense>
        </main>
      </div>

      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] animate-[fadeInDown_0.2s_ease-out] w-full max-w-md px-4">
          <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl border max-w-md ${
            toast.level === 'success'
              ? 'bg-emerald-700 text-white border-emerald-500 shadow-emerald-900/30'
              : toast.level === 'error'
              ? 'bg-rose-700 text-white border-rose-400 shadow-rose-900/30'
              : 'bg-slate-900 text-white border-slate-600 shadow-slate-900/30'
          }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              toast.level === 'success' ? 'bg-emerald-500/25 text-emerald-200'
              : toast.level === 'error' ? 'bg-rose-500/25 text-rose-200'
              : 'bg-amber-500/20 text-amber-400'
            }`}>
              {toast.level === 'success' ? <CheckCircle2 className="w-4 h-4" />
                : toast.level === 'error' ? <AlertCircle className="w-4 h-4" />
                : <BellRing className="w-4 h-4" />}
            </div>
            <p className="text-xs font-bold leading-relaxed flex-1">{toast.message}</p>
            {toast.undo && (
              <button
                onClick={() => toast.undo?.()}
                className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors"
              >
                تراجع
              </button>
            )}
            <button onClick={() => showToast('')} className="text-slate-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {(canUndo || canRedo) && (
        <div className="fixed bottom-5 left-5 z-[90] flex items-center gap-1.5 rounded-xl bg-slate-900/90 backdrop-blur border border-white/10 shadow-2xl p-1.5" dir="rtl">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition ${canUndo ? 'text-white hover:bg-white/15' : 'text-slate-600 cursor-not-allowed'}`}
            title="تراجع (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" /> تراجع
          </button>
          <span className="w-px h-4 bg-white/15" />
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition ${canRedo ? 'text-white hover:bg-white/15' : 'text-slate-600 cursor-not-allowed'}`}
            title="إعادة (Ctrl+Shift+Z / Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" /> إعادة
          </button>
        </div>
      )}

      <Modal open={isAdmin && showAlerts} onClose={() => setShowAlerts(false)} title={`تنبيهات انحراف التكلفة (${unackCount} غير مؤكدة)`} wide>
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {alerts.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-xs font-bold flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              لا توجد انحرافات حالية — كل الأطباق ضمن الهامش المستهدف
            </div>
          )}
          {alerts.map((a) => (
            <div key={a.recipeId} className={`rounded-xl border p-3 ${a.severity === 'critical' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'}`} />
                  <div>
                    <p className="font-bold text-slate-900 text-xs">{a.recipeNameAr}</p>
                    <p className="text-[10px] font-mono text-slate-500">{a.recipeCode}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-bold">
                      <span className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-700">Food Cost فعلي {a.actualFoodCostPercent.toFixed(1)}%</span>
                      <span className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-700">المستهدف {a.targetFoodCostPercent.toFixed(1)}%</span>
                      <span className="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-rose-700">زيادة {a.excessCostPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${a.severity === 'critical' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>{a.severity === 'critical' ? 'حرج' : 'تحذير'}</span>
                  {!a.isAcknowledged && (
                    <button onClick={() => acknowledgeAlert(a.recipeId)} className="flex items-center gap-1 text-[10px] font-bold bg-slate-900 text-white px-2 py-1 rounded-lg hover:bg-slate-700">
                      <CheckCircle2 className="w-3 h-3" /> تأكيد
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 bg-white/70 border border-slate-100 rounded-lg p-2 text-[10px] text-slate-600 font-bold flex items-center justify-between">
                <span>السعر المقترح للوصول للهدف: <span className="font-mono text-indigo-700">{a.suggestedPriceForTarget.toFixed(2)}</span></span>
                <span>الزيادة لكل حصة: <span className="font-mono text-rose-700">{a.excessCostPerPortion.toFixed(2)}</span></span>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3 flex justify-end">
          <button onClick={() => setShowAlerts(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium flex items-center gap-1.5"><X className="w-4 h-4" /> إغلاق</button>
        </div>
      </Modal>

      <CommandPalette open={palette !== null} mode={palette || 'search'} onClose={() => setPalette(null)} onNavigate={setActiveTab} />
      <VersionBanner />
    </div>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <Shell />
  </AppProvider>
);

export default App;