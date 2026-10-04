import React, { useMemo, useState } from 'react';
import { Smartphone, MonitorSpeaker, Minus, Plus, Printer, Send, CreditCard, Banknote, Landmark, CheckCircle2, Search, MapPin, ReceiptText, PartyPopper, Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { fmt, fmtMoney, netOfGross } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import type { CustomerOrder } from '../../types';

const vatPctDefault = 0.15;

const orderWhatsappText = (o: CustomerOrder) =>
  `🍽️ طلب جديد ${o.orderNumber}\n📍 الفرع: ${o.branchName}\n👤 ${o.customerName || 'عميل'}${o.customerPhone ? ` — ${o.customerPhone}` : ''}\n\n` +
  o.items.map((i) => `• ${i.nameAr} ×${i.quantity} = ${i.lineTotal.toFixed(2)} ر.س`).join('\n') +
  `\n\nالإجمالي (شامل الضريبة): ${o.totalGross.toFixed(2)} ر.س\nالصافي: ${o.netTotal.toFixed(2)} ر.س`;

export const printCustomerOrder = (o: CustomerOrder) => {
  openPrintWindow({
    title: `فاتورة طلب ${o.orderNumber}`,
    subtitle: `${o.branchName} — ${new Date(o.createdAt).toLocaleString('ar-EG-u-nu-latn').slice(0, 17)}`,
    compact: true,
    meta: [['الفرع', o.branchName], ['العميل', o.customerName || '-'], ['عدد الأصناف', `${o.items.reduce((s, i) => s + i.quantity, 0)}`], ['الحالة', o.status === 'paid' ? 'مدفوع ✅' : o.status === 'cancelled' ? 'ملغي' : 'بانتظار الدفع']],
    tables: [{
      title: 'الأصناف المطلوبة',
      header: ['#', 'الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي'],
      rows: o.items.map((it, idx) => [idx + 1, it.nameAr, it.quantity, fmt(it.unitPrice, 2), fmt(it.lineTotal, 2)]),
    }],
    totals: [
      ['الصافي قبل الضريبة', `${fmtMoney(o.netTotal)}`],
      ['ضريبة القيمة المضافة', `${fmtMoney(o.vatAmount)}`],
      ['الإجمالي المستحق', `${fmtMoney(o.totalGross)}`],
    ],
    footer: `طلب عميل — RestoCost ERP${o.paymentMethod ? ` • الدفع: ${o.paymentMethod}` : ''}`,
  });
};

export const CustomerOrderView: React.FC = () => {
  const { branches, visibleBranchIds, recipes, vatPercent, addCustomerOrder, updateCustomerOrderStatus, showToast } = useApp();
  const vatRate = vatPercent / 100 || vatPctDefault;

  const saleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck' && b.isActive);
  const [branchId, setBranchId] = useState(saleBranches[0]?.id || '');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'menu' | 'checkout'>('menu');
  const [placed, setPlaced] = useState<CustomerOrder | null>(null);
  const [paid, setPaid] = useState(false);

  const menu = useMemo(() => recipes.filter((r) => r.isActive && !r.isCentralKitchenPrep && (r.actualMenuPrice ?? 0) > 0
    && (catFilter === 'all' || r.category === catFilter)
    && (!search || r.nameAr.includes(search))), [recipes, catFilter, search]);
  const categories = useMemo(() => Array.from(new Set(recipes.filter((r) => r.isActive && !r.isCentralKitchenPrep && (r.actualMenuPrice ?? 0) > 0).map((r) => r.category))), [recipes]);

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([rid, q]) => {
    const r = recipes.find((x) => x.id === rid)!;
    return { recipeId: rid, nameAr: r.nameAr, quantity: q, unitPrice: r.actualMenuPrice, lineTotal: Math.round(q * r.actualMenuPrice * 100) / 100 };
  });
  const gross = lines.reduce((s, l) => s + l.lineTotal, 0);
  const net = netOfGross(gross, vatRate);
  const vatAmt = gross - net;
  const branch = branches.find((b) => b.id === branchId);

  const add = (id: string, d: number) => setCart((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + d) }));

  const placeOrder = () => {
    if (!branchId) { showToast('اختر الفرع'); return; }
    if (!lines.length) { showToast('أضف أصنافاً للطلب'); return; }
    const rec = addCustomerOrder({
      branchId, branchName: branch?.nameAr || branchId, customerName: name.trim(), customerPhone: phone.trim(),
      items: lines, totalGross: Math.round(gross * 100) / 100, vatAmount: Math.round(vatAmt * 100) / 100, netTotal: Math.round(net * 100) / 100,
    });
    setPlaced(rec); setStage('checkout'); setCart({});
  };

  const sendWhatsapp = () => {
    if (!placed) return;
    const digits = (branch?.phone || '').replace(/\D/g, '');
    if (!digits.startsWith('966')) { showToast('رقم هاتف الفرع غير مضبوط بصيغة دولية (966…)'); }
    window.open(`https://wa.me/${digits || ''}?text=${encodeURIComponent(orderWhatsappText(placed))}`, '_blank');
  };

  const payWith = (method: string) => {
    if (!placed) return;
    updateCustomerOrderStatus(placed.id, 'paid', method);
    setPlaced({ ...placed, status: 'paid', paymentMethod: method });
    setPaid(true);
  };

  const newOrder = () => { setPlaced(null); setPaid(false); setName(''); setPhone(''); setStage('menu'); };

  /* ===== شاشة مراقبة طلبات الفروع (لجهاز الفرع — طباعة تلقائية) ===== */
  return (
    <div className="space-y-5">
      <PageHeader title="طلب العميل الذاتي" subtitle="العميل يختار الفرع والأصناف ← فاتورة ← واتساب للفرع + طباعة ← إتمام الدفع" icon={<Smartphone className="w-6 h-6 text-emerald-300" />}
        actions={<Btn tone="ghost" onClick={newOrder}>طلب جديد</Btn>} />

      {stage === 'menu' && (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {saleBranches.map((b) => (
                <button key={b.id} onClick={() => setBranchId(b.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-colors ${branchId === b.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>
                  <MapPin className="w-3.5 h-3.5 inline" /> {b.nameAr}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setCatFilter('all')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${catFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>الكل</button>
              {categories.map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${catFilter === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c}</button>
              ))}
              <div className="relative mr-auto">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف…" className={inputCls + ' pr-8 !w-52'} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {menu.map((r) => (
              <Card key={r.id} className="p-3 flex flex-col">
                <span className="font-bold text-slate-800 text-sm leading-snug">{r.nameAr}</span>
                <span className="text-[10px] text-slate-400">{r.category}</span>
                <strong className="text-emerald-700 font-mono mt-1">{fmtMoney(r.actualMenuPrice)}</strong>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{cart[r.id] || 0}</span>
                  <div className="flex gap-1">
                    <button onClick={() => add(r.id, -1)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg"><Minus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => add(r.id, 1)} className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </Card>
            ))}
            {!menu.length && <Card className="col-span-full p-6 text-center text-slate-400 font-bold">لا توجد أصناف مطابقة</Card>}
          </div>

          <Card className="p-4 space-y-3 sticky bottom-2 border-emerald-200 shadow-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل (اختياري)" className={inputCls} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="جوال العميل (اختياري)" className={inputCls} />
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><span className="text-[10px] text-slate-500 block">الإجمالي شامل الضريبة</span><strong className="font-mono text-emerald-700">{fmtMoney(gross)}</strong></div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2"><span className="text-[10px] text-slate-500 block">الأصناف</span><strong>{lines.reduce((s, l) => s + l.quantity, 0)}</strong></div>
            </div>
            <Btn onClick={placeOrder} tone="primary"><ReceiptText className="w-4 h-4" /> إنشاء الفاتورة ومتابعة الدفع</Btn>
          </Card>
        </>
      )}

      {stage === 'checkout' && placed && (
        <Card className="p-5 max-w-xl mx-auto space-y-4">
          {paid ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-extrabold text-emerald-700 flex items-center gap-2">تم الدفع بنجاح <PartyPopper className="w-5 h-5" /></h3>
              <p className="text-xs text-slate-500 mt-1">{placed.orderNumber} — {fmtMoney(placed.totalGross)} عبر {placed.paymentMethod}</p>
              <div className="flex justify-center gap-2 mt-4">
                <Btn tone="ghost" onClick={() => printCustomerOrder(placed)}><Printer className="w-4 h-4" /> طباعة الفاتورة</Btn>
                <Btn onClick={newOrder}>طلب جديد</Btn>
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-extrabold">فاتورة {placed.orderNumber} — {placed.branchName}</h3>
              <table className="w-full text-right text-xs">
                <thead><tr className="bg-slate-100"><th className="p-2">الصنف</th><th className="p-2">كمية</th><th className="p-2">الإجمالي</th></tr></thead>
                <tbody className="divide-y">{placed.items.map((i) => <tr key={i.recipeId}><td className="p-2 font-bold">{i.nameAr}</td><td className="tnum text-left p-2">{i.quantity}</td><td className="tnum text-left p-2">{fmt(i.lineTotal, 2)}</td></tr>)}</tbody>
              </table>
              <div className="text-left font-bold text-sm space-y-0.5">
                <div>الصافي: {fmtMoney(placed.netTotal)}</div>
                <div>الضريبة ({Math.round(vatRate * 100)}%): {fmtMoney(placed.vatAmount)}</div>
                <div className="text-emerald-700 text-base">المستحق: {fmtMoney(placed.totalGross)}</div>
              </div>
              <div className="border-t pt-3">
                <div className="text-[11px] font-bold text-slate-500 mb-2">إشعار الفرع والدفع:</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Btn tone="ghost" onClick={sendWhatsapp}><Send className="w-4 h-4" /> واتساب الفرع ({branch?.phone || 'بدون رقم'})</Btn>
                  <Btn tone="ghost" onClick={() => printCustomerOrder(placed)}><Printer className="w-4 h-4" /> طباعة هنا</Btn>
                </div>
                <div className="text-[11px] font-bold text-slate-500 mb-2">اختر طريقة الدفع:</div>
                <div className="grid grid-cols-3 gap-2">
                  <Btn onClick={() => payWith('نقدي عند الاستلام')}><Banknote className="w-4 h-4" /> نقدي</Btn>
                  <Btn onClick={() => payWith('تحويل بنكي')}><Landmark className="w-4 h-4" /> تحويل</Btn>
                  <Btn tone="dark" onClick={() => payWith('شبكة / مدى')}><CreditCard className="w-4 h-4" /> شبكة</Btn>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
};

/* ===== مراقب طلبات الفرع: يعرض الطلبات الواردة ويطبع الجديد تلقائياً ===== */
export const BranchOrdersMonitorView: React.FC<{ onNavigate?: (t: string) => void }> = ({ onNavigate }) => {
  const { customerOrders, branches, updateCustomerOrderStatus } = useApp();
  const [autoPrint, setAutoPrint] = useState(false);
  const printedKey = 'rcerp_printed_orders';

  React.useEffect(() => {
    if (!autoPrint) return;
    try {
      const done = new Set<string>(JSON.parse(localStorage.getItem(printedKey) || '[]'));
      const fresh = customerOrders.filter((o) => o.status === 'new' && !done.has(o.id));
      if (!fresh.length) return;
      fresh.forEach((o) => printCustomerOrder(o));
      localStorage.setItem(printedKey, JSON.stringify([...Array.from(done), ...fresh.map((o) => o.id)].slice(-500)));
    } catch { /* ignore */ }
  }, [customerOrders, autoPrint]);

  const today = new Date().toISOString().slice(0, 10);
  const rows = customerOrders.filter((o) => o.createdAt.slice(0, 10) >= today);

  return (
    <div className="space-y-5">
      <PageHeader title="مراقب طلبات الفروع" subtitle="ضع هذه الشاشة على جهاز كل فرع — تُطبع الطلبات الجديدة تلقائياً عند وصولها" icon={<MonitorSpeaker className="w-6 h-6 text-indigo-300" />}
        actions={
          <Btn tone={autoPrint ? 'primary' : 'ghost'} onClick={() => setAutoPrint(!autoPrint)}>
            {autoPrint ? <><Printer className="w-4 h-4" /> الطباعة التلقائية مفعّلة</> : 'تشغيل الطباعة التلقائية'}
          </Btn>
        } />
      <Card className="overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-100 font-bold"><tr><th className="p-2.5">الطلب</th><th className="p-2.5">الوقت</th><th className="p-2.5">الفرع</th><th className="p-2.5">العميل</th><th className="p-2.5">الأصناف</th><th className="p-2.5">الإجمالي</th><th className="p-2.5">الحالة</th><th className="p-2.5">إجراء</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((o) => (
              <tr key={o.id} className={o.status === 'new' ? 'bg-amber-50/60' : ''}>
                <td className="tnum text-left p-2.5 font-bold text-indigo-700">{o.orderNumber}</td>
                <td className="tnum text-left p-2.5">{o.createdAt.slice(11, 16)}</td>
                <td className="p-2.5">{branches.find((b) => b.id === o.branchId)?.nameAr || o.branchName}</td>
                <td className="p-2.5">{o.customerName || '-'}<br /><span className="font-mono text-[10px] text-slate-400">{o.customerPhone}</span></td>
                <td className="p-2.5">{o.items.map((i) => `${i.nameAr} ×${i.quantity}`).join('، ')}</td>
                <td className="tnum text-left p-2.5 font-bold">{fmtMoney(o.totalGross)}</td>
                <td className="p-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : o.status === 'new' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}>{o.status === 'paid' ? `مدفوع • ${o.paymentMethod}` : o.status === 'confirmed' ? 'مؤكد' : <span className="inline-flex items-center gap-1"><Bell className="w-3 h-3" /> جديد</span>}</span></td>
                <td className="p-2.5"><div className="flex gap-1">
                  <button onClick={() => printCustomerOrder(o)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="طباعة"><Printer className="w-4 h-4" /></button>
                  {o.status === 'new' && <button onClick={() => updateCustomerOrderStatus(o.id, 'confirmed')} className="px-2 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200">تأكيد</button>}
                  {o.status !== 'cancelled' && o.status !== 'paid' && <button onClick={() => updateCustomerOrderStatus(o.id, 'cancelled')} className="px-2 text-[10px] font-bold bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100">إلغاء</button>}
                </div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">لا طلبات اليوم بعد — افتح «طلب العميل الذاتي» لإنشاء طلب تجريبي</td></tr>}
          </tbody>
        </table>
      </Card>
      {onNavigate && <Btn tone="ghost" onClick={() => onNavigate('customer_order')}>فتح شاشة طلب العميل</Btn>}
    </div>
  );
};