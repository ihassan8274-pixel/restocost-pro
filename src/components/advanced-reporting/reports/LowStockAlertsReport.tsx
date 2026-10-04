import React, { useMemo, useState } from 'react';
import { Printer, BellRing } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// تنبيهات انخفاض المخزون (Low Stock Alerts)
// الهوية (مستمدّة من شاشة (alerts) في v7.0):
//   مواد تحت حد الأمان (minStockLevel) أو قريبة منه (ضمن هامش 10%) أو بلا حد
//   — كشف فرع×مادة مع النقص الكمي والقيمي — يغذي اقتراح الطلب
// فلاتر: شهر + فرع + حالة
// ═══════════════════════════════════════════════════════════════════════════

interface AlertRow {
  materialId: string;
  name: string;
  unit: string;
  branchId: string;
  branchName: string;
  qty: number;
  min: number | null;
  status: 'under' | 'near' | 'ok' | 'nolevel';
  shortage: number;
  valueShort: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const NEAR_FACTOR = 1.1;

export const LowStockAlertsReport: React.FC = () => {
  const { inventory, rawMaterials, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventory.map((r) => (r.lastUpdated || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [inventory]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const rows = useMemo<AlertRow[]>(() => {
    const out: AlertRow[] = [];
    for (const r of inventory) {
      if (periodValue && (r.lastUpdated || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
      const m = rawMaterials.find((x) => x.id === r.rawMaterialId);
      if (!m) continue;
      const hasMin = typeof m.minStockLevel === 'number' && m.minStockLevel > 0;
      let status: AlertRow['status'];
      let shortage = 0;
      if (!hasMin) {
        status = 'nolevel';
      } else if (r.quantity < m.minStockLevel) {
        status = 'under';
        shortage = m.minStockLevel - r.quantity;
      } else if (r.quantity < m.minStockLevel * NEAR_FACTOR) {
        status = 'near';
      } else {
        status = 'ok';
      }
      out.push({
        materialId: r.rawMaterialId,
        name: m.nameAr,
        unit: m.purchaseUnit || m.unit,
        branchId: r.branchId,
        branchName: getBranchName(r.branchId),
        qty: r.quantity,
        min: hasMin ? m.minStockLevel : null,
        status,
        shortage,
        valueShort: 0,
      });
    }
    return statusFilter === 'all'
      ? out
      : out.filter((r) => (statusFilter === 'alerts' ? r.status === 'under' || r.status === 'near' : r.status === statusFilter));
  }, [inventory, periodValue, branchFilter, statusFilter, rawMaterials, getBranchName]);

  const under = rows.filter((r) => r.status === 'under');
  const near = rows.filter((r) => r.status === 'near');
  const ok = rows.filter((r) => r.status === 'ok');
  const nolevel = rows.filter((r) => r.status === 'nolevel');
  const totalShortPeers = under.length + near.length;

  const cost = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m.purchaseUnitPrice || m.standardPrice || 0])), [rawMaterials]);
  for (const r of under) r.valueShort = r.shortage * (cost.get(r.materialId) ?? 0);
  const totalShortValue = under.reduce((s, r) => s + r.valueShort, 0);

  const chartData = [
    { name: 'تحت الحد', count: under.length },
    { name: 'قريب من الحد', count: near.length },
    { name: 'آمن', count: ok.length },
    { name: 'بلا حد أدنى', count: nolevel.length },
  ];
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'تنبيهات انخفاض المخزون (Low Stock Alerts)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['تحت الحد الأدنى', `${under.length}`],
        ['قريبة من الحد', `${near.length}`],
        ['قيمة النقص', fmtMoney(totalShortValue)],
      ],
      tables: [
        {
          title: 'التنبيهات',
          header: ['المادة', 'الفرع', 'الرصيد', 'حد الأمان', 'النقص', 'قيمة النقص', 'الحالة'],
          rows: rows.map((r) => [r.name, r.branchName, fmt(r.qty), r.min != null ? fmt(r.min) : '—', r.shortage > 0 ? fmt(r.shortage) : '—', r.shortage > 0 ? fmtMoney(r.valueShort) : '—', r.status === 'under' ? 'تحت الحد' : r.status === 'near' ? 'قريب' : r.status === 'ok' ? 'آمن' : 'بلا حد']),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'التنبيهات',
      header: ['المادة', 'الفرع', 'الوحدة', 'الرصيد', 'حد الأمان', 'النقص', 'قيمة النقص', 'الحالة'],
      rows: rows.map((r) => [r.name, r.branchName, r.unit, r.qty, r.min ?? '', r.shortage, Number(r.valueShort.toFixed(2)), r.status]),
    },
  ];
  const sortRows = rows.slice().sort((a, b) => (a.status === 'under' ? -1 : b.status === 'under' ? 1 : 0) || b.shortage - a.shortage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تنبيهات انخفاض المخزون (Low Stock Alerts)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<BellRing className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Low_Stock_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
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
                  <option value="alerts">التنبيهات فقط</option>
                  <option value="under">تحت الحد</option>
                  <option value="near">قريب من الحد</option>
                  <option value="ok">آمن</option>
                  <option value="nolevel">بلا حد أدنى</option>
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {totalShortPeers} تنبيهاً
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">تحت الحد الأدنى</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{under.length}</strong>
          <span className="text-[10px] text-rose-500 block">بحد أمان موثوق</span>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <span className="text-[10px] text-orange-600 font-bold block">قريبة من الحد</span>
          <strong className="text-lg font-extrabold text-orange-800 font-mono block">{near.length}</strong>
          <span className="text-[10px] text-orange-500 block">ضمن {Math.round((NEAR_FACTOR - 1) * 100)}% من الحد</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">بلا حد أدنى معرّف</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{nolevel.length}</strong>
          <span className="text-[10px] text-emerald-500 block">تعريف الأمان مرقّع بعد</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">قيمة النقص الإجمالية</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{fmtMoney(totalShortValue)}</strong>
          <span className="text-[10px] text-blue-500 block">من {under.length} مادة تحت الحد</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <BellRing className="w-5 h-5 text-emerald-600" /> توزيع الحالات
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
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [`${Number(v)} صف`, String(name)]} />
              <Bar dataKey="count" name="الصفوف" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={['#f43f5e', '#f97316', '#10b981', '#94a3b8'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">كشف التنبيهات ({rows.length})</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة</th>
                <th className="p-2 text-center">الفرع</th>
                <th className="p-2 text-center">الرصيد</th>
                <th className="p-2 text-center">حد الأمان</th>
                <th className="p-2 text-center">النقص</th>
                <th className="p-2 text-center">قيمة النقص</th>
                <th className="p-2 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortRows.map((r, i) => (
                <tr key={r.materialId + r.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="p-2 text-center">{r.branchName}</td>
                  <td className="tnum p-2 text-left font-bold text-blue-700">{fmt(r.qty)} {r.unit}</td>
                  <td className="tnum p-2 text-left text-slate-500">{r.min != null ? fmt(r.min) : '—'}</td>
                  <td className="tnum p-2 text-left text-rose-600">{r.shortage > 0 ? fmt(r.shortage) : '—'}</td>
                  <td className="tnum p-2 text-left text-slate-600">{r.shortage > 0 ? fmtMoney(r.valueShort) : '—'}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'under' ? 'bg-rose-100 text-rose-700' : r.status === 'near' ? 'bg-orange-100 text-orange-700' : r.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.status === 'under' ? 'تحت الحد' : r.status === 'near' ? 'قريب' : r.status === 'ok' ? 'آمن' : 'بلا حد'}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-400">لا توجد تنبيهات لهذا الفلتر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default LowStockAlertsReport;