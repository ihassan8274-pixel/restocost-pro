import React, { useState, useMemo } from 'react';
import {
  PiggyBank, DollarSign, Trash2, Wallet, Boxes, ShoppingCart,
  BarChart3, Activity, TrendingUp, FileSpreadsheet, Layers, Scale, ShoppingBag,
  Gauge, Calculator, GitCompare, BrainCircuit, Coins,
  PieChart, Search, LayoutGrid, ArrowLeft,
} from 'lucide-react';
import { Card } from '../ui';

type Category = 'الكل' | 'الربحية' | 'المبيعات' | 'التكاليف' | 'المخزون' | 'المشتريات' | 'المالية' | 'المؤشرات' | 'التشغيل';

interface ReportDef {
  id: string;
  label: string;
  description: string;
  category: Category;
  icon: React.ReactNode;
  tab: string;
}

const CATEGORY_TONES: Record<Category, string> = {
  'الكل': 'bg-slate-900 text-white',
  'الربحية': 'bg-emerald-600 text-white',
  'المبيعات': 'bg-indigo-600 text-white',
  'التكاليف': 'bg-rose-600 text-white',
  'المخزون': 'bg-amber-600 text-white',
  'المشتريات': 'bg-sky-600 text-white',
  'المالية': 'bg-violet-600 text-white',
  'المؤشرات': 'bg-teal-600 text-white',
  'التشغيل': 'bg-orange-600 text-white',
};

const REPORTS: ReportDef[] = [
  { id: 'profitability', label: 'الربحية (P&L)', description: 'قائمة الدخل حسب الفرع', category: 'الربحية', icon: <PiggyBank className="w-5 h-5" />, tab: 'profitability' },
  { id: 'monthlybranch', label: 'شهري للفروع', description: 'إيرادات وتكلفة المبيعات شهرياً لحظة بلحظة', category: 'الربحية', icon: <TrendingUp className="w-5 h-5" />, tab: 'monthlybranch' },
  { id: 'sales', label: 'المبيعات', description: 'إجماليات المبيعات حسب الفرع والمصدر', category: 'المبيعات', icon: <DollarSign className="w-5 h-5" />, tab: 'sales' },
  { id: 'salesledger', label: 'دفتر المبيعات التحليلي', description: 'المبيعات حسب الصنف والفرع واليوم', category: 'المبيعات', icon: <BarChart3 className="w-5 h-5" />, tab: 'salesledger' },
  { id: 'wastage', label: 'الهالك والفاقد', description: 'الضياع حسب الفرع والتصنيف', category: 'المبيعات', icon: <Trash2 className="w-5 h-5" />, tab: 'wastage' },
  { id: 'cost_reports', label: 'تقارير التكلفة', description: 'تحليل التكلفة والفروقات والانحراف', category: 'التكاليف', icon: <PieChart className="w-5 h-5" />, tab: 'cost_reports' },
  { id: 'cost_analysis', label: 'تحليل التكلفة المتقدم', description: 'تحليل عميق لتكاليف التشغيل', category: 'التكاليف', icon: <BrainCircuit className="w-5 h-5" />, tab: 'cost_analysis' },
  { id: 'true_cost', label: 'التكلفة الحقيقية', description: 'أفضل التكلفة الفعلية والشراء الذكي', category: 'التكاليف', icon: <Layers className="w-5 h-5" />, tab: 'true_cost' },
  { id: 'menu_engineering', label: 'هندسة القائمة', description: 'تحليل أداء أصناف القائمة', category: 'التكاليف', icon: <TrendingUp className="w-5 h-5" />, tab: 'menu_engineering' },
  { id: 'inventory', label: 'تقييم المخزون', description: 'التقييم الحالي للمخزون (FIFO)', category: 'المخزون', icon: <Boxes className="w-5 h-5" />, tab: 'inventory' },
  { id: 'inventory_movement', label: 'حركة المخزون', description: 'تتبع حركة الأصناف المحدثة', category: 'المخزون', icon: <Activity className="w-5 h-5" />, tab: 'inventory_movement' },
  { id: 'inventory_valuation', label: 'تقييم المخزون (FIFO)', description: 'القيمة الدفترية للمخزون', category: 'المخزون', icon: <Layers className="w-5 h-5" />, tab: 'inventory_valuation' },
  { id: 'stock_cover', label: 'تغطية المخزون', description: 'أيام التغطية المتوقعة للأصناف', category: 'المخزون', icon: <Gauge className="w-5 h-5" />, tab: 'stock_cover' },
  { id: 'potential_usage', label: 'الاستهلاك المتوقع', description: 'POT مقابل ACT للأصناف', category: 'المخزون', icon: <Calculator className="w-5 h-5" />, tab: 'potential_usage' },
  { id: 'purchases', label: 'المشتريات', description: 'أوامر الشراء والاستلامات', category: 'المشتريات', icon: <ShoppingCart className="w-5 h-5" />, tab: 'purchases' },
  { id: 'purchase_variance', label: 'انحراف أوامر الشراء', description: 'الانحراف بين المطلوب والاستلام', category: 'المشتريات', icon: <Scale className="w-5 h-5" />, tab: 'purchase_variance' },
  { id: 'supplier_scorecard', label: 'بطاقة أداء الموردين', description: 'تقييم أداء الموردين', category: 'المشتريات', icon: <ShoppingBag className="w-5 h-5" />, tab: 'supplier_scorecard' },
  { id: 'cashflow', label: 'التدفق النقدي', description: 'المقبوضات والمدفوعات شهرياً', category: 'المالية', icon: <Wallet className="w-5 h-5" />, tab: 'cashflow' },
  { id: 'pl_statement', label: 'القوائم المالية (P&L)', description: 'قائمة الدخل الشاملة', category: 'المالية', icon: <FileSpreadsheet className="w-5 h-5" />, tab: 'pl_statement' },
  { id: 'currencies', label: 'العملات المتعددة', description: 'تقارير أسعار الصرف', category: 'المالية', icon: <Coins className="w-5 h-5" />, tab: 'currencies' },
  { id: 'ratios', label: 'مؤشرات KPI', description: 'نسب الربحية ودوران المخزون', category: 'المؤشرات', icon: <Activity className="w-5 h-5" />, tab: 'ratios' },
  { id: 'management_ratios', label: 'مؤشرات إدارية', description: 'المؤشرات الإدارية الرئيسية (KPI)', category: 'المؤشرات', icon: <Activity className="w-5 h-5" />, tab: 'management_ratios' },
  { id: 'cost_center_comparison', label: 'مقارنة مراكز التكلفة', description: 'مقارنة تكاليف الفروع', category: 'المؤشرات', icon: <GitCompare className="w-5 h-5" />, tab: 'cost_center_comparison' },
  { id: 'ops_control', label: 'الرقابة التشغيلية', description: 'مراقبة العمليات التشغيلية', category: 'التشغيل', icon: <Activity className="w-5 h-5" />, tab: 'ops_control' },
];

const CATEGORIES: Category[] = ['الكل', 'الربحية', 'المبيعات', 'التكاليف', 'المخزون', 'المشتريات', 'المالية', 'المؤشرات', 'التشغيل'];

interface ReportsDashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const ReportsDashboardView: React.FC<ReportsDashboardViewProps> = ({ onNavigate }) => {
  const [cat, setCat] = useState<Category>('الكل');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REPORTS.filter((r) => {
      if (cat !== 'الكل' && r.category !== cat) return false;
      if (q && !(r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [cat, query]);

  const openReport = (tab: string) => onNavigate(tab);

  return (
    <div className="space-y-5">
      {/* رأس الصفحة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 inline-flex items-center gap-2">لوحة التقارير الرئيسية</h2>
            <p className="text-xs text-slate-500 font-bold mt-0.5">جميع تقارير النظام في مكان واحد — اختر التقرير المناسب</p>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن تقرير..."
            className="w-64 bg-white border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition-all"
          />
        </div>
      </div>

      {/* فلاتر الفئات */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
              cat === c
                ? `${CATEGORY_TONES[c]} border-transparent shadow-sm`
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* شبكة البطاقات */}
      {visible.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 text-sm font-bold">
          لا توجد تقارير مطابقة لبحثك
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((r) => (
            <button
              key={r.id}
              onClick={() => openReport(r.tab)}
              className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-right transition-all hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    {r.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{r.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">{r.description}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${CATEGORY_TONES[r.category]}`}>{r.category}</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 group-hover:gap-2 transition-all">
                  فتح التقرير <ArrowLeft className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportsDashboardView;
