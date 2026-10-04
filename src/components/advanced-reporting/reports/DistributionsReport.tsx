import React, { useMemo, useState } from 'react';
import { Printer, Network } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// مراجعة توزيعات البوت (Distributions Review)
// الهوية (مستمدّة من شاشة (توزيع) في v7.0):
//   مراجعة توزيعات البودينغ المرسلة عبر المصادر (تيليجرام): مطابقة تلقائية
//   (exact/alias/fuzzy) مقابل غير المطابقة (none/مجهولة)، حالة كل توزيع،
//   وتحقق سعر/كمية مقابل المخزون
// فلاتر: شهر + حالة
// ═══════════════════════════════════════════════════════════════════════════

interface DistRow {
  id: string;
  createdAt: string;
  source: string;
  fromBranch: string;
  itemName: string;
  rows: number;
  inventoryTotal: number;
  parsedTotal: number;
  exact: number;
  alias: number;
  fuzzy: number;
  none: number;
  unknowns: number;
  status: string;
  coveragePct: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const DistributionsReport: React.FC = () => {
  const { distributions } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(distributions.map((d) => (d.createdAt || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [distributions]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';

  const rows = useMemo<DistRow[]>(() => {
    const out: DistRow[] = [];
    for (const d of distributions) {
      if (periodValue && (d.createdAt || '').slice(0, 7) !== periodValue) continue;
      if (statusFilter !== 'all' && d.status !== statusFilter) continue;
      let exact = 0, alias = 0, fuzzy = 0, none = 0;
      for (const r of d.rows || []) {
        const conf = r._match?.confidence ?? 'none';
        if (conf === 'exact') exact += 1;
        else if (conf === 'alias') alias += 1;
        else if (conf === 'fuzzy') fuzzy += 1;
        else none += 1;
      }
      out.push({
        id: d.id,
        createdAt: d.createdAt || '',
        source: d.source || '—',
        fromBranch: d.fromBranchName || '—',
        itemName: d.itemName || '—',
        rows: (d.rows || []).length,
        inventoryTotal: d.inventoryTotal || 0,
        parsedTotal: d.parsedTotal ?? d.total ?? 0,
        exact,
        alias,
        fuzzy,
        none,
        unknowns: (d.unknownTargets || []).length,
        status: d.status,
        coveragePct: (d.rows || []).length > 0 ? ((exact + alias + fuzzy) / d.rows.length) * 100 : 100,
      });
    }
    return out.sort((a, b) => (a.createdAt).localeCompare(b.createdAt));
  }, [distributions, periodValue, statusFilter]);

  const totalRows = rows.reduce((s, r) => s + r.rows, 0);
  const totalQty = rows.reduce((s, r) => s + r.inventoryTotal, 0);
  const exactSum = rows.reduce((s, r) => s + r.exact, 0);
  const aliasSum = rows.reduce((s, r) => s + r.alias, 0);
  const fuzzySum = rows.reduce((s, r) => s + r.fuzzy, 0);
  const noneSum = rows.reduce((s, r) => s + r.none, 0);
  const unknownSum = rows.reduce((s, r) => s + r.unknowns, 0);
  const autoCoverage = totalRows > 0 ? ((exactSum + aliasSum + fuzzySum) / totalRows) * 100 : 100;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const convertedCount = rows.filter((r) => r.status === 'converted').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

  const chartData = rows.slice(-10).map((r) => ({
    name: `${r.itemName.slice(0, 12)}`,
    تلقائي: r.exact + r.alias,
    تقريبي: r.fuzzy,
    غيرمطابق: r.none + r.unknowns,
  }));

  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'مراجعة توزيعات البوت (Distributions Review)',
      subtitle: `${COMPANY} — ${periodLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['التوزيعات', `${rows.length}`],
        ['الكمية الموزعة', fmt(totalQty)],
        ['المطابقة التلقائية', `${autoCoverage.toFixed(1)}%`],
        ['أهداف مجهولة', `${unknownSum}`],
      ],
      tables: [
        {
          title: 'التوزيعات',
          header: ['التاريخ', 'المصدر', 'من فرع', 'الصنف', 'الصفوف', 'الكمية (مخزون)', 'تلقائي', 'تقريبي', 'غير مطابق', 'مجهول', 'تغطية %', 'الحالة'],
          rows: rows.map((r) => [r.createdAt.slice(0, 10), r.source, r.fromBranch, r.itemName, r.rows, fmt(r.inventoryTotal), r.exact + r.alias, r.fuzzy, r.none, r.unknowns, `${r.coveragePct.toFixed(0)}%`, r.status]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'التوزيعات',
      header: ['التاريخ', 'المصدر', 'من فرع', 'الصنف', 'الصفوف', 'الكمية (مخزون)', 'تلقائي', 'تقريبي', 'غير مطابق', 'مجهول', 'تغطية %', 'الحالة'],
      rows: rows.map((r) => [r.createdAt.slice(0, 10), r.source, r.fromBranch, r.itemName, r.rows, r.inventoryTotal, r.exact + r.alias, r.fuzzy, r.none, r.unknowns, `${r.coveragePct.toFixed(0)}%`, r.status]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مراجعة توزيعات البوت (Distributions Review)"
        subtitle={`${COMPANY} — ${periodLabel}`}
        icon={<Network className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Distributions_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
                  ))}
                </select>
              </Field>
              <Field label="الحالة">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الحالات</option>
                  <option value="approved">معتمد</option>
                  <option value="converted">محوّل</option>
                  <option value="pending">معلق</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {rows.length} توزيع (من {distributions.length} إجمالي)
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">التوزيعات</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{rows.length}</strong>
          <span className="text-[10px] text-blue-500 block">{totalRows} صف توزيع</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">الكمية الموزعة (مخزون)</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmt(totalQty)}</strong>
          <span className="text-[10px] text-emerald-500 block">بوحدة المخزون</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">المطابقة التلقائية</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{autoCoverage.toFixed(1)}%</strong>
          <span className="text-[10px] text-indigo-500 block">تلقائي {exactSum + aliasSum} · تقريبي {fuzzySum} · لا شيء {noneSum}</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">لم تُحَل (مجهولة/معلقة)</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{unknownSum + pendingCount + noneSum}</strong>
          <span className="text-[10px] text-rose-500 block">معلق {pendingCount} · معتمد {approvedCount + convertedCount} · مرفوض {rejectedCount}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Network className="w-5 h-5 text-emerald-600" /> جودة المطابقة (آخر {Math.min(10, chartData.length)} توزيع)
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tick={{ fill: '#475569' }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="تلقائي" stackId="a" fill="#10b981" maxBarSize={44} />
              <Bar dataKey="تقريبي" stackId="a" fill="#f59e0b" maxBarSize={44} />
              <Bar dataKey="غيرمطابق" stackId="a" fill="#f43f5e" maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">تفاصيل التوزيعات الواردة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">المصدر</th>
                <th className="p-2 text-center">من فرع</th>
                <th className="p-2 text-center">الصنف</th>
                <th className="p-2 text-center">الصفوف</th>
                <th className="p-2 text-center">الكمية (مخزون)</th>
                <th className="p-2 text-center">تلقائي</th>
                <th className="p-2 text-center">تقريبي</th>
                <th className="p-2 text-center">غير مطابق</th>
                <th className="p-2 text-center">مجهول</th>
                <th className="p-2 text-center">تغطية %</th>
                <th className="p-2 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="tnum text-left p-2 text-slate-500 text-[10px]">{r.createdAt.slice(0, 10)}</td>
                  <td className="p-2 text-center">{r.source}</td>
                  <td className="p-2 text-center">{r.fromBranch}</td>
                  <td className="p-2 text-center font-bold text-slate-800">{r.itemName}</td>
                  <td className="tnum p-2 text-left">{r.rows}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmt(r.inventoryTotal)}</td>
                  <td className="tnum p-2 text-left text-emerald-600">{r.exact + r.alias}</td>
                  <td className="tnum p-2 text-left text-amber-600">{r.fuzzy}</td>
                  <td className="tnum p-2 text-left text-rose-600">{r.none}</td>
                  <td className="tnum p-2 text-left text-rose-500">{r.unknowns}</td>
                  <td className={`p-2 text-center font-mono font-bold ${r.coveragePct >= 95 ? 'text-emerald-600' : r.coveragePct >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>{r.coveragePct.toFixed(0)}%</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'approved' || r.status === 'converted' ? 'bg-emerald-100 text-emerald-700' : r.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                      {r.status === 'converted' ? 'محوّل' : r.status === 'approved' ? 'معتمد' : r.status === 'pending' ? 'معلق' : 'مرفوض'}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-slate-400">لا توجد توزيعات لهذا الفلتر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DistributionsReport;