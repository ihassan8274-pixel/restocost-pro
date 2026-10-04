import React, { useMemo, useState } from 'react';
import { Printer, LineChart as LineChartIcon } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel, VAT_RATE, netOfGross } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// قائمة دخل مركز الربح (Profit Center P&L)
// الهوية (مستمدّة من `/pl` + `/company-pl` في v7.0):
//   فرع أو شركة مجمعة: الإيراد (خام/ضريبة/صافي) ← تكلفة الطعام ← الهدر ←
//   هامش المساهمة ← العمالة ← التشغيل ← صافي الربح — كقائمة دخل رسمية بنسبها
//   + التكلفة الأولية (طعام+عمالة) ونقطة التعادل وهامش الأمان
// فلاتر: شهر + مركز (فرع أو الشركة مجمعة)
// ═══════════════════════════════════════════════════════════════════════════

interface CenterPL {
  center: string;
  centerName: string;
  gross: number;
  vat: number;
  net: number;
  food: number;
  wastage: number;
  labor: number;
  opex: number;
  varCost: number;
  cm: number;
  cmPct: number;
  fixed: number;
  profit: number;
  profitPct: number;
  breakEven: number;
  beOk: boolean;
  safety: number;
  records: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const ProfitCenterPLReport: React.FC = () => {
  const { batchSalesRecords, branches, shifts, operatingExpenses, wastageLogs, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [centerFilter, setCenterFilter] = useState<string>('company');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const periodLabel = monthLabel(periodValue);

  const centerName = centerFilter === 'company' ? 'الشركة (مجمعة)' : getBranchName(centerFilter);

  const centerPL = (cid: string, cname: string): CenterPL => {
    let records = 0, gross = 0, net = 0, food = 0, labor = 0, opex = 0, wastage = 0;
    for (const r of batchSalesRecords) {
      if (cid !== 'company' && r.branchId !== cid) continue;
      if ((r.date || '').slice(0, 7) !== periodValue) continue;
      records += 1;
      const g = r.totalRevenue || 0;
      gross += g;
      net += r.netRevenue ?? netOfGross(g, r.vatRate ?? VAT_RATE);
      food += r.totalFoodCost || 0;
    }
    for (const w of wastageLogs) {
      if (cid !== 'company' && w.branchId !== cid) continue;
      if ((w.date || '').slice(0, 7) !== periodValue) continue;
      wastage += w.totalCostImpact || 0;
    }
    for (const s of shifts) {
      if (cid !== 'company' && s.branchId !== cid) continue;
      if ((s.date || '').slice(0, 7) !== periodValue) continue;
      labor += s.totalShiftCost || 0;
    }
    for (const e of operatingExpenses) {
      if (cid !== 'company' && e.branchId !== cid) continue;
      if (e.paymentStatus !== 'paid') continue;
      if ((e.dueDate || '').slice(0, 7) !== periodValue) continue;
      opex += e.amount || 0;
    }
    const varCost = food + wastage;
    const cm = net - varCost;
    const cmPct = net > 0 ? (cm / net) * 100 : 0;
    const cmRatio = net > 0 ? cm / net : 0;
    const fixed = labor + opex;
    const profit = cm - fixed;
    const beRaw = cmRatio > 0 ? fixed / cmRatio : Infinity;
    const breakEven = Number.isFinite(beRaw) ? beRaw : 0;
    const safety = Number.isFinite(beRaw) && net > 0 ? ((net - breakEven) / net) * 100 : 0;
    const vat = gross - net;
    return {
      center: cid,
      centerName: cname,
      gross,
      vat,
      net,
      food,
      wastage,
      labor,
      opex,
      varCost,
      cm,
      cmPct,
      fixed,
      profit,
      profitPct: net > 0 ? (profit / net) * 100 : 0,
      breakEven,
      beOk: Number.isFinite(beRaw),
      safety,
      records,
    };
  };

  const current = useMemo<CenterPL>(() => centerPL(centerFilter, centerName), [batchSalesRecords, shifts, operatingExpenses, wastageLogs, centerFilter, periodValue]);
  const centers = useMemo<CenterPL[]>(
    () => [
      centerPL('company', 'الشركة (مجمعة)'),
      ...branches.map((b) => centerPL(b.id, b.nameAr)),
    ],
    [batchSalesRecords, branches, shifts, operatingExpenses, wastageLogs, periodValue]
  );
  const activeCenters = centers.filter((c) => c.records > 0 || c.net > 0);

  const primaryCostPct = current.net > 0 ? ((current.food + current.labor) / current.net) * 100 : 0;
  const grossPct = current.net > 0 ? (current.food / current.net) * 100 : 0;
  const laborPct = current.net > 0 ? (current.labor / current.net) * 100 : 0;
  const opexPct = current.net > 0 ? (current.opex / current.net) * 100 : 0;
  const wastagePct = current.net > 0 ? (current.wastage / current.net) * 100 : 0;

  const stmtRows = useMemo(
    () => [
      { label: 'المبيعات (الإجمالي)', value: current.gross, pct: null as number | null, basisNone: false },
      { label: 'خصم ضريبة القيمة المضافة (15%)', value: -current.vat, pct: null, basisNone: false },
      { label: 'صافي المبيعات', value: current.net, pct: 100, basisNone: false },
      { label: 'تكلفة الطعام', value: -current.food, pct: grossPct, basisNone: false },
      { label: 'الهدر', value: -current.wastage, pct: wastagePct, basisNone: false },
      { label: 'هامش المساهمة', value: current.cm, pct: current.cmPct, basisNone: false },
      { label: 'العمالة (شيفتات)', value: -current.labor, pct: laborPct, basisNone: false },
      { label: 'المصاريف التشغيلية', value: -current.opex, pct: opexPct, basisNone: false },
      { label: 'صافي الربح', value: current.profit, pct: current.profitPct, basisNone: false },
    ],
    [current, grossPct, wastagePct, laborPct, opexPct]
  );

  const chartData = activeCenters
    .slice()
    .sort((a, b) => b.net - a.net)
    .map((c) => ({ name: c.centerName, 'صافي ربح': Number(c.profit.toFixed(0)), 'نسبة طعام %': Number((c.net > 0 ? (c.food / c.net) * 100 : 0).toFixed(1)) }));

  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'قائمة دخل مركز الربح (Profit Center P&L)',
      subtitle: `${COMPANY} — ${periodLabel} — ${centerName}`,
      meta: [
        ['المركز', centerName],
        ['الفترة', periodLabel],
        ['صافي المبيعات', fmtMoney(current.net)],
        ['صافي الربح', `${fmtMoney(current.profit)} (${current.profitPct.toFixed(1)}%)`],
        ['التكلفة الأولية', `${primaryCostPct.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'قائمة الدخل',
          header: ['البند', 'المبلغ', 'نسبة من صافي المبيعات %'],
          rows: stmtRows.map((s) => [s.label, s.value >= 0 ? fmtMoney(s.value) : `(${fmtMoney(-s.value)})`, s.pct != null ? `${s.pct.toFixed(1)}%` : '—']),
        },
      ],
      footer: `${COMPANY} — ${periodLabel} — ${centerName}`,
    });
  };

  const excelSheets = [
    {
      name: 'قائمة الدخل',
      header: ['البند', 'المبلغ', 'نسبة %'],
      rows: stmtRows.map((s) => [s.label, s.value.toFixed(2), s.pct != null ? `${s.pct.toFixed(1)}%` : '-']),
    },
    {
      name: 'المراكز',
      header: ['المركز', 'السجلات', 'صافي الإيراد', 'طعام %', 'هدر', 'مساهمة %', 'عمالة', 'تشغيل', 'صافي ربح', 'ربح %', 'التعادل', 'هامش أمان %'],
      rows: activeCenters.map((c) => [
        c.centerName, c.records, c.net.toFixed(2), `${(c.net > 0 ? (c.food / c.net) * 100 : 0).toFixed(1)}%`, c.wastage.toFixed(2),
        `${c.cmPct.toFixed(1)}%`, c.labor.toFixed(2), c.opex.toFixed(2), c.profit.toFixed(2), `${c.profitPct.toFixed(1)}%`,
        c.beOk ? c.breakEven.toFixed(2) : '-', `${c.safety.toFixed(1)}%`,
      ]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="قائمة دخل مركز الربح (Profit Center P&L)"
        subtitle={`${COMPANY} — ${periodLabel} — ${centerName}`}
        icon={<LineChartIcon className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Profit_Center_PL_${periodValue}`} sheets={excelSheets} />
            <Field label="المركز">
              <select value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)} className={inputCls + ' !w-44'}>
                <option value="company">الشركة (مجمعة)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.nameAr}</option>
                ))}
              </select>
            </Field>
            <Field label="الفترة">
              <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                {periods.map((p) => (
                  <option key={p} value={p}>{monthLabel(p)}</option>
                ))}
              </select>
            </Field>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {centerName} — التكلفة الأولية (طعام+عمالة): {primaryCostPct.toFixed(1)}%
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">صافي الربح</span>
          <strong className={`text-lg font-extrabold font-mono ${posNeg(current.profit)}`}>{fmtMoney(current.profit)}</strong>
          <span className={`text-[11px] font-mono block ${posNeg(current.profitPct)}`}>({current.profitPct.toFixed(1)}%)</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">تكلفة الطعام %</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{grossPct.toFixed(1)}%</strong>
          <span className="text-[10px] text-amber-500 block">{fmtMoney(current.food)}</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">هامش المساهمة %</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{current.cmPct.toFixed(1)}%</strong>
          <span className="text-[10px] text-indigo-500 block">{fmtMoney(current.cm)}</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">نقطة التعادل</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{current.beOk ? fmtMoney(current.breakEven) : '—'}</strong>
          <span className="text-[10px] text-blue-500 block">هامش أمان: {current.safety.toFixed(1)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-emerald-600" /> قائمة الدخل — {centerName}
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">البند</th>
                  <th className="p-2 text-center">المبلغ</th>
                  <th className="p-2 text-center">% من صافي المبيعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stmtRows.map((s, i) => (
                  <tr key={i} className={`${i === 2 || i === 5 || i === 8 ? 'font-bold bg-slate-50' : ''} ${s.value < 0 && i !== 3 && i !== 4 && i !== 6 && i !== 7 ? '' : ''}`}>
                    <td className="p-2 font-bold text-slate-800">{s.label}</td>
                    <td className={`p-2 text-center font-mono ${s.value >= 0 ? 'text-slate-700' : 'text-rose-600'}`}>{s.value >= 0 ? fmtMoney(s.value) : `(${fmtMoney(-s.value)})`}</td>
                    <td className="tnum p-2 text-left text-amber-700">{s.pct != null ? `${s.pct.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn tone="ghost" onClick={printReport}>
              <Printer className="w-4 h-4" /> طباعة
            </Btn>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3">صافي الربح ونسبة الطعام لكل مركز</h3>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis yAxisId="rev" fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 60]} fontSize={10} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [name === 'صافي ربح' ? fmtMoney(Number(v)) : `${Number(v)}%`, String(name)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="rev" dataKey="صافي ربح" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Line yAxisId="pct" dataKey="نسبة طعام %" stroke="#f43f5e" strokeWidth={2} dot={false} />
                <ReferenceLine yAxisId="pct" y={30} stroke="#94a3b8" strokeDasharray="8 4" label={{ value: 'هدف 30%', fontSize: 10, fill: '#64748b', position: 'insideBottomRight' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">قائمة دخل كل مركز (فرع/شركة)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المركز</th>
                <th className="p-2 text-center">صافي الإيراد</th>
                <th className="p-2 text-center">طعام %</th>
                <th className="p-2 text-center">مساهمة %</th>
                <th className="p-2 text-center">عمالة</th>
                <th className="p-2 text-center">تشغيل</th>
                <th className="p-2 text-center">صافي ربح</th>
                <th className="p-2 text-center">ربح %</th>
                <th className="p-2 text-center">التعادل</th>
                <th className="p-2 text-center">هامش أمان %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeCenters.map((c, i) => (
                <tr key={c.center + periodValue} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{c.centerName}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(c.net)}</td>
                  <td className="tnum p-2 text-left text-amber-700">{c.net > 0 ? ((c.food / c.net) * 100).toFixed(1) : 0}%</td>
                  <td className="tnum p-2 text-left text-indigo-700">{c.cmPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(c.labor)}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(c.opex)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${posNeg(c.profit)}`}>{fmtMoney(c.profit)}</td>
                  <td className={`p-2 text-center font-mono ${posNeg(c.profitPct)}`}>{c.profitPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-slate-600">{c.beOk ? fmtMoney(c.breakEven) : '—'}</td>
                  <td className={`p-2 text-center font-mono ${c.safety >= 20 ? 'text-emerald-600' : c.safety >= 10 ? 'text-amber-600' : 'text-rose-600'}`}>{c.safety.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">{centers[0].centerName}</td>
                <td className="tnum p-2 text-left text-blue-700">{fmtMoney(centers[0].net)}</td>
                <td className="tnum p-2 text-left text-lg text-amber-700">{centers[0].net > 0 ? ((centers[0].food / centers[0].net) * 100).toFixed(1) : 0}%</td>
                <td className="tnum p-2 text-left">{centers[0].cmPct.toFixed(1)}%</td>
                <td className="tnum p-2 text-left">{fmtMoney(centers[0].labor)}</td>
                <td className="tnum p-2 text-left">{fmtMoney(centers[0].opex)}</td>
                <td className={`p-2 text-center font-mono text-lg ${posNeg(centers[0].profit)}`}>{fmtMoney(centers[0].profit)}</td>
                <td className={`p-2 text-center font-mono text-lg ${posNeg(centers[0].profitPct)}`}>{centers[0].profitPct.toFixed(1)}%</td>
                <td className="tnum p-2 text-left text-slate-600">{centers[0].beOk ? fmtMoney(centers[0].breakEven) : '—'}</td>
                <td className="tnum p-2 text-left">{centers[0].safety.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ProfitCenterPLReport;