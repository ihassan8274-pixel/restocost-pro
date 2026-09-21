import React, { useMemo, useState } from 'react';
import { Printer, CreditCard } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// الحسابات الدائنة وتقادمها (AP Aging)
// الهوية (مستمدّة من شاشة (AP) في v7.0):
//   مستحقات الموردين من سندات الاستلام (GRN) المعتمدة؛ استحقاق = تاريخ الفاتورة
//   + شروط السداد (days)؛ شرائح التقادم: غير مستحق بعد → 0-30 → 31-60 → 61-90 → +90
// فلاتر: شهر (تاريخ الفاتورة)
// ═══════════════════════════════════════════════════════════════════════════

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const DAY = 86400000;
const TODAY = Date.now();

interface GRNLine {
  grn: string;
  grnNumber: string;
  supplierId: string;
  supplierName: string;
  branchName: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysFromInvoice: number;
  overdueDays: number;
  bucket: string;
}

const BUCKETS = ['غير مستحق بعد', '0-30 يوم', '31-60 يوم', '61-90 يوم', '90+ يوم'];

export const ApAgingReport: React.FC = () => {
  const { grnNotes, suppliers, getBranchName } = useApp();
  const [monthFilter, setMonthFilter] = useState<string>('');

  const months = useMemo(
    () => Array.from(new Set(grnNotes.map((g) => (g.invoiceDate || g.date || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [grnNotes]
  );
  const periodValue = monthFilter || months[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';

  const lines = useMemo<GRNLine[]>(() => {
    const terms = (supplierId: string) => suppliers.find((s) => s.id === supplierId)?.paymentTermsDays ?? 0;
    const out: GRNLine[] = [];
    for (const g of grnNotes) {
      if (g.status !== 'approved') continue;
      const invDate = g.invoiceDate || g.date || '';
      const monthKey = invDate.slice(0, 7);
      if (periodValue && monthKey !== periodValue) continue;
      const invMs = new Date(invDate).getTime();
      if (Number.isNaN(invMs)) continue;
      const daysFromInvoice = Math.max(0, Math.floor((TODAY - invMs) / DAY));
      const dueMs = invMs + terms(g.supplierId) * DAY;
      const overdueDays = TODAY > dueMs ? Math.floor((TODAY - dueMs) / DAY) : 0;
      let bucket: string;
      if (overdueDays === 0) bucket = 'غير مستحق بعد';
      else if (overdueDays <= 30) bucket = '0-30 يوم';
      else if (overdueDays <= 60) bucket = '31-60 يوم';
      else if (overdueDays <= 90) bucket = '61-90 يوم';
      else bucket = '90+ يوم';
      out.push({
        grn: g.id,
        grnNumber: g.grnNumber,
        supplierId: g.supplierId,
        supplierName: g.supplierName,
        branchName: getBranchName(g.branchId),
        invoiceDate: invDate,
        dueDate: new Date(dueMs).toISOString().slice(0, 10),
        amount: (g.totalAmount || 0) + (g.vatAmount || 0),
        daysFromInvoice,
        overdueDays,
        bucket,
      });
    }
    return out.sort((a, b) => b.overdueDays - a.overdueDays || b.amount - a.amount);
  }, [grnNotes, suppliers, getBranchName, periodValue]);

  const totalAp = lines.reduce((s, l) => s + l.amount, 0);
  const notDue = lines.filter((l) => l.bucket === 'غير مستحق بعد').reduce((s, l) => s + l.amount, 0);
  const dueNow = totalAp - notDue;
  const overdue90 = lines.filter((l) => l.bucket === '90+ يوم').reduce((s, l) => s + l.amount, 0);
  const supplierCount = new Set(lines.map((l) => l.supplierId)).size;

  const bucketRows = useMemo(
    () => BUCKETS.map((b) => {
      const arr = lines.filter((l) => l.bucket === b);
      return { bucket: b, count: arr.length, amount: arr.reduce((s, l) => s + l.amount, 0) };
    }),
    [lines]
  );

  const supplierRows = useMemo(() => {
    const map = new Map<string, { name: string; count: number; amount: number; dueDate: string; oldest: number }>();
    for (const l of lines) {
      const cur = map.get(l.supplierId) ?? { name: l.supplierName, count: 0, amount: 0, dueDate: l.dueDate, oldest: l.overdueDays };
      cur.count += 1;
      cur.amount += l.amount;
      if (l.dueDate < cur.dueDate) cur.dueDate = l.dueDate;
      if (l.overdueDays > cur.oldest) cur.oldest = l.overdueDays;
      map.set(l.supplierId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [lines]);

  const chartData = bucketRows.map((b) => ({ name: b.bucket, المبلغ: Number(b.amount.toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'الحسابات الدائنة وتقادمها (AP Aging)',
      subtitle: `${COMPANY} — ${periodLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['إجمالي الدائن', fmtMoney(totalAp)],
        ['غير مستحق', fmtMoney(notDue)],
        ['متأخر +90', fmtMoney(overdue90)],
      ],
      tables: [
        {
          title: 'الشرائح',
          header: ['الشريحة', 'السندات', 'المبلغ'],
          rows: bucketRows.map((b) => [b.bucket, b.count, fmtMoney(b.amount)]),
          dense: true,
        },
        {
          title: 'تفاصيل السندات',
          header: ['السند', 'المورد', 'الفرع', 'تاريخ الفاتورة', 'الاستحقاق', 'المبلغ', 'متأخر (أيام)'],
          rows: lines.map((l) => [l.grnNumber, l.supplierName, l.branchName, l.invoiceDate, l.dueDate, fmtMoney(l.amount), `${l.overdueDays}`]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الشرائح',
      header: ['الشريحة', 'السندات', 'المبلغ'],
      rows: bucketRows.map((b) => [b.bucket, b.count, b.amount.toFixed(2)]),
    },
    {
      name: 'السندات',
      header: ['السند', 'المورد', 'الفرع', 'تاريخ الفاتورة', 'الاستحقاق', 'المبلغ', 'متأخر (أيام)', 'الشريحة'],
      rows: lines.map((l) => [l.grnNumber, l.supplierName, l.branchName, l.invoiceDate, l.dueDate, l.amount.toFixed(2), l.overdueDays, l.bucket]),
    },
    {
      name: 'حسب المورد',
      header: ['المورد', 'السندات', 'المبلغ', 'أقدم استحقاق', 'أقصى تأخير (أيام)'],
      rows: supplierRows.map((s) => [s.name, s.count, s.amount.toFixed(2), s.dueDate, s.oldest]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحسابات الدائنة وتقادمها (AP Aging)"
        subtitle={`${COMPANY} — ${periodLabel}`}
        icon={<CreditCard className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`AP_Aging_${periodValue}`} sheets={excelSheets} />
            <Field label="شهر الفاتورة">
              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={inputCls + ' !w-44'}>
                {months.map((p) => (
                  <option key={p} value={p}>{monthLabel(p)}</option>
                ))}
              </select>
            </Field>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — أساس السداد: تاريخ فاتورة المورد + شروط السداد (أيام)
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">إجمالي الدائن (شامل الضريبة)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(totalAp)}</strong>
          <span className="text-[10px] text-blue-500 block">{lines.length} سنداً من {supplierCount} مورد</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">غير مستحق بعد</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmtMoney(notDue)}</strong>
          <span className="text-[10px] text-emerald-500 block">ضمن الأجل</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">قيمة مستحقة الآن</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{fmtMoney(dueNow)}</strong>
          <span className="text-[10px] text-amber-500 block">بعد استحقاق سنداتها</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">متأخر +90 يوماً</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{fmtMoney(overdue90)}</strong>
          <span className="text-[10px] text-rose-500 block">أولوية المتابعة</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" /> الشرائح العمرية للمستحقات
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} height={40} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [fmtMoney(Number(v)), 'المبلغ']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="المبلغ" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {chartData.map((c, i) => (
                  <Cell key={c.name} fill={i === 0 ? '#10b981' : i === 4 ? '#f43f5e' : '#818cf8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3">الشرائح</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">الشريحة</th>
                  <th className="p-2 text-center">السندات</th>
                  <th className="p-2 text-center">المبلغ</th>
                  <th className="p-2 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bucketRows.map((b, i) => (
                  <tr key={b.bucket} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{b.bucket}</td>
                    <td className="p-2 text-center font-mono">{b.count}</td>
                    <td className={`p-2 text-center font-mono ${i === 0 ? 'text-emerald-700' : i === 4 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>{fmtMoney(b.amount)}</td>
                    <td className="p-2 text-center font-mono">{totalAp > 0 ? ((b.amount / totalAp) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center font-mono">{lines.length}</td>
                  <td className="p-2 text-center font-mono text-lg">{fmtMoney(totalAp)}</td>
                  <td className="p-2 text-center font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3">حسب المورد</h3>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">المورد</th>
                  <th className="p-2 text-center">السندات</th>
                  <th className="p-2 text-center">المبلغ</th>
                  <th className="p-2 text-center">أقدم استحقاق</th>
                  <th className="p-2 text-center">أقصى تأخير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierRows.map((s, i) => (
                  <tr key={s.name} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{s.name}</td>
                    <td className="p-2 text-center font-mono">{s.count}</td>
                    <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(s.amount)}</td>
                    <td className="p-2 text-center font-mono text-slate-500 text-[10px]">{s.dueDate}</td>
                    <td className={`p-2 text-center font-mono ${s.oldest > 60 ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>{s.oldest} يوم</td>
                  </tr>
                ))}
                {!supplierRows.length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">لا توجد سندات لهذه الفترة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">تفاصيل السندات المدينة</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">السند</th>
                <th className="p-2 text-center">المورد</th>
                <th className="p-2 text-center">الفرع</th>
                <th className="p-2 text-center">تاريخ الفاتورة</th>
                <th className="p-2 text-center">الاستحقاق</th>
                <th className="p-2 text-center">المبلغ</th>
                <th className="p-2 text-center">متأخر</th>
                <th className="p-2 text-center">الشريحة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <tr key={l.grn} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-mono text-blue-600 text-[10px]">{l.grnNumber}</td>
                  <td className="p-2 text-center font-bold text-slate-800">{l.supplierName}</td>
                  <td className="p-2 text-center">{l.branchName}</td>
                  <td className="p-2 text-center font-mono text-slate-500 text-[10px]">{l.invoiceDate}</td>
                  <td className="p-2 text-center font-mono text-slate-500 text-[10px]">{l.dueDate}</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(l.amount)}</td>
                  <td className={`p-2 text-center font-mono ${l.overdueDays > 60 ? 'text-rose-600 font-bold' : l.overdueDays > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{l.overdueDays} يوم</td>
                  <td className="p-2 text-center text-slate-600">{l.bucket}</td>
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد سندات معتمدة لهذه الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ApAgingReport;