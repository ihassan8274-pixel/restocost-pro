import React, { useMemo, useState } from 'react';
import { Printer, ShoppingCart } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel, VAT_RATE } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// المبيعات حسب الصنف (Sales by Item)
// الهوية (مستمدّة من `/reports` items في v7.0):
//   صنف × كمية × إيراد صافي × تكلفة × هامش وهامش% — تنازلي بالإيراد — مع ترتيب
//   والشعبية (نسبة الكمية من الإجمالي) وصف الإجمالي
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface ItemRow {
  recipeId: string;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  sharePct: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const SalesByItemReport: React.FC = () => {
  const { batchSalesRecords, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [minRevenue, setMinRevenue] = useState<string>('0');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const periodLabel = monthLabel(periodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const minRev = Number(minRevenue) || 0;

  const records = useMemo(
    () => batchSalesRecords.filter((r) => {
      if ((r.date || '').slice(0, 7) !== periodValue) return false;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) return false;
      return true;
    }),
    [batchSalesRecords, periodValue, branchFilter]
  );

  const items = useMemo<ItemRow[]>(() => {
    const map = new Map<string, ItemRow>();
    for (const r of records) {
      for (const it of r.items || []) {
        const id = it.recipeId || it.recipeNameAr;
        const cur = map.get(id) ?? {
          recipeId: id,
          name: it.recipeNameAr || id,
          category: it.category || '—',
          qty: 0,
          revenue: 0,
          cost: 0,
          margin: 0,
          marginPct: 0,
          sharePct: 0,
        };
        cur.qty += it.quantitySold || 0;
        const gross = it.lineTotalRevenue || 0;
        const vatRate = r.vatRate ?? VAT_RATE;
        cur.revenue += it.lineTotalRevenue ? gross - (gross * vatRate) / (100 + vatRate) : 0;
        cur.cost += it.lineTotalCost || 0;
        map.set(id, cur);
      }
    }
    const out = Array.from(map.values()).filter((i) => i.revenue >= minRev);
    const total = out.reduce((s, i) => s + i.revenue, 0);
    for (const i of out) {
      i.margin = i.revenue - i.cost;
      i.marginPct = i.revenue > 0 ? (i.margin / i.revenue) * 100 : 0;
      i.sharePct = total > 0 ? (i.revenue / total) * 100 : 0;
    }
    return out.sort((a, b) => b.revenue - a.revenue);
  }, [records, minRev]);

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const topItem = items[0];
  const goodItem = items.reduce<ItemRow | null>((acc, i) => (!acc || i.marginPct > acc.marginPct ? i : acc), null);

  const chartData = items.slice(0, 12).map((i) => ({ name: i.name.slice(0, 14), إيراد: Number(i.revenue.toFixed(0)), 'هامش %': Number(i.marginPct.toFixed(1)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'المبيعات حسب الصنف (Sales by Item)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['الإيراد الصافي', fmtMoney(totalRevenue)],
        ['إجمالي الهامش', `${fmtMoney(totalMargin)} (${totalMarginPct.toFixed(1)}%)`],
      ],
      tables: [
        {
          title: 'الأصناف',
          header: ['الصنف', 'التصنيف', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'هامش %', 'حصة %'],
          rows: [
            ...items.map((i) => [i.name, i.category, fmt(i.qty), fmtMoney(i.revenue), fmtMoney(i.cost), fmtMoney(i.margin), `${i.marginPct.toFixed(1)}%`, `${i.sharePct.toFixed(1)}%`]),
            ['الإجمالي', '—', fmt(totalQty), fmtMoney(totalRevenue), fmtMoney(totalCost), fmtMoney(totalMargin), `${totalMarginPct.toFixed(1)}%`, '100%'],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الأصناف',
      header: ['الصنف', 'التصنيف', 'الكمية', 'الإيراد الصافي', 'التكلفة', 'الهامش', 'هامش %', 'حصة %'],
      rows: items.map((i) => [i.name, i.category, i.qty, i.revenue.toFixed(2), i.cost.toFixed(2), i.margin.toFixed(2), `${i.marginPct.toFixed(1)}%`, `${i.sharePct.toFixed(1)}%`]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="المبيعات حسب الصنف (Sales by Item)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<ShoppingCart className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Sales_By_Item_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-40'}>
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
              <Field label="حد أدنى للإيراد">
                <input type="number" value={minRevenue} onChange={(e) => setMinRevenue(e.target.value)} className={inputCls + ' !w-28'} />
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {records.length} سجل مبيعات
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">الإيراد الصافي</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(totalRevenue)}</strong>
          <span className="text-[10px] text-blue-500 block">{items.length} صنفاً (بعد حد الفلترة)</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">الكمية المباعة</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{fmt(totalQty)}</strong>
          <span className="text-[10px] text-indigo-500 block">{records.length} سجل</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">الهامش الإجمالي</span>
          <strong className={`text-lg font-extrabold font-mono block ${posNeg(totalMargin)}`}>{fmtMoney(totalMargin)}</strong>
          <span className="text-[10px] text-emerald-500 block">({totalMarginPct.toFixed(1)}%)</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">الأعلى إيراداً</span>
          <strong className="text-lg font-extrabold text-amber-800 block truncate">{topItem?.name ?? '—'}</strong>
          <span className="text-[10px] text-amber-500 block">{topItem ? `${fmtMoney(topItem.revenue)} (${topItem.sharePct.toFixed(1)}%)` : ''} · أفضل هامش: {goodItem?.name ?? '—'}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" /> الإيراد والهامش لأعلى 12 صنفاً
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={48} />
              <YAxis yAxisId="rev" fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} fontSize={10} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [name === 'إيراد' ? fmtMoney(Number(v)) : `${Number(v)}%`, String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="rev" dataKey="إيراد" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line yAxisId="pct" dataKey="هامش %" stroke="#10b981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول الأصناف (تنازلي بالإيراد)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الصنف</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">الإيراد</th>
                <th className="p-2 text-center">التكلفة</th>
                <th className="p-2 text-center">الهامش</th>
                <th className="p-2 text-center">هامش %</th>
                <th className="p-2 text-center">حصة %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i, idx) => (
                <tr key={i.recipeId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{i.name}</td>
                  <td className="p-2 text-center text-slate-500">{i.category}</td>
                  <td className="tnum p-2 text-left">{fmt(i.qty)}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(i.revenue)}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(i.cost)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${posNeg(i.margin)}`}>{fmtMoney(i.margin)}</td>
                  <td className={`p-2 text-center font-mono ${posNeg(i.marginPct)}`}>{i.marginPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left text-slate-500">{i.sharePct.toFixed(1)}%</td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد بيانات لهذا الفلتر</td>
                </tr>
              )}
              {!!items.length && (
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center">—</td>
                  <td className="tnum p-2 text-left">{fmt(totalQty)}</td>
                  <td className="tnum p-2 text-left text-blue-700 text-lg">{fmtMoney(totalRevenue)}</td>
                  <td className="tnum p-2 text-left">{fmtMoney(totalCost)}</td>
                  <td className={`p-2 text-center font-mono text-lg ${posNeg(totalMargin)}`}>{fmtMoney(totalMargin)}</td>
                  <td className={`p-2 text-center font-mono text-lg ${posNeg(totalMarginPct)}`}>{totalMarginPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left">100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SalesByItemReport;