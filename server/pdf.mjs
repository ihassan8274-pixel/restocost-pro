/**
 * server/pdf.mjs â€” طھظˆظ„ظٹط¯ PDF ط¬ط±ط¯ ظٹظˆظ…ظٹ ط¹ط±ط¨ظٹ (RTL) ط§ط­طھط±ط§ظپظٹ ظ„ط¥ط±ط³ط§ظ„ظ‡ ط¹ط¨ط± طھظ„ظٹط¬ط±ط§ظ…
 * ظˆظ„ظ„طھط­ظ…ظٹظ„ ظ…ظ† ط³ط¬ظ„ ط§ظ„ط¬ط±ط¯. ط§ظ„ظ…ط­ط±ظƒ ط§ظ„ظ…ط¹طھظ…ط¯: PyMuPDF (Python) ط¹ط¨ط± server/gen-dc-pdf.py
 * ظ„ط£ظ†ظ‡ ظٹط·ط¨ظ‚ طھط´ظƒظٹظ„ ط§ظ„ط­ط±ظˆظپ ظˆط§ظ„ط§طھط¬ط§ظ‡ RTL ط¨ط¯ظ‚ط© (HarfBuzz)طŒ ظ…ط¹ ط§ط­طھظٹط§ط·ظٹ jsPDF ط¥ظ† ط؛ط§ط¨ Python.
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '..', 'public', 'fonts');
const GEN_PY = path.join(__dirname, 'gen-dc-pdf.py');
const EXTRACT_PY = path.join(__dirname, 'extract-text.py');

const PYTHONS = [
  process.env.RCER_ERP_PYTHON,
  'C:\\Python314\\python.exe',
  'C:\\Python313\\python.exe',
  'C:\\Python312\\python.exe',
  'python',
].filter(Boolean);

let pythonChecked = false;
let pythonPath = null;
export const findPython = async () => {
  if (pythonChecked) return pythonPath;
  for (const cand of PYTHONS) {
    try {
      await execFileAsync(cand, ['-c', 'import pymupdf']);
      pythonPath = cand;
      break;
    } catch {
      pythonPath = null;
    }
  }
  pythonChecked = true;
  return pythonPath;
};

export const extractPdfText = async (buffer) => {
  const py = await findPython();
  if (!py) return null;
  const tmpIn = path.join(os.tmpdir(), `ext-${crypto.randomBytes(6).toString('hex')}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `ext-${crypto.randomBytes(6).toString('hex')}.json`);
  fs.writeFileSync(tmpIn, buffer);
  try {
    await execFileAsync(py, [EXTRACT_PY, tmpIn, tmpOut], { timeout: 30000 });
    const data = JSON.parse(fs.readFileSync(tmpOut, 'utf-8'));
    return data && data.text;
  } catch {
    return null;
  } finally {
    for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch {} }
  }
};

let fontsCached = null;
const loadFonts = () => {
  if (fontsCached) return fontsCached;
  fontsCached = {
    regular: fs.readFileSync(path.join(FONTS_DIR, 'amiri-regular.ttf')).toString('base64'),
    bold: fs.readFileSync(path.join(FONTS_DIR, 'amiri-bold.ttf')).toString('base64'),
    ok: true,
  };
  return fontsCached;
};

const _fmt = (n) => (typeof n === 'number' ? new Intl.NumberFormat('en-US').format(Math.round(n * 100) / 100) : String(n ?? ''));

const BRAND_DARK = [30, 41, 59];
const BRAND_GOLD = [250, 204, 21];
const SLATE = [100, 116, 139];

/**
 * طھظˆظ„ظٹط¯ PDF ط¬ط±ط¯ ظٹظˆظ…ظٹ ظ…ظ†ط³ظ‚ â€” ظ…ط´ط؛ظ„ PyMuPDF (ظ…ظپط¶ظ„) ط£ظˆ jsPDF (ط§ط­طھظٹط§ط·ظٹ).
 * @param {object} rec - ط³ط¬ظ„ ط§ظ„ط¬ط±ط¯.
 * @param {string} branchName - ط§ط³ظ… ط§ظ„ظپط±ط¹.
 * @returns {Promise<Buffer>}
 */
export const generateDailyCountPdf = async (rec, branchName = '') => {
  const py = await findPython();
  if (py) {
    try {
      return await generateViaPyMuPDF(py, rec, branchName);
    } catch (err) {
      console.error('[pdf.mjs] PyMuPDF failed, falling back to jsPDF:', err?.message);
    }
  }
  return generateViaJSPDF(rec, branchName);
};

/** طھظˆظ„ظٹط¯ ط¹ط¨ط± ط³ظƒط±ط¨طھ Python (طھظ‚ط¯ظٹظ… طھط´ظƒظٹظ„ ط¹ط±ط¨ظٹ ظ…ط«ط§ظ„ظٹ RTL). */
const generateViaPyMuPDF = async (py, rec, branchName) => {
  const items = (Array.isArray(rec.items) ? rec.items : []).map((it) => ({
    itemName: it.itemName ?? 'â€”',
    theoreticalQty: it.theoreticalQty ?? 0,
    countedQty: it.countedQty ?? 0,
    unit: it.unit ?? '',
  }));
  const payload = {
    branchName: branchName || rec.branchName || rec.branch || 'ظپط±ط¹ ط؛ظٹط± ظ…ط­ط¯ط¯',
    date: rec.date || 'â€”',
    countedBy: rec.countedBy || 'â€”',
    status: rec.status || 'saved',
    docNo: rec.docNo,
    today: rec.today,
    items,
  };
  const tmpIn = path.join(os.tmpdir(), `gc-${crypto.randomBytes(6).toString('hex')}.json`);
  const tmpOut = path.join(os.tmpdir(), `gc-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(tmpIn, JSON.stringify(payload), 'utf-8');
  try {
    await execFileAsync(py, [GEN_PY, tmpIn, tmpOut], { timeout: 60000 });
    const buf = fs.readFileSync(tmpOut);
    return buf;
  } finally {
    for (const f of [tmpIn, tmpOut]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
};

/** ط§ط­طھظٹط§ط·ظٹ jsPDF (ظ†ظپط³ ط§ظ„طھطµظ…ظٹظ… ط§ظ„طھظ‚ط±ظٹط¨ظٹ â€” ط§ظ„ظ…ط³طھط®ط¯ظ… ظ‚ط¯ ظٹط¹طھظ…ط¯ ط¹ظ„ظٹظ‡ ط¹ظ†ط¯ ط؛ظٹط§ط¨ Python). */
const generateViaJSPDF = (rec, branchName = '') => {
  const { regular, bold, ok } = loadFonts();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  if (ok) {
    doc.addFileToVFS('amiri.ttf', regular);
    doc.addFileToVFS('amiri-bold.ttf', bold);
    doc.addFont('amiri.ttf', 'Arabic', 'normal');
    doc.addFont('amiri-bold.ttf', 'Arabic', 'bold');
  }
  const font = ok ? 'Arabic' : 'helvetica';
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mLeft = 30; // هامش ≈ 1 سم من كل جهة

  const items = Array.isArray(rec.items) ? rec.items : [];
  const totalQty = items.reduce((s, it) => s + (Number(it.countedQty) || 0), 0);
  const totalDiff = items.reduce((s, it) => s + ((Number(it.countedQty) || 0) - (Number(it.theoreticalQty) || 0)), 0);
  const value = Number(rec.totalConsumedValue) || items.reduce((s, it) => s + (Number(it.cost) || 0) * (Number(it.theoreticalQty) || 0), 0);
  const docNo = `DC-${Date.now().toString(36).toUpperCase()}`;
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn');

  const HEADER_H = 88;
  const headerTop = 30; // 1 سم من الأعلى

  const drawHeaderBand = () => {
    const y = headerTop;
    doc.setFillColor(...BRAND_DARK);
    doc.roundedRect(mLeft, y, pageW - mLeft * 2, HEADER_H - 10, 8, 8, 'F');
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(mLeft, y, pageW - mLeft * 2, 4, 'F');

    doc.setFont(font, 'bold'); doc.setFontSize(11); doc.setTextColor(253, 224, 71);
    doc.text('RestoCost ERP Pro', pageW - mLeft - 6, y + 22, { align: 'right' });
    doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(203, 213, 225);
    doc.text('ط¬ط±ط¯ ظٹظˆظ…ظٹ â€” ظ…ط®ط²ظˆظ†', pageW - mLeft - 6, y + 36, { align: 'right' });

    doc.setFont(font, 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
    doc.text(branchName || 'ظپط±ط¹ ط؛ظٹط± ظ…ط­ط¯ط¯', pageW / 2, y + 24, { align: 'center' });
    if (rec.date) {
      doc.setFont(font, 'normal'); doc.setFontSize(8); doc.setTextColor(226, 232, 240);
      doc.text(`طھط§ط±ظٹط® ط§ظ„ط¬ط±ط¯: ${rec.date}`, pageW / 2, y + 40, { align: 'center' });
    }

    doc.setFont(font, 'normal'); doc.setFontSize(7); doc.setTextColor(203, 213, 225);
    doc.text(`ط±ظ‚ظ… ط§ظ„ظ…ط³طھظ†ط¯: ${docNo}`, mLeft + 6, y + 22, { align: 'left' });
    doc.text(`طھط§ط±ظٹط® ط§ظ„ط¥طµط¯ط§ط±: ${today}`, mLeft + 6, y + 36, { align: 'left' });
  };

  const drawFooterBand = (pageNum) => {
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
    doc.line(mLeft, pageH - 52, pageW - mLeft, pageH - 52);
    doc.setFont(font, 'normal'); doc.setFontSize(6.8); doc.setTextColor(...SLATE);
    doc.text('RestoCost ERP Pro', mLeft, pageH - 40, { align: 'left' });
    doc.text('طھظ… طھظˆظ„ظٹط¯ ط§ظ„طھظ‚ط±ظٹط± ط¢ظ„ظٹط§ظ‹ ظ…ظ† ط§ظ„ط¬ظˆط§ظ„', pageW / 2, pageH - 40, { align: 'center' });
    doc.setFont(font, 'bold');
    doc.text(`طµظپط­ط© ${pageNum}`, pageW - mLeft, pageH - 40, { align: 'right' });
  };

  let cursorY = headerTop + HEADER_H + 2;

  const kpis = [
    { label: 'ط¹ط¯ط¯ ط§ظ„ط£طµظ†ط§ظپ', value: String(items.length) },
    { label: 'ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…ط¹ط¯ظˆط¯ط©', value: _fmt(totalQty) },
    { label: 'ظ‚ظٹظ…ط© ط§ظ„ط¬ط±ط¯ (ط±.ط³)', value: _fmt(value) },
  ];
  const kpiW = (pageW - mLeft * 2) / kpis.length;
  kpis.forEach((k, i) => {
    const x = mLeft + i * kpiW;
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
    doc.roundedRect(x, cursorY, kpiW - 4, 30, 5, 5, 'FD');
    doc.setFont(font, 'bold'); doc.setFontSize(6.6); doc.setTextColor(...SLATE);
    doc.text(String(k.label), x + kpiW - 8, cursorY + 9, { align: 'right' });
    doc.setTextColor(15, 23, 42); doc.setFontSize(8.4);
    doc.text(String(k.value), x + kpiW - 8, cursorY + 23, { align: 'right' });
  });
  cursorY += 36;

  if (rec.countedBy) {
    doc.setFont(font, 'bold'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text(`ط§ظ„ظ‚ط§ط¦ظ… ط¨ط§ظ„ط¬ط±ط¯: ${rec.countedBy}`, pageW - mLeft - 2, cursorY, { align: 'right' });
    doc.setFont(font, 'normal');
    doc.text(`ط§ظ„ط­ط§ظ„ط©: ${rec.status === 'saved' ? 'ظ…ظƒطھظ…ظ„' : (rec.status || 'â€”')}`, mLeft + 2, cursorY, { align: 'left' });
    cursorY += 14;
  }

  const rows = items.map((it, i) => [
    i + 1,
    it.itemName || 'â€”',
    _fmt(it.theoreticalQty),
    _fmt(it.countedQty),
    _fmt((Number(it.countedQty) || 0) - (Number(it.theoreticalQty) || 0)),
    it.unit || '',
  ]);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: mLeft, right: mLeft, top: headerTop + HEADER_H, bottom: 56 },
    head: [['ظ…', 'ط§ظ„طµظ†ظپ', 'ط§ظ„ظ†ط¸ط§ظ…ظٹ', 'ط§ظ„ظ…ط¹ط¯ظˆط¯', 'ط§ظ„ظپط±ظ‚', 'ط§ظ„ظˆط­ط¯ط©']],
    body: rows.length ? rows : [['â€”', 'ظ„ط§ طھظˆط¬ط¯ ط£طµظ†ط§ظپ ظ…ط³ط¬ظ„ط©', '', '', '', '']],
    styles: { font, fontSize: 8, cellPadding: 4, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.4, overflow: 'linebreak', halign: 'right' },
    headStyles: { fillColor: [30, 41, 59], textColor: [253, 224, 71], fontStyle: 'bold', halign: 'right', fontSize: 8 },
    bodyStyles: { halign: 'right' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 26 },
      2: { halign: 'center', cellWidth: 62 },
      3: { halign: 'center', cellWidth: 62, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 62 },
      5: { halign: 'center', cellWidth: 55 },
    },
    alternateRowStyles: { fillColor: [255, 253, 239] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const v = Number(String(data.cell.raw).replace(/[^\d.\-]/g, ''));
        if (v < 0) data.cell.styles.textColor = [220, 38, 38];
        else if (v > 0) data.cell.styles.textColor = [5, 150, 105];
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawHeaderBand();
    drawFooterBand(p, totalPages);
  }

const buf = doc.output('arraybuffer');
  return Buffer.from(buf);
};

// ---------------------------------------------------------------------------
// طلبات الشراء / أوامر التوريد المبدئي — التوليد المفضّل عبر PyMuPDF (عربية
// صحيحة RTL + HarfBuzz) مع مسار احتياطي jsPDF عند غياب بايثون.
// payload: { title, subtitle, docNo, today, kpis, meta, columns, rows, totals, footer }
// ---------------------------------------------------------------------------
const GEN_PURCHASE_PY = path.join(__dirname, 'gen-purchase-pdf.py');

const generatePurchaseViaPyMuPDF = async (py, payload) => {
  const tmpIn = path.join(os.tmpdir(), `gp-${crypto.randomBytes(6).toString('hex')}.json`);
  const tmpOut = path.join(os.tmpdir(), `gp-${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(tmpIn, JSON.stringify(payload), 'utf-8');
  try {
    await execFileAsync(py, [GEN_PURCHASE_PY, tmpIn, tmpOut], { timeout: 60000 });
    return fs.readFileSync(tmpOut);
  } finally {
    for (const f of [tmpIn, tmpOut]) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
};

const generatePurchaseViaJSPDF = (payload) => {
  const { regular, bold, ok } = loadFonts();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  if (ok) {
    doc.addFileToVFS('amiri.ttf', regular);
    doc.addFileToVFS('amiri-bold.ttf', bold);
    doc.addFont('amiri.ttf', 'Arabic', 'normal');
    doc.addFont('amiri-bold.ttf', 'Arabic', 'bold');
  }
  const font = ok ? 'Arabic' : 'helvetica';
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mLeft = 30;
  const docNo = payload.docNo || `RPT-${Date.now().toString(36).toUpperCase()}`;
  const today = payload.today || new Date().toLocaleDateString('ar-SA-u-nu-latn');

  const drawHeaderBand = () => {
    const y = 30;
    doc.setFillColor(...BRAND_DARK);
    doc.roundedRect(mLeft, y, pageW - mLeft * 2, 78, 8, 8, 'F');
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(mLeft, y, pageW - mLeft * 2, 4, 'F');
    doc.setFont(font, 'bold'); doc.setFontSize(11); doc.setTextColor(253, 224, 71);
    doc.text('RestoCost ERP Pro', pageW - mLeft - 6, y + 22, { align: 'right' });
    doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(203, 213, 225);
    doc.text(`رقم المستند: ${docNo}`, mLeft + 6, y + 22, { align: 'left' });
    doc.setFont(font, 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
    doc.text(String(payload.title || ''), pageW / 2, y + 24, { align: 'center' });
    if (payload.subtitle) {
      doc.setFont(font, 'normal'); doc.setFontSize(8); doc.setTextColor(226, 232, 240);
      doc.text(String(payload.subtitle), pageW / 2, y + 40, { align: 'center' });
    }
    doc.setFont(font, 'normal'); doc.setFontSize(7); doc.setTextColor(203, 213, 225);
    doc.text(`تاريخ الإصدار: ${today}`, mLeft + 6, y + 38, { align: 'left' });
  };

  const drawFooterBand = (pageNum) => {
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
    doc.line(mLeft, pageH - 52, pageW - mLeft, pageH - 52);
    doc.setFont(font, 'normal'); doc.setFontSize(6.8); doc.setTextColor(...SLATE);
    doc.text('RestoCost ERP Pro', mLeft, pageH - 40, { align: 'left' });
    doc.text(String(payload.footer || 'تم توليد التقرير آلياً'), pageW / 2, pageH - 40, { align: 'center' });
    doc.setFont(font, 'bold');
    doc.text(`صفحة ${pageNum}`, pageW - mLeft, pageH - 40, { align: 'right' });
  };

  let cursorY = 30 + 78 + 10;
  const kpis = payload.kpis || [];
  if (kpis.length) {
    const kpiW = (pageW - mLeft * 2) / kpis.length;
    kpis.forEach((k, i) => {
      const x = mLeft + i * kpiW;
      doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
      doc.roundedRect(x, cursorY, kpiW - 4, 30, 5, 5, 'FD');
      doc.setFont(font, 'bold'); doc.setFontSize(6.6); doc.setTextColor(...SLATE);
      doc.text(String(k[0]), x + kpiW - 8, cursorY + 9, { align: 'right' });
      doc.setTextColor(15, 23, 42); doc.setFontSize(8.4);
      doc.text(String(k[1]), x + kpiW - 8, cursorY + 23, { align: 'right' });
    });
    cursorY += 36;
  }
  const meta = (payload.meta || []).map((m) => `${m[0]}: ${m[1]}`).join('   |   ');
  if (meta) {
    doc.setFont(font, 'normal'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text(meta, 20 + 2, cursorY, { align: 'right', maxWidth: pageW - mLeft * 2 - 10 });
    cursorY += 14;
  }

  const rows = (payload.rows || []).map((r) => r.map((c) => (typeof c === 'number' ? _fmt(c) : String(c ?? ''))));
  const totals = (payload.totals || []).map((c) => (typeof c === 'number' ? _fmt(c) : String(c ?? '')));

  autoTable(doc, {
    startY: cursorY,
    margin: { left: mLeft, right: mLeft, top: 30 + 78, bottom: 56 },
    head: [(payload.columns || []).map((c) => String(c))],
    body: rows.length ? rows : [[(payload.columns || []).length ? 'لا توجد بنود' : '']],
    foot: totals.length ? [totals] : undefined,
    styles: { font, fontSize: 8, cellPadding: 4, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.4, overflow: 'linebreak', halign: 'right' },
    headStyles: { fillColor: BRAND_DARK, textColor: [253, 224, 71], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    footStyles: { fillColor: [250, 204, 21], textColor: [113, 63, 18], fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [255, 253, 239] },
    columnStyles: { 0: { halign: 'center', cellWidth: 26 } },
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawHeaderBand();
    drawFooterBand(p);
  }
  return Buffer.from(doc.output('arraybuffer'));
};

export const generatePurchaseDocumentPdf = async (payload) => {
  const py = await findPython();
  if (py) {
    try {
      return await generatePurchaseViaPyMuPDF(py, payload);
    } catch (err) {
      console.error('[pdf.mjs] PyMuPDF purchase render failed, falling back to jsPDF:', err?.message);
    }
  }
  return generatePurchaseViaJSPDF(payload);
};
