import React, { useState } from 'react';
import { PackageSearch, Plus, BadgeCheck, Truck, XCircle, Send, Ban, PackagePlus, RotateCcw, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, StatusPill, CurrencySelect, AutocompleteSelect, EmptyState } from '../ui';
import { SignaturePad } from '../ui/SignaturePad';
import { fmt, fmtMoney, PO_STATUS_LABELS, downloadCSV, navOnEnter } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { PurchaseOrderItem } from '../../types';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ApprovalPathBar, type ApprovalStepDef, type ApprovalTerminalType } from '../ui/ApprovalPath';

/* مسار اعتماد موحّد لأمر الشراء (بند 41) */
const PO_PATH: { steps: Record<'draft' | 'review' | 'approve' | 'post', ApprovalStepDef>; terminal: { type: ApprovalTerminalType; label: string } } = {
  steps: { draft: { id: 'draft', label: 'مسودة' }, review: { id: 'submitted', label: 'مراجعة' }, approve: { id: 'approved', label: 'اعتماد' }, post: { id: 'received', label: 'ترحيل' } },
  terminal: { type: 'rejected', label: 'مرفوض' },
};

export const PurchaseOrdersView: React.FC = () => {
  const { purchaseOrders, suppliers, rawMaterials, branches, visibleBranchIds, addPurchaseOrder, updatePurchaseOrder, receivePurchaseOrder, recordPurchaseReceipt, vatPercent, vatInclusive, can, getBranchName, currentUser, getQuotePrice, currencies, getCurrencyRate, addRecentDoc } = useApp();
  const [filterBranch, setFilterBranch] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [expandedPo, setExpandedPo] = useState<string | null>(null);
  const poBarCurrent = (st: string) => (st === 'partially_received' ? 'received' : st);

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [branchId, setBranchId] = useState(visibleBranchIds[0] || '');
  const [expectedDate, setExpectedDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [partialReceivePO, setPartialReceivePO] = useState<typeof purchaseOrders[number] | null>(null);
  const [partialReceiveQtys, setPartialReceiveQtys] = useState<Record<number, number>>({});
  const [signPo, setSignPo] = useState<typeof purchaseOrders[number] | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const filtered = filterBranch === 'all' ? purchaseOrders : purchaseOrders.filter((p) => p.branchId === filterBranch);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  const vatAmount = vatInclusive ? (total * vatPercent) / (100 + vatPercent) : (total * vatPercent) / 100;

  const addItem = () => {
    const mat = rawMaterials[0];
    if (!mat) return;
    const price = getQuotePrice(supplierId, mat.id) ?? mat.standardPrice;
    setItems((prev) => [...prev, { rawMaterialId: mat.id, materialName: mat.nameAr, quantity: 0, unit: mat.unit, unitPrice: price, lineTotal: 0 }]);
  };

  const updateItem = (idx: number, patch: Partial<PurchaseOrderItem>) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.lineTotal = merged.quantity * merged.unitPrice;
      return merged;
    }));
  };

  const selectSupplier = (id: string) => {
    setSupplierId(id);
    setItems((prev) => prev.map((it) => {
      const quote = getQuotePrice(id, it.rawMaterialId);
      const merged = quote !== undefined ? { ...it, unitPrice: quote } : it;
      merged.lineTotal = merged.quantity * merged.unitPrice;
      return merged;
    }));
  };

  const onCurrencyChange = (code: string) => {
    setCurrencyCode(code);
    setExchangeRate(getCurrencyRate(code));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier || items.length === 0 || items.some((i) => i.quantity <= 0)) return;
    addPurchaseOrder({
      supplierId: supplier.id, supplierName: supplier.name, branchId, orderDate: new Date().toISOString().split('T')[0],
      expectedDate: expectedDate || new Date().toISOString().split('T')[0], status: 'submitted', items, totalAmount: total,
      requestedBy: requestedBy || 'المستخدم', notes,
      currencyCode: currencyCode !== 'SAR' ? currencyCode : undefined,
      exchangeRate: currencyCode !== 'SAR' ? exchangeRate : undefined,
    });
    addRecentDoc({ type: 'order', title: `أمر شراء — ${supplier.name}`, tab: 'purchase_orders' });
    setItems([]); setShowModal(false); setRequestedBy(''); setNotes(''); setExpectedDate(''); setCurrencyCode('SAR'); setExchangeRate(1);
  };

  const printPO = (p: typeof purchaseOrders[number]) => {
    const sym = p.currencyCode ? currencies.find((c) => c.code === p.currencyCode)?.symbol || p.currencyCode : 'ر.س';
    openPrintWindow({
      title: `أمر شراء — ${p.poNumber}`,
      subtitle: PO_STATUS_LABELS[p.status],
      meta: [
        ['المورد', p.supplierName],
        ['الفرع', p.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(p.branchId)],
        ['تاريخ الطلب', p.orderDate],
        ['التسليم المتوقع', p.expectedDate],
        ['طلب بواسطة', p.requestedBy],
        ['عدد الأصناف', `${p.items.length}`],
        ...(p.currencyCode ? ([['عملة المستند', p.currencyCode], ['سعر الصرف', String(p.exchangeRate || 0)]] as [string, string][]) : []),
      ],
      tables: [{
        title: 'الأصناف المطلوبة',
        header: ['#', 'الصنف', 'الكمية بوحدة الشراء', 'المعادل بوحدة التخزين', 'سعر الوحدة', 'الإجمالي'],
        rows: p.items.map((it, idx) => [idx + 1, it.materialName, it.purchaseQty && it.purchaseUnit ? `${it.purchaseQty} ${it.purchaseUnit}` : `${it.quantity} ${it.unit}`, `${it.quantity} ${it.unit}`, `${fmt(it.unitPrice)} ${sym}`, `${fmt(it.lineTotal)} ${sym}`]),
      }],
      totals: [
        [p.currencyCode ? `إجمالي أمر الشراء (${p.currencyCode})` : 'إجمالي أمر الشراء', `${fmtMoney(p.totalAmount)}`],
        ...(p.currencyCode ? ([['المعادل بالريال (ر.س)', `${fmtMoney(p.totalAmount * (p.exchangeRate || 0))}`]] as [string, string][]) : []),
      ],
      footer: p.notes ? `ملاحظات: ${p.notes}` : 'أمر شراء صادر من RestoCost ERP',
    });
  }

  const openPartialReceive = (po: typeof purchaseOrders[number]) => {
    if (po.status !== 'approved' && po.status !== 'partially_received') return;
    setPartialReceivePO(po);
    setPartialReceiveQtys({});
  };

  const submitPartialReceive = () => {
    if (!partialReceivePO) return;
    const itemsReceived: { rawMaterialId: string; quantity: number }[] = [];
    partialReceivePO.items.forEach((it, idx) => {
      const qty = partialReceiveQtys[idx] || 0;
      if (qty > 0) itemsReceived.push({ rawMaterialId: it.rawMaterialId, quantity: qty });
    });
    if (itemsReceived.length === 0) return;
    recordPurchaseReceipt(partialReceivePO.id, itemsReceived);
    setPartialReceivePO(null);
    setPartialReceiveQtys({});
  };

  return (
    <div className="space-y-6">
      <PageHeader title="أوامر الشراء (Purchase Orders)" subtitle="إنشاء أوامر الشراء ومتابعتها من التقديم حتى الاستلام مع ربط مباشر بالمخزون" icon={<PackageSearch className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="أوامر_الشراء"
            sheets={[
              { name: 'أوامر الشراء', header: ['رقم PO', 'المورد', 'الفرع', 'تاريخ الطلب', 'المتوقع', 'عدد الأصناف', 'المبلغ', 'العملة', 'معادل الريال', 'الحالة', 'طلب بواسطة', 'ملاحظات'], rows: filtered.map((p) => [p.poNumber, p.supplierName, p.branchId === 'b-ck' ? 'المطبخ المركزي' : p.branchId, p.orderDate, p.expectedDate, p.items.length, fmt(p.totalAmount), p.currencyCode || 'SAR', fmt(p.totalAmount * (p.exchangeRate || 0)), PO_STATUS_LABELS[p.status], p.requestedBy, p.notes || '']) },
              { name: 'أصناف الأوامر', header: ['رقم PO', 'المورد', 'الصنف', 'الكمية بوحدة الشراء', 'المعادل بوحدة التخزين', 'سعر الوحدة', 'الإجمالي'], rows: filtered.flatMap((p) => p.items.map((i) => [p.poNumber, p.supplierName, i.materialName, i.purchaseQty && i.purchaseUnit ? `${i.purchaseQty} ${i.purchaseUnit}` : `${i.quantity} ${i.unit}`, `${i.quantity} ${i.unit}`, fmt(i.unitPrice), fmt(i.lineTotal)])) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Purchase_Orders.csv', ['رقم PO', 'المورد', 'الفرع', 'التاريخ', 'الحالة', 'المبلغ'], filtered.map((p) => [p.poNumber, p.supplierName, p.branchId, p.orderDate, p.status, fmt(p.totalAmount)]))}>تصدير CSV</Btn>
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> أمر شراء جديد</Btn>
        </>} />

      <Card className="p-4 flex items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
      </Card>

      <div className="mb-2">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <ApprovalPathBar caption="مسار اعتماد أوامر الشراء (الضغط على صف أي مستند يعرض مساره وأزرار التقدم)" steps={[PO_PATH.steps.draft, PO_PATH.steps.review, PO_PATH.steps.approve, PO_PATH.steps.post]} current="__legend__" terminal={PO_PATH.terminal} compact />
          <div className="text-[11px] font-bold text-slate-500 mt-2">المسودات تنشأ من "إعادة الطلب الذكية" في التكلفة الحقيقية، أو يدوياً بـ"أمر شراء جديد".</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {(['draft', 'submitted', 'approved', 'partially_received', 'received', 'rejected'] as const).map((st) => (
          <div key={st} className={`bg-white p-4 rounded-xl border shadow-xs ${st === 'draft' ? 'border-amber-200' : st === 'rejected' ? 'border-rose-200' : 'border-slate-200'}`}>
            <span className="text-slate-500 text-[11px] block">{PO_STATUS_LABELS[st]}</span>
            <strong className={`text-lg font-extrabold block mt-1 ${st === 'draft' ? 'text-amber-600' : st === 'rejected' ? 'text-rose-600' : 'text-slate-900'}`}>{purchaseOrders.filter((p) => p.status === st).length}</strong>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-line">
              {/* الأرقام (الطلب/المتوقع/الأصناف/المبلغ) محاذاة يسار + tnum */}
              <tr><th className="p-3 text-right">رقم PO</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-left">الطلب</th><th className="p-3 text-left">المتوقع</th><th className="p-3 text-left">الأصناف</th><th className="p-3 text-left">المبلغ</th><th className="p-3 text-left">العملة</th><th className="p-3 text-center">الحالة</th><th className="p-3 text-center">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filtered.map((p) => (
                <React.Fragment key={p.id}>
                {/* الصف لا يفتح بالنقر — قاعدة النظام: الفتح بزر «تفاصيل» صريح. كان
                    onClick على الصف، فينفتح أثناء سحب النص أو نقر عابر. */}
                <tr className={`hover:bg-slate-50 ${expandedPo === p.id ? 'bg-primary-50/50' : ''}`}>
                  <td className="p-3 font-mono font-bold text-primary-700">{p.poNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{p.supplierName}</td>
                  <td className="p-3 text-slate-600">{p.branchId === 'b-ck' ? 'المطبخ المركزي' : p.branchId}</td>
                  <td className="p-3 text-left tnum text-slate-600">{p.orderDate}</td>
                  <td className="p-3 text-left tnum text-slate-600">{p.expectedDate}</td>
                  <td className="p-3 text-left tnum font-bold">{p.items.length}</td>
                  <td className="p-3 text-left tnum font-extrabold text-slate-900">{fmtMoney(p.totalAmount)}</td>
                  <td className="p-3 text-left tnum text-amber-700">{p.currencyCode || 'SAR'}</td>
                  <td className="p-3"><StatusPill status={p.status} map={PO_STATUS_LABELS} /></td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      {/* الأيقونات للثانوي (اعتماد/رفض/استلام)، والنصّ للرئيسي.
                          فلا حاجة لـstopPropagation بعد إزالة نقر الصف. */}
                      {p.status === 'draft' && (
                        <>
                          <button onClick={() => updatePurchaseOrder(p.id, { status: 'submitted', approvedBy: undefined })} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إرسال للاعتماد"><Send className="w-4 h-4" /></button>
                          <button onClick={() => updatePurchaseOrder(p.id, { status: 'cancelled' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="إلغاء المسودة"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      {p.status === 'submitted' && (
                        <>
                          {can('approve_purchase_orders') && (
                            <>
                              <button onClick={() => { setSignPo(p); setSignature(null); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="اعتماد"><BadgeCheck className="w-4 h-4" /></button>
                              <button onClick={() => updatePurchaseOrder(p.id, { status: 'rejected', approvedBy: currentUser?.name || 'المدير' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض"><Ban className="w-4 h-4" /></button>
                            </>
                          )}
                        </>
                      )}
                      {(p.status === 'approved' || p.status === 'partially_received') && (
                        <>
                          <button onClick={() => openPartialReceive(p)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="استلام جزئي"><PackagePlus className="w-4 h-4" /></button>
                          <button onClick={() => receivePurchaseOrder(p.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="استلام كامل ورفع للمخزون"><Truck className="w-4 h-4" /></button>
                        </>
                      )}
                      {(p.status === 'cancelled' || p.status === 'rejected') && can('delete_data') && (
                        <button onClick={() => updatePurchaseOrder(p.id, { status: 'cancelled' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => printPO(p)} className="text-[11px] font-bold text-primary-600 hover:underline">طباعة</button>
                      <button
                        onClick={() => setExpandedPo((cur) => (cur === p.id ? null : p.id))}
                        className="text-[11px] font-bold text-primary-600 hover:underline inline-flex items-center gap-1"
                      >
                        {expandedPo === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        تفاصيل
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedPo === p.id && (
                  <tr className="border-t-0 bg-slate-50/70">
                    <td colSpan={10} className="p-3">
                      <ApprovalPathBar
                        caption={`مسار اعتماد ${p.poNumber}`}
                        steps={[PO_PATH.steps.draft, PO_PATH.steps.review, PO_PATH.steps.approve, PO_PATH.steps.post]}
                        current={poBarCurrent(p.status)}
                        statusLabel={PO_STATUS_LABELS[p.status]}
                        terminal={p.status === 'cancelled' ? { type: 'cancelled', label: 'ملغى' } : PO_PATH.terminal}
                        compact
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-extrabold text-slate-500">المعتمِد: <span className="text-slate-800">{p.approvedBy || (p.status === 'approved' || p.status === 'partially_received' || p.status === 'received' ? 'غير محدد' : '—')}</span></span>
                        {p.approvalSignature && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold text-slate-500">التوقيع الإلكتروني:</span>
                            <img src={p.approvalSignature} alt="توقيع الاعتماد" className="h-11 w-28 object-contain bg-white border border-slate-200 rounded-lg p-0.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="p-0"><EmptyState title="لا توجد أوامر شراء" subtitle="أنشئ أمر شراء جديد لتبدأ" icon={<Package className="w-5 h-5" />} compact /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="إنشاء أمر شراء جديد" wide>
        <form onSubmit={submit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="المورد" required>
              <select value={supplierId} onChange={(e) => selectSupplier(e.target.value)} className={inputCls}>
                {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="الفرع" required>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="تاريخ التسليم المتوقع"><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputCls} /></Field>
            <Field label="طلب بواسطة"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="عملة المستند" hint="التسعير والكميات تُسجل بعملة المستند">
              <CurrencySelect value={currencyCode} onChange={onCurrencyChange} />
            </Field>
            {currencyCode !== 'SAR' && (
              <Field label={`سعر الصرف (1 ${currencyCode} = ... ر.س)`} required>
                <input type="number" min="0" step="0.0001" value={exchangeRate || ''} onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} className={inputCls} required />
              </Field>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">أصناف الأمر</span>
              <Btn onClick={addItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
            </div>
            {items.length > 0 && (
              <div className="border border-line rounded-xl overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 w-9 text-center">#</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-right">المادة الخام</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-center w-24">الكمية</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-center w-16">الوحدة</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-center w-28">سعر الوحدة</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-left w-28">الإجمالي</th>
                      <th className="px-2 py-2 w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-2 py-1 text-center mono text-slate-400 text-xs">{idx + 1}</td>
                        <td className="px-2 py-1">
                          <AutocompleteSelect
                            value={item.rawMaterialId}
                            onChange={(val) => { const m = rawMaterials.find((x) => x.id === val); updateItem(idx, { rawMaterialId: val, materialName: m?.nameAr || '', unit: m?.unit || '' }); }}
                            options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                            getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                            placeholder="— اختر مادة خام —"
                            className="w-full"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" data-nav value={item.quantity || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => {
                            const qty = parseFloat(e.currentTarget.value) || 0;
                            updateItem(idx, { quantity: qty, lineTotal: qty * (item.unitPrice || 0) });
                          }} onKeyDown={navOnEnter} className={inputCls + ' text-center tnum'} placeholder="الكمية" />
                        </td>
                        <td className="px-2 py-1 text-center text-xs text-slate-600">{item.unit || '—'}</td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" data-nav value={item.unitPrice || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => {
                            const price = parseFloat(e.currentTarget.value) || 0;
                            updateItem(idx, { unitPrice: price, lineTotal: (item.quantity || 0) * price });
                          }} onKeyDown={navOnEnter} className={inputCls + ' text-center tnum'} placeholder="السعر" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" data-nav value={item.lineTotal || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => {
                            const total = parseFloat(e.currentTarget.value) || 0;
                            const qty = item.quantity || 0;
                            updateItem(idx, { lineTotal: total, unitPrice: qty > 0 ? total / qty : 0 });
                          }} onKeyDown={navOnEnter} className={inputCls + ' text-center tnum font-bold'} placeholder="الإجمالي" />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 p-1">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-right font-bold text-slate-600 text-xs bg-slate-50 border-t-2 border-line">الإجمالي</td>
                      <td className="px-2 py-2.5 text-left tnum font-extrabold text-xs bg-slate-50 border-t-2 border-line">{fmtMoney(total)}</td>
                      <td className="bg-slate-50 border-t-2 border-line" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {items.length === 0 && <p className="text-center text-slate-400 text-xs py-3">أضف أصنافاً للأمر</p>}
          </div>

          <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>

          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-indigo-950">صافي قيمة الأصناف</span>
              <span className="font-mono font-extrabold text-indigo-800">{fmtMoney(vatInclusive ? total - vatAmount : total)}{currencyCode !== 'SAR' && <span className="text-[10px] text-indigo-500 mr-1">({currencyCode})</span>}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-indigo-950">ضريبة القيمة المضافة ({vatPercent}%) {vatInclusive ? '(مشمولة)' : ''}</span>
              <span className="font-mono font-extrabold text-amber-700">{fmtMoney(vatAmount)}{currencyCode !== 'SAR' && <span className="text-[10px] text-amber-500 mr-1">({currencyCode})</span>}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-indigo-200 pt-1.5">
              <span className="font-black text-indigo-950">إجمالي الأمر:</span>
              <span className="text-lg font-black text-indigo-800 font-mono">{fmtMoney(total)}</span>
            </div>
            {currencyCode !== 'SAR' && (
              <div className="flex justify-between items-center text-xs bg-white/60 rounded-lg px-2 py-1">
                <span className="font-bold text-indigo-950">المعادل بالريال (ر.س) — للقيد المحاسبي</span>
                <span className="font-mono font-extrabold text-emerald-700">{fmtMoney(total * exchangeRate)}</span>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">تقديم أمر الشراء</button>
          </div>
        </form>
      </Modal>

      {partialReceivePO && (
        <Modal open onClose={() => setPartialReceivePO(null)} title={`استلام جزئي — ${partialReceivePO.poNumber}`} wide>
          <div className="space-y-4">
            <p className="text-xs text-slate-500">المورد: {partialReceivePO.supplierName} | الفرع: {getBranchName(partialReceivePO.branchId)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">مطلوب</th>
                    <th className="p-3">مستلم مسبقاً</th>
                    <th className="p-3">باقي</th>
                    <th className="p-3">الكمية المستلمة الآن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {partialReceivePO.items.map((it, idx) => {
                    const received = it.receivedQty || 0;
                    const remaining = it.quantity - received;
                    return remaining > 0 && (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{it.materialName}</td>
                        <td className="p-3 font-mono">{fmt(it.quantity)}</td>
                        <td className="p-3 font-mono">{fmt(received)}</td>
                        <td className="p-3 font-mono font-bold text-amber-700">{fmt(remaining)}</td>
                        <td className="p-3">
                          <input type="number" min="0" max={String(remaining)} step="any" data-nav value={partialReceiveQtys[idx] || ''} onChange={(e) => setPartialReceiveQtys((prev) => ({ ...prev, [idx]: parseFloat(e.target.value) || 0 }))} className={inputCls + ' w-full'} placeholder={String(remaining)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Btn tone="ghost" onClick={() => setPartialReceivePO(null)}><RotateCcw className="w-4 h-4" /> إلغاء</Btn>
              <Btn tone="success" onClick={submitPartialReceive}><PackagePlus className="w-4 h-4" /> تأكيد الاستلام الجزئي</Btn>
            </div>
          </div>
        </Modal>
      )}

      {signPo && (
        <Modal open onClose={() => setSignPo(null)} title={`الاعتماد الإلكتروني — ${signPo.poNumber}`}>
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex justify-between items-center">
              <div>
                <p className="font-extrabold text-indigo-950">{signPo.supplierName}</p>
                <p className="text-[11px] text-indigo-600 font-bold">المسؤول: {currentUser?.name || 'مستخدم النظام'}</p>
              </div>
              <span className="font-mono font-black text-indigo-800 text-sm">{fmtMoney(signPo.totalAmount)}</span>
            </div>
            <SignaturePad value={signature} onChange={setSignature} label="ارسم توقيعك هنا (باللمس أو الفأرة)" />
            <p className="text-[10px] text-slate-400 font-bold">بالمصادقة بالرسم هنا، تُقرّ بصحة أمر الشراء {signPo.poNumber} وموافقتك عليه بالكامل.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Btn tone="ghost" onClick={() => setSignPo(null)}><XCircle className="w-4 h-4" /> إلغاء</Btn>
              <Btn
                tone="success"
                disabled={!signature}
                onClick={() => {
                  updatePurchaseOrder(signPo.id, { status: 'approved', approvedBy: currentUser?.name || 'المدير', approvalSignature: signature || undefined });
                  setSignPo(null);
                }}
              >
                <BadgeCheck className="w-4 h-4" /> اعتماد وتوقيع
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};