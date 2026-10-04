import React, { useMemo, useState } from 'react';
import { Printer, History } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// سجل أسعار الشراء للمادة (Price History — Material)
// الهوية (مستمدّة من `/procurement` «أفضل سعر» في v7.0):
//   سلسلة أسعار الشراء من سندات الاستلام (GRN): متوسط، آخر سعر، أدنى/أعلى،
//   تذبذب %، انحراف عن المتوسط، وأفضل سعر (مرجّح) — مع مقارنة الموردين
// فلاتر: مادة + مورد
// ═══════════════════════════════════════════════════════════════════════════

interface HistoryEntry {
  date: string;
  grnNumber: string;
  supplierId: string;
  supplierName: string;
  branchName: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const posNeg = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-rose-600');

export const PriceHistoryReport: React.FC = () => {
  const { grnNotes, rawMaterials, suppliers, getBranchName } = useApp();
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  const available = useMemo(() => {
    const withPrices = new Map<string, { name: string; unit: string; count: number }>();
    for (const g of grnNotes) {
      if (g.status !== 'approved') continue;
      for (const it of g.items) {
        const cur = withPrices.get(it.rawMaterialId);
        if (cur) cur.count += 1;
        else withPrices.set(it.rawMaterialId, { name: '', unit: '', count: 1 });
      }
    }
    for (const m of rawMaterials) {
      const c = withPrices.get(m.id);
      if (c) { c.name = m.nameAr; c.unit = m.purchaseUnit || m.unit; }
    }
    return withPrices;
  }, [grnNotes, rawMaterials]);

  const suppliersIn = useMemo(
    () => Array.from(new Set(grnNotes.filter((g) => g.status === 'approved').map((g) => g.supplierId))),
    [grnNotes]
  );

  const series = useMemo<HistoryEntry[]>(() => {
    const out: HistoryEntry[] = [];
    for (const g of grnNotes) {
      if (g.status !== 'approved') continue;
      if (supplierFilter !== 'all' && g.supplierId !== supplierFilter) continue;
      for (const it of g.items) {
        if (materialFilter !== 'all' && it.rawMaterialId !== materialFilter) continue;
        const mat = rawMaterials.find((m) => m.id === it.rawMaterialId);
        out.push({
          date: g.date,
          grnNumber: g.grnNumber,
          supplierId: g.supplierId,
          supplierName: g.supplierName,
          branchName: getBranchName(g.branchId),
          qty: it.quantityReceived || 0,
          unit: (mat && (mat.purchaseUnit || mat.unit)) || '',
          unitPrice: it.unitPrice || 0,
        });
      }
    }
    out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return out;
  }, [grnNotes, rawMaterials, materialFilter, supplierFilter, getBranchName]);

  const consumed = useMemo(
    () => series.reduce((s, e) => s + e.unitPrice * e.qty, 0),
    [series]
  );
  const totalQty = useMemo(() => series.reduce((s, e) => s + e.qty, 0), [series]);
  const avgPrice = series.length ? consumed / Math.max(totalQty, 1e-9) : 0;
  const last = series.length ? series[series.length - 1] : null;
  const min = series.length ? Math.min(...series.map((e) => e.unitPrice)) : 0;
  const max = series.length ? Math.max(...series.map((e) => e.unitPrice)) : 0;
  const volatility = avgPrice > 0 ? ((max - min) / avgPrice) * 100 : 0;
  const bestPrice = min;
  const bestPriceDate = series.find((e) => e.unitPrice === min)?.date ?? '';

  const materialName = materialFilter === 'all' ? 'جميع المواد' : rawMaterials.find((m) => m.id === materialFilter)?.nameAr ?? materialFilter;
  const unit = last?.unit || (rawMaterials.find((m) => m.id === materialFilter)?.unit ?? '');

  const supplierRows = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sum: number; qty: number; prices: number[] }>();
    for (const e of series) {
      const cur = map.get(e.supplierId) ?? { name: e.supplierName, count: 0, sum: 0, qty: 0, prices: [] };
      cur.count += 1;
      cur.sum += e.unitPrice * e.qty;
      cur.qty += e.qty;
      cur.prices.push(e.unitPrice);
      map.set(e.supplierId, cur);
    }
    return Array.from(map.values()).map((s) => {
      const avg = s.qty > 0 ? s.sum / s.qty : (s.prices[0] ?? 0);
      const mn = Math.min(...s.prices);
      const mx = Math.max(...s.prices);
      return {
        name: s.name,
        count: s.count,
        qty: s.qty,
        avg,
        min: mn,
        max: mx,
        volatility: avg > 0 ? ((mx - mn) / avg) * 100 : 0,
        isBest: mn <= bestPrice + 1e-9,
      };
    });
  }, [series, bestPrice]);

  const chartData = series.map((e, i) => ({
    idx: i,
    label: `${e.date} (${e.grnNumber})`,
    سعر: Number(e.unitPrice.toFixed(2)),
  }));

  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'سجل أسعار الشراء — المواد (Price History)',
      subtitle: `${COMPANY} — ${materialName}${supplierFilter !== 'all' ? ` — ${suppliers.find((s) => s.id === supplierFilter)?.name ?? ''}` : ' — جميع الموردين'}`,
      meta: [
        ['المادة', materialName],
        ['عدد المشتريات', `${series.length}`],
        ['المتوسط المرجح', fmtMoney(avgPrice)],
        ['آخر سعر', last ? fmtMoney(last.unitPrice) : '—'],
        ['أفضل سعر', `${fmtMoney(bestPrice)} (${bestPriceDate})`],
        ['التذبذب', `${volatility.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'سجل الأسعار',
          header: ['التاريخ', 'السند', 'المورد', 'الفرع', 'الكمية', 'السعر', 'انحراف عن المتوسط %'],
          rows: series.map((e) => [e.date, e.grnNumber, e.supplierName, e.branchName, fmt(e.qty), fmtMoney(e.unitPrice), avgPrice > 0 ? `${(((e.unitPrice - avgPrice) / avgPrice) * 100).toFixed(1)}%` : '—']),
        },
      ],
      footer: `${COMPANY} — ${materialName}`,
    });
  };

  const excelSheets = [
    {
      name: 'سجل الأسعار',
      header: ['التاريخ', 'السند', 'المورد', 'الفرع', 'الكمية', 'السعر', 'انحراف عن المتوسط %'],
      rows: series.map((e) => [e.date, e.grnNumber, e.supplierName, e.branchName, e.qty, e.unitPrice, avgPrice > 0 ? `${(((e.unitPrice - avgPrice) / avgPrice) * 100).toFixed(1)}%` : '-']),
    },
    {
      name: 'مقارنة الموردين',
      header: ['المورد', 'عدد السندات', 'الكمية', 'متوسط السعر', 'أدنى سعر', 'أعلى سعر', 'تذبذب %', 'أفضل سعر؟'],
      rows: supplierRows.map((s) => [s.name, s.count, s.qty, s.avg.toFixed(2), s.min.toFixed(2), s.max.toFixed(2), `${s.volatility.toFixed(1)}%`, s.isBest ? 'نعم' : '-']),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل أسعار الشراء — المواد (Price History)"
        subtitle={`${COMPANY} — ${materialName}`}
        icon={<History className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Price_History_${materialFilter}`} sheets={excelSheets} />
            <Field label="المادة">
              <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} className={inputCls + ' !w-56'}>
                <option value="all">جميع المواد</option>
                {Array.from(available.entries())
                  .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ar'))
                  .map(([id, info]) => (
                    <option key={id} value={id}>{info.name} ({info.count})</option>
                  ))}
              </select>
            </Field>
            <Field label="المورد">
              <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={inputCls + ' !w-44'}>
                <option value="all">جميع الموردين</option>
                {grnNotes.filter((g) => g.status === 'approved' && suppliersIn.includes(g.supplierId)).map((g) => (
                  <option key={g.supplierId} value={g.supplierId}>{g.supplierName}</option>
                ))}
              </select>
            </Field>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — {materialName} — عدد السندات: {series.length} — الوحدة: {unit}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">المتوسط المرجح</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(avgPrice)}</strong>
          <span className="text-[10px] text-blue-500 block">لكل {unit || 'وحدة'}</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">آخر سعر شراء</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{last ? fmtMoney(last.unitPrice) : '—'}</strong>
          <span className="text-[10px] text-indigo-500 block">{last ? `${last.date} — ${last.grnNumber}` : ''}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">أفضل (أدنى) سعر</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmtMoney(bestPrice)}</strong>
          <span className="text-[10px] text-emerald-500 block">تحقق {bestPriceDate}</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">التذبذب (أعلى−أدنى)</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{volatility.toFixed(1)}%</strong>
          <span className={`text-[11px] font-mono block ${posNeg(min - max)}`}>({fmtMoney(min)} ← {fmtMoney(max)})</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" /> منحنى السعر عبر السندات
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={9} tick={{ fill: '#475569' }} interval="preserveStartEnd" angle={-30} textAnchor="end" height={60} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [fmtMoney(Number(v)), 'السعر']} labelFormatter={(l) => `${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="سعر" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} type="monotone" name="السعر" />
              {avgPrice > 0 && (
                <ReferenceLine y={Number(avgPrice.toFixed(2))} stroke="#94a3b8" strokeDasharray="8 4" label={{ value: `المتوسط ${fmtMoney(avgPrice)}`, fontSize: 10, fill: '#64748b', position: 'insideBottomRight' }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">سجل المشتريات (سندات الاستلام)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">السند</th>
                <th className="p-2 text-center">المورد</th>
                <th className="p-2 text-center">الفرع</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">الوحدة</th>
                <th className="p-2 text-center">السعر</th>
                <th className="p-2 text-center">انحراف عن المتوسط %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {series.map((e, i) => {
                const dev = avgPrice > 0 ? ((e.unitPrice - avgPrice) / avgPrice) * 100 : 0;
                return (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="tnum text-left p-2 text-slate-600">{e.date}</td>
                    <td className="tnum p-2 text-left text-blue-600">{e.grnNumber}</td>
                    <td className="p-2 text-center">{e.supplierName}</td>
                    <td className="p-2 text-center">{e.branchName}</td>
                    <td className="tnum p-2 text-left">{fmt(e.qty)}</td>
                    <td className="p-2 text-center text-slate-500">{e.unit}</td>
                    <td className="tnum p-2 text-left font-bold text-slate-800">{fmtMoney(e.unitPrice)}</td>
                    <td className={`p-2 text-center font-mono ${posNeg(dev)}`}>{dev > 0 ? '+' : ''}{dev.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {!series.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد سندات لهذا الفلتر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="font-bold text-slate-700 text-md mt-6 mb-3">مقارنة الموردين</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المورد</th>
                <th className="p-2 text-center">السندات</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">متوسط</th>
                <th className="p-2 text-center">أدنى</th>
                <th className="p-2 text-center">أعلى</th>
                <th className="p-2 text-center">تذبذب %</th>
                <th className="p-2 text-center">أفضل سعر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierRows.map((s, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{s.name}</td>
                  <td className="tnum p-2 text-left">{s.count}</td>
                  <td className="tnum p-2 text-left">{fmt(s.qty)}</td>
                  <td className="tnum p-2 text-left">{fmtMoney(s.avg)}</td>
                  <td className="tnum p-2 text-left text-emerald-600">{fmtMoney(s.min)}</td>
                  <td className="tnum p-2 text-left text-rose-600">{fmtMoney(s.max)}</td>
                  <td className="tnum p-2 text-left">{s.volatility.toFixed(1)}%</td>
                  <td className="p-2 text-center">
                    {s.isBest ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">الأفضل</span> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PriceHistoryReport;