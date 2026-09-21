import React, { useMemo, useState } from 'react';
import { Printer, CalendarDays } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel, VAT_RATE, netOfGross } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// نسبة تكلفة الطعام اليومية (Food Cost — Daily)
// الهوية (مستمدّة من `/insights` foodcost في v7.0):
//   لكل يوم: الإيراد الصافي، تكلفة الطعام (فعلي)، النسبة = تكلفة ÷ إيراد،
//   حركة النسبة (Δ عن اليوم السابق)، متوسط تراكمي، ومقارنة بالهدف
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface DayRow {
  date: string;
  records: number;
  net: number;
  food: number;
  pct: number;
  deltaPct: number;
  cumPct: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const FoodCostDailyReport: React.FC = () => {
  const { batchSalesRecords, branches, recipes, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const periodLabel = monthLabel(periodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const target = useMemo(() => {
    const t = recipes.filter((r) => r.isActive !== false && typeof r.targetFoodCostPercent === 'number' && r.targetFoodCostPercent > 0).map((r) => r.targetFoodCostPercent as number);
    return t.length ? t.reduce((a, b) => a + b, 0) / t.length : 30;
  }, [recipes]);

  const days = useMemo<DayRow[]>(() => {
    const map = new Map<string, DayRow>();
    for (const r of batchSalesRecords) {
      if ((r.date || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
      const key = (r.date || '').slice(0, 10);
      const cur = map.get(key) ?? { date: key, records: 0, net: 0, food: 0, pct: 0, deltaPct: 0, cumPct: 0 };
      cur.records += 1;
      cur.net += r.netRevenue ?? netOfGross(r.totalRevenue, r.vatRate ?? VAT_RATE);
      cur.food += r.totalFoodCost || 0;
      map.set(key, cur);
    }
    const out = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    let prevPct: number | null = null;
    let runNet = 0;
    let runFood = 0;
    for (const d of out) {
      d.pct = d.net > 0 ? (d.food / d.net) * 100 : 0;
      d.deltaPct = prevPct != null ? d.pct - prevPct : 0;
      prevPct = d.pct;
      runNet += d.net;
      runFood += d.food;
      d.cumPct = runNet > 0 ? (runFood / runNet) * 100 : 0;
    }
    return out;
  }, [batchSalesRecords, periodValue, branchFilter]);

  const totals = useMemo(() => {
    const t = days.reduce((acc, d) => {
      acc.records += d.records;
      acc.net += d.net;
      acc.food += d.food;
      return acc;
    }, { records: 0, net: 0, food: 0 });
    return { ...t, pct: t.net > 0 ? (t.food / t.net) * 100 : 0 };
  }, [days]);

  const bestDay = days.reduce((acc, d) => (!acc || d.pct < acc.pct ? d : acc), days[0]);
  const worstDay = days.reduce((acc, d) => (!acc || d.pct > acc.pct ? d : acc), days[0]);
  const withinTarget = days.filter((d) => d.pct <= target).length;

  const chartData = days.map((d) => ({ name: d.date.slice(8, 10), 'الإيراد': Number(d.net.toFixed(0)), 'نسبة %': Number(d.pct.toFixed(1)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'نسبة تكلفة الطعام اليومية (Food Cost — Daily)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['أيام', `${days.length} يوم (${withinTarget} ضمن الهدف ${target.toFixed(1)}%)`],
        ['متوسط التجميعي', `${totals.pct.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'اليوميات',
          header: ['اليوم', 'السجلات', 'الإيراد', 'تكلفة الطعام', 'نسبة %', 'Δ عن السابق', 'متوسط تراكمي %'],
          rows: [
            ...days.map((d) => [d.date, d.records, fmtMoney(d.net), fmtMoney(d.food), `${d.pct.toFixed(1)}%`, `${d.deltaPct > 0 ? '+' : ''}${d.deltaPct.toFixed(1)}`, `${d.cumPct.toFixed(1)}%`]),
            ['الإجمالي', totals.records, fmtMoney(totals.net), fmtMoney(totals.food), `${totals.pct.toFixed(1)}%`, '—', '—'],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'اليوميات',
      header: ['اليوم', 'السجلات', 'الإيراد', 'تكلفة الطعام', 'نسبة %', 'Δ عن السابق', 'متوسط تراكمي %'],
      rows: days.map((d) => [d.date, d.records, d.net.toFixed(2), d.food.toFixed(2), `${d.pct.toFixed(1)}%`, `${d.deltaPct > 0 ? '+' : ''}${d.deltaPct.toFixed(1)}`, `${d.cumPct.toFixed(1)}%`]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="نسبة تكلفة الطعام اليومية (Food Cost — Daily)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<CalendarDays className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Food_Cost_Daily_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — الهدف: {target.toFixed(1)}%
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">متوسط نسبة الطعام (تجميعي)</span>
          <strong className={`text-lg font-extrabold font-mono block ${totals.pct <= target ? 'text-emerald-700' : 'text-amber-700'}`}>{totals.pct.toFixed(1)}%</strong>
          <span className="text-[10px] text-blue-500 block">{days.length} يوم عمل</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">أفضل يوم</span>
          <strong className="text-lg font-extrabold text-emerald-800 block">{bestDay ? bestDay.date.slice(8, 10) : '—'}</strong>
          <span className="text-[10px] text-emerald-500 block">{bestDay ? `${bestDay.pct.toFixed(1)}% (${fmtMoney(bestDay.net)})` : ''}</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">أسوأ يوم</span>
          <strong className="text-lg font-extrabold text-rose-800 block">{worstDay ? worstDay.date.slice(8, 10) : '—'}</strong>
          <span className="text-[10px] text-rose-500 block">{worstDay ? `${worstDay.pct.toFixed(1)}% (${fmtMoney(worstDay.net)})` : ''}</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">أيام ضمن الهدف {target.toFixed(1)}%</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{withinTarget} / {days.length}</strong>
          <span className="text-[10px] text-amber-500 block">({days.length ? ((withinTarget / days.length) * 100).toFixed(0) : 0}%)</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-600" /> الإيراد اليومي ونسبة الطعام
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} />
              <YAxis yAxisId="rev" fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 60]} fontSize={10} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [`${Number(v)}${name === 'الإيراد' ? '' : '%'}`, String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="الإيراد" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line yAxisId="pct" dataKey="نسبة %" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
              <ReferenceLine yAxisId="pct" y={Number(target.toFixed(1))} stroke="#94a3b8" strokeDasharray="8 4" label={{ value: `الهدف ${target.toFixed(1)}%`, fontSize: 10, fill: '#64748b', position: 'insideBottomRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول اليوميات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">اليوم</th>
                <th className="p-2 text-center">السجلات</th>
                <th className="p-2 text-center">الإيراد</th>
                <th className="p-2 text-center">تكلفة الطعام</th>
                <th className="p-2 text-center">نسبة %</th>
                <th className="p-2 text-center">Δ عن السابق</th>
                <th className="p-2 text-center">متوسط تراكمي %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {days.map((d, i) => (
                <tr key={d.date} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-mono text-slate-600 text-[11px]">{d.date.slice(8, 10)} / {d.date.slice(5, 7)} / {d.date.slice(0, 4)}</td>
                  <td className="p-2 text-center font-mono">{d.records}</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(d.net)}</td>
                  <td className="p-2 text-center font-mono text-slate-600">{fmtMoney(d.food)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${d.pct <= target ? 'text-emerald-600' : d.pct <= target * 1.1 ? 'text-amber-600' : 'text-rose-600'}`}>{d.pct.toFixed(1)}%</td>
                  <td className={`p-2 text-center font-mono ${posNeg(-d.deltaPct)}`}>{d.deltaPct > 0 ? '+' : ''}{d.deltaPct.toFixed(1)}</td>
                  <td className="p-2 text-center font-mono text-indigo-700">{d.cumPct.toFixed(1)}%</td>
                </tr>
              ))}
              {!days.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-400">لا توجد بيانات لهذه الفترة</td>
                </tr>
              )}
              {!!days.length && (
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center font-mono">{totals.records}</td>
                  <td className="p-2 text-center font-mono text-blue-700 text-lg">{fmtMoney(totals.net)}</td>
                  <td className="p-2 text-center font-mono">{fmtMoney(totals.food)}</td>
                  <td className={`p-2 text-center font-mono text-lg ${totals.pct <= target ? 'text-emerald-700' : 'text-amber-700'}`}>{totals.pct.toFixed(1)}%</td>
                  <td className="p-2 text-center text-slate-400">—</td>
                  <td className="p-2 text-center text-slate-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default FoodCostDailyReport;