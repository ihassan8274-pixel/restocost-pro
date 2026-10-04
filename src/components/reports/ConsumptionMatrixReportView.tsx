import React, { useMemo, useState } from 'react';
import { CalendarDays, Printer, Download, Filter, ChevronDown, ChevronUp, Package, ChefHat } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, SectionHeader, Field, inputCls } from '../ui';
import { fmt, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtShortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2,'0')}-${MONTH_ABBR[(m || 1) - 1]}`;
};

// تاريخ محلي (وليس UTC) — toISOString ينحرف يوماً في المناطق ذات الإزاحة الموجبة
const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const PERIOD_PRESETS = ['اليوم', 'أمس', 'آخر 7 أيام', 'هذا الأسبوع', 'هذا الشهر'];

export const ConsumptionMatrixReportView: React.FC = () => {
  const {
    posOrders, batchSalesRecords, recipes, rawMaterials, branches, visibleBranchIds,
  } = useApp();

  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setDate(1); return toLocalISO(d); });
  const [toDate, setToDate] = useState(toLocalISO(new Date()));
  const [selectedType, setSelectedType] = useState<'material' | 'recipe'>('material');
  const [unitMode, setUnitMode] = useState<'inventory' | 'purchase'>('inventory');
  const [selectedId, setSelectedId] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  const [recipeQuery, setRecipeQuery] = useState('');
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const periodPreset = (label: string) => {
    const now = new Date();
    if (label === 'اليوم') { setFromDate(toLocalISO(now)); setToDate(toLocalISO(now)); }
    else if (label === 'أمس') { const y = new Date(now); y.setDate(y.getDate()-1); setFromDate(toLocalISO(y)); setToDate(toLocalISO(y)); }
    else if (label === 'آخر 7 أيام') { const s = new Date(now); s.setDate(s.getDate()-6); setFromDate(toLocalISO(s)); setToDate(toLocalISO(now)); }
    else if (label === 'هذا الأسبوع') { const s = new Date(now); s.setDate(s.getDate()-s.getDay()+1); setFromDate(toLocalISO(s)); setToDate(toLocalISO(now)); }
    else if (label === 'هذا الشهر') { const s = new Date(now); s.setDate(1); setFromDate(toLocalISO(s)); setToDate(toLocalISO(now)); }
  };

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  // الفروع الصناعية الداخلية (معامل/مستودع رئيسي) لا تُحتسب في مبيعات الفروع — تُستبعد من الأعمدة
  const INDUSTRIAL_BRANCHES = ['b-1786642762876', 'b-1786642779412', 'b-1786642798276'];
  const matrixBranches = visibleBranches.filter((b) => !INDUSTRIAL_BRANCHES.includes(b.id));

  const selectedMaterial = rawMaterials.find((m) => m.id === selectedId);
  const selectedRecipe = recipes.find((r) => r.id === selectedId);

  const filteredMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase();
    return rawMaterials
      .filter((m) => !q || m.nameAr.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [rawMaterials, materialQuery]);

  const filteredRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    return recipes.filter((r) => r.isActive && (!q || r.nameAr.toLowerCase().includes(q) || r.nameEn.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [recipes, recipeQuery]);
  const menuRecipes = filteredRecipes.filter((r) => r.category !== 'sub_prep');
  const prepRecipes = filteredRecipes.filter((r) => r.category === 'sub_prep');

  const dates = useMemo(() => {
    const result: string[] = [];
    const start = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    const d = new Date(start);
    while (d <= end) {
      result.push(toLocalISO(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [fromDate, toDate]);

  const matrix = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    dates.forEach((d) => {
      result[d] = {};
      matrixBranches.forEach((b) => { result[d][b.id] = 0; });
    });
    if (!selectedId) return result;

    const add = (date: string, branchId: string, v: number) => {
      if (result[date] && result[date][branchId] !== undefined) result[date][branchId] += v;
    };

    const expand = (recipe: typeof recipes[number], qty: number, date: string, branchId: string) => {
      if (selectedType === 'material') {
        recipe.ingredients.forEach((ing) => {
          if (ing.rawMaterialId === selectedId) {
            const factor = 1 + ((ing.wastagePercent || 0) / 100);
            add(date, branchId, ing.quantity * factor * qty);
          }
        });
      }
      (recipe.subPrepIngredients || []).forEach((sp) => {
        if (selectedType === 'recipe' && sp.recipeId === selectedId) add(date, branchId, sp.quantity * qty);
        const spr = recipes.find((x) => x.id === sp.recipeId);
        if (spr) {
          const pieces = Number(spr.yieldPieces) > 0 ? Number(spr.yieldPieces) : (Number(spr.portionSize) > 0 ? Number(spr.portionSize) : 1);
          expand(spr, (sp.quantity * qty) / pieces, date, branchId);
        }
      });
    };

    const processItem = (recipeId: string, qty: number, date: string, branchId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      if (selectedType === 'recipe' && selectedId === recipeId && recipe.category !== 'sub_prep') {
        add(date, branchId, qty);
      }
      expand(recipe, qty, date, branchId);
    };

    posOrders.forEach((o) => {
      if (!dates.includes(o.date)) return;
      o.items.forEach((it) => processItem(it.recipeId, it.quantity, o.date, o.branchId));
    });
    batchSalesRecords.forEach((b) => {
      if (!dates.includes(b.date)) return;
      b.items.forEach((it) => processItem(it.recipeId, it.quantitySold, b.date, b.branchId));
    });

    return result;
  }, [dates, matrixBranches, recipes, posOrders, batchSalesRecords, selectedType, selectedId]);

  const toUnitValue = (raw: number): number => {
    if (selectedType === 'material' && unitMode === 'purchase') {
      const conv = selectedMaterial?.purchaseUnitConversion;
      const perUnit = conv && conv > 0 ? conv : 1; // لم يُعرّف التحويل → 1 وحدة شراء = 1 وحدة مخزون
      return Math.ceil(raw / perUnit); // تقريب لأقرب وحدة شراء للأعلى (2.5 ← 3)
    }
    return raw;
  };

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    matrixBranches.forEach((b) => { totals[b.id] = 0; });
    Object.values(matrix).forEach((row) => matrixBranches.forEach((b) => { totals[b.id] += toUnitValue(row[b.id] || 0); }));
    return totals;
  }, [matrix, matrixBranches, unitMode, selectedType, selectedMaterial]);

  const grandTotal = useMemo(() => Object.values(columnTotals).reduce((s, v) => s + v, 0), [columnTotals]);

  const rowTotals = useMemo(() => {
    const t: Record<string, number> = {};
    dates.forEach((d) => { t[d] = matrixBranches.reduce((s, b) => s + toUnitValue(matrix[d]?.[b.id] || 0), 0); });
    return t;
  }, [dates, matrixBranches, matrix, unitMode, selectedType, selectedMaterial]);

  const hasData = grandTotal > 0;
  const unit = selectedType === 'material'
    ? (unitMode === 'purchase' ? (selectedMaterial?.purchaseUnit || selectedMaterial?.unit || '') : (selectedMaterial?.unit || ''))
    : (selectedRecipe?.portionSize || 'وحدة');
  const itemName = selectedType === 'material'
    ? (selectedMaterial ? `${selectedMaterial.code} — ${selectedMaterial.nameAr}` : '')
    : (selectedRecipe ? `${selectedRecipe.code} — ${selectedRecipe.nameAr}` : '');
  const fmtCell = (v: number) => fmt(v, unitMode === 'purchase' ? 0 : 3);

  const exportCSV = () => {
    const headers = ['التاريخ', ...matrixBranches.map((b) => b.nameAr), 'الإجمالي'];
    const rows: (string | number)[][] = dates.map((d) => [
      fmtShortDate(d),
      ...matrixBranches.map((b) => fmtCell(toUnitValue(matrix[d]?.[b.id] || 0))),
      fmtCell(rowTotals[d] || 0),
    ]);
    rows.push(['الإجمالي', ...matrixBranches.map((b) => fmtCell(columnTotals[b.id] || 0)), fmtCell(grandTotal)]);
    downloadCSV(`استهلاك_يومي_${selectedId || 'all'}_${fromDate}_${toDate}.csv`, headers, rows);
  };

  const printReport = () => {
    const headers = ['التاريخ', ...matrixBranches.map((b) => b.nameAr), 'الإجمالي'];
    const rows: (string | number)[][] = dates.map((d) => [
      fmtShortDate(d),
      ...matrixBranches.map((b) => toUnitValue(matrix[d]?.[b.id] || 0)),
      rowTotals[d] || 0,
    ]);
    rows.push(['الإجمالي', ...matrixBranches.map((b) => columnTotals[b.id] || 0), grandTotal]);

    openPrintWindow({
      title: 'استهلاك يومي مصفوفي (تاريخ × فرع)',
      subtitle: itemName || 'اختر صنفاً أو وصفة',
      meta: [
        ['الفترة', `${fromDate} → ${toDate}`],
        ['عدد الأيام', `${dates.length}`],
        ['عدد الفروع', `${matrixBranches.length}`],
        ['الوحدة', unit],
      ],
      tables: [{ header: headers, rows, dense: true, title: itemName }],
      footer: `تم إنشاؤه في ${new Date().toLocaleString('ar-SA-u-nu-latn')} — RestoCost ERP Pro`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="استهلاك يومي مصفوفي (تاريخ × فرع)" subtitle="يعرض استهلاك صنف أو وصفة تحضيرية بشكل يومي لكل فرع في شكل مصفوفة (جداول متقاطعة)" icon={<CalendarDays className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <Btn onClick={printReport} tone="dark" disabled={!hasData}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn onClick={exportCSV} tone="primary" disabled={!hasData}><Download className="w-4 h-4" /> تصدير CSV</Btn>
        </>} />

      <Card className="p-5">
        <SectionHeader title="اختيار العنصر والفترة" icon={<Filter className="w-5 h-5 text-indigo-500" />} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          {PERIOD_PRESETS.map((label) => (
            <button key={label} onClick={() => periodPreset(label)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
          <Field label="نوع العنصر">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => { setSelectedType('material'); setSelectedId(''); setMaterialQuery(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedType === 'material' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}>
                <Package className="w-3.5 h-3.5" /> صنف
              </button>
              <button onClick={() => { setSelectedType('recipe'); setSelectedId(''); setRecipeQuery(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedType === 'recipe' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'}`}>
                <ChefHat className="w-3.5 h-3.5" /> وصفة
              </button>
            </div>
            <div className="mt-2">
              <p className="text-[10px] text-slate-500 font-bold mb-1">عرض الكمية بـ</p>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => setUnitMode('inventory')} disabled={selectedType === 'recipe'} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${unitMode === 'inventory' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'} ${selectedType === 'recipe' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  وحدة المخزون
                </button>
                <button onClick={() => setUnitMode('purchase')} disabled={selectedType === 'recipe'} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${unitMode === 'purchase' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-200'} ${selectedType === 'recipe' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  وحدة الشراء
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">بوحدة الشراء تُقرَّب الكمية لأقرب وحدة كاملة للأعلى (2.5 ← 3)</p>
            </div>
          </Field>
          {selectedType === 'material' ? (
            <Field label="اختر الصنف (طباعة بالاسم/الكود)">
              <div className="relative">
                <button onClick={() => { setShowMaterialPicker(!showMaterialPicker); if (!showMaterialPicker) setMaterialQuery(selectedMaterial?.code || ''); }} className="w-full text-right p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 flex items-center justify-between text-xs">
                  <span className="truncate">{selectedMaterial ? `${selectedMaterial.code} — ${selectedMaterial.nameAr}` : '— اختر صنفاً —'}</span>
                  <span>{showMaterialPicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                </button>
                {showMaterialPicker && (
                  <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-300 rounded-lg shadow-lg z-20">
                    <div className="p-2 border-b border-slate-100">
                      <input autoFocus value={materialQuery} onChange={(e) => setMaterialQuery(e.target.value)} placeholder="بحث بالاسم أو الكود..." className={`${inputCls} text-xs`} />
                    </div>
                    <div className="max-h-60 overflow-auto p-1">
                      {filteredMaterials.slice(0, 100).map((m) => (
                        <button key={m.id} onClick={() => { setSelectedId(m.id); setShowMaterialPicker(false); }} className={`w-full text-right text-xs p-1.5 rounded hover:bg-indigo-50 block truncate ${m.id === selectedId ? 'bg-indigo-100 font-bold' : ''}`}>
                          {m.code} — {m.nameAr}
                        </button>
                      ))}
                      {filteredMaterials.length === 0 && <p className="text-xs text-slate-400 p-2 text-center">لا توجد نتائج</p>}
                    </div>
                  </div>
                )}
              </div>
            </Field>
          ) : (
            <Field label="اختر الوصفة (نهائية أو تحضيرية)">
              <div className="relative">
                <button onClick={() => { setShowRecipePicker(!showRecipePicker); if (!showRecipePicker) setRecipeQuery(selectedRecipe?.code || ''); }} className="w-full text-right p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 flex items-center justify-between text-xs">
                  <span className="truncate">{selectedRecipe ? `${selectedRecipe.code} — ${selectedRecipe.nameAr}` : '— اختر وصفة —'}</span>
                  <span>{showRecipePicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                </button>
                {showRecipePicker && (
                  <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-300 rounded-lg shadow-lg z-20">
                    <div className="p-2 border-b border-slate-100">
                      <input autoFocus value={recipeQuery} onChange={(e) => setRecipeQuery(e.target.value)} placeholder="بحث بالاسم أو الكود..." className={`${inputCls} text-xs`} />
                    </div>
                    <div className="max-h-60 overflow-auto p-1">
                      {menuRecipes.length > 0 && <>
                        <div className="text-[10px] font-extrabold text-indigo-500 px-1 mb-0.5">وصفات رئيسية ({menuRecipes.length})</div>
                        {menuRecipes.slice(0, 50).map((r) => (
                          <button key={r.id} onClick={() => { setSelectedId(r.id); setShowRecipePicker(false); }} className={`w-full text-right text-xs p-1.5 rounded hover:bg-indigo-50 block truncate ${r.id === selectedId ? 'bg-indigo-100 font-bold' : ''}`}>
                            {r.code} — {r.nameAr}
                          </button>
                        ))}
                      </>}
                      {prepRecipes.length > 0 && <>
                        <div className="text-[10px] font-extrabold text-amber-500 px-1 mt-1 mb-0.5">وصفات تحضيرية ({prepRecipes.length})</div>
                        {prepRecipes.slice(0, 50).map((r) => (
                          <button key={r.id} onClick={() => { setSelectedId(r.id); setShowRecipePicker(false); }} className={`w-full text-right text-xs p-1.5 rounded hover:bg-amber-50 block truncate ${r.id === selectedId ? 'bg-amber-100 font-bold' : ''}`}>
                            {r.code} — {r.nameAr}
                          </button>
                        ))}
                      </>}
                      {menuRecipes.length + prepRecipes.length === 0 && <p className="text-xs text-slate-400 p-2 text-center">لا توجد نتائج</p>}
                    </div>
                  </div>
                )}
              </div>
            </Field>
          )}
        </div>
      </Card>

      {!selectedId && (
        <Card className="p-8 text-center text-slate-400 text-sm">
          <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          اختر صنفاً (مادة خام كالموز) أو وصفة (نهائية أو تحضيرية كـ RCP-SUB-385) لعرض المصفوفة
        </Card>
      )}

      {selectedId && (
        <Card className="p-5 overflow-x-auto">
          <SectionHeader title="المصفوفة اليومية" icon={<CalendarDays className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-3 mb-3 flex items-center gap-3 text-xs">
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg font-bold">{itemName}</span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">{unit}</span>
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-bold">الإجمالي: {fmtCell(grandTotal)}</span>
            <span className="text-slate-400">{dates.length} يوم × {matrixBranches.length} فرع</span>
          </div>
          {dates.length > 0 && matrixBranches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] border-collapse min-w-max">
                <thead>
                  <tr className="bg-indigo-50 border-b-2 border-indigo-200 sticky top-0">
                    <th className="p-2 font-bold text-indigo-800 border-l border-indigo-200 whitespace-nowrap">التاريخ</th>
                    {matrixBranches.map((b) => (
                      <th key={b.id} className="p-2 font-bold text-indigo-800 border-l border-indigo-100 whitespace-nowrap" style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', maxHeight: 120 }}>
                        {b.nameAr}
                      </th>
                    ))}
                    <th className="p-2 font-bold text-indigo-800 bg-indigo-100 whitespace-nowrap">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d, idx) => (
                    <tr key={d} className={`border-b border-slate-100 hover:bg-indigo-50/50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="p-2 font-bold text-indigo-700 border-l border-indigo-100 whitespace-nowrap" dir="ltr">{fmtShortDate(d)}</td>
                      {matrixBranches.map((b) => {
                        const raw = matrix[d]?.[b.id] || 0;
                        const v = toUnitValue(raw);
                        return (
                          <td key={b.id} className={`p-2 border-l border-indigo-50 font-mono whitespace-nowrap ${v > 0 ? 'text-indigo-700 font-bold bg-indigo-50/30' : 'text-slate-300'}`}>
                            {v > 0 ? fmtCell(v) : '—'}
                          </td>
                        );
                      })}
                      <td className="tnum text-left p-2 font-bold bg-indigo-50 border-l border-indigo-100 text-indigo-700 whitespace-nowrap">{fmtCell(rowTotals[d] || 0)}</td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-100 border-t-2 border-indigo-300 font-extrabold">
                    <td className="p-2 border-l border-indigo-200">الإجمالي</td>
                    {matrixBranches.map((b) => (
                      <td key={b.id} className="p-2 border-l border-indigo-200 font-mono whitespace-nowrap">{fmtCell(columnTotals[b.id] || 0)}</td>
                    ))}
                    <td className="tnum text-left p-2 bg-indigo-200 border-l border-indigo-300 whitespace-nowrap">{fmtCell(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-400 text-xs py-4">لا توجد أيام في الفترة المحددة</p>
          )}
        </Card>
      )}
    </div>
  );
};