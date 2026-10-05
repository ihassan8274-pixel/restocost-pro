import React, { useMemo, useState } from 'react';
import { Printer, Trophy, AlertTriangle, Building2, Target } from 'lucide-react';
import {
  BarChart,
  Bar,
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
import { fmt, fmtMoney, monthLabel, VAT_RATE, netOfGross } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// بطاقة أداء الفرع (Branch Scorecard — KPIs)
// الهوية (مستمدّة من `/insights` best/worst في v7.0):
//   مؤشرات تشغيلية مجمعة لكل فرع تُقارَن في فترة واحدة وترتبط لأفضل/أسوأ فرع
//   الإيراد → تكلفة الطعام → الهدر → هامش مساهمة → عمالة+تشغيل → صافي الربح
//   + نقطة التعادل وهامش الأمان + تحويل نسبة الطعام (أدناه أفضل)
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface ScorecardRow {
  branchId: string;
  branchName: string;
  records: number;
  qtySold: number;
  netRevenue: number;
  foodCost: number;
  foodCostPct: number;
  wastage: number;
  variableCost: number;
  cmPct: number;
  labor: number;
  opex: number;
  fixedCost: number;
  profit: number;
  profitPct: number;
  breakEven: number;
  beOk: boolean;
  safetyMargin: number;
  prevRevenue: number;
  deltaRevPct: number | null;
  withinTarget: boolean;
}

interface Totals {
  branches: number;
  records: number;
  netRevenue: number;
  qtySold: number;
  foodCost: number;
  foodCostPct: number;
  profit: number;
  profitPct: number;
  withinTargetCount: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const pctColor = (p: number, target: number) => (p <= target ? 'text-emerald-600' : p <= target * 1.1 ? 'text-amber-600' : 'text-rose-600');
const posNegColor = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const BranchScorecardReport: React.FC = () => {
  const {
    batchSalesRecords, branches, shifts, operatingExpenses, wastageLogs, recipes,
    getBranchName,
  } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'revenue' | 'foodCost' | 'profit' | 'qty'>('revenue');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const prevMonth = useMemo(() => {
    const idx = periods.indexOf(periodValue);
    return idx >= 0 && idx < periods.length - 1 ? periods[idx + 1] : null;
  }, [periods, periodValue]);

  const targetFoodCost = useMemo(() => {
    const tgts = recipes.filter((r) => r.isActive !== false && typeof r.targetFoodCostPercent === 'number' && r.targetFoodCostPercent > 0).map((r) => r.targetFoodCostPercent as number);
    return tgts.length ? tgts.reduce((a, b) => a + b, 0) / tgts.length : 30;
  }, [recipes]);

  const rows = useMemo<ScorecardRow[]>(() => {
    const out: ScorecardRow[] = [];
    branches.forEach((b) => {
      if (branchFilter !== 'all' && b.id !== branchFilter) return;
      const recs = batchSalesRecords.filter((r) => r.branchId === b.id && (r.date || '').slice(0, 7) === periodValue);
      if (!recs.length) return;
      let net = 0, food = 0, qty = 0;
      recs.forEach((r) => {
        net += r.netRevenue ?? netOfGross(r.totalRevenue, r.vatRate ?? VAT_RATE);
        food += r.totalFoodCost || 0;
        qty += (r.items || []).reduce((s, it) => s + (it.quantitySold || 0), 0);
      });
      const wastage = wastageLogs
        .filter((w) => w.branchId === b.id && (w.date || '').slice(0, 7) === periodValue)
        .reduce((s, w) => s + (w.totalCostImpact || 0), 0);
      const labor = shifts
        .filter((s) => s.branchId === b.id && (s.date || '').slice(0, 7) === periodValue)
        .reduce((s, sh) => s + (sh.totalShiftCost || 0), 0);
      const opex = operatingExpenses
        .filter((e) => e.branchId === b.id && e.paymentStatus === 'paid' && (e.dueDate || '').slice(0, 7) === periodValue)
        .reduce((s, e) => s + (e.amount || 0), 0);
      const variableCost = food + wastage;
      const cmPct = net > 0 ? ((net - variableCost) / net) * 100 : 0;
      const cmRatio = net > 0 ? (net - variableCost) / net : 0;
      const fixedCost = labor + opex;
      const profit = net - variableCost - fixedCost;
      const beRaw = cmRatio > 0 ? fixedCost / cmRatio : Infinity;
      const breakEven = Number.isFinite(beRaw) ? beRaw : 0;
      const safetyMargin = Number.isFinite(beRaw) && net > 0 ? ((net - beRaw) / net) * 100 : 0;
      const prevRecs = prevMonth
        ? batchSalesRecords.filter((r) => r.branchId === b.id && (r.date || '').slice(0, 7) === prevMonth)
        : [];
      const prevRevenue = prevRecs.reduce((s, r) => s + (r.netRevenue ?? netOfGross(r.totalRevenue, r.vatRate ?? VAT_RATE)), 0);
      const deltaRevPct = prevRevenue > 0 ? ((net - prevRevenue) / prevRevenue) * 100 : null;
      out.push({
        branchId: b.id,
        branchName: b.nameAr,
        records: recs.length,
        qtySold: qty,
        netRevenue: net,
        foodCost: food,
        foodCostPct: net > 0 ? (food / net) * 100 : 0,
        wastage,
        variableCost,
        cmPct,
        labor,
        opex,
        fixedCost,
        profit,
        profitPct: net > 0 ? (profit / net) * 100 : 0,
        breakEven,
        beOk: Number.isFinite(beRaw),
        safetyMargin,
        prevRevenue,
        deltaRevPct,
        withinTarget: net > 0 ? food / net * 100 <= targetFoodCost : true,
      });
    });
    if (sortMode === 'foodCost') return out.sort((a, b) => a.foodCostPct - b.foodCostPct);
    if (sortMode === 'profit') return out.sort((a, b) => b.profitPct - a.profitPct);
    if (sortMode === 'qty') return out.sort((a, b) => b.qtySold - a.qtySold);
    return out.sort((a, b) => b.netRevenue - a.netRevenue);
  }, [branches, batchSalesRecords, shifts, operatingExpenses, wastageLogs, branchFilter, periodValue, prevMonth, sortMode, targetFoodCost]);

  const totals = useMemo<Totals>(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.branches += 1;
        acc.records += r.records;
        acc.netRevenue += r.netRevenue;
        acc.qtySold += r.qtySold;
        acc.foodCost += r.foodCost;
        acc.profit += r.profit;
        if (r.withinTarget) acc.withinTargetCount += 1;
        return acc;
      },
      { branches: 0, records: 0, netRevenue: 0, qtySold: 0, foodCost: 0, foodCostPct: 0, profit: 0, profitPct: 0, withinTargetCount: 0 }
    );
    t.foodCostPct = t.netRevenue > 0 ? (t.foodCost / t.netRevenue) * 100 : 0;
    t.profitPct = t.netRevenue > 0 ? (t.profit / t.netRevenue) * 100 : 0;
    return t;
  }, [rows]);

  const bestRevenue = useMemo(() => rows.reduce<ScorecardRow | null>((acc, r) => (!acc || r.netRevenue > acc.netRevenue ? r : acc), null), [rows]);
  const bestMargin = useMemo(() => rows.reduce<ScorecardRow | null>((acc, r) => (!acc || r.profitPct > acc.profitPct ? r : acc), null), [rows]);
  const bestFood = useMemo(() => rows.reduce<ScorecardRow | null>((acc, r) => (!acc || r.foodCostPct < acc.foodCostPct ? r : acc), null), [rows]);
  const worstFood = useMemo(() => rows.reduce<ScorecardRow | null>((acc, r) => (!acc || r.foodCostPct > acc.foodCostPct ? r : acc), null), [rows]);

  const periodLabel = monthLabel(periodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const chartData = [...rows]
    .sort((a, b) => b.foodCostPct - a.foodCostPct)
    .map((r) => ({ name: r.branchName, نسبة: Number(r.foodCostPct.toFixed(1)), profit: Number(r.profitPct.toFixed(1)) }));

  const chartTooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'بطاقة أداء الفروع (Branch Scorecard)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['فروع مفعلة', `${totals.branches}`],
        ['هدف نسبة الطعام', `${targetFoodCost.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'مؤشرات الفروع',
          header: ['الفرع', 'السجلات', 'الكمية', 'الإيراد', 'تكلفة الطعام', 'نسبة الطعام %', 'الهدر', 'العمالة', 'التشغيل', 'صافي الربح', 'ربح %', 'التعادل', 'هامش أمان %'],
          rows: [
            ...rows.map((r) => [
              r.branchName, r.records, fmt(r.qtySold), r.netRevenue, r.foodCost, `${r.foodCostPct.toFixed(1)}%`,
              r.wastage, r.labor, r.opex, r.profit, `${r.profitPct.toFixed(1)}%`, r.beOk ? fmtMoney(r.breakEven) : '—', `${r.safetyMargin.toFixed(1)}%`,
            ]),
            ['الإجمالي', totals.records, fmt(totals.qtySold), totals.netRevenue, totals.foodCost, `${totals.foodCostPct.toFixed(1)}%`, '—', '—', '—', totals.profit, `${totals.profitPct.toFixed(1)}%`, '—', '—'],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'بطاقة الفرع',
      header: ['الفرع', 'السجلات', 'الكمية', 'الإيراد', 'Δ عن السابق %', 'تكلفة الطعام', 'نسبة الطعام %', 'الهدر', 'العمالة', 'التشغيل', 'صافي الربح', 'ربح %', 'التعادل', 'هامش أمان %'],
      rows: rows.map((r) => [
        r.branchName, r.records, r.qtySold, r.netRevenue.toFixed(2), r.deltaRevPct != null ? `${r.deltaRevPct.toFixed(1)}%` : '-',
        r.foodCost.toFixed(2), `${r.foodCostPct.toFixed(1)}%`, r.wastage.toFixed(2), r.labor.toFixed(2), r.opex.toFixed(2),
        r.profit.toFixed(2), `${r.profitPct.toFixed(1)}%`, r.beOk ? r.breakEven.toFixed(2) : '-', `${r.safetyMargin.toFixed(1)}%`,
      ]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="بطاقة أداء الفروع (Branch Scorecard)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Building2 className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Branch_Scorecard_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="ترتيب">
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className={inputCls + ' !w-40'}>
                  <option value="revenue">الإيراد</option>
                  <option value="foodCost">نسبة الطعام (الأدنى أولاً)</option>
                  <option value="profit">نسبة الربح</option>
                  <option value="qty">الكمية</option>
                </select>
              </Field>
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">إجمالي الإيراد (صافي)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono">{fmtMoney(totals.netRevenue)}</strong>
          <span className="text-[10px] text-blue-500 block">{totals.records} سجل مبيعات</span>
        </div>
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <span className="text-[10px] text-brand-600 font-bold block">الكمية المباعة</span>
          <strong className="text-lg font-extrabold text-brand-800 font-mono">{fmt(totals.qtySold)}</strong>
          <span className="text-[10px] text-brand-500 block">عبر {totals.branches} فرع</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">متوسط نسبة الطعام</span>
          <strong className={`text-lg font-extrabold font-mono ${pctColor(totals.foodCostPct, targetFoodCost)}`}>{totals.foodCostPct.toFixed(1)}%</strong>
          <span className="text-[10px] text-amber-600 block">الهدف {targetFoodCost.toFixed(1)}% — {totals.withinTargetCount}/{totals.branches} فرع ضمنه</span>
        </div>
        <div className={`${totals.profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'} border rounded-xl p-4`}>
          <span className={`text-[10px] font-bold block ${posNegColor(totals.profit)}`}>صافي الربح</span>
          <strong className={`text-lg font-extrabold font-mono ${posNegColor(totals.profit)}`}>{fmtMoney(totals.profit)}</strong>
          <span className={`text-[10px] block ${posNegColor(totals.profit)}`}>({totals.profitPct.toFixed(1)}%)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { icon: Trophy, label: 'أعلى إيراد', value: bestRevenue?.branchName || '—', accent: 'from-blue-50 to-blue-100 text-blue-800', sub: firstVal(bestRevenue, (r) => fmtMoney(r.netRevenue)) },
          { icon: Trophy, label: 'أعلى نسبة ربح', value: bestMargin?.branchName || '—', accent: 'from-emerald-50 to-emerald-100 text-emerald-800', sub: firstVal(bestMargin, (r) => `${r.profitPct.toFixed(1)}%`) },
          { icon: Target, label: 'أفضل نسبة طعام', value: bestFood?.branchName || '—', accent: 'from-amber-50 to-amber-100 text-amber-800', sub: firstVal(bestFood, (r) => `${r.foodCostPct.toFixed(1)}%`) },
          { icon: AlertTriangle, label: 'أضعف نسبة طعام', value: worstFood?.branchName || '—', accent: 'from-rose-50 to-rose-100 text-rose-800', sub: firstVal(worstFood, (r) => `${r.foodCostPct.toFixed(1)}% مقابل ${targetFoodCost.toFixed(1)}%`) },
        ].map((b, i) => (
          <Card key={i} className={`p-4 bg-transparent ${b.accent}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold block">{b.label}</span>
              <b.icon className="w-4 h-4" />
            </div>
            <strong className="block text-base font-extrabold mt-1">{b.value}</strong>
            <span className="text-[11px] font-mono opacity-70 block">{b.sub}</span>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" /> نسبة الطعام والربح لكل فرع
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={44} />
              <YAxis domain={[0, Math.max(60, Math.ceil(Math.max(...rows.map((r) => r.foodCostPct), targetFoodCost * 1.3) / 10) * 10)]} fontSize={10} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown, name) => [`${Number(v)}%`, name === 'نسبة' ? 'نسبة الطعام %' : 'نسبة الربح %']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="نسبة" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={44} />
              <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} />
              <ReferenceLine y={Number(targetFoodCost.toFixed(1))} stroke="#94a3b8" strokeDasharray="8 4" label={{ value: `الهدف ${targetFoodCost.toFixed(1)}%`, fontSize: 10, fill: '#64748b', position: 'insideBottomRight' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول مؤشرات الفروع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-center">الإيراد</th>
                <th className="p-2 text-center">Δ%</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">نسبة الطعام %</th>
                <th className="p-2 text-center">الهدر</th>
                <th className="p-2 text-center">العمالة</th>
                <th className="p-2 text-center">التشغيل</th>
                <th className="p-2 text-center">صافي الربح</th>
                <th className="p-2 text-center">ربح %</th>
                <th className="p-2 text-center">نقطة التعادل</th>
                <th className="p-2 text-center">هامش أمان %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.branchName}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(r.netRevenue)}</td>
                  <td className={`p-2 text-center font-mono ${r.deltaRevPct != null ? posNegColor(r.deltaRevPct) : 'text-slate-400'}`}>
                    {r.deltaRevPct != null ? `${r.deltaRevPct > 0 ? '+' : ''}${r.deltaRevPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="tnum p-2 text-left">{fmt(r.qtySold)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${pctColor(r.foodCostPct, targetFoodCost)}`}>{r.foodCostPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-rose-600">{fmtMoney(r.wastage)}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.labor)}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.opex)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${posNegColor(r.profit)}`}>{fmtMoney(r.profit)}</td>
                  <td className={`p-2 text-center font-mono ${posNegColor(r.profitPct)}`}>{r.profitPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-slate-600">{r.beOk ? fmtMoney(r.breakEven) : '—'}</td>
                  <td className={`p-2 text-center font-mono ${r.safetyMargin >= 20 ? 'text-emerald-600' : r.safetyMargin >= 10 ? 'text-amber-600' : 'text-rose-600'}`}>{r.safetyMargin.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي</td>
                <td className="tnum p-2 text-left text-blue-700">{fmtMoney(totals.netRevenue)}</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className="tnum p-2 text-left">{fmt(totals.qtySold)}</td>
                <td className={`p-2 text-center font-mono text-lg ${pctColor(totals.foodCostPct, targetFoodCost)}`}>{totals.foodCostPct.toFixed(1)}%</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className={`p-2 text-center font-mono text-lg ${posNegColor(totals.profit)}`}>{fmtMoney(totals.profit)}</td>
                <td className={`p-2 text-center font-mono ${posNegColor(totals.profitPct)}`}>{totals.profitPct.toFixed(1)}%</td>
                <td className="p-2 text-center text-slate-400">—</td>
                <td className="p-2 text-center text-slate-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

function firstVal(r: ScorecardRow | null, fn: (r: ScorecardRow) => string): string {
  return r ? fn(r) : '—';
}

export default BranchScorecardReport;