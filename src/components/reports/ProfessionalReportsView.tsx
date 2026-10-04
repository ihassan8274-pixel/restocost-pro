import React, { useMemo, useState } from 'react';
import {
  FileText, FileDown, Printer, Loader2, Truck, Activity, Boxes, AlertTriangle, BarChart3, Wallet, FileSpreadsheet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, SectionHeader, Btn, PageHeader } from '../ui';
import { fmt, fmtMoney, downloadCSV, categoryLabel } from '../../utils/helpers';
import { renderProReport, type ProReportSpec, type ProTable, type RowCell } from '../../utils/pdf';
import { openPrintWindow } from '../../utils/print';
import { WastageCategory } from '../../types';

const WASTAGE_LABELS: Record<WastageCategory, string> = {
  prep_waste: 'هدر تحضير', cooking_burn: 'حرق طهي', expired: 'منتهي الصلاحية',
  damaged_storage: 'تلف تخزين', returned_food: 'طعام مُرجع', sample_taste: 'عينة تذوق',
};

interface Col {
  key: string;
  label: string;
  type?: 'money' | 'pct' | 'num' | 'date' | 'text';
}

interface Exhibit {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  columns: Col[];
  rows: Record<string, RowCell | boolean>[];
  csvHeader: string[];
  spec: () => ProReportSpec;
}

export const ProfessionalReportsView: React.FC = () => {
  const {
    grnNotes, supplierReturns, invoices, inventoryMovements, wastageLogs,
    rawMaterials, plSummaries, getBranchName, getRawMaterialName, getBranchAverageUnitCost, branches: allBranches,
    materialCategories,
  } = useApp();

  const [branch, setBranch] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  const branchSel = branch;
  const branchFilter = (b: string) => branchSel === 'all' || b === branchSel;

  // ======================= كشف حساب الموردين =======================
  const supplierLedger = useMemo(() => {
    const map = new Map<string, { name: string; rows: { date: string; desc: string; ref: string; debit: number; credit: number }[] }>();
    const add = (supId: string, name: string, r: { date: string; desc: string; ref: string; debit: number; credit: number }) => {
      if (!map.has(supId)) map.set(supId, { name, rows: [] });
      map.get(supId)!.rows.push(r);
    };
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => {
      if (!branchFilter(g.branchId)) return;
      add(g.supplierId, g.supplierName || g.supplierId, { date: g.invoiceDate || g.date, desc: 'فاتورة مشتريات (GRN)', ref: g.invoiceNumber || g.grnNumber, debit: g.totalAmount, credit: 0 });
    });
    supplierReturns.filter((r) => r.status === 'approved').forEach((r) => {
      if (!branchFilter(r.branchId)) return;
      add(r.supplierId, r.supplierName || r.supplierId, { date: r.date, desc: 'إذن إرجاع للمورد', ref: r.returnNumber, debit: 0, credit: r.totalAmount });
    });
    invoices.filter((v) => v.type === 'purchase').forEach((v) => {
      if (!branchFilter(v.branchId)) return;
      if (v.paidAmount > 0) add(v.partyId, v.partyName, { date: v.date, desc: 'دفعة/تسديد للمورد', ref: v.invoiceNumber, debit: 0, credit: v.paidAmount });
    });
    const rows: Record<string, RowCell | boolean>[] = [];
    const totals = { debit: 0, credit: 0 };
    Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([, s]) => {
      let bal = 0;
      s.rows.sort((x, y) => x.date.localeCompare(y.date));
      s.rows.forEach((r) => {
        bal += r.debit - r.credit;
        rows.push({ supplier: s.name, date: r.date, desc: r.desc, ref: r.ref, debit: r.debit, credit: r.credit, balance: bal });
        totals.debit += r.debit; totals.credit += r.credit;
      });
      rows.push({ _total: true, key: `إجمالي ${s.name}`, supplier: `إجمالي ${s.name}`, date: '', desc: '', ref: '', debit: '', credit: '', balance: bal });
    });
    return { rows, totals, count: map.size };
  }, [grnNotes, supplierReturns, invoices, branch, branchFilter]);

  // ======================= بيانات ===========================
  const movementRows = useMemo(() => inventoryMovements
    .filter((m) => branchFilter(m.branchId))
    .sort((a, b) => b.date.localeCompare(a.date)), [inventoryMovements, branch, branchFilter]);

  const wastageRows = useMemo(() => wastageLogs
    .filter((w) => branchFilter(w.branchId))
    .sort((a, b) => b.date.localeCompare(a.date)), [wastageLogs, branch, branchFilter]);

  const majorGroup = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; count: number }>();
    grnNotes.filter((g) => g.status === 'approved').filter((g) => branchFilter(g.branchId)).forEach((g) => {
      g.items.forEach((it) => {
        if (!it.rawMaterialId || !(it.quantityReceived > 0)) return;
        const mat = rawMaterials.find((x) => x.id === it.rawMaterialId);
        const cat = mat?.category || 'other';
        const e = m.get(cat) || { qty: 0, value: 0, count: 0 };
        e.qty += it.quantityReceived; e.value += it.quantityReceived * (it.unitPrice || 0); e.count++;
        m.set(cat, e);
      });
    });
    return Array.from(m.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [grnNotes, rawMaterials, branch, branchFilter]);

  const valuationRows = useMemo(() => {
    const qty = new Map<string, number>();
    const qtyByBranch = new Map<string, Map<string, number>>();
    inventoryMovements.forEach((m) => {
      if (!branchFilter(m.branchId)) return;
      qty.set(m.rawMaterialId, (qty.get(m.rawMaterialId) || 0) + m.delta);
      const bm = qtyByBranch.get(m.rawMaterialId) || new Map<string, number>();
      bm.set(m.branchId, (bm.get(m.branchId) || 0) + m.delta);
      qtyByBranch.set(m.rawMaterialId, bm);
    });
    return rawMaterials.filter((r) => r.isActive && (qty.get(r.id) || 0) > 0)
      .map((r) => {
        const value = Array.from((qtyByBranch.get(r.id) || new Map<string, number>()).entries())
          .reduce((s, [bid, bq]) => s + bq * getBranchAverageUnitCost(bid, r.id), 0);
        const q = qty.get(r.id)!;
        const price = q > 0 ? value / q : 0;
        return { id: r.id, name: r.nameAr, code: r.code, unit: r.unit, qty: q, price, value, cat: r.category };
      })
      .sort((a, b) => b.value - a.value);
  }, [rawMaterials, inventoryMovements, branch, branchFilter, getBranchAverageUnitCost]);

  const plRows = useMemo(() => plSummaries
    .filter((p) => branchFilter(p.branchId))
    .sort((a, b) => b.period.localeCompare(a.period)), [plSummaries, branch, branchFilter]);

  // ======================= تحويل لـ ProSpec ==========================
  const toProSpec = (title: string, subtitle: string, tables: ProTable[], kpis?: { label: string; value: string }[]): ProReportSpec => ({
    title,
    subtitle,
    orientation: tables.some((t) => t.columns.length >= 9) ? 'landscape' : 'portrait',
    meta: {
      'الفرع / مركز التكلفة': branch === 'all' ? 'كل الفروع' : getBranchName(branch),
      'تاريخ الإصدار': new Date().toLocaleDateString('ar-SA-u-nu-latn'),
    },
    summaryKpis: kpis,
    tables,
    footer: 'تقارير الإدارة المتكاملة — RestoCost ERP Pro',
  });

  const download = async (name: string, spec: ProReportSpec) => {
    setBusy(name);
    try {
      const blob = await renderProReport(spec);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      flash(`تم تصدير «${name}» كملف PDF احترافي`);
    } catch { flash('تعذر تصدير PDF'); }
    finally { setBusy(null); }
  };

  const csv = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(`${name}.csv`, header, rows);
    flash(`تم تصدير ${name} CSV`);
  };

  const valSum = valuationRows.reduce((s, r) => s + r.value, 0);
  const wastSum = wastageRows.reduce((s, w) => s + w.totalCostImpact, 0);
  const majorSum = majorGroup.reduce((s, [, e]) => s + e.value, 0);

  const exhibits: Exhibit[] = [
    {
      id: 'supplier_ledger', icon: <Truck className="w-5 h-5 text-indigo-500" />,
      title: 'كشف حساب الموردين', subtitle: 'الفواتير، إرجاعات الموردين، والمدفوعات مع الرصيد التراكمي لكل مورد',
      columns: [
        { key: 'supplier', label: 'المورد' }, { key: 'date', label: 'التاريخ', type: 'date' },
        { key: 'desc', label: 'البيان' }, { key: 'ref', label: 'رقم المستند' },
        { key: 'debit', label: 'مدين', type: 'money' }, { key: 'credit', label: 'دائن', type: 'money' },
        { key: 'balance', label: 'الرصيد', type: 'money' },
      ],
      rows: supplierLedger.rows,
      csvHeader: ['المورد', 'التاريخ', 'البيان', 'رقم المستند', 'مدين', 'دائن', 'الرصيد'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'المورد' }, { title: 'التاريخ', type: 'date' }, { title: 'البيان' }, { title: 'رقم المستند' }, { title: 'مدين', type: 'money' }, { title: 'دائن', type: 'money' }, { title: 'الرصيد', type: 'money' }],
          rows: supplierLedger.rows.map((r) => (r._total ? [r.supplier, '', '', '', '', '', r.balance] : [r.supplier, r.date, r.desc, r.ref, r.debit, r.credit, r.balance]) as RowCell[]),
        };
        pro.totalsLabel = 'الإجمالي العام';
        pro.totals = ['', '', '', '', supplierLedger.totals.debit, supplierLedger.totals.credit, ''];
        return toProSpec('كشف حساب الموردين', `${supplierLedger.count} مورد — ${branch === 'all' ? 'كل الفروع' : getBranchName(branch)}`, [pro], [{ label: 'عدد الموردين', value: String(supplierLedger.count) }]);
      },
    },
    {
      id: 'major_group', icon: <Boxes className="w-5 h-5 text-violet-500" />,
      title: 'قوائم المجموعات الرئيسية — المشتريات', subtitle: 'تجميع مشتريات الاستلام محاسبياً حسب مجموعات المواد الرئيسية',
      columns: [
        { key: 'group', label: 'المجموعة الرئيسية' }, { key: 'count', label: 'عدد البنود', type: 'num' },
        { key: 'qty', label: 'الكمية', type: 'num' }, { key: 'value', label: 'قيمة المشتريات', type: 'money' },
      ],
      rows: majorGroup.map(([cat, e]) => ({ group: categoryLabel(cat, materialCategories), count: e.count, qty: e.qty, value: e.value })),
      csvHeader: ['المجموعة الرئيسية', 'عدد البنود', 'الكمية', 'قيمة المشتريات'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'المجموعة الرئيسية' }, { title: 'عدد البنود', type: 'num' }, { title: 'الكمية', type: 'num' }, { title: 'قيمة المشتريات', type: 'money' }],
          rows: majorGroup.map(([cat, e]) => [categoryLabel(cat, materialCategories), e.count, e.qty, e.value]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', majorGroup.reduce((s, [, e]) => s + e.count, 0), mayorQty(majorGroup), majorSum];
        return toProSpec('قوائم المجموعات الرئيسية — المشتريات', 'تجميع محاسبي حسب المجموعات', [pro], [{ label: 'إجمالي المشتريات', value: fmtMoney(majorSum) }]);
      },
    },
    {
      id: 'movement', icon: <Activity className="w-5 h-5 text-sky-500" />,
      title: 'حركة المخزون التفصيلية', subtitle: 'كل حركات الأصناف (استلام/صرف/تحويل/جرد) عبر الفروع',
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'name', label: 'الصنف' }, { key: 'branch', label: 'الفرع' },
        { key: 'type', label: 'نوع الحركة' }, { key: 'delta', label: 'الكمية', type: 'num' }, { key: 'ref', label: 'مرجع' },
      ],
      rows: movementRows.map((m) => ({ date: m.date, name: getRawMaterialName(m.rawMaterialId), branch: getBranchName(m.branchId), type: m.type, delta: m.delta, ref: m.ref || '' })),
      csvHeader: ['التاريخ', 'الصنف', 'الفرع', 'نوع الحركة', 'الكمية', 'المرجع'],
      spec: () => toProSpec('حركة المخزون التفصيلية', 'كل حركات الأصناف عبر الفروع', [{
        columns: [{ title: 'التاريخ', type: 'date' }, { title: 'الصنف' }, { title: 'الفرع' }, { title: 'نوع الحركة' }, { title: 'الكمية', type: 'num' }, { title: 'مرجع' }],
        rows: movementRows.map((m) => [m.date, getRawMaterialName(m.rawMaterialId), getBranchName(m.branchId), m.type, m.delta, m.ref || '']),
      }]),
    },
    {
      id: 'wastage', icon: <AlertTriangle className="w-5 h-5 text-rose-500" />,
      title: 'تقرير الهوالك والفاقد', subtitle: 'الهدر عبر الأصناف مع الأثر المالي والتصنيف',
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'item', label: 'الصنف' }, { key: 'branch', label: 'الفرع' },
        { key: 'cat', label: 'التصنيف' }, { key: 'qty', label: 'الكمية', type: 'num' }, { key: 'cost', label: 'الأثر المالي', type: 'money' },
      ],
      rows: wastageRows.map((w) => ({ date: w.date, item: w.itemName, branch: getBranchName(w.branchId), cat: WASTAGE_LABELS[w.category], qty: w.quantity, cost: w.totalCostImpact })),
      csvHeader: ['التاريخ', 'الصنف', 'الفرع', 'التصنيف', 'الكمية', 'الأثر المالي'],
      spec: () => toProSpec('تقرير الهوالك والفاقد', 'الهدر مع الأثر المالي', [{
        columns: [{ title: 'التاريخ', type: 'date' }, { title: 'الصنف' }, { title: 'الفرع' }, { title: 'التصنيف' }, { title: 'الكمية', type: 'num' }, { title: 'الأثر المالي', type: 'money' }],
        rows: wastageRows.map((w) => [w.date, w.itemName, getBranchName(w.branchId), WASTAGE_LABELS[w.category], w.quantity, w.totalCostImpact]),
      }], [{ label: 'إجمالي الهدر', value: fmtMoney(wastSum) }]),
    },
    {
      id: 'valuation', icon: <Wallet className="w-5 h-5 text-emerald-500" />,
      title: 'تقييم المخزون الحالي', subtitle: 'الأرصدة الحالية وقيمتها بأسعار الوحدة المعيارية',
      columns: [
        { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' }, { key: 'cat', label: 'المجموعة' },
        { key: 'qty', label: 'الكمية', type: 'num' }, { key: 'unit', label: 'الوحدة' }, { key: 'price', label: 'سعر الوحدة', type: 'money' }, { key: 'value', label: 'القيمة', type: 'money' },
      ],
      rows: valuationRows.map((r) => ({ code: r.code, name: r.name, cat: categoryLabel(r.cat, materialCategories), qty: r.qty, unit: r.unit, price: r.price, value: r.value })),
      csvHeader: ['الرمز', 'الصنف', 'المجموعة', 'الكمية', 'الوحدة', 'سعر الوحدة', 'القيمة'],
      spec: () => toProSpec('تقييم المخزون الحالي', 'الأرصدة والقيمة بأسعار الوحدة المعيارية', [{
        columns: [{ title: 'الرمز' }, { title: 'الصنف' }, { title: 'المجموعة' }, { title: 'الكمية', type: 'num' }, { title: 'الوحدة' }, { title: 'سعر الوحدة', type: 'money' }, { title: 'القيمة', type: 'money' }],
        rows: valuationRows.map((r) => [r.code, r.name, categoryLabel(r.cat, materialCategories), r.qty, r.unit, r.price, r.value]),
      }], [{ label: 'إجمالي قيمة المخزون', value: fmtMoney(valSum) }]),
    },
    {
      id: 'pl', icon: <BarChart3 className="w-5 h-5 text-indigo-500" />,
      title: 'قائمة الدخل برسوم احترافية', subtitle: 'المبيعات والتكاليف وهامش الربح لكل فترة وفرع',
      columns: [
        { key: 'period', label: 'الفترة' }, { key: 'branch', label: 'الفرع' }, { key: 'sales', label: 'المبيعات', type: 'money' },
        { key: 'food', label: 'تكلفة الطعام', type: 'money' }, { key: 'labor', label: 'العمالة', type: 'money' },
        { key: 'opex', label: 'التشغيلية', type: 'money' }, { key: 'net', label: 'صافي الربح', type: 'money' }, { key: 'margin', label: 'الهامش', type: 'pct' },
      ],
      rows: plRows.map((p) => ({ period: p.period, branch: p.branchName, sales: p.totalSales, food: p.foodCost, labor: p.laborCost, opex: p.operatingExpenses, net: p.netProfit, margin: p.netProfitPercent })),
      csvHeader: ['الفترة', 'الفرع', 'المبيعات', 'تكلفة الطعام', 'العمالة', 'التشغيلية', 'صافي الربح', 'الهامش'],
      spec: () => toProSpec('قائمة الدخل', 'المبيعات والتكاليف وهامش الربح', [{
        columns: [{ title: 'الفترة' }, { title: 'الفرع' }, { title: 'المبيعات', type: 'money' }, { title: 'تكلفة الطعام', type: 'money' }, { title: 'العمالة', type: 'money' }, { title: 'التشغيلية', type: 'money' }, { title: 'صافي الربح', type: 'money' }, { title: 'الهامش', type: 'pct' }],
        rows: plRows.map((p) => [p.period, p.branchName, p.totalSales, p.foodCost, p.laborCost, p.operatingExpenses, p.netProfit, p.netProfitPercent]),
      }]),
    },
  ];

  const cellText = (v: RowCell | boolean, type?: string) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') {
      if (type === 'money') return fmtMoney(v);
      if (type === 'pct') return `${fmt(v)}%`;
      return fmt(v);
    }
    return String(v);
  };

  const ExhibitCard: React.FC<{ ex: Exhibit }> = ({ ex }) => {
    const totalRows = ex.rows.filter((r) => !!r._total);
    const bodyRows = ex.rows.filter((r) => !r._total);
    const print = () => openPrintWindow({
      title: ex.title, subtitle: branch === 'all' ? 'كل الفروع' : getBranchName(branch),
      meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['التاريخ', new Date().toLocaleDateString()]],
      tables: [{ title: ex.title, header: ex.columns.map((c) => c.label), rows: ex.rows.map((r) => ex.columns.map((c) => { const v = r[c.key]; return typeof v === 'boolean' ? '' : (v ?? ''); })) }],
      footer: 'RestoCost ERP Pro — تقارير احترافية',
    });
    return (
      <Card className="p-4">
        <SectionHeader
          title={ex.title} subtitle={ex.subtitle} icon={ex.icon}
          extra={
            <div className="flex gap-1.5">
              <button title="تصدير PDF احترافي" onClick={() => download(ex.title, ex.spec())} disabled={busy === ex.id} className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 disabled:opacity-40">
                {busy === ex.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              </button>
              <button title="تصدير CSV" onClick={() => csv(ex.title, ex.csvHeader, ex.rows.map((r) => ex.columns.map((c) => String(r[c.key] ?? ''))))} className="p-1.5 text-indigo-500 hover:text-indigo-700 rounded-lg hover:bg-indigo-50"><FileSpreadsheet className="w-4 h-4" /></button>
              <button title="طباعة" onClick={print} className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"><Printer className="w-4 h-4" /></button>
            </div>
          }
        />
        {bodyRows.length === 0 ? (
          <p className="text-xs text-slate-400 font-bold py-4 text-center">لا توجد بيانات لهذا التقرير</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead><tr className="bg-slate-50 text-slate-500 font-bold border-b border-line">{ex.columns.map((c, i) => <th key={i} className="p-2 text-right whitespace-nowrap">{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bodyRows.map((r, ri) => (
                  <tr key={ri} className="hover:bg-slate-50">
                    {ex.columns.map((c, ci) => (
                      <td key={ci} className={`p-2 whitespace-nowrap ${c.type === 'money' || c.type === 'num' ? 'font-mono font-bold text-slate-800' : 'text-slate-600'}`}>{cellText(r[c.key], c.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {totalRows.length > 0 && (
                <tfoot>{totalRows.map((r, ri) => (
                  <tr key={ri} className="bg-slate-800 text-white font-extrabold">
                    {ex.columns.map((c, ci) => <td key={ci} className={`p-2 whitespace-nowrap ${c.type === 'money' || c.type === 'num' ? 'font-mono' : ''}`}>{cellText(r[c.key], c.type)}</td>)}
                  </tr>
                ))}</tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير الاحترافية المتكاملة"
        subtitle="مستندات PDF مصمّمة باحترافية (ترويسة موحدة + ترقيم صفحات + تنسيق أعمدة) لكل تقرير على حدة — جاهزة للطباعة والاعتماد"
        icon={<FileText className="w-6 h-6 text-indigo-300" />}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">الفرع:</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-800 !w-56">
              <option value="all">كل الفروع</option>
              {allBranches.map((b) => <option key={b.id} value={b.id}>{getBranchName(b.id)}</option>)}
            </select>
          </div>
        }
      />
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{msg}</div>}
      <div className="space-y-6">
        {exhibits.map((ex) => <ExhibitCard key={ex.id} ex={ex} />)}
      </div>
    </div>
  );
};

const mayorQty = (rows: [string, { qty: number }][]) => Number(rows.reduce((s, [, e]) => s + e.qty, 0).toFixed(2));
void Btn;
