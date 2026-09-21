import type ExcelJS from 'exceljs';

// محزمات تأجيل: المكتبات الثقيلة تُحمَّل فقط عند أول تصدير/قراءة فعلي
// (تخفض حمولة الإقلاع ~1.4MB من الشيفرة الرئيسية).
let exceljsPromise: Promise<typeof import('exceljs')> | null = null;
const importExcelJS = () => (exceljsPromise ??= import('exceljs').then((m: any) => ((m.default ?? m) as typeof import('exceljs'))));

export interface ExcelSheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

// جدول منسّق داخل ورقة تقرير
export interface StyledReportTable {
  title?: string;
  header: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  dense?: boolean;
}

// ورقة تقرير منسّق تحاكي شكل التقرير المطبوع: عنوان + سطر تفاصيل + مربعات مؤشرات + جدول/جداول ملونة + ملخص ختامي
export interface StyledReportSheet {
  name: string;
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  // جداول متعددة بالتسلسل (مثل بطاقة وصفة كاملة) — أو جدول واحد عبر header/rows
  tables?: StyledReportTable[];
  header?: string[];
  rows?: (string | number)[][];
  totals?: [string, string][];
  footer?: string;
  colWidths?: number[];
  dense?: boolean;
  // روابط داخلية بين ورقة وأخرى في نفس الملف (مثال: من الملخص إلى بطاقة وصفة)
  hyperlinks?: { row: number; col: number; sheet: string; text?: string }[];
}

export interface ParsedExcel {
  name: string;
  header: string[];
  rows: Record<string, unknown>[];
}

// Export one or more sheets to an .xlsx file (UTF-8 safe, supports Arabic)
// تنسيق احترافي: رأس ملون بخط عريض + تجميد الصف الأول + طول تلقائي للأعمدة + فلتر تلقائي
const saveWorkbook = async (wb: ExcelJS.Workbook, filename: string) => {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// Export one or more sheets to an .xlsx file (UTF-8 safe, supports Arabic)
// تنسيق احترافي: رأس ملون بخط عريض + تجميد الصف الأول + طول تلقائي للأعمدة + فلتر تلقائي
export const exportExcel = async (filename: string, sheets: ExcelSheet[]) => {
  const ExcelJSClass = await importExcelJS();
  const wb = new ExcelJSClass.Workbook();
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet((s.name || 'Sheet').replace(/[\\/?*[\]]/g, '_').slice(0, 31) || 'Sheet', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.addRow(s.header);
    s.rows.forEach((row) => ws.addRow(row));
    // طول تلقائي للأعمدة (حد أقصى 40 حرفاً حتى لا يتمدد الجدول)
    s.header.forEach((_, ci) => {
      let max = Math.max(10, (s.header[ci] || '').length + 2);
      for (const row of s.rows) {
        const len = String(row[ci] ?? '').length;
        if (len + 2 > max) max = Math.min(len + 3, 40);
        if (max >= 40) break;
      }
      ws.getColumn(ci + 1).width = max;
    });
    // رأس عريض بخلفية ذهبية فاتحة + نص كحلي عريض (مثل الطباعة)
    s.header.forEach((_, ci) => {
      const cell = ws.getCell(1, ci + 1);
      cell.font = { bold: true, color: { argb: 'FF172033' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF3D1' } };
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    s.rows.forEach((row, ri) => {
      row.forEach((_, ci) => {
        const cell = ws.getCell(ri + 2, ci + 1);
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (typeof row[ci] === 'number' && Number.isFinite(row[ci] as number) && !Number.isInteger(row[ci])) cell.numFmt = '#,##0.00';
      });
    });
    // فلتر تلقائي على نطاق الجدول كاملاً
    if (s.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: s.rows.length + 1, column: s.header.length } };
    }
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
  }
  await saveWorkbook(wb, filename);
};

const fillSolid = (rgb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });
const thinBorder = (rgb = 'E2E8F0'): ExcelJS.Borders => ({ top: { style: 'thin', color: { argb: `FF${rgb}` } }, bottom: { style: 'thin', color: { argb: `FF${rgb}` } }, left: { style: 'thin', color: { argb: `FF${rgb}` } }, right: { style: 'thin', color: { argb: `FF${rgb}` } }, diagonal: { style: undefined, color: undefined } } as ExcelJS.Borders);

type ExStyle = {
  font?: Partial<ExcelJS.Font>;
  fill?: ExcelJS.Fill | undefined;
  border?: Partial<ExcelJS.Borders>;
  alignment?: Partial<ExcelJS.Alignment>;
};

// تصدير تقارير بنفس تصميم الطباعة (RTL، هوية، ترويسة، مربعات مؤشرات، جداول ملونة، شريط إجماليات)
export const exportStyledReport = async (filename: string, sheets: StyledReportSheet[]) => {
  const ExcelJSClass = await importExcelJS();
  const wb = new ExcelJSClass.Workbook();
  wb.created = new Date();
  for (const s of sheets) {
    const tables: StyledReportTable[] = (s.tables && s.tables.length > 0)
      ? s.tables.map((t) => ({ ...t, dense: t.dense ?? s.dense }))
      : [{ header: s.header ?? [], rows: s.rows ?? [], colWidths: s.colWidths, dense: s.dense }];
    const metaLen = s.meta?.length ?? 0;
    const nCols = Math.max(1, ...tables.map((t) => t.header.length));
    const today = new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const safeName = (s.name || 'Sheet').replace(/[\\/?*[\]]/g, '_').slice(0, 31) || 'Sheet';
    const ws = wb.addWorksheet(safeName, { views: [{ rightToLeft: true }] });
    const rows: (string | number)[][] = [];
    // شريط الهوية (مثل .brand في الطباعة)
    rows.push(['نظام إدارة المطاعم RestoCost']);
    rows.push(['إدارة التكاليف · المخزون · المبيعات · الأرباح']);
    rows.push(['']);
    // ترويسة المستند (مثل .doc-head): العنوان + خانة التاريخ على أقصى اليسار
    rows.push([s.title]);
    if (nCols >= 2) rows[3][nCols - 1] = today;
    if (s.subtitle) rows.push([s.subtitle]);
    rows.push(['']);
    // مربعات المؤشرات (مثل .meta-item): تسمية ذهبية + قيمة بارزة في بطاقة بيضاء
    const metaRows: number[] = [];
    if (metaLen) {
      s.meta!.forEach(([k, v]) => {
        metaRows.push(rows.length);
        rows.push([k, v]);
      });
      rows.push(['']);
    }
    const headerRows: number[] = [];
    const blockRows: number[] = [];
    tables.forEach((t) => {
      if (t.title) {
        blockRows.push(rows.length);
        rows.push(nCols >= 2 ? ['', t.title] : [t.title]);
      } else {
        blockRows.push(-1);
      }
      headerRows.push(rows.length);
      rows.push(t.header);
      t.rows.forEach((row) => rows.push(row));
    });
    const totalsRowStart = rows.length;
    if (s.totals?.length) s.totals.forEach((t) => rows.push(t));
    const footerRow = s.footer ? rows.length : -1;
    if (s.footer) rows.push([s.footer]);

    ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: (headerRows[0] ?? 0) + 1 }];

    rows.forEach((row) => ws.addRow(row));

    // الروابط الداخلية (مثال: من الملخص إلى ورقة بطاقة الوصفة) — row نسبي لصفوف الجدول الأول
    s.hyperlinks?.forEach((h) => {
      const absolute = headerRows[0] + 2 + h.row;
      const cell = ws.getCell(absolute, h.col + 1);
      const current = String(cell.value ?? h.text ?? '');
      cell.value = { text: h.text !== undefined ? h.text : current, hyperlink: `#${h.sheet}!A1` };
      cell.font = { ...(cell.font as ExcelJS.Font), color: { argb: 'FF0B6BC9' }, underline: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const styleCell = (r: number, c: number, st: ExStyle, skipMissing = false) => {
      const cell = ws.getCell(r + 1, c + 1);
      if (!cell.value && skipMissing) return;
      if (st.font) cell.font = st.font as ExcelJS.Font;
      if (st.fill) cell.fill = st.fill;
      if (st.border) cell.border = { ...(cell.border as ExcelJS.Borders), ...st.border } as ExcelJS.Borders;
      if (st.alignment) cell.alignment = st.alignment as ExcelJS.Alignment;
      if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) cell.numFmt = '#,##0.00';
    };

    // شريط الهوية (ذهبي فاتح مثل الطباعة — بلا ألوان غامقة)
    styleCell(0, 0, { font: { bold: true, size: 14, color: { argb: 'FF172033' } }, fill: fillSolid('FFF7DF'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', horizontal: 'center' } }, true);
    styleCell(1, 0, { font: { size: 8, color: { argb: 'FFA97912' } }, fill: fillSolid('FDF3D1'), alignment: { vertical: 'middle', horizontal: 'center' } }, true);
    // الشريط الذهبي البارز (مثل .accent-bar)
    styleCell(2, 0, { fill: fillSolid('D7A928') }, false);
    // ترويسة المستند (مثل .doc-head)
    styleCell(3, 0, { font: { bold: true, size: 12, color: { argb: 'FF172033' } }, fill: fillSolid('FDF3D1'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', horizontal: 'right' } }, true);
    if (nCols >= 2) styleCell(3, nCols - 1, { font: { bold: true, size: 8.5, color: { argb: 'FF172033' } }, fill: fillSolid('FFFFFF'), border: thinBorder('D7A928'), alignment: { vertical: 'middle', horizontal: 'center' } }, true);
    if (s.subtitle) styleCell(4, 0, { font: { italic: true, size: 8.5, color: { argb: 'FF1E293B' } }, fill: fillSolid('FFF7DF'), alignment: { vertical: 'middle', horizontal: 'right' } }, true);
    // مربعات المؤشرات: بطاقة بيضاء بتسمية ذهبية وقيمة بارزة
    metaRows.forEach((mr, i) => {
      const [, v] = s.meta![i];
      styleCell(mr, 0, { font: { bold: true, size: 8.5, color: { argb: 'FFA97912' } }, fill: fillSolid('FFF7DF'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', wrapText: true } });
      if (String(v ?? '').length > 0) styleCell(mr, 1, { font: { bold: true, size: 9.5, color: { argb: 'FF172033' } }, fill: fillSolid('FFFFFF'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', wrapText: true } });
    });
    // الجداول: عنوان القسم (بلوحة ذهبية) + الرأس + الصفوف
    tables.forEach((t, ti) => {
      const denseT = t.dense ?? false;
      if (t.title && blockRows[ti] >= 0) {
        styleCell(blockRows[ti], 0, { fill: fillSolid('D7A928') }, false);
        if (nCols >= 2) styleCell(blockRows[ti], 1, { font: { bold: true, size: 9.5, color: { argb: 'FF172033' } }, fill: fillSolid('FFF7DF'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', horizontal: 'right' } }, true);
      }
      const hdSize = denseT ? 8.5 : 10;
      t.header.forEach((_, ci) => {
        styleCell(headerRows[ti], ci, { font: { bold: true, size: hdSize, color: { argb: 'FF172033' } }, fill: fillSolid('FDF3D1'), border: thinBorder('E9D493'), alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } });
      });
      const rowSize = denseT ? 8.5 : 9.5;
      t.rows.forEach((row, ri) => {
        row.forEach((_, ci) => {
          styleCell(headerRows[ti] + 1 + ri, ci, {
            font: { size: rowSize, color: { argb: 'FF334155' } },
            fill: ri % 2 === 1 ? fillSolid('FFFCF5') : undefined,
            border: thinBorder(),
            alignment: { vertical: 'middle', wrapText: true },
          });
        });
      });
    });
    // شريط الإجماليات (مثل .totals-band): بطاقة بيضاء بإطار ذهبي
    if (s.totals?.length) {
      s.totals.forEach((_, i) => {
        const tr = totalsRowStart + i;
        styleCell(tr, 0, { font: { bold: true, size: 9, color: { argb: 'FFA97912' } }, fill: fillSolid('FFF7DF'), border: thinBorder('D7A928'), alignment: { vertical: 'middle', wrapText: true } });
        if (String(s.totals![i][1] ?? '').length > 0) styleCell(tr, 1, { font: { bold: true, size: 9, color: { argb: 'FF172033' } }, fill: fillSolid('FFFFFF'), border: thinBorder('D7A928'), alignment: { vertical: 'middle', wrapText: true } });
      });
    }
    // تذييل
    if (s.footer) styleCell(footerRow, 0, { font: { italic: true, size: 8, color: { argb: 'FF94A3B8' } }, alignment: { vertical: 'middle', horizontal: 'center' } }, true);

    // الدمج (بنفس ترتيب الصفوف)
    ws.mergeCells(1, 1, 1, nCols);
    ws.mergeCells(2, 1, 2, nCols);
    ws.mergeCells(3, 1, 3, nCols);
    ws.mergeCells(4, 1, 4, Math.max(1, nCols - 1));
    if (s.subtitle) ws.mergeCells(5, 1, 5, nCols);
    metaRows.forEach((mr) => ws.mergeCells(mr + 1, 2, mr + 1, nCols));
    tables.forEach((t, ti) => {
      if (t.title && blockRows[ti] >= 0) {
        ws.mergeCells(blockRows[ti] + 1, nCols >= 2 ? 2 : 1, blockRows[ti] + 1, nCols);
      }
    });
    if (s.footer) ws.mergeCells(footerRow + 1, 1, footerRow + 1, nCols);

    // أعمدة العرض
    let widths: number[];
    if (s.colWidths) {
      widths = s.colWidths;
    } else {
      widths = [];
      tables.forEach((t) => {
        t.header.forEach((h, ci) => {
          widths[ci] = Math.max(widths[ci] ?? 10, h.length + 2);
        });
        t.rows.forEach((row) => row.forEach((v, ci) => {
          const len = String(v ?? '').length + 2;
          if (len > (widths[ci] ?? 0)) widths[ci] = Math.min(len + 1, 40);
        }));
      });
    }
    widths.forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });
    // فلتر تلقائي + إجمالي سطر للالتفاف (اختياري)
    const firstTable = tables[0];
    if (firstTable && firstTable.rows.length > 0 && headerRows[0] !== undefined) {
      ws.autoFilter = { from: { row: headerRows[0] + 1, column: 1 }, to: { row: headerRows[0] + firstTable.rows.length, column: firstTable.header.length } };
    }
    // ارتفاعات الصفوف
    const rInfo: Record<number, { height: number }> = {};
    rInfo[1] = { height: 30 };
    rInfo[2] = { height: 14 };
    rInfo[3] = { height: 5 };
    rInfo[4] = { height: 24 };
    if (s.subtitle) rInfo[5] = { height: 16 };
    metaRows.forEach((mr) => { rInfo[mr + 1] = { height: 18 }; });
    tables.forEach((t, ti) => {
      if (t.title && blockRows[ti] >= 0) rInfo[blockRows[ti] + 1] = { height: 20 };
      rInfo[headerRows[ti] + 1] = { height: t.dense ? 26 : 30 };
    });
    ws.eachRow((row, rn) => { const h = rInfo[rn]; if (h) row.height = h.height; });
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
  }
  await saveWorkbook(wb, filename);
};

// Parse an uploaded Excel/CSV file into rows keyed by header (Arabic headers supported)
export const readExcelFile = (file: File): Promise<ParsedExcel[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = async (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const XLSX = await import('xlsx');
        const wb = XLSX.read(data, { type: 'array' });
        const sheets: ParsedExcel[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
          const header = json.length > 0 ? Object.keys(json[0]) : [];
          return { name, header, rows: json };
        }).filter((s) => s.header.length > 0);
        resolve(sheets);
      } catch {
        reject(new Error('الملف غير صالح — تأكد أنه ملف Excel أو CSV'));
      }
    };
    reader.readAsArrayBuffer(file);
  });

export const parseNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/[,\s]/g, '').replace(/[ريالر س]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export const parseStr = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v).trim();
};

// Build a downloadable CSV template for import
export const downloadTemplate = (filename: string, header: string[], sample: (string | number)[][]) => {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const content = [header.map(escape).join(','), ...sample.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
