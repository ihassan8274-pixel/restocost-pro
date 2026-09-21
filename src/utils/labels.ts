// ===== طباعة ملصقات باركود للمستودع (دفعات FEFO) =====
// مقاس الملصق: 60 × 40 مم — شبكة على ورقة A4 (3 أعمدة × 7 صفوف تقريباً).
import { barcodeDataUri } from './barcode';

export interface LabelItem {
  materialName: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
  unit: string;
  branchName: string;
  grnNumber?: string;
}

export interface QrLabelItem {
  materialName: string;
  branchName: string;
  unit: string;
  payload: string;
}

const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const gridStyle = `
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; padding: 6mm; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .label { border: 1.2px solid #94a3b8; border-radius: 2mm; padding: 2mm; break-inside: avoid; page-break-inside: avoid; min-height: 38mm; display: flex; flex-direction: column; }
  .label-head { display: flex; align-items: center; gap: 2mm; }
  .label-head .logo { width: 8mm; height: 8mm; object-fit: contain; }
  .name { font-size: 9pt; font-weight: 900; color: #0f172a; line-height: 1.2; }
  .meta { font-size: 6.5pt; color: #64748b; font-weight: 700; }
  .barcode { text-align: center; margin: 1.5mm 0 1mm; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .barcode img { width: 100%; max-width: 44mm; height: auto; }
  .barcode-code { font-family: 'Consolas', 'Courier New', monospace; font-size: 7.5pt; font-weight: 800; letter-spacing: 2px; color: #0f172a; margin-top: .6mm; direction: ltr; }
  .qr-code { text-align: center; margin: 1mm 0; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr-code img { width: 30mm; height: 30mm; }
  .qr-payload { font-family: 'Consolas', 'Courier New', monospace; font-size: 6pt; color: #475569; text-align: center; direction: ltr; white-space: pre-wrap; word-break: break-all; line-height: 1.3; margin-top: 1mm; }
  .footer { display: flex; justify-content: space-between; border-top: .6px dashed #cbd5e1; padding-top: 1.2mm; font-size: 6.8pt; color: #334155; font-weight: 700; }
  .footer strong { color: #0f172a; }
  .print-btn { position: fixed; top: 12px; left: 12px; z-index: 99; display: flex; gap: 8px; }
  .print-btn button { background: linear-gradient(135deg,#d7a928,#a97912); color: #172033; border: 0; border-radius: 10px; padding: 10px 22px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(215,169,40,.5); font-family: inherit; }
  .print-btn button.secondary { background: #172033; color: #d7a928; box-shadow: none; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
    .grid { gap: 3mm; }
  }
`;

const openGridWindow = (title: string, cards: string): void => {
  const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<style>${gridStyle}</style>
</head>
<body>
  <div class="print-btn"><button onclick="window.print()">طباعة / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div>
  <div class="grid">${cards}</div>
</body>
</html>`;
  const hook = (window as unknown as { __rcerpPrintPreview?: (payload: { title: string; html: string }) => void }).__rcerpPrintPreview;
  if (hook) { hook({ title, html }); return; }
  const win = window.open('', '_blank', 'width=820,height=680');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
};

export const openLabelsWindow = (title: string, items: LabelItem[]): void => {
  const logo = localStorage.getItem('rcerp_logo') || '';
  const cards = items.map((it) => {
    const barcode = barcodeDataUri(it.batchNumber.replace(/\s+/g, '-') || 'BATCH', { height: 34, barWidth: 1.2, quiet: 6 });
    return `
      <div class="label">
        <div class="label-head">
          ${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ''}
          <div><div class="name">${esc(it.materialName)}</div><div class="meta">${esc(it.branchName)} · ${it.grnNumber ? `GRN ${esc(it.grnNumber)}` : ''}</div></div>
        </div>
        <div class="barcode"><img src="${barcode}" alt="" /><div class="barcode-code">${esc(it.batchNumber)}</div></div>
        <div class="footer">
          <span>الكمية: <strong>${esc(it.qty)} ${esc(it.unit)}</strong></span>
          <span>الصلاحية: <strong>${esc(it.expiryDate)}</strong></span>
        </div>
      </div>`;
  }).join('');

  openGridWindow(title, cards);
};

// ===== طباعة ملصقات QR للأصناف (بأي عدد في أي وقت، غير مرتبطة بالاستلام) =====
// الملصق يحمل بيانات الصنف نصياً (اسم/وحدة/فرع) + كود التعريف التقني في السطر الثاني —
// أي قارئ QR عادي (كاميرا الهاتف) يعرض بيانات الصنف المفهومة بدلاً من كود خام.
export const openQrLabelsWindow = async (title: string, items: QrLabelItem[]): Promise<void> => {
  let QRCode: { toDataURL: (text: string, opts?: Record<string, unknown>) => Promise<string> };
  try {
    const mod = await import('qrcode');
    QRCode = 'default' in mod ? (mod.default as typeof QRCode) : (mod as typeof QRCode);
  } catch {
    alert('تعذر تحميل مكتبة توليد QR');
    return;
  }
  const logo = localStorage.getItem('rcerp_logo') || '';
  const cards = await Promise.all(items.map(async (it) => {
    const url = await QRCode.toDataURL(it.payload, { width: 128, margin: 1, errorCorrectionLevel: 'M' });
    return `
      <div class="label">
        <div class="label-head">
          ${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ''}
          <div><div class="name">${esc(it.materialName)}</div><div class="meta">${esc(it.branchName)} · ${esc(it.unit)}</div></div>
        </div>
        <div class="qr-code"><img src="${url}" alt="QR" /></div>
        <div class="qr-payload">${esc(it.payload)}</div>
      </div>`;
  }));
  openGridWindow(title, cards.join(''));
};