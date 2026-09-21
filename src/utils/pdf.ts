import type { jsPDF as JsPDFInstance } from 'jspdf';

// ============================================================================
// محرك طباعة/تصدير PDF الاحترافي الموحّد
// ----------------------------------------------------------------------------
// يولد لكل تقرير مستنداً مستقلاً منسّقاً باحترافية مثل أشهر برامج الإدارة:
//  - ترويسة موحّدة (شعار + اسم المنشأة + رقم مستند)
//  - رأس/ذيل يتكرر على كل صفحة مع ترقيم الصفحات (صفحة X من Y)
//  - تنسيق أعمدة تلقائي حسب النوع (مالي / نسبة / عدد / تاريخ / نص)
//  - تجميعات فرعية (groups) مع إجماليات لكل مجموعة وملخص نهائي
//  - ملاءمة الاتجاه (أفقي للجداول العريضة)
//  - كل تقرير يُصدَّر كمستند منفصل — لا دمج عدة صيغ في ملف واحد
// ============================================================================

let fontDataPromise: Promise<{ regular: string; bold: string; ok: boolean }> | null = null;

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

const loadFontData = (): Promise<{ regular: string; bold: string; ok: boolean }> => {
  if (!fontDataPromise) {
    const fetchFont = (path: string) =>
      fetch(`${import.meta.env.BASE_URL}fonts/${path}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('font fetch failed'))))
        .then(toBase64);
    fontDataPromise = Promise.all([fetchFont('amiri-regular.ttf'), fetchFont('amiri-bold.ttf')])
      .then(([regular, bold]) => ({ regular, bold, ok: true }))
      .catch(() => ({ regular: '', bold: '', ok: false }));
  }
  return fontDataPromise;
};

const loadArabicFont = async (doc: JsPDFInstance): Promise<boolean> => {
  const { regular, bold, ok } = await loadFontData();
  if (!ok) return false;
  try {
    doc.addFileToVFS('amiri-regular.ttf', regular);
    doc.addFileToVFS('amiri-bold.ttf', bold);
    doc.addFont('amiri-regular.ttf', 'Arabic', 'normal');
    doc.addFont('amiri-bold.ttf', 'Arabic', 'bold');
    return true;
  } catch { return false; }
};

// ----------------------------------------------------------------------------
// نموذج تقرير محترف
// ----------------------------------------------------------------------------
export type ColumnType = 'money' | 'pct' | 'num' | 'date' | 'text';

export interface ProColumn {
  title: string;
  type?: ColumnType;                 // تحديد نوع التنسيق التلقائي
  width?: number;                    // عرض ثابت (نقاط)
}

export type RowCell = string | number | null | undefined;

export interface ProTable {
  columns: ProColumn[];
  rows: RowCell[][];
  // تجميع فرعي: index العمود المستخدم للتجميع + قالب إجمالي المجموعة
  groupBy?: number;
  groupLabel?: (key: string) => string;
  // صف إجمالي نهائي (اختياري) - خلايا تطابق الأعمدة
  totals?: RowCell[];
  totalsLabel?: string;
}

export interface ProMeta {
  period?: string;
  branch?: string;
  branchId?: string;
  filters?: string;
  [k: string]: string | undefined;
}

export interface ProReportSpec {
  title: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  meta?: ProMeta;
  tables: ProTable[];
  // صفوف "مؤشرات رئيسية" تظهر تحت الترويسة كبطاقات ملخص
  summaryKpis?: { label: string; value: string }[];
  footer?: string;
  docNo?: string;
}

// تحويل صفحة PDF صادرة عن محرك قديم (PDFReport) إلى نموذج جديد تلقائياً
export interface LegacyReport {
  name: string;
  header: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  maxFontSize?: number;
}

const isLegacy = (r: any): r is LegacyReport => Array.isArray((r as any)?.header) && !Array.isArray((r as any)?.tables);

const legacyToSpec = (r: LegacyReport, idx: number): ProReportSpec => ({
  title: r.name || `تقرير ${idx + 1}`,
  orientation: (r.header?.length || 0) >= 9 ? 'landscape' : 'portrait',
  tables: [{
    columns: (r.header || []).map((h, i) => ({ title: h, width: r.colWidths?.[i] })),
    rows: r.rows || [],
  }],
});

// =============================== تنسيق الخلايا ==============================
const fmtNum = (v: number, digits = 2) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const moneyClr = '#0f172a';
const negClr = '#dc2626';
const baseText = '#1e293b';

// تحديد نوع العمود تلقائياً من بيانات العينة (عندما لا يُحدد النوع صراحة)
const guessTypeAt = (col: ProColumn, rows: RowCell[][], colIdx: number): ColumnType => {
  if (col.type) return col.type;
  let sawNum = false, sawAllNum = true, sawMoney = false;
  for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
    const c = rows[ri][colIdx];
    if (c === null || c === undefined || c === '') continue;
    if (typeof c === 'number') { sawNum = true; sawMoney = true; }
    else {
      const raw = String(c).trim();
      if (!raw) continue;
      const n = Number(raw.replace(/[^\d.\-]/g, ''));
      if (!Number.isNaN(n)) { sawNum = true; if (raw !== String(n)) sawMoney = true; }
      else sawAllNum = false;
    }
  }
  if (!sawAllNum) return 'text';
  if (sawMoney) return 'money';
  if (sawNum) return 'num';
  return 'text';
};

// تنسيق قيمة وفق نوع العمود
const formatCell = (c: RowCell, type: ColumnType): string => {
  if (c === null || c === undefined || c === '') return '';
  if (typeof c === 'number') return fmtNum(c);
  const s = String(c).trim();
  if (type === 'text') return s;
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return fmtNum(n);
};

const cellColor = (c: RowCell, type: ColumnType): string => {
  if (c === null || c === undefined || c === '') return baseText;
  const n = typeof c === 'number' ? c : Number(String(c).replace(/[^\d.\-]/g, ''));
  if (Number.isNaN(n)) return baseText;
  if (n < 0) return negClr;
  if (type === 'pct' && n < 20) return '#dc2626';
  return type === 'money' ? moneyClr : baseText;
};

// ================================ التوليد الرئيسي ===============================
const BRAND_GOLD: [number, number, number] = [250, 204, 21];
const BRAND_DARK: [number, number, number] = [30, 41, 59];
const SLATE: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [248, 250, 252];

export interface ProExport {
  filename: string;
  spec: ProReportSpec;
  docNo?: string;
}

export const renderProReport = async (spec: ProReportSpec, docNo?: string): Promise<Blob | null> => {
  // jsPDF + autoTable (وبالتالي minar) تُحمَّل فقط عند أول تصدير فعلي.
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const landscape = spec.orientation === 'landscape' || spec.tables.some((t) => t.columns.length >= 9);
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const okFont = await loadArabicFont(doc);
  const font = okFont ? 'Arabic' : 'helvetica';
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = { left: 22, right: 22, top: 92, bottom: 54 };

  const logo = (() => {
    try { return localStorage.getItem('rcerp_logo') || ''; } catch { return ''; }
  })();
  const company = (() => {
    try { return localStorage.getItem('rcerp_company_name') || 'RestoCost ERP Pro'; } catch { return ''; }
  })();

  const docNumber = docNo || (spec.docNo) || `RPT-${Date.now().toString(36).toUpperCase()}`;
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn');

  // رأس الصفحة المتكرر (ترويسة موحدة على كل صفحة)
  const drawHeader = () => {
    const goldY = margin.top - 80;
    doc.setFillColor(...BRAND_DARK);
    doc.roundedRect(margin.left, goldY - 4, pageW - margin.left * 2, 78, 8, 8, 'F');
    // شريط ذهبي علوي
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(margin.left, goldY - 9, pageW - margin.left * 2, 4, 'F');

    // نص العلامة
    doc.setFont(font, 'bold'); doc.setFontSize(12); doc.setTextColor(253, 224, 71);
    doc.text(company, pageW - margin.left - 2, goldY + 16, { align: 'right' });
    doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(203, 213, 225);
    doc.text('نظام إدارة المطاعم — تقارير الإدارة المتكاملة', pageW - margin.left - 2, goldY + 30, { align: 'right' });

    // مركز: عنوان التقرير
    doc.setFont(font, 'bold'); doc.setFontSize(11.5); doc.setTextColor(255, 255, 255);
    doc.text(String(spec.title), pageW / 2, goldY + 14, { align: 'center' });
    if (spec.subtitle) { doc.setFont(font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(226, 232, 240); doc.text(String(spec.subtitle), pageW / 2, goldY + 28, { align: 'center' }); }

    // يسار: رقم المستند والتاريخ
    doc.setFont(font, 'normal'); doc.setFontSize(7); doc.setTextColor(203, 213, 225);
    doc.text(`رقم المستند: ${docNumber}`, margin.left + 2, goldY + 14, { align: 'left' });
    doc.text(`تاريخ الإصدار: ${today}`, margin.left + 2, goldY + 27, { align: 'left' });
    if (logo) {
      try { doc.addImage(logo, 'PNG', margin.left + 2, goldY + 30, 22, 22); } catch { /* تجاهل */ }
    }
  };

  // ذيل الصفحة المتكرر مع الترقيم
  let pageNum = 0;
  const drawFooter = () => {
    pageNum++;
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
    doc.line(margin.left, pageH - 42, pageW - margin.right, pageH - 42);
    doc.setFont(font, 'normal'); doc.setFontSize(6.8); doc.setTextColor(...SLATE);
    doc.text('RestoCost ERP Pro', margin.left, pageH - 30, { align: 'left' });
    doc.text(spec.footer || 'تم توليد التقرير آلياً — نظام إدارة المطاعم', pageW / 2, pageH - 30, { align: 'center' });
    doc.setFont(font, 'bold');
    doc.text(`صفحة ${pageNum}`, pageW - margin.right, pageH - 30, { align: 'right' });
  };

  // رسم الترويسة والتذييل على الصفحة الأولى يدوياً
  drawHeader();
  drawFooter();

  // ===== صف الشرائط/المؤشرات تحت الترويسة =====
  let cursorY = margin.top;
  if (spec.summaryKpis?.length) {
    const kpiW = (pageW - margin.left - margin.right) / spec.summaryKpis.length;
    doc.setFontSize(6.6); doc.setFont(font, 'bold'); doc.setTextColor(...SLATE);
    spec.summaryKpis.forEach((k, i) => {
      const x = margin.left + i * kpiW;
      doc.setFillColor(...LIGHT); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
      doc.roundedRect(x, cursorY, kpiW - 4, 30, 5, 5, 'FD');
      doc.text(String(k.label), x + 6, cursorY + 9, { align: 'right' });
      doc.setTextColor(15, 23, 42); doc.setFontSize(8.4);
      doc.text(String(k.value), x + 6, cursorY + 23, { align: 'right' });
      doc.setTextColor(...SLATE); doc.setFontSize(6.6);
    });
    cursorY += 36;
  }

  // ===== بيانات الميتا (الفترة/الفرع/الفلاتر) =====
  if (spec.meta) {
    const mEntries = Object.entries(spec.meta).filter(([, v]) => v !== undefined && v !== '');
    if (mEntries.length) {
      const colW = (pageW - margin.left - margin.right) / Math.min(mEntries.length, 6);
      doc.setFont(font, 'normal'); doc.setFontSize(7);
      mEntries.forEach(([k, v], i) => {
        const x = pageW - margin.left - 2 - (i % Math.min(mEntries.length, 6)) * colW;
        doc.setTextColor(...SLATE);
        doc.text(`${k}:`, x, cursorY, { align: 'left' });
        doc.setTextColor(30, 41, 59); doc.setFont(font, 'bold');
        doc.text(String(v), x - 34, cursorY, { align: 'left' });
        doc.setFont(font, 'normal');
      });
      cursorY += 12;
    }
  }

  // ===== الجداول =====
  spec.tables.forEach((table) => {
    const res = autoTable(doc, {
      startY: cursorY,
      margin: { left: margin.left, right: margin.right, top: margin.top, bottom: margin.bottom },
      head: [table.columns.map((c) => String(c.title))],
      body: table.rows.map((r) => r.map((c, ci) => formatCell(c, guessTypeAt(table.columns[ci] || { title: '' }, table.rows, ci)))),
      foot: table.totals
        ? [[table.totalsLabel || '', ...table.totals.slice(1).map((c, ci) => formatCell(c, guessTypeAt(table.columns[ci + 1] || { title: '' }, table.rows, ci + 1)))]]
        : undefined,
      styles: { font, fontSize: 7.4, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.4, overflow: 'linebreak', halign: 'right' },
      headStyles: { fillColor: BRAND_DARK, textColor: [253, 224, 71], fontStyle: 'bold', halign: 'right', fontSize: 7.4 },
      bodyStyles: { halign: 'right' },
      footStyles: { fillColor: [250, 204, 21], textColor: [113, 63, 18], fontStyle: 'bold', halign: 'right' },
      alternateRowStyles: { fillColor: [255, 253, 239] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const idx = data.column.index;
          if (idx > 0 && idx < table.columns.length) {
            const type = guessTypeAt(table.columns[idx], table.rows, idx);
            const val = table.rows[data.row.index]?.[idx];
            data.cell.styles.textColor = cellColor(val, type);
          }
        }
      },
    });
    cursorY = (res as any).lastAutoTable ? (res as any).lastAutoTable.finalY + 14 : cursorY + 30;
  });

  // إعادة الرسم: ترويسة/تذييل لكل الصفحات (autoTable يضيف صفحات، نعيد رسمها)
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const curFirst = p === 1;
    drawHeader();
    // ذيل بترقيم صحيح لكل صفحة
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.6);
    doc.line(margin.left, pageH - 42, pageW - margin.right, pageH - 42);
    doc.setFont(font, 'normal'); doc.setFontSize(6.8); doc.setTextColor(...SLATE);
    doc.text('RestoCost ERP Pro', margin.left, pageH - 30, { align: 'left' });
    doc.text(spec.footer || 'تم توليد التقرير آلياً — نظام إدارة المطاعم', pageW / 2, pageH - 30, { align: 'center' });
    doc.setFont(font, 'bold');
    doc.text(`صفحة ${p} من ${totalPages}`, pageW - margin.right, pageH - 30, { align: 'right' });
    void curFirst;
  }

  return doc.output('blob');
};

// ============================================================================
// واجهة التصدير المتوافقة (تُحافظ على الاستخدامات القديمة + تتيح النموذج الجديد)
// ============================================================================
export interface PDFReport {
  name: string;
  header: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  maxFontSize?: number;
}

export const exportPDF = async (
  filename: string,
  reports: (LegacyReport | ProReportSpec)[],
  docTitle = 'RestoCost ERP Pro — تقرير شامل',
  docNo?: string,
): Promise<void> => {
  const specs: ProReportSpec[] = reports.map((r, i) => (isLegacy(r) ? legacyToSpec(r, i) : r));
  // كل تقرير يصدَّر في مستند مستقل — لا دمج
  const blobs = await Promise.all(specs.map((s) => renderProReport(s, docNo)));
  if (blobs.length === 1 && blobs[0]) {
    const url = URL.createObjectURL(blobs[0]);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }
  // حالة تعدد التقارير: نقسمها لملفات مستقلة
  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    if (!blob) continue;
    const spec = specs[i];
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const base = filename.replace(/\.pdf$/i, '');
    const fname = reports.length > 1 ? `${base}_${i + 1}_${(spec.title || `تقرير ${i + 1}`).replace(/[\\/:*?"<>|]/g, '').slice(0, 30)}.pdf` : filename;
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout((u: string) => URL.revokeObjectURL(u), 4000);
  }
  void docTitle;
};
