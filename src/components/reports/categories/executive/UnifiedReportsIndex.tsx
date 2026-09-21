import React, { useState } from 'react';
import { PiggyBank, DollarSign, Trash2, Wallet, Boxes, ShoppingCart, CircleDollarSign, BarChart3, Activity } from 'lucide-react';
import { Card } from '../../../ui';
import { UnifiedProfitabilityReport } from './UnifiedProfitabilityReport';
import { UnifiedSalesReport } from './UnifiedSalesReport';
import { UnifiedWastageReport } from './UnifiedWastageReport';
import { UnifiedExpensesReport } from './UnifiedExpensesReport';
import { UnifiedInventoryReport } from './UnifiedInventoryReport';
import { UnifiedPurchasesReport } from './UnifiedPurchasesReport';
import { UnifiedLaborReport } from './UnifiedLaborReport';
import { UnifiedCashFlowReport } from './UnifiedCashFlowReport';
import { UnifiedSalesLedgerReport } from './UnifiedSalesLedgerReport';
import { UnifiedManagementRatiosReport } from './UnifiedManagementRatiosReport';
import { UnifiedMonthlyBranchReport } from './UnifiedMonthlyBranchReport';

type ReportId =
  | 'profitability' | 'sales' | 'wastage' | 'expenses'
  | 'inventory' | 'purchases' | 'labor' | 'cashflow'
  | 'salesledger' | 'ratios' | 'monthlybranch';

interface ReportDef {
  id: ReportId;
  label: string;
  description: string;
  icon: React.ReactNode;
  render: React.ReactNode;
}

/** فهرس التقارير الموحدة: نافذة تنتقل بين كل التقارير المبنية على المحرك الموحد */
export const UnifiedReportsIndex: React.FC = () => {
  const [active, setActive] = useState<ReportId>('profitability');

  const reports: ReportDef[] = [
    { id: 'profitability', label: 'الربحية', description: 'P&L حسب الفرع', icon: <PiggyBank className="w-4 h-4" />, render: <UnifiedProfitabilityReport /> },
    { id: 'sales', label: 'المبيعات', description: 'إجماليات وحسب الفرع/المصدر', icon: <DollarSign className="w-4 h-4" />, render: <UnifiedSalesReport /> },
    { id: 'wastage', label: 'الهالك', description: 'الضياع حسب الفرع والتصنيف', icon: <Trash2 className="w-4 h-4" />, render: <UnifiedWastageReport /> },
    { id: 'expenses', label: 'المصاريف', description: 'حسب الحالة والفئة والفرع', icon: <Wallet className="w-4 h-4" />, render: <UnifiedExpensesReport /> },
    { id: 'inventory', label: 'المخزون', description: 'تقييم المخزون الحالي', icon: <Boxes className="w-4 h-4" />, render: <UnifiedInventoryReport /> },
    { id: 'purchases', label: 'المشتريات', description: 'أوامر الشراء والاستلامات', icon: <ShoppingCart className="w-4 h-4" />, render: <UnifiedPurchasesReport /> },
    { id: 'labor', label: 'العمالة', description: 'تكلفة الورديات', icon: <CircleDollarSign className="w-4 h-4" />, render: <UnifiedLaborReport /> },
    { id: 'cashflow', label: 'التدفق النقدي', description: 'المقبوضات والمدفوعات شهرياً', icon: <Wallet className="w-4 h-4" />, render: <UnifiedCashFlowReport /> },
    { id: 'salesledger', label: 'دفتر المبيعات', description: 'المبيعات حسب الصنف والفرع واليوم', icon: <BarChart3 className="w-4 h-4" />, render: <UnifiedSalesLedgerReport /> },
    { id: 'ratios', label: 'مؤشرات KPI', description: 'نسب الربحية ودوران المخزون', icon: <Activity className="w-4 h-4" />, render: <UnifiedManagementRatiosReport /> },
    { id: 'monthlybranch', label: 'شهري للفروع', description: 'إيرادات وتكلفة المبيعات شهرياً', icon: <BarChart3 className="w-4 h-4" />, render: <UnifiedMonthlyBranchReport /> },
  ];

  const current = reports.find((r) => r.id === active)!;

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold text-slate-500 px-1">التقارير الموحدة</span>
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1.5 ${
                active === r.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
              }`}
            >
              {r.icon}
              {r.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-extrabold text-indigo-700">{current.icon} {current.label}</span>
          <span className="text-slate-400">— {current.description}</span>
        </div>
        {current.render}
      </div>
    </div>
  );
};

export default UnifiedReportsIndex;