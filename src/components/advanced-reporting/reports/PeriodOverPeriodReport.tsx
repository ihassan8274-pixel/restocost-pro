import React, { useMemo, useState } from 'react';
import { Printer, GitCompare } from 'lucide-react';
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
} from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel, VAT_RATE, netOfGross } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// مقارنة الفترات (Period over Period — PoP)
// الهوية (مستمدّة من `/insights` mom في v7.0):
//   فترتان متتاليتان: نمو% وفرق لكل مؤشر (إيراد، كمية، تكلفة طعام، نسبة طعام)
//   قاعدة النسب: نسبة الطعام التجميعية = Σ تكلفة ÷ Σ إيراد لكل فترة ثم فرقهما
// فلاتر: فترتان + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface PeriodMetrics {
  records: number;
  qty: number;
  net: number;
  food: number;
  foodPct: number;
}

interface Row {
  branchId: string;
  branchName: string;
  a: PeriodMetrics;
  b: PeriodMetrics;
  revDelta: number;
  qtyDelta: number;
  pctDelta: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');
const goodBad = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const PeriodOverPeriodReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [periodA, setPeriodA] = useState<string>('');
  const [periodB, setPeriodB] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const pa = periodA || (periods.length > 1 ? periods[periods.length - 2] : periods[0]);
  const pb = periodB || periods.find((p) => p !== pa) || pa;
  const branchName = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const measurer = (branchId: string, p: string): PeriodMetrics => {
    let records = 0, qty = 0, net = 0, food = 0;
    for (const r of batchSalesRecords) {
      if (branchId !== 'all' && r.branchId !== branchId) continue;
      if ((r.date || '').slice(0, 7) !== p) continue;
      records += 1;
      net += r.netRevenue ?? netOfGross(r.totalRevenue, r.vatRate ?? VAT_RATE);
      food += r.totalFoodCost || 0;
      qty += (r.items || []).reduce((s, it) => s + (it.quantitySold || 0), 0);
    }
    return { records, qty, net, food, foodPct: net > 0 ? (food / net) * 100 : 0 };
  };

  const rows = useMemo<Row[]>(() => {
    const ids = branchFilter === 'all' ? branches.map((b) => b.id) : [branchFilter];
    const out: Row[] = [];
    for (const id of ids) {
      const a = measurer(id, pa);
      const b = measurer(id, pb);
      if (!a.records && !b.records) continue;
      const aName = branchFilter === 'all' ? (branches.find((x) => x.id === id)?.nameAr ?? id) : branchName;
      out.push({
        branchId: id,
        branchName: aName,
        a,
        b,
        revDelta: a.net > 0 ? ((b.net - a.net) / a.net) * 100 : 0,
        qtyDelta: a.qty > 0 ? ((b.qty - a.qty) / a.qty) * 100 : 0,
        pctDelta: b.foodPct - a.foodPct,
      });
    }
    out.sort((x, y) => y.b.net - x.b.net);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, batchSalesRecords, pa, pb, branchFilter]);

  const totalA = useMemo(() => measurer('all', pa), [batchSalesRecords, pa]);
  const totalB = useMemo(() => measurer('all', pb), [batchSalesRecords, pb]);
  const totRevDelta = totalA.net > 0 ? ((totalB.net - totalA.net) / totalA.net) * 100 : 0;
  const totQtyDelta = totalA.qty > 0 ? ((totalB.qty - totalA.qty) / totalA.qty) * 100 : 0;
  const totPctDelta = totalB.foodPct - totalA.foodPct;
  const totNetDelta = totalB.net - totalA.net;

  const chartData = rows.map((r) => ({
    name: r.branchName,
    [monthLabel(pa)]: Number(r.a.net.toFixed(0)),
    [monthLabel(pb)]: Number(r.b.net.toFixed(0)),
    ['نسبة ' + monthLabel(pa)]: Number(r.a.foodPct.toFixed(1)),
    ['نسبة ' + monthLabel(pb)]: Number(r.b.foodPct.toFixed(1)),
  }));

  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'مقارنة الفترات (Period over Period)',
      subtitle: `${COMPANY} — ${monthLabel(pa)} مقابل ${monthLabel(pb)} — ${branchName}`,
      meta: [
        ['الفترة 1', `${monthLabel(pa)}: إيراد ${fmtMoney(totalA.net)} — نسبة طعام ${totalA.foodPct.toFixed(1)}%`],
        ['الفترة 2', `${monthLabel(pb)}: إيراد ${fmtMoney(totalB.net)} — نسبة طعام ${totalB.foodPct.toFixed(1)}%`],
        ['نمو الإيراد', `${totRevDelta > 0 ? '+' : ''}${totRevDelta.toFixed(1)}%`],
        ['فرق نسبة الطعام', `${totPctDelta > 0 ? '+' : ''}${totPctDelta.toFixed(1)} نقطة`],
      ],
      tables: [
        {
          title: 'ملخص الفروع',
          header: ['الفرع', `إيراد ${monthLabel(pa)}`, `إيراد ${monthLabel(pb)}`, 'نمو %', `كمية ${monthLabel(pa)}`, `كمية ${monthLabel(pb)}`, `نسبة ${monthLabel(pa)} %`, `نسبة ${monthLabel(pb)} %`, 'فرق نقاط'],
          rows: [
            ...rows.map((r) => [r.branchName, fmtMoney(r.a.net), fmtMoney(r.b.net), `${r.revDelta.toFixed(1)}%`, fmt(r.a.qty), fmt(r.b.qty), `${r.a.foodPct.toFixed(1)}%`, `${r.b.foodPct.toFixed(1)}%`, `${r.pctDelta > 0 ? '+' : ''}${r.pctDelta.toFixed(1)}`]),
            ['الإجمالي', fmtMoney(totalA.net), fmtMoney(totalB.net), `${totRevDelta.toFixed(1)}%`, fmt(totalA.qty), fmt(totalB.qty), `${totalA.foodPct.toFixed(1)}%`, `${totalB.foodPct.toFixed(1)}%`, `${totPctDelta > 0 ? '+' : ''}${totPctDelta.toFixed(1)}`],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${monthLabel(pa)} ↔ ${monthLabel(pb)}`,
    });
  };

  const excelSheets = [
    {
      name: 'ملخص PoP',
      header: ['الفرع', 'إيراد أ', 'إيراد ب', 'نمو الإيراد %', 'كمية أ', 'كمية ب', 'نمو الكمية %', 'نسبة طعام أ %', 'نسبة طعام ب %', 'فرق نقاط'],
      rows: rows.map((r) => [
        r.branchName, r.a.net.toFixed(2), r.b.net.toFixed(2), `${r.revDelta.toFixed(1)}%`, r.a.qty, r.b.qty,
        `${r.qtyDelta.toFixed(1)}%`, `${r.a.foodPct.toFixed(1)}%`, `${r.b.foodPct.toFixed(1)}%`, `${r.pctDelta.toFixed(1)}`,
      ]),
    },
    {
      name: 'إجمالي المنظومة',
      header: ['المؤشر', monthLabel(pa), monthLabel(pb), 'الفرق', 'نمو %'],
      rows: [
        ['السجلات', totalA.records, totalB.records, totalB.records - totalA.records, totalA.records > 0 ? `${(((totalB.records - totalA.records) / totalA.records) * 100).toFixed(1)}%` : '-'],
        ['الإيراد الصافي', totalA.net.toFixed(2), totalB.net.toFixed(2), (totalB.net - totalA.net).toFixed(2), `${totRevDelta.toFixed(1)}%`],
        ['الكمية', totalA.qty.toFixed(2), totalB.qty.toFixed(2), (totalB.qty - totalA.qty).toFixed(2), `${totQtyDelta.toFixed(1)}%`],
        ['تكلفة الطعام', totalA.food.toFixed(2), totalB.food.toFixed(2), (totalB.food - totalA.food).toFixed(2), totalA.food > 0 ? `${(((totalB.food - totalA.food) / totalA.food) * 100).toFixed(1)}%` : '-'],
        ['نسبة طعام %', `${totalA.foodPct.toFixed(1)}%`, `${totalB.foodPct.toFixed(1)}%`, `${totPctDelta.toFixed(1)} نقطة`, '-'],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مقارنة الفترات (Period over Period)"
        subtitle={`${COMPANY} — ${monthLabel(pa)} مقابل ${monthLabel(pb)} — ${branchName}`}
        icon={<GitCompare className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Period_Over_Period_${pa}_${pb}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة 1">
                <select value={periodA} onChange={(e) => setPeriodA(e.target.value)} className={inputCls + ' !w-40'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفترة 2">
                <select value={periodB} onChange={(e) => setPeriodB(e.target.value)} className={inputCls + ' !w-40'}>
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — المقارنة: {monthLabel(pa)} ↔ {monthLabel(pb)} — {branchName}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">الإيراد الصافي ({monthLabel(pb)})</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(totalB.net)}</strong>
          <span className={`text-[11px] font-mono font-bold ${posNeg(totRevDelta)}`}>{totRevDelta > 0 ? '▲' : '▼'} {totRevDelta > 0 ? '+' : ''}{totRevDelta.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-400 block">({fmtMoney(Math.abs(totNetDelta))} {totNetDelta >= 0 ? 'زيادة' : 'نقصان'})</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">الكمية المباعة</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{fmt(totalB.qty)}</strong>
          <span className={`text-[11px] font-mono font-bold ${posNeg(totQtyDelta)}`}>{totQtyDelta > 0 ? '▲' : '▼'} {totQtyDelta > 0 ? '+' : ''}{totQtyDelta.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-400 block">({totalB.records} سجل في {monthLabel(pb)})</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">نسبة الطعام التجميعية</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{totalB.foodPct.toFixed(1)}%</strong>
          <span className={`text-[11px] font-mono font-bold ${goodBad(-totPctDelta)}`}>{totPctDelta > 0 ? '▲' : '▼'} {totPctDelta > 0 ? '+' : ''}{totPctDelta.toFixed(1)} نقطة</span>
          <span className="text-[10px] text-slate-400 block">{monthLabel(pa)}: {totalA.foodPct.toFixed(1)}%</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">عدد السجلات ({monthLabel(pb)})</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{totalB.records}</strong>
          <span className="text-[11px] text-emerald-600 font-bold block">{totalA.records} سجل في {monthLabel(pa)}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-emerald-600" /> إيراد الفترتين ونسبة الطعام لكل فرع
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={44} />
              <YAxis yAxisId="rev" fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 60]} fontSize={10} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [fmtMoney(Number(v)), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey={monthLabel(pa)} fill="#cbd5e1" maxBarSize={30} />
              <Bar yAxisId="rev" dataKey={monthLabel(pb)} fill="#3b82f6" maxBarSize={30} />
              <Line yAxisId="pct" dataKey={'نسبة ' + monthLabel(pa)} stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line yAxisId="pct" dataKey={'نسبة ' + monthLabel(pb)} stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول المقارنة لكل فرع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-center">{monthLabel(pa)}</th>
                <th className="p-2 text-center">{monthLabel(pb)}</th>
                <th className="p-2 text-center">نمو إيراد %</th>
                <th className="p-2 text-center">نسبة أ %</th>
                <th className="p-2 text-center">نسبة ب %</th>
                <th className="p-2 text-center">فرق نقاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.branchName}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.a.net)}</td>
                  <td className="tnum p-2 text-left text-blue-700 font-bold">{fmtMoney(r.b.net)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${posNeg(r.revDelta)}`}>{r.revDelta > 0 ? '+' : ''}{r.revDelta.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left">{r.a.foodPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-amber-700">{r.b.foodPct.toFixed(1)}%</td>
                  <td className={`p-2 text-center font-mono ${goodBad(-r.pctDelta)}`}>{r.pctDelta > 0 ? '+' : ''}{r.pctDelta.toFixed(1)}</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي</td>
                <td className="tnum p-2 text-left">{fmtMoney(totalA.net)}</td>
                <td className="tnum p-2 text-left text-blue-700 text-lg">{fmtMoney(totalB.net)}</td>
                <td className={`p-2 text-center font-mono text-lg ${posNeg(totRevDelta)}`}>{totRevDelta > 0 ? '+' : ''}{totRevDelta.toFixed(1)}%</td>
                <td className="tnum p-2 text-left">{totalA.foodPct.toFixed(1)}%</td>
                <td className="tnum p-2 text-left text-lg text-amber-700">{totalB.foodPct.toFixed(1)}%</td>
                <td className={`p-2 text-center font-mono text-lg ${goodBad(-totPctDelta)}`}>{totPctDelta > 0 ? '+' : ''}{totPctDelta.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PeriodOverPeriodReport;