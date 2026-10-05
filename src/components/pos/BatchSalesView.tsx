import React, { useState } from 'react';
import { TrendingUp, Plus, Printer, Pencil, Trash2, Search, BarChart3, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtNum, fmtMoney, downloadCSV, netOfGross } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { sellerFor, zatcaTLV, zatcaQrDataUrl, zatcaTime } from '../../utils/zatca';
import type { BatchSalesRecord } from '../../types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtQty = fmtNum;
const fmtPct = (n: number) => `${fmtNum(n)}%`;

interface BatchSalesViewProps { onNavigate?: (tab: string) => void; onStartEdit?: (id: string) => void; }
export const BatchSalesView: React.FC<BatchSalesViewProps> = ({ onNavigate, onStartEdit }) => {
  const { batchSalesRecords, deleteBatchSalesRecord, branches, companies, vatPercent, closedDays, closeDay, reopenDay, currentUser } = useApp();
  const vatRate = vatPercent / 100;
  const [listSearch, setListSearch] = useState('');
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));

  const netOf = (b: BatchSalesRecord) => b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? vatRate);
  const vatOf = (b: BatchSalesRecord) => b.vatAmount ?? (b.totalRevenue - netOf(b));
  const fcNet = (b: BatchSalesRecord) => { const n = netOf(b); return n ? (b.totalFoodCost / n) * 100 : 0; };

  const openAdd = () => {
    onNavigate?.('batch_sales_entry');
  };

  const openEdit = (b: BatchSalesRecord) => {
    onStartEdit?.(b.id);
  };

  const confirmDelete = (b: BatchSalesRecord) => {
    if (confirm(`حذف سجل المبيعات ${b.batchNumber}؟ سيُرجع المخزون المستهلك تلقائياً.`)) deleteBatchSalesRecord(b.id);
  };

  const printRecord = async (b: BatchSalesRecord) => {
    const net = netOf(b);
    const vat = vatOf(b);
    let qr: string | undefined;
    if (vat > 0) {
      const seller = sellerFor(companies, branches, b.branchId);
      if (seller.vatNumber) qr = await zatcaQrDataUrl(zatcaTLV({ sellerName: seller.name, vatNumber: seller.vatNumber, timeISO: zatcaTime(b.date), totalWithVat: b.totalRevenue, vatAmount: vat }));
    }
    openPrintWindow({
      title: `تقرير مبيعات — ${b.batchNumber}`,
      subtitle: `${b.branchName} — ${b.date}`,
      meta: [
        ['الفرع', b.branchName], ['التاريخ', b.date], ['رقم الدفعة', b.batchNumber],
        ['عدد الأصناف', fmtQty(b.items.reduce((s, i) => s + i.quantitySold, 0))], ['نسبة الضريبة', fmtPct((b.vatRate ?? vatRate) * 100)], ['Food Cost (على الصافي)', fmtPct(fcNet(b))],
      ],
      tables: [{
        title: 'الأصناف المباعة (شاملة الضريبة)',
        header: ['#', 'الصنف', 'الفئة', 'الكمية', 'سعر الوحدة', 'الإيراد'],
        rows: b.items.map((it, idx) => [idx + 1, it.recipeNameAr, it.category, fmtQty(it.quantitySold), fmt(it.unitPrice, 2), fmt(it.lineTotalRevenue, 2)]),
      }],
      totals: [
        ['الإجمالي (شامل الضريبة)', `${fmtMoney(b.totalRevenue)}`],
        ['صافي الإيرادات', `${fmtMoney(net)}`],
        ['ضريبة القيمة المضافة', `${fmtMoney(vat)}`],
        ['تكلفة الطعام', `${fmtMoney(b.totalFoodCost)}`],
        ['Food Cost % (على الصافي)', fmtPct(fcNet(b))],
        ['الهامش (على الصافي)', `${fmtMoney(net - b.totalFoodCost)}`],
        ['هامش الربح % (على الصافي)', fmtPct(net ? ((net - b.totalFoodCost) / net * 100) : 0)],
      ],
      footer: 'تقرير مبيعات صادر من نظام RestoCost ERP',
      qr,
    });
  };

  const summarize = (recs: BatchSalesRecord[]) => {
    const totalRevenue = recs.reduce((s, b) => s + b.totalRevenue, 0);
    const totalNet = recs.reduce((s, b) => s + netOf(b), 0);
    const totalVat = recs.reduce((s, b) => s + vatOf(b), 0);
    const totalFood = recs.reduce((s, b) => s + b.totalFoodCost, 0);
    const fc = totalNet ? (totalFood / totalNet) * 100 : 0;
    const margin = totalNet ? ((totalNet - totalFood) / totalNet) * 100 : 0;
    const byBranch = new Map<string, { name: string; revenue: number; net: number; vat: number; food: number }>();
    recs.forEach((b) => {
      const g = byBranch.get(b.branchId) || { name: b.branchName, revenue: 0, net: 0, vat: 0, food: 0 };
      g.revenue += b.totalRevenue;
      g.net += netOf(b);
      g.vat += vatOf(b);
      g.food += b.totalFoodCost;
      byBranch.set(b.branchId, g);
    });
    const rows: (string | number)[][] = Array.from(byBranch.values()).map((g) => [
      g.name, fmt(g.revenue, 2), fmt(g.net, 2), fmt(g.vat, 2), fmt(g.food, 2),
      fmtPct(g.net ? (g.food / g.net) * 100 : 0), fmtPct(g.net ? ((g.net - g.food) / g.net * 100) : 0),
    ]);
    if (rows.length === 0) rows.push(['لا توجد سجلات', '—', '—', '—', '—', '—', '—']);
    return { totalRevenue, totalNet, totalVat, totalFood, fc, margin, rows };
  };

  const printSummary = () => {
    const dayRecs = batchSalesRecords.filter((b) => b.date === reportDate);
    const ym = reportDate.slice(0, 7);
    const monthRecs = batchSalesRecords.filter((b) => b.date.startsWith(ym) && b.date <= reportDate);
    const d = summarize(dayRecs);
    const m = summarize(monthRecs);
    const dayRows: (string | number)[][] = [...d.rows, ['الإجمالي', fmt(d.totalRevenue, 2), fmt(d.totalNet, 2), fmt(d.totalVat, 2), fmt(d.totalFood, 2), fmtPct(d.fc), fmtPct(d.margin)]];
    const monthRows: (string | number)[][] = [...m.rows, ['الإجمالي التراكمي', fmt(m.totalRevenue, 2), fmt(m.totalNet, 2), fmt(m.totalVat, 2), fmt(m.totalFood, 2), fmtPct(m.fc), fmtPct(m.margin)]];
    openPrintWindow({
      title: 'تقرير المبيعات اليومية و Food Cost الشامل',
      subtitle: `يوم ${reportDate} — وتراكم الشهر حتى هذا اليوم`,
      meta: [
        ['اليوم المختار', reportDate],
        ['سجلات اليوم', `${dayRecs.length}`],
        ['سجلات الشهر حتى اليوم', `${monthRecs.length}`],
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [
        {
          title: `أولاً: إجماليات يوم ${reportDate}`,
          header: ['الفرع', 'الإجمالي (شامل الضريبة)', 'الصافي', 'الضريبة', 'تكلفة الطعام', 'FC % (على الصافي)', 'هامش %'],
          rows: dayRows,
        },
        {
          title: `ثانياً: تراكم شهر ${ym} من بدايته حتى ${reportDate}`,
          header: ['الفرع', 'الإجمالي (شامل الضريبة)', 'الصافي', 'الضريبة', 'تكلفة الطعام', 'FC % (على الصافي)', 'هامش %'],
          rows: monthRows,
        },
      ],
      totals: [
        [`إجمالي يوم ${reportDate} (شامل الضريبة)`, `${fmtMoney(d.totalRevenue)}`],
        ['صافي اليوم', `${fmtMoney(d.totalNet)}`],
        ['ضريبة اليوم', `${fmtMoney(d.totalVat)}`],
        ['تكلفة طعام اليوم', `${fmtMoney(d.totalFood)}`],
        ['FC% اليوم (على الصافي)', fmtPct(d.fc)],
        [`إجمالي الشهر حتى ${reportDate} (شامل الضريبة)`, `${fmtMoney(m.totalRevenue)}`],
        ['صافي الشهر', `${fmtMoney(m.totalNet)}`],
        ['ضريبة الشهر', `${fmtMoney(m.totalVat)}`],
        ['تكلفة طعام الشهر', `${fmtMoney(m.totalFood)}`],
        ['FC% الشهر (على الصافي)', fmtPct(m.fc)],
        ['هامش الشهر %', fmtPct(m.margin)],
      ],
      footer: 'تقرير مبيعات يومي وشهري — RestoCost ERP',
    });
  };

  const ym = reportDate.slice(0, 7);
  const branchCostRows = (() => {
    const map = new Map<string, { name: string; dNet: number; dFood: number; mNet: number; mFood: number }>();
    const touch = (id: string) => {
      if (!map.has(id)) map.set(id, { name: batchSalesRecords.find((b) => b.branchId === id)?.branchName || id, dNet: 0, dFood: 0, mNet: 0, mFood: 0 });
      return map.get(id)!;
    };
    batchSalesRecords.forEach((b) => {
      if (b.date === reportDate) { const g = touch(b.branchId); g.dNet += netOf(b); g.dFood += b.totalFoodCost; }
      if (b.date.startsWith(ym) && b.date <= reportDate) { const g = touch(b.branchId); g.mNet += netOf(b); g.mFood += b.totalFoodCost; }
    });
    return Array.from(map.values()).sort((a, x) => x.mNet - a.mNet);
  })();
  const bcTotals = branchCostRows.reduce((a, r) => ({ dNet: a.dNet + r.dNet, dFood: a.dFood + r.dFood, mNet: a.mNet + r.mNet, mFood: a.mFood + r.mFood }), { dNet: 0, dFood: 0, mNet: 0, mFood: 0 });
  const maxDayNet = Math.max(...branchCostRows.map((r) => r.dNet), 1);

  const printBranchCost = () => {
    const rows: (string | number)[][] = branchCostRows.map((r) => [
      r.name, fmt(r.dNet, 2), fmt(r.dFood, 2), fmtPct(r.dNet ? (r.dFood / r.dNet) * 100 : 0),
      fmt(r.mNet, 2), fmt(r.mFood, 2), fmtPct(r.mNet ? (r.mFood / r.mNet) * 100 : 0),
    ]);
    rows.push([
      'الإجمالي', fmt(bcTotals.dNet, 2), fmt(bcTotals.dFood, 2), fmtPct(bcTotals.dNet ? (bcTotals.dFood / bcTotals.dNet) * 100 : 0),
      fmt(bcTotals.mNet, 2), fmt(bcTotals.mFood, 2), fmtPct(bcTotals.mNet ? (bcTotals.mFood / bcTotals.mNet) * 100 : 0),
    ]);
    openPrintWindow({
      title: 'تقرير تكلفة الفروع — اليومي والشهري',
      subtitle: `يوم ${reportDate} وتراكم شهر ${ym} حتى هذا اليوم`,
      compact: true,
      meta: [
        ['اليوم', reportDate], ['الفروع', `${branchCostRows.length}`],
        ['صافي اليوم', fmtMoney(bcTotals.dNet)], ['تكلفة اليوم', fmtMoney(bcTotals.dFood)],
        ['صافي الشهر', fmtMoney(bcTotals.mNet)], ['تكلفة الشهر', fmtMoney(bcTotals.mFood)],
      ],
      tables: [
        {
          title: 'التفاصيل (نسبة صافي اليوم من الأعلى)',
          header: ['الفرع', 'الصافي اليومي', 'تكلفة اليوم', 'FC% اليوم', 'الصافي الشهري', 'التكلفة الشهرية', 'FC% الشهر'],
          rows,
        },
      ],
      bars: [
        {
          title: 'مخطط الصافي اليومي لكل فرع',
          max: maxDayNet,
          items: branchCostRows.map((r) => ({ label: r.name, value: r.dNet, display: fmtMoney(r.dNet) })),
        },
      ],
      totals: [
        ['FC% اليوم (إجمالي)', fmtPct(bcTotals.dNet ? (bcTotals.dFood / bcTotals.dNet) * 100 : 0)],
        ['FC% الشهر (إجمالي)', fmtPct(bcTotals.mNet ? (bcTotals.mFood / bcTotals.mNet) * 100 : 0)],
      ],
      footer: 'تقرير تكلفة الفروع — RestoCost ERP',
    });
  };

  const totalRevenue = batchSalesRecords.reduce((s, b) => s + b.totalRevenue, 0);
  const totalNet = batchSalesRecords.reduce((s, b) => s + netOf(b), 0);
  const totalVat = batchSalesRecords.reduce((s, b) => s + vatOf(b), 0);
  const totalFood = batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const avgFc = batchSalesRecords.length ? batchSalesRecords.reduce((s, b) => s + fcNet(b), 0) / batchSalesRecords.length : 0;
  const filteredRecords = batchSalesRecords.filter((b) => !listSearch || b.batchNumber.includes(listSearch) || b.date.includes(listSearch) || b.branchName.includes(listSearch));

  return (
    <div className="space-y-6">
      <PageHeader title="المبيعات اليومية و Food Cost" subtitle="إدخال مبيعات اليوم، فتح وتعديل وحذف، طباعة وتصدير، وتتبع نسبة تكلفة الطعام" icon={<TrendingUp className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar
            filename="المبيعات_اليومية"
            sheets={[
              { name: 'سجل المبيعات', header: ['الدفعة', 'التاريخ', 'الفرع', 'الإجمالي (شامل الضريبة)', 'الصافي', 'الضريبة', 'تكلفة الطعام', 'نسبة FC % (على الصافي)'], rows: filteredRecords.map((b) => [b.batchNumber, b.date, b.branchName, b.totalRevenue, netOf(b), vatOf(b), b.totalFoodCost, fcNet(b)]) },
              { name: 'الأصناف المباعة', header: ['الدفعة', 'التاريخ', 'الفرع', 'الصنف', 'الفئة', 'الكمية', 'سعر الوحدة', 'إيراد السطر'], rows: filteredRecords.flatMap((b) => b.items.map((it) => [b.batchNumber, b.date, b.branchName, it.recipeNameAr, it.category, it.quantitySold, it.unitPrice, it.lineTotalRevenue])) },
              { name: 'الملخص', header: ['البند', 'القيمة'], rows: [['الإجمالي (شامل الضريبة)', totalRevenue], ['صافي الإيرادات', totalNet], ['ضريبة القيمة المضافة', totalVat], ['تكلفة الطعام', totalFood], ['متوسط Food Cost % (على الصافي)', avgFc.toFixed(2)], ['هامش الربح % (على الصافي)', totalNet ? ((totalNet - totalFood) / totalNet * 100).toFixed(2) : '0.0']] },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('BatchSales.csv', ['الدفعة', 'التاريخ', 'الفرع', 'الإجمالي', 'الصافي', 'الضريبة', 'تكلفة الطعام', 'نسبة FC (على الصافي)'], filteredRecords.map((b) => [b.batchNumber, b.date, b.branchName, round2(b.totalRevenue).toFixed(2), round2(netOf(b)).toFixed(2), round2(vatOf(b)).toFixed(2), round2(b.totalFoodCost).toFixed(2), fcNet(b).toFixed(2)]))}>تصدير CSV</Btn>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">يوم التقرير:</span>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputCls + ' !w-36'} />
          </span>
          <Btn tone="ghost" onClick={printSummary}><Printer className="w-4 h-4" /> تقرير شامل</Btn>
          <Btn tone="ghost" onClick={printBranchCost}><BarChart3 className="w-4 h-4" /> تكلفة الفروع</Btn>
          {closedDays.includes(reportDate) ? (
            <Btn tone="ghost" onClick={() => { if (currentUser?.role === 'admin') reopenDay(reportDate); else alert('إعادة الفتح للمدير فقط'); }}><Lock className="w-4 h-4" /> مغلق — إعادة الفتح (للمدير)</Btn>
          ) : (
            <Btn tone="dark" onClick={() => { const cnt = batchSalesRecords.filter((b) => b.date === reportDate).length; if (confirm(`إغلاق يوم ${reportDate}؟\n\nسجلات مبيعات هذا اليوم: ${cnt}\nبعد الإغلاق يُمنع الإضافة والتعديل والحذف على هذا التاريخ في كل الشاشات.`)) closeDay(reportDate); }}>إغلاق اليوم</Btn>
          )}
          <Btn onClick={openAdd}><Plus className="w-4 h-4" /> إدخال مبيعات اليوم</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الفترة (شامل الضريبة)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalRevenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الإيرادات</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(totalNet)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ضريبة القيمة المضافة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(totalVat)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متوسط Food Cost (على الصافي)</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{avgFc.toFixed(2)}%</strong></div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-600" /> تكلفة الفروع — يوم {reportDate} وتراكم شهر {reportDate.slice(0, 7)}</h3>
          <Btn tone="ghost" onClick={printBranchCost}><Printer className="w-4 h-4" /> طباعة</Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-2">الفرع</th><th className="p-2">الصافي اليومي</th><th className="p-2">تكلفة اليوم</th><th className="p-2">FC% اليوم</th><th className="p-2">الصافي الشهري</th><th className="p-2">التكلفة الشهرية</th><th className="p-2">FC% الشهر</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchCostRows.map((r) => (
                <tr key={r.name}>
                  <td className="p-2 font-bold text-slate-900">{r.name}</td>
                  <td className="tnum text-left p-2 text-brand-700">{fmtMoney(r.dNet)}</td>
                  <td className="tnum text-left p-2">{fmtMoney(r.dFood)}</td>
                  <td className={'p-2 font-mono ' + (r.dNet && (r.dFood / r.dNet) * 100 > 35 ? 'text-rose-600 font-bold' : 'text-emerald-700')}>{fmtPct(r.dNet ? (r.dFood / r.dNet) * 100 : 0)}</td>
                  <td className="tnum text-left p-2 text-brand-700">{fmtMoney(r.mNet)}</td>
                  <td className="tnum text-left p-2">{fmtMoney(r.mFood)}</td>
                  <td className={'p-2 font-mono ' + (r.mNet && (r.mFood / r.mNet) * 100 > 35 ? 'text-rose-600 font-bold' : 'text-emerald-700')}>{fmtPct(r.mNet ? (r.mFood / r.mNet) * 100 : 0)}</td>
                </tr>
              ))}
              {branchCostRows.length > 0 && (
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="tnum text-left p-2 text-brand-800">{fmtMoney(bcTotals.dNet)}</td>
                  <td className="tnum text-left p-2">{fmtMoney(bcTotals.dFood)}</td>
                  <td className="tnum text-left p-2">{fmtPct(bcTotals.dNet ? (bcTotals.dFood / bcTotals.dNet) * 100 : 0)}</td>
                  <td className="tnum text-left p-2 text-brand-800">{fmtMoney(bcTotals.mNet)}</td>
                  <td className="tnum text-left p-2">{fmtMoney(bcTotals.mFood)}</td>
                  <td className="tnum text-left p-2">{fmtPct(bcTotals.mNet ? (bcTotals.mFood / bcTotals.mNet) * 100 : 0)}</td>
                </tr>
              )}
              {branchCostRows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">لا توجد بيانات لهذا اليوم — اختر يوماً آخر</td></tr>}
            </tbody>
          </table>
        </div>
        {branchCostRows.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-[10px] font-bold text-slate-500">مخطط الصافي اليومي لكل فرع:</div>
            {branchCostRows.map((r) => (
              <div key={'c-' + r.name} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs font-bold text-slate-700">{r.name}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((r.dNet / maxDayNet) * 100)}%` }} />
                </div>
                <span className="font-mono text-xs w-24 text-left text-slate-600">{fmtMoney(r.dNet)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="بحث بالدفعة / التاريخ / الفرع…" className={inputCls + ' !w-64'} />
          <h3 className="font-bold text-slate-800 text-xs">سجلات المبيعات ({filteredRecords.length}) — فتح / تعديل / طباعة / حذف</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الدفعة</th><th className="p-3">التاريخ</th><th className="p-3">الفرع</th><th className="p-3">الإجمالي (شامل الضريبة)</th><th className="p-3">الصافي</th><th className="p-3">الضريبة</th><th className="p-3">تكلفة الطعام</th><th className="p-3">Food Cost (على الصافي)</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="tnum text-left p-3 font-bold text-brand-700">{b.batchNumber}</td>
                  <td className="tnum text-left p-3 text-slate-600">{b.date}</td>
                  <td className="p-3 font-bold text-slate-900">{b.branchName}</td>
                  <td className="tnum text-left p-3 font-extrabold text-emerald-700">{fmt(b.totalRevenue, 2)}</td>
                  <td className="tnum text-left p-3 font-bold text-brand-700">{fmt(netOf(b), 2)}</td>
                  <td className="tnum text-left p-3 text-amber-700">{fmt(vatOf(b), 2)}</td>
                  <td className="tnum text-left p-3">{fmt(b.totalFoodCost, 2)}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fcNet(b) > 35 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{fcNet(b).toFixed(2)}%</span></td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">مخصوم المخزون</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => printRecord(b)} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg" title="طباعة التقرير"><Printer className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(b)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="تعديل السجل"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => confirmDelete(b)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف السجل"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};