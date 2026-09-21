import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Star, BarChart3, ShoppingCart, Wallet, Boxes, Users,
  Shield, Sparkles, TrendingUp, LayoutGrid, ArrowRight,
  FileText, Calculator, Activity, PieChart, GitCompare, BrainCircuit,
  Layers, PackageSearch, Leaf, Target, HandCoins, Lightbulb,
} from 'lucide-react';
import { UnifiedReportScreen } from '../reporting-module';
import { getAllReportDefinitions } from '../reporting-module/registry';
import { useApp } from '../../context/AppContext';

const FAV_KEY = 'rcerp_reports_favorites';

type FamilyId = string;

interface LegacyReport {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  legacyTab: string;
  badge?: string;
}

const LEGACY_REPORTS: LegacyReport[] = [
  { id: 'executive', label: 'لوحة القيادة التنفيذية', description: 'نظرة شاملة على أداء الفروع والمؤشرات الرئيسية', category: 'executive', icon: <Sparkles className="w-5 h-5" />, legacyTab: 'executive' },
  { id: 'analytics', label: 'التحليلات والرسوم البيانية', description: 'تحليلات تفاعلية بالرسوم البيانية', category: 'executive', icon: <LayoutGrid className="w-5 h-5" />, legacyTab: 'analytics' },
  { id: 'sales_ledger', label: 'دفتر المبيعات التحليلي', description: 'المبيعات حسب الصنف والفرع واليوم', category: 'sales', icon: <FileText className="w-5 h-5" />, legacyTab: 'sales_ledger' },
  { id: 'monthly_branch_report', label: 'تقرير الإيرادات والتكاليف الشهري', description: 'ملخص شهري مقارن لكل الفروع', category: 'finance', icon: <BarChart3 className="w-5 h-5" />, legacyTab: 'monthly_branch_report' },
  { id: 'cost_reports', label: 'تقارير التكلفة الأساسية', description: 'تحليل التكلفة والفروقات والانحراف', category: 'foodCost', icon: <PieChart className="w-5 h-5" />, legacyTab: 'cost_reports' },
  { id: 'cost_intelligence', label: 'مركز تقارير التكلفة المتقدمة', description: 'تحليل ذكي للتكاليف عبر العوامل驱动', category: 'foodCost', icon: <BrainCircuit className="w-5 h-5" />, legacyTab: 'cost_intelligence' },
  { id: 'cost_analysis', label: 'تحليل التكلفة المتقدم', description: 'تحليل عميق لتكاليف التشغيل', category: 'foodCost', icon: <Activity className="w-5 h-5" />, legacyTab: 'cost_analysis' },
  { id: 'true_cost', label: 'التكلفة الحقيقية والشراء الذكي', description: 'أفضل التكلفة الفعلية والشراء الذكي', category: 'foodCost', icon: <Layers className="w-5 h-5" />, legacyTab: 'true_cost' },
  { id: 'food_cost_category', label: 'تكلفة الأصناف حسب المجموعات', description: 'تحليل تكلفة الطعام حسب التصنيف', category: 'foodCost', icon: <PieChart className="w-5 h-5" />, legacyTab: 'food_cost_category' },
  { id: 'cost_centers', label: 'مراكز التكلفة (الفروع)', description: 'تكلفة كل فرع ونسبه', category: 'foodCost', icon: <Target className="w-5 h-5" />, legacyTab: 'cost_centers' },
  { id: 'cost_center_comparison', label: 'مقارنة مراكز التكلفة', description: 'مقارنة تكاليف الفروع معًا', category: 'foodCost', icon: <GitCompare className="w-5 h-5" />, legacyTab: 'cost_center_comparison' },
  { id: 'management_ratios', label: 'المؤشرات الإدارية (KPI)', description: 'المؤشرات الإدارية الرئيسية', category: 'finance', icon: <Activity className="w-5 h-5" />, legacyTab: 'management_ratios' },
  { id: 'theoretical_consumption', label: 'الاستهلاك النظري (مبيعات → مواد)', description: ' gm حساب الاستهلاك النظري من المبيعات لكل صنف', category: 'foodCost', icon: <Calculator className="w-5 h-5" />, legacyTab: 'theoretical_consumption', badge: 'مُطوّر' },
  { id: 'consumption_matrix', label: 'استهلاك يومي مصفوفي (الصنف × الفروع)', description: 'المصفوفة اليومية: تواريخ × فروع × كمية', category: 'foodCost', icon: <LayoutGrid className="w-5 h-5" />, legacyTab: 'consumption_matrix', badge: 'جديد' },
  { id: 'menu_engineering', label: 'هندسة القائمة', description: 'تحليل أداء أصناف القائمة (نجوم/أبقار/ألغاز/كلاب)', category: 'foodCost', icon: <TrendingUp className="w-5 h-5" />, legacyTab: 'menu_engineering' },
  { id: 'inventory_movement', label: 'حركة المخزون', description: 'تتبع حركة الأصناف المحدثة بالتفاصيل', category: 'inventory', icon: <PackageSearch className="w-5 h-5" />, legacyTab: 'inventory_movement' },
  { id: 'inventory_valuation', label: 'تقييم المخزون (FIFO)', description: 'القيمة الدفترية للمخزون', category: 'inventory', icon: <Layers className="w-5 h-5" />, legacyTab: 'inventory_valuation' },
  { id: 'potential_usage', label: 'الاستهلاك المتوقع (POT vs ACT)', description: 'الكمية المتوقعة مقابل الفعلية', category: 'inventory', icon: <Calculator className="w-5 h-5" />, legacyTab: 'potential_usage' },
  { id: 'pl_statement', label: 'القوائم المالية (P&L)', description: 'قائمة الدخل الشاملة لكل فرع', category: 'finance', icon: <Wallet className="w-5 h-5" />, legacyTab: 'pl_statement' },
  { id: 'cash_flow', label: 'التدفق النقدي', description: 'المقبوضات والمدفوعات الشهرية', category: 'finance', icon: <Wallet className="w-5 h-5" />, legacyTab: 'cash_flow' },
  { id: 'ops_control', label: 'مركز الرقابة التشغيلية', description: 'مراقبة العمليات التشغيلية والجودة', category: 'operations', icon: <Shield className="w-5 h-5" />, legacyTab: 'ops_control', badge: 'new' },
  { id: 'detailed_reports', label: 'التقارير التفصيلية والدمج الموحد', description: 'دمج و汇总 تقارير متعددة', category: 'executive', icon: <FileText className="w-5 h-5" />, legacyTab: 'detailed_reports' },
  { id: 'multi_branch_reports', label: 'الرؤية المتعددة الفروع', description: 'تقارير موحّدة عبر كل الفروع (إيراد/تكلفة/مخزون/هالك)', category: 'executive', icon: <LayoutGrid className="w-5 h-5" />, legacyTab: 'multi_branch_reports', badge: 'جديد' },
  { id: 'purchases', label: 'المشتريات', description: 'أوامر الشراء والاستلامات والموردين', category: 'purchases', icon: <ShoppingCart className="w-5 h-5" />, legacyTab: 'purchases' },
  { id: 'purchase_variance', label: 'انحراف أوامر الشراء', description: 'الانحراف بين المطلوب والاستلام', category: 'purchases', icon: <GitCompare className="w-5 h-5" />, legacyTab: 'purchase_variance' },
  { id: 'supplier_scorecard', label: 'بطاقة أداء الموردين', description: 'تقييم أداء الموردين الشامل', category: 'purchases', icon: <Users className="w-5 h-5" />, legacyTab: 'supplier_scorecard' },
];

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  sales: <TrendingUp className="w-5 h-5" />,
  foodCost: <PieChart className="w-5 h-5" />,
  inventory: <Boxes className="w-5 h-5" />,
  purchases: <ShoppingCart className="w-5 h-5" />,
  finance: <Wallet className="w-5 h-5" />,
  labor: <Users className="w-5 h-5" />,
  operations: <Activity className="w-5 h-5" />,
  governance: <Shield className="w-5 h-5" />,
  executive: <Sparkles className="w-5 h-5" />,
  profitability: <HandCoins className="w-5 h-5" />,
  wastage: <Leaf className="w-5 h-5" />,
  suppliers: <Users className="w-5 h-5" />,
  sustainability: <Lightbulb className="w-5 h-5" />,
};

const FAMILY_COLORS: Record<string, string> = {
  sales: 'bg-indigo-600',
  foodCost: 'bg-rose-600',
  inventory: 'bg-amber-600',
  purchases: 'bg-sky-600',
  finance: 'bg-violet-600',
  labor: 'bg-teal-600',
  operations: 'bg-orange-600',
  governance: 'bg-slate-700',
  executive: 'bg-emerald-600',
  profitability: 'bg-emerald-600',
  wastage: 'bg-red-600',
  suppliers: 'bg-cyan-600',
  sustainability: 'bg-green-600',
};

const FAMILY_LABELS: Record<string, string> = {
  sales: 'المبيعات',
  foodCost: 'التكلفة',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  finance: 'المالية',
  labor: 'العمالة',
  operations: 'التشغيل',
  governance: 'الحوكمة',
  executive: 'التنفيذية',
  profitability: 'الربحية',
  wastage: 'الهدر',
  suppliers: 'الموردين',
  sustainability: 'الاستدامة',
};

interface ReportsHubViewProps {
  onNavigate?: (tab: string) => void;
}

export const ReportsHubView: React.FC<ReportsHubViewProps> = ({ onNavigate }) => {
  const { branches } = useApp();
  const [selectedFamily, setSelectedFamily] = useState<FamilyId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [activeUnifiedReport, setActiveUnifiedReport] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); }
  });

  const availableBranches = useMemo(
    () => branches.map(b => ({ id: b.id, name: b.nameAr })),
    [branches]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const unifiedReports = useMemo(() => getAllReportDefinitions(), []);

  const allReports = useMemo(() => {
    const unified = unifiedReports.map(r => ({
      id: `unified:${r.id}`,
      label: r.nameAr,
      description: r.description || r.purpose,
      family: r.family,
      icon: FAMILY_ICONS[r.family] || <BarChart3 className="w-5 h-5" />,
      color: FAMILY_COLORS[r.family] || 'bg-indigo-600',
      type: 'unified' as const,
      reportId: r.id,
      badge: undefined as string | undefined,
      schedule: r.schedule,
    }));

    const legacy = LEGACY_REPORTS.map(r => ({
      id: `legacy:${r.id}`,
      label: r.label,
      description: r.description,
      family: r.category,
      icon: r.icon,
      color: FAMILY_COLORS[r.category] || 'bg-slate-600',
      type: 'legacy' as const,
      legacyTab: r.legacyTab,
      badge: r.badge,
    }));

    return [...unified, ...legacy];
  }, [unifiedReports]);

  const filteredReports = useMemo(() => {
    let list = allReports;

    if (selectedFamily !== 'all') {
      list = list.filter(r => r.family === selectedFamily);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    }

    if (showFavoritesOnly) {
      list = list.filter(r => favorites.has(r.id));
    }

    return list;
  }, [allReports, selectedFamily, searchQuery, showFavoritesOnly, favorites]);

  if (activeUnifiedReport) {
    return (
      <UnifiedReportScreen
        reportId={activeUnifiedReport}
        availableBranches={availableBranches}
        onBack={() => setActiveUnifiedReport(null)}
      />
    );
  }

  const uniqueFamilies = [...new Set(allReports.map(r => r.family))].sort();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-l from-indigo-600 to-violet-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-white/20 rounded-xl">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">مركز التقارير الموحد</h1>
            <p className="text-xs text-indigo-100 mt-0.5">
              {allReports.length} تقرير — اختر عائلة أو ابحث وافتح مباشرة
            </p>
          </div>
        </div>
      </div>

      {/* Search + Favorites */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن تقرير..."
            className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors whitespace-nowrap ${
            showFavoritesOnly
              ? 'bg-amber-50 border-amber-400 text-amber-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-600'
          }`}
        >
          <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-amber-400' : ''}`} />
          المفضلة
          {favorites.size > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {favorites.size}
            </span>
          )}
        </button>
      </div>

      {/* Family Chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedFamily('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
            selectedFamily === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
          }`}
        >
          الكل ({allReports.length})
        </button>
        {uniqueFamilies.map(fam => {
          const count = allReports.filter(r => r.family === fam).length;
          return (
            <button
              key={fam}
              onClick={() => setSelectedFamily(fam === selectedFamily ? 'all' : fam)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                selectedFamily === fam
                  ? `${FAMILY_COLORS[fam] || 'bg-slate-600'} text-white shadow-sm`
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
              }`}
            >
              {FAMILY_ICONS[fam] || <BarChart3 className="w-3.5 h-3.5" />}
              {FAMILY_LABELS[fam] || fam}
              <span className={`${selectedFamily === fam ? 'bg-white/20' : 'bg-slate-100'} px-1.5 py-0.5 rounded-full text-[10px]`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-3 text-slate-300"><Search className="w-12 h-12 mx-auto" /></div>
          <div className="text-sm font-bold text-slate-500">
            {showFavoritesOnly ? 'لا توجد تقارير مفضلة بعد' : 'لا توجد تقارير مطابقة'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {showFavoritesOnly ? 'أضف تقارير من المفضلة بالضغط على النجمة' : 'جرّب كلمات بحث مختلفة'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredReports.map(report => {
            const isFav = favorites.has(report.id);
            return (
              <div
                key={report.id}
                className="group bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-4 flex flex-col gap-3 relative"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(report.id); }}
                  className={`absolute top-3 left-3 p-1 rounded-full transition-colors ${
                    isFav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                  }`}
                  title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                >
                  <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
                </button>

                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg ${report.color} shadow-sm`}>
                  {report.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors leading-tight line-clamp-2 pr-5">
                    {report.label}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{report.description}</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    report.type === 'unified'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {report.type === 'unified' ? 'موحد' : 'كلاسيكي'}
                  </span>

                  {report.badge && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                      {report.badge === 'new' || report.badge === 'جديد' ? 'جديد' : report.badge}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (report.type === 'unified') {
                      setActiveUnifiedReport(report.reportId!);
                    } else if (report.type === 'legacy' && onNavigate) {
                      onNavigate(report.legacyTab!);
                    }
                  }}
                  className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  فتح التقرير
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Footer */}
      <div className="flex items-center justify-center gap-6 py-4 text-[11px] text-slate-400">
        <span>{allReports.filter(r => r.type === 'unified').length} تقرير موحد (بيانات حية)</span>
        <span className="text-slate-300">•</span>
        <span>{allReports.filter(r => r.type === 'legacy').length} شاشة كلاسيكية</span>
        <span className="text-slate-300">•</span>
        <span>{uniqueFamilies.length} عائلة تقارير</span>
      </div>
    </div>
  );
};
