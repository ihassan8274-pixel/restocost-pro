import React, { useMemo, useState } from 'react';
import { Printer, ClipboardList } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// سجل سندات الاستلام (GRN Register)
// الهوية (مستمدّة من شاشة (GRN) في v7.0):
//   كل سند استلام: رقم السند، المورد، الفرع، التاريخ/تاريخ الفاتورة، القيمة،
//   الضريبة، الشمول، الحالة، عدد الأصناف — مع إجماليات الوضع
// فلاتر: شهر + فرع + حالة + مورد
// ═══════════════════════════════════════════════════════════════════════════

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const STATUS_LABEL: Record<string, { ar: string; cls: string }> = {
  draft: { ar: 'مسودة', cls: 'bg-slate-100 text-slate-600' },
  submitted: { ar: 'مُقدّم', cls: 'bg-blue-100 text-blue-700' },
  approved: { ar: 'معتمد', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { ar: 'مرفوض', cls: 'bg-rose-100 text-rose-700' },
};

export const GrnRegisterReport: React.FC = () => {
  const { grnNotes, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(grnNotes.map((g) => (g.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [grnNotes]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const suppliers = useMemo(() => Array.from(new Set(grnNotes.map((g) => g.supplierName || g.supplierId))), [grnNotes]);

  const rows = useMemo(
    () =>
      grnNotes
        .filter((g) => {
          if (periodValue && (g.date || '').slice(0, 7) !== periodValue) return false;
          if (branchFilter !== 'all' && g.branchId !== branchFilter) return false;
          if (statusFilter !== 'all' && g.status !== statusFilter) return false;
          if (supplierFilter !== 'all' && g.supplierName !== supplierFilter) return false;
          return true;
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [grnNotes, periodValue, branchFilter, statusFilter, supplierFilter]
  );

  const totalValue = rows.reduce((s, g) => s + (g.totalAmount || 0) + (g.vatAmount || 0), 0);
  const totalVat = rows.reduce((s, g) => s + (g.vatAmount || 0), 0);
  const totalAmount = totalValue - totalVat;
  const approvedCount = rows.filter((g) => g.status === 'approved').length;
  const draftCount = rows.filter((g) => g.status === 'draft' || g.status === 'submitted').length;
  const rejectedCount = rows.filter((g) => g.status === 'rejected').length;
  const avgDoc = rows.length ? totalValue / rows.length : 0;

  const chartData = ['draft', 'submitted', 'approved', 'rejected'].map((s) => {
    const arr = rows.filter((g) => g.status === s);
    return { name: STATUS_LABEL[s].ar, السندات: arr.length, القيمة: Number((arr.reduce((x, g) => x + (g.totalAmount || 0) + (g.vatAmount || 0), 0)).toFixed(0)) };
  });
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'سجل سندات الاستلام (GRN Register)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['السندات', `${rows.length}`],
        ['إجمالي القيمة (شامل الضريبة)', fmtMoney(totalValue)],
      ],
      tables: [
        {
          title: 'السندات',
          header: ['السند', 'المورد', 'الفرع', 'التاريخ', 'الفاتورة', 'القيمة', 'الضريبة', 'شامل؟', 'الأصناف', 'الحالة'],
          rows: rows.map((g) => [g.grnNumber, g.supplierName, getBranchName(g.branchId), g.date, g.invoiceNumber || '—', fmtMoney(g.totalAmount || 0), fmtMoney(g.vatAmount || 0), g.vatInclusive ? 'نعم' : 'لا', (g.items || []).length, STATUS_LABEL[g.status]?.ar ?? g.status]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'السجلات',
      header: ['السند', 'المورد', 'الفرع', 'التاريخ', 'رقم الفاتورة', 'تاريخ الفاتورة', 'القيمة', 'الضريبة', 'القيمة شاملة', 'شامل؟', 'الأصناف', 'الحالة'],
      rows: rows.map((g) => [
        g.grnNumber, g.supplierName, getBranchName(g.branchId), g.date, g.invoiceNumber || '', g.invoiceDate || '',
        g.totalAmount || 0, g.vatAmount || 0, (g.totalAmount || 0) + (g.vatAmount || 0), g.vatInclusive ? 'نعم' : 'لا',
        (g.items || []).length, g.status,
      ]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل سندات الاستلام (GRN Register)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<ClipboardList className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`GRN_Register_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2 flex-wrap">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-40'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameAr}</option>
                  ))}
                </select>
              </Field>
              <Field label="الحالة">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + ' !w-40'}>
                  <option value="all">الكل</option>
                  <option value="approved">معتمد</option>
                  <option value="submitted">مُقدّم</option>
                  <option value="draft">مسودة</option>
                  <option value="rejected">مرفوض</option>
                </select>
              </Field>
              <Field label="المورد">
                <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الموردين</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {rows.length} سنداً
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">إجمالي القيمة (شامل الضريبة)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(totalValue)}</strong>
          <span className="text-[10px] text-blue-500 block">متوسط السند {fmtMoney(avgDoc)}</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <span className="text-[10px] text-green-600 font-bold block">القيمة قبل الضريبة</span>
          <strong className="text-lg font-extrabold text-green-800 font-mono block">{fmtMoney(totalAmount)}</strong>
          <span className="text-[10px] text-green-500 block">ضريبة {fmtMoney(totalVat)}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">معتمدة</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{approvedCount}</strong>
          <span className="text-[10px] text-emerald-500 block">من {rows.length} سنداً</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">غير مكتملة (مسودة/مُقدّم)</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{draftCount}</strong>
          <span className="text-[10px] text-amber-500 block">مرفوض {rejectedCount}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600" /> السندات والقيمة بحسب الحالة
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} />
              <YAxis yAxisId="c" allowDecimals={false} fontSize={10} />
              <YAxis yAxisId="v" orientation="right" fontSize={10} tickFormatter={(x: number) => fmtMoney(x)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [name === 'السندات' ? `${Number(v)}` : fmtMoney(Number(v)), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="c" dataKey="السندات" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={['#94a3b8', '#60a5fa', '#10b981', '#f43f5e'][i]} />
                ))}
              </Bar>
              <Bar yAxisId="c" dataKey="القيمة" radius={[4, 4, 0, 0]} maxBarSize={44} fill="transparent" hide />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول السندات</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">السند</th>
                <th className="p-2 text-center">المورد</th>
                <th className="p-2 text-center">الفرع</th>
                <th className="p-2 text-center">التاريخ</th>
                <th className="p-2 text-center">الفاتورة</th>
                <th className="p-2 text-center">القيمة</th>
                <th className="p-2 text-center">الضريبة</th>
                <th className="p-2 text-center">شامل؟</th>
                <th className="p-2 text-center">الأصناف</th>
                <th className="p-2 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((g, i) => (
                <tr key={g.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-mono text-blue-600 font-bold text-[10px]">{g.grnNumber}</td>
                  <td className="p-2 text-center">{g.supplierName}</td>
                  <td className="p-2 text-center">{getBranchName(g.branchId)}</td>
                  <td className="p-2 text-center font-mono text-slate-500 text-[10px]">{g.date}</td>
                  <td className="p-2 text-center font-mono text-slate-500 text-[10px]">{g.invoiceNumber || '—'}</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(g.totalAmount || 0)}</td>
                  <td className="p-2 text-center font-mono text-slate-500">{fmtMoney(g.vatAmount || 0)}</td>
                  <td className="p-2 text-center">{g.vatInclusive ? 'نعم' : 'لا'}</td>
                  <td className="p-2 text-center font-mono">{fmt((g.items || []).length)}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_LABEL[g.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{STATUS_LABEL[g.status]?.ar ?? g.status}</span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-slate-400">لا توجد سندات لهذا الفلتر</td>
                </tr>
              )}
              {!!rows.length && (
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(totalAmount)}</td>
                  <td className="p-2 text-center font-mono">{fmtMoney(totalVat)}</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center font-mono">{rows.length}</td>
                  <td className="p-2 text-center">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default GrnRegisterReport;