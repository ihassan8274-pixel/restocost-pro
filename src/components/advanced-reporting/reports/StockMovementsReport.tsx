import React, { useMemo, useState } from 'react';
import { Printer, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// حركات المخزون التفصيلية (Stock Movements)
// الهوية (مستمدّة من شاشة (movements) في v7.0):
//   وارد / صادر / صافي لنظام الحركات الكامل، تجميع بحسب نوع الحركة والسند،
//   مع توزيع الفترة والفرع والمادة (صف لكل حركة) وخلاصة الأنواع
// فلاتر: شهر + فرع + مادة + نوع حركة
// ═══════════════════════════════════════════════════════════════════════════

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const StockMovementsReport: React.FC = () => {
  const { inventoryMovements, rawMaterials, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventoryMovements.map((m) => (m.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [inventoryMovements]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);

  const movementTypes = useMemo(
    () => Array.from(new Set(inventoryMovements.map((m) => m.type))).sort((a, b) => a.localeCompare(b, 'ar')),
    [inventoryMovements]
  );

  const matName = (id: string) => rawMaterials.find((m) => m.id === id)?.nameAr ?? id;

  const filtered = useMemo(
    () =>
      inventoryMovements.filter((m) => {
        if ((m.date || '').slice(0, 7) !== periodValue) return false;
        if (branchFilter !== 'all' && m.branchId !== branchFilter) return false;
        if (materialFilter !== 'all' && m.rawMaterialId !== materialFilter) return false;
        if (typeFilter !== 'all' && m.type !== typeFilter) return false;
        return true;
      }),
    [inventoryMovements, periodValue, branchFilter, materialFilter, typeFilter]
  );

  const inQty = filtered.reduce((s, m) => s + Math.max(m.delta, 0), 0);
  const outQty = filtered.reduce((s, m) => s + Math.max(-m.delta, 0), 0);
  const netQty = inQty - outQty;
  const materialsTouched = new Set(filtered.map((m) => m.rawMaterialId)).size;

  const byType = useMemo(() => {
    const map = new Map<string, { in: number; out: number; count: number }>();
    for (const m of filtered) {
      const cur = map.get(m.type) ?? { in: 0, out: 0, count: 0 };
      if (m.delta >= 0) cur.in += m.delta;
      else cur.out += -m.delta;
      cur.count += 1;
      map.set(m.type, cur);
    }
    return Array.from(map.entries())
      .map(([type, v]) => ({ type, ...v, net: v.in - v.out }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const chartData = byType.map((t) => ({ name: t.type, وارد: Number(t.in.toFixed(1)), صادر: Number(t.out.toFixed(1)) }));

  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const printReport = () => {
    openPrintWindow({
      title: 'حركات المخزون التفصيلية (Stock Movements)',
      subtitle: `${COMPANY} — ${monthLabel(periodValue)} — ${branchLabel}`,
      meta: [
        ['الفترة', monthLabel(periodValue)],
        ['الفرع', branchLabel],
        ['إجمالي الحركات', `${filtered.length}`],
        ['وارد', fmt(inQty)],
        ['صادر', fmt(outQty)],
        ['صافي', fmt(netQty)],
      ],
      tables: [
        {
          title: `تفاصيل الحركات (${filtered.length})`,
          header: ['التاريخ', 'النوع', 'الفرع', 'المادة', 'السند', 'الدلتا'],
          rows: filtered.slice(0, 1000).map((m) => [m.date, m.type, getBranchName(m.branchId), matName(m.rawMaterialId), m.ref || '', m.delta]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${monthLabel(periodValue)}`,
    });
  };

  const excelSheets = [
    {
      name: 'ملخص الأنواع',
      header: ['نوع الحركة', 'وارد', 'صادر', 'صافي', 'عدد'],
      rows: byType.map((t) => [t.type, t.in, t.out, t.net, t.count]),
    },
    {
      name: 'تفاصيل',
      header: ['التاريخ', 'النوع', 'الفرع', 'المادة', 'السند', 'الدلتا'],
      rows: filtered.map((m) => [m.date, m.type, getBranchName(m.branchId), matName(m.rawMaterialId), m.ref || '', m.delta]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="حركات المخزون التفصيلية (Stock Movements)"
        subtitle={`${COMPANY} — ${monthLabel(periodValue)} — ${branchLabel}`}
        icon={<ArrowUpDown className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Stock_Movements_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2 flex-wrap">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
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
              <Field label="المادة">
                <select value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} className={inputCls + ' !w-48'}>
                  <option value="all">جميع المواد</option>
                  {rawMaterials.slice().sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar')).map((m) => (
                    <option key={m.id} value={m.id}>{m.nameAr}</option>
                  ))}
                </select>
              </Field>
              <Field label="نوع الحركة">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls + ' !w-48'}>
                  <option value="all">جميع الأنواع</option>
                  {movementTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {monthLabel(periodValue)} — {branchLabel} — {filtered.length} حركة
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">إجمالي الحركات</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmt(filtered.length)}</strong>
          <span className="text-[10px] text-emerald-500 block">{materialsTouched} مادة متحركة</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <span className="text-[10px] text-green-600 font-bold block">وارد (كمية)</span>
          <strong className="text-lg font-extrabold text-green-800 font-mono block">{fmt(inQty)}</strong>
          <span className="text-[10px] text-green-500 block">استلام ومشتريات وتحويلات</span>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <span className="text-[10px] text-red-600 font-bold block">صادر (كمية)</span>
          <strong className="text-lg font-extrabold text-red-800 font-mono block">{fmt(outQty)}</strong>
          <span className="text-[10px] text-red-500 block">بيع وتحويل وتعديل</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">صافي الحركة</span>
          <strong className={`text-lg font-extrabold font-mono block ${netQty >= 0 ? 'text-blue-800' : 'text-rose-700'}`}>{fmt(netQty)}</strong>
          <span className="text-[10px] text-blue-500 block">وارد − صادر</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5 text-emerald-600" /> وارد وصادر بأنواع الحركة
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [fmt(Number(v)), String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="وارد" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} />
              <Bar dataKey="صادر" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">الخلاصة بحسب نوع الحركة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">نوع الحركة</th>
                <th className="p-2 text-center">وارد</th>
                <th className="p-2 text-center">صادر</th>
                <th className="p-2 text-center">صافي</th>
                <th className="p-2 text-center">عدد الحركات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byType.map((t, i) => (
                <tr key={t.type} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{t.type}</td>
                  <td className="tnum p-2 text-left text-emerald-700">{fmt(t.in)}</td>
                  <td className="tnum p-2 text-left text-rose-600">{fmt(t.out)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${t.net >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{fmt(t.net)}</td>
                  <td className="tnum p-2 text-left">{t.count}</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي</td>
                <td className="tnum p-2 text-left text-emerald-700">{fmt(inQty)}</td>
                <td className="tnum p-2 text-left text-rose-600">{fmt(outQty)}</td>
                <td className={`p-2 text-center font-mono text-lg ${netQty >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{fmt(netQty)}</td>
                <td className="tnum p-2 text-left">{filtered.length}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="font-bold text-slate-700 text-md mt-6 mb-3">أحدث الحركات التفصيلية ({filtered.length})</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">النوع</th>
                <th className="p-2 text-center">الفرع</th>
                <th className="p-2 text-center">المادة</th>
                <th className="p-2 text-center">السند</th>
                <th className="p-2 text-center">الدلتا</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 500).map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="tnum text-left p-2 text-slate-500 text-[10px]">{m.date}</td>
                  <td className="p-2 text-center text-slate-700">{m.type}</td>
                  <td className="p-2 text-center">{getBranchName(m.branchId)}</td>
                  <td className="p-2 text-center font-bold text-slate-800">{matName(m.rawMaterialId)}</td>
                  <td className="tnum p-2 text-left text-blue-600 text-[10px]">{m.ref || '—'}</td>
                  <td className={`p-2 text-center font-mono font-bold ${m.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{m.delta > 0 ? '+' : ''}{fmt(m.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default StockMovementsReport;