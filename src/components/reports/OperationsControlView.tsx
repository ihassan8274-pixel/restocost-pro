import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarClock, ClipboardCheck, FileSpreadsheet,
  PackageSearch, Printer, Scale, ShoppingCart,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { Btn, Card, Field, PageHeader, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import {
  categoryLabel, VAT_RATE, downloadCSV, fmt, fmtMoney, monthLabel, netOfGross,
} from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { lastSupplierIdFor } from '../../business/purchaseRequests';

const PIE_COLORS = ['#6366f1', '#f59e0b', '#06b6d4', '#f43f5e', '#10b981', '#8b5cf6', '#0ea5e9', '#64748b'];
const WASTE_TARGET_PCT = 2;

const pctTxt = (v: number) => `${v.toFixed(2)}%`;
const round2 = (v: number) => Number(v.toFixed(2));
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const daysAgo = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

type TabId = 'reorder' | 'abc' | 'accuracy' | 'price' | 'waste' | 'expiry';

const TABS: { id: string; label: string }[] = [
  { id: 'reorder', label: 'الطلب وإعادة الشراء' },
  { id: 'abc', label: 'تحليل ABC والراكد' },
  { id: 'accuracy', label: 'دقة الجرد والفروقات' },
  { id: 'price', label: 'انحرافات الأسعار' },
  { id: 'waste', label: 'رقابة الهالك' },
  { id: 'expiry', label: 'الصلاحية والجودة' },
];

interface ReorderRow {
  branchId: string; branchName: string; matId: string; name: string; category: string;
  unit: string; supplierId: string;
  stock: number; onOrder: number; min: number; max: number; full: boolean; override: boolean;
  suggested: number; stdPrice: number; value: number;
  priority: 'out' | 'critical' | 'low';
}

const Kpi: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-indigo-700' }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
    <div className="text-[10px] font-bold text-slate-500 mb-1">{label}</div>
    <div className={`text-sm font-extrabold font-mono ${tone}`}>{value}</div>
  </div>
);

const PrioBadge: React.FC<{ p: 'out' | 'critical' | 'low' }> = ({ p }) => {
  const styles = {
    out: 'bg-rose-100 text-rose-700 border-rose-200',
    critical: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-sky-100 text-sky-700 border-sky-200',
  } as const;
  const labels = { out: 'نافد', critical: 'حرج', low: 'تحت الحد' } as const;
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${styles[p]}`}>{labels[p]}</span>;
};

export const OperationsControlView: React.FC = () => {
  const {
    branches, suppliers, rawMaterials, inventory, grnNotes, purchaseOrders,
    dailyCounts, wastageLogs, posOrders, batchSalesRecords,
    getStockLevelsFor, getBranchName, addPurchaseOrder, showToast, materialCategories, getBranchAverageUnitCost,
  } = useApp();

  const [tab, setTab] = useState<TabId>('reorder');
  const [branchSel, setBranchSel] = useState('');

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);

  /* ===== أساس صافي المبيعات (بدون ضريبة) لنسب الهالك ===== */
  const netSales = useMemo(
    () => posOrders.reduce((s, o) => s + o.subtotal, 0)
      + batchSalesRecords.reduce((s, b) => s + (b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE)), 0),
    [posOrders, batchSalesRecords],
  );

  /* ================= 1) الطلب وإعادة الشراء ================= */
  const reorderRows = useMemo<ReorderRow[]>(() => {
    const out: ReorderRow[] = [];
    const activeMats = rawMaterials.filter((m) => m.isActive);
    const onOrderMap = new Map<string, number>();
    purchaseOrders.forEach((po) => {
      if (po.status === 'received' || po.status === 'cancelled' || po.status === 'rejected') return;
      po.items.forEach((it) => {
        const key = `${po.branchId}__${it.rawMaterialId}`;
        onOrderMap.set(key, (onOrderMap.get(key) || 0) + Math.max(0, it.quantity - (it.receivedQty || 0)));
      });
    });
    branches.forEach((b) => {
      activeMats.forEach((m) => {
        const lv = getStockLevelsFor(m.id, b.id);
        if (lv.maxStockLevel <= 0) return;
        const stock = inventory.reduce((s, i) => (i.branchId === b.id && i.rawMaterialId === m.id ? s + i.quantity : s), 0);
        const onOrder = onOrderMap.get(`${b.id}__${m.id}`) || 0;
        if (!lv.alwaysOrderFullMax && stock > lv.minStockLevel) return;
        const suggested = Math.max(0, round2(lv.maxStockLevel - stock - onOrder));
        if (suggested <= 0) return;
        const ratio = lv.minStockLevel > 0 ? stock / lv.minStockLevel : 0;
        out.push({
          branchId: b.id, branchName: getBranchName(b.id),
          matId: m.id, name: m.nameAr, category: categoryLabel(m.category, materialCategories), unit: m.unit,
          supplierId: lastSupplierIdFor(grnNotes, m.id, m.supplierId),
          stock: round2(stock), onOrder: round2(onOrder),
          min: lv.minStockLevel, max: lv.maxStockLevel, full: lv.alwaysOrderFullMax, override: lv.isOverride,
          suggested, stdPrice: m.standardPrice,
          value: round2(suggested * m.standardPrice),
          priority: stock <= 0 ? 'out' : ratio <= 0.5 ? 'critical' : 'low',
        });
      });
    });
    return out.sort((a, b) => b.value - a.value);
  }, [branches, rawMaterials, inventory, purchaseOrders, getStockLevelsFor, getBranchName, grnNotes]);

  const scopedReorder = useMemo(
    () => (branchSel ? reorderRows.filter((r) => r.branchId === branchSel) : reorderRows),
    [reorderRows, branchSel],
  );

  const reorderPie = useMemo(() => {
    const byCat = new Map<string, number>();
    scopedReorder.forEach((r) => byCat.set(r.category, (byCat.get(r.category) || 0) + r.value));
    const arr = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    if (arr.length > 7) {
      const rest = arr.slice(7).reduce((s, x) => s + x.value, 0);
      return [...arr.slice(0, 7), { name: 'أخرى', value: rest }];
    }
    return arr;
  }, [scopedReorder]);

  const generateDraftPOs = () => {
    if (!branchSel) { showToast('اختر الفرع أولاً لإنشاء أوامر الشراء'); return; }
    const rows = reorderRows.filter((r) => r.branchId === branchSel && r.suggested > 0);
    if (!rows.length) { showToast('لا توجد أصناف تحتاج طلباً في هذا الفرع'); return; }
    const bySupplier = new Map<string, ReorderRow[]>();
    rows.forEach((r) => {
      const arr = bySupplier.get(r.supplierId) || [];
      arr.push(r);
      bySupplier.set(r.supplierId, arr);
    });
    let created = 0;
    let totalVal = 0;
    bySupplier.forEach((items, supplierId) => {
      addPurchaseOrder({
        supplierId,
        supplierName: suppliers.find((s) => s.id === supplierId)?.name || 'مورد غير محدد',
        branchId: branchSel,
        orderDate: isoDaysFromNow(0),
        expectedDate: isoDaysFromNow(3),
        status: 'draft',
        items: items.map((r) => ({
          rawMaterialId: r.matId, materialName: r.name,
          quantity: r.suggested, unit: r.unit,
          unitPrice: round2(r.stdPrice), lineTotal: round2(r.suggested * r.stdPrice),
        })),
        totalAmount: round2(items.reduce((s, r) => s + r.suggested * r.stdPrice, 0)),
        requestedBy: 'مركز الرقابة التشغيلية',
        notes: 'مسودة آلية بناءً على حدود المخزون للفرع',
      });
      created += 1;
      totalVal += items.reduce((s, r) => s + r.value, 0);
    });
    showToast(`تم إنشاء ${created} مسودة أمر شراء بقيمة ${fmtMoney(totalVal)} — راجعها في شاشة أوامر الشراء`);
  };

  /* ================= 2) تحليل ABC + الراكد ================= */
  const abcRows = useMemo(() => {
    const usage = new Map<string, number>();
    dailyCounts.forEach((c) => c.items.forEach((it) => {
      usage.set(it.rawMaterialId, (usage.get(it.rawMaterialId) || 0) + (it.consumedValue || it.consumedQty * (it.unitCost || 0)));
    }));
    type Entry = { id: string; name: string; unit: string; val: number };
    const entries: Entry[] = [];
    usage.forEach((val, id) => {
      const m = matById.get(id);
      if (m) entries.push({ id, name: m.nameAr, unit: m.unit, val });
    });
    entries.sort((a, b) => b.val - a.val);
    const total = entries.reduce((s, e) => s + e.val, 0);
    let cum = 0;
    return entries.map((e) => {
      cum += e.val;
      const cumPct = total ? (cum / total) * 100 : 0;
      const cls = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C';
      return {
        ...e, share: total ? (e.val / total) * 100 : 0, cumPct, cls,
        cycle: cls === 'A' ? 'جرد أسبوعي' : cls === 'B' ? 'جرد نصف شهري' : 'جرد شهري',
      };
    });
  }, [dailyCounts, matById]);
  const abcTotalValue = abcRows.reduce((s, r) => s + r.val, 0);
  const classCount = (c: string) => abcRows.filter((r) => r.cls === c).length;

  const deadRows = useMemo(() => {
    const used = new Set<string>();
    dailyCounts.forEach((c) => c.items.forEach((it) => used.add(it.rawMaterialId)));
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => g.items.forEach((it) => used.add(it.rawMaterialId)));
    return rawMaterials
      .filter((m) => m.isActive && !used.has(m.id))
      .map((m) => ({
        id: m.id, name: m.nameAr, cat: categoryLabel(m.category, materialCategories), unit: m.unit,
        stockVal: inventory.reduce((s, i) => (i.rawMaterialId === m.id ? s + i.quantity * getBranchAverageUnitCost(i.branchId, m.id) : s), 0),
      }))
      .filter((r) => r.stockVal > 0)
      .sort((a, b) => b.stockVal - a.stockVal);
  }, [dailyCounts, grnNotes, rawMaterials, inventory, getBranchAverageUnitCost]);
  const deadTotal = deadRows.reduce((s, r) => s + r.stockVal, 0);

  /* ================= 3) دقة الجرد والفروقات ================= */
  const accData = useMemo(() => {
    type V = { date: string; branch: string; name: string; unit: string; theo: number; counted: number; varQ: number; cost: number };
    const rows: V[] = [];
    let theoVal = 0;
    let varVal = 0;
    dailyCounts.forEach((c) => c.items.forEach((it) => {
      theoVal += Math.abs(it.theoreticalQty * (it.unitCost || 0));
      const varQ = round2(it.theoreticalQty - it.countedQty);
      if (Math.abs(varQ) < 1e-9) return;
      varVal += Math.abs(varQ * (it.unitCost || 0));
      rows.push({
        date: c.date, branch: getBranchName(c.branchId), name: it.itemName, unit: it.unit,
        theo: it.theoreticalQty, counted: it.countedQty, varQ,
        cost: Math.abs(round2(varQ * (it.unitCost || 0))),
      });
    }));
    rows.sort((a, b) => b.cost - a.cost);
    return {
      rows,
      loss: rows.filter((r) => r.varQ > 0).reduce((s, r) => s + r.cost, 0),
      gain: rows.filter((r) => r.varQ < 0).reduce((s, r) => s + r.cost, 0),
      accuracyPct: theoVal > 0 ? 100 - (varVal / theoVal) * 100 : 100,
    };
  }, [dailyCounts, getBranchName]);

  /* ================= 4) انحرافات أسعار المشتريات ================= */
  const priceData = useMemo(() => {
    type P = { grn: string; date: string; supplier: string; name: string; qty: number; std: number; act: number; diffPct: number; impact: number };
    const rows: P[] = [];
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => g.items.forEach((it) => {
      const m = matById.get(it.rawMaterialId);
      if (!m || m.standardPrice <= 0) return;
      const diffPct = ((it.unitPrice - m.standardPrice) / m.standardPrice) * 100;
      if (Math.abs(diffPct) < 0.01) return;
      rows.push({
        grn: g.grnNumber, date: g.date, supplier: g.supplierName, name: m.nameAr,
        qty: it.quantityReceived, std: m.standardPrice, act: it.unitPrice, diffPct,
        impact: round2((it.unitPrice - m.standardPrice) * it.quantityReceived),
      });
    }));
    rows.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    const over = rows.filter((r) => r.impact > 0).reduce((s, r) => s + r.impact, 0);
    const save = rows.filter((r) => r.impact < 0).reduce((s, r) => s + Math.abs(r.impact), 0);
    const byMat = new Map<string, number>();
    rows.forEach((r) => byMat.set(r.name, (byMat.get(r.name) || 0) + r.impact));
    const chart = Array.from(byMat.entries()).map(([name, impact]) => ({ name, impact: Number(impact.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 8);
    return { rows, over, save, net: over - save, chart, aboveStdCount: rows.filter((r) => r.diffPct > 5).length };
  }, [grnNotes, matById]);

  /* ================= 5) رقابة الهالك ================= */
  const wasteData = useMemo(() => {
    const total = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
    const pending = wastageLogs.filter((w) => !w.isApproved)
      .map((w) => ({ ...w, daysOld: daysAgo(w.date) }))
      .sort((a, b) => b.daysOld - a.daysOld);
    const topItems = new Map<string, number>();
    wastageLogs.forEach((w) => topItems.set(w.itemName, (topItems.get(w.itemName) || 0) + w.totalCostImpact));
    const top = Array.from(topItems.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const monthly = new Map<string, number>();
    wastageLogs.forEach((w) => monthly.set(w.date.slice(0, 7), (monthly.get(w.date.slice(0, 7)) || 0) + w.totalCostImpact));
    const trend = Array.from(monthly.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ name: monthLabel(k), value: Number(v.toFixed(2)) }));
    return {
      total,
      pctOfSales: netSales ? (total / netSales) * 100 : 0,
      pending, pendingValue: pending.reduce((s, w) => s + w.totalCostImpact, 0),
      top, trend,
    };
  }, [wastageLogs, netSales]);

  /* ================= 6) الصلاحية والجودة ================= */
  const expData = useMemo(() => {
    const today = isoDaysFromNow(0);
    const in7 = isoDaysFromNow(7);
    type E = { name: string; branch: string; qty: number; unit: string; value: number; expiry: string; daysLeft: number };
    const expired: E[] = [];
    const soon: E[] = [];
    inventory.forEach((i) => {
      if (!i.expiryDate || i.quantity <= 0) return;
      const m = matById.get(i.rawMaterialId);
      const daysLeft = Math.floor((new Date(i.expiryDate).getTime() - Date.now()) / 86400000);
      const row: E = {
        name: m?.nameAr || i.rawMaterialId, branch: getBranchName(i.branchId),
        qty: i.quantity, unit: m?.unit || '', value: round2(i.quantity * (m?.standardPrice || 0)),
        expiry: i.expiryDate, daysLeft,
      };
      if (i.expiryDate < today) expired.push(row);
      else if (i.expiryDate <= in7) soon.push(row);
    });
    expired.sort((a, b) => a.daysLeft - b.daysLeft);
    soon.sort((a, b) => a.daysLeft - b.daysLeft);
    const qualityFails: { grn: string; date: string; supplier: string; name: string; qty: number }[] = [];
    grnNotes.forEach((g) => g.items.forEach((it) => {
      if (!it.qualityPassed) qualityFails.push({ grn: g.grnNumber, date: g.date, supplier: g.supplierName, name: matById.get(it.rawMaterialId)?.nameAr || it.rawMaterialId, qty: it.quantityReceived });
    }));
    return {
      expired, soon,
      expiredValue: expired.reduce((s, r) => s + r.value, 0),
      soonValue: soon.reduce((s, r) => s + r.value, 0),
      qualityFails,
    };
  }, [inventory, grnNotes, matById, getBranchName]);

  /* ================= الطباعة و CSV ================= */
  const baseMeta: [string, string][] = [['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')]];
  const foot = 'مركز الرقابة التشغيلية — RestoCost ERP';

  const printReorder = () => openPrintWindow({
    title: 'خطة إعادة الطلب المقترحة',
    subtitle: branchSel ? `الفرع: ${getBranchName(branchSel)}` : 'كل الفروع',
    meta: baseMeta,
    tables: [{
      title: 'الأصناف تحت الحد الأدنى',
      header: ['الفرع', 'الصنف', 'الرصيد', 'الأدنى', 'الأقصى', 'قيد التوريد', 'الكمية المقترحة', 'القيمة', 'الأولوية'],
      rows: scopedReorder.map((r) => [r.branchName, `${r.name}${r.full ? ' (طلب كامل دائماً)' : ''}`, fmt(r.stock), fmt(r.min), fmt(r.max), fmt(r.onOrder), fmt(r.suggested), fmt(r.value), r.priority === 'out' ? 'نافد' : r.priority === 'critical' ? 'حرج' : 'تحت الحد']),
    }],
    totals: [['إجمالي قيمة الاقتراح', fmtMoney(scopedReorder.reduce((s, r) => s + r.value, 0))]],
    footer: foot,
  });

  const printAccuracy = () => openPrintWindow({
    title: 'تقرير فروقات الجرد',
    subtitle: `نسبة الدقة: ${accData.accuracyPct.toFixed(2)}%`,
    meta: baseMeta,
    tables: [{
      title: 'أكبر الفروقات',
      header: ['التاريخ', 'الفرع', 'الصنف', 'الكمية النظرية', 'المعدود', 'الفرق', 'الأثر المالي'],
      rows: accData.rows.slice(0, 50).map((r) => [r.date, r.branch, r.name, fmt(r.theo), fmt(r.counted), fmt(r.varQ), fmt(r.cost)]),
    }],
    totals: [['صافي الفاقد', fmtMoney(accData.loss - accData.gain)]],
    footer: foot,
  });

  const csvReorder = () => downloadCSV('خطة_إعادة_الطلب.csv',
    ['الفرع', 'الصنف', 'الفئة', 'الرصيد', 'الأدنى', 'الأقصى', 'قيد التوريد', 'المقترح', 'القيمة', 'الأولوية'],
    scopedReorder.map((r) => [r.branchName, r.name, r.category, r.stock.toFixed(2), r.min.toFixed(2), r.max.toFixed(2), r.onOrder.toFixed(2), r.suggested.toFixed(2), r.value.toFixed(2), r.priority]));

  const csvAccuracy = () => downloadCSV('فروقات_الجرد.csv',
    ['التاريخ', 'الفرع', 'الصنف', 'الوحدة', 'النظري', 'المعدود', 'الفرق', 'الأثر'],
    accData.rows.map((r) => [r.date, r.branch, r.name, r.unit, r.theo.toFixed(2), r.counted.toFixed(2), r.varQ.toFixed(2), r.cost.toFixed(2)]));

  const excelSheets = [
    { name: 'إعادة الطلب', header: ['الفرع', 'الصنف', 'الرصيد', 'الأدنى', 'الأقصى', 'قيد التوريد', 'المقترح', 'القيمة'], rows: reorderRows.map((r) => [r.branchName, r.name, r.stock, r.min, r.max, r.onOrder, r.suggested, r.value]) },
    { name: 'ABC والراكد', header: ['الصنف', 'قيمة الاستهلاك', 'الحصة %', 'تراكمي %', 'الفئة', 'دورية الجرد'], rows: abcRows.map((r) => [r.name, r.val, r.share, r.cumPct, r.cls, r.cycle]) },
    { name: 'فروقات الجرد', header: ['التاريخ', 'الفرع', 'الصنف', 'النظري', 'المعدود', 'الفرق', 'الأثر'], rows: accData.rows.map((r) => [r.date, r.branch, r.name, r.theo, r.counted, r.varQ, r.cost]) },
    { name: 'انحرافات الأسعار', header: ['الاستلام', 'التاريخ', 'المورد', 'الصنف', 'الكمية', 'المعياري', 'الفعلي', 'انحراف %', 'الأثر'], rows: priceData.rows.map((r) => [r.grn, r.date, r.supplier, r.name, r.qty, r.std, r.act, r.diffPct, r.impact]) },
    { name: 'الهالك بانتظار الاعتماد', header: ['التاريخ', 'الصنف', 'الكمية', 'القيمة', 'السبب', 'المسؤول', 'أيام الانتظار'], rows: wasteData.pending.map((w) => [w.date, w.itemName, w.quantity, w.totalCostImpact, w.reason, w.responsibleStaff, w.daysOld]) },
    { name: 'الصلاحية والجودة', header: ['النوع', 'الصنف', 'الفرع/المورد', 'الكمية', 'القيمة', 'التفاصيل'], rows: [
      ...expData.expired.map((r): (string | number)[] => ['منتهي', r.name, r.branch, r.qty, r.value, r.expiry]),
      ...expData.soon.map((r): (string | number)[] => [`ينتهي خلال ${r.daysLeft} يوم`, r.name, r.branch, r.qty, r.value, r.expiry]),
      ...expData.qualityFails.map((r): (string | number)[] => ['رفض جودة', r.name, r.supplier, r.qty, '', r.grn]),
    ] },
  ];

  const th = 'text-right py-2 px-2 font-bold whitespace-nowrap';
  const td = 'py-2 px-2 border-b border-slate-100 font-mono whitespace-nowrap';

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز الرقابة التشغيلية"
        subtitle="إعادة الطلب · تحليل ABC · دقة الجرد · انحرافات الأسعار · رقابة الهالك · الصلاحية والجودة"
        icon={<PackageSearch className="w-6 h-6 text-indigo-300" />}
        actions={<ViewToolbar filename="مركز_الرقابة_التشغيلية" sheets={excelSheets} />}
      />
      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

      {/* ================= الطلب وإعادة الشراء ================= */}
      {tab === 'reorder' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-indigo-500" /> خطة إعادة الطلب حسب حدود كل فرع</h3>
            <div className="flex gap-2 flex-wrap">
              <Btn tone="ghost" onClick={csvReorder}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
              <Btn tone="ghost" onClick={printReorder}><Printer className="w-4 h-4" /> طباعة</Btn>
              <Btn tone="primary" onClick={generateDraftPOs}><ShoppingCart className="w-4 h-4" /> إنشاء مسودات أوامر الشراء</Btn>
            </div>
          </div>
          <Field label="تصفية بالفرع (مطلوبة لإنشاء الأوامر)">
            <select value={branchSel} onChange={(e) => setBranchSel(e.target.value)} className={inputCls}>
              <option value="">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="أصناف تحت الحد" value={fmt(scopedReorder.length)} />
            <Kpi label="أصناف نافدة" value={fmt(scopedReorder.filter((r) => r.priority === 'out').length)} tone="text-rose-600" />
            <Kpi label="قيمة التغطية المقترحة" value={fmtMoney(scopedReorder.reduce((s, r) => s + r.value, 0))} tone="text-emerald-700" />
            <Kpi label="موردين معنيين" value={fmt(new Set(scopedReorder.map((r) => r.supplierId)).size)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={reorderPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                  {reorderPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 border-b-2 border-slate-200"><th className={th}>الفئة</th><th className={th}>القيمة المطلوبة</th></tr></thead>
                <tbody>
                  {reorderPie.map((p) => (
                    <tr key={p.name}><td className={`${td} font-bold`}>{p.name}</td><td className={td}>{fmtMoney(p.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['الفرع', 'الصنف', 'الرصيد', 'الأدنى', 'الأقصى', 'قيد التوريد', 'المقترح', 'القيمة', 'الأولوية'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {scopedReorder.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400 font-bold">لا توجد أصناف تحت الحد — المخزون مغطى</td></tr>}
                {scopedReorder.map((r) => (
                  <tr key={`${r.branchId}-${r.matId}`} className="hover:bg-slate-50">
                    <td className={`${td} font-bold text-slate-700`}>{r.branchName}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.name}{r.full && <span className="text-[9px] text-violet-600 mr-1">(طلب كامل دائماً)</span>}{r.override && <span className="text-[9px] text-indigo-600 mr-1">(حد مخصص)</span>}</td>
                    <td className={td}>{fmt(r.stock)} {r.unit}</td>
                    <td className={td}>{fmt(r.min)}</td>
                    <td className={td}>{fmt(r.max)}</td>
                    <td className={td}>{fmt(r.onOrder)}</td>
                    <td className={`${td} font-extrabold text-indigo-700`}>{fmt(r.suggested)}</td>
                    <td className={td}>{fmt(r.value)}</td>
                    <td className={td}><PrioBadge p={r.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= ABC والراكد ================= */}
      {tab === 'abc' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-sky-500" /> تصنيف ABC حسب قيمة الاستهلاك + رأس المال الراكد</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Kpi label="قيمة الاستهلاك الكلية" value={fmtMoney(abcTotalValue)} />
            <Kpi label={`فئة A (${classCount('A')} صنف)`} value={abcTotalValue ? pctTxt((abcRows.filter((r) => r.cls === 'A').reduce((s, r) => s + r.val, 0) / abcTotalValue) * 100) : '—'} tone="text-rose-600" />
            <Kpi label={`فئة B (${classCount('B')} صنف)`} value={abcTotalValue ? pctTxt((abcRows.filter((r) => r.cls === 'B').reduce((s, r) => s + r.val, 0) / abcTotalValue) * 100) : '—'} tone="text-amber-600" />
            <Kpi label={`فئة C (${classCount('C')} صنف)`} value={abcTotalValue ? pctTxt((abcRows.filter((r) => r.cls === 'C').reduce((s, r) => s + r.val, 0) / abcTotalValue) * 100) : '—'} tone="text-emerald-700" />
            <Kpi label="رأس مال راكد" value={fmtMoney(deadTotal)} tone="text-purple-700" />
          </div>
          {abcRows.length === 0 ? (
            <div className="text-center text-xs font-bold text-slate-400 py-6">لا توجد بيانات استهلاك من جرد يومي بعد — أدخل جرداً يومياً لبناء التصنيف</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={abcRows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                  <Bar dataKey="val" name="قيمة الاستهلاك" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }}>
                    {abcRows.slice(0, 10).map((r, i) => <Cell key={i} fill={r.cls === 'A' ? '#f43f5e' : r.cls === 'B' ? '#f59e0b' : '#10b981'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                    {['الصنف', 'قيمة الاستهلاك', 'الحصة %', 'تراكمي %', 'الفئة', 'دورية الجرد المقترحة'].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {abcRows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                        <td className={td}>{fmt(r.val)}</td>
                        <td className={td}>{pctTxt(r.share)}</td>
                        <td className={td}>{pctTxt(r.cumPct)}</td>
                        <td className={`${td} font-extrabold ${r.cls === 'A' ? 'text-rose-600' : r.cls === 'B' ? 'text-amber-600' : 'text-emerald-700'}`}>{r.cls}</td>
                        <td className={td}>{r.cycle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {deadRows.length > 0 && (
            <div>
              <div className="text-xs font-extrabold text-purple-700 mb-2">أصناف راكدة (بلا أي استهلاك أو استلام مسجل) — رأس مال مجمّد بقيمة {fmtMoney(deadTotal)}</div>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b border-slate-200"><th className={th}>الصنف</th><th className={th}>الفئة</th><th className={th}>قيمة الرصيد</th></tr></thead>
                  <tbody>
                    {deadRows.map((r) => (
                      <tr key={r.id}><td className={`${td} font-bold`}>{r.name}</td><td className={td}>{r.cat}</td><td className={`${td} text-purple-700 font-bold`}>{fmt(r.stockVal)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ================= دقة الجرد ================= */}
      {tab === 'accuracy' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-emerald-500" /> فروقات الجرد (النظري مقابل المعدود)</h3>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={csvAccuracy}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
              <Btn tone="primary" onClick={printAccuracy}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="نسبة دقة الجرد" value={pctTxt(accData.accuracyPct)} tone={accData.accuracyPct >= 98 ? 'text-emerald-700' : accData.accuracyPct >= 95 ? 'text-amber-600' : 'text-rose-600'} />
            <Kpi label="فاقد صافٍ" value={fmtMoney(Math.max(0, accData.loss - accData.gain))} tone="text-rose-600" />
            <Kpi label="زيادات مسجلة" value={fmtMoney(accData.gain)} tone="text-sky-700" />
            <Kpi label="سطور منحرفة" value={fmt(accData.rows.length)} />
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['التاريخ', 'الفرع', 'الصنف', 'الوحدة', 'النظري', 'المعدود', 'الفرق', 'الأثر المالي'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {accData.rows.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400 font-bold">لا توجد فروقات مسجلة</td></tr>}
                {accData.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className={td}>{r.date}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.branch}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{r.unit}</td>
                    <td className={td}>{fmt(r.theo)}</td>
                    <td className={td}>{fmt(r.counted)}</td>
                    <td className={`${td} font-bold ${r.varQ > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmt(r.varQ)}</td>
                    <td className={td}>{fmt(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= انحرافات الأسعار ================= */}
      {tab === 'price' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Scale className="w-4 h-4 text-amber-500" /> انحرافات أسعار الاستلام عن السعر المعياري</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="صافي أثر الانحراف" value={fmtMoney(priceData.net)} tone={priceData.net > 0 ? 'text-rose-600' : 'text-emerald-700'} />
            <Kpi label="إنفاق زائد" value={fmtMoney(priceData.over)} tone="text-rose-600" />
            <Kpi label="وفر محقق" value={fmtMoney(priceData.save)} tone="text-emerald-700" />
            <Kpi label="سطور فوق المعيار +5%" value={fmt(priceData.aboveStdCount)} tone="text-amber-600" />
          </div>
          {priceData.chart.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priceData.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} height={55} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                  <Bar dataKey="impact" name="أثر الانحراف" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }}>
                  {priceData.chart.map((d, i) => <Cell key={i} fill={d.impact > 0 ? '#f43f5e' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['الاستلام', 'التاريخ', 'المورد', 'الصنف', 'الكمية', 'المعياري', 'الفعلي', 'الانحراف %', 'الأثر'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {priceData.rows.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400 font-bold">لا انحرافات — الأسعار مطابقة للمعياري</td></tr>}
                {priceData.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className={td}>{r.grn}</td>
                    <td className={td}>{r.date}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.supplier}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{fmt(r.qty)}</td>
                    <td className={td}>{fmt(r.std)}</td>
                    <td className={td}>{fmt(r.act)}</td>
                    <td className={`${td} font-bold ${r.diffPct > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{pctTxt(r.diffPct)}</td>
                    <td className={`${td} font-extrabold ${r.impact > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(r.impact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= رقابة الهالك ================= */}
      {tab === 'waste' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> رقابة الهالك — المستهدف {WASTE_TARGET_PCT}% من صافي المبيعات</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="النسبة الحالية من الصافي" value={pctTxt(wasteData.pctOfSales)} tone={wasteData.pctOfSales <= WASTE_TARGET_PCT ? 'text-emerald-700' : 'text-rose-600'} />
            <Kpi label="إجمالي الهالك" value={fmtMoney(wasteData.total)} tone="text-rose-600" />
            <Kpi label="بانتظار الاعتماد" value={fmtMoney(wasteData.pendingValue)} tone="text-amber-600" />
            <Kpi label="أقدم انتظار" value={wasteData.pending.length ? `${wasteData.pending[0].daysOld} يوم` : '—'} tone="text-purple-700" />
          </div>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            {wasteData.trend.length > 0 && (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={wasteData.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                  <Bar dataKey="value" name="قيمة الهالك" fill="#f59e0b" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div>
              <div className="text-[11px] font-extrabold text-slate-600 mb-1">أكثر الأصناف إهداراً</div>
              <div className="overflow-x-auto max-h-52">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b border-slate-200"><th className={th}>الصنف</th><th className={th}>القيمة</th></tr></thead>
                  <tbody>
                    {wasteData.top.slice(0, 10).map((t) => (
                      <tr key={t.name}><td className={`${td} font-bold`}>{t.name}</td><td className={`${td} text-rose-600`}>{fmt(t.value)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold text-amber-700 mb-1">هوالك بانتظار الاعتماد ({wasteData.pending.length})</div>
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                  {['التاريخ', 'الصنف', 'الكمية', 'القيمة', 'السبب', 'المسؤول', 'أيام الانتظار'].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {wasteData.pending.length === 0 && <tr><td colSpan={7} className="text-center py-5 text-slate-400 font-bold">لا هوالك معلقة — كله معتمد</td></tr>}
                  {wasteData.pending.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className={td}>{w.date}</td>
                      <td className={`${td} font-bold text-slate-700`}>{w.itemName}</td>
                      <td className={td}>{fmt(w.quantity)} {w.unit}</td>
                      <td className={`${td} text-rose-600 font-bold`}>{fmt(w.totalCostImpact)}</td>
                      <td className={`${td} max-w-40 truncate`} title={w.reason}>{w.reason}</td>
                      <td className={td}>{w.responsibleStaff}</td>
                      <td className={`${td} font-bold ${w.daysOld > 2 ? 'text-rose-600' : 'text-amber-600'}`}>{w.daysOld}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* ================= الصلاحية والجودة ================= */}
      {tab === 'expiry' && (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-rose-500" /> الصلاحية وجودة الاستلام</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Kpi label="قيمة أصناف منتهية" value={fmtMoney(expData.expiredValue)} tone="text-rose-600" />
            <Kpi label="تنتهي خلال 7 أيام" value={fmtMoney(expData.soonValue)} tone="text-amber-600" />
            <Kpi label="رفض جودة في الاستلام" value={fmt(expData.qualityFails.length)} tone="text-purple-700" />
          </div>
          {[{ t: 'منتهية الصلاحية — يلزم الإتلاف وإثبات هالك', rows: expData.expired }, { t: 'تقترب من الانتهاء (خلال 7 أيام)', rows: expData.soon }].map((sec) => (
            sec.rows.length > 0 && (
              <div key={sec.t}>
                <div className="text-[11px] font-extrabold text-slate-600 mb-1">{sec.t}</div>
                <div className="overflow-x-auto max-h-52">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 border-b border-slate-200">{['الصنف', 'الفرع', 'الكمية', 'القيمة', 'تاريخ الانتهاء', 'متبقي (يوم)'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {sec.rows.map((r, i) => (
                        <tr key={i}>
                          <td className={`${td} font-bold`}>{r.name}</td>
                          <td className={td}>{r.branch}</td>
                          <td className={td}>{fmt(r.qty)} {r.unit}</td>
                          <td className={td}>{fmt(r.value)}</td>
                          <td className={td}>{r.expiry}</td>
                          <td className={`${td} font-bold ${r.daysLeft < 0 ? 'text-rose-600' : 'text-amber-600'}`}>{r.daysLeft}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ))}
          {expData.qualityFails.length > 0 && (
            <div>
              <div className="text-[11px] font-extrabold text-purple-700 mb-1">بنود مرفوضة فحص الجودة</div>
              <div className="overflow-x-auto max-h-44">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b border-slate-200">{['الاستلام', 'التاريخ', 'المورد', 'الصنف', 'الكمية'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {expData.qualityFails.map((r, i) => (
                      <tr key={i}><td className={td}>{r.grn}</td><td className={td}>{r.date}</td><td className={td}>{r.supplier}</td><td className={`${td} font-bold`}>{r.name}</td><td className={td}>{fmt(r.qty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {expData.expired.length === 0 && expData.soon.length === 0 && expData.qualityFails.length === 0 && (
            <div className="text-center text-xs font-bold text-slate-400 py-8">كل شيء سليم — لا منتهيات ولا رفض جودة</div>
          )}
        </Card>
      )}
    </div>
  );
};
