import React, { useState, useMemo } from 'react';
import {
  FileChartColumn,
  BarChart3,
  Building2,
  ChefHat,
  ShoppingBag,
  TrendingUp,
  Search,
  X,
  ArrowRight,
  Settings,
  LayoutGrid,
  Scale,
  TrendingDown,
  GitCompare,
  LineChart,
  History,
  ArrowUpDown,
  Wallet,
  Network,
  CreditCard,
  ShoppingCart,
  CalendarDays,
  RefreshCcw,
  ShieldCheck,
  Gauge,
  ClipboardList,
  PackageX,
  BellRing,
  Hourglass,
  Layers,
  Truck,
  Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Card,
  PageHeader,
  Btn,
  Field,
  inputCls,
} from '../ui';
import { monthLabel } from '../../utils/helpers';
import { COGSCategoryReport } from './reports/COGSCategoryReport';
import { COGSBranchReport } from './reports/COGSBranchReport';
import { COGSRecipeReport } from './reports/COGSRecipeReport';
import { MarginAnalysisReport } from './reports/MarginAnalysisReport';
import { TheoreticalVsActualReport } from './reports/TheoreticalVsActualReport';
import { FoodCostTrendReport } from './reports/FoodCostTrendReport';
import { BranchScorecardReport } from './reports/BranchScorecardReport';
import { PeriodOverPeriodReport } from './reports/PeriodOverPeriodReport';
import { ProfitCenterPLReport } from './reports/ProfitCenterPLReport';
import { PriceHistoryReport } from './reports/PriceHistoryReport';
import { StockMovementsReport } from './reports/StockMovementsReport';
import { InventoryValuationReport } from './reports/InventoryValuationReport';
import { DistributionsReport } from './reports/DistributionsReport';
import { ApAgingReport } from './reports/ApAgingReport';
import { SalesByItemReport } from './reports/SalesByItemReport';
import { FoodCostDailyReport } from './reports/FoodCostDailyReport';
import { InventoryTurnoverReport } from './reports/InventoryTurnoverReport';
import { InventoryHealthReport } from './reports/InventoryHealthReport';
import { StockLimitsReport } from './reports/StockLimitsReport';
import { GrnRegisterReport } from './reports/GrnRegisterReport';
import { StockCoverDaysReport } from './reports/StockCoverDaysReport';
import { LowStockAlertsReport } from './reports/LowStockAlertsReport';
import { InventoryAgingReport } from './reports/InventoryAgingReport';
import { AbcXyzReport } from './reports/AbcXyzReport';
import { SalesDailySummaryReport } from './reports/SalesDailySummaryReport';
import { PurchasesBySupplierReport } from './reports/PurchasesBySupplierReport';
import { PurchasesReportView } from '../reports/PurchasesReportView';

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

type ReportTab = 'home' | 'cogs_category' | 'cogs_branch' | 'purchases_register' | 'cogs_recipe' | 'margin_analysis' | 'theoretical_vs_actual' | 'food_cost_trend12' | 'branch_scorecard' | 'period_over_period' | 'profit_center_pl' | 'price_history_material' | 'stock_movements' | 'inventory_valuation' | 'distributions' | 'ap_aging' | 'sales_by_item' | 'food_cost_daily' | 'inventory_turnover' | 'inventory_health' | 'stock_limits' | 'grn_register' | 'stock_cover_days' | 'low_stock_alerts' | 'inventory_aging' | 'abc_xyz' | 'sales_daily_summary' | 'purchases_by_supplier';

const REPORT_CARDS = [
  {
    id: 'cogs_category' as ReportTab,
    icon: BarChart3,
    title: 'تكلفة الأصناف حسب التصنيف (COGS by Category)',
    subtitle: 'مأكولات / مشروبات — كميات، إيراد، تكلفة، ربح، نسب — مطابق لنموذج الشركة',
    badge: 'جاهز',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'cogs_branch' as ReportTab,
    icon: Building2,
    title: 'تكلفة الأصناف حسب الفرع (COGS by Branch)',
    subtitle: '12 فرعاً كأعمدة — صنف × فرع × كمية/إيراد/تكلفة/هامش — إجماليات ونسب',
    badge: 'جاهز',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    badgeColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'purchases_register' as ReportTab,
    icon: ShoppingBag,
    title: 'سجل مشتريات الأصناف وانحراف الأسعار (Purchases Register & Price Variance)',
    subtitle: 'اسم الصنف، الفرع، رقم الفاتورة، المورد، الكمية، السعر — مرتب بالصنف وتاريخ الشراء + تحليل الانحراف% لفترة وعدة فروع',
    badge: 'جاهز',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'cogs_source' as ReportTab,
    icon: ShoppingBag,
    title: 'تكلفة الأصناف حسب المصدر (POS / Delivery / Foodics)',
    subtitle: 'قناة البيع × صنف — عمولات التوصيل — تحليل ربحية القناة',
    badge: 'قريباً',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'cogs_recipe' as ReportTab,
    icon: ChefHat,
    title: 'تكلفة الوصفات: معياري vs فعلي (Recipe Standard vs Actual)',
    subtitle: 'انحراف مواد/عمالة/Overhead لكل صنف — شلال انحراف (Waterfall)',
    badge: 'جاهز',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'margin_analysis' as ReportTab,
    icon: TrendingUp,
    title: 'تحليل هامش المساهمة ونقطة التعادل (Contribution Margin / Break-even)',
    subtitle: 'هامش متغير، تكاليف ثابتة، وحدات تعادل، هامش أمان — سيناريوهات',
    badge: 'جاهز',
    color: 'bg-rose-50 border-rose-200 text-rose-800',
    badgeColor: 'bg-rose-100 text-rose-700',
  },
  {
    id: 'theoretical_vs_actual' as ReportTab,
    icon: Scale,
    title: 'الاستهلاك النظري مقابل الفعلي (POT vs ACT)',
    subtitle: 'نظري = وصفات × مبيعات، فعلي = رصيد أول + مشتريات + تحويلات − رصيد آخر — فرق كمي/قيمي + نسبة مطابقة لكل مادة وتصنيف',
    badge: 'جاهز',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'food_cost_trend12' as ReportTab,
    icon: TrendingDown,
    title: 'اتجاه تكلفة الطعام — 12 شهر (Food Cost Trend)',
    subtitle: 'نسبة تكلفة الطعام الشهرية = Σ تكلفة ÷ Σ إيراد — منحنى هدف متقطع، مقارنة شهرية، مؤشر الفروع',
    badge: 'جاهز',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'branch_scorecard' as ReportTab,
    icon: Building2,
    title: 'بطاقة أداء الفروع (Branch Scorecard)',
    subtitle: 'مقارنة مؤشرات تشغيلية مجمعة لكل فرع — إيراد ← طعام ← هدر ← هامش ← عمالة+تشغيل ← صافي + نقطة تعادل وهامش أمان، وأفضل/أسوأ فرع',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'period_over_period' as ReportTab,
    icon: GitCompare,
    title: 'مقارنة الفترات (Period over Period)',
    subtitle: 'فترتان: نمو% وفرق لكل مؤشر (إيراد/كمية/نسبة طعام) — قاعدة النسب = Σ تكلفة ÷ Σ إيراد لكل فترة',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'profit_center_pl' as ReportTab,
    icon: LineChart,
    title: 'قائمة دخل مركز الربح (Profit Center P&L)',
    subtitle: 'فرع أو شركة مجمعة: المبيعات ← ضريبة ← طعام ← هدر ← مساهمة ← عمالة ← تشغيل ← صافي + تكلفة أولية وتعادل',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'price_history_material' as ReportTab,
    icon: History,
    title: 'سجل أسعار الشراء — المواد (Price History)',
    subtitle: 'سلسلة أسعار من سندات الاستلام: متوسط مرجح، آخر/أدنى/أعلى سعر، تذبذب%، ومقارنة الموردين',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'stock_movements' as ReportTab,
    icon: ArrowUpDown,
    title: 'حركات المخزون التفصيلية (Stock Movements)',
    subtitle: 'وارد/صادر/صافي لكل نوع حركة وسند — خلاصة الأنواع + كشف تفصيلي بالفترة والفرع والمادة',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'inventory_valuation' as ReportTab,
    icon: Wallet,
    title: 'تقييم المخزون (Inventory Valuation)',
    subtitle: 'رصيد × آخر سعر استلام (GRN) — قيمة المجموع بالفرع والتصنيف ونسب التوزيع',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'distributions' as ReportTab,
    icon: Network,
    title: 'مراجعة توزيعات البوت (Distributions Review)',
    subtitle: 'جودة مطابقة رسائل التوزيع (تلقائي/تقريبي/غير مطابق/مجهول) + الحالة والكميات الموزعة',
    badge: 'جديد',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'ap_aging' as ReportTab,
    icon: CreditCard,
    title: 'الحسابات الدائنة وتقادمها (AP Aging)',
    subtitle: 'مستحقات سندات الاستلام (شامل الضريبة) بشرائح: غير مستحق → 0-30 → 31-60 → 61-90 → +90 — حسب المورد والفرع',
    badge: 'جديد',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'sales_by_item' as ReportTab,
    icon: ShoppingCart,
    title: 'المبيعات حسب العنصر (Sales by Item)',
    subtitle: 'إيراد صافي بعد الضريبة، كميات مباعة، تكلفة مواد، وهامش مساهمة لكل صنف — مع حد أدنى للإيراد',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'food_cost_daily' as ReportTab,
    icon: CalendarDays,
    title: 'تكلفة الطعام اليومية (Food Cost Daily)',
    subtitle: 'نسبة تكلفة الطعام لكل يوم (Σ تكلفة ÷ Σ إيراد): Δ مقابل السابق، متوسط تراكمي، وهدف من الوصفات',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'inventory_turnover' as ReportTab,
    icon: RefreshCcw,
    title: 'معدل دوران المخزون (Inventory Turnover)',
    subtitle: 'دوران = صادر ÷ متوسط الرصيد، أيام تغطية (DOS)، قيمة تقديرية، ومواد بطيئة الحركة بالفروع',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'inventory_health' as ReportTab,
    icon: ShieldCheck,
    title: 'صحة بيانات المخزون (Inventory Health)',
    subtitle: 'درجة سلامة: أرصدة سالبة، أصناف/حركات يتيمة، صفوف مكررة، ومواد بلا سعر — فحوص قابلة للتنفيذ',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'stock_limits' as ReportTab,
    icon: Gauge,
    title: 'الانحراف عن حدي المخزون (Stock Limits)',
    subtitle: 'رصيد مقابل الحد الأدنى/الأقصى لكل مادة×فرع: تحت/ضمن/فوق/بلا حدود + نسبة الالتزام وقيمة النقص',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'grn_register' as ReportTab,
    icon: ClipboardList,
    title: 'سجل سندات الاستلام (GRN Register)',
    subtitle: 'كل سند: المورد، الفرع، التاريخ/الفاتورة، القيمة والضريبة، الشمول، الأصناف، والحالة — مع إجماليات',
    badge: 'جديد',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'stock_cover_days' as ReportTab,
    icon: PackageX,
    title: 'أيام التغطية المتاحة (Stock Cover / Days of Supply)',
    subtitle: 'رصيد ختامي ÷ متوسط الاستهلاك اليومي: نشط/متوسط/بطيء + تغطية مرجحة بالقيمة — إشارة إعادة طلب (REORDER)',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'low_stock_alerts' as ReportTab,
    icon: BellRing,
    title: 'تنبيهات انخفاض المخزون (Low Stock Alerts)',
    subtitle: 'مواد تحت حد الأمان (minStockLevel) أو قريبة منه أو بلا حد — النقص الكمي/القيمي لتغذية الطلب',
    badge: 'جديد',
    color: 'bg-rose-50 border-rose-200 text-rose-800',
    badgeColor: 'bg-rose-100 text-rose-700',
  },
  {
    id: 'inventory_aging' as ReportTab,
    icon: Hourglass,
    title: 'أقدمية المخزون (Inventory Aging)',
    subtitle: 'عمر المادة منذ آخر حركة: نشط ≤7 → راكد >90 يوم — كشف رأس المال الراكد وقيمته',
    badge: 'جديد',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'abc_xyz' as ReportTab,
    icon: Layers,
    title: 'تصنيف ABC/XYZ للمواد (ABC & XYZ Analysis)',
    subtitle: 'قيمة استهلاكية 80/95% (ABC) × انتظام أيام الصرف 60/25% (XYZ) — أولية المراقبة وسياسة الطلب',
    badge: 'جديد',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'sales_daily_summary' as ReportTab,
    icon: Clock,
    title: 'ملخص المبيعات اليومي (Daily Sales Summary)',
    subtitle: 'يوم × إيراد خام/صافي/ضريبة، تكلفة طعام، عدد سجلات ومتوسطها — إنذار انحراف يومي',
    badge: 'جديد',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'purchases_by_supplier' as ReportTab,
    icon: Truck,
    title: 'المشتريات حسب المورد (Purchases by Supplier)',
    subtitle: 'سندات معتمدة × مورد: القيمة والحصة% ومتوسط السند وأطراف فريدة — دعم التفاوض',
    badge: 'جديد',
    color: 'bg-violet-50 border-violet-200 text-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700',
  },
];

export const AdvancedReportingSystemView: React.FC = () => {
  const { batchSalesRecords, branches, currentUser } = useApp();
  const [activeView, setActiveView] = useState<ReportTab>('home');
  const [searchQuery, setSearchQuery] = useState('');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );

  const currentPeriod = useMemo(() => periods[0] || new Date().toISOString().slice(0, 7), [periods]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return REPORT_CARDS;
    return REPORT_CARDS.filter((c) =>
      c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const renderActiveReport = () => {
    switch (activeView) {
      case 'cogs_category':
        return <COGSCategoryReport />;
      case 'cogs_branch':
        return <COGSBranchReport />;
      case 'purchases_register':
        return <PurchasesReportView />;
      case 'cogs_recipe':
        return <COGSRecipeReport />;
      case 'margin_analysis':
        return <MarginAnalysisReport />;
      case 'theoretical_vs_actual':
        return <TheoreticalVsActualReport />;
      case 'food_cost_trend12':
        return <FoodCostTrendReport />;
      case 'branch_scorecard':
        return <BranchScorecardReport />;
      case 'period_over_period':
        return <PeriodOverPeriodReport />;
      case 'profit_center_pl':
        return <ProfitCenterPLReport />;
      case 'price_history_material':
        return <PriceHistoryReport />;
      case 'stock_movements':
        return <StockMovementsReport />;
      case 'inventory_valuation':
        return <InventoryValuationReport />;
      case 'distributions':
        return <DistributionsReport />;
      case 'ap_aging':
        return <ApAgingReport />;
      case 'sales_by_item':
        return <SalesByItemReport />;
      case 'food_cost_daily':
        return <FoodCostDailyReport />;
      case 'inventory_turnover':
        return <InventoryTurnoverReport />;
      case 'inventory_health':
        return <InventoryHealthReport />;
      case 'stock_limits':
        return <StockLimitsReport />;
      case 'grn_register':
        return <GrnRegisterReport />;
      case 'stock_cover_days':
        return <StockCoverDaysReport />;
      case 'low_stock_alerts':
        return <LowStockAlertsReport />;
      case 'inventory_aging':
        return <InventoryAgingReport />;
      case 'abc_xyz':
        return <AbcXyzReport />;
      case 'sales_daily_summary':
        return <SalesDailySummaryReport />;
      case 'purchases_by_supplier':
        return <PurchasesBySupplierReport />;
      default:
        return null;
    }
  };

  if (activeView !== 'home') {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Btn tone="ghost" className="text-xs px-3 py-1.5" onClick={() => setActiveView('home')}>
                  <ArrowRight className="w-4 h-4 rotate-180" /> العودة للمنظومة
                </Btn>
                <div className="w-px h-8 bg-slate-200" />
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {REPORT_CARDS.find((c) => c.id === activeView)?.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {REPORT_CARDS.find((c) => c.id === activeView)?.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
<span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${(REPORT_CARDS.find((c) => c.id === activeView)?.badgeColor)}`}>
                  {REPORT_CARDS.find((c) => c.id === activeView)?.badge}
                </span>
              </div>
            </div>
          </div>
        </div>
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {renderActiveReport()}
        </main>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="منظومة التقارير المتطورة المتكاملة"
        subtitle={`${COMPANY} — منظومة موحدة للتقارير الاحترافية: تكلفة، مخزون، مشتريات، مالية — كل تقرير شاشة مستقلة، طباعة منفردة، تصدير متعدد`}
        icon={<FileChartColumn className="w-6 h-6 text-indigo-600" />}
        actions={
          <>
          </>
        }
      />

      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">منظومة جديدة — مبنية من الصفر</h3>
            <p className="text-indigo-100 text-sm mt-1">
              لا تبويبات داخل تقرير — كل تقرير شاشة مستقلة — زرار طباعة/تصدير منفردة — رسوم احترافية — مطابق لنموذج P&L
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold">v1.0.0</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold">77+ تقرير مخطط</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold">معمارية موحدة</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="sm:w-72 flex-shrink-0">
          <Card className="p-4 h-full">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-indigo-600" /> مجموعات التقارير
              </h4>
<span className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-indigo-100 text-indigo-700">
                {REPORT_CARDS.length} تقارير
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <p className="font-bold text-blue-800 flex items-center gap-1">
                  <BarChart3 className="w-4 h-4" /> التكلفة والأرباح (Cost & Profit)
                </p>
                <p className="text-[11px] text-blue-600 mt-1">COGS، هامش، وصفات، Point of Break-even، سيناريوهات</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="font-bold text-emerald-800 flex items-center gap-1">
                  <Building2 className="w-4 h-4" /> المبيعات والفروع
                </p>
                <p className="text-[11px] text-emerald-600 mt-1">COGS by Branch، Source Profitability، Channel Mix</p>
              </div>
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                <p className="font-bold text-violet-800 flex items-center gap-1">
                  <ShoppingBag className="w-4 h-4" /> المشتريات والموردين
                </p>
                <p className="text-[11px] text-violet-600 mt-1">GRN، مقارنة أسعار، Scorecard، توفير، Aging</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <p className="font-bold text-amber-800 flex items-center gap-1">
                  <ChefHat className="w-4 h-4" /> المخزون والحركة
                </p>
                <p className="text-[11px] text-amber-600 mt-1">Stock Movements، Theoretical vs Actual، دوران، ABC/XYZ</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex-1">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1">
              <Field label="البحث في التقارير">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="اكتب للبحث: تكلفة، فرع، صنف، وصفة..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={inputCls + ' pl-10'}
                  />
                </div>
              </Field>
            </div>
            <Btn tone="ghost" onClick={() => setSearchQuery('')}>
              <X className="w-4 h-4" /> مسح
            </Btn>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            {filteredCards.map((card) => (
              <div
                key={card.id}
                className={card.color + ' border transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer rounded-2xl border-slate-200 bg-white p-4'}
                onClick={() => card.badge !== 'قريباً' && setActiveView(card.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center shadow-sm shrink-0">
                    <card.icon className="w-6 h-6 text-slate-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900 truncate">{card.title}</h4>
<span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${card.badgeColor} shrink-0`}>
                        {card.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{card.subtitle}</p>
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/50">
                      {card.badge !== 'قريباً' && (
                        <Btn className="flex-1 text-xs px-3 py-1.5" onClick={(e) => { e.stopPropagation(); setActiveView(card.id); }}>
                          <ArrowRight className="w-4 h-4 ml-1" /> فتح التقرير
                        </Btn>
                      )}
                      {card.badge === 'قريباً' && (
                        <span className="text-[11px] text-slate-400 flex-1 text-center py-1.5">
                          قيد التطوير
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Card className="p-6 bg-slate-50 border-slate-200">
        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" /> إعدادات المنظومة العالمية
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="الشركة">
            <input type="text" value={COMPANY} readOnly className={inputCls + ' bg-slate-100 cursor-not-allowed'} />
          </Field>
          <Field label="الفترة الافتراضية">
            <input type="text" value={monthLabel(currentPeriod)} readOnly className={inputCls + ' bg-slate-100 cursor-not-allowed'} />
          </Field>
          <Field label="عدد الفروع">
            <input type="text" value={branches.length.toString()} readOnly className={inputCls + ' bg-slate-100 cursor-not-allowed'} />
          </Field>
          <Field label="المستخدم">
            <input type="text" value={currentUser?.name || '-'} readOnly className={inputCls + ' bg-slate-100 cursor-not-allowed'} />
          </Field>
        </div>
      </Card>
    </div>
  );
};

export default AdvancedReportingSystemView;