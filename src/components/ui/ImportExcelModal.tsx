import React, { useMemo, useState } from 'react';
import { Upload, X, Check, AlertTriangle, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { readExcelFile, parseNum, parseStr, downloadTemplate, ParsedExcel } from '../../utils/excel';
import { Modal, Btn } from './index';

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  aliases: string[];
  sample?: string;
}

export interface RowIssue {
  row: number;
  message: string;
}

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  columns: ImportColumn[];
  title?: string;
  subtitle?: string;
  templateName?: string;
  existingCodes?: string[];
  codeKey?: string;
  validateRows?: (record: Record<string, unknown>) => string | null;
  onImport: (records: Record<string, unknown>[], added: number, updated: number) => void;
}

const normalize = (s: string) => String(s || '').trim().toLowerCase().replace(/[\s_\-]/g, '');

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  open, onClose, columns, title = 'استيراد بيانات من Excel', subtitle,
  templateName, existingCodes = [], codeKey, validateRows, onImport,
}) => {
  const [sheets, setSheets] = useState<ParsedExcel[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const sheet = sheets[sheetIdx];
  const excelHeaders = sheet?.header || [];

  const reset = () => {
    setSheets([]); setFileName(''); setError(''); setResult(null); setMapping({}); setSheetIdx(0);
  };

  const handleFile = async (file: File) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const parsed = await readExcelFile(file);
      if (parsed.length === 0) { setError('لا توجد بيانات في الملف'); return; }
      setSheets(parsed); setFileName(file.name); setSheetIdx(0);
      // auto-map columns by header aliases
      const auto: Record<string, string> = {};
      columns.forEach((col) => {
        const found = parsed[0].header.find((h) => col.aliases.some((a) => normalize(a) === normalize(h)));
        if (found) auto[col.key] = found;
      });
      setMapping(auto);
    } catch (e) {
      setError((e as Error).message || 'تعذر قراءة الملف');
    } finally {
      setBusy(false);
    }
  };

  const totalRows = sheet?.rows.length || 0;

  const mappedRecords = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((row) => {
      const rec: Record<string, unknown> = {};
      columns.forEach((col) => {
        const header = mapping[col.key];
        let raw: unknown = header ? row[header] : undefined;
        if (col.type === 'number') rec[col.key] = parseNum(raw);
        else if (col.type === 'select' && col.options) {
          const s = parseStr(raw);
          const opt = col.options.find((o) => o.value === s || o.label === s);
          rec[col.key] = opt ? opt.value : s;
        } else rec[col.key] = parseStr(raw);
      });
      return rec;
    });
  }, [sheet, mapping, columns]);

  const invalidCount = useMemo(() => {
    return mappedRecords.filter((r) => columns.some((c) => c.required && !String(r[c.key] || '').trim())).length;
  }, [mappedRecords, columns]);

  const codesFromRecords = useMemo(() => new Set(mappedRecords.map((r) => String(r[codeKey || ''] || '').trim()).filter(Boolean)), [mappedRecords, codeKey]);
  const existingSet = useMemo(() => new Set(existingCodes), [existingCodes]);
  const newCount = useMemo(() => {
    let n = 0;
    codesFromRecords.forEach((c) => { if (!existingSet.has(c)) n++; });
    return n;
  }, [codesFromRecords, existingSet]);
  const updateCount = codesFromRecords.size - newCount;

  const rowIssues = useMemo<RowIssue[]>(() => {
    if (!sheet) return [];
    const issues: RowIssue[] = [];
    const seen: Record<string, number> = {};
    mappedRecords.forEach((r, i) => {
      const rowNo = i + 1;
      columns.forEach((col) => {
        if (col.type === 'select' && col.options) {
          const v = String(r[col.key] || '').trim();
          if (v && !col.options.some((o) => o.value === v || o.label === v)) {
            issues.push({ row: rowNo, message: `قيمة "${v}" غير مدعومة لـ "${col.label}"` });
          }
        }
      });
      if (codeKey) {
        const c = String(r[codeKey] || '').trim();
        if (c) {
          if (c in seen) issues.push({ row: rowNo, message: `كود مكرر "${c}" — مستخدم في الصف ${seen[c]}` });
          else seen[c] = rowNo;
        }
      }
      if (validateRows) {
        const msg = validateRows(r);
        if (msg) issues.push({ row: rowNo, message: msg });
      }
    });
    return issues;
  }, [sheet, mappedRecords, columns, codeKey, validateRows]);

  const issueRows = useMemo(() => new Set(rowIssues.map((it) => it.row)), [rowIssues]);
  const validRows = useMemo(() => mappedRecords.filter((r, i) => {
    const hasRequired = !columns.some((c) => c.required && !String(r[c.key] || '').trim());
    return hasRequired && !issueRows.has(i + 1);
  }), [mappedRecords, columns, issueRows]);

  const doImport = () => {
    onImport(validRows, newCount, updateCount);
    setResult({ added: newCount, updated: updateCount });
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title={title} wide>
      <div className="space-y-4 text-xs">
        {subtitle && <p className="text-slate-500 font-bold">{subtitle}</p>}

        {!sheets.length ? (
          <div className="space-y-4">
            <label
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-colors text-center ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/40'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            >
              <Upload className={`w-8 h-8 ${dragOver ? 'text-brand-600' : 'text-brand-500'}`} />
              <div>
                <p className="font-extrabold text-slate-800">{dragOver ? 'أفلت الملف هنا' : 'اسحب الملف هنا أو اضغط للاختيار'}</p>
                <p className="text-slate-500 mt-1">ملف Excel (.xlsx) أو CSV — العمود الأول ترويسة (أسماء الأعمدة)</p>
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {templateName && (
              <div className="flex justify-center">
                <button onClick={() => downloadTemplate(templateName, columns.map((c) => c.label), [columns.map((c) => c.sample || '')])} className="flex items-center gap-1.5 text-brand-600 font-bold hover:text-brand-800">
                  <Download className="w-4 h-4" /> تنزيل قالب استيراد جاهز
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-slate-700 font-bold truncate">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">{fileName}</span>
                <span className="text-slate-400">· {totalRows} صف</span>
              </div>
              {sheets.length > 1 && (
                <select value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
                  {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                </select>
              )}
              <button onClick={() => { reset(); onClose(); }} className="text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Column mapping */}
              <div className="border border-slate-200 rounded-xl p-3 space-y-2 max-h-72 overflow-y-auto">
                <p className="font-extrabold text-slate-800 mb-2">ربط الأعمدة</p>
                {columns.map((col) => (
                  <div key={col.key} className="flex items-center gap-2">
                    <span className={`w-36 shrink-0 truncate font-bold ${col.required ? 'text-brand-700' : 'text-slate-600'}`}>
                      {col.label}{col.required && <span className="text-rose-500"> *</span>}
                    </span>
                    <select
                      value={mapping[col.key] || ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [col.key]: e.target.value }))}
                      className={`flex-1 border rounded-lg px-2 py-1.5 bg-white ${mapping[col.key] ? 'border-emerald-300' : 'border-slate-300'}`}
                    >
                      <option value="">— بدون ربط —</option>
                      {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="border border-slate-200 rounded-xl p-3 max-h-72 overflow-auto">
                <p className="font-extrabold text-slate-800 mb-2">معاينة البيانات</p>
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr>{excelHeaders.map((h) => <th key={h} className="border border-slate-200 bg-slate-100 p-1 font-bold text-slate-600 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>{excelHeaders.map((h) => <td key={h} className="border border-slate-100 p-1 text-slate-700 whitespace-nowrap max-w-[140px] truncate">{String(row[h] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-rose-700 font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <p className="text-slate-500 font-bold">سجلات جديدة</p>
                <p className="font-mono font-extrabold text-brand-700 text-base">{newCount}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <p className="text-amber-800 font-bold">سيتم تحديثها</p>
                <p className="font-mono font-extrabold text-amber-800 text-base">{updateCount}</p>
              </div>
              <div className={`border rounded-xl p-2.5 ${invalidCount ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={invalidCount ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>صفوف ناقصة</p>
                <p className={`font-mono font-extrabold text-base ${invalidCount ? 'text-rose-700' : 'text-emerald-700'}`}>{invalidCount}</p>
              </div>
            </div>

            {rowIssues.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-rose-800 font-extrabold mb-2">
                  <AlertTriangle className="w-4 h-4" /> أخطاء يجب مراجعتها قبل التنفيذ ({rowIssues.length})
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {rowIssues.slice(0, 40).map((it, i) => (
                    <p key={i} className="text-rose-700 font-bold">
                      <span className="font-mono bg-rose-100 px-1 rounded">صف {it.row}</span>: {it.message}
                    </p>
                  ))}
                  {rowIssues.length > 40 && <p className="text-rose-500 font-bold">... و {rowIssues.length - 40} خطأ إضافي</p>}
                </div>
                <p className="text-[11px] text-rose-500 font-bold mt-1.5">تُستبعد الصفوف التي بها أخطاء تلقائياً، ويستورد ما تبقى فقط ({validRows.length} صف).</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Btn tone="ghost" className="!bg-slate-100 !text-slate-700 border border-slate-300" onClick={() => { reset(); onClose(); }}>إلغاء</Btn>
              <Btn tone="success" onClick={doImport} disabled={busy || validRows.length === 0}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} استيراد ({validRows.length} صف)
              </Btn>
            </div>
            {result && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700 font-bold flex items-center gap-2">
                <Check className="w-4 h-4" /> تم الاستيراد بنجاح: {result.added} جديد + {result.updated} محدّث
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};


