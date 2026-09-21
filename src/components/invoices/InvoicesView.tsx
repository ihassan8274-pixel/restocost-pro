import React, { useState } from 'react';
import { FileText, Plus, CheckCircle2, Printer, Pencil, Trash2, Receipt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, CurrencySelect, EmptyState } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, navOnEnter } from '../../utils/helpers';
import { vatSplit } from '../../utils/vat';
import { openPrintWindow } from '../../utils/print';
import { sellerFor, zatcaTLV, zatcaQrDataUrl, zatcaTime } from '../../utils/zatca';
import { InvoiceStatus, InvoiceType } from '../../types';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'مسودة', issued: 'صادرة', paid: 'مدفوعة', partially_paid: 'مدفوعة جزئياً', overdue: 'متأخرة', cancelled: 'ملغاة',
};

export const InvoicesView: React.FC = () => {
  const { invoices, customers, suppliers, branches, companies, addInvoice, updateInvoice, deleteInvoice, recordInvoicePayment, getBranchName, visibleBranchIds, getCurrencyRate, vatPercent, vatInclusive } = useApp();
  const [filter, setFilter] = useState<'all' | InvoiceType>('all');
  const [showModal, setShowModal] = useState(false);
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const invoiceVat = (gross: number) => vatSplit(gross, vatPercent / 100, vatInclusive);

  const [form, setForm] = useState({
    type: 'sales' as InvoiceType, branchId: visibleBranchIds[0] || '', partyId: '', partyName: '',
    date: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10),
    subtotal: 0, paidAmount: 0, reference: '', notes: '',
    currencyCode: 'SAR', exchangeRate: 1,
  });

  const filtered = filter === 'all' ? invoices : invoices.filter((i) => i.type === filter);
  const receivables = invoices.filter((i) => i.type === 'sales' && (i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue')).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
  const payables = invoices.filter((i) => i.type === 'purchase' && (i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue')).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partyId) return;
    const party = form.type === 'sales'
      ? customers.find((c) => c.id === form.partyId)
      : suppliers.find((s) => s.id === form.partyId);
    if (!party) return;
    const { vat, total, net } = invoiceVat(form.subtotal);
    addInvoice({
      type: form.type, branchId: form.branchId, partyId: form.partyId, partyName: party.name,
      date: form.date, dueDate: form.dueDate, subtotal: net, vatAmount: vat,
      totalAmount: total, paidAmount: form.paidAmount || 0,
      status: form.paidAmount ? 'partially_paid' : 'issued', reference: form.reference, notes: form.notes, createdBy: 'المستخدم',
      currencyCode: form.currencyCode !== 'SAR' ? form.currencyCode : undefined,
      exchangeRate: form.currencyCode !== 'SAR' ? form.exchangeRate : undefined,
    });
    setShowModal(false);
  };

  const parties = form.type === 'sales' ? customers : suppliers;

  const editTarget = editId ? invoices.find((i) => i.id === editId) : null;
  const openEdit = (i: typeof invoices[number]) => {
    setForm({ type: i.type, branchId: i.branchId, partyId: i.partyId, partyName: i.partyName || '', date: i.date, dueDate: i.dueDate, subtotal: vatInclusive ? i.totalAmount : i.subtotal, paidAmount: i.paidAmount, reference: i.reference || '', notes: i.notes || '', currencyCode: i.currencyCode || 'SAR', exchangeRate: i.exchangeRate || 1 });
    setEditId(i.id);
  };
  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editTarget) return;
    const { vat, total, net } = invoiceVat(form.subtotal);
    updateInvoice(editId, {
      type: form.type, branchId: form.branchId, partyId: form.partyId, partyName: form.partyName,
      date: form.date, dueDate: form.dueDate, subtotal: net, vatAmount: vat,
      totalAmount: total, paidAmount: form.paidAmount || 0,
      reference: form.reference, notes: form.notes,
      currencyCode: form.currencyCode !== 'SAR' ? form.currencyCode : undefined,
      exchangeRate: form.currencyCode !== 'SAR' ? form.exchangeRate : undefined,
    });
    setEditId(null);
  };

  const previewQr = async (i: typeof invoices[number]) => {
    const seller = sellerFor(companies, branches, i.branchId);
    if (!seller.vatNumber) return;
    const url = await zatcaQrDataUrl(zatcaTLV({ sellerName: seller.name, vatNumber: seller.vatNumber, timeISO: zatcaTime(i.date), totalWithVat: i.totalAmount, vatAmount: i.vatAmount }));
    setQrPreview(url);
  };

  const printInvoice = async (i: typeof invoices[number]) => {
    const seller = sellerFor(companies, branches, i.branchId);
    let qr: string | undefined;
    if (i.type === 'sales' && seller.vatNumber) {
      qr = await zatcaQrDataUrl(zatcaTLV({ sellerName: seller.name, vatNumber: seller.vatNumber, timeISO: zatcaTime(i.date), totalWithVat: i.totalAmount, vatAmount: i.vatAmount }));
    }
    openPrintWindow({
      title: `فاتورة ${i.type === 'sales' ? 'مبيعات' : 'مشتريات'} — ${i.invoiceNumber}`,
      subtitle: STATUS_LABELS[i.status],
      meta: [
        ['الطرف', i.partyName],
        ['النوع', i.type === 'sales' ? 'فاتورة مبيعات' : 'فاتورة مشتريات'],
        ['الفرع', getBranchName(i.branchId)],
        ['التاريخ', i.date],
        ['الاستحقاق', i.dueDate],
        ['المرجع', i.reference || '—'],
        ['أُنشئت بواسطة', i.createdBy],
        ...(i.currencyCode ? ([['عملة الفاتورة', i.currencyCode], ['سعر الصرف', String(i.exchangeRate || 0)]] as [string, string][]) : []),
      ],
      tables: [{
        title: 'ملخص الفاتورة',
        header: ['البيان', 'القيمة'],
        rows: [
          ['الإجمالي قبل الضريبة', `${fmt(i.subtotal, 2)} ${i.currencyCode || 'ر.س'}`],
          ['ضريبة القيمة المضافة', `${fmt(i.vatAmount, 2)} ${i.currencyCode || 'ر.س'}`],
          ['إجمالي الفاتورة', `${fmt(i.totalAmount, 2)} ${i.currencyCode || 'ر.س'}`],
          ['المدفوع', `${fmt(i.paidAmount, 2)} ${i.currencyCode || 'ر.س'}`],
          ['المتبقي', `${fmt(i.totalAmount - i.paidAmount, 2)} ${i.currencyCode || 'ر.س'}`],
        ],
      }],
      totals: [
        ['المبلغ الإجمالي', `${fmtMoney(i.totalAmount)}${i.currencyCode ? ` (${i.currencyCode})` : ''}`],
        ['المتبقي', `${fmtMoney(i.totalAmount - i.paidAmount)}${i.currencyCode ? ` (${i.currencyCode})` : ''}`],
        ...(i.currencyCode ? ([['المعادل بالريال (ر.س)', `${fmtMoney(i.totalAmount * (i.exchangeRate || 0))}`]] as [string, string][]) : []),
      ],
      footer: i.notes ? `ملاحظات: ${i.notes}` : 'فاتورة صادرة من RestoCost ERP',
      qr,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الفواتير (حسابات القبض والدفع)" subtitle="فواتير المبيعات والمشتريات، التحصيل، والمتابعة" icon={<FileText className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="الفواتير"
            sheets={[
              { name: 'الفواتير', header: ['الرقم', 'النوع', 'الطرف', 'التاريخ', 'الفرع', 'الإجمالي', 'العملة', 'معادل الريال', 'الضريبة', 'المدفوع', 'المتبقي', 'الحالة'], rows: filtered.map((i) => [i.invoiceNumber, i.type === 'sales' ? 'مبيعات' : 'مشتريات', i.partyName, i.date, getBranchName(i.branchId), fmt(i.totalAmount), i.currencyCode || 'SAR', fmt(i.totalAmount * (i.exchangeRate || 0)), fmt(i.vatAmount), fmt(i.paidAmount), fmt(i.totalAmount - i.paidAmount), STATUS_LABELS[i.status]]) },
              { name: 'الملخص', header: ['البند', 'القيمة'], rows: [['مستحقات القبض', fmtMoney(receivables)], ['مستحقات الدفع', fmtMoney(payables)], ['فواتير متأخرة', invoices.filter((i) => i.status === 'overdue').length], ['إجمالي الفواتير', fmtMoney(invoices.reduce((s, i) => s + i.totalAmount, 0))]] },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Invoices.csv', ['الرقم', 'النوع', 'الطرف', 'التاريخ', 'الإجمالي', 'المدفوع', 'الحالة'], filtered.map((i) => [i.invoiceNumber, i.type, i.partyName, i.date, i.totalAmount, i.paidAmount, i.status]))}>تصدير CSV</Btn>
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> فاتورة جديدة</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مستحقات القبض</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmtMoney(receivables)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مستحقات الدفع</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(payables)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">فواتير متأخرة</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{invoices.filter((i) => i.status === 'overdue').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الفواتير</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(invoices.reduce((s, i) => s + i.totalAmount, 0), 0)} ر.س</strong></div>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 flex items-center gap-2">
          {(['all', 'sales', 'purchase'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{f === 'all' ? 'الكل' : f === 'sales' ? 'فواتير المبيعات' : 'فواتير المشتريات'}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الرقم</th><th className="p-3">النوع</th><th className="p-3">الطرف</th><th className="p-3">التاريخ</th><th className="p-3">الفرع</th><th className="p-3">الإجمالي</th><th className="p-3">العملة</th><th className="p-3">المدفوع</th><th className="p-3">المتبقي</th><th className="p-3">الحالة</th><th className="p-3">تحصيل</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-indigo-700">{i.invoiceNumber}</td>
                  <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i.type === 'sales' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{i.type === 'sales' ? 'مبيعات' : 'مشتريات'}</span></td>
                  <td className="p-3 font-bold text-slate-900">{i.partyName}</td>
                  <td className="p-3 font-mono text-slate-600">{i.date}</td>
                  <td className="p-3 text-slate-600">{getBranchName(i.branchId)}</td>
                  <td className="p-3 font-mono font-extrabold text-slate-900">{fmt(i.totalAmount, 2)}</td>
                  <td className="p-3 font-mono text-amber-700">{i.currencyCode || 'SAR'}</td>
                  <td className="p-3 font-mono text-emerald-700">{fmt(i.paidAmount, 2)}</td>
                  <td className="p-3 font-mono text-rose-700">{fmt(i.totalAmount - i.paidAmount, 2)}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{STATUS_LABELS[i.status]}</span></td>
                  <td className="p-3">{(i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue') && i.type === 'sales' ? <Btn onClick={() => { setPayId(i.id); setPayAmount(i.totalAmount - i.paidAmount); }}><CheckCircle2 className="w-3.5 h-3.5" /> تحصيل</Btn> : <span className="text-slate-300">—</span>}                  <button onClick={() => printInvoice(i)} className="mr-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg align-middle" title="طباعة احترافية"><Printer className="w-4 h-4" /></button>
                  {i.type === 'sales' && sellerFor(companies, branches, i.branchId).vatNumber && <button onClick={() => previewQr(i)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg align-middle font-bold text-[10px]" title="عرض رمز ZATCA QR">QR</button>}<button onClick={() => openEdit(i)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg align-middle" title="تعديل الفاتورة"><Pencil className="w-4 h-4" /></button><button onClick={() => {
            if (!window.confirm(`حذف الفاتورة ${i.invoiceNumber}؟ سيُحذف السجل نهائياً.`)) return;
            deleteInvoice(i.id);
          }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg align-middle" title="حذف الفاتورة"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} className="p-0"><EmptyState title="لا توجد فواتير" subtitle="أضف فاتورة جديدة من الإجراءات" icon={<Receipt className="w-5 h-5" />} compact /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="فاتورة جديدة">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="نوع الفاتورة">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvoiceType, partyId: '', partyName: '' })} className={inputCls}>
                <option value="sales">فاتورة مبيعات</option><option value="purchase">فاتورة مشتريات</option>
              </select>
            </Field>
            <Field label="الفرع"><select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>{[{ id: visibleBranchIds[0] || '', nameAr: 'الفرع الرئيسي' }].map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
          </div>
          <Field label={form.type === 'sales' ? 'العميل' : 'المورد'} required>
            <select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })} className={inputCls} required>
              <option value="">اختر {form.type === 'sales' ? 'العميل' : 'المورد'}</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="تاريخ الفاتورة"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="تاريخ الاستحقاق"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={vatInclusive ? 'إجمالي الفاتورة (شامل الضريبة)' : 'الإجمالي قبل الضريبة'}><input type="number" step="any" data-nav value={form.subtotal || ''} onChange={(e) => setForm({ ...form, subtotal: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="مدفوع مسبقاً"><input type="number" step="any" data-nav value={form.paidAmount || ''} onChange={(e) => setForm({ ...form, paidAmount: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="عملة الفاتورة">
              <CurrencySelect value={form.currencyCode} onChange={(code) => setForm({ ...form, currencyCode: code, exchangeRate: getCurrencyRate(code) })} />
            </Field>
            {form.currencyCode !== 'SAR' && (
              <Field label={`سعر الصرف (1 ${form.currencyCode} = ... ر.س)`} required>
                <input type="number" min="0" step="0.0001" value={form.exchangeRate || ''} onChange={(e) => setForm({ ...form, exchangeRate: parseFloat(e.target.value) || 0 })} className={inputCls} required />
              </Field>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 font-bold flex items-center justify-between"><span>ضريبة القيمة المضافة ({vatPercent}%)</span><span className="font-mono text-indigo-700">{fmt(invoiceVat(form.subtotal).vat, 2)}</span></div>
          {form.currencyCode !== 'SAR' && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between"><span className="text-emerald-800">إجمالي الفاتورة بالريال (ر.س)</span><span className="font-mono text-emerald-700">{fmtMoney(invoiceVat(form.subtotal).total * form.exchangeRate)}</span></div>}
          <Field label="مرجع"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} placeholder="رقم مرجعي / أمر شراء" /></Field>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">إصدار الفاتورة</button>
          </div>
        </form>
      </Modal>

      <Modal open={editId !== null} onClose={() => setEditId(null)} title={`تعديل الفاتورة ${editTarget?.invoiceNumber || ''}`}>
        <form onSubmit={submitEdit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="نوع الفاتورة">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvoiceType, partyId: '', partyName: '' })} className={inputCls}>
                <option value="sales">فاتورة مبيعات</option><option value="purchase">فاتورة مشتريات</option>
              </select>
            </Field>
            <Field label="الفرع"><select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>{[{ id: visibleBranchIds[0] || '', nameAr: 'الفرع الرئيسي' }].map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
          </div>
          <Field label={form.type === 'sales' ? 'العميل' : 'المورد'} required>
            <select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })} className={inputCls} required>
              <option value="">اختر {form.type === 'sales' ? 'العميل' : 'المورد'}</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="تاريخ الفاتورة"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="تاريخ الاستحقاق"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={vatInclusive ? 'إجمالي الفاتورة (شامل الضريبة)' : 'الإجمالي قبل الضريبة'}><input type="number" step="any" data-nav value={form.subtotal || ''} onChange={(e) => setForm({ ...form, subtotal: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="المدفوع"><input type="number" step="any" data-nav value={form.paidAmount || ''} onChange={(e) => setForm({ ...form, paidAmount: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="عملة الفاتورة">
              <CurrencySelect value={form.currencyCode} onChange={(code) => setForm({ ...form, currencyCode: code, exchangeRate: getCurrencyRate(code) })} />
            </Field>
            {form.currencyCode !== 'SAR' && (
              <Field label={`سعر الصرف (1 ${form.currencyCode} = ... ر.س)`} required>
                <input type="number" min="0" step="0.0001" value={form.exchangeRate || ''} onChange={(e) => setForm({ ...form, exchangeRate: parseFloat(e.target.value) || 0 })} className={inputCls} required />
              </Field>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 font-bold flex items-center justify-between"><span>ضريبة القيمة المضافة ({vatPercent}%)</span><span className="font-mono text-indigo-700">{fmt(invoiceVat(form.subtotal).vat, 2)}</span></div>
          <Field label="مرجع"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} placeholder="رقم مرجعي / أمر شراء" /></Field>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditId(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ التعديل</button>
          </div>
        </form>
      </Modal>

      <Modal open={payId !== null} onClose={() => setPayId(null)} title="تسجيل دفعة / تحصيل">
        <form onSubmit={(e) => { e.preventDefault(); if (payId) recordInvoicePayment(payId, payAmount); setPayId(null); }} className="space-y-3 text-xs">
          <Field label="المبلغ"><input type="number" step="any" data-nav value={payAmount || ''} onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} onKeyDown={navOnEnter} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setPayId(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">تسجيل الدفعة</button>
          </div>
        </form>
      </Modal>
      <Modal open={qrPreview !== null} onClose={() => setQrPreview(null)} title="رمز التحقق ZATCA">
        {qrPreview && <div className="flex justify-center py-6"><img src={qrPreview} className="w-48 h-48 border rounded-xl shadow" alt="ZATCA QR" /></div>}
      </Modal>
    </div>
  );
};