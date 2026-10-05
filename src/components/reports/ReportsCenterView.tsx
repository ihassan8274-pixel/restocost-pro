import React, { useState } from 'react';
import {
  BarChart3, PiggyBank, Boxes, ShoppingCart, Wallet, Layers, FileText, Users,
} from 'lucide-react';
import { Card } from '../ui';
import { CostReportsView } from './CostReportsView';
import { PLStatementView } from './PLStatementView';
import { CashFlowView } from './CashFlowView';
import { InventoryMovementView } from './InventoryMovementView';
import { InventoryValuationView } from './InventoryValuationView';
import { CostCenterComparisonView } from './CostCenterComparisonView';
import { ReportsAnalyticsView } from './ReportsAnalyticsView';
import { MenuEngineeringView } from './MenuEngineeringView';
import { PotentialUsageView } from './PotentialUsageView';
import { AdvancedCostAnalysisView } from './AdvancedCostAnalysisView';
import { CostIntelligenceView } from './CostIntelligenceView';
import { TrueCostView } from './TrueCostView';
import { DetailedReportsView } from './DetailedReportsView';
import { PurchasesReportView } from './PurchasesReportView';
import { OperationsControlView } from './OperationsControlView';
import { ProfessionalReportsView } from './ProfessionalReportsView';
import { ERPFinancialReportsView } from './ERPFinancialReportsView';
import { ERPInventoryReportsView } from './ERPInventoryReportsView';
import { ERPHROperationsReportsView } from './ERPHROperationsReportsView';
import { UnifiedPurchasesReport } from './categories/executive/UnifiedPurchasesReport';
import { UnifiedLaborReport } from './categories/executive/UnifiedLaborReport';
import { UnifiedCashFlowReport } from './categories/executive/UnifiedCashFlowReport';
import { UnifiedSalesLedgerReport } from './categories/executive/UnifiedSalesLedgerReport';
import { UnifiedManagementRatiosReport } from './categories/executive/UnifiedManagementRatiosReport';
import { UnifiedMonthlyBranchReport } from './categories/executive/UnifiedMonthlyBranchReport';
import { UnifiedReportsIndex } from './categories/executive/UnifiedReportsIndex';

type TabId = 'overview' | 'cost' | 'financial' | 'inventory' | 'purchases' | 'professional' | 'erp_financial' | 'erp_inventory' | 'erp_hr_ops';

interface TabDef {
  id: TabId;
  label: string;
  description: string;
  icon: React.ReactNode;
  render: React.ReactNode;
}

export const ReportsCenterView: React.FC = () => {
  const [tab, setTab] = useState<TabId>('overview');

  const tabs: TabDef[] = [
    {
      id: 'overview', label: 'نظرة عامة وتحليلات', description: 'الملخص التنفيذي، أداء الفروع، المبيعات، والرقابة التشغيلية', icon: <BarChart3 className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <UnifiedReportsIndex />
          <UnifiedSalesLedgerReport />
          <DetailedReportsView />
          <ReportsAnalyticsView />
          <OperationsControlView />
        </div>
      ),
    },
    {
      id: 'cost', label: 'التكاليف والتحليل', description: 'تكلفة الطعام، التكلفة الحقيقية، الذكاء التكلفي', icon: <PiggyBank className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <CostReportsView />
          <TrueCostView />
          <CostIntelligenceView />
          <AdvancedCostAnalysisView />
          <CostCenterComparisonView />
          <UnifiedManagementRatiosReport />
        </div>
      ),
    },
    {
      id: 'financial', label: 'المالية', description: 'قائمة الدخل، التدفق النقدي، تقارير الفروع الشهرية', icon: <Wallet className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <UnifiedCashFlowReport />
          <UnifiedMonthlyBranchReport />
          <PLStatementView />
          <CashFlowView />
        </div>
      ),
    },
    {
      id: 'inventory', label: 'المخزون', description: 'حركة المخزون، تقييم المخزون، هندسة المنيو، الاستخدام المحتمل', icon: <Boxes className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <InventoryMovementView />
          <InventoryValuationView />
          <MenuEngineeringView />
          <PotentialUsageView />
        </div>
      ),
    },
    {
      id: 'purchases', label: 'المشتريات', description: 'أوامر الشراء والمورّدون', icon: <ShoppingCart className="w-4 h-4" />,
      render: (
        <div className="space-y-6">
          <UnifiedPurchasesReport />
          <UnifiedLaborReport />
          <PurchasesReportView />
        </div>
      ),
    },
    {
      id: 'professional', label: 'احترافية متكاملة', description: 'تقارير احترافية بتصدير PDF لكل تقرير', icon: <Layers className="w-4 h-4" />,
      render: (
        <ProfessionalReportsView />
      ),
    },
    {
      id: 'erp_financial', label: 'ERP المحاسبي', description: 'ميزان المراجعة، دفتر اليومية، الأستاذ العام، الميزانية العمومية، الأصول والاهتلاك، ضريبة القيمة المضافة، تحليل أعمار القبض/الدفع — بمعايير QuickBooks / Oracle', icon: <FileText className="w-4 h-4" />,
      render: (
        <ERPFinancialReportsView />
      ),
    },
    {
      id: 'erp_inventory', label: 'ERP المخزون', description: 'التكلفة المرجحة (WAC)، انحراف الاستهلاك، تعديلات الجرد، تغطية المخزون (أيام)، تحويلات الفروع — بمعايير Oracle Material Control', icon: <Boxes className="w-4 h-4" />,
      render: (
        <ERPInventoryReportsView />
      ),
    },
    {
      id: 'erp_hr_ops', label: 'ERP الموارد البشرية والعمليات', description: 'تكلفة العمالة، الورديات، المبيعات حسب القناة، Sales Mix، المصاريف vs الميزانية، ملخص الفواتير', icon: <Users className="w-4 h-4" />,
      render: (
        <ERPHROperationsReportsView />
      ),
    },
  ];

  const active = tabs.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border ${
              tab === t.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
          {active.icon}
          <span className="text-slate-400">مركز التقارير الشامل</span>
          <span className="text-slate-300">/</span>
          <span className="text-brand-700">{active.label}</span>
        </div>
        <p className="text-[11px] text-slate-400 font-bold mt-0.5">{active.description}</p>
      </Card>

      <div className="space-y-6">{active.render}</div>
    </div>
  );
};
