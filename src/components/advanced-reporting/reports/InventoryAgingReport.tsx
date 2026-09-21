import React, { useMemo, useState } from 'react';
import { Printer, Hourglass } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// أقدمية المخزون (Inventory Aging)
// الهوية (مستمدّة من نظيرتها (aging) في v7.0):
//   عمر المادة = الأيام منذ آخر حركة تغيير (صرف/استلام) حتى نهاية الفترة
//   شرائح: نشط (≤7) متوسط (8-30) هادئ (31-60) قديم (61-90) راكد (>90)
//   — كشف رأس المال الراكد في الجرد — يغذي إعادة توزيع المواد أو التصفية
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface AgingRow {
  materialId: string;
  name: string;
  category: string;
  unit: string;
  lastActivity: string;
  age: number;
  ending: number;
  value: number;
  bucket: 'a' | 'b' | 'c' | 'd' | 'e';
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const BUCKETS: Record<string, { label: string; color: string; from: number; to: number }> = {
  a: { label: 'نشط (≤7 أيام)', color: '#10b981', from: 0, to: 7 },
  b: { label: 'متوسط (8-30)', color: '#22c55e', from: 8, to: 30 },
  c: { label: 'هادئ (31-60)', color: '#f59e0b', from: 31, to: 60 },
  d: { label: 'قديم (61-90)', color: '#f97316', from: 61, to: 90 },
  e: { label: 'راكد (>90)', color: '#f43f5e', from: 91, to: 99999 },
};

function bucketOf(age: number, noActivity: boolean): AgingRow['bucket'] {
  if (noActivity) return 'e';
  if (age <= 7) return 'a';
  if (age <= 30) return 'b';
  if (age <= 60) return 'c';
  if (age <= 90) return 'd';
  return 'e';
}

export const InventoryAgingReport: React.FC = () => {
  const { inventory, inventoryMovements, rawMaterials, grnNotes, branches, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventory.map((r) => (r.lastUpdated || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [inventory]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const periodEnd = periodValue ? new Date(Number(periodValue.slice(0, 4)), Number(periodValue.slice(5)), 0) : new Date();

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);
  const catName = (key: string) => materialCategories.find((c) => c.key === key)?.labelAr ?? key;

  const cost = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) if (g.status === 'approved') for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    for (const m of rawMaterials) if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    return map;
  }, [grnNotes, rawMaterials]);

  const lastActivity = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of inventoryMovements) {
      const cur = map.get(m.rawMaterialId);
      if (!cur || (m.date || '') > cur) map.set(m.rawMaterialId, m.date || '');
    }
    for (const g of grnNotes) {
      if (g.status !== 'approved') continue;
      for (const it of g.items) {
        const cur = map.get(it.rawMaterialId);
        if (!cur || (g.date || '') > cur) map.set(it.rawMaterialId, g.date || '');
      }
    }
    return map;
  }, [inventoryMovements, grnNotes]);

  const rows = useMemo<AgingRow[]>(() => {
    const byMat = new Map<string, { ending: number }>();
    for (const r of inventory) {
      if (periodValue && (r.lastUpdated || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
      const cur = byMat.get(r.rawMaterialId);
      if (cur) cur.ending += r.quantity;
      else byMat.set(r.rawMaterialId, { ending: r.quantity });
    }
    const out: AgingRow[] = [];
    for (const [id, { ending }] of byMat) {
      const mat = matById.get(id);
      if (!mat) continue;
      const last = lastActivity.get(id);
      const noActivity = !last;
      const lastDay = last ? last.slice(0, 10) : '';
      const age = last ? Math.floor((periodEnd.getTime() - new Date(lastDay + 'T12:00:00').getTime()) / 86400000) : 999;
      out.push({
        materialId: id,
        name: mat.nameAr,
        category: catName(mat.category),
        unit: mat.purchaseUnit || mat.unit,
        lastActivity: lastDay || '—',
        age,
        ending,
        value: ending * (cost.get(id) ?? 0),
        bucket: bucketOf(age, noActivity || age < 0),
      });
    }
    return out.sort((a, b) => b.age - a.age || b.value - a.value);
  }, [inventory, periodValue, branchFilter, matById, lastActivity, cost, catName, periodEnd]);

  const dist = Object.keys(BUCKETS).map((k) => ({
    key: k,
    label: BUCKETS[k].label,
    count: rows.filter((r) => r.bucket === k).length,
    value: rows.filter((r) => r.bucket === k).reduce((s, r) => s + r.value, 0),
  }));
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const stale = rows.filter((r) => r.bucket === 'd' || r.bucket === 'e');
  const staleValue = stale.reduce((s, r) => s + r.value, 0);
  const stalePct = totalValue > 0 ? (staleValue / totalValue) * 100 : 0;

  const chartData = dist.map((d) => ({ name: d.label, value: Number(d.value.toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'أقدمية المخزون (Inventory Aging)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['مواد راكدة/قديمة', `${stale.length}`],
        ['قيمة الراكد', fmtMoney(staleValue)],
        ['نسبة الراكد', `${stalePct.toFixed(1)}%`],
      ],
      tables: [
        {
          title: 'المواد',
          header: ['المادة', 'التصنيف', 'آخر نشاط', 'العمر (يوم)', 'الرصيد', 'القيمة', 'القطاع'],
          rows: rows.map((r) => [r.name, r.category, r.lastActivity, r.age >= 999 ? '∞' : `${r.age}`, fmt(r.ending), fmtMoney(r.value), BUCKETS[r.bucket].label]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الأقدار',
      header: ['المادة', 'التصنيف', 'الوحدة', 'آخر نشاط', 'العمر (يوم)', 'الرصيد', 'القيمة', 'القطاع'],
      rows: rows.map((r) => [r.name, r.category, r.unit, r.lastActivity, r.age, r.ending, Number(r.value.toFixed(2)), BUCKETS[r.bucket].label]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="أقدمية المخزون (Inventory Aging)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Hourglass className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Inventory_Aging_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {rows.length} مادة لها رصيد ختامي
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">نشط (≤ 7 أيام)</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{dist.find((d) => d.key === 'a')?.count ?? 0}</strong>
          <span className="text-[10px] text-emerald-500 block">قيمة {fmtMoney(dist.find((d) => d.key === 'a')?.value ?? 0)}</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">راكد (أكثر من 90 يوم)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{dist.find((d) => d.key === 'e')?.count ?? 0}</strong>
          <span className="text-[10px] text-blue-500 block">بدون أي حركة منذ أمد</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">قيمة الراكد/القديم</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{fmtMoney(staleValue)}</strong>
          <span className="text-[10px] text-rose-500 block">{stalePct.toFixed(1)}% من إجمالي الجرد</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[10px] text-slate-600 font-bold block">إجمالي قيمة الجرد</span>
          <strong className="text-lg font-extrabold text-slate-800 font-mono block">{fmtMoney(totalValue)}</strong>
          <span className="text-[10px] text-slate-500 block">{rows.length} مادة</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Hourglass className="w-5 h-5 text-emerald-600" /> توزيع القيمة حسب الأقدمية
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={105} paddingAngle={2}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BUCKETS[dist[i].key].color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtMoney(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">تفاصيل المصفوفة ({rows.length})</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">آخر نشاط</th>
                <th className="p-2 text-center">العمر (يوم)</th>
                <th className="p-2 text-center">الرصيد</th>
                <th className="p-2 text-center">القيمة</th>
                <th className="p-2 text-center">القطاع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.materialId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="p-2 text-center text-slate-500">{r.category}</td>
                  <td className="p-2 text-center font-mono text-slate-500">{r.lastActivity}</td>
                  <td className="p-2 text-center font-mono font-bold">{r.age >= 999 ? '∞' : fmt(r.age, 0)}</td>
                  <td className="p-2 text-center font-mono text-blue-700">{fmt(r.ending)} {r.unit}</td>
                  <td className="p-2 text-center font-mono text-slate-600">{fmtMoney(r.value)}</td>
                  <td className="p-2 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: BUCKETS[r.bucket].color + '22', color: BUCKETS[r.bucket].color }}>
                      {BUCKETS[r.bucket].label}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-400">لا توجد بيانات لهذه الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default InventoryAgingReport;