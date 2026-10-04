import React, { useMemo, useState } from 'react';
import { Printer, TrendingDown, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// اتجاه تكلفة الطعام — 12 شهر (Food Cost Trend 12)
// الهوية (مستمدّة من `/insights` foodcost في v7.0):
//   نسبة تكلفة الطعام الشهرية = Σ تكلفة الطعام ÷ Σ الإيراد × 100  (تجميع ثم نسبة)
//   منحنى الهدف (متوسط targetFoodCostPercent للوصفات) كخط مرجعي متقطع
// فلاتر: سنة + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface MonthPoint {
  month: string;
  label: string;
  revenue: number;
  foodCost: number;
  pct: number;
  /** الرقم على محور الرسم البياني */
  pctAxis: number;
  prevPct: number | null;
  deltaPct: number | null;
  vsTarget: number | null;
}

interface BranchTrend {
  branchId: string;
  branchName: string;
  lastPct: number;
  avgPct: number;
  revenue: number;
  foodCost: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const pctColor = (p: number, target: number) =>
  p <= target ? 'text-emerald-600' : p <= target * 1.1 ? 'text-amber-600' : 'text-rose-600';

const ArrowDelta = ({ v, invert }: { v: number; invert?: boolean }) => {
  // في مؤشر تكلفة الطعام: الارتفاع سيئ والانخفاض جيد، لذا نعكس اتجاه السهم
  const good = invert ? v < 0 : v > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono font-bold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '—'} {Math.abs(v).toFixed(1)}%
    </span>
  );
};

const chartTooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

export const FoodCostTrendReport: React.FC = () => {
  const { batchSalesRecords, branches, recipes, getBranchName } = useApp();
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const years = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );

  const allMonths = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );

  const shownMonths = useMemo(() => {
    if (yearFilter === 'all') {
      // آخر 12 شهراً متاحة تنازلياً (الأحدث أولاً)
      return allMonths.slice(0, 12);
    }
    return allMonths.filter((m) => m.slice(0, 4) === yearFilter);
  }, [allMonths, yearFilter]);

  const targetFoodCost = useMemo(() => {
    const tgts = recipes.filter((r) => r.isActive !== false && typeof r.targetFoodCostPercent === 'number' && r.targetFoodCostPercent > 0).map((r) => r.targetFoodCostPercent as number);
    if (!tgts.length) return 30;
    return tgts.reduce((a, b) => a + b, 0) / tgts.length;
  }, [recipes]);

  const monthPoints = useMemo<MonthPoint[]>(
    () =>
      shownMonths
        .map((month, idx) => {
          const recs = batchSalesRecords.filter(
            (b) => (b.date || '').slice(0, 7) === month && (branchFilter === 'all' || b.branchId === branchFilter)
          );
          const revenue = recs.reduce((s, b) => s + (b.totalRevenue || 0), 0);
          const foodCost = recs.reduce((s, b) => s + (b.totalFoodCost || 0), 0);
          const pct = revenue > 0 ? (foodCost / revenue) * 100 : 0;
          const prevPct = idx + 1 < shownMonths.length ? (() => {
            const p = shownMonths[idx + 1];
            const prev = batchSalesRecords.filter(
              (b) => (b.date || '').slice(0, 7) === p && (branchFilter === 'all' || b.branchId === branchFilter)
            );
            const prevRev = prev.reduce((s, b) => s + (b.totalRevenue || 0), 0);
            return prevRev > 0 ? (prev.reduce((s, b) => s + (b.totalFoodCost || 0), 0) / prevRev) * 100 : null;
          })() : null;
          return {
            month,
            label: monthLabel(month),
            revenue,
            foodCost,
            pct,
            pctAxis: pct,
            prevPct,
            deltaPct: prevPct != null ? pct - prevPct : null,
            vsTarget: pct - targetFoodCost,
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month)),
    [shownMonths, batchSalesRecords, branchFilter, targetFoodCost]
  );

  const totals = useMemo(() => {
    const revenue = monthPoints.reduce((s, m) => s + m.revenue, 0);
    const foodCost = monthPoints.reduce((s, m) => s + m.foodCost, 0);
    const avgPct = revenue > 0 ? (foodCost / revenue) * 100 : 0;
    const last = monthPoints[monthPoints.length - 1];
    const best = monthPoints.reduce<MonthPoint>((acc, m) => (m.pct < acc.pct ? m : acc), monthPoints[0]);
    const worst = monthPoints.reduce<MonthPoint>((acc, m) => (m.pct > acc.pct ? m : acc), monthPoints[0]);
    return { revenue, foodCost, avgPct, last, best, worst };
  }, [monthPoints]);

  const branchRows = useMemo<BranchTrend[]>(
    () =>
      branches
        .map((b) => {
          if (branchFilter !== 'all' && b.id !== branchFilter) return null;
          const recs = batchSalesRecords.filter((r) => (r.branchId === b.id) && shownMonths.includes((r.date || '').slice(0, 7)));
          const revenue = recs.reduce((s, r) => s + (r.totalRevenue || 0), 0);
          const foodCost = recs.reduce((s, r) => s + (r.totalFoodCost || 0), 0);
          if (!recs.length) return null;
          const avgPct = revenue > 0 ? (foodCost / revenue) * 100 : 0;
          const lastMonth = shownMonths[0];
          const lastRecs = recs.filter((r) => (r.date || '').slice(0, 7) === lastMonth);
          const lastRev = lastRecs.reduce((s, r) => s + (r.totalRevenue || 0), 0);
          const lastPct = lastRev > 0 ? (lastRecs.reduce((s, r) => s + (r.totalFoodCost || 0), 0) / lastRev) * 100 : avgPct;
          return { branchId: b.id, branchName: b.nameAr, lastPct, avgPct, revenue, foodCost };
        })
        .filter((r): r is BranchTrend => r !== null)
        .sort((a, b) => b.lastPct - a.lastPct),
    [branches, batchSalesRecords, shownMonths, branchFilter]
  );

  const periodLabel = shownMonths.length ? `${monthLabel(shownMonths[shownMonths.length - 1])} → ${monthLabel(shownMonths[0])}` : '—';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const last = totals.last;
  const lastDelta = last?.deltaPct != null ? last.deltaPct : null;

  const printReport = () => {
    openPrintWindow({
      title: 'اتجاه تكلفة الطعام — 12 شهر',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['الهدف', `${targetFoodCost.toFixed(1)}%`],
        ['متوسط النسبة', `${totals.avgPct.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'تفصيل شهري',
          header: ['الشهر', 'الإيراد', 'تكلفة الطعام', 'نسبة الطعام %', 'الفرق عن السابق', 'فرق عن الهدف'],
          rows: [
            ...monthPoints.map((m) => [
              m.label, m.revenue, m.foodCost, `${m.pct.toFixed(1)}%`,
              m.deltaPct != null ? `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct.toFixed(1)}%` : '—',
              m.vsTarget != null ? `${m.vsTarget > 0 ? '+' : ''}${m.vsTarget.toFixed(1)}%` : '—',
            ]),
            ['الإجمالي / المتوسط', totals.revenue, totals.foodCost, `${totals.avgPct.toFixed(1)}%`, '—', `${(totals.avgPct - targetFoodCost) > 0 ? '+' : ''}${(totals.avgPct - targetFoodCost).toFixed(1)}%`],
          ],
          dense: true,
        },
        {
          title: `مؤشر الفروع — آخر 12 شهراً`,
          header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'آخر شهر %', 'متوسط %', 'عن الهدف'],
          rows: branchRows.map((b) => [
            b.branchName, b.revenue, b.foodCost, `${b.lastPct.toFixed(1)}%`, `${b.avgPct.toFixed(1)}%`,
            `${(b.lastPct - targetFoodCost) > 0 ? '+' : ''}${(b.lastPct - targetFoodCost).toFixed(1)}%`,
          ]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'شهري',
      header: ['الشهر', 'الإيراد', 'تكلفة الطعام', 'نسبة الطعام %', 'الفرق عن السابق', 'فرق عن الهدف'],
      rows: [
        ...monthPoints.map((m) => [m.label, m.revenue.toFixed(2), m.foodCost.toFixed(2), `${m.pct.toFixed(1)}%`, m.deltaPct != null ? `${m.deltaPct.toFixed(1)}%` : '-', `${(m.vsTarget ?? 0).toFixed(1)}%`]),
        ['الإجمالي', totals.revenue.toFixed(2), totals.foodCost.toFixed(2), `${totals.avgPct.toFixed(1)}%`, '-', `${(totals.avgPct - targetFoodCost).toFixed(1)}%`],
      ],
    },
    {
      name: 'الفروع',
      header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'آخر شهر %', 'متوسط %', 'عن الهدف'],
      rows: branchRows.map((b) => [b.branchName, b.revenue.toFixed(2), b.foodCost.toFixed(2), `${b.lastPct.toFixed(1)}%`, `${b.avgPct.toFixed(1)}%`, `${(b.lastPct - targetFoodCost).toFixed(1)}%`]),
    },
  ];

  const chartData = monthPoints.map((m) => ({ name: m.label, إيراد: Math.round(m.revenue), ratio: Number(m.pct.toFixed(1)) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="اتجاه تكلفة الطعام — 12 شهر (Food Cost Trend)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel} — الهدف ${targetFoodCost.toFixed(1)}%`}
        icon={<TrendingDown className="w-6 h-6 text-amber-300" />}
        actions={
          <>
            <ViewToolbar filename={`FoodCost_Trend12_${yearFilter}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="السنة">
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={inputCls + ' !w-40'}>
                  <option value="all">آخر 12 شهراً</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameAr}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — الهدف {targetFoodCost.toFixed(1)}%
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">إجمالي الإيراد</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono">{fmtMoney(totals.revenue)}</strong>
          <span className="text-[10px] text-blue-500 block">{monthPoints.length} شهر</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">إجمالي تكلفة الطعام</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono">{fmtMoney(totals.foodCost)}</strong>
          <span className="text-[10px] text-indigo-500 block">={(totals.foodCost / (totals.revenue || 1)) * 100 === totals.avgPct ? `${totals.avgPct.toFixed(1)}% من الإيراد` : `${totals.avgPct.toFixed(1)}% من الإيراد`}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">متوسط نسبة الطعام (تجميعي)</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono">{totals.avgPct.toFixed(1)}%</strong>
          <span className={`text-[10px] block ${totals.avgPct <= targetFoodCost ? 'text-emerald-500' : 'text-rose-500'}`}>
            {totals.avgPct <= targetFoodCost ? 'ضمن الهدف' : `${(totals.avgPct - targetFoodCost).toFixed(1)}% فوق الهدف`}
          </span>
        </div>
        <div className={`${lastDelta != null && lastDelta > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4`}>
          <span className="text-[10px] font-bold block text-slate-600">آخر شهر ({last?.label})</span>
          <strong className={`text-lg font-extrabold font-mono ${pctColor(last?.pct ?? 0, targetFoodCost)}`}>{last?.pct.toFixed(1)}%</strong>
          <span className="text-[10px] block text-slate-500">
            {lastDelta != null ? <ArrowDelta v={lastDelta} invert /> : 'لا يوجد شهر سابق'} عن السابق
          </span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-amber-600" /> منحنى نسبة تكلفة الطعام <span className="text-[11px] text-slate-400 font-normal">(أعمدة الإيراد + خط النسبة + خط الهدف)</span>
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} tick={{ fill: '#475569' }} />
              <YAxis yAxisId="rev" hide />
              <YAxis yAxisId="pct" orientation="right" domain={[0, Math.max(60, Math.ceil((Math.max(targetFoodCost * 1.3, ...monthPoints.map((m) => m.pct)) ) / 10) * 10)]} fontSize={10} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown, name) => (name === 'إيراد' ? [fmtMoney(Number(v)), 'الإيراد'] : [`${Number(v)}%`, 'نسبة الطعام %'])} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="إيراد" fill="#818cf8" fillOpacity={0.25} radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Line yAxisId="pct" type="monotone" dataKey="ratio" name="نسبة الطعام %" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} />
              <ReferenceLine yAxisId="pct" y={Number(targetFoodCost.toFixed(1))} stroke="#94a3b8" strokeDasharray="8 4" label={{ value: `الهدف ${targetFoodCost.toFixed(1)}%`, fontSize: 10, fill: '#64748b', position: 'insideBottomRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-amber-600" /> التفصيل الشهري
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الشهر</th>
                <th className="p-2 text-center">الإيراد</th>
                <th className="p-2 text-center">تكلفة الطعام</th>
                <th className="p-2 text-center">نسبة الطعام %</th>
                <th className="p-2 text-center">الفرق عن السابق</th>
                <th className="p-2 text-center">فرق عن الهدف</th>
                <th className="p-2 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthPoints.map((m, i) => {
                const ok = m.pct <= targetFoodCost;
                const warn = !ok && m.pct <= targetFoodCost * 1.1;
                return (
                  <tr key={m.month} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{m.label}</td>
                    <td className="tnum p-2 text-left text-blue-700">{fmtMoney(m.revenue)}</td>
                    <td className="tnum p-2 text-left text-rose-700">{fmtMoney(m.foodCost)}</td>
                    <td className={`p-2 text-center font-mono font-bold ${pctColor(m.pct, targetFoodCost)}`}>{m.pct.toFixed(1)}%</td>
                    <td className="p-2 text-center text-slate-600">{m.deltaPct != null ? <ArrowDelta v={m.deltaPct} invert /> : '—'}</td>
                    <td className={`p-2 text-center font-mono ${m.vsTarget != null && m.vsTarget > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {m.vsTarget != null ? `${m.vsTarget > 0 ? '+' : ''}${m.vsTarget.toFixed(1)}%` : '—'}
                    </td>
                    <td className="p-2 text-center">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold"><CheckCircle2 className="w-3 h-3" />ضمن الهدف</span>
                      ) : warn ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold"><AlertTriangle className="w-3 h-3" />قريب من الحد</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold"><AlertTriangle className="w-3 h-3" />فوق الهدف</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي / المتوسط</td>
                <td className="tnum p-2 text-left text-blue-700">{fmtMoney(totals.revenue)}</td>
                <td className="tnum p-2 text-left text-rose-700">{fmtMoney(totals.foodCost)}</td>
                <td className={`p-2 text-center font-mono text-lg ${pctColor(totals.avgPct, targetFoodCost)}`}>{totals.avgPct.toFixed(1)}%</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className={`p-2 text-center font-mono ${totals.avgPct <= targetFoodCost ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {totals.avgPct <= targetFoodCost ? '' : '+'}{(totals.avgPct - targetFoodCost).toFixed(1)}%
                </td>
                <td className="p-2 text-center text-slate-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-amber-600" /> مؤشر الفروع <span className="text-[11px] text-slate-400 font-normal">(المنطقة المختارة)</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-center">الإيراد</th>
                <th className="p-2 text-center">تكلفة الطعام</th>
                <th className="p-2 text-center">أحدث شهر %</th>
                <th className="p-2 text-center">متوسط %</th>
                <th className="p-2 text-center">أحدث شهر عن الهدف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchRows.map((b, i) => (
                <tr key={b.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{b.branchName}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(b.revenue)}</td>
                  <td className="tnum p-2 text-left text-rose-700">{fmtMoney(b.foodCost)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${pctColor(b.lastPct, targetFoodCost)}`}>{b.lastPct.toFixed(1)}%</td>
                  <td className={`p-2 text-center font-mono ${pctColor(b.avgPct, targetFoodCost)}`}>{b.avgPct.toFixed(1)}%</td>
                  <td className={`p-2 text-center font-mono ${b.lastPct <= targetFoodCost ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {b.lastPct <= targetFoodCost ? '' : '+'}{(b.lastPct - targetFoodCost).toFixed(1)}%
                  </td>
                </tr>
              ))}
              {branchRows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-sm">لا بيانات للفترة والفرع المحددين</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 bg-slate-50 border-slate-200">
        <p className="text-[11px] text-slate-600 leading-relaxed">
          <strong className="text-slate-800">القاعدة الحاكمة: </strong>
          نسبة تكلفة الطعام تحسب تجميعياً (Σ التكلفة ÷ Σ الإيراد × 100) وليس متوسط النسب الشهرية. الهدف المرجعي هنا متوسط
          <strong className="text-slate-700"> targetFoodCostPercent </strong>
          للوصفات النشطة ({targetFoodCost.toFixed(1)}%) بوصفه منحنى قياس — يمكن ضبطه من تعريف الوصفات.
        </p>
      </Card>
    </div>
  );
};

export default FoodCostTrendReport;