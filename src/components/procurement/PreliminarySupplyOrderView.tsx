import React, { useMemo, useState } from 'react';
import { Send, BadgeDollarSign, PackageSearch, Eye, XCircle, UserPlus, AlertTriangle, Printer, ShieldCheck, Truck, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn } from '../ui';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { sendPreliminaryPoPdfToBot, poTelegramText } from '../../utils/purchaseDocs';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'معلّق بعد الجرد',
  approved: 'معتمد — جاهز للاستلام',
  partially_received: 'استلام جزئي',
  received: 'تم الاستلام بالكامل',
  cancelled: 'ملغى',
};
const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-sky-100 text-sky-700',
  approved: 'bg-emerald-100 text-emerald-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-700 text-white',
  cancelled: 'bg-rose-100 text-rose-700',
};

export const PreliminarySupplyOrderView: React.FC = () => {
  const { purchaseOrders, suppliers, getBranchName, updatePurchaseOrder, addSupplier, showToast } = useApp();
  const [newSupplier, setNewSupplier] = useState<{ name: string; phone: string }>({ name: '', phone: '' });

  const rows = useMemo(
    () => purchaseOrders.filter((p) => p.poType === 'preliminary').sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [purchaseOrders],
  );
  const active = rows.filter((p) => p.status !== 'cancelled');

  const totalValue = active.reduce((s, p) => s + p.totalAmount, 0);
  const deliveredCount = active.filter((p) => p.status === 'received').length;
  const waitingSupplier = rows.filter((p) => !p.supplierId && p.status !== 'cancelled').length;

  const poProgress = (po: typeof rows[number]) => {
    const total = po.items.reduce((s, i) => s + (i.quantity || 0), 0);
    const recv = po.items.reduce((s, i) => s + (i.receivedQty || 0), 0);
    const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
    const remaining = total - recv;
    const recvValue = po.items.reduce((s, i) => s + (i.receivedQty || 0) * (i.unitPrice || 0), 0);
    return { total, recv, pct, remaining, remainingValue: po.totalAmount - recvValue, recvValue, pendingItems: po.items.filter((i) => (i.receivedQty || 0) < (i.quantity || 0)).length };
  };

  const api = async (path: string, body?: unknown) => {
    const token = localStorage.getItem('rcerp_token');
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    return res ? res.json().catch(() => ({ ok: false })) : { ok: false };
  };

  const sendPO = async (poId: string) => {
    const po = rows.find((p) => p.id === poId);
    if (!po) return;
    const text = poTelegramText(po, getBranchName(po.branchId));
    const r = await api('/api/telegram/send', { text, channel: 'purchase' });
    const docRes = await sendPreliminaryPoPdfToBot(po, text, getBranchName(po.branchId));
    if (!docRes.ok) showToast(docRes.error || 'أُرسل النص ولكن تعذر إرسال PDF');
    if (r.ok) showToast('أُرسل أمر التوريد المبدئي نصًّا وPDF لمجموعة المشتريات');
    else showToast('تعذر الإرسال — تأكد من إعداد مجموعة المشتريات في إعدادات تليجرام');
  };

  const approvePO = (poId: string) => {
    const po = rows.find((p) => p.id === poId);
    if (!po) return;
    updatePurchaseOrder(poId, { status: 'approved' });
    showToast(`اعتمد أمر التوريد ${po.poNumber} — تحوّل لأمر توريد قابل للاستلام من شاشة «إذن استلام المواد» (استلام كلي أو جزئي)`);
  };

  const printPO = (po: typeof rows[number]) => {
    const prog = poProgress(po);
    const statusLabel = STATUS_LABELS[po.status] || po.status;
    openPrintWindow({
      title: `أمر توريد مبدئي — ${po.poNumber}`,
      subtitle: STATUS_LABELS[po.status] || po.status,
      compact: true,
      meta: [
        ['الفرع', getBranchName(po.branchId)],
        ['المورد', po.supplierName || 'غير مسجل بعد'],
        ['التاريخ', po.orderDate],
        ['المصدر', po.sourceRequestId ? 'طلب شراء' : '—'],
        ['البنود', `${po.items.length} صنف`],
        ['الحالة', statusLabel],
      ],
      tables: [{
        title: `البنود — المستلم ${fmt(prog.recv)} من ${fmt(prog.total)} (وحدة مخزون)`,
        header: ['#', 'الصنف', 'كمية الشراء', 'سعر وحدة الشراء', 'الإجمالي', 'المستلم', 'المتبقي'],
        rows: po.items.map((i, idx) => {
          const conv = i.purchaseUnitConversion || 1;
          const recv = i.receivedQty || 0;
          return [
            idx + 1,
            i.materialName,
            `${fmt(i.purchaseQty ?? i.quantity / conv)} ${i.purchaseUnit || i.unit}`,
            fmtMoney(i.unitPrice * conv),
            fmtMoney(i.lineTotal),
            recv > 0 ? fmt(recv) : '—',
            recv >= i.quantity ? 'مكتمل' : fmt((i.quantity || 0) - recv),
          ];
        }),
      }],
      totals: [
        ['الإجمالي', fmtMoney(po.totalAmount)],
        ['قيمة المستلم', fmtMoney(prog.recvValue)],
        ['المتبقي', fmtMoney(prog.remainingValue)],
        ['التسليم', prog.remaining > 0 ? `${prog.pct}% منجز — ${prog.pendingItems} بند معلّق` : 'مكتمل'],
      ],
      footer: `أمر توريد مبدئي بسعر أقل سعر استلام خلال 30 يوماً — القيمة النهائية عند الاستلام`,
    });
  };

  const assignSupplier = (poId: string, supplierId: string) => {
    if (!supplierId) return;
    const s = suppliers.find((x) => x.id === supplierId);
    if (!s) return;
    updatePurchaseOrder(poId, { supplierId: s.id, supplierName: s.name });
    showToast(`أُسند الأمر للمورد ${s.name} — يمكنك الآن اعتماده وإرساله`);
  };

  const registerSupplier = (poId: string) => {
    const name = newSupplier.name.trim();
    if (!name) {
      showToast('أدخل اسم المورد الجديد');
      return;
    }
    const created = addSupplier({ name, phone: newSupplier.phone.trim(), contactPerson: '', email: '', rating: 4, paymentTermsDays: 30, categories: [], isActive: true });
    updatePurchaseOrder(poId, { supplierId: created.id, supplierName: created.name, notes: `مورد جديد سُجّل لأمر توريد (بنود بلا سجل شراء سابق) — ${poId}` });
    setNewSupplier({ name: '', phone: '' });
    showToast(`سُجّل المورد الجديد ${created.name} وأُسند للأمر`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="أوامر التوريد المبدئي"
        subtitle="أوامر شراء مشتقّة من طلبات الشراء بعد الجرد بسعر «أقل سعر استلام خلال 30 يوماً» وموردها الفعلي — تعتمدها فتحوّل لأمر توريد يُستلم من شاشة «إذن استلام المواد» استلاماً كلياً أو جزئياً، وتتبع منجزها ومعلقها (الأصناف بلا سجل شراء سابق تتطلب تسجيل مورد جديد أولاً)"
        icon={<BadgeDollarSign className="w-6 h-6 text-emerald-600" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أوامر التوريد المبدئي</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{rows.length}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">القيمة التقديرية</span>
          <strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalValue)}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
          <span className="text-slate-500 text-[11px] block">تم استلامه بالكامل</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{deliveredCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">بانتظار تسجيل مورد</span>
          <strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{waitingSupplier}</strong>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((po) => {
          const noSupplier = !po.supplierId;
          const supplier = suppliers.find((s) => s.id === po.supplierId);
          const prog = poProgress(po);
          const canApprove = po.status === 'submitted' && !noSupplier;
          const canReceive = po.status === 'approved';
          const isDelivered = po.status === 'received';
          return (
            <Card key={po.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-extrabold text-slate-900 flex items-center gap-2">
                    <PackageSearch className="w-4 h-4 text-emerald-600" />
                    <span className="font-mono text-indigo-700">{po.poNumber}</span>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">مبدئي</span>
                    {noSupplier && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">بلا مورد — يتطلب التسجيل</span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[po.status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[po.status] || po.status}</span>
                  </p>
                  <p className="text-slate-500 font-bold mt-1 text-xs">
                    {po.supplierName || <span className="inline-flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5" /> مورد غير مسجل</span>} — فرع {getBranchName(po.branchId)} — {po.orderDate}
                    {po.sourceRequestId ? ' — مصدره طلب شراء' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {canApprove && (
                    <Btn tone="success" onClick={() => approvePO(po.id)}><ShieldCheck className="w-4 h-4" /> اعتماد</Btn>
                  )}
                  {canReceive && (
                    <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <Truck className="w-4 h-4" /> يُستلم من «إذن استلام المواد»
                    </span>
                  )}
                  <Btn tone="ghost" onClick={() => printPO(po)}><Printer className="w-4 h-4" /> طباعة</Btn>
                  <Btn tone="ghost" disabled={noSupplier || po.status === 'cancelled'} onClick={() => sendPO(po.id)}><Send className="w-4 h-4" /> إرسال للبوت</Btn>
                </div>
              </div>

              {noSupplier && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs space-y-3">
                  <p className="flex items-center gap-2 font-extrabold text-amber-800">
                    <AlertTriangle className="w-4 h-4" />
                    بنود هذه المجموعة بلا سجل شراء سابق — لا يمكن نسبها لأي مورد تلقائياً. سجّل مورداً جديداً (أو اختر أحد الموردين) ثم اعتمد الأمر.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs font-bold bg-white"
                      defaultValue=""
                      onChange={(e) => assignSupplier(po.id, e.target.value)}
                    >
                      <option value="">اختر مورداً موجوداً…</option>
                      {suppliers.filter((s) => s.isActive).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <span className="text-amber-600 font-bold">أو</span>
                    <input
                      className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs font-bold bg-white w-40"
                      placeholder="اسم المورد الجديد"
                      value={newSupplier.name}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))}
                    />
                    <input
                      className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs font-bold bg-white w-32"
                      placeholder="رقم الهاتف"
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))}
                    />
                    <button
                      onClick={() => registerSupplier(po.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-3 py-1.5 font-extrabold text-[11px] hover:bg-amber-700"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> تسجيل مورد جديد وإسناده
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto mt-3">
                <table className="w-full text-right text-xs min-w-[820px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">الصنف</th>
                      <th className="p-2">الكمية بوحدة الشراء</th>
                      <th className="p-2">سعر وحدة الشراء</th>
                      <th className="p-2">الإجمالي</th>
                      <th className="p-2">المستلم</th>
                      <th className="p-2">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {po.items.map((i) => {
                      const conv = i.purchaseUnitConversion || 1;
                      const puPrice = i.unitPrice * conv;
                      const recv = i.receivedQty || 0;
                      const remaining = (i.quantity || 0) - recv;
                      return (
                        <tr key={i.rawMaterialId + i.materialName}>
                          <td className="p-2 font-bold text-slate-900">{i.materialName}</td>
                          <td className="tnum text-left p-2 font-bold text-indigo-700">{fmt(i.purchaseQty ?? i.quantity / conv)} {i.purchaseUnit || i.unit}</td>
                          <td className="tnum text-left p-2 text-slate-700">{fmtMoney(puPrice)}</td>
                          <td className="tnum text-left p-2 text-slate-700">{fmtMoney(i.lineTotal)}</td>
                          <td className="tnum text-left p-2 text-emerald-700 font-bold">{recv > 0 ? fmt(recv) : '—'}</td>
                          <td className="tnum text-left p-2 text-slate-500">{remaining > 0 ? fmt(remaining) : <span className="text-emerald-600 font-bold">مكتمل</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* تتبع التنفيذ */}
              {po.status !== 'draft' && po.status !== 'cancelled' && (
                <div className="pt-3 border-t border-slate-100 mt-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${isDelivered ? 'bg-emerald-600' : prog.pct > 0 ? 'bg-amber-500' : 'bg-sky-400'}`}
                        style={{ width: `${prog.pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-extrabold font-mono text-slate-700 w-16 text-left">{prog.pct}%</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 mt-2 flex items-center gap-1 flex-wrap">
                    {isDelivered
                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> تم استلام الأمر بالكامل ({fmt(prog.total)} وحدة مخزون).</>
                      : prog.recv > 0
                        ? <><AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> استلام جزئي: {fmt(prog.recv)} من {fmt(prog.total)} وحدة — متبقي {fmt(prog.remaining)} ({prog.pendingItems} بند معلّق). أكمله من «إذن استلام المواد».</>
                        : `معلّق — ينتظر الاعتماد${canApprove ? '' : po.status === 'approved' ? ' ثم الاستلام من «إذن استلام المواد»' : ' (أكمل تسجيل المورد أولاً)'}.`}
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[11px] font-bold text-slate-500">
                  {supplier ? `المورد: ${supplier.phone ? `${supplier.phone} — ` : ''}${supplier.isActive ? 'نشط' : 'موقوف'}` : 'بانتظار تسجيل مورد جديد'}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-slate-900">الإجمالي: <span className="font-mono text-emerald-700">{fmtMoney(po.totalAmount)}</span></span>
                  {po.status === 'submitted' && (
                    <button onClick={() => updatePurchaseOrder(po.id, { status: 'cancelled' })} className="flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg px-2 py-1">
                      <XCircle className="w-3.5 h-3.5" /> إلغاء
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card className="p-10 text-center">
            <div className="flex flex-col items-center gap-3">
              <Eye className="w-10 h-10 text-slate-300" />
              <p className="text-slate-400 font-bold text-sm">لا توجد أوامر توريد مبدئية — حوّل طلب شراء من شاشة «طلبات الشراء»</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};