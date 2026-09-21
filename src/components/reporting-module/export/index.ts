// ============================================================
// محرك التصدير الموحد (Unified Export Engine)
// يدعم: PDF, Excel, Print — من نفس مصدر البيانات
// ============================================================

import type { 
  ReportResult, 
  PrintSpec,
  PrintColumnSpec,
  KPICardSpec,
} from '../types';

import { getMetric, METRICS_DICTIONARY } from '../data/metricsDictionary';

// ============================================================
// مساعدات التنسيق
// ============================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ar-SA', { 
    style: 'currency', 
    currency: 'SAR', 
    minimumFractionDigits: 0,
    maximumFractionDigits: 2 
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-SA').format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('ar-SA', { 
    style: 'percent', 
    minimumFractionDigits: 1,
    maximumFractionDigits: 2 
  }).format(value / 100);
}

function formatValue(value: number | undefined, format: 'currency' | 'number' | 'percent' | 'days' | 'quantity' | 'text'): string {
  if (value === undefined || value === null) return '—';
  switch (format) {
    case 'currency': return formatCurrency(value);
    case 'number': return formatNumber(value);
    case 'percent': return formatPercent(value);
    case 'days': return `${formatNumber(value)} يوم`;
    case 'quantity': return formatNumber(value);
    case 'text': return String(value);
    default: return formatNumber(value);
  }
}

function getDirectionClass(direction: 'up-is-good' | 'down-is-good' | 'neutral', delta?: number): string {
  if (delta === undefined || delta === null) return 'neutral';
  if (direction === 'up-is-good') return delta >= 0 ? 'positive' : 'negative';
  if (direction === 'down-is-good') return delta <= 0 ? 'positive' : 'negative';
  return 'neutral';
}

export { getDirectionClass };

// ============================================================
// بناء مواصفات الطباعة من تعريف التقرير
// ============================================================

export function buildPrintSpec(reportId: string, result: ReportResult): PrintSpec {
  const meta = result.meta;
  
  // أعمدة الجدول من الصفوف
  const sampleRow = result.rows[0] || {};
  const columns: PrintColumnSpec[] = Object.keys(sampleRow)
    .filter(k => typeof sampleRow[k] === 'number' || typeof sampleRow[k] === 'string')
    .map(key => {
      const metric = METRICS_DICTIONARY[key as keyof typeof METRICS_DICTIONARY];
      return {
        key,
        labelAr: metric?.labelAr || key,
        format: (metric?.format as PrintColumnSpec['format']) || 'number',
        width: 'auto',
        align: typeof sampleRow[key] === 'number' ? 'right' : 'left',
        totalLabel: key === 'branchName' ? 'المجموع' : undefined,
      };
    });
  
  // إضافة عمود الفرع إذا لم يكن موجوداً
  if (!columns.find(c => c.key === 'branchId' || c.key === 'branchName')) {
    columns.unshift({
      key: 'branchName',
      labelAr: 'الفرع',
      format: 'text',
      width: '200px',
      align: 'left',
      totalLabel: 'المجموع',
    });
  }
  
  // بطاقات KPI
  const kpiCards: KPICardSpec[] = result.kpis.map(kpi => {
    const metric = getMetric(kpi.id);
    return {
      metricId: kpi.id,
      labelAr: metric.labelAr,
      format: metric.format as KPICardSpec['format'],
      direction: metric.direction as KPICardSpec['direction'],
    };
  });
  
  return {
    reportId,
    title: meta.family, // سيتم استبداله بالعنوان الفعلي
    subtitle: `الفترة: ${meta.period.from} إلى ${meta.period.to}`,
    orientation: 'landscape',
    pageSize: 'A4',
    header: {
      showLogo: true,
      companyName: 'ماسوبي - نظام إدارة المطاعم',
      reportTitle: meta.family,
      period: `${meta.period.from} → ${meta.period.to}`,
      classification: 'سري',
    },
    footer: {
      printedBy: 'نظام التقارير الموحد',
      printedAt: new Date().toLocaleString('ar-SA'),
      pageNumber: 'صفحة {current} من {total}',
    },
    table: {
      columns,
      showTotals: true,
      showRowNumbers: true,
      heatmapColumn: 'foodCostVariancePct',
    },
    kpiCards,
    statusBadge: meta.closed ? 'closed' : 'estimated',
  };
}

// ============================================================
// تصدير Excel (باستخدام ورقة عمل واحدة أو متعددة)
// ============================================================

export interface ExcelWorkbook {
  sheets: ExcelSheet[];
}

export interface ExcelSheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
  cols?: { width: number }[];
}

export function buildExcelWorkbook(reportId: string, result: ReportResult, definition?: { nameAr: string }): ExcelWorkbook {
  const sheets: ExcelSheet[] = [];
  
  // ورقة الغلاف
  if (true) { // includeCover
    sheets.push({
      name: 'الغلاف',
      header: [],
      rows: [
        ['نظام ماسوبي - تقارير موحدة'],
        [definition?.nameAr || reportId],
        [`الفترة: ${result.meta.period.from} إلى ${result.meta.period.to}`],
        [`تاريخ الإنشاء: ${new Date(result.meta.generatedAt).toLocaleString('ar-SA')}`],
        [`حالة الفترة: ${result.meta.closed ? 'مقفلة (نهائية)' : 'تقديرية'}`],
        [`عدد السجلات: ${result.meta.recordCount}`],
      ],
      cols: [{ width: 40 }, { width: 30 }],
    });
  }
  
  // ورقة KPIs
  if (result.kpis.length > 0) {
    sheets.push({
      name: 'مؤشرات KPI',
      header: ['المؤشر', 'القيمة', 'التغير %', 'التغير المطلق', 'الاتجاه'],
      rows: result.kpis.map(kpi => [
        kpi.labelAr,
        formatValue(kpi.value, getMetric(kpi.id).format),
        kpi.delta !== undefined ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(1)}%` : '—',
        kpi.deltaAbs !== undefined ? formatValue(kpi.deltaAbs, getMetric(kpi.id).format) : '—',
        kpi.direction === 'up-is-good' ? '↑ للأفضل' : kpi.direction === 'down-is-good' ? '↓ للأفضل' : 'محايد',
      ]),
      cols: [{ width: 30 }, { width: 20 }, { width: 15 }, { width: 20 }, { width: 15 }],
    });
  }
  
  // ورقة الجدول الرئيسي
  if (result.rows.length > 0) {
    const sampleRow = result.rows[0];
    const columns = Object.keys(sampleRow)
      .filter(k => typeof sampleRow[k] === 'number' || typeof sampleRow[k] === 'string');
    
    const header = columns.map(key => {
      const metric = METRICS_DICTIONARY[key as keyof typeof METRICS_DICTIONARY];
      return metric?.labelAr || key;
    });
    
    const rows = result.rows.map(row => 
      columns.map(key => {
        const val = row[key];
        const metric = METRICS_DICTIONARY[key as keyof typeof METRICS_DICTIONARY];
        if (typeof val === 'number') return formatValue(val, metric?.format || 'number');
        return val;
      })
    );
    
    // صف الإجماليات
    if (result.totals) {
      const totalRow = columns.map(key => {
        const val = result.totals[key];
        const metric = METRICS_DICTIONARY[key as keyof typeof METRICS_DICTIONARY];
        if (typeof val === 'number') return formatValue(val, metric?.format || 'number');
        if (key === 'branchName') return 'المجموع';
        return val;
      });
      rows.push(totalRow);
    }
    
    sheets.push({
      name: 'البيانات',
      header,
      rows,
      cols: columns.map(() => ({ width: 18 })),
    });
  }
  
  // ورقة السلاسل الزمنية (للرسوم البيانية)
  if (result.series.length > 0) {
    const seriesColumns = Object.keys(result.series[0]);
    sheets.push({
      name: 'السلاسل الزمنية',
      header: seriesColumns.map(c => c === 'label' ? 'التاريخ' : c),
      rows: result.series.map(s => seriesColumns.map(c => s[c])),
      cols: seriesColumns.map(() => ({ width: 18 })),
    });
  }
  
  // ورقة التحذيرات
  if (result.warnings.length > 0) {
    sheets.push({
      name: 'تحذيرات',
      header: ['#', 'التحذير'],
      rows: result.warnings.map((w, i) => [i + 1, w]),
      cols: [{ width: 5 }, { width: 80 }],
    });
  }
  
  return { sheets };
}

// ============================================================
// بناء HTML للطباعة (Print)
// ============================================================

export function buildPrintHTML(reportId: string, result: ReportResult, definition: { nameAr: string }): string {
  const printSpec = buildPrintSpec(reportId, result);
  const { header, footer, table, kpiCards, statusBadge } = printSpec;
  const meta = result.meta;
  
  const kpiCardsHTML = kpiCards?.map(card => {
    const kpi = result.kpis.find(k => k.id === card.metricId);
    if (!kpi) return '';
    const deltaHTML = kpi.delta !== undefined 
      ? `<span style="color: ${kpi.delta >= 0 ? '#10b981' : '#ef4444'}; font-size: 11px;">${kpi.delta >= 0 ? '▲' : '▼'} ${Math.abs(kpi.delta).toFixed(1)}%</span>`
      : '';
    return `
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; min-width: 140px; text-align: center;">
        <div style="font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">${card.labelAr}</div>
        <div style="font-size: 20px; font-weight: 800; color: #1e293b;">${formatValue(kpi.value, card.format)}</div>
        <div>${deltaHTML}</div>
      </div>
    `;
  }).join('') || '';
  
  // جدول البيانات
  const columns = table.columns;
  const theadHTML = `
    <thead>
      <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
        ${columns.map((col, i) => `
          <th style="padding: 8px 10px; text-align: ${col.align || 'left'}; font-weight: 700; font-size: 11px; color: #334155; white-space: nowrap; ${i === 0 ? 'position: sticky; left: 0; background: #f8fafc; z-index: 1;' : ''}">
            ${col.labelAr}
          </th>
        `).join('')}
      </tr>
    </thead>
  `;
  
  const tbodyHTML = `
    <tbody>
      ${result.rows.map((row, rowIndex) => `
        <tr style="${rowIndex % 2 === 0 ? 'background: #fafafa;' : ''} border-bottom: 1px solid #f1f5f9;">
          ${columns.map((col, i) => {
            const val = row[col.key];
            const metric = METRICS_DICTIONARY[col.key as keyof typeof METRICS_DICTIONARY];
            const formatted = typeof val === 'number' ? formatValue(val, metric?.format || 'number') : (val || '—');
            const isTotal = row.branchId === 'TOTAL';
            return `
              <td style="padding: 7px 10px; text-align: ${col.align || 'left'}; font-size: 11px; ${isTotal ? 'font-weight: 700; background: #f1f5f9;' : ''} ${i === 0 ? 'position: sticky; left: 0; background: inherit; z-index: 1;' : ''}">
                ${formatted}
              </td>
            `;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;
  
  const totalsRow = result.totals ? `
    <tfoot>
      <tr style="background: #e2e8f0; border-top: 2px solid #cbd5e1;">
        ${columns.map((col, i) => {
          const val = result.totals[col.key];
          const metric = METRICS_DICTIONARY[col.key as keyof typeof METRICS_DICTIONARY];
          const formatted = typeof val === 'number' ? formatValue(val, metric?.format || 'number') : (val || '');
          return `
            <td style="padding: 8px 10px; text-align: ${col.align || 'left'}; font-weight: 700; font-size: 11px; color: #1e293b; ${i === 0 ? 'position: sticky; left: 0; background: #e2e8f0; z-index: 1;' : ''}">
              ${col.key === 'branchName' ? 'المجموع' : formatted}
            </td>
          `;
        }).join('')}
      </tr>
    </tfoot>
  ` : '';
  
  const badgeColors: Record<string, { bg: string; text: string }> = {
    closed: { bg: '#dcfce7', text: '#166534' },
    estimated: { bg: '#fef3c7', text: '#92400e' },
    partial: { bg: '#dbeafe', text: '#1e40af' },
  };
  const badge = badgeColors[statusBadge || 'estimated'] || badgeColors.estimated;
  
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${definition.nameAr} - ${meta.period.from} إلى ${meta.period.to}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    @media print {
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
    body { font-family: 'Tahoma', 'Arial', sans-serif; font-size: 12px; color: #1e293b; line-height: 1.4; margin: 0; padding: 0; }
    .container { max-width: 100%; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #1e293b; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .logo { width: 48px; height: 48px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; }
    .company-name { font-size: 18px; font-weight: 800; color: #1e293b; }
    .report-title { font-size: 14px; color: #64748b; }
    .header-right { text-align: left; font-size: 11px; color: #475569; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; background: ${badge.bg}; color: ${badge.text}; }
    .kpi-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
    .warnings { margin-top: 16px; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 11px; color: #991b1b; }
    .warning-item { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header no-print">
      <div class="header-left">
        <div class="logo">م</div>
        <div>
          <div class="company-name">${header.companyName}</div>
          <div class="report-title">${definition.nameAr}</div>
        </div>
      </div>
      <div class="header-right">
        <div>${header.period}</div>
        <div>${header.classification}</div>
        <div style="margin-top: 8px;"><span class="badge">${statusBadge === 'closed' ? 'مقفلة' : statusBadge === 'estimated' ? 'تقديرية' : 'جزئية'}</span></div>
      </div>
    </div>

    <!-- KPI Cards -->
    ${kpiCardsHTML ? `
    <div class="kpi-row no-print">
      ${kpiCardsHTML}
    </div>
    ` : ''}

    <!-- Main Table -->
    <table>
      ${theadHTML}
      ${tbodyHTML}
      ${totalsRow}
    </table>

    <!-- Footer -->
    <div class="footer no-print">
      <div>${footer.printedBy}</div>
      <div>${footer.printedAt}</div>
      <div>${footer.pageNumber}</div>
    </div>

    <!-- Warnings -->
    ${result.warnings.length > 0 ? `
    <div class="warnings no-print">
      <div style="font-weight: 700; margin-bottom: 8px;">⚠ تحذيرات:</div>
      ${result.warnings.map(w => `<div class="warning-item">• ${w}</div>`).join('')}
    </div>
    ` : ''}
  </div>
  <script>
    // Auto-print when loaded in print mode
    if (window.location.search.includes('print=1')) {
      window.onload = () => window.print();
    }
  </script>
</body>
</html>
  `;
}

// ============================================================
// دوال التصدير الرئيسية
// ============================================================

export async function exportToExcel(reportId: string, result: ReportResult, definition: { nameAr: string }): Promise<Blob> {
  const workbook = buildExcelWorkbook(reportId, result, definition);
  
  // إنشاء ملف Excel بسيط كـ CSV للورقة الرئيسية (للتوافق الفوري)
  // في الإنتاج: استخدام مكتبة مثل exceljs أو sheetjs
  const mainSheet = workbook.sheets.find(s => s.name === 'البيانات') || workbook.sheets[0];
  
  let csvContent = '\uFEFF'; // BOM for Arabic
  csvContent += mainSheet.header.join(',') + '\n';
  csvContent += mainSheet.rows.map(row => 
    row.map(cell => {
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  ).join('\n');
  
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

export async function exportToPDF(reportId: string, result: ReportResult, definition: { nameAr: string }): Promise<Blob> {
  // في البيئة الحالية: نرجع HTML قابل للطباعة كـ PDF عبر المتصفح
  // في الإنتاج: استخدام puppeteer أو طباعة من جانب الخادم
  const html = buildPrintHTML(reportId, result, definition);
  return new Blob([html], { type: 'text/html;charset=utf-8;' });
}

export function openPrintWindow(reportId: string, result: ReportResult, definition: { nameAr: string }): Window | null {
  const html = buildPrintHTML(reportId, result, definition);
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // تأخير قصير لضمان تحميل المحتوى قبل الطباعة
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }
  return printWindow;
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExportFilename(reportId: string, format: 'pdf' | 'excel' | 'print', period: { from: string; to: string }): string {
  const dateStr = period.from === period.to ? period.from : `${period.from}_${period.to}`;
  const ext = format === 'excel' ? 'csv' : format;
  return `${reportId}_${dateStr}.${ext}`;
}

// ============================================================
// تصدير حزمة مستندات (Document Bundle)
// ============================================================

export interface DocumentBundleExport {
  cover: string;
  reports: Array<{
    reportId: string;
    html: string;
    title: string;
  }>;
  index: string;
}

export async function buildDocumentBundle(
  bundleId: string,
  reportResults: Array<{ reportId: string; result: ReportResult; definition: { nameAr: string } }>
): Promise<DocumentBundleExport> {
  const coverHTML = `
    <div style="text-align: center; padding: 80px 40px; font-family: Tahoma, Arial, sans-serif;">
      <div style="font-size: 36px; font-weight: 800; color: #1e293b; margin-bottom: 16px;">حزمة تقارير ماسوبي</div>
      <div style="font-size: 20px; color: #64748b; margin-bottom: 40px;">${bundleId}</div>
      <div style="font-size: 14px; color: #94a3b8;">تاريخ الإنشاء: ${new Date().toLocaleString('ar-SA')}</div>
    </div>
  `;
  
  const reports = reportResults.map(({ reportId, result, definition }) => ({
    reportId,
    html: buildPrintHTML(reportId, result, definition),
    title: definition.nameAr,
  }));
  
  const indexHTML = `
    <div style="padding: 40px; font-family: Tahoma, Arial, sans-serif;">
      <h2 style="color: #1e293b; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px;">فهرس الحزمة</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px; text-align: right; font-weight: 700;">#</th>
            <th style="padding: 10px; text-align: right; font-weight: 700;">التقرير</th>
            <th style="padding: 10px; text-align: center; font-weight: 700;">الفترة</th>
            <th style="padding: 10px; text-align: center; font-weight: 700;">الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${reportResults.map(({ result, definition }, i) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; text-align: center;">${i + 1}</td>
              <td style="padding: 10px;">${definition.nameAr}</td>
              <td style="padding: 10px; text-align: center;">${result.meta.period.from} → ${result.meta.period.to}</td>
              <td style="padding: 10px; text-align: center;">${result.meta.closed ? 'مقفلة' : 'تقديرية'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  return { cover: coverHTML, reports, index: indexHTML };
}