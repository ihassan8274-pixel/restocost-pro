import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Star, BarChart3, ShoppingCart, Wallet, Boxes, Users,
  Shield, Sparkles, TrendingUp, LayoutGrid, ArrowRight, History, Plus,
  FileText, Calculator, Activity, PieChart, GitCompare, BrainCircuit,
  Layers, PackageSearch, Leaf, Target, HandCoins, Lightbulb,
} from 'lucide-react';
import { UnifiedReportScreen } from '../reporting-module';
import { getAllReportDefinitions } from '../reporting-module/registry';
import { useApp } from '../../context/AppContext';
import {
  ErpPanel, ErpPageHeader, ErpQueryBar, ErpButton, ErpChip, ErpTable, ErpPagination, ErpInput,
} from '../ui/erp';

const FAV_KEY = 'rcerp_reports_favorites';
const RECENT_KEY = 'rcerp_reports_recent';
const RECENT_MAX = 6;
const PAGE_SIZE = 12;

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
  { id: 'cost_intelligence', label: 'مركز تقارير التكلفة المتقدمة', description: 'تحليل ذكي للتكاليف عبر عوامل التشغيل', category: 'foodCost', icon: <BrainCircuit className="w-5 h-5" />, legacyTab: 'cost_intelligence' },
  { id: 'cost_analysis', label: 'تحليل التكلفة المتقدم', description: 'تحليل عميق لتكاليف التشغيل', category: 'foodCost', icon: <Activity className="w-5 h-5" />, legacyTab: 'cost_analysis' },
  { id: 'true_cost', label: 'التكلفة الحقيقية والشراء الذكي', description: 'أدق التكلفة الفعلية والشراء الذكي', category: 'foodCost', icon: <Layers className="w-5 h-5" />, legacyTab: 'true_cost' },
  { id: 'food_cost_category', label: 'تكلفة الأصناف حسب المجموعات', description: 'تحليل تكلفة الطعام حسب التصنيف', category: 'foodCost', icon: <PieChart className="w-5 h-5" />, legacyTab: 'food_cost_category' },
  { id: 'cost_centers', label: 'مراكز التكلفة (الفروع)', description: 'تكلفة كل فرع ونسبه', category: 'foodCost', icon: <Target className="w-5 h-5" />, legacyTab: 'cost_centers' },
  { id: 'cost_center_comparison', label: 'مقارنة مراكز التكلفة', description: 'مقارنة تكاليف الفروع معًا', category: 'foodCost', icon: <GitCompare className="w-5 h-5" />, legacyTab: 'cost_center_comparison' },
  { id: 'management_ratios', label: 'المؤشرات الإدارية (KPI)', description: 'المؤشرات الإدارية الرئيسية', category: 'finance', icon: <Activity className="w-5 h-5" />, legacyTab: 'management_ratios' },
  { id: 'theoretical_consumption', label: 'الاستهلاك النظري (مبيعات ← مواد)', description: 'حساب الاستهلاك النظري من المبيعات لكل صنف', category: 'foodCost', icon: <Calculator className="w-5 h-5" />, legacyTab: 'theoretical_consumption', badge: 'مُطوّر' },
  { id: 'consumption_matrix', label: 'استهلاك يومي مصفوفي (الصنف × الفروع)', description: 'المصفوفة اليومية: تواريخ × فروع × كمية', category: 'foodCost', icon: <LayoutGrid className="w-5 h-5" />, legacyTab: 'consumption_matrix', badge: 'جديد' },
  { id: 'menu_engineering', label: 'هندسة القائمة', description: 'تحليل أداء أصناف القائمة (نجوم/أبقار/ألغاز/كلاب)', category: 'foodCost', icon: <TrendingUp className="w-5 h-5" />, legacyTab: 'menu_engineering' },
  { id: 'inventory_movement', label: 'حركة المخزون', description: 'تتبع حركة الأصناف المحدثة بالتفاصيل', category: 'inventory', icon: <PackageSearch className="w-5 h-5" />, legacyTab: 'inventory_movement' },
  { id: 'inventory_valuation', label: 'تقييم المخزون (FIFO)', description: 'القيمة الدفترية للمخزون', category: 'inventory', icon: <Layers className="w-5 h-5" />, legacyTab: 'inventory_valuation' },
  { id: 'potential_usage', label: 'الاستهلاك المتوقع (POT vs ACT)', description: 'الكمية المتوقعة مقابل الفعلية', category: 'inventory', icon: <Calculator className="w-5 h-5" />, legacyTab: 'potential_usage' },
  { id: 'pl_statement', label: 'القوائم المالية (P&L)', description: 'قائمة الدخل الشاملة لكل فرع', category: 'finance', icon: <Wallet className="w-5 h-5" />, legacyTab: 'pl_statement' },
  { id: 'cash_flow', label: 'التدفق النقدي', description: 'المقبوضات والمدفوعات الشهرية', category: 'finance', icon: <Wallet className="w-5 h-5" />, legacyTab: 'cash_flow' },
  { id: 'ops_control', label: 'مركز الرقابة التشغيلية', description: 'مراقبة العمليات التشغيلية والجودة', category: 'operations', icon: <Shield className="w-5 h-5" />, legacyTab: 'ops_control', badge: 'جديد' },
  { id: 'detailed_reports', label: 'التقارير التفصيلية والدمج الموحد', description: 'دمج وتقرير تقارير متعددة', category: 'executive', icon: <FileText className="w-5 h-5" />, legacyTab: 'detailed_reports' },
  { id: 'multi_branch_reports', label: 'الرؤية المتعددة الفروع', description: 'تقارير موحّدة عبر كل الفروع (إيراد/تكلفة/مخزون/هالك)', category: 'executive', icon: <LayoutGrid className="w-5 h-5" />, legacyTab: 'multi_branch_reports', badge: 'جديد' },
  { id: 'purchases', label: 'المشتريات', description: 'أوامر الشراء والاستلامات والموردين', category: 'purchases', icon: <ShoppingCart className="w-5 h-5" />, legacyTab: 'purchases' },
  { id: 'purchase_variance', label: 'انحراف أوامر الشراء', description: 'الانحراف بين المطلوب والاستلام', category: 'purchases', icon: <GitCompare className="w-5 h-5" />, legacyTab: 'purchase_variance' },
  { id: 'supplier_scorecard', label: 'بطاقة أداء الموردين', description: 'تقييم أداء الموردين الشامل', category: 'purchases', icon: <Users className="w-5 h-5" />, legacyTab: 'supplier_scorecard' },
];

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  sales: <TrendingUp className="w-4 h-4" />,
  foodCost: <PieChart className="w-4 h-4" />,
  inventory: <Boxes className="w-4 h-4" />,
  purchases: <ShoppingCart className="w-4 h-4" />,
  finance: <Wallet className="w-4 h-4" />,
  labor: <Users className="w-4 h-4" />,
  operations: <Activity className="w-4 h-4" />,
  governance: <Shield className="w-4 h-4" />,
  executive: <Sparkles className="w-4 h-4" />,
  profitability: <HandCoins className="w-4 h-4" />,
  wastage: <Leaf className="w-4 h-4" />,
  suppliers: <Users className="w-4 h-4" />,
  sustainability: <Lightbulb className="w-4 h-4" />,
};

// ألوان ناعمة للبطاقات — لا لون صلب: التمييز_family يتم بلون خفيف مقروء
// (docs/design/02). الألوان صينية (amber/rose/…) لا تُخترع من العدم: كل عائلة
// لها لون ثابت هنا، وكل النغمات من لوح Tailwind القياسية.
const FAMILY_SOFT: Record<string, string> = {
  sales: 'bg-blue-50 text-blue-600',
  foodCost: 'bg-rose-50 text-rose-600',
  inventory: 'bg-teal-50 text-teal-600',
  purchases: 'bg-orange-50 text-orange-600',
  finance: 'bg-violet-50 text-violet-600',
  labor: 'bg-cyan-50 text-cyan-600',
  operations: 'bg-amber-50 text-amber-600',
  governance: 'bg-slate-100 text-slate-600',
  executive: 'bg-emerald-50 text-emerald-600',
  profitability: 'bg-emerald-50 text-emerald-600',
  wastage: 'bg-red-50 text-red-600',
  suppliers: 'bg-cyan-50 text-cyan-600',
  sustainability: 'bg-green-50 text-green-600',
};

type Tone = 'default' | 'emerald' | 'amber' | 'rose' | 'primary' | 'indigo';

const FAMILY_TONE: Record<string, Tone> = {
  sales: 'indigo',
  foodCost: 'rose',
  inventory: 'primary',
  purchases: 'amber',
  finance: 'indigo',
  labor: 'default',
  operations: 'amber',
  governance: 'default',
  executive: 'emerald',
  profitability: 'emerald',
  wastage: 'rose',
  suppliers: 'default',
  sustainability: 'emerald',
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

interface HubReport {
  id: string;
  label: string;
  description: string;
  family: string;
  icon: React.ReactNode;
  type: 'unified' | 'legacy';
  reportId?: string;
  legacyTab?: string;
  badge?: string;
}

interface ReportsHubViewProps {
  onNavigate?: (tab: string) => void;
}

const readList = (key: string): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const ReportsHubView: React.FC<ReportsHubViewProps> = ({ onNavigate }) => {
  const { branches } = useApp();
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [activeUnifiedReport, setActiveUnifiedReport] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readList(FAV_KEY)));
  const [recents, setRecents] = useState<string[]>(() => readList(RECENT_KEY));

  const availableBranches = useMemo(
    () => branches.map((b) => ({ id: b.id, name: b.nameAr })),
    [branches],
  );

  const unifiedReports = useMemo(() => getAllReportDefinitions(), []);

  const allReports = useMemo<HubReport[]>(() => {
    const unified: HubReport[] = unifiedReports.map((r) => ({
      id: `unified:${r.id}`,
      label: r.nameAr,
      description: r.description || r.purpose,
      family: r.family,
      icon: FAMILY_ICONS[r.family] || <BarChart3 className="w-4 h-4" />,
      type: 'unified',
      reportId: r.id,
    }));

    const legacy: HubReport[] = LEGACY_REPORTS.map((r) => ({
      id: `legacy:${r.id}`,
      label: r.label,
      description: r.description,
      family: r.category,
      icon: r.icon,
      type: 'legacy',
      legacyTab: r.legacyTab,
      badge: r.badge,
    }));

    return [...unified, ...legacy];
  }, [unifiedReports]);

  const uniqueFamilies = useMemo(
    () => [...new Set(allReports.map((r) => r.family))].sort(),
    [allReports],
  );

  const familyCount = useCallback(
    (fam: string) => allReports.filter((r) => r.family === fam).length,
    [allReports],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const openReport = useCallback((r: HubReport) => {
    // نُسجّل الفتح قبل الانتقال: لو كانت الشاشة التالية ثقيلة أو فشلت،
    // يبقى التقرير في «الأخيرة» وهو ما يتوقعه المستخدم.
    setRecents((prev) => {
      const next = [r.id, ...prev.filter((x) => x !== r.id)].slice(0, RECENT_MAX);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
    if (r.type === 'unified') setActiveUnifiedReport(r.reportId!);
    else if (onNavigate) onNavigate(r.legacyTab!);
  }, [onNavigate]);

  const filteredReports = useMemo(() => {
    let list = allReports;
    if (selectedFamily !== 'all') list = list.filter((r) => r.family === selectedFamily);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }

    // «المفضلة» و«الأخيرة» مُستبعِدان بعضَيهما: التقاطع بينهما فارغ عادةً
    // فيبدو الزر وكأنه لا يعمل.
    if (showFavoritesOnly) list = list.filter((r) => favorites.has(r.id));
    else if (showRecentOnly) list = list.filter((r) => recents.includes(r.id));

    return list;
  }, [allReports, selectedFamily, searchQuery, showFavoritesOnly, showRecentOnly, favorites, recents]);

  // أي تغيير في المرشّحات يعيد الصفحة للأولى، وإلا بقيت الصفحة 3 من 4
  // بينما النتيجة صفر سجل.
  useEffect(() => { setPage(1); }, [selectedFamily, searchQuery, showFavoritesOnly, showRecentOnly]);

  const pageCount = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filteredReports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredReports, safePage],
  );

  if (activeUnifiedReport) {
    return (
      <UnifiedReportScreen
        reportId={activeUnifiedReport}
        availableBranches={availableBranches}
        onBack={() => setActiveUnifiedReport(null)}
      />
    );
  }

  const emptyMessage = showFavoritesOnly
    ? 'لا توجد تقارير مفضلة بعد'
    : showRecentOnly
      ? 'لا تقارير مفتوحة مؤخراً'
      : 'لا توجد تقارير مطابقة';

  const sectionLabel = showFavoritesOnly
    ? 'التقارير المفضلة'
    : showRecentOnly
      ? 'التقارير الأخيرة'
      : selectedFamily === 'all'
        ? 'كل التقارير'
        : FAMILY_LABELS[selectedFamily] || selectedFamily;

  return (
    <div className="space-y-4">
      {/* ─────────── الترويسة + شريط البحث ─────────── */}
      <ErpPanel>
        <ErpPageHeader
          icon={<LayoutGrid className="w-6 h-6" />}
          title="مركز التقارير"
          subtitle={`${allReports.length} تقريراً في ${uniqueFamilies.length} عائلات · تكلفة ومبيعات ومخزون ومشتريات`}
          actions={
            <>
              <ErpButton
                onClick={() => { setShowFavoritesOnly((v) => !v); setShowRecentOnly(false); }}
                className={showFavoritesOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : ''}
              >
                <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? 'fill-amber-400' : ''}`} />
                المفضلة {favorites.size > 0 && <span className="tnum">({favorites.size})</span>}
              </ErpButton>
              <ErpButton
                onClick={() => { setShowRecentOnly((v) => !v); setShowFavoritesOnly(false); }}
                className={showRecentOnly ? 'border-primary-300 bg-primary-50 text-primary-700' : ''}
              >
                <History className="w-3.5 h-3.5" />
                الأخيرة {recents.length > 0 && <span className="tnum">({recents.length})</span>}
              </ErpButton>
              {onNavigate && (
                <ErpButton variant="primary" onClick={() => onNavigate('report_designer')}>
                  <Plus className="w-3.5 h-3.5" /> تقرير مخصص
                </ErpButton>
              )}
            </>
          }
        />

        <div className="px-6 pb-4 space-y-3 border-t border-line/60">
          <ErpQueryBar>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <ErpInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في التقارير…"
                className="pr-9"
              />
            </div>
            <span className="text-[11px] font-bold text-slate-500 shrink-0">
              العائلات: {uniqueFamilies.length}
            </span>
          </ErpQueryBar>

          {/* مرشّحات العائلة — pills like the design */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-2">العائلة:</span>
            <FamilyPill on={selectedFamily === 'all'} onClick={() => setSelectedFamily('all')}>
              الكل <span className="tnum">({allReports.length})</span>
            </FamilyPill>
            {uniqueFamilies.map((fam) => (
              <FamilyPill
                key={fam}
                on={selectedFamily === fam}
                onClick={() => setSelectedFamily(selectedFamily === fam ? 'all' : fam)}
              >
                {FAMILY_ICONS[fam] || <BarChart3 className="w-3 h-3" />}
                {FAMILY_LABELS[fam] || fam} <span className="tnum">({familyCount(fam)})</span>
              </FamilyPill>
            ))}
          </div>
        </div>
      </ErpPanel>

      {/* ─────────── التقارير ─────────── */}
      <ErpPanel>
        <div className="flex items-center justify-between px-6 py-3.5">
          <span className="text-xs font-bold text-slate-600">
            {sectionLabel} <span className="mono text-slate-400 tnum">({filteredReports.length})</span>
          </span>
          <div className="flex items-center gap-1.5">
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="text-center py-14 border-t border-line">
            <Search className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-500">{emptyMessage}</p>
            <p className="text-xs text-slate-400 mt-1">
              {showFavoritesOnly
                ? 'اضغط النجمة على أي تقرير لإضافته هنا'
                : showRecentOnly
                  ? 'افتح أي تقرير ليظهر هنا'
                  : 'جرّب كلمات بحث أخرى أو اختر «الكل»'}
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-6 pb-5">
            {paged.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                isFav={favorites.has(r.id)}
                onToggleFav={() => toggleFavorite(r.id)}
                onOpen={() => openReport(r)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <ErpTable
              rows={paged}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'label',
                  header: 'التقرير',
                  render: (r) => (
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${FAMILY_SOFT[r.family] || 'bg-slate-100 text-slate-600'}`}>
                        {r.icon}
                      </span>
                      <span className="font-bold text-slate-800">{r.label}</span>
                    </span>
                  ),
                },
                { key: 'family', header: 'العائلة', width: '130px', render: (r) => <ErpChip tone={FAMILY_TONE[r.family] || 'default'}>{FAMILY_LABELS[r.family] || r.family}</ErpChip> },
                {
                  key: 'type',
                  header: 'النوع',
                  width: '110px',
                  render: (r) => <span className="text-[11px] font-bold text-slate-500">{r.type === 'unified' ? 'موحّد' : 'كلاسيكي'}</span>,
                },
                { key: 'desc', header: 'الوصف', render: (r) => <span className="text-slate-500">{r.description}</span> },
              ]}
              actionsColumn={(r) => (
                <span className="inline-flex items-center gap-2.5 justify-center">
                  <button
                    onClick={() => openReport(r)}
                    className="text-[11px] font-bold text-primary-600 hover:underline"
                  >
                    فتح
                  </button>
                  <button
                    onClick={() => toggleFavorite(r.id)}
                    title={favorites.has(r.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    className={`w-6 h-6 inline-flex items-center justify-center transition-colors ${favorites.has(r.id) ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${favorites.has(r.id) ? 'fill-amber-400' : ''}`} />
                  </button>
                </span>
              )}
            />
          </div>
        )}

        {filteredReports.length > PAGE_SIZE && (
          <ErpPagination
            page={safePage}
            pageCount={pageCount}
            onPage={setPage}
            totalLabel={`عرض ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredReports.length)} من ${filteredReports.length} تقريراً`}
          />
        )}
      </ErpPanel>

      {/* ─────────── شريط سفلي ─────────── */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 py-3 text-[11px] font-semibold text-slate-400">
        <span><span className="tnum">{allReports.filter((r) => r.type === 'unified').length}</span> تقرير موحّد (بيانات حيّة)</span>
        <span className="text-slate-300">•</span>
        <span><span className="tnum">{allReports.filter((r) => r.type === 'legacy').length}</span> شاشة كلاسيكية</span>
        <span className="text-slate-300">•</span>
        <span><span className="tnum">{uniqueFamilies.length}</span> عائلة تقارير</span>
      </div>
    </div>
  );
};

// ───────────────────────── أجزاء صغيرة ─────────────────────────

const FamilyPill: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1.5 ${
      on ? 'bg-primary-600 text-white border-primary-600 shadow-xs' : 'text-slate-600 border-line bg-surface hover:border-slate-300'
    }`}
  >
    {children}
  </button>
);

const ViewToggle: React.FC<{ view: 'grid' | 'list'; onChange: (v: 'grid' | 'list') => void }> = ({ view, onChange }) => (
  <div className="flex items-center gap-1">
    <button
      onClick={() => onChange('grid')}
      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${view === 'grid' ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'text-slate-500 border border-transparent hover:bg-slate-100'}`}
    >
      شبكة
    </button>
    <button
      onClick={() => onChange('list')}
      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${view === 'list' ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'text-slate-500 border border-transparent hover:bg-slate-100'}`}
    >
      قائمة
    </button>
  </div>
);

const ReportCard: React.FC<{
  report: HubReport;
  isFav: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}> = ({ report, isFav, onToggleFav, onOpen }) => (
  <div className="group bg-surface border border-line rounded-xl p-3.5 flex flex-col gap-2.5 transition-all hover:border-primary-300 hover:shadow-card">
    <div className="flex items-start justify-between gap-2">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${FAMILY_SOFT[report.family] || 'bg-slate-100 text-slate-600'}`}>
        {report.icon}
      </span>
      <div className="flex items-center gap-1.5">
        {report.badge && <ErpChip tone="emerald">{report.badge === 'new' ? 'جديد' : report.badge}</ErpChip>}
        <button
          onClick={onToggleFav}
          title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          className={`p-1 rounded-md transition-colors ${isFav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
        >
          <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
        </button>
      </div>
    </div>

    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-bold text-slate-900 leading-tight line-clamp-2">{report.label}</p>
      <p className="text-[11px] text-slate-500 leading-relaxed mt-1 line-clamp-2">{report.description}</p>
    </div>

    <div className="flex items-center gap-1.5">
      <ErpChip tone={FAMILY_TONE[report.family] || 'default'}>{FAMILY_LABELS[report.family] || report.family}</ErpChip>
      <span className="text-[10px] font-bold text-slate-400">{report.type === 'unified' ? 'موحّد' : 'كلاسيكي'}</span>
    </div>

    <ErpButton size="sm" variant="primary" onClick={onOpen} className="w-full justify-center">
      فتح التقرير <ArrowRight className="w-3 h-3" />
    </ErpButton>
  </div>
);