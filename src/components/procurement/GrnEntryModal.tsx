import React, { useState } from 'react';
import { PackageCheck, Plus, Save, Printer, ScanLine, History, Shield, ArrowLeft } from 'lucide-react';
import { Modal, CurrencySelect } from '../ui';
import { ErpButton } from '../ui/erp';
import { GrnItemsTable } from './GrnItemsTable';
import { GoodsReceiptItem, RawMaterial } from '../../types';
import { fmt, fmtMoney } from '../../utils/helpers';

// ═══════════════════════════════════════════════════════════════════════════
//  نافذة إدخال إشعار استلام — مبنية على docs/design/04-grn-entry.html
// ═══════════════════════════════════════════════════════════════════════════
//
// ملف مستقل بدل 247 سطراً داخل GoodsReceivingView (الملف 1,296 سطراً). السبب:
// كانت النافذة تُرقَّع بأدوات نصّية فوق نصّ سابق، فكل رقعة كانت تُدخل فرقاً
// جديداً بين المعتمد وما بُني فعلاً — والاختبارات لا ترى الفرق، tsс يمرّ،
// والبناء ينجح.
//
// الترتيب هنا مطابق للمعتمد حرفياً:
//   ① الترويسة + مسار الاعتماد
//   ② شريط الأدوات (حفظ · سطر · باركود · Excel · اعتماد · ترحيل)
//   ③ شبكة الحقول (4 أعمدة × 3 صفوف) وفيها الضريبة — لا صندوق منفصل
//   ④ عنوان الأصناف بعدّاد + «تحويل وحدة»
//   ⑤ جدول الأصناف (10 أعمدة + tfoot)
//   ⑥ سطر الملخّص (سطر واحد مختصر، لا بطاقات)
//   ⑦ أزرار الحفظ
//
// اللون: indigo. النموذج المعتمد أزرق، ورمز primary في هذا المشروع برتقالي —
// فاستعمل indigo صريحاً لهذه الشاشة بدل primary.

const APPROVAL_STEPS = [
  { id: 'draft', label: 'مسودة', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'submitted', label: 'مراجعة', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'approved', label: 'اعتماد', tone: 'bg-slate-50 text-slate-500 border-line' },
  { id: 'posted', label: 'ترحيل', tone: 'bg-slate-50 text-slate-500 border-line' },
];

const fieldCls = 'w-full border border-line rounded-lg px-3 py-2 text-xs bg-surface outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500';

export interface GrnEntryModalProps {
  open: boolean;
  onClose: () => void;
  /** نسخة من إشعار سابق — يغيّر العنوان فقط */
  copySource?: string;

  items: GoodsReceiptItem[];
  rowKeys: string[];
  rawMaterials: RawMaterial[];
  convOf: (rawMaterialId: string) => { conv: number; pu: string } | null;
  prefillPrice: (mat: RawMaterial | undefined, branchId: string) => number;
  updateItem: (idx: number, patch: Partial<GoodsReceiptItem>) => void;
  onQty: (idx: number, v: string) => void;
  onPrice: (idx: number, v: string) => void;
  onLineTotal: (idx: number, v: string) => void;
  onRemove: (idx: number) => void;
  onAddOne: () => void;
  onAddFive: () => void;
  qtyKey: (k: string) => string;
  priceKey: (k: string) => string;
  totalKey: (k: string) => string;
  draftVal: (k: string, fallback: string | number) => string;
  clearDraft: (k: string) => void;

  suppliers: { id: string; name: string; isActive?: boolean }[];
  visibleBranches: { id: string; nameAr: string }[];
  availablePOs: { id: string; poNumber: string; supplierName: string; totalAmount: number; status: string; items: { receivedQty?: number; quantity?: number }[] }[];

  supplierId: string;
  onSupplier: (v: string) => void;
  branchId: string;
  onBranch: (v: string) => void;
  purchaseOrderId: string;
  onApplyPO: (v: string) => void;
  onFillHistory: () => void;
  receivedBy: string;
  onReceivedBy: (v: string) => void;
  invoiceNumber: string;
  onInvoiceNumber: (v: string) => void;
  invoiceDate: string;
  onInvoiceDate: (v: string) => void;
  currencyCode: string;
  onCurrency: (code: string) => void;
  exchangeRate: number;
  onExchangeRate: (v: number) => void;
  vatRate: number;
  onVatRate: (v: number) => void;
  vatIncl: boolean;
  onVatIncl: (v: boolean) => void;
  notes: string;
  onNotes: (v: string) => void;

  /** مجاميع محسوبة في الأب (تُستخدم في السطر الختامي) */
  subtotal: number;
  vatAmount: number;
  totalAmount: number;

  onSaveDraft: () => void;
  onSaveApprove: () => void;
  canApprove: boolean;
  onScan: () => void;
  onImportExcel: () => void;
}

export const GrnEntryModal: React.FC<GrnEntryModalProps> = (p) => {
  const [showDistribute, setShowDistribute] = useState(false);
  const [invoiceTotalInput, setInvoiceTotalInput] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const qtyTotal = p.items.reduce((s, i) => s + (Number(i.quantityReceived) || 0), 0);
  const net = p.vatIncl ? p.subtotal - p.vatAmount : p.subtotal;

  const Label: React.FC<{ children: React.ReactNode; required?: boolean; className?: string }> = ({ children, required, className = '' }) => (
    <div className={className}>
      <label className="block text-[11px] font-bold text-slate-500 mb-1">
        {children} {required && <span className="text-rose-600">*</span>}
      </label>
    </div>
  );

  return (
    <Modal open={p.open} onClose={p.onClose} title="إشعار استلام جديد" xl closeOnOverlayClick={false}>
      <div className="-mx-6 -my-4">

        {/* ═══ ① الترويسة + مسار الاعتماد ═══ */}
        <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <PackageCheck className="w-6 h-6" />
            </span>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">
                {p.copySource ? 'نسخة من إشعار' : 'إشعار استلام جديد (GRN)'}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">أدخل الأصناف المستلمة — الكمية بوحدة التخزين</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] font-bold text-slate-500">المسار:</span>
            {APPROVAL_STEPS.map((st, i) => (
              <React.Fragment key={st.id}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.tone}`}>
                  {i + 1} · {st.label}
                </span>
                {i < APPROVAL_STEPS.length - 1 && <ArrowLeft className="w-3 h-3 text-slate-300" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ═══ ② شريط الأدوات ═══ */}
        <div className="px-6 py-3 border-b border-line bg-slate-50 flex flex-wrap items-center gap-2">
          <ErpButton variant="primary" onClick={p.onSaveDraft}>
            <Save className="w-3.5 h-3.5" /> حفظ كمسودة
          </ErpButton>
          <ErpButton onClick={p.onAddOne}><Plus className="w-3.5 h-3.5" /> سطر جديد</ErpButton>
          <ErpButton onClick={p.onAddFive}><Plus className="w-3.5 h-3.5" /> 5 أصناف</ErpButton>
          <ErpButton onClick={p.onScan}><ScanLine className="w-3.5 h-3.5" /> مسح باركود</ErpButton>
          <ErpButton onClick={p.onImportExcel}><Printer className="w-3.5 h-3.5" /> استيراد Excel</ErpButton>
          <button
            type="button"
            onClick={() => setShowDistribute((v) => !v)}
            className="text-[11px] font-bold text-indigo-600 hover:underline"
          >
            توزيع إجمالي الفاتورة
          </button>
          <span className="flex-1" />
          {p.canApprove ? (
            <ErpButton variant="primary" onClick={p.onSaveApprove}>
              <Shield className="w-3.5 h-3.5" /> اعتماد
            </ErpButton>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-line bg-surface text-slate-300">✓ اعتماد</span>
          )}
          <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-line bg-surface text-slate-300">⇪ ترحيل للمخزون</span>
        </div>

        {/* ═══ ③ شبكة الحقول ═══ */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <Label required>المورد</Label>
              <div className="flex gap-2">
                <select value={p.supplierId} onChange={(e) => p.onSupplier(e.target.value)} className={fieldCls + ' flex-1'}>
                  {p.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={p.onFillHistory}
                  disabled={!p.supplierId}
                  className="px-3 py-2 rounded-lg border border-line bg-surface text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" /> تعبئة أصناف سابقة
                </button>
              </div>
            </div>

            <div>
              <Label required>الفرع</Label>
              <select value={p.branchId} onChange={(e) => p.onBranch(e.target.value)} className={fieldCls}>
                {p.visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </div>

            <div>
              <Label>أمر الشراء المرتبط</Label>
              <select value={p.purchaseOrderId} onChange={(e) => p.onApplyPO(e.target.value)} className={fieldCls}>
                <option value="">بدون أمر شراء</option>
                {p.availablePOs.map((po) => {
                  const rem = po.items.filter((i) => (i.receivedQty || 0) < (i.quantity || 0)).length;
                  return (
                    <option key={po.id} value={po.id}>
                      {po.poNumber} — {po.supplierName} — {fmtMoney(po.totalAmount)}
                      {po.status === 'partially_received' ? ` — متبقي ${rem} بند` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <Label>المستلم</Label>
              <input value={p.receivedBy} onChange={(e) => p.onReceivedBy(e.target.value)} className={fieldCls} placeholder="اسم الموظف" />
            </div>

            <div>
              <Label>تاريخ النظام</Label>
              <input value={today} readOnly className={fieldCls + ' bg-slate-50 text-slate-500'} />
            </div>

            <div>
              <Label>رقم فاتورة المورد</Label>
              <input value={p.invoiceNumber} onChange={(e) => p.onInvoiceNumber(e.target.value)} className={fieldCls} placeholder="اختياري" />
            </div>

            <div>
              <Label>تاريخ الفاتورة</Label>
              <input type="date" value={p.invoiceDate} onChange={(e) => p.onInvoiceDate(e.target.value)} className={fieldCls} />
            </div>

            <div>
              <Label required>عملة المستند</Label>
              <CurrencySelect value={p.currencyCode} onChange={p.onCurrency} />
            </div>

            {p.currencyCode !== 'SAR' && (
              <div>
                <Label required>{`سعر الصرف (1 ${p.currencyCode} = ر.س)`}</Label>
                <input
                  type="number" min="0" step="0.0001"
                  value={p.exchangeRate || ''}
                  onChange={(e) => p.onExchangeRate(parseFloat(e.target.value) || 0)}
                  className={fieldCls} required
                />
              </div>
            )}

            <div>
              <Label>الأسعار شاملة الضريبة؟</Label>
              <div className="flex gap-1.5">
                <button
                  type="button" onClick={() => p.onVatIncl(true)}
                  className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold border transition-colors ${p.vatIncl ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-surface text-slate-600 border-line hover:bg-slate-50'}`}
                >شاملة</button>
                <button
                  type="button" onClick={() => p.onVatIncl(false)}
                  className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold border transition-colors ${!p.vatIncl ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-surface text-slate-600 border-line hover:bg-slate-50'}`}
                >غير شاملة</button>
              </div>
            </div>

            <div>
              <Label>نسبة ضريبة القيمة المضافة %</Label>
              <input
                type="number" min="0" max="100"
                value={p.vatRate || ''}
                onChange={(e) => p.onVatRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                className={fieldCls}
              />
            </div>

            <div className="lg:col-span-2">
              <Label>ملاحظات</Label>
              <input
                value={p.notes}
                onChange={(e) => p.onNotes(e.target.value)}
                className={fieldCls}
                placeholder="مثال: وصل ناقص صنف واحد · اتفق على الكمية مع مندوب المورد"
              />
            </div>
          </div>

          {showDistribute && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50">
              <label className="text-[11px] font-bold text-amber-900 shrink-0">إجمالي الفاتورة من المورد (اختياري — للتوزيع التلقائي)</label>
              <input
                type="number" min="0" step="0.01"
                value={invoiceTotalInput}
                onChange={(e) => setInvoiceTotalInput(e.target.value)}
                className={fieldCls + ' flex-1 bg-white'}
                placeholder="أدخل الإجمالي ثم وزّع"
              />
              <span className="text-[10px] text-amber-800 shrink-0">
                {invoiceTotalInput
                  ? `الفرق ${fmt(parseFloat(invoiceTotalInput) - p.subtotal, 2)} — يُوزَّع على الأصناف`
                  : 'يوزّع المبلغ على الأصناف بنسبة كل صنف'}
              </span>
            </div>
          )}
        </div>

        {/* ═══ ④⑤ عنوان الأصناف + الجدول ═══ */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-indigo-600" />
              الأصناف المستلمة
              <span className="tnum text-[11px] font-bold text-slate-500">({p.items.length})</span>
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">الكمية بوحدة التخزين</span>
              <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline">تحويل وحدة ▾</button>
              <button type="button" onClick={p.onScan} className="text-[11px] font-bold text-indigo-600 hover:underline">مسح باركود</button>
            </div>
          </div>

          {p.items.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line px-4 py-10 text-center">
              <PackageCheck className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500 mb-3">لم تُضف أصناف بعد</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button" onClick={p.onAddFive}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700"
                >
                  <Plus className="w-3.5 h-3.5 inline" /> 5 أصناف
                </button>
                <button
                  type="button" onClick={p.onScan}
                  className="px-3 py-1.5 rounded-lg border border-line bg-surface text-slate-700 text-[11px] font-bold hover:bg-slate-50"
                >
                  <ScanLine className="w-3.5 h-3.5 inline" /> مسح باركود
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-3">أدخل اسم الصنف أو امسح الباركود</p>
            </div>
          ) : (
            <GrnItemsTable
              items={p.items}
              rowKeys={p.rowKeys}
              rawMaterials={p.rawMaterials}
              convOf={p.convOf}
              prefillPrice={p.prefillPrice}
              branchId={p.branchId}
              updateItem={p.updateItem}
              onQty={p.onQty}
              onPrice={p.onPrice}
              onLineTotal={p.onLineTotal}
              onRemove={p.onRemove}
              qtyKey={p.qtyKey}
              priceKey={p.priceKey}
              totalKey={p.totalKey}
              draftVal={p.draftVal}
              clearDraft={p.clearDraft}
            />
          )}
        </div>

        {/* ═══ ⑥ سطر الملخّص ═══ */}
        <div className="px-6 py-3 border-t border-line flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] font-bold">
          <span className="text-slate-500">عدد الأصناف: <span className="tnum text-slate-800">{p.items.length}</span></span>
          <span className="text-slate-500">إجمالي الكمية: <span className="tnum text-slate-800">{fmt(qtyTotal)}</span></span>
          <span className="text-slate-500">الصافي: <span className="tnum text-slate-800">{fmtMoney(net)}</span></span>
          <span className="text-amber-600">ضريبة {p.vatRate}%: <span className="tnum">{fmtMoney(p.vatAmount)}</span></span>
          <span className="text-indigo-700">الإجمالي: <span className="tnum text-[12px] font-extrabold">{fmtMoney(p.totalAmount)} ر.س</span></span>
        </div>

        {/* ═══ ⑦ أزرار الحفظ ═══ */}
        <div className="px-6 py-4 border-t border-line bg-slate-50 flex items-center gap-2">
          <span className="flex-1" />
          <button
            type="button" onClick={p.onClose}
            className="px-5 py-2.5 border border-line rounded-xl bg-surface text-slate-700 text-xs font-bold hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button" onClick={p.onSaveDraft}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm"
          >
            <Save className="w-3.5 h-3.5 inline" /> حفظ كمسودة
          </button>
          {p.canApprove && (
            <button
              type="button" onClick={p.onSaveApprove}
              className="px-6 py-2.5 bg-surface text-slate-700 border border-line rounded-xl text-xs font-bold hover:bg-slate-50"
            >
              <Shield className="w-3.5 h-3.5 inline" /> حفظ واعتماد
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};