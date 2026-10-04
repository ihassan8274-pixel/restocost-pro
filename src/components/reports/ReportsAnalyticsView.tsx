import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts';
import { Printer, CalendarRange, TrendingUp, UtensilsCrossed, Ghost, Users, Layers, Receipt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../ui';
import { openPrintWindow, captureCharts } from '../../utils/print';
import { fmt, fmtMoney, fmtNum, monthLabel } from '../../utils/helpers';

type TabId = 'trend' | 'dishes' | 'dead' | 'customers' | 'channels' | 'expenses' | 'branches' | 'purchasing' | 'forecast' | 'categories';

const TABS = [
  { id: 'trend', label: 'الاتجاه الزمني' },
  { id: 'dishes', label: 'ربحية الأطباق' },
  { id: 'dead', label: 'الأطباق الراكدة' },
  { id: 'customers', label: 'تحليل العملاء' },
  { id: 'channels', label: 'قنوات البيع' },
  { id: 'expenses', label: 'المصروفات التحليلية' },
  { id: 'branches', label: 'أداء الفروع' },
  { id: 'purchasing', label: 'المشتريات والموردون' },
  { id: 'forecast', label: 'التوقعات الذكية' },
  { id: 'categories', label: 'مزيج التصنيفات' },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#84cc16'];
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const ReportsAnalyticsView: React.FC = () => {
  const {
    posOrders, batchSalesRecords, operatingExpenses, customers, deliverySales,
    recipes, purchaseOrders, getBranchName, visibleBranchIds, showToast, branches,
  } = useApp();
  const [tab, setTab] = useState<TabId>('trend');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [regionSel, setRegionSel] = useState('');
  const regionOfB = (bid: string): string => branches.find((b) => b.id === bid)?.region?.trim() || '';

  const inRange = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const regionOk = (bid?: string) => !regionSel || regionOfB(bid || '') === regionSel;
  const pos = useMemo(() => posOrders.filter((o) => inRange(o.date) && regionOk(o.branchId)), [posOrders, fromDate, toDate, regionSel]);
  const batch = useMemo(() => batchSalesRecords.filter((b) => inRange(b.date) && regionOk(b.branchId)), [batchSalesRecords, fromDate, toDate, regionSel]);
  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'كامل الفترة المتاحة';

  // ===== 1) الاتجاه الزمني =====
  const dayOfWeek = useMemo(() => {
    const acc = DAYS.map((name) => ({ name, مبيعات: 0, طلبات: 0 }));
    pos.forEach((o) => { const row = acc[new Date(o.date).getDay()] ?? acc[0]; row.مبيعات += o.totalAmount; row.طلبات += 1; });
    batch.forEach((b) => { const row = acc[new Date(b.date).getDay()] ?? acc[0]; row.مبيعات += b.netRevenue ?? b.totalRevenue; });
    return acc.map((r) => ({ ...r, مبيعات: Math.round(r.مبيعات) }));
  }, [pos, batch]);

  const monthlyTrend = useMemo(() => {
    const m = new Map<string, { net: number; cost: number; opex: number }>();
    const add = (k: string, net: number, cost: number) => {
      const cur = m.get(k) ?? { net: 0, cost: 0, opex: 0 };
      cur.net += net; cur.cost += cost; m.set(k, cur);
    };
    pos.forEach((o) => add(o.date.slice(0, 7), o.subtotal, o.totalCost));
    batch.forEach((b) => add(b.date.slice(0, 7), b.netRevenue ?? b.totalRevenue, b.totalFoodCost));
    operatingExpenses.filter((e) => e.paymentStatus === 'paid').forEach((e) => {
      const cur = m.get(e.createdAt.slice(0, 7)) ?? { net: 0, cost: 0, opex: 0 };
      cur.opex += e.amount; m.set(e.createdAt.slice(0, 7), cur);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ name: monthLabel(k), إيراد: Math.round(v.net), تكلفة: Math.round(v.cost), مصروفات: Math.round(v.opex), ربح: Math.round(v.net - v.cost - v.opex) }));
  }, [pos, batch, operatingExpenses]);

  // ===== 2) ربحية الأطباق =====
  const dishProfit = useMemo(() => {
    const m = new Map<string, { id: string; name: string; qty: number; rev: number; cost: number }>();
    const bump = (id: string, name: string, qty: number, rev: number, cost: number) => {
      const cur = m.get(id) ?? { id, name, qty: 0, rev: 0, cost: 0 };
      cur.qty += qty; cur.rev += rev; cur.cost += cost; m.set(id, cur);
    };
    pos.forEach((o) => o.items.forEach((i) => bump(i.recipeId || i.recipeName, i.recipeName, i.quantity, i.lineTotal, i.quantity * i.unitCost)));
    batch.forEach((b) => {
      const net = b.netRevenue ?? b.totalRevenue;
      const factor = b.totalRevenue > 0 ? net / b.totalRevenue : 1;
      b.items.forEach((i) => bump(i.recipeId, i.recipeNameAr, i.quantitySold, i.lineTotalRevenue * factor, i.quantitySold * i.unitCost));
    });
    return Array.from(m.values()).map((r) => ({
      ...r,
      profit: r.rev - r.cost,
      marginPct: r.rev ? ((r.rev - r.cost) / r.rev) * 100 : 0,
    })).sort((a, b2) => b2.profit - a.profit);
  }, [pos, batch]);
  const topDishes = dishProfit.slice(0, 10);
  const worstDishes = [...dishProfit].reverse().slice(0, 5);

  // ===== 3) الأطباق الراكدة =====
  const deadDishes = useMemo(() => {
    const soldIds = new Set<string>();
    const cut = new Date(); cut.setDate(cut.getDate() - 30); const cutStr = cut.toISOString().slice(0, 10);
    pos.filter((o) => o.date >= cutStr).forEach((o) => o.items.forEach((i) => soldIds.add(i.recipeId || i.recipeName)));
    batch.filter((b) => b.date >= cutStr).forEach((b) => b.items.forEach((i) => soldIds.add(i.recipeId)));
    return recipes
      .filter((r) => !r.isCentralKitchenPrep && r.isActive && !soldIds.has(r.id))
      .map((r) => ({ id: r.id, name: r.nameAr, category: String(r.category), price: r.actualMenuPrice }))
      .slice(0, 40);
  }, [recipes, pos, batch]);

  // ===== 4) العملاء =====
  const topCustomers = useMemo(() =>
    [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 10),
  [customers]);

  // ===== 5) قنوات البيع =====
  const channelsMonthly = useMemo(() => {
    const m = new Map<string, { صالة: number; توصيل: number }>();
    pos.forEach((o) => {
      const k = o.date.slice(0, 7);
      const cur = m.get(k) ?? { صالة: 0, توصيل: 0 };
      cur.صالة += o.subtotal; m.set(k, cur);
    });
    deliverySales.filter((s) => inRange(s.date) && regionOk(s.branchId)).forEach((s) => {
      const k = s.date.slice(0, 7);
      const cur = m.get(k) ?? { صالة: 0, توصيل: 0 };
      cur.توصيل += s.netRevenue; m.set(k, cur);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ name: monthLabel(k), ...v, صالة: Math.round(v.صالة), توصيل: Math.round(v.توصيل) }));
  }, [pos, deliverySales, fromDate, toDate]);
  const channelTotals = channelsMonthly.reduce((a, c) => ({ صالة: a.صالة + c.صالة, توصيل: a.توصيل + c.توصيل }), { صالة: 0, توصيل: 0 });

  // ===== 6) المصروفات حسب التصنيف =====
  const expenseByCat = useMemo(() => {
    const m = new Map<string, number>();
    operatingExpenses.filter((e) => e.paymentStatus === 'paid' && inRange(e.createdAt)).forEach((e) => {
      m.set(e.category, (m.get(e.category) || 0) + e.amount);
    });
    const arr = Array.from(m.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    return arr;
  }, [operatingExpenses, fromDate, toDate]);
  const expenseTotal = expenseByCat.reduce((s, x) => s + x.value, 0);

  const kpiTotalNet = monthlyTrend.reduce((s, x) => s + x.إيراد, 0);
  const kpiProfit = monthlyTrend.reduce((s, x) => s + x.ربح, 0);

  // ===== 7) أداء الفروع + تجميع المناطق =====
  const branchPerf = useMemo(() => {
    const m = new Map<string, { net: number; cost: number; orders: number }>();
    pos.forEach((o) => { const c = m.get(o.branchId) ?? { net: 0, cost: 0, orders: 0 }; c.net += o.subtotal; c.cost += o.totalCost; c.orders += 1; m.set(o.branchId, c); });
    batch.forEach((b) => { const c = m.get(b.branchId) ?? { net: 0, cost: 0, orders: 0 }; c.net += b.netRevenue ?? b.totalRevenue; c.cost += b.totalFoodCost; m.set(b.branchId, c); });
    return Array.from(m.entries())
      .filter(([id]) => visibleBranchIds.includes(id))
      .map(([id, v]) => ({ id, name: getBranchName(id) || 'غير محدد', region: regionOfB(id) || 'غير محدد', net: Math.round(v.net), cost: Math.round(v.cost), orders: v.orders, fcPct: v.net ? (v.cost / v.net) * 100 : 0, avgTicket: v.orders ? v.net / v.orders : 0 }))
      .sort((a, b) => b.net - a.net);
  }, [pos, batch, visibleBranchIds, getBranchName, branches]);
  const branchTotalNet = branchPerf.reduce((s, b) => s + b.net, 0);
  const companyTotal = {
    net: branchTotalNet,
    cost: branchPerf.reduce((s, b) => s + b.cost, 0),
    orders: branchPerf.reduce((s, b) => s + b.orders, 0),
  };
  const regionTotals = useMemo(() => {
    const m = new Map<string, { net: number; cost: number; orders: number; branches: number }>();
    branchPerf.forEach((b) => {
      const cur = m.get(b.region) ?? { net: 0, cost: 0, orders: 0, branches: 0 };
      cur.net += b.net; cur.cost += b.cost; cur.orders += b.orders; cur.branches += 1;
      m.set(b.region, cur);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, fcPct: v.net ? (v.cost / v.net) * 100 : 0 }))
      .sort((a, b) => b.net - a.net);
  }, [branchPerf]);

  // ===== 8) المشتريات والموردون =====
  const poAnalysis = useMemo(() => {
    const poList = purchaseOrders.filter((p) => inRange(p.orderDate));
    const matMap = new Map<string, { name: string; ordered: number; received: number }>();
    poList.forEach((p) => p.items.forEach((i) => {
      const c = matMap.get(i.rawMaterialId) ?? { name: i.materialName, ordered: 0, received: 0 };
      c.ordered += i.quantity;
      if (typeof i.receivedQty === 'number') c.received += i.receivedQty;
      matMap.set(i.rawMaterialId, c);
    }));
    const materials = Array.from(matMap.values())
      .map((v) => ({ ...v, receivedPct: v.ordered ? (v.received / v.ordered) * 100 : 0, shortfall: v.ordered - v.received }))
      .sort((a, b) => b.shortfall - a.shortfall).slice(0, 25);
    const supMap = new Map<string, { name: string; count: number; total: number; ordered: number; received: number }>();
    poList.forEach((p) => {
      let o = 0, r = 0;
      p.items.forEach((i) => { o += i.quantity; if (typeof i.receivedQty === 'number') r += i.receivedQty; });
      const c = supMap.get(p.supplierId) ?? { name: p.supplierName, count: 0, total: 0, ordered: 0, received: 0 };
      c.count += 1; c.total += p.totalAmount; c.ordered += o; c.received += r;
      supMap.set(p.supplierId, c);
    });
    const suppliers = Array.from(supMap.values())
      .map((v) => ({ ...v, avgOrder: v.count ? v.total / v.count : 0, fillPct: v.ordered ? (v.received / v.ordered) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
    return { materials, suppliers };
  }, [purchaseOrders, fromDate, toDate]);

  // ===== 9) التوقعات الذكية =====
  const forecast = useMemo(() => {
    const rows = monthlyTrend;
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const momGrowth = prev && prev.إيراد ? ((last.إيراد - prev.إيراد) / prev.إيراد) * 100 : 0;
    const l3 = rows.slice(-3);
    const wAvgNet = l3.length === 3 ? l3[0].إيراد * 0.2 + l3[1].إيراد * 0.3 + l3[2].إيراد * 0.5 : (last?.إيراد ?? 0);
    const pts = rows.slice(-6);
    const n = pts.length;
    let slope = 0, intercept = last?.إيراد ?? 0;
    if (n >= 2) {
      const ys = pts.map((p) => p.إيراد);
      const mx = (n + 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (i + 1 - mx) * (ys[i] - my); sxx += (i + 1 - mx) ** 2; }
      slope = sxx ? sxy / sxx : 0;
      intercept = my - slope * mx;
    }
    const regressionNext = Math.max(0, Math.round(intercept + slope * (n + 1)));
    const blended = l3.length === 3 ? Math.round(regressionNext * 0.5 + wAvgNet * 0.5) : regressionNext;
    return {
      momGrowth,
      wAvgNet: Math.round(wAvgNet),
      regressionNext,
      blended,
      trendSlope: Math.round(slope),
      lastMonth: last?.name ?? '—',
    };
  }, [monthlyTrend]);

  // ===== تنبيهات ذكية تلقائية =====
  const alerts = useMemo(() => {
    const out: { level: 'danger' | 'warn'; text: string }[] = [];
    branchPerf.forEach((b) => { if (b.net > 0 && b.fcPct > 40) out.push({ level: 'danger', text: `تكلفة الطعام في ${b.name} بلغت ${b.fcPct.toFixed(1)}% — فوق الحد الآمن` }); });
    if (forecast.momGrowth < -10) out.push({ level: 'danger', text: `هبوط المبيعات ${Math.abs(forecast.momGrowth).toFixed(1)}% مقارنة بالشهر السابق` });
    else if (forecast.momGrowth < 0) out.push({ level: 'warn', text: `انخفاض طفيف بالمبيعات ${Math.abs(forecast.momGrowth).toFixed(1)}% هذا الشهر` });
    const weak = dishProfit.filter((d) => d.qty >= 5 && d.marginPct < 25);
    if (weak.length) out.push({ level: 'warn', text: `${weak.length} طبق نشط بهامش أقل من 25% — راجع تبويب ربحية الأطباق` });
    const shortSup = poAnalysis.suppliers.filter((s) => s.fillPct < 80);
    if (shortSup.length) out.push({ level: 'warn', text: `${shortSup.length} مورد بنسبة استلام أقل من 80% (${shortSup.slice(0, 2).map((s) => s.name).join('، ')})` });
    return out;
  }, [branchPerf, forecast, dishProfit, poAnalysis]);

  // ===== مزيج التصنيفات =====
  const categoryMix = useMemo(() => {
    const catOf = new Map<string, string>();
    recipes.forEach((r) => catOf.set(r.id, String(r.category)));
    const m = new Map<string, { rev: number; profit: number }>();
    dishProfit.forEach((d) => {
      const c = catOf.get(d.id) || 'غير مصنّف';
      const cur = m.get(c) ?? { rev: 0, profit: 0 };
      cur.rev += d.rev; cur.profit += d.profit; m.set(c, cur);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, الإيراد: Math.round(v.rev), الهامش: Math.round(v.profit), هامشPct: v.rev ? Number(((v.profit / v.rev) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.الإيراد - a.الإيراد);
  }, [dishProfit, recipes]);


  type PTable = { title: string; header: string[]; rows: (string | number)[][] };

  const exportActiveTab = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    let file = 'analytics'; let header: string[] = []; let rows: (string | number)[][] = [];
    switch (tab) {
      case 'trend': file = 'الاتجاه_الشهري'; header = ['الشهر', 'الإيراد', 'التكلفة', 'المصروفات', 'الربح']; rows = monthlyTrend.map((r) => [r.name, r.إيراد, r.تكلفة, r.مصروفات, r.ربح]); break;
      case 'dishes': file = 'ربحية_الأطباق'; header = ['#', 'الطبق', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'الهامش %']; rows = dishProfit.map((d, i) => [i + 1, d.name, d.qty, Number(d.rev.toFixed(2)), Number(d.cost.toFixed(2)), Number(d.profit.toFixed(2)), Number(d.marginPct.toFixed(1))]); break;
      case 'dead': file = 'الأطباق_الراكدة'; header = ['الطبق', 'الفئة', 'سعر القائمة']; rows = deadDishes.map((d) => [d.name, d.category, d.price]); break;
      case 'customers': file = 'تحليل_العملاء'; header = ['العميل', 'إجمالي الإنفاق']; rows = topCustomers.map((c) => [c.name, c.totalSpent || 0]); break;
      case 'channels': file = 'قنوات_البيع'; header = ['الشهر', 'الصالة', 'التوصيل', 'حصة التوصيل %']; rows = [...channelsMonthly.map((c) => [c.name, c.صالة, c.توصيل, c.صالة + c.توصيل ? Number(((c.توصيل / (c.صالة + c.توصيل)) * 100).toFixed(1)) : 0]), ['الإجمالي', channelTotals.صالة, channelTotals.توصيل, '']]; break;
      case 'expenses': file = 'المصروفات_حسب_التصنيف'; header = ['التصنيف', 'المبلغ', 'النسبة %']; rows = expenseByCat.map((c) => [c.name, c.value, expenseTotal ? Number(((c.value / expenseTotal) * 100).toFixed(1)) : 0]); break;
      case 'branches': file = 'أداء_الفروع'; header = ['الفرع', 'الصافي', 'التكلفة', 'FC %', 'الطلبات', 'متوسط الفاتورة', 'الحصة %']; rows = branchPerf.map((b) => [b.name, b.net, b.cost, Number(b.fcPct.toFixed(1)), b.orders, Number(b.avgTicket.toFixed(0)), branchTotalNet ? Number(((b.net / branchTotalNet) * 100).toFixed(1)) : 0]); break;
      case 'purchasing': file = 'المشتريات_والموردون'; header = ['المورد', 'الأوامر', 'إجمالي القيمة', 'متوسط الأمر', 'اكتمال الاستلام %']; rows = poAnalysis.suppliers.map((s) => [s.name, s.count, s.total, Number(s.avgOrder.toFixed(0)), Number(s.fillPct.toFixed(1))]); break;
      case 'forecast': file = 'التوقعات'; header = ['المؤشر', 'القيمة']; rows = [['نمو آخر شهر %', Number(forecast.momGrowth.toFixed(1))], ['متوسط 3 أشهر مرجح', forecast.wAvgNet], ['انحدار خطي', forecast.regressionNext], ['التوقع المدمج', forecast.blended]]; break;
      case 'categories': file = 'مزيج_التصنيفات'; header = ['التصنيف', 'الإيراد', 'الهامش', 'الهامش %']; rows = categoryMix.map((c) => [c.name, c.الإيراد, c.الهامش, c.هامشPct]); break;
    }
    const csv = '\uFEFF' + [header.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `${file}_${stamp}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast?.(`تم تصدير ${rows.length} سجل`);
  };


  const printSection = (title: string, tables: PTable[], chartSel?: string) => {
    void (async () => {
      const charts = chartSel ? await captureCharts(chartSel) : [];
      openPrintWindow({ title, subtitle: periodLabel, meta: [['عدد سجلات المبيعات', `${pos.length + batch.length}`], ['صافي الإيراد', fmtMoney(kpiTotalNet)]], tables, charts, footer: `${title} — ${periodLabel} — RestoCost ERP Pro` });
    })();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="منصة التحليلات المتقدمة"
        subtitle="ستة تقارير تحليلية احترافية: الاتجاه، ربحية الأطباق، الأطباق الراكدة، العملاء، قنوات البيع، والمصروفات — مع فترة زمنية وطباعة بالرسوم"
        icon={<Layers className="w-6 h-6 text-cyan-300" />}
        actions={
          <Card className="!p-2 flex items-end gap-2 border-0 shadow-none">
            <Field label="من"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            <Field label="إلى"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
            {(fromDate || toDate) && <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح</Btn>}
            <span title="تصدير التبويب الحالي إلى Excel (CSV)"><Btn tone="ghost" onClick={exportActiveTab}>تصدير</Btn></span>
            <Field label="المنطقة">
              <select value={regionSel} onChange={(e) => setRegionSel(e.target.value)} className={inputCls}>
                <option value="">كل المناطق</option>
                {Array.from(new Set(branches.map((b) => b.region?.trim()).filter(Boolean))).map((rg) => <option key={rg} value={rg}>{rg}</option>)}
              </select>
            </Field>
          </Card>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><span className="text-[10px] text-slate-500 block">صافي الإيراد — {periodLabel}</span><strong className="text-indigo-700 font-mono">{fmtMoney(kpiTotalNet)}</strong></Card>
        <Card className="p-3"><span className="text-[10px] text-slate-500 block">الربح بعد المصروفات</span><strong className="text-emerald-700 font-mono">{fmtMoney(kpiProfit)}</strong></Card>
        <Card className="p-3"><span className="text-[10px] text-slate-500 block">أفضل طبق مساهمة</span><strong className="text-slate-800 text-xs">{topDishes[0]?.name || '—'} · {fmtMoney(topDishes[0]?.profit || 0)}</strong></Card>
        <Card className="p-3"><span className="text-[10px] text-slate-500 block">أطباق راكدة (30 يوم)</span><strong className="text-rose-600 font-mono">{deadDishes.length}</strong></Card>
      </div>

      {!!alerts.length && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a, i) => (
            <span key={i} className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${a.level === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {a.level === 'danger' ? 'عاجل:' : 'تنبيه:'} {a.text}
            </span>
          ))}
        </div>
      )}

      <TabBar tabs={TABS} active={tab} onChange={(t) => setTab(t as TabId)} />

      {tab === 'trend' && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><CalendarRange className="w-4 h-4 text-indigo-600" /> الإيراد والتكلفة والأرباح شهرياً</h3>
              <Btn tone="ghost" onClick={() => printSection('التقرير الاتجاهي الشهري', [{ title: 'الاتجاه الشهري', header: ['الشهر', 'الإيراد', 'التكلفة', 'المصروفات', 'الربح'], rows: monthlyTrend.map((r) => [r.name, r.إيراد, r.تكلفة, r.مصروفات, r.ربح]) }, { title: 'توزيع أيام الأسبوع', header: ['اليوم', 'المبيعات', 'الطلبات'], rows: dayOfWeek.map((d) => [d.name, d.مبيعات, d.طلبات]) }], '#ra-trend')}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
            <div id="ra-trend">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={monthlyTrend} margin={{ top: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="إيراد" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="تكلفة" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="مصروفات" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ربح" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="overflow-x-auto">
            <div className="p-4 pb-2 font-extrabold text-slate-800 text-sm">توزيع المبيعات على أيام الأسبوع</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Bar dataKey="مبيعات" fill="#6366f1" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmtNum(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
            <table className="w-full text-xs mt-2">
              <thead><tr>{['اليوم', 'المبيعات', 'الطلبات'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
              <tbody>{dayOfWeek.map((d) => (
                <tr key={d.name} className="border-b border-slate-50"><td className="p-2 font-bold">{d.name}</td><td className="tnum text-left p-2">{fmt(d.مبيعات)}</td><td className="tnum text-left p-2">{fmtNum(d.طلبات, 0)}</td></tr>
              ))}</tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'dishes' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-emerald-600" /> ترتيب الأطباق حسب هامش المساهمة</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير ربحية الأطباق', [
              { title: 'أفضل 10 أطباق', header: ['الطبق', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'الهامش %'], rows: topDishes.map((d) => [d.name, d.qty, Number(d.rev.toFixed(2)), Number(d.cost.toFixed(2)), Number(d.profit.toFixed(2)), Number(d.marginPct.toFixed(1))]) },
              { title: 'أقل 5 أطباق ربحية', header: ['الطبق', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'الهامش %'], rows: worstDishes.map((d) => [d.name, d.qty, Number(d.rev.toFixed(2)), Number(d.cost.toFixed(2)), Number(d.profit.toFixed(2)), Number(d.marginPct.toFixed(1))]) },
            ], '#ra-dish-chart')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div id="ra-dish-chart" className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topDishes.map((d) => ({ name: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name, هامش: Math.round(d.profit) }))} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Bar dataKey="هامش" fill="#10b981" radius={[0, 6, 6, 0]} label={{ position: 'insideRight', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmtNum(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs">
            <thead><tr>{['#', 'الطبق', 'الكمية', 'الإيراد', 'التكلفة', 'هامش المساهمة', 'الهامش %'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
            <tbody>
              {dishProfit.slice(0, 25).map((d, i) => (
                <tr key={d.id} className={`border-b border-slate-50 hover:bg-slate-50 ${i < 3 ? 'bg-emerald-50/50' : ''} ${i >= dishProfit.slice(0, 25).length - 3 ? 'bg-rose-50/50' : ''}`}>
                  <td className="tnum text-left p-2 text-slate-400">{i + 1}</td>
                  <td className="p-2 font-bold text-slate-800">{d.name}</td>
                  <td className="tnum text-left p-2">{fmtNum(d.qty, 0)}</td>
                  <td className="tnum text-left p-2">{fmt(d.rev)}</td>
                  <td className="tnum text-left p-2 text-slate-500">{fmt(d.cost)}</td>
                  <td className={`p-2 font-mono font-bold ${d.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(d.profit)}</td>
                  <td className="tnum text-left p-2">{d.marginPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'dead' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><Ghost className="w-4 h-4 text-slate-400" /> أطباق لم تُبع خلال آخر 30 يوماً ({deadDishes.length})</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير الأطباق الراكدة', [{ title: 'أطباق بدون مبيعات (30 يوم)', header: ['الطبق', 'الفئة', 'سعر القائمة'], rows: deadDishes.map((d) => [d.name, d.category, d.price]) }])}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <table className="w-full text-xs">
            <thead><tr>{['الطبق', 'الفئة', 'سعر القائمة'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
            <tbody>
              {deadDishes.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-700">{d.name}</td>
                  <td className="p-2 text-slate-500">{d.category}</td>
                  <td className="tnum text-left p-2">{fmt(d.price)}</td>
                </tr>
              ))}
              {!deadDishes.length && <tr><td colSpan={3} className="p-4 text-center text-emerald-600 font-bold">كل الأطباق نشطة البيع خلال آخر 30 يوماً</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'customers' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-violet-600" /> أعلى العملاء إنفاقاً</h3>
            <Btn tone="ghost" onClick={() => printSection('تحليل العملاء', [{ title: 'أعلى 10 عملاء', header: ['العميل', 'إجمالي الإنفاق'], rows: topCustomers.map((c) => [c.name, c.totalSpent || 0]) }])}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <table className="w-full text-xs">
            <thead><tr>{['#', 'العميل', 'إجمالي الإنفاق', 'النسبة من أعلى عميل'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
            <tbody>
              {topCustomers.map((c, i) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="tnum text-left p-2 text-slate-400">{i + 1}</td>
                  <td className="p-2 font-bold text-slate-800">{c.name}</td>
                  <td className="tnum text-left p-2 text-violet-700">{fmt(c.totalSpent || 0)}</td>
                  <td className="tnum text-left p-2 text-slate-500">{topCustomers[0]?.totalSpent ? (((c.totalSpent || 0) / topCustomers[0].totalSpent) * 100).toFixed(1) : '0'}%</td>
                </tr>
              ))}
              {!topCustomers.length && <tr><td colSpan={4} className="p-4 text-center text-slate-400">لا يوجد عملاء مسجلون</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'channels' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-amber-600" /> الصالة مقابل تطبيقات التوصيل شهرياً</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير قنوات البيع', [
              { title: 'المقارنة الشهرية', header: ['الشهر', 'الصالة (صافي)', 'التوصيل (صافي)', 'حصة التوصيل %'], rows: channelsMonthly.map((c) => [c.name, c.صالة, c.توصيل, c.صالة + c.توصيل ? Number(((c.توصيل / (c.صالة + c.توصيل)) * 100).toFixed(1)) : 0]) },
              { title: 'الإجمالي', header: ['القناة', 'الصافي'], rows: [['الصالة', channelTotals.صالة], ['التوصيل', channelTotals.توصيل]] },
            ], '#ra-channels')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div id="ra-channels" className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelsMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="صالة" stackId="a" fill="#6366f1" />
                <Bar dataKey="توصيل" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 pb-4">
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">صافي الصالة</span><strong className="font-mono text-indigo-700">{fmtMoney(channelTotals.صالة)}</strong></Card>
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">صافي التوصيل (بعد العمولة)</span><strong className="font-mono text-amber-700">{fmtMoney(channelTotals.توصيل)}</strong></Card>
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">حصة التوصيل</span><strong className="font-mono">{channelTotals.صالة + channelTotals.توصيل ? ((channelTotals.توصيل / (channelTotals.صالة + channelTotals.توصيل)) * 100).toFixed(1) : '0'}%</strong></Card>
          </div>
        </Card>
      )}

      {tab === 'expenses' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-rose-600" /> المصروفات التشغيلية المدفوعة حسب التصنيف</h3>
            <Btn tone="ghost" onClick={() => printSection('تحليل المصروفات حسب التصنيف', [
              { title: 'المصروفات حسب التصنيف', header: ['التصنيف', 'المبلغ', 'النسبة %'], rows: expenseByCat.map((c) => [c.name, c.value, expenseTotal ? Number(((c.value / expenseTotal) * 100).toFixed(1)) : 0]) },
            ], '#ra-expenses')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div id="ra-expenses" className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={expenseByCat.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {expenseByCat.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <table className="w-full text-xs">
              <thead><tr>{['التصنيف', 'المبلغ', '%'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
              <tbody>
                {expenseByCat.map((c) => (
                  <tr key={c.name} className="border-b border-slate-50">
                    <td className="p-2 font-bold text-slate-700">{c.name}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmt(c.value)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{expenseTotal ? ((c.value / expenseTotal) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'branches' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm">أداء الفروع المقارن — {periodLabel}</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير أداء الفروع', [
              { title: 'مقارنة الفروع', header: ['الفرع', 'الصافي', 'التكلفة', 'FC %', 'الطلبات', 'متوسط الفاتورة', 'الحصة %'], rows: branchPerf.map((b) => [b.name, b.net, b.cost, Number(b.fcPct.toFixed(1)), b.orders, Number(b.avgTicket.toFixed(0)), branchTotalNet ? Number(((b.net / branchTotalNet) * 100).toFixed(1)) : 0]) },
            ], '#ra-branches')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div id="ra-branches" className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={branchPerf.map((b) => ({ name: b.name, الصافي: b.net, التكلفة: b.cost }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="الصافي" fill="#6366f1" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmtNum(Number(v), 0) }} />
                <Bar dataKey="التكلفة" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs">
            <thead><tr>{['الفرع', 'المنطقة', 'صافي المبيعات', 'تكلفة الطعام', 'FC %', 'عدد الطلبات', 'متوسط الفاتورة', 'الحصة من الإجمالي'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
            <tbody>
              {regionTotals.length > 1 && (
                <tr className="bg-indigo-50/70">
                  <td colSpan={8} className="p-2 font-extrabold text-indigo-900 text-[11px]">إجماليات المناطق — {regionTotals.map((rg) => `${rg.name}: ${fmt(rg.net)} (${rg.branches} فرع)`).join(' · ')}</td>
                </tr>
              )}
              {branchPerf.map((b, i) => (
                <tr key={b.id} className={`border-b border-slate-50 hover:bg-slate-50 ${i === 0 && branchPerf.length > 1 ? 'bg-emerald-50/50' : ''}`}>
                  <td className="p-2 font-bold text-slate-800">{b.name}</td>
                  <td className="p-2 text-[11px] font-bold text-indigo-700">{b.region}</td>
                  <td className="tnum text-left p-2 text-indigo-700">{fmt(b.net)}</td>
                  <td className="tnum text-left p-2 text-slate-500">{fmt(b.cost)}</td>
                  <td className={`p-2 font-mono ${b.fcPct > 40 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{b.fcPct.toFixed(1)}%</td>
                  <td className="tnum text-left p-2">{fmtNum(b.orders, 0)}</td>
                  <td className="tnum text-left p-2">{fmt(b.avgTicket)}</td>
                  <td className="tnum text-left p-2 text-slate-500">{branchTotalNet ? ((b.net / branchTotalNet) * 100).toFixed(1) : '0'}%</td>
                </tr>
              ))}
              <tr className="bg-slate-900 text-white font-extrabold">
                <td className="p-2" colSpan={2}>إجمالي الشركة</td>
                <td className="tnum text-left p-2">{fmt(companyTotal.net)}</td>
                <td className="tnum text-left p-2">{fmt(companyTotal.cost)}</td>
                <td className="tnum text-left p-2">{companyTotal.net ? ((companyTotal.cost / companyTotal.net) * 100).toFixed(1) : '0'}%</td>
                <td className="tnum text-left p-2">{fmtNum(companyTotal.orders, 0)}</td>
                <td className="tnum text-left p-2">{companyTotal.orders ? fmt(companyTotal.net / companyTotal.orders) : '—'}</td>
                <td className="tnum text-left p-2">100%</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'purchasing' && (
        <>
          <Card className="overflow-x-auto">
            <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
              <h3 className="font-extrabold text-slate-800 text-sm">أداء الموردين — أوامر الشراء خلال {periodLabel}</h3>
              <Btn tone="ghost" onClick={() => printSection('تحليلات المشتريات والموردين', [
                { title: 'أداء الموردين', header: ['المورد', 'الأوامر', 'إجمالي القيمة', 'متوسط الأمر', 'نسبة اكتمال الاستلام %'], rows: poAnalysis.suppliers.map((s) => [s.name, s.count, s.total, Number(s.avgOrder.toFixed(0)), Number(s.fillPct.toFixed(1))]) },
                { title: 'انحراف الاستلام حسب الصنف', header: ['الصنف', 'المطلوب', 'المستلم', 'العجز', 'نسبة الاستلام %'], rows: poAnalysis.materials.map((mm) => [mm.name, Number(mm.ordered.toFixed(2)), Number(mm.received.toFixed(2)), Number(mm.shortfall.toFixed(2)), Number(mm.receivedPct.toFixed(1))]) },
              ])}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
            <table className="w-full text-xs">
              <thead><tr>{['المورد', 'عدد الأوامر', 'إجمالي القيمة', 'متوسط قيمة الأمر', 'اكتمال الاستلام'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
              <tbody>
                {poAnalysis.suppliers.map((s) => (
                  <tr key={s.name} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-800">{s.name}</td>
                    <td className="tnum text-left p-2">{fmtNum(s.count, 0)}</td>
                    <td className="tnum text-left p-2 text-indigo-700">{fmt(s.total)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(s.avgOrder)}</td>
                    <td className={`p-2 font-mono ${s.fillPct >= 95 ? 'text-emerald-600' : s.fillPct >= 80 ? 'text-amber-600' : 'text-rose-600 font-bold'}`}>{s.fillPct.toFixed(1)}%</td>
                  </tr>
                ))}
                {!poAnalysis.suppliers.length && <tr><td colSpan={5} className="p-4 text-center text-slate-400">لا توجد أوامر شراء في هذه الفترة</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto">
            <div className="p-4 pb-2 font-extrabold text-slate-800 text-sm">انحراف الاستلام حسب الصنف (أعلى عجزاً)</div>
            <table className="w-full text-xs">
              <thead><tr>{['الصنف', 'المطلوب', 'المستلم', 'العجز', 'نسبة الاستلام'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
              <tbody>
                {poAnalysis.materials.slice(0, 15).map((mm) => (
                  <tr key={mm.name} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-700">{mm.name}</td>
                    <td className="tnum text-left p-2">{fmt(mm.ordered)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(mm.received)}</td>
                    <td className={`p-2 font-mono ${mm.shortfall > 0.01 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{fmt(mm.shortfall)}</td>
                    <td className={`p-2 font-mono ${mm.receivedPct >= 95 ? 'text-emerald-600' : mm.receivedPct >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>{mm.receivedPct.toFixed(1)}%</td>
                  </tr>
                ))}
                {!poAnalysis.materials.length && <tr><td colSpan={5} className="p-4 text-center text-slate-400">لا توجد أصناف مطلوبة في هذه الفترة</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'forecast' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm">التوقعات الذكية للشهر القادم</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير التوقعات الذكية', [
              { title: 'مؤشرات التوقع', header: ['المؤشر', 'القيمة'], rows: [['نمو آخر شهر %', Number(forecast.momGrowth.toFixed(1))], ['متوسط 3 أشهر مرجح', forecast.wAvgNet], ['انحدار خطي (آخر 6 أشهر)', forecast.regressionNext], ['ميل الاتجاه الشهري', forecast.trendSlope], ['التوقع المدمج للشهر القادم', forecast.blended]] },
              { title: 'السجل الشهري', header: ['الشهر', 'الإيراد', 'التكلفة', 'المصروفات', 'الربح'], rows: monthlyTrend.map((r) => [r.name, r.إيراد, r.تكلفة, r.مصروفات, r.ربح]) },
            ], '#ra-forecast')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pb-3">
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">نمو آخر شهر</span><strong className={`font-mono ${forecast.momGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{forecast.momGrowth.toFixed(1)}%</strong></Card>
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">متوسط 3 أشهر مرجّح</span><strong className="font-mono text-indigo-700">{fmtMoney(forecast.wAvgNet)}</strong></Card>
            <Card className="!p-3"><span className="text-[10px] text-slate-500 block">انحدار خطي (آخر 6 أشهر)</span><strong className="font-mono text-cyan-700">{fmtMoney(forecast.regressionNext)}</strong></Card>
            <Card className="!p-3 bg-gradient-to-l from-indigo-50 to-white"><span className="text-[10px] text-slate-500 block">التوقع المدمج للشهر القادم</span><strong className="font-mono text-indigo-800 text-base">{fmtMoney(forecast.blended)}</strong></Card>
          </div>
          <div id="ra-forecast" className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[...monthlyTrend.slice(-6).map((r) => ({ name: r.name, فعلي: r.إيراد })), { name: `توقع (${forecast.lastMonth}+1)`, فعلي: forecast.blended }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Bar dataKey="فعلي" radius={[6, 6, 0, 0]}>
                  {monthlyTrend.slice(-6).map((_, i) => <Cell key={i} fill="#6366f1" />)}
                  <Cell fill="#10b981" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-4 text-[11px] text-slate-500 leading-relaxed">
            المنهجية: التوقع المدمج = متوسط بين «الانحدار الخطي البسيط على آخر 6 أشهر» و«المتوسط المرجّح لآخر 3 أشهر (20/30/50%)». الأرقام استرشادية وتتأثر بالموسمية والعروض.
          </p>
        </Card>
      )}
      {tab === 'categories' && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between flex-wrap gap-2 p-4 pb-2">
            <h3 className="font-extrabold text-slate-800 text-sm">مزيج التصنيفات — الإيراد والهامش حسب فئة الطبق</h3>
            <Btn tone="ghost" onClick={() => printSection('تقرير مزيج التصنيفات', [
              { title: 'التصنيفات', header: ['التصنيف', 'الإيراد', 'الهامش', 'الهامش %'], rows: categoryMix.map((c) => [c.name, c.الإيراد, c.الهامش, c.هامشPct]) },
            ], '#ra-cats')}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div id="ra-cats" className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryMix} dataKey="الإيراد" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {categoryMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryMix} margin={{ top: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => fmt(Number(v), 0)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="الإيراد" fill="#6366f1" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmtNum(Number(v), 0) }} />
                <Bar dataKey="الهامش" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-xs">
            <thead><tr>{['التصنيف', 'الإيراد', 'الهامش', 'الهامش %'].map((h) => <th key={h} className="p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50">{h}</th>)}</tr></thead>
            <tbody>
              {categoryMix.map((c) => (
                <tr key={c.name} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-800">{c.name}</td>
                  <td className="tnum text-left p-2 text-indigo-700">{fmt(c.الإيراد)}</td>
                  <td className="tnum text-left p-2 text-emerald-700">{fmt(c.الهامش)}</td>
                  <td className={`p-2 font-mono ${c.هامشPct >= 60 ? 'text-emerald-600' : c.هامشPct >= 40 ? 'text-amber-600' : 'text-rose-600 font-bold'}`}>{c.هامشPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
