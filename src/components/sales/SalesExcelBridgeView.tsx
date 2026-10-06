import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn } from '../ui';

type Kind = 'delivery' | 'batch';

interface PrepDelivery {
  date: string; platform: string; branchId: string;
  gross: number; net: number; orders: number;
}
interface PrepBatchGroup {
  key: string; date: string; branchId: string; vatPct: number;
  items: { recipeNameAr: string; quantitySold: number; unitPrice: number; unitCost: number }[];
}
interface Result {
  ready: boolean; count: number; errors: string[];
}

const DELIVERY_HEADERS = ['التاريخ (YYYY-MM-DD)', 'المنصة', 'الفرع (بالاسم)', 'عدد الطلبات', 'الإيراد الإجمالي', 'نسبة العمولة %', 'صافي بعد العمولة (اختياري)'];
const BATCH_HEADERS = ['التاريخ (YYYY-MM-DD)', 'الفرع (بالاسم)', 'الطبق', 'الكمية', 'سعر الوحدة', 'تكلفة الوحدة', 'نسبة الضريبة %'];

const toStr = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
};
const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const normDate = (raw: string): string | null => {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
};

export const SalesExcelBridgeView: React.FC = () => {
  const { branches, addDeliverySale, addBatchSalesRecord, showToast } = useApp();
  const [results, setResults] = useState<Record<Kind, Result>>({
    delivery: { ready: false, count: 0, errors: [] },
    batch: { ready: false, count: 0, errors: [] },
  });
  const [pending, setPending] = useState<{ delivery: PrepDelivery[]; batch: PrepBatchGroup[] }>({ delivery: [], batch: [] });

  const branchMap = new Map<string, string>();
  branches.forEach((b) => { branchMap.set(String((b as unknown as { name: string }).name).trim(), b.id); });

  const downloadTemplate = (kind: Kind) => {
    const b0 = branches[0];
    const branchName = b0
      ? ((b0 as unknown as { nameAr?: string }).nameAr || (b0 as unknown as { name: string }).name || 'الفرع الرئيسي')
      : 'الفرع الرئيسي';

    const wb = XLSX.utils.book_new();

    const instructions: (string | number)[][] = [
      ['دليل استيراد المبيعات — RestoCost ERP Pro', '', '', ''],
      [],
      ['الصيغة المطلوبة:'],
      ['1. احتفظ بأسماء الأعمدة كما هي بالضبط (بما في ذلك الأقواس والرموز)'],
      ['2. التاريخ بصيغة YYYY-MM-DD فقط (مثال: 2026-08-25)'],
      ['3. أسماء الفروع يجب أن تطابق أسماء الفروع في النظام بالضبط'],
      ['4. لا تُدخل معلومات فارغة — اتركها وسيتم التعامل معها تلقائياً'],
      ['5. يمكنك إدخال عدة صفوف لنفس اليوم والفرع في المبيعات المجمعة — سيتم تجميعها'],
      [],
      ['الأعمدة المطلوبة — مبيعات التوصيل:'],
      [...DELIVERY_HEADERS],
      ['التاريخ (YYYY-MM-DD)', 'التاريخ بالشكل Year-Month-Day — مثال: 2026-08-25'],
      ['المنصة', 'اسم تطبيق التوصيل: جاهز، هنقرستيشن، كيك، تويو، إلخ'],
      ['الفرع (بالاسم)', 'اسم الفرع كما هو مسجل في النظام'],
      ['عدد الطلبات', 'عدد طلبات التوصيل في ذلك اليوم (رقم صحيح)'],
      ['الإيراد الإجمالي', 'إجمالي الإيراد من المنصة بالريال'],
      ['نسبة العمولة %', 'نسبة عمولة المنصة كنسبة مئوية (مثال: 25 يعني 25%)'],
      ['صافي بعد العمولة (اختياري)', 'إذا تركته فارغاً يُحسب تلقائياً من الإيراد ونسبة العمولة'],
      [],
      ['الأعمدة المطلوبة — المبيعات المجمعة:'],
      [...BATCH_HEADERS],
      ['التاريخ (YYYY-MM-DD)', 'التاريخ بالشكل Year-Month-Day — مثال: 2026-08-25'],
      ['الفرع (بالاسم)', 'اسم الفرع كما هو مسجل في النظام'],
      ['الطبق', 'اسم الطبق بالعربي كما هو في النظام'],
      ['الكمية', 'عدد المباعات من هذا الطبق'],
      ['سعر الوحدة', 'سعر بيع الوحدة الواحدة بالريال'],
      ['تكلفة الوحدة', 'تكلفة إعداد الوحدة الواحدة بالريال'],
      ['نسبة الضريبة %', 'نسبة الضريبة المضافة (مثال: 15 يعني 15%)'],
      [],
      ['ملاحظات مهمة:'],
      ['- المبيعات المجمعة: يمكنك إدخال عدة صفوف لنفس اليوم والفرع — سيتم تجميعها تلقائياً'],
      ['- لا تحذف صفوف العناوين (الصف الأول)'],
      ['- الصيغ المدعومة: .xlsx, .xls, .csv'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(instructions);
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws1['!cols'] = [{ wch: 38 }, { wch: 55 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'الدليل والشرح');

    const deliveryRows = [
      DELIVERY_HEADERS,
      ['2026-08-25', 'جاهز', branchName, 15, 580.00, 25, '435.00'],
      ['2026-08-25', 'هنقرستيشن', branchName, 8, 320.00, 22, '249.60'],
      ['2026-08-26', 'كيك', branchName, 20, 750.00, 20, ''],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(deliveryRows);
    ws2['!cols'] = DELIVERY_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 20) }));
    XLSX.utils.book_append_sheet(wb, ws2, 'مثال توصيل');

    const batchRows = [
      BATCH_HEADERS,
      ['2026-08-25', branchName, 'برجر لحم', 25, 35.00, 12.50, 15],
      ['2026-08-25', branchName, 'دجاج مشوي', 18, 42.00, 15.00, 15],
      ['2026-08-26', branchName, 'برجر لحم', 30, 35.00, 12.50, 15],
      ['2026-08-26', branchName, 'سلطة سيزر', 12, 28.00, 8.00, 15],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(batchRows);
    ws3['!cols'] = BATCH_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
    XLSX.utils.book_append_sheet(wb, ws3, 'مثال بيع مجمعة');

    XLSX.writeFile(wb, kind === 'delivery' ? 'دليل_مبيعات_التوصيل.xlsx' : 'دليل_المبيعات_المجمعة.xlsx');
    showToast('تم تحميل الدليل الشامل — اقرأ الشرح في الورقة الأولى ثم عدّل بيانات المثال');
  };

  const handleFile = async (kind: Kind, file: File) => {
    const errors: string[] = [];
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) throw new Error('الملف فارغ');

      if (kind === 'delivery') {
        const prep: PrepDelivery[] = [];
        rows.forEach((r, i) => {
          const get = (...keys: string[]) => { for (const k of keys) { const hit = Object.keys(r).find((rk) => rk.includes(k)); if (hit !== undefined && String(r[hit]).trim() !== '') return r[hit]; } return ''; };
          const date = normDate(toStr(get('التاريخ')));
          const platform = toStr(get('المنصة'));
          const branchName = toStr(get('الفرع'));
          const gross = toNum(get('الإيراد'));
          if (!date) { errors.push(`صف ${i + 2}: تاريخ غير صالح`); return; }
          if (!platform) { errors.push(`صف ${i + 2}: المنصة مفقودة`); return; }
          if (!(gross > 0)) { errors.push(`صف ${i + 2}: الإيراد الإجمالي غير صالح`); return; }
          const branchId = branchMap.get(branchName) || '';
          const pct = toNum(get('نسبة العمولة')) || 0;
          const netRaw = toNum(get('صافي'));
          const net = Number.isFinite(netRaw) && netRaw > 0 ? netRaw : gross * (1 - pct / 100);
          const orders = Math.max(0, Math.round(toNum(get('عدد الطلبات')) || 0));
          prep.push({ date, platform, branchId, gross, net, orders });
        });
        setPending((p) => ({ ...p, delivery: prep }));
        setResults((r) => ({ ...r, delivery: { ready: prep.length > 0, count: prep.length, errors } }));
      } else {
        const groups = new Map<string, PrepBatchGroup>();
        rows.forEach((r, i) => {
          const get = (...keys: string[]) => { for (const k of keys) { const hit = Object.keys(r).find((rk) => rk.includes(k)); if (hit !== undefined && String(r[hit]).trim() !== '') return r[hit]; } return ''; };
          const date = normDate(toStr(get('التاريخ')));
          const branchName = toStr(get('الفرع'));
          const dish = toStr(get('الطبق'));
          const qty = toNum(get('الكمية'));
          if (!date) { errors.push(`صف ${i + 2}: تاريخ غير صالح`); return; }
          if (!dish) { errors.push(`صف ${i + 2}: اسم الطبق مفقود`); return; }
          if (!(qty > 0)) { errors.push(`صف ${i + 2}: كمية غير صالحة`); return; }
          const price = toNum(get('سعر الوحدة')) || 0;
          const cost = toNum(get('تكلفة الوحدة')) || 0;
          const vatPct = Math.max(0, toNum(get('نسبة الضريبة')) || 0);
          const branchId = branchMap.get(branchName) || '';
          const key = `${date}__${branchId}`;
          const g = groups.get(key) ?? { key, date, branchId, vatPct, items: [] };
          g.items.push({ recipeNameAr: dish, quantitySold: qty, unitPrice: price, unitCost: cost });
          if (vatPct > 0 && !g.vatPct) g.vatPct = vatPct;
          groups.set(key, g);
        });
        const list = Array.from(groups.values());
        setPending((p) => ({ ...p, batch: list }));
        setResults((r) => ({ ...r, batch: { ready: list.length > 0, count: list.length, errors } }));
      }
      showToast('تم قراءة الملف — راجع المعاينة ثم نفّذ الاستيراد');
    } catch (e: unknown) {
      setResults((r) => ({ ...r, [kind]: { ready: false, count: 0, errors: [`تعذر قراءة الملف: ${e instanceof Error ? e.message : String(e)}`] } }));
    }
  };

  const commit = (kind: Kind) => {
    let n = 0;
    if (kind === 'delivery') {
      pending.delivery.forEach((d) => {
        addDeliverySale({
          date: d.date, platform: d.platform, branchId: d.branchId,
          grossRevenue: d.gross, netRevenue: d.net,
          commissionAmount: d.gross - d.net, ordersCount: d.orders,
        } as unknown as Parameters<typeof addDeliverySale>[0]);
        n += 1;
      });
    } else {
      pending.batch.forEach((g) => {
        const grossTotal = g.items.reduce((s, it) => s + it.quantitySold * it.unitPrice, 0);
        const factor = 1 / (1 + g.vatPct / 100);
        const netTotal = grossTotal * factor;
        const costTotal = g.items.reduce((s, it) => s + it.quantitySold * it.unitCost, 0);
        addBatchSalesRecord({
          date: g.date, branchId: g.branchId,
          totalRevenue: grossTotal, netRevenue: netTotal, vatRate: g.vatPct,
          totalFoodCost: costTotal,
          items: g.items.map((it) => ({ recipeId: '', recipeNameAr: it.recipeNameAr, quantitySold: it.quantitySold, unitPrice: it.unitPrice, unitCost: it.unitCost, lineTotalRevenue: it.quantitySold * it.unitPrice })),
        } as unknown as Parameters<typeof addBatchSalesRecord>[0]);
        n += 1;
      });
    }
    showToast(`تم استيراد ${n} ${kind === 'delivery' ? 'سجل توصيل' : 'دفعة يومية'} بنجاح`);
    setPending((p) => ({ ...p, [kind]: kind === 'delivery' ? [] : [] }));
    setResults((r) => ({ ...r, [kind]: { ready: false, count: 0, errors: [] } }));
  };

  const Panel: React.FC<{ kind: Kind; title: string; desc: string }> = ({ kind, title, desc }) => {
    const res = results[kind];
    const pendCount = kind === 'delivery' ? pending.delivery.length : pending.batch.length;
    return (
      <Card className="p-4 space-y-3">
        <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {title}</h3>
        <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
        <div className="flex flex-wrap gap-2">
          <Btn tone="primary" onClick={() => downloadTemplate(kind)}><Download className="w-4 h-4" /> تحميل قالب فارغ</Btn>
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-extrabold px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors">
            <Upload className="w-4 h-4" /> اختيار ملف ومعاينة
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(kind, f); e.currentTarget.value = ''; }} />
          </label>
        </div>
        {res.count > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {pendCount} سجل جاهز للاستيراد</span>
            <Btn tone="success" onClick={() => commit(kind)}>تنفيذ الاستيراد</Btn>
          </div>
        )}
        {res.errors.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 max-h-40 overflow-y-auto">
            <p className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-4 h-4" /> تم تخطي {res.errors.length} صف:</p>
            <ul className="text-[10px] text-amber-700 space-y-0.5 list-disc pr-4">{res.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="استيراد المبيعات من Excel"
        subtitle="حمّل قالباً فارغاً، عبّئه في Excel، ثم ارفعه للاستيراد الجماعي — يدعم مبيعات التوصيل والمبيعات المجمعة اليومية مع تجميع تلقائي للأطباق"
        icon={<FileSpreadsheet className="w-6 h-6 text-emerald-600" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel
          kind="delivery"
          title="مبيعات تطبيقات التوصيل"
          desc={`الأعمدة: ${DELIVERY_HEADERS.join(' | ')}. الصافي يُحسب تلقائياً من نسبة العمولة إذا تركته فارغاً. أسماء الفروع يجب أن تطابق أسماء الفروع في النظام.`}
        />
        <Panel
          kind="batch"
          title="المبيعات المجمعة (صف لكل طبق)"
          desc={`الأعمدة: ${BATCH_HEADERS.join(' | ')}. يمكنك سرد عدة صفوف لنفس اليوم والفرع — سيتم تجميعها تلقائياً في دفعة واحدة مع حساب الضريبة وتكلفة الطعام.`}
        />
      </div>
    </div>
  );
};
