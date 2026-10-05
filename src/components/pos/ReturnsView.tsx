import React, { useMemo, useState } from 'react';
import { RotateCcw, Undo2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Field, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, navOnEnter } from '../../utils/helpers';

export const ReturnsView: React.FC = () => {
  const { posOrders, posReturns, branches, visibleBranchIds, addPOSReturn } = useApp();
  const [orderId, setOrderId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const visibleOrders = useMemo(
    () => posOrders.filter((o) => visibleBranchIds.includes(o.branchId)),
    [posOrders, visibleBranchIds],
  );

  const order = posOrders.find((o) => o.id === orderId);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;

  const returnedByRecipe = useMemo(() => {
    const map: Record<string, number> = {};
    posReturns.filter((r) => r.orderId === orderId).forEach((r) => r.items.forEach((i) => { map[i.recipeId] = (map[i.recipeId] || 0) + i.quantity; }));
    return map;
  }, [posReturns, orderId]);

  const selectOrder = (id: string) => {
    setOrderId(id);
    const o = posOrders.find((x) => x.id === id);
    const init: Record<string, number> = {};
    o?.items.forEach((i) => { init[i.recipeId] = 0; });
    setQuantities(init);
  };

  const selectedReturnQty = Object.values(quantities).reduce((s, q) => s + (q || 0), 0);
  const returnValue = order ? Object.entries(quantities).reduce((s, [rid, q]) => {
    const sold = order.items.find((i) => i.recipeId === rid);
    return s + (sold && q ? sold.unitPrice * q : 0);
  }, 0) : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) { setMsg({ ok: false, text: 'اختر الطلب أولاً' }); return; }
    const items = Object.entries(quantities).filter(([, q]) => q > 0).map(([recipeId, quantity]) => ({ recipeId, quantity }));
    const res = addPOSReturn(orderId, items, reason);
    setMsg(res.ok ? { ok: true, text: 'تم تسجيل المرتجع واستعادة المخزون' } : { ok: false, text: res.error || 'خطأ' });
    setTimeout(() => setMsg(null), 3500);
    if (res.ok) { setReason(''); Object.keys(quantities).forEach((k) => setQuantities((q) => ({ ...q, [k]: 0 }))); }
  };

  const availableForReturn = (recipeId: string) => {
    const sold = order?.items.find((i) => i.recipeId === recipeId)?.quantity || 0;
    return sold - (returnedByRecipe[recipeId] || 0);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المرتجعات والاسترداد (POS)" subtitle="إرجاع أصناف من طلبات صادرة — استعادة المخزون والمواد الخام تلقائياً مع قيد محاسبي عكسي" icon={<RotateCcw className="w-6 h-6 text-rose-600" />}
        actions={
          <ViewToolbar
            filename="المرتجعات"
            sheets={[
              { name: 'سجل المرتجعات', header: ['الرقم', 'الطلب', 'الفرع', 'التاريخ', 'الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'السبب'], rows: posReturns.flatMap((r) => r.items.map((i) => [r.returnNumber, r.orderNumber, r.branchId, r.date, i.recipeName, i.quantity, i.unitPrice, i.lineTotal, r.reason])) },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المرتجعات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{posReturns.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المرتجعات</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmt(posReturns.reduce((s, r) => s + r.totalAmount, 0))}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مرتجعة</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{posReturns.reduce((s, r) => s + r.items.length, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">طلبات متاحة للإرجاع</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{visibleOrders.length}</strong></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionHeader title="تسجيل مرتجع" subtitle="اختر طلباً ثم حدد الكميات المطلوب إرجاعها" icon={<Undo2 className="w-5 h-5 text-rose-600" />} />
          <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
            <Field label="الطلب" required>
              <select value={orderId} onChange={(e) => selectOrder(e.target.value)} className={inputCls}>
                <option value="">اختر الطلب...</option>
                {visibleOrders.map((o) => (
                  <option key={o.id} value={o.id}>{o.orderNumber} — {branchName(o.branchId)} — {fmt(o.totalAmount)} ر.س</option>
                ))}
              </select>
            </Field>

            {order && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                <div className="grid grid-cols-[1fr_90px_90px_110px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500">
                  <span>الصنف</span><span>المباع</span><span>مرتجع سابقاً</span><span>كمية الإرجاع</span>
                </div>
                {order.items.map((i) => {
                  const avail = availableForReturn(i.recipeId);
                  const over = (quantities[i.recipeId] || 0) > avail;
                  return (
                    <div key={i.recipeId} className={`grid grid-cols-[1fr_90px_90px_110px] gap-2 px-3 py-2 items-center ${over ? 'bg-rose-50' : ''}`}>
                      <span className="font-bold text-slate-800 truncate">{i.recipeName}</span>
                      <span className="font-mono text-slate-600">{fmt(i.quantity)}</span>
                      <span className="font-mono text-slate-400">{returnedByRecipe[i.recipeId] || 0}</span>
                      <input type="number" min="0" step="any" max={avail} data-nav value={quantities[i.recipeId] || ''} onChange={(e) => setQuantities((q) => ({ ...q, [i.recipeId]: parseFloat(e.target.value) || 0 }))} onKeyDown={navOnEnter} className={inputCls} placeholder="0" />
                    </div>
                  );
                })}
              </div>
            )}

            <Field label="سبب الإرجاع">
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="مثال: استرداد عميل / خطأ في الطلب" />
            </Field>

            {msg && <div className={`rounded-xl p-3 font-bold text-xs border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg.text}</div>}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs font-bold text-slate-600">
                الكمية المحددة: <span className="font-mono text-brand-700">{fmt(selectedReturnQty)}</span>
                {' · '}قيمة الاسترداد: <span className="font-mono text-rose-700">{fmt(returnValue)} ر.س</span>
              </div>
              <button type="submit" disabled={selectedReturnQty === 0} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs flex items-center gap-1.5"><Undo2 className="w-4 h-4" /> تسجيل المرتجع</button>
            </div>
            {selectedReturnQty > 0 && order && order.items.some((i) => (quantities[i.recipeId] || 0) > availableForReturn(i.recipeId)) && (
              <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> توجد كمية تتجاوز المتاح للإرجاع</p>
            )}
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="سجل المرتجعات" subtitle="جميع عمليات الاسترداد مع القيود المحاسبية" icon={<RotateCcw className="w-5 h-5 text-rose-600" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الرقم</th><th className="p-3">الطلب</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الأصناف</th><th className="p-3">القيمة</th><th className="p-3">السبب</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="tnum text-left p-3 font-bold text-rose-700">{r.returnNumber}</td>
                    <td className="tnum text-left p-3 text-brand-700">{r.orderNumber}</td>
                    <td className="p-3 text-slate-600">{branchName(r.branchId)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{r.date}</td>
                    <td className="p-3 space-y-1">
                      {r.items.map((i, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{i.recipeName}</span>
                          <span className="font-mono text-slate-500 shrink-0">× {fmt(i.quantity)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="tnum text-left p-3 font-extrabold text-rose-700">{fmt(r.totalAmount)}</td>
                    <td className="p-3 text-slate-500">{r.reason}</td>
                  </tr>
                ))}
                {posReturns.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-bold">لا توجد مرتجعات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};