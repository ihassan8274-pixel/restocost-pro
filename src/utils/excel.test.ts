import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  resolveExcelFormula,
  styledSheetModel,
  excelSheetName,
  cellDisplay,
  isFormula,
  applyStyledSheets,
  type ExcelCellValue,
  type StyledReportSheet,
} from './excel';

describe('resolveExcelFormula — رموز الصفوف داخل الصيغ', () => {
  it('يستبدل {r} و {first} و {last+3} و {b} بأرقام الصفوف المطلقة', () => {
    const f = resolveExcelFormula('=C{r}*E{r}*(1+F{r}/100)+SUM(G{first}:G{first+4})-B{last+3}', { r: 12, first: 10, last: 21, b: 25 });
    expect(f).toBe('=C12*E12*(1+F12/100)+SUM(G10:G14)-B24');
  });

  it('يدعم {first-1} و {b+0}', () => {
    expect(resolveExcelFormula('=B{first-1}/2', { first: 10, r: 1 })).toBe('=B9/2');
    expect(resolveExcelFormula('=C{b+0}', { b: 5, r: 1 })).toBe('=C5');
  });

  it('يترك الرموز غير المعروفة كما هي', () => {
    expect(resolveExcelFormula('=X{x}*1', { r: 2 })).toBe('=X{x}*1');
  });
});

describe('cellDisplay / isFormula — القيم المخزنة', () => {
  it('cellDisplay يعيد ناتج الصيغة المخزَّن أو القيمة العددية/النصية', () => {
    expect(cellDisplay({ formula: '=SUM(A1:A2)', result: 6 })).toBe(6);
    expect(cellDisplay({ formula: '=1+1' })).toBe('');
    expect(cellDisplay('نص')).toBe('نص');
    expect(cellDisplay(3.5)).toBe(3.5);
    expect(cellDisplay(null)).toBe('');
  });

  it('isFormula يميّز كائنات الصيغ', () => {
    expect(isFormula({ formula: '=1' })).toBe(true);
    expect(isFormula(5)).toBe(false);
    expect(isFormula('s')).toBe(false);
    expect(isFormula(null)).toBe(false);
  });
});

describe('styledSheetModel — تخطيط الورقة (نفس خوارزمية المصدرة)', () => {
  const mk = (): StyledReportSheet => ({
    name: 'وصفة',
    title: 'T',
    subtitle: 'S',
    meta: [['م', '1'], ['ن', '2']],
    tables: [
      { title: 'المكونات', header: ['أ', 'ب'], rows: [[1, 2], [3, 4], [5, 6]] },
      { title: 'ملخص', header: ['بند', 'قيمة'], rows: [[1], [2], [3], [4], [5], [6], [7]] },
    ],
    totals: [['إجمالي', 'x'] as [string, string]],
    footer: 'تذييل',
  });

  it('يحدد مواضع meta والرؤوس وبداية الجداول والإجماليات', () => {
    const m = styledSheetModel(mk());
    // 0..2 هوية، 3 عنوان، 4 فرعي، 5 فارغ
    // 6،7 meta ، 8 فارغ بعد meta
    expect(m.metaRows).toEqual([6, 7]);
    expect(m.metaCount).toBe(2);
    // جدول المكونات: عنوان 9، رأس 10، بيانات 11..13
    // جدول ملخص: عنوان 14، رأس 15، بيانات 16..22
    expect(m.headerRows).toEqual([10, 15]);
    expect(m.blockRows).toEqual([9, 14]);
    expect(m.tableEntries[0].dataStart).toBe(11);
    expect(m.tableEntries[0].dataEnd).toBe(14);
    expect(m.tableEntries[1].dataStart).toBe(16);
    expect(m.tableEntries[1].dataEnd).toBe(23);
    expect(m.totalsStart).toBe(23);
    expect(m.totalRows).toBe(1);
    expect(m.footerRow).toBe(24);
    expect(m.rowCount).toBe(25);
    expect(m.nCols).toBe(2);
  });

  it('يعمل مع ورقة بجدول واحد (header/rows) بلا meta ولا فرعي', () => {
    const m = styledSheetModel({ name: 'ص', title: 'T', header: ['أ'], rows: [['a'], ['b']], totals: [['ت', 'v'] as [string, string]] });
    expect(m.headerRows).toEqual([5]);
    expect(m.tableEntries[0].dataStart).toBe(6);
    expect(m.totalsStart).toBe(8);
  });
});

describe('applyStyledSheets + exceljs — صيغ حقيقية تُكتب وتُقرأ', () => {
  it('يكتب صيغاً (داخل الورقة وبين الأوراق) ويعيد قراءتها من الملف', async () => {
    const sheets: StyledReportSheet[] = [
      {
        name: 'ملخص الوصفات',
        title: 'ملخص',
        header: ['الكود', 'التكلفة'],
        rows: [[
          'k1',
          { formula: "'كشري'!B9", result: 12.5 },
        ]],
        totals: [['مجموع', { formula: '=SUM(B{first}:B{first})', result: 12.5 }] as [string, ExcelCellValue]],
      },
      {
        name: 'كشري',
        title: 'كشري',
        tables: [{ title: 'BOM', header: ['#', 'الكمية', 'سعر', 'الهدر', 'التكلفة'], rows: [[1, 2, 3.5, 5, { formula: '=C{r}*D{r}*E{r}*0', result: 0 }]] }],
        totals: [['إجمالي التكلفة', { formula: '=B{last+1}', result: 7 }] as [string, ExcelCellValue]],
      },
    ];

    const wb = new ExcelJS.Workbook();
    applyStyledSheets(wb, sheets);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);

    const sheet = back.getWorksheet('ملخص الوصفات')!;
    const f1 = sheet.getCell(7, 2).value as { formula: string; result: number };
    expect(f1.formula).toBe("'كشري'!B9");
    expect(f1.result).toBe(12.5);

    const t1 = sheet.getCell(8, 2).value as { formula: string; result: number };
    expect(t1.formula).toBe('=SUM(B7:B7)');
    expect(t1.result).toBe(12.5);

    const k = back.getWorksheet('كشري')!;
    const bomCost = k.getCell(8, 5).value as { formula: string; result: number };
    // أول صف بيانات BOM — التكلفة = صيغة صفية
    expect(bomCost.formula).toBe('=C8*D8*E8*0');
    const totalCost = k.getCell(9, 2).value as { formula: string; result: number };
    expect(totalCost.formula).toBe('=B9');
    expect(totalCost.result).toBe(7);
  });

  it('excelSheetName ينظّف الأسماء المخالفة', () => {
    expect(excelSheetName('بطاقة: الطبق / A*B[C]')).toBe('بطاقة: الطبق _ A_B_C_');
    expect(excelSheetName('')).toBe('Sheet');
  });
});