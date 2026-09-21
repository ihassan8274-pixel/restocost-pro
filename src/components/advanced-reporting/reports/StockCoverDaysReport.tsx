import React, { useMemo, useState } from 'react';
import { Printer, PackageX } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// أيام التغطية المتاحة (Days of Supply / Stock Cover)
// الهوية (مستمدّة من شاشة (cover) في v7.0):
//   التغطية (أيام) = رصيد ختامي ÷ متوسط الاستهلاك اليومي (صادر ÷ أيام الفترة)
//   تصنيف: ≤30 نشط، 30-60 متوسط، >60 بطيء — مع القيمة القياسية لكل حالة
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface CoverRow {
  materialId: string;
  name: string;
  category: string;
  unit: string;
  ending: number;
  outQty: number;
  avgDaily: number;
  coverDays: number;
  bucket: 'active' | 'medium' | 'slow';
  value: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const DAYS_IN_PERIOD = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return (new Date(y, m, 0).getDate());
};

export const StockCoverDaysReport: React.FC = () => {
  const { inventory, inventoryMovements, rawMaterials, grnNotes, branches, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventoryMovements.map((m) => (m.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [inventoryMovements]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const periodDays = periodValue ? DAYS_IN_PERIOD(periodValue) : 30;

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);
  const catName = (key: string) => materialCategories.find((c) => c.key === key)?.labelAr ?? key;

  const cost = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) if (g.status === 'approved') for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    for (const m of rawMaterials) if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    return map;
  }, [grnNotes, rawMaterials]);

  const rows = useMemo<CoverRow[]>(() => {
    const mov = inventoryMovements.filter((m) => {
      if ((m.date || '').slice(0, 7) !== periodValue) return false;
      if (branchFilter !== 'all' && m.branchId !== branchFilter) return false;
      return true;
    });
    const outBy = new Map<string, number>();
    for (const m of mov) if (m.delta < 0) outBy.set(m.rawMaterialId, (outBy.get(m.rawMaterialId) || 0) - m.delta);

    const out: CoverRow[] = [];
    for (const [id, outQty] of outBy) {
      const mat = matById.get(id);
      if (!mat) continue;
      let ending = 0;
      for (const r of inventory) {
        if (r.rawMaterialId !== id) continue;
        if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
        if ((r.lastUpdated || '').slice(0, 7) !== periodValue) continue;
        ending += r.quantity;
      }
      const avgDaily = outQty / periodDays;
      const coverDays = avgDaily > 0 ? ending / avgDaily : 999;
      const bucket: CoverRow['bucket'] = coverDays <= 30 ? 'active' : coverDays <= 60 ? 'medium' : 'slow';
      out.push({
        materialId: id,
        name: mat.nameAr,
        category: catName(mat.category),
        unit: mat.purchaseUnit || mat.unit,
        ending,
        outQty,
        avgDaily,
        coverDays,
        bucket,
        value: ending * (cost.get(id) ?? 0),
      });
    }
    return out.sort((a, b) => b.coverDays - a.coverDays || b.value - a.value);
  }, [inventoryMovements, inventory, periodValue, branchFilter, matById, cost, getBranchName, catName]);

  const active = rows.filter((r) => r.bucket === 'active');
  const medium = rows.filter((r) => r.bucket === 'medium');
  const slow = rows.filter((r) => r.bucket === 'slow');
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const slowValue = slow.reduce((s, r) => s + r.value, 0);
  const weightedCover = totalValue > 0 ? rows.reduce((s, r) => s + Math.min(r.coverDays, 365) * r.value, 0) / totalValue : 0;

  const chartData = rows.slice(0, 12).map((r) => ({ name: r.name.slice(0, 12), أيام: Number(Math.min(r.coverDays, 180).toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'أيام التغطية المتاحة (Days of Supply)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['متوسط التغطية (مرجح بالقيمة)', `${weightedCover.toFixed(0)} يوم`],
        ['مواد بطيئة (>60 يوم)', `${slow.length}`],
      ],
      tables: [
        {
          title: 'المواد',
          header: ['المادة', 'التصنيف', 'رصيد ختامي', 'استهلاك (صادر)', 'متوسط يومي', 'أيام تغطية', 'الحالة', 'القيمة'],
          rows: rows.map((r) => [r.name, r.category, fmt(r.ending), fmt(r.outQty), fmt(r.avgDaily, 2), fmt(r.coverDays, 0), r.bucket === 'active' ? 'نشط' : r.bucket === 'medium' ? 'متوسط' : 'بطيء', fmtMoney(r.value)]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الأيام',
      header: ['المادة', 'التصنيف', 'الوحدة', 'رصيد ختامي', 'استهلاك (صادر)', 'متوسط يومي', 'أيام تغطية', 'الحالة', 'القيمة'],
      rows: rows.map((r) => [r.name, r.category, r.unit, r.ending, r.outQty, Number(r.avgDaily.toFixed(2)), Number(r.coverDays.toFixed(0)), r.bucket, r.value.toFixed(2)]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="أيام التغطية المتاحة (Days of Supply)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<PackageX className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Stock_Cover_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {rows.length} مادة لها استهلاك
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">نشط (تغطية ≤ 30 يوم)</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{active.length}</strong>
          <span className="text-[10px] text-emerald-500 block">قيمة {fmtMoney(active.reduce((s, r) => s + r.value, 0))}</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">متوسط (30-60 يوم)</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{medium.length}</strong>
          <span className="text-[10px] text-amber-500 block">تحتاج مراقبة</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">بطيء (تغطية أكبر من 60 يوم)</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{slow.length}</strong>
          <span className="text-[10px] text-rose-500 block">قيمة {fmtMoney(slowValue)}</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[10px] text-slate-600 font-bold block">متوسط التغطية مرجح</span>
          <strong className="text-lg font-extrabold text-slate-800 font-mono block">{weightedCover.toFixed(0)} يوم</strong>
          <span className="text-[10px] text-slate-500 block">إجمالي القيمة {fmtMoney(totalValue)}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <PackageX className="w-5 h-5 text-emerald-600" /> أيام التغطية (أعلى 12 مادة بطيئة)
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
              <Bar dataKey="أيام" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((c, i) => (
                  <Cell key={i} fill={c['أيام'] > 60 ? '#f43f5e' : c['أيام'] > 30 ? '#f59e0b' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">تفاصيل المواد</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">رصيد ختامي</th>
                <th className="p-2 text-center">استهلاك (صادر)</th>
                <th className="p-2 text-center">متوسط يومي</th>
                <th className="p-2 text-center">أيام تغطية</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-center">القيمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.materialId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="p-2 text-center text-slate-500">{r.category}</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmt(r.ending)}</td>
                  <td className="p-2 text-center font-mono">{fmt(r.outQty)}</td>
                  <td className="p-2 text-center font-mono text-slate-500">{fmt(r.avgDaily, 2)}</td>
                  <td className="p-2 text-center font-mono font-bold">{r.coverDays >= 999 ? '∞' : fmt(r.coverDays, 0)}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.bucket === 'active' ? 'bg-emerald-100 text-emerald-700' : r.bucket === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                      {r.bucket === 'active' ? 'نشط' : r.bucket === 'medium' ? 'متوسط' : 'بطيء'}
                    </span>
                  </td>
                  <td className="p-2 text-center font-mono text-slate-600">{fmtMoney(r.value)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد مواد باستهلاك في الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default StockCoverDaysReport;