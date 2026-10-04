import React, { useMemo, useState } from 'react';
import {
  Link2, Unlink, BadgeCheck, AlertTriangle, Wallet,
  CheckCircle2, Scale, Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, EmptyState } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import type { GoodsReceiptNote, PurchaseOrder } from '../../types/procurement';
import type { Invoice } from '../../types/financial';

const TOL_QTY = 1e-3;
const TOL_MONEY = 0.01;

type MatchStatus = 'matched' | 'qty_mismatch' | 'price_mismatch' | 'two_way' | 'no_docs';

const STATUS_META: Record<MatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  matched: { label: 'متطابقة', cls: 'bg-emerald-100 text-emerald-800', icon: <BadgeCheck className="w-3 h-3" /> },
  qty_mismatch: { label: 'اختلاف كميات', cls: 'bg-amber-100 text-amber-800', icon: <Scale className="w-3 h-3" /> },
  price_mismatch: { label: 'اختلاف أسعار/قيم', cls: 'bg-rose-100 text-rose-700', icon: <AlertTriangle className="w-3 h-3" /> },
  two_way: { label: 'تطابق ثنائي (بدون PO)', cls: 'bg-sky-100 text-sky-800', icon: <Link2 className="w-3 h-3" /> },
  no_docs: { label: 'بدون مستندات', cls: 'bg-slate-200 text-slate-700', icon: <Unlink className="w-3 h-3" /> },
};

interface MatchRow {
  inv: Invoice;
  grn?: GoodsReceiptNote;
  po?: PurchaseOrder;
  poQty: number;
  grnQty: number;
  poTotal: number;
  grnTotal: number;
  qtyOk: boolean;
  totalOkPO: boolean;
  totalOkGRN: boolean;
  status: MatchStatus;
}

interface SupplierAging {
  supplierId: string;
  name: string;
  termsDays: number;
  count: number;
  dCurrent: number;
  d30: number;
  d60: number;
  d90: number;
  d90Plus: number;
  total: number;
  oldestDue: string | null;
}

const deriveMatch = (inv: Invoice, grnNotes: GoodsReceiptNote[], purchaseOrders: PurchaseOrder[]): MatchRow => {
  let grn = inv.grnId ? grnNotes.find((g) => g.id === inv.grnId) : undefined;
  if (!grn) grn = grnNotes.find((g) => g.invoiceNumber && g.invoiceNumber === inv.invoiceNumber);
  let po = inv.purchaseOrderId ? purchaseOrders.find((p) => p.id === inv.purchaseOrderId) : undefined;
  const grnMatch = grn;
  if (!po && grnMatch?.purchaseOrderId) po = purchaseOrders.find((p) => p.id === grnMatch.purchaseOrderId);
  if (!grn && po) grn = grnNotes.find((g) => g.purchaseOrderId === po.id);

  const poQty = po ? po.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0;
  const grnQty = grn ? grn.items.reduce((s, i) => s + (i.quantityReceived || 0), 0) : 0;
  const poTotal = po ? (po.totalAmount ?? po.items.reduce((s, i) => s + (i.lineTotal || 0), 0)) : 0;
  const grnTotal = grn?.totalAmount ?? 0;

  const qtyOk = Math.abs(grnQty - poQty) <= TOL_QTY;
  const totalOkPO = po ? Math.abs(inv.totalAmount - poTotal) <= TOL_MONEY : true;
  const totalOkGRN = grn ? Math.abs(inv.totalAmount - grnTotal) <= TOL_MONEY : true;

  let status: MatchStatus;
  if (!grn && !po) status = 'no_docs';
  else if (grn && !po) status = 'two_way';
  else if (!qtyOk) status = 'qty_mismatch';
  else if (!totalOkGRN || !totalOkPO) status = 'price_mismatch';
  else status = 'matched';

  return { inv, grn, po, poQty, grnQty, poTotal, grnTotal, qtyOk, totalOkPO, totalOkGRN, status };
};

export const ThreeWayMatchView: React.FC = () => {
  const { invoices, grnNotes, purchaseOrders, suppliers, updateInvoice, showToast } = useApp();
  const [tab, setTab] = useState<'match' | 'ledger'>('match');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | MatchStatus>('all');
  const [linkInv, setLinkInv] = useState<Invoice | null>(null);
  const [linkGrnId, setLinkGrnId] = useState('');
  const [linkPoId, setLinkPoId] = useState('');

  const purchaseInvoices = useMemo(() => invoices.filter((i) => i.type === 'purchase' && i.status !== 'cancelled' && i.status !== 'draft'), [invoices]);

  const matchRows = useMemo<MatchRow[]>(() => purchaseInvoices.map((inv) => deriveMatch(inv, grnNotes, purchaseOrders)), [purchaseInvoices, grnNotes, purchaseOrders]);

  const filtered = matchRows.filter((r) => {
    if (filterSupplier !== 'all' && r.inv.partyId !== filterSupplier) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const stats = useMemo(() => {
    const count = (s: MatchStatus) => matchRows.filter((r) => r.status === s).length;
    const confirmable = matchRows.filter((r) => !r.inv.matchStatus).length;
    const unpaidTotal = purchaseInvoices.filter((i) => i.paidAmount < i.totalAmount).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    return {
      matched: count('matched'), qty: count('qty_mismatch'), price: count('price_mismatch'),
      twoWay: count('two_way'), noDocs: count('no_docs'), confirmable, unpaidTotal,
    };
  }, [matchRows, purchaseInvoices]);

  const aging = useMemo<SupplierAging[]>(() => {
    const today = new Date();
    const overdueDays = (due: string) => {
      const d = new Date(due);
      if (isNaN(d.getTime())) return 0;
      return Math.floor((today.getTime() - d.getTime()) / 86400000);
    };
    const map = new Map<string, SupplierAging>();
    purchaseInvoices.forEach((inv) => {
      const due = overdueDays(inv.dueDate);
      const outstanding = inv.totalAmount - inv.paidAmount;
      if (outstanding <= 0.001) return;
      let a = map.get(inv.partyId);
      if (!a) {
        const sup = suppliers.find((s) => s.id === inv.partyId);
        a = { supplierId: inv.partyId, name: inv.partyName || sup?.name || inv.partyId, termsDays: sup?.paymentTermsDays || 0, count: 0, dCurrent: 0, d30: 0, d60: 0, d90: 0, d90Plus: 0, total: 0, oldestDue: null };
        map.set(inv.partyId, a);
      }
      a.count += 1;
      a.total += outstanding;
      if (due <= 0) a.dCurrent += outstanding;
      else if (due <= 30) a.d30 += outstanding;
      else if (due <= 60) a.d60 += outstanding;
      else if (due <= 90) a.d90 += outstanding;
      else a.d90Plus += outstanding;
      if (!a.oldestDue || inv.dueDate < a.oldestDue) a.oldestDue = inv.dueDate;
    });
    return Array.from(map.values()).sort((x, y) => y.total - x.total);
  }, [purchaseInvoices, suppliers]);

  const openLink = (r: MatchRow) => {
    setLinkInv(r.inv);
    setLinkGrnId(r.grn?.id || '');
    setLinkPoId(r.po?.id || '');
  };

  const autoSuggest = () => {
    if (!linkInv) return;
    const grn = grnNotes.find((g) => g.invoiceNumber && g.invoiceNumber === linkInv.invoiceNumber);
    if (grn) {
      setLinkGrnId(grn.id);
      if (grn.purchaseOrderId) setLinkPoId(grn.purchaseOrderId);
      showToast('تم العثور على إشعار استلام مطابق لرقم الفاتورة');
    } else {
      showToast('لم يُعثر على إشعار استلام برقم الفاتورة — اختر يدوياً');
    }
  };

  const saveLink = () => {
    if (!linkInv) return;
    const row = deriveMatch({ ...linkInv, grnId: linkGrnId || undefined, purchaseOrderId: linkPoId || undefined }, grnNotes, purchaseOrders);
    const varianceQty = row.grnQty - row.poQty;
    const grnAmount = row.grnTotal || row.inv.totalAmount;
    const varianceAmount = grnAmount - row.inv.totalAmount;
    updateInvoice(linkInv.id, {
      grnId: linkGrnId || undefined,
      purchaseOrderId: linkPoId || undefined,
      matchedQty: row.grnQty || row.poQty || undefined,
      matchedAmount: grnAmount || undefined,
      varianceQty,
      varianceAmount,
      matchStatus: row.status,
      matchDoneAt: new Date().toISOString(),
    });
    showToast(`تم تأكيد المطابقة: ${STATUS_META[row.status].label}`);
    setLinkInv(null);
  };

  const unlink = (inv: Invoice) => {
    updateInvoice(inv.id, { grnId: undefined, purchaseOrderId: undefined, matchStatus: undefined, matchDoneAt: undefined });
    showToast('تم فك الربط — أعد الربط لتأكيد المطابقة');
  };

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || id;
  void supplierName;

  return (
    <div className="space-y-6">
      <PageHeader title="المطابقة الثلاثية ودفتر الدائنين" subtitle="ربط الفاتورة بأمر الشراء وإشعار الاستلام، والتحقق آلياً من تطابق الكميات والقيم — مع متابعة المبالغ المستحقة للموردين بأعمارها" icon={<Link2 className="w-6 h-6 text-emerald-600" />}
        actions={
          <ViewToolbar
            filename="المطابقة_الثلاثية_والدائنين"
            sheets={[
              {
                name: 'المطابقة الثلاثية',
                header: ['رقم الفاتورة', 'المورد', 'التاريخ', 'رقم PO', 'رقم GRN', 'كمية PO', 'كمية GRN', 'قيمة PO', 'قيمة GRN', 'قيمة الفاتورة', 'الحالة'],
                rows: matchRows.map((r) => [r.inv.invoiceNumber, r.inv.partyName, r.inv.date, r.po?.poNumber || '—', r.grn?.grnNumber || '—', fmt(r.poQty), fmt(r.grnQty), fmt(r.poTotal), fmt(r.grnTotal), fmt(r.inv.totalAmount), STATUS_META[r.status].label]),
              },
              {
                name: 'دفتر الدائنين',
                header: ['المورد', 'أيام السداد', 'عدد الفواتير', 'حالية', 'متأخرة 1-30', 'متأخرة 31-60', 'متأخرة 61-90', 'أكثر من 90', 'الإجمالي'],
                rows: aging.map((a) => [a.name, a.termsDays, a.count, fmtMoney(a.dCurrent), fmtMoney(a.d30), fmtMoney(a.d60), fmtMoney(a.d90), fmtMoney(a.d90Plus), fmtMoney(a.total)]),
              },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">فواتير متطابقة (3-way)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{stats.matched}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">اختلافات كميات</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{stats.qty}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">اختلافات أسعار/قيم</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{stats.price}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بلا مستندات / ثنائية</span><strong className="text-lg font-extrabold font-mono text-slate-700 block mt-1">{stats.noDocs + stats.twoWay}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">فواتير بانتظار التأكيد</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{stats.confirmable}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مستحقات الموردين (غير مدفوعة)</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(stats.unpaidTotal)}</strong></div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setTab('match')} className={`px-4 py-2 text-xs font-bold border-b-2 ${tab === 'match' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400'}`}>المطابقة الثلاثية (PO ↔ GRN ↔ فاتورة)</button>
        <button onClick={() => setTab('ledger')} className={`px-4 py-2 text-xs font-bold border-b-2 ${tab === 'ledger' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400'}`}>دفتر الدائنين (أعمار الذمم)</button>
      </div>

      {tab === 'match' && (
        <>
          <Card className="p-4 flex items-center gap-3 text-xs flex-wrap">
            <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className={inputCls + ' !w-56'}>
              <option value="all">جميع الموردين</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | MatchStatus)} className={inputCls + ' !w-52'}>
              <option value="all">جميع الحالات</option>
              {(Object.keys(STATUS_META) as MatchStatus[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
            </select>
            <span className="font-bold text-slate-500 mr-auto">{filtered.length} فاتورة</span>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState title="لا توجد فواتير مشتريات" subtitle="أنشئ فاتورة مشتريات من شاشة الفواتير ثم اربطها بأمر الشراء وإشعار الاستلام هنا" />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">الفاتورة</th><th className="p-3">المورد</th><th className="p-3">PO</th><th className="p-3">GRN</th>
                      <th className="p-3">كمية PO</th><th className="p-3">كمية GRN</th><th className="p-3">قيمة PO</th><th className="p-3">قيمة GRN</th><th className="p-3">قيمة الفاتورة</th><th className="p-3">الحالة</th><th className="p-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((r) => {
                      const meta = STATUS_META[r.status];
                      const confirmed = !!r.inv.matchStatus;
                      return (
                        <tr key={r.inv.id} className={`hover:bg-slate-50 ${r.status === 'qty_mismatch' || r.status === 'price_mismatch' ? 'bg-rose-50/30' : r.status === 'matched' ? 'bg-emerald-50/30' : ''}`}>
                          <td className="p-3">
                            <div className="font-mono font-bold text-indigo-700">{r.inv.invoiceNumber}</div>
                            <div className="text-[10px] text-slate-400">{r.inv.date}{confirmed && <span className="text-emerald-600 font-bold mr-1">· مؤكدة</span>}</div>
                          </td>
                          <td className="p-3 font-bold text-slate-800">{r.inv.partyName}</td>
                          <td className="tnum text-left p-3 text-slate-600">{r.po ? <span className="text-sky-700 font-bold">{r.po.poNumber}</span> : '—'}</td>
                          <td className="tnum text-left p-3 text-slate-600">{r.grn ? <span className="text-emerald-700 font-bold">{r.grn.grnNumber}</span> : '—'}</td>
                          <td className="tnum text-left p-3">{fmt(r.poQty)}</td>
                          <td className={`p-3 font-mono font-extrabold ${r.qtyOk ? 'text-slate-700' : 'text-amber-700'}`}>{fmt(r.grnQty)}</td>
                          <td className="tnum text-left p-3">{fmt(r.poTotal)}</td>
                          <td className="tnum text-left p-3 font-bold">{fmt(r.grnTotal)}</td>
                          <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmt(r.inv.totalAmount)}</td>
                          <td className="p-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${meta.cls}`}>{meta.icon}{meta.label}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => openLink(r)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="ربط/تأكيد المطابقة"><Link2 className="w-4 h-4" /></button>
                              {(r.grn || r.po) && <button onClick={() => unlink(r.inv)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="فك الربط"><Unlink className="w-4 h-4" /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'ledger' && (
        <>
          <Card className="p-4 flex items-center gap-2 text-xs">
            <Wallet className="w-4 h-4 text-amber-600" />
            <span className="font-bold text-slate-600">أعمار الذمم تُحسب من تاريخ الاستحقاق (due date)؛ المتأخر يُصنّف خلال 1-30، 31-60، 61-90، وأكثر من 90 يوماً.</span>
            <span className="font-extrabold text-amber-700 mr-auto">{fmtMoney(aging.reduce((s, a) => s + a.total, 0))} إجمالي مستحقات</span>
          </Card>
          {aging.length === 0 ? (
            <EmptyState title="لا توجد مستحقات للموردين" subtitle="كل فواتير المشتريات مدفوعة بالكامل" />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">المورد</th><th className="p-3">أيام السداد</th><th className="p-3">فواتير</th><th className="p-3">حالية</th><th className="p-3">1-30</th><th className="p-3">31-60</th><th className="p-3">61-90</th><th className="p-3">+90</th><th className="p-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aging.map((a) => {
                      const overdue = a.total - a.dCurrent;
                      return (
                        <tr key={a.supplierId} className={`hover:bg-slate-50 ${overdue > 0 ? (a.d90Plus > 0 ? 'bg-rose-50/50' : a.d60 > 0 ? 'bg-amber-50/50' : 'bg-orange-50/40') : ''}`}>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{a.name}</div>
                            <div className="text-[10px] text-slate-400">{a.oldestDue ? `أقدم استحقاق: ${a.oldestDue}` : ''}</div>
                          </td>
                          <td className="tnum text-left p-3 text-slate-600">{a.termsDays} يوم</td>
                          <td className="tnum text-left p-3 font-bold">{a.count}</td>
                          <td className="tnum text-left p-3 text-emerald-700">{fmtMoney(a.dCurrent)}</td>
                          <td className={`p-3 font-mono ${a.d30 > 0 ? 'font-bold text-amber-700' : 'text-slate-400'}`}>{fmtMoney(a.d30)}</td>
                          <td className={`p-3 font-mono ${a.d60 > 0 ? 'font-bold text-orange-600' : 'text-slate-400'}`}>{fmtMoney(a.d60)}</td>
                          <td className={`p-3 font-mono ${a.d90 > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>{fmtMoney(a.d90)}</td>
                          <td className={`p-3 font-mono ${a.d90Plus > 0 ? 'font-bold text-rose-700' : 'text-slate-400'}`}>{fmtMoney(a.d90Plus)}</td>
                          <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmtMoney(a.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-extrabold text-slate-900">
                      <td className="p-3" colSpan={3}>الإجمالي</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.dCurrent, 0))}</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.d30, 0))}</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.d60, 0))}</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.d90, 0))}</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.d90Plus, 0))}</td>
                      <td className="tnum text-left p-3">{fmtMoney(aging.reduce((s, a) => s + a.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={!!linkInv} onClose={() => setLinkInv(null)} title={linkInv ? `ربط فاتورة ${linkInv.invoiceNumber} وتأكيد المطابقة` : ''}>
        <div className="space-y-3 text-xs">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800">
            <b>{linkInv?.partyName}</b> — إجمالي الفاتورة: <b className="font-mono">{fmtMoney(linkInv?.totalAmount || 0)}</b> بتاريخ {linkInv?.date}
          </div>
          <Field label="إشعار الاستلام (GRN)">
            <div className="flex gap-2">
              <select value={linkGrnId} onChange={(e) => setLinkGrnId(e.target.value)} className={inputCls}>
                <option value="">— بدون GRN —</option>
                {grnNotes.filter((g) => !linkInv || g.supplierId === linkInv.partyId || true).map((g) => (
                  <option key={g.id} value={g.id}>{g.grnNumber} — {g.supplierName} — {fmt(g.totalAmount)} ر.س ({g.date})</option>
                ))}
              </select>
              <Btn tone="ghost" onClick={autoSuggest}><Search className="w-3.5 h-3.5" /> تلقائي</Btn>
            </div>
          </Field>
          <Field label="أمر الشراء (PO)">
            <select value={linkPoId} onChange={(e) => setLinkPoId(e.target.value)} className={inputCls}>
              <option value="">— بدون PO —</option>
              {purchaseOrders.filter((p) => !linkInv || p.supplierId === linkInv.partyId || true).map((p) => (
                <option key={p.id} value={p.id}>{p.poNumber} — {p.supplierName} — {fmt(p.totalAmount)} ر.س</option>
              ))}
            </select>
          </Field>
          {linkInv && (() => {
            const preview = deriveMatch({ ...linkInv, grnId: linkGrnId || undefined, purchaseOrderId: linkPoId || undefined }, grnNotes, purchaseOrders);
            const meta = STATUS_META[preview.status];
            return (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <p className="font-bold text-slate-700">نتيجة المطابقة المتوقعة:</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${meta.cls}`}>{meta.icon}{meta.label}</span>
                {preview.status === 'qty_mismatch' && <p className="text-[11px] text-amber-700">الكميات غير متطابقة: PO {fmt(preview.poQty)} مقابل استلام {fmt(preview.grnQty)}</p>}
                {preview.status === 'price_mismatch' && <p className="text-[11px] text-rose-700">القيّم غير متطابقة: فاتورة {fmt(preview.inv.totalAmount)} مقابل GRN {fmt(preview.grnTotal)} / PO {fmt(preview.poTotal)}</p>}
                {(preview.status === 'matched' || preview.status === 'two_way') && <p className="text-[11px] text-emerald-700">الكميات والقيم مطابقة — يمكن تأكيد المطابقة</p>}
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-3">
            <Btn tone="success" onClick={saveLink} disabled={!linkInv}><BadgeCheck className="w-4 h-4" /> تأكيد المطابقة</Btn>
            <Btn tone="ghost" onClick={() => setLinkInv(null)}>إلغاء</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};