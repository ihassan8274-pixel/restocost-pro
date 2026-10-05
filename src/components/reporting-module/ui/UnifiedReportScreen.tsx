// ============================================================
// الشاشة الموحدة للتقارير — عائلة واحدة، فلترات، KPIs، جدول، رسوم
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  SlidersHorizontal, Download, FileText, Printer,
  RefreshCw, ChevronDown, BarChart3, Table, Grid3X3,
  Clock, AlertTriangle, ChevronUp, ArrowRight,
} from 'lucide-react';

import { getAllFamilies, getReportsByFamily } from '../registry';
import { useReport } from '../hooks';
import { usePeriodComparison } from '../hooks';
import { resolvePeriod } from '../data/sources';
import { ReportFamilySelector } from './ReportFamilySelector';
import { KPICardsGrid } from './KPICards';
import { DataTable } from './DataTable';
import type { ReportDefinition, ReportFilters } from '../types';

const SimpleBarChart: React.FC<{
  data: Array<{ label: string; value: number }>;
  title: string;
  color?: string;
  height?: number;
}> = ({ data, title, color = '#4f46e5', height = 200 }) => {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          {title}
        </div>
        <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
          لا توجد بيانات للرسم البياني
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        {title}
      </div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height }}>
            <div className="text-[10px] font-bold text-slate-600 mb-1">
              {d.value >= 1000 ? `${(d.value / 1000).toFixed(0)}K` : d.value}
            </div>
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`,
                backgroundColor: color,
                minHeight: '4px',
              }}
            />
            <div className="text-[9px] text-slate-400 mt-1 truncate w-full text-center" title={d.label}>
              {d.label.length > 6 ? d.label.slice(5, 8) : d.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const UnifiedFilters: React.FC<{
  filters: ReportFilters;
  onChange: (filters: Partial<ReportFilters>) => void;
  onReset: () => void;
  availableBranches?: Array<{ id: string; name: string }>;
}> = ({ filters, onChange, onReset, availableBranches = [] }) => {
  const hasActive = filters.period.from || filters.period.to || (filters.branchIds?.length || 0) > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" />
          الفلاتر
        </span>
        {hasActive && (
          <button onClick={onReset} className="text-[11px] font-bold text-rose-600 hover:text-rose-700">
            مسح الكل
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-1">الفترة</label>
          <select
            value={filters.period.preset || 'custom'}
            onChange={(e) => {
              const preset = e.target.value;
              const period = resolvePeriod(preset);
              onChange({ period });
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none"
          >
            <option value="today">اليوم</option>
            <option value="yesterday">أمس</option>
            <option value="this-week">هذا الأسبوع</option>
            <option value="last-week">الأسبوع الماضي</option>
            <option value="this-month">هذا الشهر</option>
            <option value="last-month">الشهر الماضي</option>
            <option value="this-quarter">هذا الربع</option>
            <option value="last-quarter">الربع الماضي</option>
            <option value="this-year">هذه السنة</option>
            <option value="last-year">السنة الماضية</option>
            <option value="custom">مخصص</option>
          </select>
        </div>

        {filters.period.preset === 'custom' && (
          <>
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">من</label>
              <input
                type="date"
                value={filters.period.from}
                onChange={(e) => onChange({ period: { ...filters.period, from: e.target.value } })}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">إلى</label>
              <input
                type="date"
                value={filters.period.to}
                onChange={(e) => onChange({ period: { ...filters.period, to: e.target.value } })}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none"
              />
            </div>
          </>
        )}

        {availableBranches.length > 0 && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">الفرع</label>
            <select
              value={filters.branchIds?.[0] || ''}
              onChange={(e) => onChange({ branchIds: e.target.value ? [e.target.value] : [] })}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:border-brand-500 focus:outline-none"
            >
              <option value="">كل الفروع</option>
              {availableBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

const SchedulePanel: React.FC<{ definition: ReportDefinition }> = ({ definition }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-sm font-bold text-slate-600"
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          الجدولة والتوزيع
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && definition.schedule && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">التكرار</span>
              <div className="font-bold text-slate-700">{definition.schedule.frequency || 'N/A'}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">القنوات</span>
              <div className="font-bold text-slate-700">
                {definition.schedule.channels?.join(' • ')}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">التنسيق</span>
              <div className="font-bold text-slate-700">
                {definition.schedule.formats?.map(f => f.toUpperCase()).join(' • ')}
              </div>
            </div>
          </div>
          <button className="px-3 py-1.5 bg-brand-500 text-white text-xs font-bold rounded-lg hover:bg-brand-600">
            تفعيل الجدولة
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// الشاشة الموحدة الرئيسية
// ============================================================

interface UnifiedReportScreenProps {
  reportId?: string;
  initialFamily?: string;
  availableBranches?: Array<{ id: string; name: string }>;
  onBack?: () => void;
}

export const UnifiedReportScreen: React.FC<UnifiedReportScreenProps> = ({
  reportId: initialReportId,
  initialFamily = 'all',
  availableBranches = [],
  onBack,
}) => {
  const [selectedFamily, setSelectedFamily] = useState(initialFamily);
  const [selectedReportId, setSelectedReportId] = useState(initialReportId || '');
  const [viewMode, setViewMode] = useState<'table' | 'chart' | 'both'>('both');

  const families = useMemo(() => getAllFamilies(), []);

  const familyReports = useMemo(() => {
    if (selectedFamily === 'all') return [];
    return getReportsByFamily(selectedFamily);
  }, [selectedFamily]);

  useMemo(() => {
    if (!selectedReportId && familyReports.length > 0) {
      setSelectedReportId(familyReports[0].id);
    }
  }, [selectedReportId, familyReports]);

  const {
    result,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    runReport,
    refresh,
    exportExcel,
    exportPDF,
    printReport,
    kpis,
    rows,
    totals,
    series,
    warnings,
    meta,
    definition,
  } = useReport({
    reportId: selectedReportId,
    autoRun: !!selectedReportId,
  });

  const { comparePeriod, currentLabel, compareLabel } = usePeriodComparison(filters.period);

  const standalone = !initialReportId;

  const handleFamilyChange = useCallback((familyId: string) => {
    setSelectedFamily(familyId);
    if (familyId !== 'all') {
      const reports = getReportsByFamily(familyId);
      if (reports.length > 0) {
        setSelectedReportId(reports[0].id);
      }
    } else {
      setSelectedReportId('');
    }
  }, []);

  const handleReportSelect = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
  }, []);

  if (standalone && !selectedReportId) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-lg font-extrabold text-slate-800 mb-3">منظومة التقارير الموحدة</h2>
          <ReportFamilySelector families={families} selectedFamily={selectedFamily} onSelect={handleFamilyChange} />
          {selectedFamily !== 'all' && familyReports.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {familyReports.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleReportSelect(r.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-brand-300 transition-colors"
                >
                  {r.nameAr}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-center py-20">
          <div className="text-slate-300 mb-4"><BarChart3 className="w-14 h-14 mx-auto" /></div>
          <div className="text-lg font-bold text-slate-600">اختر عائلة التقرير والتقرير لبدء</div>
          <div className="text-sm text-slate-400 mt-2">ستظهر مؤشرات الأداء والبيانات تلقائياً</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
      {/* شريط التنقل العلوي */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-800 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                العودة
              </button>
            )}
            {onBack && <div className="w-px h-6 bg-slate-200" />}
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">
                {definition?.nameAr || 'تقرير'}
              </h2>
              {definition?.purpose && (
                <p className="text-[11px] text-slate-500 mt-0.5">{definition.purpose}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 text-brand-500 animate-spin" />}
            <button
              onClick={refresh}
              disabled={loading}
              className="px-2 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50"
            >
              تحديث
            </button>
          </div>
        </div>

        {/* اختيار العائلة + التقرير (في الوضع المستقل فقط) */}
        {standalone && (
          <>
            <ReportFamilySelector families={families} selectedFamily={selectedFamily} onSelect={handleFamilyChange} />
            {selectedFamily !== 'all' && familyReports.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {familyReports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleReportSelect(r.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      selectedReportId === r.id
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    {r.nameAr}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* الفلاتر */}
      <UnifiedFilters
        filters={filters}
        onChange={(newFilters) => setFilters(newFilters)}
        onReset={resetFilters}
        availableBranches={availableBranches}
      />

      {/* فترة المقارنة */}
      {comparePeriod && (
        <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
          {currentLabel} — مقارنة بـ {compareLabel || 'الفترة السابقة'}
        </div>
      )}

      {/* بطاقات KPI */}
      {kpis.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <Grid3X3 className="w-4 h-4" />
            مؤشرات الأداء الرئيسية
          </h3>
          <KPICardsGrid kpis={kpis} />
        </div>
      )}

      {/* الرسم البياني + أزرار العرض */}
      {series.length > 0 && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                viewMode === 'table' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <Table className="w-3 h-3" /> جدول
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                viewMode === 'chart' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <BarChart3 className="w-3 h-3" /> رسم بياني
            </button>
            <button
              onClick={() => setViewMode('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                viewMode === 'both' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <Grid3X3 className="w-3 h-3" /> كليهما
            </button>
          </div>

          {(viewMode === 'chart' || viewMode === 'both') && (
            <SimpleBarChart
              data={series.map(p => {
                const val = Object.values(p).find(v => typeof v === 'number') as number || 0;
                return { label: p.label, value: val };
              })}
              title="السلاسل الزمنية"
              color="#4f46e5"
              height={220}
            />
          )}
        </>
      )}

      {/* الجدول */}
      {(viewMode === 'table' || viewMode === 'both' || series.length === 0) && (
        <DataTable
          rows={rows}
          totals={totals}
          filters={filters}
          sortConfig={{ column: 'revenue', direction: 'desc' }}
          onSort={(col) => console.log('Sort:', col)}
        />
      )}

      {/* التحذيرات */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            تحذيرات
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-700">• {w}</div>
          ))}
        </div>
      )}

      {/* أزرار التصدير والطباعة */}
      <div className="flex flex-wrap gap-2 justify-center py-4 border-t border-slate-200 bg-white rounded-xl">
        <button
          onClick={exportExcel}
          disabled={!result}
          className="px-4 py-2 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> تصدير Excel
        </button>
        <button
          onClick={exportPDF}
          disabled={!result}
          className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 flex items-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" /> تصدير PDF
        </button>
        <button
          onClick={printReport}
          disabled={!result}
          className="px-4 py-2 bg-blue-500 text-white text-sm font-bold rounded-lg hover:bg-blue-600 flex items-center gap-2 disabled:opacity-50"
        >
          <Printer className="w-4 h-4" /> طباعة
        </button>
      </div>

      {/* الجدولة */}
      {definition && <SchedulePanel definition={definition} />}

      {/* معلومات التقرير */}
      {meta && (
        <div className="text-[10px] text-slate-400 text-center py-2">
          {meta.fromCache ? 'من الكاش' : 'تم الحساب حديثاً'} —
          {meta.closed ? 'فترة مقفلة (أرقام نهائية)' : 'فترة تقديرية'} —
          آخر تحديث: {new Date(meta.generatedAt).toLocaleString('ar-SA')} —
          {rows.length} سجل
        </div>
      )}

      {/* حالة التحميل */}
      {loading && (
        <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="mr-3 text-sm font-bold text-slate-600">جاري تحميل التقرير...</span>
        </div>
      )}

      {/* خطأ */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          خطأ في تحميل التقرير: {error.message}
          <button onClick={runReport} className="mr-2 underline font-bold hover:text-rose-800">
            أعد المحاولة
          </button>
        </div>
      )}
    </div>
  );
};
