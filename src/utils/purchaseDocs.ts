import { fmt, fmtMoney } from './helpers';
import type { PurchaseRequest, PurchaseOrder } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

const REQUEST_STATUS = (r: PurchaseRequest) =>
  r.status === 'converted'
    ? { label: 'تم التحويل', subtitle: 'تم تحويله لأوامر توريد مبدئية' }
    : { label: 'مرسل', subtitle: 'مرسل لمجموعة المشتريات' };

const PO_STATUS = (po: PurchaseOrder) => {
  switch (po.status) {
    case 'submitted': return 'معلّق بعد الجرد';
    case 'approved': return 'معتمد — جاهز للاستلام';
    case 'partially_received': return 'استلام جزئي';
    case 'received': return 'تم الاستلام بالكامل';
    case 'cancelled': return 'ملغى';
    default: return po.status;
  }
};

// بنية مكانية للتقرير — يولّدها الخادم بـ PyMuPDF (عربية RTL صحيحة).
export interface ReportPayload {
  title: string;
  subtitle?: string;
  docNo: string;
  today: string;
  kpis: [string, string][];
  meta: [string, string][];
  columns: string[];
  rows: (string | number | null)[][];
  totals: (string | number | null)[] | null;
  footer: string;
}

export const purchaseRequestPayload = (r: PurchaseRequest): ReportPayload => {
  const status = REQUEST_STATUS(r);
  const totalQty = r.items.reduce((s, i) => s + i.quantityPU, 0);
  return {
    title: `طلب شراء ${r.requestNumber}`,
    subtitle: status.subtitle,
    docNo: r.requestNumber,
    today: new Date().toLocaleDateString('ar-SA-u-nu-latn'),
    kpis: [
      ['عدد الأصناف', `${r.items.length}`],
      ['إجمالي الكمية (وحدة شراء)', fmt(totalQty)],
      ['القيمة التقديرية', fmtMoney(r.totalValue)],
    ],
    meta: [
      ['الفرع', r.branchName],
      ['التاريخ', r.date],
      ['بواسطة', r.createdBy],
      ['البنود', `${r.items.length} صنف`],
      ['الحالة', status.label],
    ],
    columns: ['#', 'الصنف', 'الكمية المطلوبة', 'آخر سعر توريد (30 يوم)', 'آخر مورد', 'القيمة'],
    rows: r.items.map((i, idx) => [
      idx + 1,
      i.materialName,
      `${fmt(i.quantityPU)} ${i.purchaseUnit}`,
      round2(i.lastPricePU),
      i.lastSupplierName || '—',
      round2(i.quantityPU * i.lastPricePU),
    ]),
    totals: [null, 'الإجمالي', null, null, null, round2(r.totalValue)],
    footer: 'طلب شراء تلقائي بعد الجرد — أقل سعر استلام خلال 30 يوماً وآخر مورد فعلي',
  };
};

export const preliminaryPoPayload = (po: PurchaseOrder, branchName?: string): ReportPayload => {
  const recvQty = po.items.reduce((s, i) => s + (i.receivedQty ?? 0), 0);
  const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
  const recvValue = po.items.reduce((s, i) => s + (i.receivedQty ?? 0) * i.unitPrice, 0);
  return {
    title: `أمر توريد مبدئي ${po.poNumber}`,
    subtitle: `الحالة: ${PO_STATUS(po)}`,
    docNo: po.poNumber,
    today: new Date().toLocaleDateString('ar-SA-u-nu-latn'),
    kpis: [
      ['قيمة الأمر', fmtMoney(po.totalAmount)],
      ['قيمة المستلم', fmtMoney(round2(recvValue))],
      ['الكمية المستلمة', `${fmt(recvQty)} / ${fmt(totalQty)}`],
    ],
    meta: [
      ['المورد', po.supplierName || 'غير مسجل بعد'],
      ['الفرع', branchName || '—'],
      ['التاريخ', po.orderDate],
      ['بواسطة', po.requestedBy || '—'],
      ['الحالة', PO_STATUS(po)],
    ],
    columns: ['#', 'الصنف', 'الكمية بوحدة الشراء', 'سعر وحدة الشراء', 'الإجمالي', 'المستلم', 'المتبقي'],
    rows: po.items.map((i, idx) => [
      idx + 1,
      i.materialName,
      i.purchaseQty != null ? `${fmt(i.purchaseQty)} ${i.purchaseUnit || ''}` : `${fmt(i.quantity)} ${i.unit}`,
      round2(i.unitPrice),
      round2(i.quantity * i.unitPrice),
      i.receivedQty ?? 0,
      round2((i.quantity ?? 0) - (i.receivedQty ?? 0)),
    ]),
    totals: [null, 'الإجمالي', null, null, round2(po.totalAmount), recvQty, round2(totalQty - recvQty)],
    footer: 'أمر توريد مبدئي بسعر آخر (أقل) سعر استلام خلال 30 يوماً — القيمة النهائية تُحتسب عند الاستلام',
  };
};

// نص رسالة أمر التوريد المبدئي — التاريخ والفرع والمورد ثم جدول {الصنف | الوحدة | الكمية}
export const poTelegramText = (po: PurchaseOrder, branchName?: string): string => {
  const escHtml = (s: string | number) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = po.items
    .map((i) => {
      const conv = i.purchaseUnitConversion || 1;
      const qty = i.purchaseQty != null ? i.purchaseQty : (i.quantity || 0) / conv;
      const unit = i.purchaseUnit || i.unit || '—';
      return `${escHtml(i.materialName)} | ${escHtml(unit)} | ${fmt(qty)}`;
    })
    .join('\n');
  return [
    `📦 <b>أمر توريد مبدئي ${escHtml(po.poNumber)}</b>`,
    `📅 التاريخ: ${escHtml(po.orderDate)}`,
    `🏪 الفرع: <b>${escHtml(branchName || '—')}</b>`,
    `🚚 المورد: <b>${escHtml(po.supplierName || 'غير مسجل بعد')}</b>`,
    ``,
    `📋 البنود:`,
    `<pre>الصنف | الوحدة | الكمية\n${body}</pre>`,
    ``,
    `💰 الإجمالي: <b>${fmtMoney(po.totalAmount)}</b>`,
    ``,
    `<i>سعر مبدئي = أقل سعر خلال 30 يوم — القيمة النهائية عند الاستلام من شاشة إذن استلام المواد</i>`,
  ].join('\n');
};

// إرسال التقرير للبوت: الخادم يولّد PDF (عربية صحيحة) ثم يرسله لمجموعة المشتريات
const sendReportToPurchaseBot = async (
  payload: ReportPayload,
  text: string,
  filename: string,
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const token = localStorage.getItem('rcerp_token');
    const res = await fetch('/api/telegram/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ payload, filename, caption: text }),
    }).catch(() => null);
    if (!res) return { ok: false, error: 'تعذر الاتصال بالخادم' };
    const data = await res.json().catch(() => ({ ok: false }));
    return { ok: !!data.ok, error: data.error };
  } catch {
    return { ok: false, error: 'خطأ أثناء إرسال PDF' };
  }
};

const clean = (s: string) => s.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, '_');

export const sendRequestPdfToBot = async (r: PurchaseRequest, text: string) =>
  sendReportToPurchaseBot(purchaseRequestPayload(r), text, `purchase-request-${clean(r.requestNumber)}.pdf`);

export const sendPreliminaryPoPdfToBot = async (po: PurchaseOrder, text: string, branchName?: string) =>
  sendReportToPurchaseBot(preliminaryPoPayload(po, branchName), text, `preliminary-po-${clean(po.poNumber)}.pdf`);