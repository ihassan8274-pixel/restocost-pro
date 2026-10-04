import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, TrendingUp, TrendingDown, Save, RotateCcw, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, EmptyState, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { computeRecipeCosts } from '../../business/recipes';
import { fmtMoney } from '../../utils/helpers';
import { StandardRecipe } from '../../types';

interface SimRow {
  materialId: string;
  label: string;
  currentPrice: number;
  newPrice: number;
  pct: number;
}

export const WhatIfSimulationView: React.FC = () => {
  const { rawMaterials, recipes, getAverageUnitCost, calculateRecipeCosts, globalTargetMarginPercent, updateRawMaterial, can } = useApp();
  const margin = (100 - (globalTargetMarginPercent || 28)) / 100;
  const foodCostTarget = globalTargetMarginPercent && globalTargetMarginPercent > 0 ? (100 - globalTargetMarginPercent) / 100 : 0.28;

  const [rows, setRows] = useState<SimRow[]>(() => [{ materialId: rawMaterials[0]?.id || '', label: rawMaterials[0]?.nameAr || '', currentPrice: rawMaterials[0] ? getAverageUnitCost(rawMaterials[0].id) || rawMaterials[0].standardPrice : 0, newPrice: rawMaterials[0] ? getAverageUnitCost(rawMaterials[0].id) || rawMaterials[0].standardPrice : 0, pct: 0 }]);

  const selectMat = (idx: number, id: string) => {
    const mat = rawMaterials.find((m) => m.id === id);
    const cur = mat ? getAverageUnitCost(mat.id) || mat.standardPrice || 0 : 0;
    setRows((prev) => prev.map((r, i) => (i === idx ? { materialId: id, label: mat?.nameAr || '', currentPrice: cur, newPrice: cur, pct: 0 } : r)));
  };

  const addRow = () => {
    const taken = new Set(rows.map((r) => r.materialId));
    const mat = rawMaterials.find((m) => !taken.has(m.id));
    if (!mat) return;
    const cur = getAverageUnitCost(mat.id) || mat.standardPrice || 0;
    setRows((prev) => [...prev, { materialId: mat.id, label: mat.nameAr, currentPrice: cur, newPrice: cur, pct: 0 }]);
  };

  const setNewPrice = (idx: number, v: number) => setRows((prev) => prev.map((r, i) => {
    if (i !== idx) return r;
    const newPrice = v;
    const pct = r.currentPrice > 0 ? ((newPrice / r.currentPrice) - 1) * 100 : 0;
    return { ...r, newPrice: Math.max(0, newPrice), pct };
  }));

  const setPct = (idx: number, p: number) => setRows((prev) => prev.map((r, i) => {
    if (i !== idx) return r;
    const newPrice = r.currentPrice * (1 + p / 100);
    return { ...r, newPrice, pct: p };
  }));

  const effective = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => { if (r.materialId) map[r.materialId] = r.newPrice; });
    return map;
  }, [rows]);

  const changed = Object.keys(effective).length > 0;

  const simulate = (r: StandardRecipe) => {
    const orig = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
    // إعادة حساب بالأسعار الجديدة عبر نفس دالة الخوارزمية المعيارية
    const newCosts = computeRecipeCosts(
      rawMaterials, recipes, r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces, 0,
      (id) => (id in effective ? effective[id] : getAverageUnitCost(id)),
    );
    return { pr: r, orig, newCosts };
  };

  const results = useMemo(() => (changed ? recipes.map(simulate).sort((a, b) => (b.orig.totalCost - b.newCosts.totalCost) - (a.orig.totalCost - a.newCosts.totalCost)) : []), [changed, effective, recipes]);
  const impactOnly = results.filter((x) => Math.abs(x.orig.totalCost - x.newCosts.totalCost) > 0.005);
  const worst = impactOnly[0];
  const totalDailyDelta = impactOnly.reduce((s, x) => s + (x.newCosts.totalCost - x.orig.totalCost), 0);

  const applyPrices = () => {
    rows.forEach((r) => {
      if (!r.materialId) return;
      const mat = rawMaterials.find((m) => m.id === r.materialId);
      if (!mat) return;
      updateRawMaterial(r.materialId, { standardPrice: r.newPrice });
      const cur = getAverageUnitCost(r.materialId) || r.newPrice;
      setRows((prev) => prev.map((x, i) => (i === rows.indexOf(r) ? { ...x, currentPrice: x.newPrice, newPrice: cur, pct: 0 } : x)));
    });
  };

  const priceInputs = rows.map((r) => rawMaterials.find((m) => m.id === r.materialId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="محاكاة ماذا لو — أثر تغيّر الأسعار على التكلفة"
        subtitle="ارفع سعر خامة (أو غيّرها بالنسب) وشاهد الأثر الفوري على تكلفة كل وصفة وسعرها المقترح — بدون تغيير بياناتك"
        icon={<FlaskConical className="w-6 h-6 text-violet-600" />}
        actions={
          <ViewToolbar
            filename="محاكاة ماذا لو"
            sheets={[{ name: 'الأثر على الوصفات', header: ['الوصفة', 'التكلفة الحالية', 'التكلفة الجديدة', 'الفرق', 'النسبة%', 'سعر مقترح قديم', 'سعر مقترح جديد'], rows: results.map((x) => [x.pr.nameAr, x.orig.totalCost, x.newCosts.totalCost, Number((x.newCosts.totalCost - x.orig.totalCost).toFixed(2)), Number((((x.newCosts.totalCost - x.orig.totalCost) / (x.orig.totalCost || 1)) * 100).toFixed(2)), x.orig.suggestedPrice, x.newCosts.suggestedPrice]) }]}
          />
        }
      />

      <Card className="p-5">
        <SectionHeader
          title="متغيرات المحاكاة (أسعار المواد)"
          subtitle="حدّد الخامات المطلوبة والسعر الجديد — حتى 4 خامات دفعة واحدة"
          icon={<SlidersHorizontal className="w-5 h-5 text-violet-600" />}
          extra={rows.length < 4 && <Btn tone="ghost" onClick={addRow}><TrendingUp className="w-4 h-4" /> إضافة خامة</Btn>}
        />
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rows.map((r, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <Field label={`الخامة ${idx + 1}`}>
                <AutocompleteSelect
                  disabled={false}
                  value={r.materialId}
                  options={rawMaterials.map((m) => ({ value: m.id, label: m.nameAr }))}
                  onChange={(id) => selectMat(idx, id)}
                  placeholder="اختر خامة…"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="السعر الحالي">
                  <input type="number" step="any" className={inputCls} value={r.currentPrice || ''} readOnly disabled />
                </Field>
                <Field label="السعر الجديد">
                  <input type="number" step="any" className={inputCls} value={r.newPrice || ''} onChange={(e) => setNewPrice(idx, parseFloat(e.target.value) || 0)} />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-500">بنسبة %:</label>
                <input type="range" min={-50} max={100} step={1} value={Math.round(r.pct)} onChange={(e) => setPct(idx, parseFloat(e.target.value))} className="w-full accent-violet-600" />
                <span className={`text-[11px] font-black w-14 text-left ${r.pct > 0 ? 'text-rose-600' : r.pct < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{r.pct > 0 ? '+' : ''}{Math.round(r.pct)}%</span>
              </div>
              {r.materialId && priceInputs[idx] && (() => {
                const usedBy = recipes.filter((re) => re.ingredients.some((i) => i.rawMaterialId === r.materialId)).length;
                return <p className="text-[10px] font-bold text-slate-400">{usedBy} وصفة تستخدم هذه الخامة</p>;
              })()}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Btn tone="ghost" onClick={() => setRows([{ materialId: '', label: '', currentPrice: 0, newPrice: 0, pct: 0 }])}><RotateCcw className="w-4 h-4" /> تصفير</Btn>
          {can('manage_inventory') && rows.some((r) => r.materialId && r.newPrice !== r.currentPrice) && (
            <Btn onClick={applyPrices}><Save className="w-4 h-4" /> تطبيق الأسعار الجديدة فعلياً</Btn>
          )}
        </div>
      </Card>

      {!changed ? (
        <Card className="p-5"><EmptyState title="اختر خامة وعدّل سعرها" subtitle="ستظهر هنا الوصفات المتأثرة ودرجة الأثر" icon={<SlidersHorizontal className="w-5 h-5" />} /></Card>
      ) : impactOnly.length === 0 ? (
        <Card className="p-5"><EmptyState title="لا أثر على أي وصفة" subtitle="لا توجد وصفات تعتمد على الخامات المحددة" icon={<TrendingUp className="w-5 h-5" />} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
              <p className="text-[11px] font-bold text-indigo-700">عدد الوصفات المتأثرة</p>
              <p className="mt-1 text-2xl font-black text-indigo-900">{impactOnly.length}</p>
              <p className="text-[10px] font-bold text-indigo-500">من أصل {recipes.length} وصفة مقيّدة</p>
            </div>
            <div className={`rounded-2xl border p-4 ${totalDailyDelta >= 0 ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
              <p className="text-[11px] font-bold text-slate-600">إجمالي الأثر على التكلفة</p>
              <p className={`mt-1 text-2xl font-black font-mono ${totalDailyDelta >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{totalDailyDelta >= 0 ? '+' : ''}{fmtMoney(totalDailyDelta)}</p>
              <p className="text-[10px] font-bold text-slate-500">مجموع فرق التكلفة في كل وصفة (لكل حصة واحدة)</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-[11px] font-bold text-slate-600">أكبر تأثر</p>
              {worst && <p className="mt-1 text-sm font-black text-slate-900 truncate">{worst.pr.nameAr}</p>}
              {worst && <p className={`text-[11px] font-black font-mono ${worst.newCosts.totalCost > worst.orig.totalCost ? 'text-rose-700' : 'text-emerald-700'}`}>{(worst.newCosts.totalCost - worst.orig.totalCost > 0 ? '+' : '')}{fmtMoney(worst.newCosts.totalCost - worst.orig.totalCost)} ({(worst.orig.totalCost > 0 ? (((worst.newCosts.totalCost - worst.orig.totalCost) / worst.orig.totalCost) * 100).toFixed(1) : '0')}%)</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold text-slate-600">نسبة التكلفة المستهدفة</p>
              <p className="mt-1 text-2xl font-black text-slate-900 font-mono">{(foodCostTarget * 100).toFixed(1)}%</p>
              <p className="text-[10px] font-bold text-slate-500">سعر الوصفة المقترح = التكلفة ÷ (1 - الهامش)</p>
            </div>
          </div>

          <Card className="p-5">
            <SectionHeader
              title="الوصفات المتأثرة (مرتبة بالأثر التنازلي)"
              subtitle={`الهامش المستهدف ${margin * 100}% — جدّد الأسعار لدخول السعر المقترح حيز التنفيذ`}
              icon={<TrendingUp className="w-5 h-5 text-violet-600" />}
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-right text-xs min-w-[860px]">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">الوصفة</th>
                    <th className="p-3">التكلفة الحالية</th>
                    <th className="p-3">التكلفة الجديدة</th>
                    <th className="p-3">الفرق</th>
                    <th className="p-3">النسبة</th>
                    <th className="p-3">السعر المقترح (حالي)</th>
                    <th className="p-3">السعر المقترح (جديد)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {impactOnly.map((x) => {
                    const delta = x.newCosts.totalCost - x.orig.totalCost;
                    const up = delta > 0.005;
                    const pct = x.orig.totalCost > 0 ? (delta / x.orig.totalCost) * 100 : 0;
                    return (
                      <tr key={x.pr.id} className="hover:bg-violet-50/40">
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center ${up ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            </span>
                            {x.pr.nameAr}
                          </div>
                        </td>
                        <td className="tnum text-left p-3 text-slate-600">{fmtMoney(x.orig.totalCost)}</td>
                        <td className="tnum text-left p-3 font-bold text-slate-900">{fmtMoney(x.newCosts.totalCost)}</td>
                        <td className={`p-3 font-mono font-black ${up ? 'text-rose-700' : 'text-emerald-700'}`}>{up ? '+' : ''}{fmtMoney(delta)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${up ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {up ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="tnum text-left p-3 text-slate-500">{fmtMoney(x.orig.suggestedPrice)}</td>
                        <td className="tnum text-left p-3 font-extrabold text-violet-700">{fmtMoney(x.newCosts.suggestedPrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};