import React, { useMemo, useState } from 'react';
import { Printer, Scale, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel, allCategoryLabels } from '../../../utils/helpers';
import { tradeToStock } from '../../../business/units';
import { openPrintWindow } from '../../../utils/print';
import type { BatchSalesRecord } from '../../../types/pos';
import type { StandardRecipe, RecipeIngredient } from '../../../types/production';
import type { RawMaterial, InventoryMovementLog } from '../../../types';

// ═══════════════════════════════════════════════════════════════════════════
// الاستهلاك النظري مقابل الفعلي (Theoretical vs Actual Consumption — POT vs ACT)
// الهوية (مستمدّة من كشف RestoCost v7.0):
//   النظري  = الوصفات (BOM + هالك%) × مبيعات الفترة   [بوحدة المخزون]
//   الفعلي  = رصيد أول + مشتريات + تحويلات وارد − رصيد آخر  (عبر حركات المخزون)
//   الفرق   = كمي (وحدات المخزون) + قيمي (السعر القياسي) + نسبة المطابقة %
// فلاتر: شهر + فرع + تصنيف مادة
// ═══════════════════════════════════════════════════════════════════════════

interface PotRow {
  matId: string;
  code: string;
  nameAr: string;
  category: string;
  unit: string;
  theoreticalQty: number;
  theoreticalValue: number;
  actualQty: number;
  actualValue: number;
  varianceQty: number;
  varianceValue: number;
  matchPct: number;
}

interface PotTotals {
  theoreticalQty: number;
  theoreticalValue: number;
  actualQty: number;
  actualValue: number;
  varianceValue: number;
  matchPct: number;
  overCount: number; // مواد استهلاكها الفعلي > النظري
}

interface CategoryTotals extends PotTotals {
  category: string;
}

const SUPPLY_IN_TYPES = new Set(['استقبال استلام', 'استلام مشتريات', 'تحويل وارد']);

// تمديد الوصفة إلى المواد الخام مع الهالك وتحويل وحدة التداول إلى وحدة المخزون
// وصفات الخدمة (sub-prep / central kitchen) كمياتها للدفعة كاملة — تُقسَّم على إنتاجيتها (yieldPieces)
const expandRecipe = (
  recipe: StandardRecipe | undefined,
  factor: number,
  recipeMap: Map<string, StandardRecipe>,
  matMap: Map<string, RawMaterial>,
  acc: Map<string, number>,
  depth = 0
): void => {
  if (!recipe || depth > 6) return;
  const ing = (recipe.ingredients || []) as RecipeIngredient[];
  ing.forEach((i) => {
    const qtyStock = tradeToStock(i.quantity * (1 + (i.wastagePercent || 0) / 100) * factor, matMap.get(i.rawMaterialId));
    acc.set(i.rawMaterialId, (acc.get(i.rawMaterialId) || 0) + qtyStock);
  });
  (recipe.subPrepIngredients || []).forEach((sub) => {
    const subRecipe = recipeMap.get(sub.recipeId);
    if (!subRecipe) return;
    const perPiece = subRecipe.yieldPieces && subRecipe.yieldPieces > 0 ? subRecipe.yieldPieces : 1;
    expandRecipe(subRecipe, (sub.quantity * factor) / perPiece, recipeMap, matMap, acc, depth + 1);
  });
};

// الاستهلاك النظري لكل مادة من مبيعات الفترة
const buildTheoretical = (
  records: BatchSalesRecord[],
  recipeMap: Map<string, StandardRecipe>,
  matMap: Map<string, RawMaterial>
): Map<string, number> => {
  const acc = new Map<string, number>();
  records.forEach((b) => {
    (b.items || []).forEach((it) => {
      const recipe = recipeMap.get(it.recipeId);
      const qtySold = it.quantitySold || 0;
      if (qtySold <= 0) return;
      expandRecipe(recipe, qtySold, recipeMap, matMap, acc);
    });
  });
  return acc;
};

// الاستهلاك الفعلي لكل مادة×فرع: وارد الفترة (مشتريات/تحويلات) − صافي تغيّر رصيد الفترة
// (= رصيد أول + مشتريات + تحويلات − رصيد آخر) — رصيد الافتتاح يُلغي نفسه تلقائياً
const buildActual = (
  movements: InventoryMovementLog[],
  branchFilter: string,
  period: string
): Map<string, number> => {
  const supplyIn = new Map<string, number>();
  const netChange = new Map<string, number>();
  movements.forEach((m) => {
    if (branchFilter !== 'all' && m.branchId !== branchFilter) return;
    const month = (m.date || '').slice(0, 7);
    if (month !== period) return;
    const d = m.delta || 0;
    netChange.set(m.rawMaterialId, (netChange.get(m.rawMaterialId) || 0) + d);
    if (d > 0 && SUPPLY_IN_TYPES.has(m.type)) supplyIn.set(m.rawMaterialId, (supplyIn.get(m.rawMaterialId) || 0) + d);
  });
  const consumed = new Map<string, number>();
  new Set([...supplyIn.keys(), ...netChange.keys()]).forEach((mid) => {
    consumed.set(mid, (supplyIn.get(mid) || 0) - (netChange.get(mid) || 0));
  });
  return consumed;
};

const buildRows = (
  records: BatchSalesRecord[],
  movements: InventoryMovementLog[],
  recipes: StandardRecipe[],
  materials: RawMaterial[],
  branchFilter: string,
  period: string,
  categoryFilter: string
): PotRow[] => {
  const recipeMap = new Map<string, StandardRecipe>();
  recipes.forEach((r) => recipeMap.set(r.id, r));
  const matMap = new Map<string, RawMaterial>();
  materials.forEach((m) => matMap.set(m.id, m));

  const theoretic = buildTheoretical(
    records.filter((b) => (branchFilter === 'all' || b.branchId === branchFilter) && (b.date || '').slice(0, 7) === period),
    recipeMap,
    matMap
  );
  const actual = buildActual(movements, branchFilter, period);

  const rows: PotRow[] = [];
  const ids = new Set<string>([...theoretic.keys(), ...actual.keys()]);
  ids.forEach((matId) => {
    const mat = matMap.get(matId);
    const category = mat?.category || '';
    if (categoryFilter !== 'all' && category !== categoryFilter) return;
    const standardPrice = mat?.standardPrice || 0;
    const theoreticalQty = theoretic.get(matId) || 0;
    const actualQty = actual.get(matId) || 0;
    const varianceQty = actualQty - theoreticalQty;
    rows.push({
      matId,
      code: mat?.code || '',
      nameAr: mat?.nameAr || matId,
      category,
      unit: mat?.unit || '',
      theoreticalQty,
      theoreticalValue: theoreticalQty * standardPrice,
      actualQty,
      actualValue: actualQty * standardPrice,
      varianceQty,
      varianceValue: varianceQty * standardPrice,
      matchPct: theoreticalQty > 0 ? (1 - Math.abs(varianceQty) / theoreticalQty) * 100 : actualQty === 0 && theoreticalQty === 0 ? 100 : 0,
    });
  });
  return rows.sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));
};

const sumRows = (rows: PotRow[]): PotTotals => {
  const t = rows.reduce(
    (acc, r) => {
      acc.theoreticalQty += r.theoreticalQty;
      acc.theoreticalValue += r.theoreticalValue;
      acc.actualQty += r.actualQty;
      acc.actualValue += r.actualValue;
      acc.varianceValue += r.varianceValue;
      if (r.actualQty > r.theoreticalQty) acc.overCount += 1;
      return acc;
    },
    { theoreticalQty: 0, theoreticalValue: 0, actualQty: 0, actualValue: 0, varianceValue: 0, matchPct: 0, overCount: 0 }
  );
  t.matchPct = t.theoreticalQty > 0 ? (1 - Math.abs(t.actualQty - t.theoreticalQty) / t.theoreticalQty) * 100 : t.actualQty === 0 && t.theoreticalQty === 0 ? 100 : 0;
  return t;
};

const categorySummary = (rows: PotRow[], categories: Record<string, string>): CategoryTotals[] => {
  const map = new Map<string, PotRow[]>();
  rows.forEach((r) => {
    const key = r.category || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries())
    .map(([cat, items]) => ({ category: categories[cat] || cat, ...sumRows(items) }))
    .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));
};

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

const varianceColor = (v: number) => (v > 0.001 ? 'text-rose-600' : v < -0.001 ? 'text-emerald-600' : 'text-slate-600');

const matColor = (p: number) => (p >= 95 ? 'text-emerald-600' : p >= 85 ? 'text-amber-600' : 'text-rose-600');

export const TheoreticalVsActualReport: React.FC = () => {
  const { batchSalesRecords, branches, recipes, rawMaterials, inventoryMovements, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );
  const periodValue = currentPeriod || periods[0] || new Date().toISOString().slice(0, 7);
  const categories = useMemo(() => allCategoryLabels(materialCategories), [materialCategories]);

  const rows = useMemo(
    () => buildRows(batchSalesRecords, inventoryMovements, recipes, rawMaterials, branchFilter, periodValue, categoryFilter),
    [batchSalesRecords, inventoryMovements, recipes, rawMaterials, branchFilter, periodValue, categoryFilter]
  );

  const totals = useMemo(() => sumRows(rows), [rows]);
  const catSummaries = useMemo(() => categorySummary(rows, categories), [rows, categories]);

  const periodLabel = monthLabel(periodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const categoryLabelActive = categoryFilter === 'all' ? 'جميع التصنيفات' : categories[categoryFilter] || categoryFilter;

  const matchPct = totals.matchPct;
  const matchStatus = matchPct >= 95 ? 'انحراف طفيف' : matchPct >= 85 ? 'انحراف متوسط' : 'انحراف مرتفع';

  const printReport = () => {
    const headers = ['المادة (كود)', 'التصنيف', 'الوحدة', 'النظري (كمية)', 'النظري (قيمة)', 'الفعلي (كمية)', 'الفعلي (قيمة)', 'فرق كمي', 'فرق قيمي', 'نسبة المطابقة %'];
    openPrintWindow({
      title: 'الاستهلاك النظري مقابل الفعلي (POT vs ACT)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel} — ${categoryLabelActive}`,
      meta: [
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['التصنيف', categoryLabelActive],
      ],
      tables: [
        {
          title: 'الاستهلاك النظري مقابل الفعلي',
          header: headers,
          rows: [
            ...rows.map((r) => [
              `${r.nameAr} (${r.code})`, categories[r.category] || r.category, r.unit,
              fmt(r.theoreticalQty), fmtMoney(r.theoreticalValue), fmt(r.actualQty), fmtMoney(r.actualValue),
              (r.varianceQty > 0 ? '+' : '') + fmt(r.varianceQty), (r.varianceValue > 0 ? '+' : '') + fmtMoney(r.varianceValue),
              `${r.matchPct.toFixed(1)}%`,
            ]),
            ['الإجمالي', '-', '-', fmt(totals.theoreticalQty), fmtMoney(totals.theoreticalValue), fmt(totals.actualQty), fmtMoney(totals.actualValue), '-', (totals.varianceValue > 0 ? '+' : '') + fmtMoney(totals.varianceValue), `${totals.matchPct.toFixed(1)}%`],
          ],
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'نظري×فعلي',
      header: ['المواد', 'التصنيف', 'الوحدة', 'النظري كمية', 'النظري قيمة', 'الفعلي كمية', 'الفعلي قيمة', 'فرق كمي', 'فرق قيمي', 'مطابقة %'],
      rows: [
        ...rows.map((r) => [
          `${r.nameAr} (${r.code})`, categories[r.category] || r.category, r.unit,
          r.theoreticalQty.toFixed(2), r.theoreticalValue.toFixed(2), r.actualQty.toFixed(2), r.actualValue.toFixed(2),
          r.varianceQty.toFixed(2), r.varianceValue.toFixed(2), `${r.matchPct.toFixed(1)}%`,
        ]),
        ['الإجمالي', '-', '-', totals.theoreticalQty.toFixed(2), totals.theoreticalValue.toFixed(2), totals.actualQty.toFixed(2), totals.actualValue.toFixed(2), '-', totals.varianceValue.toFixed(2), `${totals.matchPct.toFixed(1)}%`],
      ],
    },
    {
      name: 'الملخص بالتصنيف',
      header: ['التصنيف', 'النظري', 'الفعلي', 'الفرق', 'مطابقة %'],
      rows: catSummaries.map((c) => [c.category, fmtMoney(c.theoreticalValue), fmtMoney(c.actualValue), (c.varianceValue > 0 ? '+' : '') + fmtMoney(c.varianceValue), `${c.matchPct.toFixed(1)}%`]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاستهلاك النظري مقابل الفعلي (Theoretical vs Actual)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel} — ${categoryLabelActive}`}
        icon={<Scale className="w-6 h-6 text-amber-600" />}
        actions={
          <>
            <ViewToolbar filename={`Theoretical_vs_Actual_${periodValue}`} sheets={excelSheets} />
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
              <Field label="التصنيف">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع التصنيفات</option>
                  {Object.entries(categories).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {categoryLabelActive}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">الاستهلاك النظري (BOM × مبيعات)</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono">{fmtMoney(totals.theoreticalValue)}</strong>
          <span className="text-[10px] text-blue-500 block">{fmt(totals.theoreticalQty)} وحدة مخزون</span>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">الاستهلاك الفعلي (حركات المخزون)</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono">{fmtMoney(totals.actualValue)}</strong>
          <span className="text-[10px] text-rose-500 block">{fmt(totals.actualQty)} وحدة مخزون</span>
        </div>
        <div className={`${totals.varianceValue > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4`}>
          <span className={`text-[10px] font-bold block ${totals.varianceValue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>فرق الاستهلاك (فعلي − نظري)</span>
          <strong className={`text-lg font-extrabold font-mono ${totals.varianceValue > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
            {totals.varianceValue > 0 ? '+' : ''}{fmtMoney(totals.varianceValue)}
          </strong>
          <span className={`text-[10px] block ${totals.varianceValue > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {totals.varianceValue > 0 ? 'استهلاك زائد' : 'توفير'} ({totals.overCount} مادة فوق النظري)
          </span>
        </div>
        <div className={`border rounded-xl p-4 ${matchPct >= 95 ? 'bg-emerald-50 border-emerald-200' : matchPct >= 85 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
          <span className={`text-[10px] font-bold block ${matColor(matchPct)}`}>نسبة المطابقة الكلية</span>
          <strong className={`text-lg font-extrabold font-mono ${matColor(matchPct)}`}>{matchPct.toFixed(1)}%</strong>
          <span className={`text-[10px] block ${matColor(matchPct)}`}>{matchStatus}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Printer className="w-4 h-4 text-amber-600" /> تفصيل المواد — نظري × فعلي
            {matchPct < 85 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> انحراف مرتفع
              </span>
            )}
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المادة (كود)</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-center">الوحدة</th>
                <th className="p-2 text-center">النظري كمية</th>
                <th className="p-2 text-center">النظري قيمة</th>
                <th className="p-2 text-center">الفعلي كمية</th>
                <th className="p-2 text-center">الفعلي قيمة</th>
                <th className="p-2 text-center">فرق كمي</th>
                <th className="p-2 text-center">فرق قيمي</th>
                <th className="p-2 text-center">مطابقة %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-blue-50 font-bold">
                <td className="p-2">الإجمالي</td>
                <td className="p-2 text-center text-slate-400">-</td>
                <td className="p-2 text-center text-slate-400">-</td>
                <td className="tnum p-2 text-left">{fmt(totals.theoreticalQty)}</td>
                <td className="tnum p-2 text-left text-blue-700">{fmtMoney(totals.theoreticalValue)}</td>
                <td className="tnum p-2 text-left">{fmt(totals.actualQty)}</td>
                <td className="tnum p-2 text-left text-rose-700">{fmtMoney(totals.actualValue)}</td>
                <td className="tnum p-2 text-left text-slate-400">-</td>
                <td className={`p-2 text-center font-mono font-bold text-lg ${varianceColor(totals.varianceValue)}`}>
                  {totals.varianceValue > 0 ? '+' : ''}{fmtMoney(totals.varianceValue)}
                </td>
                <td className={`p-2 text-center font-mono font-bold ${matColor(totals.matchPct)}`}>{totals.matchPct.toFixed(1)}%</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={r.matId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.nameAr} <span className="text-[10px] text-slate-400 font-mono">({r.code})</span></td>
                  <td className="p-2 text-center text-slate-600">{categories[r.category] || r.category}</td>
                  <td className="p-2 text-center text-slate-500">{r.unit}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmt(r.theoreticalQty)}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(r.theoreticalValue)}</td>
                  <td className="tnum p-2 text-left text-rose-700">{fmt(r.actualQty)}</td>
                  <td className="tnum p-2 text-left text-rose-700">{fmtMoney(r.actualValue)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${varianceColor(r.varianceQty)}`}>
                    {r.varianceQty > 0 ? <TrendingUp className="w-3 h-3 inline ml-1" /> : r.varianceQty < 0 ? <TrendingDown className="w-3 h-3 inline ml-1" /> : null}
                    {r.varianceQty > 0 ? '+' : ''}{fmt(r.varianceQty)}
                  </td>
                  <td className={`p-2 text-center font-mono font-bold ${varianceColor(r.varianceValue)}`}>
                    {r.varianceValue > 0 ? '+' : ''}{fmtMoney(r.varianceValue)}
                  </td>
                  <td className={`p-2 text-center font-mono font-bold ${matColor(r.matchPct)}`}>{r.matchPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">الملخص بالتصنيف</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">التصنيف</th>
                <th className="p-2 text-center">النظري (قيمة)</th>
                <th className="p-2 text-center">الفعلي (قيمة)</th>
                <th className="p-2 text-center">فرق قيمي</th>
                <th className="p-2 text-center">مطابقة %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catSummaries.map((c, i) => (
                <tr key={c.category} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{c.category}</td>
                  <td className="tnum p-2 text-left text-blue-700">{fmtMoney(c.theoreticalValue)}</td>
                  <td className="tnum p-2 text-left text-rose-700">{fmtMoney(c.actualValue)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${varianceColor(c.varianceValue)}`}>
                    {c.varianceValue > 0 ? '+' : ''}{fmtMoney(c.varianceValue)}
                  </td>
                  <td className={`p-2 text-center font-mono font-bold ${matColor(c.matchPct)}`}>{c.matchPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totals.overCount > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> ملاحظة</h4>
          <p className="text-xs text-amber-700">
            {totals.overCount} مادة استهلاكها الفعلي يتجاوز النظري. تحقق من: إغلاق رصيد مطبخ غير مرصود، هالك غير مسجل، تصرفات واجبات، إنتاج أولي تم بدون اعتماد (sub-prep)، أو فروق تسوية.
          </p>
        </Card>
      )}
    </div>
  );
};

export default TheoreticalVsActualReport;