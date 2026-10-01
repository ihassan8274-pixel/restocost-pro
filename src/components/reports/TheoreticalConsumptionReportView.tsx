import React, { useMemo, useState } from 'react';
import { Calculator, Printer, Download, BarChart2, Filter, ChevronDown, ChevronUp, Search, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Field, inputCls } from '../ui';
import { fmt, fmtMoney, downloadCSV, today, categoryLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const PERIOD_PRESETS = ['اليوم', 'أمس', 'آخر 7 أيام', 'هذا الأسبوع', 'هذا الشهر'];

export const TheoreticalConsumptionReportView: React.FC = () => {
  const {
    posOrders, batchSalesRecords, recipes, rawMaterials, branches, visibleBranchIds,
    getAverageUnitCost, materialCategories,
  } = useApp();

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(today());
  const [branchIds, setBranchIds] = useState<string[]>(visibleBranchIds.filter((id) => id !== 'b-ck'));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [materialQuery, setMaterialQuery] = useState('');
  const [recipeFilterId, setRecipeFilterId] = useState('');
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const periodPreset = (label: string) => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (label === 'اليوم') { setFromDate(iso(now)); setToDate(iso(now)); }
    else if (label === 'أمس') {
      const y = new Date(now); y.setDate(y.getDate() - 1); setFromDate(iso(y)); setToDate(iso(y));
    } else if (label === 'آخر 7 أيام') {
      const s = new Date(now); s.setDate(s.getDate() - 6); setFromDate(iso(s)); setToDate(iso(now));
    } else if (label === 'هذا الأسبوع') {
      const s = new Date(now); s.setDate(s.getDate() - s.getDay() + 1); setFromDate(iso(s)); setToDate(iso(now));
    } else if (label === 'هذا الشهر') {
      const s = new Date(now); s.setDate(1); setFromDate(iso(s)); setToDate(iso(now));
    }
  };

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  const selectedBranches = visibleBranches.filter((b) => branchIds.includes(b.id));
  const inRange = (d: string) => d >= fromDate && d <= toDate;

  const formatDate = (d: string) => d;

  const selectedRecipe = recipes.find((r) => r.id === recipeFilterId);
  const menuRecipes = recipes.filter((r) => r.isActive && r.category !== 'sub_prep').sort((a, b) => a.code.localeCompare(b.code));
  const prepRecipes = recipes.filter((r) => r.isActive && r.category === 'sub_prep').sort((a, b) => a.code.localeCompare(b.code));

  const salesItemsByBranch = useMemo(() => {
    const map: Record<string, { pos: typeof posOrders; batch: typeof batchSalesRecords }> = {};
    selectedBranches.forEach((b) => { map[b.id] = { pos: [], batch: [] }; });
    posOrders.filter((o) => branchIds.includes(o.branchId) && inRange(o.date)).forEach((o) => {
      if (map[o.branchId]) map[o.branchId].pos.push(o);
    });
    batchSalesRecords.filter((b) => branchIds.includes(b.branchId) && inRange(b.date)).forEach((b) => {
      if (map[b.branchId]) map[b.branchId].batch.push(b);
    });
    return map;
  }, [branchIds, fromDate, toDate]);

  const report = useMemo(() => {
    const byBranch: Record<string, { mat: Record<string, number>; prep: Record<string, number> }> = {};
    selectedBranches.forEach((branch) => {
      const mat: Record<string, number> = {};
      const prep: Record<string, number> = {};
      const addMat = (id: string, q: number) => { mat[id] = (mat[id] || 0) + q; };
      const addPrep = (id: string, q: number) => { prep[id] = (prep[id] || 0) + q; };
      // يوّسع الوصفة إلى مواد خام مباشرة + الوصفات التحضيرية المدمجة (subPrepIngredients) بشكل متكرر
      const expand = (recipe: typeof recipes[number], qty: number, capturePrep: boolean) => {
        recipe.ingredients.forEach((ing) => {
          const factor = 1 + ((ing.wastagePercent || 0) / 100);
          addMat(ing.rawMaterialId, ing.quantity * factor * qty);
        });
        (recipe.subPrepIngredients || []).forEach((sp) => {
          if (capturePrep) addPrep(sp.recipeId, sp.quantity * qty);
          const spr = recipes.find((x) => x.id === sp.recipeId);
          if (spr) {
            const pieces = Number(spr.yieldPieces) > 0 ? Number(spr.yieldPieces) : (Number(spr.portionSize) > 0 ? Number(spr.portionSize) : 1);
            expand(spr, (sp.quantity * qty) / pieces, capturePrep);
          }
        });
      };
      const expandItem = (recipeId: string, qty: number) => {
        const r = recipes.find((x) => x.id === recipeId);
        if (r) expand(r, qty, true);
      };

      const sales = salesItemsByBranch[branch.id] || { pos: [], batch: [] };

      if (selectedRecipe && selectedRecipe.category !== 'sub_prep') {
        // وصفة نهائية: نحتسب فقط مبيعات هذه الوصفة نفسها
        sales.pos.forEach((o) => o.items.filter((it) => it.recipeId === recipeFilterId).forEach((it) => expandItem(it.recipeId, it.quantity)));
        sales.batch.forEach((b) => b.items.filter((it) => it.recipeId === recipeFilterId).forEach((it) => expandItem(it.recipeId, it.quantitySold)));
      } else if (selectedRecipe && selectedRecipe.category === 'sub_prep') {
        // وصفة تحضيرية: نجمع كل المبيعات ثم نأخذ كمية الاستهلاك الفعلية للوصفة التحضيرية
        sales.pos.forEach((o) => o.items.forEach((it) => expandItem(it.recipeId, it.quantity)));
        sales.batch.forEach((b) => b.items.forEach((it) => expandItem(it.recipeId, it.quantitySold)));
        const consumedPrep = prep[recipeFilterId] || 0;
        Object.keys(mat).forEach((k) => delete mat[k]);
        Object.keys(prep).forEach((k) => { if (k !== recipeFilterId) delete prep[k]; });
        if (consumedPrep > 0) {
          const r = recipes.find((x) => x.id === recipeFilterId);
          if (r) expand(r, consumedPrep, false);
          prep[recipeFilterId] = consumedPrep;
        } else {
          prep[recipeFilterId] = 0;
        }
      } else {
        // كل المبيعات (بدون فلتر وصفة)
        sales.pos.forEach((o) => o.items.forEach((it) => expandItem(it.recipeId, it.quantity)));
        sales.batch.forEach((b) => b.items.forEach((it) => expandItem(it.recipeId, it.quantitySold)));
      }
      byBranch[branch.id] = { mat, prep };
    });
    return byBranch;
  }, [salesItemsByBranch, recipes, recipeFilterId, selectedRecipe]);

  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(report).forEach((bm) => Object.entries(bm.mat).forEach(([matId, qty]) => { totals[matId] = (totals[matId] || 0) + qty; }));
    return totals;
  }, [report]);

  const branchTotals = useMemo(() => {
    const out: Record<string, number> = {};
    selectedBranches.forEach((b) => {
      out[b.id] = Object.values(report[b.id]?.mat || {}).reduce((s, v) => s + v, 0);
    });
    return out;
  }, [report]);

  const prepTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(report).forEach((bm) => Object.entries(bm.prep).forEach(([id, qty]) => { totals[id] = (totals[id] || 0) + qty; }));
    return totals;
  }, [report]);

  const q = materialQuery.trim().toLowerCase();
  const materialMatches = (m: typeof rawMaterials[number]) =>
    !q || (m.nameAr || '').toLowerCase().includes(q) || (m.nameEn || '').toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q);

  const prepFlow = Object.entries(prepTotals)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ recipe: recipes.find((r) => r.id === id)!, qty }))
    .filter((x) => !!x.recipe)
    .sort((a, b) => b.qty - a.qty);

  const categoryOrder = ['meat_poultry', 'seafood', 'vegetables_fruits', 'dairy_eggs', 'dry_goods', 'oils_sauces', 'packaging', 'beverages'];

  const printReport = () => {
    const tables: { title: string; header: string[]; rows: (string | number)[][] }[] = [];

    selectedBranches.forEach((branch) => {
      const bMap = report[branch.id]?.mat || {};
      const rows: (string | number)[][] = [];
      if (selectedRecipe?.category === 'sub_prep') {
        rows.push([`استهلاك الوصفة التحضيرية ${selectedRecipe.code} — ${selectedRecipe.nameAr}`, '', fmt((report[branch.id]?.prep[selectedRecipe.id] || 0), 3), selectedRecipe.portionSize || 'وحدة', '']);
      }
      categoryOrder.forEach((catKey) => {
        const catLabel = categoryLabel(catKey, materialCategories);
        const catItems = rawMaterials.filter((m) => categoryLabel(m.category, materialCategories) === catLabel && (bMap[m.id] || 0) > 0 && materialMatches(m));
        if (catItems.length === 0) return;
        rows.push([`=== ${catLabel} ===`, '', '', '', '']);
        catItems.forEach((m) => {
          const val = (bMap[m.id] || 0) * getAverageUnitCost(m.id);
          rows.push([`${m.code} - ${m.nameAr}`, m.unit, fmt(bMap[m.id] || 0, 3), fmtMoney(getAverageUnitCost(m.id)), fmtMoney(val)]);
        });
        rows.push(['إجمالي التصنيف', '', fmt(catItems.reduce((s, m) => s + (bMap[m.id] || 0), 0), 3), '', '']);
      });
      tables.push({
        title: branch.nameAr,
        header: ['الصنف', 'الوحدة', 'الكمية النظرية', 'تكلفة الوحدة', 'القيمة'],
        rows,
      });
    });

    // Summary tables
    tables.push({
      title: 'ملخص الفروع',
      header: ['الفرع', 'إجمالي الكمية النظرية'],
      rows: selectedBranches.map((b) => [b.nameAr, fmt(branchTotals[b.id] || 0, 3)]),
    });

    if (prepFlow.length > 0) {
      tables.push({
        title: 'استهلاك الوصفات التحضيرية (من المبيعات)',
        header: ['الكود', 'الوصفة', 'الوحدة', 'إجمالي الكمية المستهلكة'],
        rows: prepFlow.map(({ recipe, qty }) => [recipe.code, recipe.nameAr, recipe.portionSize || 'وحدة', fmt(qty, 3)]),
      });
    }

    tables.push({
      title: 'الإجمالي العام (جميع الفروع)',
      header: ['الصنف', 'التصنيف', 'الوحدة', 'إجمالي الكمية', 'متوسط التكلفة', 'إجمالي القيمة'],
      rows: Object.entries(grandTotals)
        .filter(([matId, qty]) => {
          const m = rawMaterials.find((x) => x.id === matId);
          return qty > 0 && m && materialMatches(m);
        })
        .sort(([, a], [, b]) => b - a)
        .map(([matId, qty]) => {
          const m = rawMaterials.find((x) => x.id === matId)!;
          return [m.nameAr, categoryLabel(m.category, materialCategories), m.unit, fmt(qty, 3), fmtMoney(getAverageUnitCost(matId)), fmtMoney(qty * getAverageUnitCost(matId))];
        }),
    });

    openPrintWindow({
      title: 'تقرير الاستهلاك النظري (المبيعات → المواد الخام)',
      subtitle: `من ${formatDate(fromDate)} إلى ${formatDate(toDate)} — ${selectedBranches.length} فرع`,
      meta: [
        ['الفترة', `${formatDate(fromDate)} → ${formatDate(toDate)}`],
        ['عدد الفروع', `${selectedBranches.length}`],
        ['الأفرع', selectedBranches.map((b) => b.nameAr).join('، ')],
        ['فلتر الوصفة', selectedRecipe ? `${selectedRecipe.code} — ${selectedRecipe.nameAr}` : 'كل الوصفات'],
      ],
      tables,
      footer: `تم إنشاؤه في ${new Date().toLocaleString('ar-SA-u-nu-latn')} — RestoCost ERP Pro`,
    });
  };

  const exportCSV = () => {
    const allRows: (string | number)[][] = [];
    selectedBranches.forEach((branch) => {
      const bMap = report[branch.id]?.mat || {};
      if (selectedRecipe?.category === 'sub_prep') {
        allRows.push([branch.nameAr, selectedRecipe.code, `[استهلاك تحضيري] ${selectedRecipe.nameAr}`, 'تحضير مسبق', selectedRecipe.portionSize || 'وحدة', fmt(report[branch.id]?.prep[selectedRecipe.id] || 0, 3), '', '']);
      }
      rawMaterials.filter((m) => (bMap[m.id] || 0) > 0 && materialMatches(m)).forEach((m) => {
        allRows.push([branch.nameAr, m.code, m.nameAr, categoryLabel(m.category, materialCategories), m.unit, fmt(bMap[m.id] || 0, 3), getAverageUnitCost(m.id), fmtMoney((bMap[m.id] || 0) * getAverageUnitCost(m.id))]);
      });
    });
    downloadCSV(`الاستهلاك_النظري_${fromDate}_${toDate}.csv`, ['الفرع', 'الكود', 'الصنف', 'التصنيف', 'الوحدة', 'الكمية النظرية', 'تكلفة الوحدة', 'القيمة'], allRows);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تقرير الاستهلاك النظري (المبيعات → المواد الخام)" subtitle="إجمالي الأصناف المباعة لكل فرع محولة إلى كميات مواد خام/وصفات تحضيرية وفق الوصفات القياسية" icon={<Calculator className="w-6 h-6 text-indigo-300" />}
        actions={
          <>
            <Btn onClick={printReport} tone="dark"><Printer className="w-4 h-4" /> طباعة</Btn>
            <Btn onClick={exportCSV} tone="primary"><Download className="w-4 h-4" /> تصدير CSV</Btn>
          </>
        } />

      <Card className="p-5">
        <SectionHeader title="المرشحات" icon={<Filter className="w-5 h-5 text-indigo-500" />} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          {PERIOD_PRESETS.map((label) => (
            <button key={label} onClick={() => periodPreset(label)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
          <Field label="صنف (بحث بالاسم أو الكود)">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input value={materialQuery} onChange={(e) => setMaterialQuery(e.target.value)} placeholder="مثال: موز، كاجو..." className={`${inputCls} pr-9`} />
            </div>
          </Field>
          <Field label="الأفرع">
            <div className="relative">
              <button onClick={() => setShowBranchPicker(!showBranchPicker)} className="w-full text-right p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 flex items-center justify-between">
                <span>{branchIds.length === visibleBranches.length ? 'كل الفروع' : `${branchIds.length} فرع محدد`}</span>
                <span>{showBranchPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
              </button>
              {showBranchPicker && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-300 rounded-lg shadow-lg p-2 z-20 max-h-60 overflow-auto">
                  <label className="flex items-center gap-2 text-xs p-1 hover:bg-slate-50 rounded cursor-pointer">
                    <input type="checkbox" checked={branchIds.length === visibleBranches.length} onChange={(e) => setBranchIds(e.target.checked ? visibleBranches.map((b) => b.id) : [])} className="w-4 h-4" />
                    <span>اختيار الكل</span>
                  </label>
                  <hr className="my-1" />
                  {visibleBranches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs p-1 hover:bg-slate-50 rounded cursor-pointer">
                      <input type="checkbox" checked={branchIds.includes(b.id)} onChange={(e) => setBranchIds(e.target.checked ? [...branchIds, b.id] : branchIds.filter((id) => id !== b.id))} className="w-4 h-4" />
                      <span>{b.nameAr}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="وصفة (نهائية أو تحضيرية)">
            <div className="relative">
              <button onClick={() => setShowRecipePicker(!showRecipePicker)} className="w-full text-right p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 flex items-center justify-between">
                <span className="truncate">{selectedRecipe ? `${selectedRecipe.code} — ${selectedRecipe.nameAr}` : 'كل الوصفات'}</span>
                <span>{showRecipePicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
              </button>
              {showRecipePicker && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-300 rounded-lg shadow-lg p-2 z-20 max-h-72 overflow-auto">
                  <button onClick={() => { setRecipeFilterId(''); setShowRecipePicker(false); }} className="w-full text-right text-xs p-1.5 rounded hover:bg-indigo-50 font-bold text-indigo-600">
                    كل الوصفات
                  </button>
                  <div className="text-[10px] font-extrabold text-slate-400 mt-1 mb-0.5 px-1">الوصفات الرئيسية ({menuRecipes.length})</div>
                  {menuRecipes.map((r) => (
                    <button key={r.id} onClick={() => { setRecipeFilterId(r.id); setShowRecipePicker(false); }} className="w-full text-right text-xs p-1.5 rounded hover:bg-indigo-50 block truncate">
                      {r.code} — {r.nameAr}
                    </button>
                  ))}
                  <div className="text-[10px] font-extrabold text-amber-500 mt-2 mb-0.5 px-1">وصفات تحضيرية ({prepRecipes.length})</div>
                  {prepRecipes.map((r) => (
                    <button key={r.id} onClick={() => { setRecipeFilterId(r.id); setShowRecipePicker(false); }} className="w-full text-right text-xs p-1.5 rounded hover:bg-amber-50 block truncate">
                      {r.code} — {r.nameAr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="تفصيل الاستهلاك النظري لكل فرع" icon={<BarChart2 className="w-5 h-5 text-indigo-500" />} />
        {selectedBranches.length === 0 ? (
          <p className="text-center text-slate-500 py-8">اختر فرعًا واحدًا على الأقل</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            {selectedBranches.map((branch) => {
              const bMap = report[branch.id]?.mat || {};
              const bPrep = report[branch.id]?.prep || {};
              const isCollapsed = collapsed[branch.id];
              const prepQty = selectedRecipe?.category === 'sub_prep' ? (bPrep[selectedRecipe.id] || 0) : 0;
              return (
                <div key={branch.id} className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => setCollapsed({ ...collapsed, [branch.id]: !isCollapsed })} className="w-full p-4 bg-indigo-50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span>{isCollapsed ? <ChevronDown className="w-5 h-5 text-indigo-600" /> : <ChevronUp className="w-5 h-5 text-indigo-600" />}</span>
                      <div>
                        <div className="font-bold text-indigo-800">{branch.nameAr}</div>
                        <div className="text-xs text-indigo-600">
                          إجمالي الكمية النظرية: {fmt(branchTotals[branch.id] || 0, 3)}
                          {selectedRecipe?.category === 'sub_prep' && (
                            <span className="ml-3 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg font-bold">
                              {selectedRecipe.code}: {fmt(prepQty, 3)} {selectedRecipe.portionSize || 'وحدة'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="p-4 divide-y divide-slate-100">
                      {selectedRecipe?.category === 'sub_prep' && (
                        <div className="py-2 mb-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="font-bold text-amber-800 text-sm">الوصفة التحضيرية {selectedRecipe.code} — {selectedRecipe.nameAr}</div>
                          <div className="text-xs text-amber-700 mt-1">
                            إجمالي الكمية المستهلكة في هذا الفرع: <b>{fmt(prepQty, 3)} {selectedRecipe.portionSize || 'وحدة'}</b>
                            {(bMap[selectedRecipe.id] || 0) > 0 && <span> — والتالي هو المواد الخام اللازمة لتلك الكمية:</span>}
                          </div>
                        </div>
                      )}
                      {categoryOrder.map((catKey) => {
                        const catLabel = categoryLabel(catKey, materialCategories);
                        const catItems = rawMaterials.filter((m) => categoryLabel(m.category, materialCategories) === catLabel && (bMap[m.id] || 0) > 0 && materialMatches(m));
                        if (catItems.length === 0) return null;
                        return (
                          <div key={catKey} className="py-2">
                            <div className="font-bold text-indigo-700 text-sm mb-1">{catLabel}</div>
                            {catItems.map((m) => (
                              <div key={m.id} className="flex items-center justify-between py-1 text-xs">
                                <span className="flex-1 pr-2">{m.code} - {m.nameAr}</span>
                                <span className="font-mono font-bold text-indigo-700 w-20 text-left">{fmt(bMap[m.id] || 0, 3)}</span>
                                <span className="text-slate-500 w-16 text-left">{m.unit}</span>
                                <span className="font-mono text-slate-600 w-24 text-left">{fmtMoney(getAverageUnitCost(m.id))}</span>
                                <span className="font-mono font-bold text-indigo-700 w-24 text-left">{fmtMoney((bMap[m.id] || 0) * getAverageUnitCost(m.id))}</span>
                              </div>
                            ))}
                            <div className="border-t border-slate-200 pt-1 mt-1 flex items-center justify-between text-xs font-bold">
                              <span>إجمالي التصنيف</span>
                              <span className="font-mono text-indigo-700">{fmt(catItems.reduce((s, m) => s + (bMap[m.id] || 0), 0), 3)}</span>
                            </div>
                          </div>
                        );
                      })}
                      {Object.keys(bMap).filter((id) => (bMap[id] || 0) > 0 && materialMatches(rawMaterials.find((x) => x.id === id)!)).length === 0 && (
                        <p className="text-center text-slate-400 text-xs py-4">لا استهلاك مطابق للمرشحات في هذا الفرع خلال الفترة المحددة</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {prepFlow.length > 0 && (
          <div className="mt-6 pt-4 border-t-2 border-amber-200">
            <SectionHeader title="استهلاك الوصفات التحضيرية (من المبيعات)" icon={<Calculator className="w-5 h-5 text-amber-600" />} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-amber-50 border-b-2 border-amber-200">
                    <th className="p-2 font-bold">الكود</th>
                    <th className="p-2 font-bold">الوصفة التحضيرية</th>
                    <th className="p-2 font-bold">الوحدة</th>
                    <th className="p-2 font-bold">إجمالي الكمية المستهلكة</th>
                    <th className="p-2 font-bold">المواد الخام المطلوبة</th>
                  </tr>
                </thead>
                <tbody>
                  {prepFlow.map(({ recipe, qty }) => {
                    const matCount = (() => {
                      const c: Record<string, number> = {};
                      const walk = (r: typeof recipe, q: number) => {
                        r.ingredients.forEach((ing) => { c[ing.rawMaterialId] = (c[ing.rawMaterialId] || 0) + ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * q; });
                        (r.subPrepIngredients || []).forEach((sp) => {
                          const sr = recipes.find((x) => x.id === sp.recipeId);
                          if (sr) walk(sr, sp.quantity * q);
                        });
                      };
                      walk(recipe, qty);
                      return Object.keys(c).length;
                    })();
                    return (
                      <tr key={recipe.id} className={`border-b border-slate-100 hover:bg-slate-50 ${selectedRecipe?.id === recipe.id ? 'bg-amber-100/50 font-bold' : ''}`}>
                        <td className="p-2 font-mono font-bold text-amber-700">{recipe.code}</td>
                        <td className="p-2">{recipe.nameAr}</td>
                        <td className="p-2 text-slate-600">{recipe.portionSize || 'وحدة'}</td>
                        <td className="p-2 font-mono font-bold text-amber-700">{fmt(qty, 3)}</td>
                        <td className="p-2 text-slate-500 text-[10px]">{matCount} مادة خام</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t-2 border-indigo-200">
          <SectionHeader title="الإجمالي العام (جميع الفروع)" icon={<Calculator className="w-5 h-5 text-emerald-500" />} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-50 border-b-2 border-emerald-200">
                  <th className="p-2 font-bold">الصنف</th>
                  <th className="p-2 font-bold">التصنيف</th>
                  <th className="p-2 font-bold">الوحدة</th>
                  <th className="p-2 font-bold">إجمالي الكمية</th>
                  <th className="p-2 font-bold">متوسط التكلفة</th>
                  <th className="p-2 font-bold">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grandTotals)
                  .filter(([matId, qty]) => {
                    const m = rawMaterials.find((x) => x.id === matId);
                    return qty > 0 && m && materialMatches(m);
                  })
                  .sort(([, a], [, b]) => b - a)
                  .map(([matId, qty]) => {
                    const m = rawMaterials.find((x) => x.id === matId)!;
                    return (
                      <tr key={matId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 font-bold">{m.nameAr}</td>
                        <td className="p-2 text-slate-600 text-[10px]">{categoryLabel(m.category, materialCategories)}</td>
                        <td className="p-2">{m.unit}</td>
                        <td className="p-2 font-mono font-bold text-emerald-700">{fmt(qty, 3)}</td>
                        <td className="p-2 font-mono">{fmtMoney(getAverageUnitCost(matId))}</td>
                        <td className="p-2 font-mono font-bold text-emerald-700">{fmtMoney(qty * getAverageUnitCost(matId))}</td>
                      </tr>
                    );
                  })}
                <tr className="bg-emerald-50 font-extrabold border-t-2 border-emerald-200">
                  <td className="p-2" colSpan={3}>الإجمالي</td>
                  <td className="p-2 font-mono">{fmt(Object.values(grandTotals).reduce((s, v) => s + v, 0), 3)}</td>
                  <td className="p-2">—</td>
                  <td className="p-2 font-mono">{fmtMoney(Object.entries(grandTotals).reduce((s, [id, q]) => s + q * getAverageUnitCost(id), 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};