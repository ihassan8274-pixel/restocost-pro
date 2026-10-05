import React, { useState, useMemo } from 'react';
import { Calculator, Printer, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { monthLabelFor } from '../../utils/financials';
import { openPrintWindow } from '../../utils/print';

export const PotentialUsageView: React.FC = () => {
  const {
    branches, visibleBranchIds, rawMaterials, recipes, posOrders,
    grnNotes, stockTransfers, openingBalances, monthlyInventory, inventory,
    getBranchName, getAverageUnitCost,
  } = useApp();

  const [branch, setBranch] = useState(visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const inMonth = (d: string) => d.slice(0, 7) === month;

  const hasInventory = monthlyInventory.some((p) => p.branchId === branch && p.monthKey === month);

  const potMap = useMemo(() => {
    const m: Record<string, number> = {};
    rawMaterials.forEach((r) => { m[r.id] = 0; });
    posOrders
      .filter((o) => o.branchId === branch && inMonth(o.date))
      .forEach((o) => {
        o.items.forEach((it) => {
          const r = recipes.find((rr) => rr.id === it.recipeId);
          if (!r) return;
          r.ingredients.forEach((ing) => {
            if (m[ing.rawMaterialId] !== undefined) {
              m[ing.rawMaterialId] += ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * it.quantity;
            }
          });
        });
      });
    return m;
  }, [branch, month]);

  const actMap = useMemo(() => {
    const period = monthlyInventory.find((p) => p.branchId === branch && p.monthKey === month);
    if (period) {
      const m: Record<string, number> = {};
      period.items.forEach((it) => { m[it.rawMaterialId] = it.actualUsage; });
      return m;
    }
    const ob = openingBalances
      .filter((r) => r.branchId === branch && r.date.slice(0, 7) <= month)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const map: Record<string, number> = {};
    rawMaterials.forEach((mat) => {
      const openingQty = ob?.items.find((x) => x.rawMaterialId === mat.id)?.quantity ?? 0;
      const purchased = grnNotes
        .filter((g) => g.branchId === branch && g.status === 'approved' && inMonth(g.date))
        .reduce((s, g) => s + g.items.filter((x) => x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantityReceived, 0), 0);
      const trIn = stockTransfers
        .filter((t) => t.status === 'approved' && t.toBranchId === branch && inMonth(t.date))
        .reduce((s, t) => s + t.items.filter((x) => x.itemType !== 'recipe' && x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantity, 0), 0);
      const trOut = stockTransfers
        .filter((t) => t.status === 'approved' && t.fromBranchId === branch && inMonth(t.date))
        .reduce((s, t) => s + t.items.filter((x) => x.itemType !== 'recipe' && x.rawMaterialId === mat.id).reduce((si, x) => si + x.quantity, 0), 0);
      const invRec = inventory.filter((r) => r.branchId === branch && r.rawMaterialId === mat.id);
      const endingSOH = invRec.reduce((s, r) => s + r.quantity, 0);
      map[mat.id] = Math.max(0, openingQty + purchased + trIn - trOut - endingSOH);
    });
    return map;
  }, [branch, month]);

  const rows = useMemo(() => {
    return rawMaterials
      .filter((m) => m.isActive)
      .map((mat) => {
        const pot = potMap[mat.id];
        const act = actMap[mat.id] || 0;
        const variance = act - pot;
        const unitCost = getAverageUnitCost(mat.id);
        const varianceValue = variance * unitCost;
        const variancePct = pot > 0 ? (variance / pot) * 100 : 0;
        return { mat, pot, act, variance, unitCost, varianceValue, variancePct };
      })
      .filter((r) => r.pot > 0 || r.act > 0)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [rawMaterials, potMap, actMap, getAverageUnitCost]);

  const totalPOT = rows.reduce((s, r) => s + r.pot, 0);
  const totalACT = rows.reduce((s, r) => s + r.act, 0);
  const totalVariance = totalACT - totalPOT;
  const totalVarianceValue = rows.reduce((s, r) => s + r.varianceValue, 0);

  const printReport = () => {
    openPrintWindow({
      title: `الاستهلاك المتوقع (Potential Usage) — ${monthLabelFor(month)}`,
      subtitle: `${getBranchName(branch)}${hasInventory ? '' : ' (تقريبي — يعتمد على أرصدة حالية)'}`,
      meta: [
        ['الفرع', getBranchName(branch)],
        ['الشهر', monthLabelFor(month)],
        ['الاستهلاك النظري (POT)', `${fmt(totalPOT)}`],
        ['الاستهلاك الفعلي (ACT)', `${fmt(totalACT)}`],
        ['فرق الاستخدام', `${fmt(totalVariance)}`],
        ['قيمة الفرق', `${fmtMoney(totalVarianceValue)}`],
      ],
      tables: [{
        title: 'الاستهلاك المتوقع — فرع ' + getBranchName(branch),
        header: ['#', 'الصنف', 'الوحدة', 'نظري (POT)', 'فعلي (ACT)', 'الفرق', 'قيمة الفرق', 'الانحراف %'],
        rows: rows.map((r, idx) => [
          idx + 1, r.mat.nameAr, r.mat.unit, fmt(r.pot), fmt(r.act),
          fmt(r.variance), fmtMoney(r.varianceValue), r.variancePct.toFixed(1) + '%',
        ]),
      }],
       totals: [
        ['النظري (POT)', fmt(totalPOT)],
        ['الفعلي (ACT)', fmt(totalACT)],
        ['فرق الاستخدام', fmt(totalVariance)],
        ['قيمة الفرق', fmtMoney(totalVarianceValue)],
      ],
      footer: 'تقرير الاستهلاك المتوقع صادر من RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاستهلاك المتوقع (Potential Usage)"
        subtitle="كما في Oracle Material Control — مقارنة الاستهلاك النظري (من الوصفات × مبيعات POS) بالفعلي؛ كشف الهسر والتلاعب"
        icon={<Calculator className="w-6 h-6 text-brand-600" />}
        actions={
          <ViewToolbar
            filename={`الاستهلاك_المتوقع_${month}`}
            sheets={[
              {
                name: 'الاستهلاك المتوقع',
                header: ['الصنف', 'الوحدة', 'نظري POT', 'فعلي ACT', 'الفرق', 'قيمة الفرق', 'الانحراف %'],
                rows: rows.map((r) => [
                  r.mat.nameAr,
                  r.mat.unit,
                  fmt(r.pot),
                  fmt(r.act),
                  fmt(r.variance),
                  fmtMoney(r.varianceValue),
                  r.variancePct.toFixed(1) + '%',
                ]),
              },
            ]}
          />
        }
      />

      <Card className="p-5">
        <SectionHeader title="فلترة التقرير" subtitle="اختر الفرع والشهر لمقارنة الاستهلاك النظري (POT) بالفعلي (ACT)" icon={<Calculator className="w-5 h-5 text-brand-500" />} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <Field label="الفرع">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <Field label="الشهر">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {!hasInventory && (
          <div className="mt-3 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> لم يتم بدء جرد شهري لهذا الشهر — يُحسب الاستهلاك الفعلي (ACT) من الحركات والأرصدة الحالية (تقريبي). يُرجى بدء جرد شهري للحصول على أرقام دقيقة.</div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-slate-500 font-bold text-xs">لا توجد بيانات استهلاك للفرع والشهر المختار</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xs">مقارنة الاستهلاك النظري والفعلي — فرع {getBranchName(branch)}</h3>
            <div className="flex gap-2 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{rows.length} صنف</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">POT {fmt(totalPOT)}</span>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">ACT {fmt(totalACT)}</span>
              <span className={`px-2 py-0.5 rounded-full ${totalVariance >= 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>فرق {fmt(totalVariance)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">الوحدة</th>
                  <th className="p-3">نظري (POT)</th>
                  <th className="p-3">فعلي (ACT)</th>
                  <th className="p-3">الفرق</th>
                  <th className="p-3">قيمة الفرق (ر.س)</th>
                  <th className="p-3">الانحراف %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={r.mat.id} className={`${r.variance > 0 ? 'bg-rose-50/30' : r.variance < 0 ? 'bg-emerald-50/30' : ''} hover:bg-slate-50`}>
                    <td className="tnum text-left p-3 text-slate-500">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-800">{r.mat.nameAr}</td>
                    <td className="p-3 text-slate-600">{r.mat.unit}</td>
                    <td className="tnum text-left p-3">{fmt(r.pot)}</td>
                    <td className="tnum text-left p-3">{fmt(r.act)}</td>
                    <td className={`p-3 font-mono font-bold ${r.variance > 0 ? 'text-rose-700' : r.variance < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(r.variance)}</td>
                    <td className={`p-3 font-mono font-bold ${r.varianceValue > 0 ? 'text-rose-700' : r.varianceValue < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmtMoney(r.varianceValue)}</td>
                    <td className={`p-3 font-mono font-bold ${r.variancePct > 5 ? 'text-rose-700' : r.variancePct < -5 ? 'text-emerald-700' : 'text-slate-500'}`}>{r.variancePct.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white font-bold">
                  <td className="p-3" colSpan={3}>الإجمالي</td>
                  <td className="tnum text-left p-3">{fmt(totalPOT)}</td>
                  <td className="tnum text-left p-3">{fmt(totalACT)}</td>
                  <td className="tnum text-left p-3">{fmt(totalVariance)}</td>
                  <td className="tnum text-left p-3">{fmtMoney(totalVarianceValue)}</td>
                  <td className="tnum text-left p-3">{totalPOT > 0 ? ((totalVariance / totalPOT) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4 inline mr-1" /> طباعة التقرير</Btn>
      </div>
    </div>
  );
};