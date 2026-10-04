import React, { useMemo, useState } from 'react';
import { Printer, Layers } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// تصنيف ABC/XYZ للمواد (تحليل بريطانو-المخزون)
//   ABC: تصنيف القيمة الاستهلاكية (صادر × تكلفة) — A ≤80% تراكمي، B ≤95%، C الباقي
//   XYZ: انتظام الاستهلاك — نسبة الأيام الفعلية للصرف من أيام الفترة:
//        X ≥ 60% (يومي/منتظم)، Y ≥ 25% (موسمي)، Z < 25% (متفرق/منفرد)
//   المصفوفة: AX=A مراقبة يومية … CZ=تتصرف كمنخفض القيمة والانتظام
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface AbcXyzRow {
  materialId: string;
  name: string;
  category: string;
  unit: string;
  value: number;
  valuePct: number;
  cumPct: number;
  abc: 'A' | 'B' | 'C';
  daysActive: number;
  regularity: number;
  xyz: 'X' | 'Y' | 'Z';
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';
const XYZ_LABEL: Record<string, string> = { X: 'منتظم', Y: 'موسمي', Z: 'متفرق' };

export const AbcXyzReport: React.FC = () => {
  const { inventoryMovements, rawMaterials, grnNotes, branches, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventoryMovements.map((m) => (m.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [inventoryMovements]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);
  const catName = (key: string) => materialCategories.find((c) => c.key === key)?.labelAr ?? key;

  const cost = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) if (g.status === 'approved') for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    for (const m of rawMaterials) if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    return map;
  }, [grnNotes, rawMaterials]);

  const rows = useMemo<AbcXyzRow[]>(() => {
    const mov = inventoryMovements.filter((m) => {
      if ((m.date || '').slice(0, 7) !== periodValue) return false;
      if (branchFilter !== 'all' && m.branchId !== branchFilter) return false;
      return true;
    });
    const activeDates = new Set<string>();
    const raw = new Map<string, { value: number; days: Set<string> }>();
    for (const m of mov) {
      if (m.delta < 0) activeDates.add((m.date || '').slice(0, 10));
      if (m.delta >= 0) continue;
      const cur = raw.get(m.rawMaterialId) ?? { value: 0, days: new Set<string>() };
      cur.value += -m.delta * (cost.get(m.rawMaterialId) ?? 0);
      cur.days.add((m.date || '').slice(0, 10));
      raw.set(m.rawMaterialId, cur);
    }
    const denom = Math.max(activeDates.size, 1);
    const sorted = Array.from(raw.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, r) => s + r.value, 0);

    let cum = 0;
    return sorted.map((r) => {
      const mat = matById.get(r.id);
      if (!mat) return null;
      const valuePct = total > 0 ? (r.value / total) * 100 : 0;
      cum += valuePct;
      const abc: AbcXyzRow['abc'] = cum <= 80 ? 'A' : cum <= 95 ? 'B' : 'C';
      const regularity = denom > 0 ? (r.days.size / denom) * 100 : 0;
      const xyz: AbcXyzRow['xyz'] = regularity >= 60 ? 'X' : regularity >= 25 ? 'Y' : 'Z';
      return {
        materialId: r.id,
        name: mat.nameAr,
        category: catName(mat.category),
        unit: mat.purchaseUnit || mat.unit,
        value: r.value,
        valuePct,
        cumPct: cum,
        abc,
        daysActive: r.days.size,
        regularity,
        xyz,
      };
    }).filter(Boolean) as AbcXyzRow[];
  }, [inventoryMovements, periodValue, branchFilter, cost, matById, catName]);

  const abcCount = (k: string) => rows.filter((r) => r.abc === k).length;
  const aValue = rows.filter((r) => r.abc === 'A').reduce((s, r) => s + r.value, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const aShare = totalValue > 0 ? (aValue / totalValue) * 100 : 0;
  const axCount = rows.filter((r) => r.abc === 'A' && r.xyz === 'X').length;

  const chartData = ['A', 'B', 'C'].map((k) => ({
    name: k,
    count: abcCount(k),
    value: rows.filter((r) => r.abc === k).reduce((s, r) => s + r.value, 0),
  }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'تصنيف ABC/XYZ للمواد',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['A (80% من القيمة)', `${abcCount('A')}`],
        ['سطر AX أولوية المراقبة', `${axCount}`],
      ],
      tables: [
        {
          title: 'المواد',
          header: ['المادة', 'التصنيف', 'القيمة', '% من القيمة', '% تراكمي', 'ABC', 'أيام صرف', 'انتظام%', 'XYZ', 'الإستراتيجية'],
          rows: rows.map((r) => [r.name, r.category, fmtMoney(r.value), `${r.valuePct.toFixed(1)}%`, `${r.cumPct.toFixed(1)}%`, r.abc, `${r.daysActive}`, r.regularity.toFixed(0), r.xyz, `${r.abc}${r.xyz} — ${r.abc === 'A' ? 'مراقبة قريبة' : r.abc === 'B' ? 'مراقبة دورية' : 'منخفض التركيز'} / ${XYZ_LABEL[r.xyz]}`]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'ABC-XYZ',
      header: ['المادة', 'التصنيف', 'الوحدة', 'القيمة', '% من القيمة', '% تراكمي', 'ABC', 'أيام صرف', 'انتظام%', 'XYZ'],
      rows: rows.map((r) => [r.name, r.category, r.unit, Number(r.value.toFixed(2)), Number(r.valuePct.toFixed(1)), Number(r.cumPct.toFixed(1)), r.abc, r.daysActive, Number(r.regularity.toFixed(0)), r.xyz]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصنيف ABC/XYZ للمواد"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Layers className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`ABC_XYZ_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {rows.length} مادة استُهلكت — قاعدة ABC: 80/95% تراكمي من القيمة · XYZ: انتظام الصرف نسبةً لأيام النشاط في الفترة (60/25%)
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">مواد A (80% من القيمة)</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{abcCount('A')}</strong>
          <span className="text-[10px] text-indigo-500 block">{aShare.toFixed(0)}% من قيمة الاستهلاك</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">مواد B (15% التالية)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{abcCount('B')}</strong>
          <span className="text-[10px] text-blue-500 block">مراقبة دورية</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">مواد C (ذيل طويلة)</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{abcCount('C')}</strong>
          <span className="text-[10px] text-amber-500 block">منخفضة القيمة — تبسيط الطلب</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">سطور AX (أولوية قصوى)</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{axCount}</strong>
          <span className="text-[10px] text-rose-500 block">قيمة + انتظام — مراقبة يومية</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" /> قيمة الاستهلاك حسب تصنيف ABC
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
              <YAxis fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, name) => [`${name === 'value' ? fmtMoney(Number(v)) : `${Number(v)} مادة`}`, '']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={['#6366f1', '#3b82f6', '#f59e0b'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">مصفوفة المواد ({rows.length})</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">القيمة</th>
                <th className="p-2 text-center">% تراكمي</th>
                <th className="p-2 text-center">ABC</th>
                <th className="p-2 text-center">أيام صرف</th>
                <th className="p-2 text-center">انتظام%</th>
                <th className="p-2 text-center">XYZ</th>
                <th className="p-2 text-center">الإستراتيجية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.materialId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="p-2 text-center text-slate-500">{r.category}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.value)}</td>
                  <td className="tnum p-2 text-left text-slate-500">{r.cumPct.toFixed(1)}%</td>
                  <td className="tnum p-2 text-left font-bold text-indigo-700">{r.abc}</td>
                  <td className="tnum p-2 text-left">{r.daysActive}</td>
                  <td className="tnum p-2 text-left text-slate-500">{r.regularity.toFixed(0)}%</td>
                  <td className="tnum p-2 text-left font-bold text-emerald-700">{r.xyz}</td>
                  <td className="p-2 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                      {r.abc}{r.xyz} — {r.abc === 'A' ? 'مراقبة قريبة' : r.abc === 'B' ? 'مراقبة دورية' : 'منخفض التركيز'} / {XYZ_LABEL[r.xyz]}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-slate-400">لا توجد مواد باستهلاك في الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AbcXyzReport;