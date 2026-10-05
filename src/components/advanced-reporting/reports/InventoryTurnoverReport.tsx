import React, { useMemo, useState } from 'react';
import { Printer, RefreshCcw } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// دوران المخزون (Inventory Turnover)
// الهوية (مستمدّة من شاشة (turnover) في v7.0):
//   لكل مادة: الاستهلاك (صادر الفترة) مقابل الرصيد، مرات الدوران = استهلاك ÷
//   متوسط الرصيد، أيام التغطية = الرصيد ÷ الاستهلاك اليومي؛ ومستوى الشركة بالقيمة
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface TurnRow {
  materialId: string;
  name: string;
  category: string;
  unit: string;
  inQty: number;
  outQty: number;
  net: number;
  ending: number;
  avg: number;
  turnover: number | null;
  daysCover: number;
  valueOut: number;
  valueEnd: number;
  branchId: string;
  branchName: string;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const DAYS_IN_PERIOD = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const InventoryTurnoverReport: React.FC = () => {
  const { inventoryMovements, inventory, rawMaterials, grnNotes, branches, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventoryMovements.map((m) => (m.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [inventoryMovements]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const periodLabel = monthLabel(periodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const periodDays = DAYS_IN_PERIOD(periodValue);

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);
  const catName = (key: string) => materialCategories.find((c) => c.key === key)?.labelAr ?? key;

  const cost = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) if (g.status === 'approved') for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    for (const m of rawMaterials) if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    return map;
  }, [grnNotes, rawMaterials]);

  const rows = useMemo<TurnRow[]>(() => {
    const mov = inventoryMovements.filter((m) => {
      if ((m.date || '').slice(0, 7) !== periodValue) return false;
      if (branchFilter !== 'all' && m.branchId !== branchFilter) return false;
      return true;
    });
    const agg = new Map<string, { in: number; out: number; branchId: string }>();
    for (const m of mov) {
      const cur = agg.get(m.rawMaterialId) ?? { in: 0, out: 0, branchId: m.branchId };
      if (m.delta >= 0) cur.in += m.delta;
      else cur.out += -m.delta;
      agg.set(m.rawMaterialId, cur);
    }
    const out: TurnRow[] = [];
    for (const [id, a] of agg) {
      const mat = matById.get(id);
      if (!mat) continue;
      let ending = 0;
      for (const r of inventory) {
        if (r.rawMaterialId !== id) continue;
        if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
        if ((r.lastUpdated || '').slice(0, 7) !== periodValue) continue;
        ending += r.quantity;
      }
      if (a.out <= 0 && ending <= 0) continue;
      const avg = Math.max((a.in - a.out) / 2 + ending, 0.0001);
      const turnover = a.out > 0 ? a.out / avg : 0;
      const daysCover = a.out > 0 ? (ending / a.out) * periodDays : 999;
      const c = cost.get(id) ?? 0;
      out.push({
        materialId: id,
        name: mat.nameAr,
        category: catName(mat.category),
        unit: mat.purchaseUnit || mat.unit,
        inQty: a.in,
        outQty: a.out,
        net: a.in - a.out,
        ending,
        avg,
        turnover,
        daysCover,
        valueOut: a.out * c,
        valueEnd: ending * c,
        branchId: a.branchId,
        branchName: getBranchName(a.branchId),
      });
    }
    return out.sort((a, b) => a.daysCover - b.daysCover || b.valueOut - a.valueOut);
  }, [inventoryMovements, inventory, periodValue, branchFilter, matById, cost, getBranchName, catName]);

  const totalOutQty = rows.reduce((s, r) => s + r.outQty, 0);
  const totalEndQty = rows.reduce((s, r) => s + r.ending, 0);
  const totalValueOut = rows.reduce((s, r) => s + r.valueOut, 0);
  const totalValueEnd = rows.reduce((s, r) => s + r.valueEnd, 0);
  const companyTurnover = totalValueEnd > 0 ? totalValueOut / totalValueEnd : 0;
  const companyDays = companyTurnover > 0 ? periodDays / companyTurnover : 999;
  const slowMovers = rows.filter((r) => r.daysCover > 60).length;

  const chartData = rows.slice(0, 10).map((r) => ({ name: r.name.slice(0, 12), أيام: Number(Math.min(r.daysCover, 180).toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'دوران المخزون (Inventory Turnover)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['دوران الشركة', `${companyTurnover.toFixed(2)} مرة (${companyDays.toFixed(0)} يوم تغطية)`],
        ['مواد تغطية >60 يوم', `${slowMovers}`],
      ],
      tables: [
        {
          title: 'المواد',
          header: ['المادة', 'التصنيف', 'استهلاك', 'رصيد ختامي', 'دوران (مرة)', 'تغطية (أيام)', 'قيمة استهلاك', 'قيمة رصيد'],
          rows: rows.map((r) => [r.name, r.category, fmt(r.outQty), fmt(r.ending), r.turnover != null ? r.turnover.toFixed(2) : '—', r.daysCover >= 999 ? '∞' : r.daysCover.toFixed(0), fmtMoney(r.valueOut), fmtMoney(r.valueEnd)]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الدوران',
      header: ['المادة', 'التصنيف', 'الوحدة', 'وارد', 'صادر', 'رصيد ختامي', 'دوران (مرة)', 'تغطية (أيام)', 'قيمة استهلاك', 'قيمة رصيد'],
      rows: rows.map((r) => [r.name, r.category, r.unit, r.inQty, r.outQty, r.ending, r.turnover != null ? r.turnover.toFixed(2) : '-', r.daysCover >= 999 ? '-' : r.daysCover.toFixed(0), r.valueOut.toFixed(2), r.valueEnd.toFixed(2)]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="دوران المخزون (Inventory Turnover)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<RefreshCcw className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Inventory_Turnover_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
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
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} ({periodDays} يوماً) — {branchLabel}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">دوران الشركة (بالقيمة)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{companyTurnover.toFixed(2)}×</strong>
          <span className="text-[10px] text-blue-500 block">{companyDays.toFixed(0)} يوم تغطية</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">الاستهلاك (صادر)</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmt(totalOutQty)}</strong>
          <span className="text-[10px] text-emerald-500 block">بقيمة {fmtMoney(totalValueOut)}</span>
        </div>
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <span className="text-[10px] text-brand-600 font-bold block">الرصيد الختامي</span>
          <strong className="text-lg font-extrabold text-brand-800 font-mono block">{fmt(totalEndQty)}</strong>
          <span className="text-[10px] text-brand-500 block">بقيمة {fmtMoney(totalValueEnd)}</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">مواد بطيئة (أكبر من 60 يوم)</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{slowMovers}</strong>
          <span className="text-[10px] text-rose-500 block">من {rows.length} مادة نشطة</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <RefreshCcw className="w-5 h-5 text-emerald-600" /> أيام التغطية (أعلى 10 مواد بطيئة)
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${v} يوم`} />
              <YAxis type="category" dataKey="name" width={130} fontSize={10} tick={{ fill: '#475569' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${Number(v)} يوم`, 'التغطية']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="أيام" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((c, i) => (
                  <Cell key={i} fill={c.أيام > 60 ? '#f43f5e' : c.أيام > 30 ? '#f59e0b' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">جدول دوران المواد</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">استهلاك</th>
                <th className="p-2 text-center">رصيد ختامي</th>
                <th className="p-2 text-center">دوران (مرة)</th>
                <th className="p-2 text-center">تغطية (أيام)</th>
                <th className="p-2 text-center">قيمة استهلاك</th>
                <th className="p-2 text-center">قيمة رصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.materialId + r.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="p-2 text-center text-slate-500">{r.category}</td>
                  <td className="tnum p-2 text-left">{fmt(r.outQty)} {r.unit}</td>
                  <td className="tnum p-2 text-left">{fmt(r.ending)} {r.unit}</td>
                  <td className="tnum p-2 text-left text-brand-700">{r.turnover != null ? r.turnover.toFixed(2) : '—'}</td>
                  <td className={`p-2 text-center font-mono font-bold ${r.daysCover >= 999 ? 'text-rose-600' : r.daysCover > 60 ? 'text-rose-600' : r.daysCover > 30 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.daysCover >= 999 ? '∞' : `${r.daysCover.toFixed(0)}`}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.valueOut)}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(r.valueEnd)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد مواد بحركة/رصيد في هذه الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default InventoryTurnoverReport;