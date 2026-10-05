import React, { useMemo, useState } from 'react';
import { Printer, TrendingUp } from 'lucide-react';
import { Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// ملخص المبيعات اليومي (Daily Sales Summary)
//   من سجلات البيع المصفّف (batch sales records):
//   يوم × فرع (عند الاختيار) → إيراد خام / ضريبة / صافي / تكلفة طعام / نسبة
//   + عدد السجلات ومتوسط الإيراد الصافي للسجل — يعكس الجرد اليومي المصفّف
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface DayRow {
  date: string;
  records: number;
  gross: number;
  vat: number;
  net: number;
  foodCost: number;
  foodPct: number;
  avgPerRecord: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const SalesDailySummaryReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((r) => (r.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const rows = useMemo<DayRow[]>(() => {
    const map = new Map<string, DayRow>();
    for (const r of batchSalesRecords) {
      if ((r.date || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
      const d = (r.date || '').slice(0, 10);
      const cur = map.get(d) ?? { date: d, records: 0, gross: 0, vat: 0, net: 0, foodCost: 0, foodPct: 0, avgPerRecord: 0 };
      cur.records += 1;
      cur.gross += r.totalRevenue || r.netRevenue || 0;
      cur.vat += r.vatAmount || 0;
      cur.net += r.netRevenue ?? (r.totalRevenue || 0) - (r.vatAmount || 0);
      cur.foodCost += r.totalFoodCost || 0;
      map.set(d, cur);
    }
    const days = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const d of days) {
      d.foodPct = d.gross > 0 ? (d.foodCost / d.gross) * 100 : 0;
      d.avgPerRecord = d.records > 0 ? d.net / d.records : 0;
    }
    return days;
  }, [batchSalesRecords, periodValue, branchFilter]);

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalVat = rows.reduce((s, r) => s + r.vat, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalFood = rows.reduce((s, r) => s + r.foodCost, 0);
  const totalRecords = rows.reduce((s, r) => s + r.records, 0);
  const foodPctTotal = totalGross > 0 ? (totalFood / totalGross) * 100 : 0;
  const bestDay = rows.length ? rows.reduce((a, b) => (b.net > a.net ? b : a)) : null;

  const chartData = rows.map((r) => ({ name: r.date.slice(8) + '/' + r.date.slice(5, 7), 'إيراد صافي': Number(r.net.toFixed(0)), 'تكلفة طعام': Number(r.foodCost.toFixed(0)) }));
  const foodBar = rows.map((r) => ({ name: r.date.slice(8), 'نسبة': Number(r.foodPct.toFixed(1)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'ملخص المبيعات اليومي (Daily Sales Summary)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['إجمالي الإيراد الصافي', fmtMoney(totalNet)],
        ['عدد السجلات المصفّفة', `${totalRecords}`],
        ['نسبة تكلفة الطعام', `${foodPctTotal.toFixed(1)}%`],
        ['أفضل يوم', bestDay ? `${bestDay.date} (${fmtMoney(bestDay.net)})` : '—'],
      ],
      tables: [
        {
          title: 'البيانات اليومية',
          header: ['التاريخ', 'السجلات', 'إيراد خام', 'ضريبة', 'إيراد صافي', 'متوسط/سجل', 'تكلفة طعام', 'نسبة%'],
          rows: rows.map((r) => [r.date, `${r.records}`, fmtMoney(r.gross), fmtMoney(r.vat), fmtMoney(r.net), fmtMoney(r.avgPerRecord), fmtMoney(r.foodCost), `${r.foodPct.toFixed(1)}%`]),
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'اليومي',
      header: ['التاريخ', 'السجلات', 'إيراد خام', 'ضريبة', 'إيراد صافي', 'متوسط/سجل', 'تكلفة طعام', 'نسبة%'],
      rows: rows.map((r) => [r.date, r.records, Number(r.gross.toFixed(2)), Number(r.vat.toFixed(2)), Number(r.net.toFixed(2)), Number(r.avgPerRecord.toFixed(2)), Number(r.foodCost.toFixed(2)), Number(r.foodPct.toFixed(1))]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="ملخص المبيعات اليومي (Daily Sales Summary)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Sales_Daily_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {rows.length} يوم نشط — إجمالي السجلات المصفّفة {totalRecords}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">إجمالي الإيراد الصافي</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmtMoney(totalNet)}</strong>
          <span className="text-[10px] text-emerald-500 block">من خام {fmtMoney(totalGross)}</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">متوسط اليومي</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{rows.length ? fmtMoney(totalNet / rows.length) : '—'}</strong>
          <span className="text-[10px] text-blue-500 block">{rows.length} يوم نشط في الفترة</span>
        </div>
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <span className="text-[10px] text-brand-600 font-bold block">متوسط السجل المصفّف</span>
          <strong className="text-lg font-extrabold text-brand-800 font-mono block">{totalRecords ? fmtMoney(totalNet / totalRecords) : '—'}</strong>
          <span className="text-[10px] text-brand-500 block">من {totalRecords} سجل</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">تكلفة الطعام + الضريبة</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{fmtMoney(totalFood)}</strong>
          <span className="text-[10px] text-rose-500 block">{foodPctTotal.toFixed(1)}% من الخام · ضريبة {fmtMoney(totalVat)}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" /> الإيراد الصافي وتكلفة الطعام يومياً
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tick={{ fill: '#475569' }} />
              <YAxis fontSize={9} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="إيراد صافي" stroke="#10b981" strokeWidth={2} fill="url(#gNet)" />
              <Line type="monotone" dataKey="تكلفة طعام" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full h-32 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={foodBar} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tick={{ fill: '#475569' }} />
              <YAxis fontSize={9} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'نسبة تكلفة الطعام']} />
              <Bar dataKey="نسبة" radius={[3, 3, 0, 0]}>
                {foodBar.map((c, i) => <Cell key={i} fill={c['نسبة'] > 35 ? '#f43f5e' : c['نسبة'] > 32 ? '#f59e0b' : '#10b981'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">البيانات اليومية ({totalNet > 0 ? rows.length : 0})</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">السجلات</th>
                <th className="p-2 text-center">إيراد خام</th>
                <th className="p-2 text-center">ضريبة</th>
                <th className="p-2 text-center">إيراد صافي</th>
                <th className="p-2 text-center">متوسط/سجل</th>
                <th className="p-2 text-center">تكلفة طعام</th>
                <th className="p-2 text-center">نسبة%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.date} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="tnum text-left p-2 font-bold text-slate-800">{r.date}</td>
                  <td className="tnum p-2 text-left">{r.records}</td>
                  <td className="tnum p-2 text-left">{fmtMoney(r.gross)}</td>
                  <td className="tnum p-2 text-left text-slate-400">{fmtMoney(r.vat)}</td>
                  <td className="tnum p-2 text-left font-bold text-emerald-700">{fmtMoney(r.net)}</td>
                  <td className="tnum p-2 text-left text-slate-500">{fmtMoney(r.avgPerRecord)}</td>
                  <td className="tnum p-2 text-left text-rose-600">{fmtMoney(r.foodCost)}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.foodPct > 35 ? 'bg-rose-100 text-rose-700' : r.foodPct > 32 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {r.foodPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد سجلات مبيعات في الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SalesDailySummaryReport;