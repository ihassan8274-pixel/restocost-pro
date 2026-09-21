import React, { Fragment, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronLeft, Truck, Package, BarChart3, ClipboardList, ChevronsDownUp, ChevronsUpDown,
  FileSpreadsheet, FileDown, Printer, Loader2, Filter, BadgeCheck, TrendingUp, TrendingDown, CalendarRange, Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Btn } from '../ui';
import { fmt, fmtMoney, PO_STATUS_LABELS } from '../../utils/helpers';
import { exportPDF } from '../../utils/pdf';
import { openPrintWindow } from '../../utils/print';
import { GoodsReceiptNote } from '../../types';

type SectionId = 'po' | 'supplier' | 'article' | 'abc' | 'receiving' | 'deviation';

const DEV_THRESHOLD = 20;

const STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8', submitted: '#3b82f6', approved: '#10b981',
  partially_received: '#f59e0b', received: '#10b981', cancelled: '#ef4444', rejected: '#ef4444',
};
const STATUS_LINE_BG: Record<string, string> = {
  draft: '', submitted: 'bg-blue-50/60', approved: '', partially_received: 'bg-amber-50/60',
  received: '', cancelled: 'bg-rose-50/60', rejected: 'bg-rose-50/60',
};

const ABC_CLASS: Record<string, string> = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-amber-100 text-amber-700', C: 'bg-slate-100 text-slate-600' };

export const PurchasesReportView: React.FC = () => {
  const {
    grnNotes, purchaseOrders, rawMaterials, branches, getBranchName, getRawMaterialName,
  } = useApp();

  const [branchSel, setBranchSel] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    po: true, supplier: true, article: true, abc: true, receiving: false, deviation: true,
  });
  const [onlyDev, setOnlyDev] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [pdfBusy, setPdfBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [itemSel, setItemSel] = useState<string[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const fmtDate = (d?: string) => (d || '').slice(0, 10);
  const inRange = (d?: string) => {
    const dd = fmtDate(d);
    if (!dd) return true;
    return (!from || dd >= from) && (!to || dd <= to);
  };
  const inBranch = (id?: string) => branchSel.length === 0 || (id ? branchSel.includes(id) : false);

  const branchLabel = () => {
    if (branchSel.length === 0) return 'كل الفروع';
    if (branchSel.length === 1) return getBranchName(branchSel[0]);
    return `${branchSel.length} فروع`;
  };
  const toggleBranch = (id: string) =>
    setBranchSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const srcGrns = useMemo(
    () => grnNotes
      .filter((g) => g.status === 'approved' && inBranch(g.branchId) && inRange(g.invoiceDate || g.date))
      .sort((a, b) => (a.invoiceDate || a.date).localeCompare(b.invoiceDate || b.date) || (a.supplierName || '').localeCompare(b.supplierName || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grnNotes, branchSel, from, to]
  );

  const srcPos = useMemo(
    () => purchaseOrders
      .filter((p) => p.status !== 'cancelled' && p.status !== 'rejected')
      .filter((p) => inBranch(p.branchId) && inRange(p.orderDate))
      .sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || '') || (a.supplierName || '').localeCompare(b.supplierName || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchaseOrders, branchSel, from, to]
  );

  // الأصناف المتوفرة في الفترة الحالية (قبل فلتر الأصناف) — لاختيار أصناف محددة للعرض/الطباعة
  const itemOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string; unit: string }>();
    const add = (rmId?: string) => {
      if (!rmId) return;
      if (m.has(rmId)) return;
      const mat = rawMaterials.find((x) => x.id === rmId);
      m.set(rmId, {
        id: rmId, name: mat?.nameAr || getRawMaterialName(rmId),
        code: mat?.code || '', unit: mat?.purchaseUnit || mat?.unit || '',
      });
    };
    srcGrns.forEach((g) => g.items.forEach((i) => add(i.rawMaterialId)));
    srcPos.forEach((p) => p.items.forEach((i) => add(i.rawMaterialId)));
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [srcGrns, srcPos, rawMaterials, getRawMaterialName]);

  // عند اختيار أصناف محددة يُقتصر التقرير إجمالاً (وبالتالي الطباعة والتصدير) على فواتير/أوامر هذه الأصناف فقط
  const approvedGrns = useMemo(
    () => (itemSel.length === 0 ? srcGrns : srcGrns.filter((g) => g.items.some((i) => itemSel.includes(i.rawMaterialId)))),
    [srcGrns, itemSel]
  );
  const approvedPos = useMemo(
    () => (itemSel.length === 0 ? srcPos : srcPos.filter((p) => p.items.some((i) => itemSel.includes(i.rawMaterialId)))),
    [srcPos, itemSel]
  );

  const itemLabel = () => itemOptions.filter((o) => itemSel.includes(o.id)).map((o) => o.name).join('، ');
  const itemNote = () => {
    if (itemSel.length === 0) return '';
    const names = itemOptions.filter((o) => itemSel.includes(o.id)).map((o) => o.name);
    return ` · الأصناف المحددة: ${names.join('، ') || (itemSel.length + ' صنف')}`;
  };
  const toggleItem = (id: string) => setItemSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const grnNet = (g: GoodsReceiptNote) => Number((g.totalAmount - (g.vatAmount || 0)).toFixed(2));
  const vat = (g: GoodsReceiptNote) => g.vatAmount || 0;

  // ---------- قسم 1: أوامر الشراء مجمعة حسب المورد ----------
  const poBySupplier = useMemo(() => {
    const m = new Map<string, { name: string; items: typeof purchaseOrders }>();
    approvedPos.forEach((p) => {
      const k = p.supplierName || p.supplierId || 'بدون مورد';
      if (!m.has(k)) m.set(k, { name: k, items: [] });
      m.get(k)!.items.push(p);
    });
    return Array.from(m.values());
  }, [approvedPos]);

  // ---------- قسم 2: إحصائيات الموردين (فواتير مجمعة لكل مورد) ----------
  const supplierStats = useMemo(() => {
    const m = new Map<string, { name: string; invoices: GoodsReceiptNote[]; net: number; vat: number; gross: number }>();
    approvedGrns.forEach((g) => {
      const k = g.supplierName || g.supplierId || 'بدون مورد';
      if (!m.has(k)) m.set(k, { name: k, invoices: [], net: 0, vat: 0, gross: 0 });
      const e = m.get(k)!;
      e.invoices.push(g);
      e.net += grnNet(g); e.vat += vat(g); e.gross += g.totalAmount;
    });
    return Array.from(m.values()).map((e) => ({ ...e, net: Number(e.net.toFixed(2)), vat: Number(e.vat.toFixed(2)), gross: Number(e.gross.toFixed(2)) }));
  }, [approvedGrns]);

  // ---------- قسم 3: إحصائيات الصنف (كل صنف بفواتيره مرتبة بتاريخ الشراء) ----------
  const articleStats = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string; unit: string; rows: { date: string; invoice: string; supplier: string; branchId: string; qty: number; price: number; gross: number }[]; qty: number; value: number }>();
    approvedGrns.forEach((g) => {
      g.items.forEach((it) => {
        if (!it.rawMaterialId || !(it.quantityReceived > 0)) return;
        const mat = rawMaterials.find((x) => x.id === it.rawMaterialId);
        const conv = mat?.purchaseUnitConversion && mat.purchaseUnitConversion > 0 ? mat.purchaseUnitConversion : 1;
        const qtyPU = it.quantityReceived / conv;
        const pricePU = (it.unitPrice || 0) * conv;
        if (!m.has(it.rawMaterialId)) m.set(it.rawMaterialId, {
          id: it.rawMaterialId, name: mat?.nameAr || getRawMaterialName(it.rawMaterialId), code: mat?.code || '',
          unit: mat?.purchaseUnit || mat?.unit || '', rows: [], qty: 0, value: 0,
        });
        const e = m.get(it.rawMaterialId)!;
        e.rows.push({
          date: g.invoiceDate || g.date, invoice: g.invoiceNumber || g.grnNumber, supplier: g.supplierName || g.supplierId,
          branchId: g.branchId, qty: Number(qtyPU.toFixed(2)), price: Number(pricePU.toFixed(2)),
          gross: Number((qtyPU * pricePU).toFixed(2)),
        });
        e.qty += qtyPU;
        e.value += Number((qtyPU * pricePU).toFixed(2));
      });
    });
    return Array.from(m.values())
      .map((e) => ({
        ...e,
        rows: [...e.rows].sort((a, b) => a.date.localeCompare(b.date)),
        qty: Number(e.qty.toFixed(2)), value: Number(e.value.toFixed(2)), avg: Number((e.value / Math.max(1, e.qty)).toFixed(2)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [approvedGrns, rawMaterials, getRawMaterialName]);

  // ---------- قسم 4: تحليل ABC (حسب القيمة بترتيب تنازلي) ----------
  const abc = useMemo(() => {
    const byValue = [...articleStats].sort((a, b) => b.value - a.value);
    const total = byValue.reduce((s, a) => s + a.value, 0);
    let cum = 0;
    return byValue.map((a, i) => {
      cum += a.value;
      const cumPct = total ? (cum / total) * 100 : 0;
      const cls = cumPct <= 70 ? 'A' : cumPct <= 90 ? 'B' : 'C';
      return {
        rank: i + 1, name: a.name, code: a.code, unit: a.unit,
        pctNo: total ? (a.value / total) * 100 : 0,
        value: a.value, cumPct,
        cls, qty: a.qty,
      };
    });
  }, [articleStats]);

  // ---------- قسم 5: الاستلام وفحص الجودة ----------
  const receivSummary = useMemo(() => {
    const m = new Map<string, { name: string; count: number; qOk: number; qAll: number; net: number; haccp: number }>();
    approvedGrns.forEach((g) => {
      const k = g.supplierName || g.supplierId || 'بدون مورد';
      if (!m.has(k)) m.set(k, { name: k, count: 0, qOk: 0, qAll: 0, net: 0, haccp: 0 });
      const e = m.get(k)!;
      e.count++; e.net += grnNet(g);
      g.items.forEach((it) => { e.qAll++; if (it.qualityPassed) e.qOk++; if (it.batchNumber || it.expiryDate) e.haccp++; });
    });
    return Array.from(m.values()).map((e) => ({
      ...e,
      net: Number(e.net.toFixed(2)),
      quality: e.qAll ? Number(((e.qOk / e.qAll) * 100).toFixed(1)) : 100,
      haccpPct: e.qAll ? Number(((e.haccp / e.qAll) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.net - a.net);
  }, [approvedGrns]);

  // ---------- قسم 6: تحليل انحراف الأسعار حسب الصنف (مع تفصيل بالفروع) ----------
  const devStats = useMemo(() => {
    const m = new Map<string, {
      id: string; name: string; code: string; unit: string;
      count: number; qty: number; value: number; min: number; max: number; first: number | null; last: number | null;
      branches: Map<string, { count: number; qty: number; value: number; min: number; max: number; receipts: { date: string; invoice: string; qty: number; price: number; gross: number }[] }>;
    }>();
    approvedGrns.forEach((g) => {
      g.items.forEach((it) => {
        if (!it.rawMaterialId || !(it.quantityReceived > 0)) return;
        const mat = rawMaterials.find((x) => x.id === it.rawMaterialId);
        const conv = mat?.purchaseUnitConversion && mat.purchaseUnitConversion > 0 ? mat.purchaseUnitConversion : 1;
        const qtyPU = it.quantityReceived / conv;
        const price = (it.unitPrice || 0) * conv; // سعر وحدة الشراء
        if (!m.has(it.rawMaterialId)) m.set(it.rawMaterialId, {
          id: it.rawMaterialId, name: mat?.nameAr || getRawMaterialName(it.rawMaterialId), code: mat?.code || '', unit: mat?.purchaseUnit || mat?.unit || '',
          count: 0, qty: 0, value: 0, min: Infinity, max: -Infinity, first: null, last: null,
          branches: new Map(),
        });
        const e = m.get(it.rawMaterialId)!;
        e.count += 1; e.qty += qtyPU; e.value += qtyPU * price;
        if (price < e.min) e.min = price;
        if (price > e.max) e.max = price;
        if (e.first === null) e.first = price;
        e.last = price;
        if (!e.branches.has(g.branchId)) e.branches.set(g.branchId, { count: 0, qty: 0, value: 0, min: Infinity, max: -Infinity, receipts: [] });
        const b = e.branches.get(g.branchId)!;
        b.count += 1; b.qty += qtyPU; b.value += qtyPU * price;
        if (price < b.min) b.min = price;
        if (price > b.max) b.max = price;
        b.receipts.push({
          date: g.invoiceDate || g.date, invoice: g.invoiceNumber || g.grnNumber,
          qty: Number(qtyPU.toFixed(2)), price: Number(price.toFixed(2)), gross: Number((qtyPU * price).toFixed(2)),
        });
      });
    });
    return Array.from(m.values()).map((e) => {
      const avg = e.qty ? e.value / e.qty : 0;
      const spread = Math.max(0, e.max - e.min);
      const spreadPct = avg > 0 ? (spread / avg) * 100 : 0;
      const changePct = e.first && e.last ? Number((((e.last - e.first) / e.first) * 100).toFixed(1)) : 0;
      const branches = Array.from(e.branches.entries())
        .map(([branchId, b]) => {
          const bAvg = b.qty ? b.value / b.qty : 0;
          return {
            branchId, count: b.count, qty: Number(b.qty.toFixed(2)),
            avg: Number(bAvg.toFixed(2)), min: Number(b.min.toFixed(2)), max: Number(b.max.toFixed(2)),
            spreadPct: bAvg > 0 ? Number(((Math.max(0, b.max - b.min) / bAvg) * 100).toFixed(1)) : 0,
            receipts: [...b.receipts].sort((a, c) => a.date.localeCompare(c.date)),
          };
        })
        .sort((a, b) => b.spreadPct - a.spreadPct);
      return {
        id: e.id, name: e.name, code: e.code, unit: e.unit,
        count: e.count, qty: Number(e.qty.toFixed(2)),
        avg: Number(avg.toFixed(2)), min: Number(e.min.toFixed(2)), max: Number(e.max.toFixed(2)),
        spread: Number(spread.toFixed(2)), spreadPct: Number(spreadPct.toFixed(1)),
        first: e.first === null ? 0 : Number(e.first.toFixed(2)),
        last: e.last === null ? 0 : Number(e.last.toFixed(2)),
        changePct, branches,
      };
    }).sort((a, b) => b.spreadPct - a.spreadPct);
  }, [approvedGrns, rawMaterials, getRawMaterialName]);

  const groupKey = (sec: SectionId, name: string) => `${sec}:${name}`;
  const deviatingItems = devStats.filter((d) => d.spreadPct > DEV_THRESHOLD);
  const shownDev = onlyDev ? deviatingItems : devStats;
  const isOpen = (sec: SectionId, name: string) => openGroups[groupKey(sec, name)] !== false;
  const toggleGroup = (sec: SectionId, name: string) =>
    setOpenGroups((s) => ({ ...s, [groupKey(sec, name)]: !(s[groupKey(sec, name)] !== false) }));
  const toggleSection = (id: SectionId) => setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  const branchReceiptKey = (itemId: string, branchId: string) => `devb:${itemId}:${branchId}`;
  const isBranchOpen = (itemId: string, branchId: string) => openGroups[branchReceiptKey(itemId, branchId)] !== false;
  const toggleBranchOpen = (itemId: string, branchId: string) =>
    setOpenGroups((s) => ({ ...s, [branchReceiptKey(itemId, branchId)]: !(s[branchReceiptKey(itemId, branchId)] !== false) }));
  const setAll = (open: boolean) => {
    setOpenSections({ po: open, supplier: open, article: open, abc: open, receiving: open, deviation: open });
    const all: Record<string, boolean> = {};
    [...poBySupplier.map((x) => groupKey('po', x.name)), ...supplierStats.map((x) => groupKey('supplier', x.name)), ...articleStats.map((x) => groupKey('article', x.name)), ...devStats.map((x) => groupKey('deviation', x.name))].forEach((k) => { all[k] = open; });
    setOpenGroups(all);
  };

  const grandNet = approvedGrns.reduce((s, g) => s + grnNet(g), 0);
  const grandGross = approvedGrns.reduce((s, g) => s + g.totalAmount, 0);

  const dirBadge = (d: { changePct: number }) => {
    if (d.changePct > 0.05) return <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-600"><TrendingUp className="w-3.5 h-3.5" /> {d.changePct}%</span>;
    if (d.changePct < -0.05) return <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600"><TrendingDown className="w-3.5 h-3.5" /> {d.changePct}%</span>;
    return <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-400">ثابت</span>;
  };

  const exportCsv = () => {
    const parts: string[] = [];
    const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
    parts.push(`تحليل المشتريات ABC — ${branchLabel()} — ${from || 'من البداية'} إلى ${to || 'الآن'}${itemNote()}`);
    parts.push(['الترتيب', 'الصنف', 'الكمية', 'قيمة المشتريات', 'نسبة%', 'التراكمي%', 'التصنيف'].map(esc).join(','));
    abc.forEach((a) => parts.push([a.rank, a.name, a.qty, a.value, a.pctNo.toFixed(2), a.cumPct.toFixed(2), a.cls].map(esc).join(',')));
    parts.push('');
    parts.push('إحصائيات المشتريات حسب الصنف');
    parts.push(['الصنف', 'التاريخ', 'رقم الفاتورة', 'المورد', 'مركز التكلفة', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map(esc).join(','));
    articleStats.forEach((a) => a.rows.forEach((r) => parts.push([a.name, r.date, r.invoice, r.supplier, getBranchName(r.branchId), r.qty, r.price, r.gross].map(esc).join(','))));
    parts.push('');
    parts.push('تحليل انحراف الأسعار حسب الصنف');
    parts.push(['الصنف', 'مرات الشراء', 'الكمية', 'أول سعر', 'آخر سعر', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف%', 'التغير%'].map(esc).join(','));
    devStats.forEach((d) => parts.push([d.name, d.count, d.qty, d.first, d.last, d.min, d.max, d.avg, d.spreadPct.toFixed(1), d.changePct.toFixed(1)].map(esc).join(',')));
    const blob = new Blob(["\uFEFF" + parts.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'RestoCost_المشتريات_المتكاملة.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    flash('تم تصدير تقارير المشتريات في ملف CSV');
  };

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      await exportPDF('RestoCost_المشتريات_المتكاملة.pdf', [
        { name: 'تحليل المشتريات ABC', header: ['الترتيب', 'الصنف', 'الكمية', 'قيمة المشتريات', 'نسبة%', 'التراكمي%', 'التصنيف'], rows: abc.map((a) => [a.rank, a.name, a.qty, a.value, a.pctNo.toFixed(2), a.cumPct.toFixed(2), a.cls]) },
        { name: 'إحصائيات حسب الصنف', header: ['الصنف', 'التاريخ', 'رقم الفاتورة', 'المورد', 'مركز التكلفة', 'الكمية', 'سعر الوحدة', 'الإجمالي'], rows: articleStats.flatMap((a) => a.rows.map((r) => [a.name, r.date, r.invoice, r.supplier, getBranchName(r.branchId), r.qty, r.price, r.gross])) },
        { name: 'تحليل انحراف الأسعار', header: ['الصنف', 'مرات الشراء', 'الكمية', 'أول سعر', 'آخر سعر', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف%', 'التغير%'], rows: devStats.map((d) => [d.name, d.count, d.qty, d.first, d.last, d.min, d.max, d.avg, d.spreadPct.toFixed(1), d.changePct.toFixed(1)]) },
        { name: 'إحصائيات حسب المورد', header: ['المورد', 'رقم الفاتورة', 'التاريخ', 'الصافي', 'الضريبة', 'الإجمالي'], rows: supplierStats.flatMap((s) => [...s.invoices.map((g) => [s.name, g.invoiceNumber || '—', g.invoiceDate || g.date, grnNet(g), vat(g), g.totalAmount]), ['إجمالي ' + s.name, '', '', s.net, s.vat, s.gross]]) },
      ], 'منظومة تقارير المشتريات المتكاملة');
      flash('تم تصدير PDF شامل');
    } catch { flash('تعذر تصدير PDF شامل'); }
    finally { setPdfBusy(false); }
  };

  const printAll = () => openPrintWindow({
    title: 'منظومة تقارير المشتريات المتكاملة', subtitle: `${branchLabel()} — ${from || 'من البداية'} إلى ${to || 'الآن'}${itemNote()}`,
    meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['عدد فواتير GRN', `${approvedGrns.length}`], ['إجمالي المشتريات', fmtMoney(grandGross)]],
    tables: [
      { title: 'أوامر الشراء حسب المورد', header: ['المورد', 'رقم الأمر', 'التاريخ', 'الحالة', 'الإجمالي'], rows: poBySupplier.flatMap((s) => [...s.items.map((p) => [s.name, p.poNumber, p.orderDate, PO_STATUS_LABELS[p.status] || p.status, p.totalAmount]), ['إجمالي ' + s.name, '', '', '', s.items.reduce((x, p) => x + p.totalAmount, 0)]]) },
      { title: 'إحصائيات حسب المورد', header: ['المورد', 'رقم الفاتورة', 'التاريخ', 'الصافي', 'الضريبة', 'الإجمالي'], rows: supplierStats.flatMap((s) => [...s.invoices.map((g) => [s.name, g.invoiceNumber || '—', g.invoiceDate || g.date, grnNet(g), vat(g), g.totalAmount]), ['إجمالي ' + s.name, '', '', s.net, s.vat, s.gross]]), },
      { title: 'إحصائيات حسب الصنف', header: ['الصنف', 'التاريخ', 'رقم الفاتورة', 'المورد', 'مركز التكلفة', 'الكمية', 'سعر الوحدة', 'الإجمالي'], rows: articleStats.flatMap((a) => [...a.rows.map((r) => [a.name, r.date, r.invoice, r.supplier, getBranchName(r.branchId), r.qty, r.price, r.gross]), ['إجمالي ' + a.name, '', '', '', '', a.qty, a.avg, a.value]]), },
      { title: 'تحليل انحراف الأسعار حسب الصنف', header: ['الصنف', 'مرات الشراء', 'الكمية', 'أول سعر', 'آخر سعر', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف%', 'التغير%'], rows: devStats.flatMap((d) => [...d.branches.map((b) => [d.name + ' — ' + getBranchName(b.branchId), b.count, b.qty, '', '', b.min, b.max, b.avg, b.spreadPct.toFixed(1), '']), [d.name + ' (الإجمالي)', d.count, d.qty, d.first, d.last, d.min, d.max, d.avg, d.spreadPct.toFixed(1), d.changePct.toFixed(1)]]) },
      { title: 'تحليل المشتريات ABC', header: ['الترتيب', 'الصنف', 'الكمية', 'قيمة المشتريات', 'نسبة%', 'التراكمي%', 'التصنيف'], rows: abc.map((a) => [a.rank, a.name, a.qty, a.value, a.pctNo.toFixed(2), a.cumPct.toFixed(2), a.cls]) },
    ], footer: 'RestoCost ERP — منظومة تقارير المشتريات المتكاملة',
  });

  // طباعة جزء مستقل واحد فقط من التقرير
  const printPart = (sec: SectionId) => {
    const meta: [string, string][] = [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['عدد فواتير GRN', `${approvedGrns.length}`], ['إجمالي المشتريات', fmtMoney(grandGross)]];
    const base = (title: string) => ({ title, subtitle: `${branchLabel()} — ${from || 'من البداية'} إلى ${to || 'الآن'}${itemNote()}`, meta, footer: 'RestoCost ERP — طباعة تقرير مستقل' });
    if (sec === 'po') {
      openPrintWindow({ ...base('أوامر الشراء حسب المورد'), tables: [{ title: 'أوامر الشراء حسب المورد', header: ['المورد', 'رقم الأمر', 'التاريخ', 'الحالة', 'الإجمالي'], rows: poBySupplier.flatMap((s) => [...s.items.map((p) => [s.name, p.poNumber, p.orderDate, PO_STATUS_LABELS[p.status] || p.status, p.totalAmount]), ['إجمالي ' + s.name, '', '', '', s.items.reduce((x, p) => x + p.totalAmount, 0)]]) }] });
    } else if (sec === 'supplier') {
      openPrintWindow({ ...base('إحصائيات المشتريات حسب المورد'), tables: [{ title: 'إحصائيات حسب المورد', header: ['المورد', 'رقم الفاتورة', 'التاريخ', 'الصافي', 'الضريبة', 'الإجمالي'], rows: supplierStats.flatMap((s) => [...s.invoices.map((g) => [s.name, g.invoiceNumber || '—', g.invoiceDate || g.date, grnNet(g), vat(g), g.totalAmount]), ['إجمالي ' + s.name, '', '', s.net, s.vat, s.gross]]) }] });
    } else if (sec === 'article') {
      openPrintWindow({ ...base('سجل مشتريات الأصناف'), tables: [{ title: 'إحصائيات حسب الصنف (بوحدة الشراء)', header: ['الصنف', 'التاريخ', 'رقم الفاتورة', 'المورد', 'مركز التكلفة', 'الكمية', 'سعر الوحدة', 'الإجمالي'], rows: articleStats.flatMap((a) => [...a.rows.map((r) => [a.name, r.date, r.invoice, r.supplier, getBranchName(r.branchId), `${r.qty} ${a.unit}`, r.price, r.gross]), ['إجمالي ' + a.name, '', '', '', '', a.qty, a.avg, a.value]]) }] });
    } else if (sec === 'abc') {
      openPrintWindow({ ...base('تحليل المشتريات ABC'), tables: [{ title: 'تحليل المشتريات ABC', header: ['الترتيب', 'الصنف', 'الكمية', 'قيمة المشتريات', 'نسبة%', 'التراكمي%', 'التصنيف'], rows: abc.map((a) => [a.rank, a.name, `${a.qty} ${a.unit}`, a.value, a.pctNo.toFixed(2), a.cumPct.toFixed(2), a.cls]) }] });
    } else if (sec === 'deviation') {
      openPrintWindow({ ...base('تحليل انحراف الأسعار حسب الصنف'), tables: [
        { title: 'ملخص الانحراف حسب الصنف (بوحدة الشراء)', header: ['الصنف', 'مرات الشراء', 'الكمية', 'أول سعر', 'آخر سعر', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف%', 'التغير%'], rows: devStats.map((d) => [d.name, d.count, `${d.qty} ${d.unit}`, d.first, d.last, d.min, d.max, d.avg, d.spreadPct.toFixed(1), d.changePct.toFixed(1)]) },
        { title: 'تفصيل الانحراف حسب الفرع', header: ['الصنف', 'الفرع', 'مرات الشراء', 'الكمية', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف%'], rows: devStats.flatMap((d) => d.branches.map((b) => [d.name, getBranchName(b.branchId), b.count, `${b.qty} ${d.unit}`, b.min, b.max, b.avg, b.spreadPct.toFixed(1)])) },
        { title: 'إيصالات الاستلام (لكل فرع)', header: ['الصنف', 'الفرع', 'رقم الإذن/الفاتورة', 'التاريخ', 'الكمية (بوحدة الشراء)', 'سعر الوحدة', 'الإجمالي'], rows: devStats.flatMap((d) => d.branches.flatMap((b) => b.receipts.map((r) => [d.name, getBranchName(b.branchId), r.invoice, r.date, `${r.qty} ${d.unit}`, r.price, r.gross]))) },
      ] });
    } else {
      openPrintWindow({ ...base('الاستلام وفحص الجودة'), tables: [{ title: 'الاستلام وفحص الجودة حسب المورد', header: ['المورد', 'مستندات الاستلام', 'الصافي', 'بند تم فحصه', 'جودة مقبولة %', 'دفعات HACCP %'], rows: receivSummary.map((r) => [r.name, r.count, r.net, r.qAll, r.quality, r.haccpPct]) }] });
    }
  };

  // تقرير منفصل لصنف واحد منحرف السعر — نافذة/شاشة جديدة بنفس هيكل المفردات
  const reportDeviationItem = (d: (typeof devStats)[number]) => {
    const unit = d.unit || '';
    const u = (q: number) => (unit ? `${fmt(q)} ${unit}` : String(fmt(q)));
    const itemsTotalValue = d.branches.reduce((s, b) => s + b.receipts.reduce((x, r) => x + r.gross, 0), 0);
    openPrintWindow({
      title: `تقرير انحراف السعر — ${d.name}`,
      subtitle: `${d.code ? 'كود: ' + d.code + ' · ' : ''}وحدة الشراء: ${unit || '—'} · ${branchLabel()} · ${from || 'من البداية'} إلى ${to || 'الآن'}${itemNote()}`,
      meta: [
        ['عدد مرات الشراء', `${d.count}`],
        ['الكمية الإجمالية', u(d.qty)],
        ['المتوسط (المرجح)', fmtMoney(d.avg)],
        ['مدى السعر', fmtMoney(d.spread)],
        ['الانحراف %', `${d.spreadPct.toFixed(1)}%`],
        ['التغير %', `${d.changePct.toFixed(1)}%`],
      ],
      tables: [
        { title: `مؤشرات السعر — ${d.name}`, header: ['الكمية', 'أول سعر', 'آخر سعر', 'أدنى سعر', 'أعلى سعر', 'المتوسط (المرجح)', 'مدى السعر', 'الانحراف %'], rows: [[u(d.qty), d.first, d.last, d.min, d.max, d.avg, d.spread, `${d.spreadPct.toFixed(1)}%`]] },
        { title: 'تفصيل انحراف السعر حسب الفرع / مركز التكلفة', header: ['الفرع', 'مرات الشراء', 'الكمية', 'أدنى', 'أعلى', 'المتوسط', 'الانحراف %', 'الإيصالات'], rows: d.branches.map((b) => [getBranchName(b.branchId), b.count, u(b.qty), b.min, b.max, b.avg, `${b.spreadPct.toFixed(1)}%`, `${b.receipts.length} إيصال`]) },
        { title: 'إيصالات الاستلام (لكل فرع)', header: ['الفرع', 'رقم الإذن / الفاتورة', 'التاريخ', 'الكمية (بوحدة الشراء)', 'سعر الوحدة', 'الإجمالي'], rows: d.branches.flatMap((b) => b.receipts.map((r) => [getBranchName(b.branchId), r.invoice, r.date, u(r.qty), r.price, r.gross])) },
      ],
      totals: [['عدد مرات الشراء', `${d.count}`], ['إجمالي الكمية', u(d.qty)], ['إجمالي قيمة المشتريات', fmtMoney(itemsTotalValue)]],
      footer: 'RestoCost ERP — تقرير انحراف الأسعار المنفصل',
    });
  };

  const SectionShell: React.FC<{ id: SectionId; title: string; subtitle: string; icon: React.ReactNode; badgeCount?: string; onPartPrint?: () => void; children: React.ReactNode }> = ({ id, title, subtitle, icon, badgeCount, onPartPrint, children }) => (
    <Card className="p-4">
      <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleSection(id)}>
        {icon}
        <div className="flex-1">
          <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
          <p className="text-[10px] text-slate-400 font-bold">{subtitle}</p>
        </div>
        {badgeCount && <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-600">{badgeCount}</span>}
        {onPartPrint && <button
          onClick={(e) => { e.stopPropagation(); onPartPrint(); }}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          title="طباعة هذا الجزء فقط"
        ><Printer className="w-3.5 h-3.5" /></button>}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openSections[id] ? '' : '-rotate-90'}`} />
      </div>
      {openSections[id] && <div className="mt-3">{children}</div>}
    </Card>
  );

  const GroupHeader: React.FC<{ name: string; right: React.ReactNode; open: boolean; onToggle: () => void; tone?: string; action?: React.ReactNode }> = ({ name, right, open, onToggle, tone, action }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${open ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-100 bg-slate-50'}`} onClick={onToggle}>
      <button className="p-0.5">{open ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronLeft className="w-4 h-4 text-slate-400" />}</button>
      <span className={`text-xs font-extrabold ${tone || 'text-slate-700'}`}>{name}</span>
      <div className="flex-1" />
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">{right}</div>
      {action}
    </div>
  );

  const th = 'p-2 text-right whitespace-nowrap';
  const thC = 'bg-slate-100 text-slate-700 font-bold border-b border-slate-200';
  const inputCls = 'border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 bg-white';
  const chipCls = 'rounded-full px-3 py-1 text-[11px] font-bold border transition-colors';

  return (
    <div className="space-y-4">
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{msg}</div>}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-indigo-500" />
          <span className="text-[11px] font-bold text-slate-500">الفترة:</span>
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls} title="من تاريخ" />
          <span className="text-[11px] font-bold text-slate-500">إلى</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} title="إلى تاريخ" />
          {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-[11px] font-bold text-rose-500 hover:underline">مسح الفترة</button>}
          <span className="w-full" />
          <span className="text-[11px] font-bold text-slate-500">الفروع / مراكز التكلفة:</span>
          <button
            onClick={() => setBranchSel([])}
            className={`${chipCls} ${branchSel.length === 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}
          >كل الفروع</button>
          {branches.map((b) => {
            const on = branchSel.includes(b.id);
            return (
              <button key={b.id} onClick={() => toggleBranch(b.id)} className={`${chipCls} ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                {getBranchName(b.id)}
              </button>
            );
          })}
          <span className="w-full" />
          <span className="text-[11px] font-bold text-slate-500">الأصناف:</span>
          <button
            onClick={() => setItemSel([])}
            className={`${chipCls} ${itemSel.length === 0 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}
          >كل الأصناف</button>
          <div className="relative">
            <button
              onClick={() => setItemOpen((v) => !v)}
              className={`${inputCls} flex items-center gap-2 min-w-[240px] text-xs ${itemSel.length ? 'text-emerald-800 font-bold' : 'text-slate-500'}`}
              title="اختيار صنف واحد أو عدة أصناف — سيطبع التقرير لهذه الأصناف فقط"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate">{itemSel.length ? itemLabel() : 'اختيار أصناف محددة للطباعة...'}</span>
              {itemSel.length > 0 && <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 shrink-0">{itemSel.length}</span>}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${itemOpen ? 'rotate-180' : ''}`} />
            </button>
            {itemOpen && (
              <div className="absolute z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-[340px]">
                <input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className={`${inputCls} w-full text-xs`}
                  placeholder="بحث بالاسم أو الكود..."
                />
                <div className="max-h-64 overflow-y-auto mt-2 space-y-0.5">
                  {itemOptions
                    .filter((o) => !itemSearch || o.name.includes(itemSearch) || (o.code || '').includes(itemSearch))
                    .map((o) => (
                      <label key={o.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={itemSel.includes(o.id)} onChange={() => toggleItem(o.id)} className="accent-emerald-600 w-3.5 h-3.5" />
                        <span className="text-xs font-bold text-slate-700 truncate">{o.name}</span>
                        <span className="text-[9px] text-slate-400 shrink-0">{o.code}</span>
                        {o.unit && <span className="text-[9px] text-slate-400 shrink-0">({o.unit})</span>}
                      </label>
                    ))}
                  {itemOptions.length === 0 && <p className="text-[10px] text-slate-400 font-bold text-center py-2">لا توجد أصناف في الفترة المحددة</p>}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <button onClick={() => setItemSel(itemOptions.map((o) => o.id))} className="text-[10px] font-extrabold text-emerald-700 hover:underline">تحديد الكل</button>
                  <button onClick={() => { setItemSel([]); setItemOpen(false); }} className="text-[10px] font-extrabold text-rose-600 hover:underline">مسح التحديد</button>
                </div>
              </div>
            )}
          </div>
          <span className="text-[11px] font-bold text-slate-500">كل الأصناف في الفترة ({itemOptions.length})</span>
          <span className="w-full" />
          <span className="text-[11px] font-bold text-indigo-600">{approvedGrns.length} فاتورة · {articleStats.length} صنف · إجمالي {fmtMoney(grandGross)}</span>
          {devStats.length > 0 && <span className="text-[11px] font-bold text-amber-600">أقصى انحراف سعر: {devStats[0].spreadPct.toFixed(1)}% ({devStats[0].name})</span>}
          <div className="flex-1" />
          <Btn onClick={() => setAll(true)}><ChevronsUpDown className="w-4 h-4" /> فتح الكل</Btn>
          <Btn onClick={() => setAll(false)}><ChevronsDownUp className="w-4 h-4" /> طي الكل</Btn>
          <Btn onClick={exportCsv}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
          <Btn tone="success" onClick={exportPdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF</Btn>
          <Btn tone="dark" onClick={printAll}><Printer className="w-4 h-4" /> طباعة</Btn>
        </div>
      </Card>

      {/* 0. تحليل انحراف الأسعار حسب الصنف */}
      <SectionShell id="deviation" title="تحليل انحراف الأسعار حسب الصنف (Price Variance Analysis)" subtitle={`مدى سعر كل صنف خلال الفترة + تفصيل بكل فرع — تنبيه عند انحراف يتجاوز ${DEV_THRESHOLD}% عن المتوسط`} icon={<TrendingUp className="w-5 h-5 text-violet-500" />} badgeCount={onlyDev ? `${deviatingItems.length}/${devStats.length} منحرف` : `${devStats.length} صنف`} onPartPrint={() => printPart('deviation')}>
        <div className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg bg-violet-50/60 border border-violet-100">
          <button
            onClick={() => setOnlyDev((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold border transition-colors ${onlyDev ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-200 hover:border-violet-400'}`}
            title="إظهار الأصناف ذات انحراف سعر فوق العتبة فقط"
          ><TrendingUp className="w-3.5 h-3.5" /> الأصناف المنحرفة فقط ({deviatingItems.length})</button>
          <span className="text-[10px] font-bold text-violet-500">
            {onlyDev ? 'عرض الأصناف التي يتجاوز انحراف سعرها العتبة فقط' : `المنحرفة: ${deviatingItems.length} صنف — انحراف فوق ${DEV_THRESHOLD}% عن المتوسط`}
          </span>
        </div>
        <div className="space-y-2">
          {shownDev.map((d) => (
            <div key={d.id}>
              <GroupHeader name={d.name} open={isOpen('deviation', d.name)} onToggle={() => toggleGroup('deviation', d.name)} right={<span>{d.count} شراء · كمية {fmt(d.qty)} {d.unit} · المتوسط <strong className="text-slate-800">{fmtMoney(d.avg)}</strong> · الانحراف <strong className={d.spreadPct > DEV_THRESHOLD ? 'text-rose-600' : 'text-emerald-600'}>{d.spreadPct.toFixed(1)}%</strong> · التغير {dirBadge(d)}</span>} tone={d.spreadPct > DEV_THRESHOLD ? 'text-rose-700' : 'text-slate-700'} action={
          <button
            onClick={(e) => { e.stopPropagation(); reportDeviationItem(d); }}
            className="mr-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-extrabold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors shrink-0"
            title="تقرير منفصل لهذا الصنف في نافذة/شاشة جديدة"
          ><Printer className="w-3 h-3" /> تقرير منفصل</button>
        } />
              {isOpen('deviation', d.name) && (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead><tr className="bg-violet-50 text-violet-800 font-bold border-b border-violet-100"><th className={th}>مؤشر</th><th className={th}>عدد مرات الشراء</th><th className={th}>الكمية</th><th className={th}>أول سعر</th><th className={th}>آخر سعر</th><th className={th}>أدنى سعر</th><th className={th}>أعلى سعر</th><th className={th}>المتوسط (المرجح)</th><th className={th}>مدى السعر</th><th className={th}>الانحراف %</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50">
                        <td className="p-2 whitespace-nowrap font-bold text-slate-700">الإجمالي</td>
                        <td className="p-2 whitespace-nowrap font-mono text-slate-600">{d.count}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmt(d.qty)} {d.unit}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-slate-700">{fmtMoney(d.first)}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-slate-700">{fmtMoney(d.last)}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-emerald-700">{fmtMoney(d.min)}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-rose-700">{fmtMoney(d.max)}</td>
                        <td className="p-2 whitespace-nowrap font-mono font-bold text-indigo-700">{fmtMoney(d.avg)}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmtMoney(d.spread)}</td>
                        <td className="p-2 whitespace-nowrap">
                          <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${d.spreadPct > DEV_THRESHOLD ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{d.spreadPct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {d.branches.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-extrabold text-slate-400 mb-1">تفصيل الانحراف حسب الفرع / مركز التكلفة (اضغط على الفرع لعرض إيصالات الاستلام):</p>
                      <table className="w-full text-xs min-w-max">
                        <thead><tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200"><th className={th}>الفرع</th><th className={th}>مرات الشراء</th><th className={th}>الكمية</th><th className={th}>أدنى</th><th className={th}>أعلى</th><th className={th}>المتوسط</th><th className={th}>الانحراف %</th><th className={th}></th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {d.branches.map((b) => {
                            const bOpen = isBranchOpen(d.id, b.branchId);
                            const devCls = b.spreadPct > DEV_THRESHOLD ? 'bg-rose-50/70' : '';
                            return (
                              <Fragment key={b.branchId}>
                                <tr className={`cursor-pointer hover:bg-slate-100 ${bOpen ? 'bg-slate-50' : ''} ${devCls}`} onClick={() => toggleBranchOpen(d.id, b.branchId)}>
                                  <td className="p-2 whitespace-nowrap font-bold text-slate-700">
                                    <span className="inline-flex items-center gap-1">{bOpen ? <ChevronDown className="w-3 h-3 text-indigo-500" /> : <ChevronLeft className="w-3 h-3 text-slate-400" />} {getBranchName(b.branchId)}</span>
                                  </td>
                                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{b.count}</td>
                                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmt(b.qty)} {d.unit}</td>
                                  <td className="p-2 whitespace-nowrap font-mono text-emerald-700">{fmtMoney(b.min)}</td>
                                  <td className="p-2 whitespace-nowrap font-mono text-rose-700">{fmtMoney(b.max)}</td>
                                  <td className="p-2 whitespace-nowrap font-mono font-bold text-indigo-700">{fmtMoney(b.avg)}</td>
                                  <td className="p-2 whitespace-nowrap">
                                    <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${b.spreadPct > DEV_THRESHOLD ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{b.spreadPct.toFixed(1)}%</span>
                                  </td>
                                  <td className="p-2 whitespace-nowrap text-slate-300">{b.receipts.length} إيصال</td>
                                </tr>
                                {bOpen && b.receipts.length > 0 && (
                                  <tr><td colSpan={8}>
                                    <div className="p-2 pr-6 bg-white/70">
                                      <table className="w-full text-[10px] min-w-max">
                                        <thead><tr className="bg-violet-50 text-violet-800 font-bold"><th className={th}>رقم الإذن / الفاتورة</th><th className={th}>التاريخ</th><th className={th}>الكمية (بوحدة الشراء)</th><th className={th}>سعر الوحدة</th><th className={`${th} text-emerald-700`}>الإجمالي</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {b.receipts.map((r, ri) => (
                                            <tr key={ri} className={Math.abs(r.price - b.avg) / Math.max(0.0001, b.avg) > DEV_THRESHOLD / 100 ? 'bg-rose-50/60' : ''}>
                                              <td className="p-1.5 whitespace-nowrap font-bold text-slate-700">{r.invoice}</td>
                                              <td className="p-1.5 whitespace-nowrap text-slate-500">{r.date}</td>
                                              <td className="p-1.5 whitespace-nowrap font-mono text-slate-600">{fmt(r.qty)} {d.unit}</td>
                                              <td className="p-1.5 whitespace-nowrap font-mono text-slate-700">{fmtMoney(r.price)}</td>
                                              <td className="p-1.5 whitespace-nowrap font-mono font-bold text-emerald-700">{fmtMoney(r.gross)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td></tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {devStats.length === 0 && <p className="text-xs text-slate-400 font-bold py-3 text-center">لا توجد مشتريات في هذه الفترة/الفروع لتحليل الأسعار</p>}
          {shownDev.length === 0 && devStats.length > 0 && <p className="text-xs text-violet-400 font-bold py-3 text-center">لا توجد أصناف منحرفة فوق {DEV_THRESHOLD}% في هذه الفترة/الفروع — كل الأسعار مستقرة ✓</p>}
        </div>
      </SectionShell>

      {/* 1. أوامر الشراء حسب المورد */}
      <SectionShell id="po" title="ملخص أوامر الشراء (PO Overview)" subtitle="أوامر الشراء مجمعة حسب المورد مع تلوين الحالة لكل أمر" icon={<ClipboardList className="w-5 h-5 text-sky-500" />} badgeCount={`${approvedPos.length} أمر`} onPartPrint={() => printPart('po')}>
        <div className="space-y-2">
          {poBySupplier.map((s) => (
            <div key={s.name}>
              <GroupHeader name={s.name} open={isOpen('po', s.name)} onToggle={() => toggleGroup('po', s.name)} right={<span>إجمالي: {fmtMoney(s.items.reduce((x, p) => x + p.totalAmount, 0))} · {s.items.length} أمر</span>} />
              {isOpen('po', s.name) && (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead><tr className={thC}><th className={th}>رقم الأمر</th><th className={th}>تاريخ الأمر</th><th className={th}>تاريخ التسليم</th><th className={th}>الحالة</th><th className={th}>الإجمالي</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.items.map((p) => (
                        <tr key={p.id} className={STATUS_LINE_BG[p.status] || ''}>
                          <td className="p-2 whitespace-nowrap font-bold text-slate-700">{p.poNumber}</td>
                          <td className="p-2 whitespace-nowrap text-slate-600">{p.orderDate}</td>
                          <td className="p-2 whitespace-nowrap text-slate-600">{p.expectedDate || '—'}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold">
                              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
                              {PO_STATUS_LABELS[p.status] || p.status}
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap font-mono font-bold text-slate-800">{fmtMoney(p.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {poBySupplier.length === 0 && <p className="text-xs text-slate-400 font-bold py-3 text-center">لا توجد أوامر شراء ضمن الفترة/الفروع المحددة</p>}
        </div>
      </SectionShell>

      {/* 2. إحصائيات المشتريات حسب المورد */}
      <SectionShell id="supplier" title="إحصائيات المشتريات حسب المورد (Purchase Statistics)" subtitle="كل مورد في قسم مستقل: رقم الفاتورة، التاريخ، الصافي، الضريبة، الإجمالي + إجمالي المورد" icon={<Truck className="w-5 h-5 text-indigo-500" />} badgeCount={`${supplierStats.length} مورد`} onPartPrint={() => printPart('supplier')}>
        <div className="space-y-2">
          {supplierStats.map((s) => (
            <div key={s.name}>
              <GroupHeader name={s.name} open={isOpen('supplier', s.name)} onToggle={() => toggleGroup('supplier', s.name)} right={<span>الصافي {fmtMoney(s.net)} · الضريبة {fmtMoney(s.vat)} · الإجمالي <strong className="text-emerald-700">{fmtMoney(s.gross)}</strong></span>} />
              {isOpen('supplier', s.name) && (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead><tr className={thC}><th className={th}>رقم الفاتورة</th><th className={th}>تاريخ الفاتورة</th><th className={th}>الفرع</th><th className={th}>الصافي</th><th className={th}>الضريبة</th><th className={th}>الإجمالي</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.invoices.map((g) => (
                        <tr key={g.id} className="hover:bg-slate-50">
                          <td className="p-2 whitespace-nowrap font-bold text-slate-700">{g.invoiceNumber || g.grnNumber}</td>
                          <td className="p-2 whitespace-nowrap text-slate-600">{g.invoiceDate || g.date}</td>
                          <td className="p-2 whitespace-nowrap text-slate-600">{getBranchName(g.branchId)}</td>
                          <td className="p-2 whitespace-nowrap font-mono font-bold text-slate-800">{fmtMoney(grnNet(g))}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmtMoney(vat(g))}</td>
                          <td className="p-2 whitespace-nowrap font-mono font-bold text-emerald-700">{fmtMoney(g.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="bg-slate-800 text-white font-extrabold"><td className="p-2">إجمالي {s.name}</td><td className="p-2">{s.invoices.length} فاتورة</td><td className="p-2"></td><td className="p-2 font-mono">{fmtMoney(s.net)}</td><td className="p-2 font-mono">{fmtMoney(s.vat)}</td><td className="p-2 font-mono">{fmtMoney(s.gross)}</td></tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
          {supplierStats.length === 0 && <p className="text-xs text-slate-400 font-bold py-3 text-center">لا توجد فواتير معتمدة ضمن الفترة/الفروع المحددة</p>}
        </div>
      </SectionShell>

      {/* 3. إحصائيات المشتريات حسب الصنف */}
      <SectionShell id="article" title="سجل مشتريات الأصناف (Article Purchase Register)" subtitle="كل صنف أبجدياً، صفوفه مرتبة بتاريخ الشراء: التاريخ، رقم الفاتورة، المورد، الفرع، الكمية، السعر، الانحراف%، الإجمالي" icon={<Package className="w-5 h-5 text-emerald-500" />} badgeCount={`${articleStats.length} صنف`} onPartPrint={() => printPart('article')}>
        <div className="space-y-2">
          {articleStats.map((a) => (
            <div key={a.id}>
              <GroupHeader name={a.name} open={isOpen('article', a.name)} onToggle={() => toggleGroup('article', a.name)} right={<span>الكمية {fmt(a.qty)} {a.unit} · متوسط {fmtMoney(a.avg)} · الإجمالي <strong className="text-emerald-700">{fmtMoney(a.value)}</strong></span>} />
              {isOpen('article', a.name) && (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead><tr className={thC}><th className={th}>التاريخ</th><th className={th}>رقم الفاتورة</th><th className={th}>المورد</th><th className={th}>الفرع</th><th className={th}>الكمية</th><th className={th}>سعر الوحدة</th><th className={th}>الانحراف%</th><th className={th}>متوسط السعر AVE</th><th className={th}>الإجمالي</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {a.rows.map((r, i) => {
                        const dp = a.avg > 0 ? (Math.abs(r.price - a.avg) / a.avg) * 100 : 0;
                        const devCls = dp > DEV_THRESHOLD ? (r.price > a.avg ? 'bg-rose-50/80' : 'bg-emerald-50/80') : '';
                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${devCls}`}>
                            <td className="p-2 whitespace-nowrap text-slate-600">{r.date}</td>
                            <td className="p-2 whitespace-nowrap font-bold text-slate-700">{r.invoice}</td>
                            <td className="p-2 whitespace-nowrap text-slate-600">{r.supplier}</td>
                            <td className="p-2 whitespace-nowrap text-slate-600">{getBranchName(r.branchId)}</td>
                            <td className="p-2 whitespace-nowrap font-mono font-bold text-slate-800">{fmt(r.qty)} {a.unit}</td>
                            <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmtMoney(r.price)}</td>
                            <td className="p-2 whitespace-nowrap">
                              <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${dp > DEV_THRESHOLD ? (r.price > a.avg ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700') : 'bg-slate-100 text-slate-500'}`}>{dp.toFixed(1)}%</span>
                            </td>
                            <td className="p-2 whitespace-nowrap font-mono text-indigo-700 font-bold">{fmtMoney(a.avg)}</td>
                            <td className="p-2 whitespace-nowrap font-mono font-bold text-emerald-700">{fmtMoney(r.gross)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr className="bg-slate-800 text-white font-extrabold"><td className="p-2">إجمالي {a.name}</td><td className="p-2"></td><td className="p-2"></td><td className="p-2"></td><td className="p-2 font-mono">{fmt(a.qty)}</td><td className="p-2"></td><td className="p-2"></td><td className="p-2 font-mono">{fmtMoney(a.avg)}</td><td className="p-2 font-mono">{fmtMoney(a.value)}</td></tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
          {articleStats.length === 0 && <p className="text-xs text-slate-400 font-bold py-3 text-center">لا توجد مشتريات معتمدة ضمن الفترة/الفروع المحددة</p>}
        </div>
      </SectionShell>

      {/* 4. تحليل ABC */}
      <SectionShell id="abc" title="تحليل المشتريات ABC (ABC Purchase Analysis)" subtitle="ترتيب الأصناف تنازلياً حسب قيمة المشتريات: A ≥70% تراكمي، B ≥90%، C الباقي" icon={<BarChart3 className="w-5 h-5 text-amber-500" />} badgeCount={`${abc.length} صنف`} onPartPrint={() => printPart('abc')}>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs min-w-max">
            <thead><tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200"><th className={th}>الترتيب</th><th className={th}>الصنف</th><th className={th}>الكمية</th><th className={th}>نسبة المواد %</th><th className={th}>قيمة المشتريات</th><th className={th}>التراكمي %</th><th className={th}>التصنيف</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {abc.map((a) => (
                <tr key={a.rank} className="hover:bg-slate-50">
                  <td className="p-2 whitespace-nowrap font-bold text-slate-500">{a.rank}</td>
                  <td className="p-2 whitespace-nowrap font-bold text-slate-700">{a.name}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{fmt(a.qty)}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{a.pctNo.toFixed(2)}%</td>
                  <td className="p-2 whitespace-nowrap font-mono font-bold text-slate-800">{fmtMoney(a.value)}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-indigo-700 font-bold">{a.cumPct.toFixed(2)}%</td>
                  <td className="p-2 whitespace-nowrap"><span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${ABC_CLASS[a.cls]}`}>{a.cls}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800 text-white font-extrabold">
                <td className="p-2"></td><td className="p-2">الإجمالي</td><td className="p-2 font-mono">{fmt(abc.reduce((s, a) => s + a.qty, 0))}</td>
                <td className="p-2 font-mono">100%</td><td className="p-2 font-mono">{fmtMoney(grandGross)}</td><td className="p-2"></td>
                <td className="p-2">
                  <span className="inline-flex gap-1 text-[10px]">
                    <span className="bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">{abc.filter((a) => a.cls === 'A').length} A</span>
                    <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">{abc.filter((a) => a.cls === 'B').length} B</span>
                    <span className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{abc.filter((a) => a.cls === 'C').length} C</span>
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> A: أصناف تشكل ~70% من قيمة المشتريات — رقابة صارمة على الأسعار</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> B: أصناف تشكل ~90% تراكمياً</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> C: القيمة المنخفضة وحجم العد الكبير</span>
        </div>
      </SectionShell>

      {/* 5. الاستلام وفحص الجودة */}
      <SectionShell id="receiving" title="الاستلام وفحص الجودة (Receiving & HACCP)" subtitle="ملخص استلام البضائع لكل مورد: عدد المستندات، نسبة الجودة المقبولة، ونسبة الدفعات HACCP" icon={<BadgeCheck className="w-5 h-5 text-rose-500" />} badgeCount={`${receivSummary.length} مورد`} onPartPrint={() => printPart('receiving')}>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs min-w-max">
            <thead><tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200"><th className={th}>المورد</th><th className={th}>مستندات الاستلام</th><th className={th}>الصافي</th><th className={th}>بند تم فحصه</th><th className={th}>جودة مقبولة %</th><th className={th}>دفعات HACCP %</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {receivSummary.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <td className="p-2 whitespace-nowrap font-bold text-slate-700">{r.name}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{r.count}</td>
                  <td className="p-2 whitespace-nowrap font-mono font-bold text-slate-800">{fmtMoney(r.net)}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-slate-600">{r.qAll}</td>
                  <td className="p-2 whitespace-nowrap font-mono font-bold text-emerald-700">{r.quality}%</td>
                  <td className="p-2 whitespace-nowrap font-mono text-indigo-700 font-bold">{r.haccpPct}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-slate-800 text-white font-extrabold"><td className="p-2">الإجمالي</td><td className="p-2 font-mono">{approvedGrns.length}</td><td className="p-2 font-mono">{fmtMoney(grandNet)}</td><td className="p-2 font-mono">{abc.reduce((s, a) => s + a.qty, 0)}</td><td className="p-2"></td><td className="p-2"></td></tr></tfoot>
          </table>
        </div>
      </SectionShell>

      {approvedGrns.length === 0 && (branchSel.length > 0 || from || to) && (
        <p className="text-xs text-slate-400 font-bold py-2 text-center">لا توجد فواتير معتمدة ضمن الفترة والفروع المحددة</p>
      )}
    </div>
  );
};