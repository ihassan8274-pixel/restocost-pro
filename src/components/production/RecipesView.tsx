import React, { useState, useMemo } from 'react';
import { ChefHat, Plus, Pencil, Target, Printer, Trash2, FileSpreadsheet, X, Copy, Clock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, TabBar, AutocompleteSelect, DocumentFingerprint } from '../ui';
import { fmt, downloadCSV, navOnEnter, netOfGross } from '../../utils/helpers';
import { tradeUnitPrice } from '../../business/units';
import { openPrintWindow, type PrintCard, type PrintTable } from '../../utils/print';
import { exportStyledReport, styledSheetModel, excelSheetName, type ExcelCellValue, type ExcelFormula, type StyledReportSheet, type StyledReportTable } from '../../utils/excel';
import { RecipeIngredient, SubPrepIngredient, StandardRecipe } from '../../types';

type StandardRecipeCategory = StandardRecipe['category'];
import { ViewToolbar } from '../ui/ViewToolbar';

// التكلفة المستهدفة في كامل النظام: 28% من سعر البيع الصافي
const TARGET_FC_PCT = 28;
const VAT_RATE = 0.15;

// تنسيقات Excel وتقريب مشتركة لهذا المكوّن
const MONEY_FMT = '#,##0.00';
const PCT_FMT = '0.00"%"';
const round2 = (n: number) => Number(n.toFixed(2));

// السعر المقترح (شامل ضريبة) للوصول إلى نسبة التكلفة الإجمالية 28% — يُقرَّب لأعلى رقم صحيح
const suggestedForTarget = (baseCost: number) => {
  if (!(baseCost > 0)) return { gross: 0, net: 0 };
  const gross = Math.ceil((baseCost / (TARGET_FC_PCT / 100)) * (1 + VAT_RATE));
  return { gross, net: netOfGross(gross) };
};

// السعر الفعّال: إذا كانت نسبة التكلفة الإجمالية الحالية ≤ الهدف (28%) فلن يُقترح سعر جديد — نُبقي السعر الحالي
const effectiveSugg = (gross: number, totalCostPct: number, totalCost: number) => {
  if (gross > 0 && totalCostPct <= TARGET_FC_PCT) return { gross, net: netOfGross(gross) };
  return suggestedForTarget(totalCost);
};

const CATEGORY_OPTIONS: { id: StandardRecipeCategory; label: string }[] = [
  { id: 'main_dish', label: 'طبق رئيسي' },
  { id: 'appetizer', label: 'مقبلات' },
  { id: 'beverage', label: 'مشروبات' },
  { id: 'dessert', label: 'حلويات' },
  { id: 'sub_prep', label: 'تحضير مسبق' },
];

const categoryLabel = (cat: string) => CATEGORY_OPTIONS.find((c) => c.id === cat)?.label || cat;

// أقسام جاهزة لكل تصنيف — تُقترح عند إضافة/تعديل وصفة (يمكن كتابة قسم مخصص أيضاً)
const SECTION_PRESETS: Record<StandardRecipeCategory, string[]> = {
  main_dish: ['مشويات وشوي', 'تجهيز مسبق للخضار أو غير', 'الأطباق الرئيسية الأخرى'],
  appetizer: ['مقبلات باردة', 'سلطات', 'مقبلات ساخنة'],
  beverage: ['مشروبات ساخنة', 'مشروبات باردة', 'عصائر طازجة'],
  dessert: ['حلويات باردة', 'حلويات ساخنة'],
  sub_prep: [],
};

// ترتيب التصنيفات كما معرّفة بالأعلى
const CATEGORY_ORDER = CATEGORY_OPTIONS.map((c) => c.id);

type WhereUsedHit = { recipe: StandardRecipe; type: 'direct' | 'indirect'; quantity: number; subPrepName?: string; totalSold: number; consumedQty: number; consumedValue: number };

export const RecipesView: React.FC = () => {
  const { recipes, rawMaterials, globalTargetMarginPercent, updateRecipeTargetMargin, addRecipe, updateRecipe, deleteRecipe, calculateRecipeCosts, getAverageUnitCost, posOrders, batchSalesRecords, posReturns, addRecentDoc } = useApp();
  const [tab, setTab] = useState<'bom' | 'alerts' | 'where-used' | 'cost-report'>('bom');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // نسخ وصفة مع فرق التكلفة قبل/بعد واعتماد مرن (بند 39)
  const [copySource, setCopySource] = useState<StandardRecipe | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyMult, setCopyMult] = useState(1);
  const [copyDraft, setCopyDraft] = useState(false);
  const [copyNote, setCopyNote] = useState('');
  const [whereUsedMaterialId, setWhereUsedMaterialId] = useState('');
  const [wuFromDate, setWuFromDate] = useState('');
  const [wuToDate, setWuToDate] = useState('');
  const prepRecipes = recipes.filter((r) => r.isCentralKitchenPrep || r.category === 'sub_prep');
  const wuMat = rawMaterials.find((m) => m.id === whereUsedMaterialId);
  const wuUnitCost = wuMat ? getAverageUnitCost(wuMat.id) : 0;

  // تحديد متعدد للعمليات الجماعية (طباعة / Excel)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedRecipes = recipes.filter((r) => selectedIds.has(r.id));
  const selectedCount = selectedRecipes.length;

  // تصنيفات تقرير التكلفة — افتراضياً الكل
  const [reportCats, setReportCats] = useState<Set<StandardRecipeCategory>>(new Set(CATEGORY_OPTIONS.map((c) => c.id)));
  const allCatsSelected = CATEGORY_OPTIONS.every((c) => reportCats.has(c.id));
  const toggleCat = (c: StandardRecipeCategory) => setReportCats((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  const [form, setForm] = useState({
    nameAr: '', nameEn: '', category: 'main_dish' as StandardRecipeCategory, section: '', portionSize: '', yieldPieces: 1, prepTimeMins: 15,
    directLaborCost: 0, packagingCost: 0, actualMenuPrice: 0, isCentralKitchenPrep: false, isActive: true,
    targetMarginPercent: globalTargetMarginPercent, ingredients: [] as RecipeIngredient[],
    subPrepIngredients: [] as SubPrepIngredient[],
  });

  const whereUsedResults = useMemo<WhereUsedHit[]>(() => {
    if (!whereUsedMaterialId) return [];
    const inWuDate = (d: string) => (!wuFromDate || d >= wuFromDate) && (!wuToDate || d <= wuToDate);
    const soldByRecipe = new Map<string, number>();
    posOrders.forEach((o) => {
      if (!inWuDate(o.date)) return;
      o.items.forEach((i) => soldByRecipe.set(i.recipeId, (soldByRecipe.get(i.recipeId) || 0) + i.quantity));
    });
    batchSalesRecords.forEach((b) => {
      if (!inWuDate(b.date)) return;
      b.items.forEach((i) => soldByRecipe.set(i.recipeId, (soldByRecipe.get(i.recipeId) || 0) + i.quantitySold));
    });
    posReturns.forEach((r) => {
      if (!inWuDate(r.date)) return;
      r.items.forEach((i) => soldByRecipe.set(i.recipeId, (soldByRecipe.get(i.recipeId) || 0) - i.quantity));
    });
    const hits: WhereUsedHit[] = [];
    const seen = new Set<string>();
    recipes.forEach((r) => {
      const ing = r.ingredients.find((i) => i.rawMaterialId === whereUsedMaterialId);
      if (!ing) return;
      const sold = soldByRecipe.get(r.id) || 0;
      const factor = 1 + (ing.wastagePercent || 0) / 100;
      const consumed = Math.max(0, sold * ing.quantity * factor);
      hits.push({ recipe: r, type: 'direct', quantity: ing.quantity, totalSold: sold, consumedQty: consumed, consumedValue: consumed * wuUnitCost });
      seen.add(r.id);
    });
    const subIds = recipes.filter((r) => r.isCentralKitchenPrep && r.ingredients.some((i) => i.rawMaterialId === whereUsedMaterialId)).map((r) => r.id);
    if (subIds.length) {
      recipes.forEach((r) => {
        if (seen.has(r.id)) return;
        const sp = r.subPrepIngredients?.find((s) => subIds.includes(s.recipeId));
        if (!sp) return;
        const subRecipe = recipes.find((x) => x.id === sp.recipeId);
        if (!subRecipe) return;
        const subIng = subRecipe.ingredients.find((i) => i.rawMaterialId === whereUsedMaterialId);
        if (!subIng) return;
        const yieldPieces = Number(subRecipe.yieldPieces) > 0 ? Number(subRecipe.yieldPieces) : (Number(subRecipe.portionSize) > 0 ? Number(subRecipe.portionSize) : 1);
        const rawPerSubPortion = subIng.quantity / yieldPieces;
        const rawPerRecipePortion = rawPerSubPortion * sp.quantity;
        const sold = soldByRecipe.get(r.id) || 0;
        const consumed = Math.max(0, sold * rawPerRecipePortion);
        hits.push({ recipe: r, type: 'indirect', quantity: rawPerRecipePortion, subPrepName: subRecipe.nameAr, totalSold: sold, consumedQty: consumed, consumedValue: consumed * wuUnitCost });
        seen.add(r.id);
      });
    }
    return hits;
  }, [recipes, rawMaterials, whereUsedMaterialId, wuFromDate, wuToDate, posOrders, batchSalesRecords, posReturns, getAverageUnitCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const printWhereUsed = () => {
    if (!wuMat || !whereUsedResults.length) return;
    const totalSold = whereUsedResults.reduce((s, r) => s + r.totalSold, 0);
    const totalConsumed = whereUsedResults.reduce((s, r) => s + r.consumedQty, 0);
    const totalValue = whereUsedResults.reduce((s, r) => s + r.consumedValue, 0);
    openPrintWindow({
      title: `تحليل استخدام «${wuMat.nameAr}» في المبيعات`,
      meta: [
        ['المادة الخام', wuMat.nameAr], ['الكود', wuMat.code], ['الوحدة', wuMat.unit],
        ['تكلفة الوحدة', fmt(wuUnitCost, 2)], ['عدد الوصفات', `${whereUsedResults.length}`],
        ['الفترة', wuFromDate || wuToDate ? `${wuFromDate || 'البداية'} إلى ${wuToDate || 'اليوم'}` : 'كل الفترات'],
      ],
      tables: [{
        title: `استهلاك «${wuMat.nameAr}» في المبيعات`,
        header: ['#', 'الوصفة', 'التصنيف', 'النوع', `${wuMat.unit}/حصة`, 'إجمالي المبيعات (حصة)', `الكمية المستهلكة (${wuMat.unit})`, 'القيمة'],
        rows: whereUsedResults.map((r, i) => [
          i + 1, r.recipe.nameAr, categoryLabel(r.recipe.category),
          r.type === 'direct' ? 'مباشر' : `عبر: ${r.subPrepName || '—'}`,
          fmt(r.quantity, 3), r.totalSold, fmt(r.consumedQty, 3), fmt(r.consumedValue, 2),
        ]),
      }],
      totals: [
        ['إجمالي المبيعات (حصة)', `${totalSold}`],
        ['إجمالي الكمية المستهلكة', `${fmt(totalConsumed, 3)} ${wuMat.unit}`],
        ['إجمالي القيمة', `${fmt(totalValue, 2)} ر.س`],
      ],
      footer: 'تحليل استخدام الصنف في المبيعات — RestoCost ERP',
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ nameAr: '', nameEn: '', category: 'main_dish', section: '', portionSize: '', yieldPieces: 1, prepTimeMins: 15, directLaborCost: 0, packagingCost: 0, actualMenuPrice: 0, isCentralKitchenPrep: false, isActive: true, targetMarginPercent: globalTargetMarginPercent, ingredients: [], subPrepIngredients: [] });
    setShowModal(true);
  };

  const openEdit = (r: StandardRecipe) => {
    setEditingId(r.id);
    setForm({ nameAr: r.nameAr, nameEn: r.nameEn, category: r.category, section: r.section || '', portionSize: r.portionSize, yieldPieces: r.yieldPieces || 1, prepTimeMins: r.prepTimeMins, directLaborCost: r.directLaborCost, packagingCost: r.packagingCost, actualMenuPrice: r.actualMenuPrice, isCentralKitchenPrep: r.isCentralKitchenPrep, isActive: r.isActive, targetMarginPercent: r.targetMarginPercent ?? globalTargetMarginPercent, ingredients: r.ingredients, subPrepIngredients: r.subPrepIngredients || [] });
    setShowModal(true);
  };

  const addIngredient = () => {
    const mat = rawMaterials[0];
    if (!mat) return;
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, { rawMaterialId: mat.id, quantity: 0, wastagePercent: 0 }] }));
  };

  const updateIngredient = (idx: number, patch: Partial<RecipeIngredient>) => setForm((f) => ({ ...f, ingredients: f.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr || form.ingredients.length === 0) return;
    if (editingId) updateRecipe(editingId, form);
    else addRecipe(form);
    addRecentDoc({ type: 'recipe', title: form.nameAr, tab: 'recipes' }, editingId || undefined);
    setShowModal(false);
  };

  const liveCosts = calculateRecipeCosts(form.ingredients, form.directLaborCost, form.packagingCost, form.subPrepIngredients, form.yieldPieces);
  const liveSugg = suggestedForTarget(liveCosts.totalCost);

  // فتح نافذة نسخ الوصفة (بند 39): اعتماد مباشر أو مسودة + فرق التكلفة قبل/بعد
  const openCopy = (r: StandardRecipe) => {
    setCopySource(r);
    setCopyName(`نسخة من ${r.nameAr}`);
    setCopyMult(1);
    setCopyDraft(r.isCentralKitchenPrep);
    setCopyNote('');
  };

  const rnd = (n: number, d = 2) => { const f = Math.pow(10, d); return Math.round(n * f) / f; };

  const copyScaledIngredients = copySource ? copySource.ingredients.map((ing) => ({ ...ing, quantity: rnd(ing.quantity * copyMult, 3) })) : [];
  const copyScaledSub = copySource ? (copySource.subPrepIngredients || []).map((sp) => ({ ...sp, quantity: rnd(sp.quantity * copyMult, 3) })) : [];
  const copyOrigCosts = copySource ? calculateRecipeCosts(copySource.ingredients, copySource.directLaborCost, copySource.packagingCost, copySource.subPrepIngredients, copySource.yieldPieces) : null;
  const copyNewCosts = copySource ? calculateRecipeCosts(copyScaledIngredients, copySource.directLaborCost * copyMult, copySource.packagingCost * copyMult, copyScaledSub, copySource.yieldPieces) : null;
  const copyDelta = copyNewCosts && copyOrigCosts ? copyNewCosts.totalCost - copyOrigCosts.totalCost : 0;

  const confirmCopy = () => {
    if (!copySource || !copyName.trim() || copyMult <= 0) return;
    addRecipe({
      nameAr: copyName.trim(),
      nameEn: copySource.nameEn ? `Copy of ${copySource.nameEn}` : '',
      category: copySource.category,
      section: copySource.section || '',
      portionSize: copySource.portionSize,
      yieldPieces: copySource.yieldPieces || 1,
      prepTimeMins: copySource.prepTimeMins,
      directLaborCost: copySource.directLaborCost,
      packagingCost: copySource.packagingCost,
      actualMenuPrice: copyDraft ? 0 : copySource.actualMenuPrice,
      isCentralKitchenPrep: copySource.isCentralKitchenPrep,
      isActive: !copyDraft,
      targetMarginPercent: copySource.targetMarginPercent ?? globalTargetMarginPercent,
      targetFoodCostPercent: copySource.targetFoodCostPercent,
      ingredients: copyScaledIngredients,
      subPrepIngredients: copyScaledSub.length ? copyScaledSub : undefined,
      description: [`نسخة من «${copySource.nameAr}» (معامل ${copyMult.toLocaleString('ar-EG')})`, copyDraft ? 'مسودة بانتظار الاعتماد' : '', copyNote.trim()].filter(Boolean).join(' — '),
    });
    setCopySource(null);
  };

  // أقسام مقترحة للحقل: قوالب التصنيف الحالي + الأقسام المستخدمة فعلياً في الوصفات
  const sectionOptions = Array.from(new Set([
    ...(SECTION_PRESETS[form.category] || []),
    ...recipes.map((r) => r.section?.trim()).filter((s): s is string => !!s),
  ]));

  // تكلفة المكون مطابقة لمحرك computeRecipeCosts (متوسط التكلفة لوحدة المخزون + معامل التحويل + عامل الإنتاجية)
  const ingredientUnitCost = (rawMaterialId: string) => {
    const mat = rawMaterials.find((x) => x.id === rawMaterialId);
    const unitCost = tradeUnitPrice(mat, getAverageUnitCost(rawMaterialId));
    const yieldFactor = mat && mat.yieldPercentage ? mat.yieldPercentage / 100 : 1;
    return unitCost / yieldFactor;
  };
  const ingredientCost = (ing: RecipeIngredient) => ing.quantity * ingredientUnitCost(ing.rawMaterialId) * (1 + (ing.wastagePercent || 0) / 100);
  const subPrepItemCost = (sp: SubPrepIngredient) => {
    const sub = recipes.find((x) => x.id === sp.recipeId);
    if (!sub) return 0;
    const subTotal = calculateRecipeCosts(sub.ingredients, sub.directLaborCost, sub.packagingCost, sub.subPrepIngredients, sub.yieldPieces).totalCost;
    const pieces = (Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces) : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1));
    return sp.quantity * (subTotal / pieces);
  };

  // ====== بطاقة وصفة موحّدة (تستخدم للطباعة الفردية والجماعية) ======
  const buildRecipeCard = (r: StandardRecipe) => {
    const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
    const grossPrice = r.actualMenuPrice || 0;
    const netPrice = grossPrice ? netOfGross(grossPrice) : 0;
    const fcPct = netPrice ? (costs.foodCost / netPrice) * 100 : 0;
    const margin = netPrice ? ((netPrice - costs.totalCost) / netPrice) * 100 : 0;
    const targetMargin = r.targetMarginPercent ?? globalTargetMarginPercent;
    // السعر المقترح على أساس التكلفة الإجمالية (خامات + تحضيرات + تغليف + عمالة)
    const totalCostPctOfNet = netPrice ? (costs.totalCost / netPrice) * 100 : 0;
    // إلا إذا كانت النسبة الحالية ≤ الهدف فنُبقي السعر الحالي دون اقتراح جديد
    const sugg = effectiveSugg(grossPrice, totalCostPctOfNet, costs.totalCost);

    const tables: PrintTable[] = [
      {
        title: 'المكونات (BOM)',
        dense: true,
        header: ['#', 'المكون', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الهدر %', 'التكلفة'],
        rows: r.ingredients.map((ing, i) => {
          const m = rawMaterials.find((x) => x.id === ing.rawMaterialId);
          const ingUnit = m && m.tradeUomName && m.tradeUomName.trim() ? m.tradeUomName : m?.unit || '';
          return [i + 1, m?.nameAr || ing.rawMaterialId, ing.quantity, ingUnit, fmt(ingredientUnitCost(ing.rawMaterialId), 2), `${ing.wastagePercent}%`, fmt(ingredientCost(ing), 2)];
        }),
      },
    ];
    if (r.subPrepIngredients?.length) {
      tables.push({
        title: 'التحضيرات الأساسية المستهلكة',
        dense: true,
        header: ['التحضير', 'الكمية', 'عدد القطع (الدفعة)', 'التكلفة'],
        rows: r.subPrepIngredients.map((sp) => {
          const sub = recipes.find((x) => x.id === sp.recipeId);
          const pieces = sub ? (Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces) : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1)) : 1;
          return [sub?.nameAr || sp.recipeId, sp.quantity, sub ? `${pieces} قطعة` : '—', fmt(subPrepItemCost(sp), 2)];
        }),
      });
    }
    tables.push({
      title: 'ملخص التكلفة',
      dense: true,
      header: ['البند', 'القيمة', 'النسبة %'],
      rows: [
        ['تكلفة الطعام (المكونات + الهدر)', fmt(costs.foodCost - costs.subPrepCost, 2), costs.totalCost ? `${((costs.foodCost - costs.subPrepCost) / costs.totalCost * 100).toFixed(1)}%` : '—'],
        ['التحضيرات الأساسية المستهلكة', fmt(costs.subPrepCost, 2), costs.totalCost ? `${(costs.subPrepCost / costs.totalCost * 100).toFixed(1)}%` : '—'],
        ['التغليف', fmt(r.packagingCost, 2), costs.totalCost ? `${(r.packagingCost / costs.totalCost * 100).toFixed(1)}%` : '—'],
        ['التكلفة الإجمالية للوصفة', fmt(costs.totalCost, 2), '100%'],
        [`التكلفة للقطعة الواحدة (÷ ${r.yieldPieces || 1} قطعة)`, fmt(costs.pieceCost, 2), '—'],
        ['سعر المنيو (شامل ضريبة)', grossPrice ? fmt(grossPrice, 2) : 'غير محدد', '—'],
        ['سعر المنيو (صافي)', netPrice ? fmt(netPrice, 2) : '—', '—'],
      ],
    });

    const suggestedPriceInfo = grossPrice && totalCostPctOfNet > TARGET_FC_PCT
      ? `السعر الحالي ${fmt(grossPrice, 0)} ر.س → المقترح ${fmt(sugg.gross, 0)} ر.س (شامل ضريبة) للوصول إلى نسبة التكلفة الإجمالية ${TARGET_FC_PCT}%`
      : '';

    const meta: [string, string][] = [
      ['الكود', r.code], ['الاسم بالإنجليزي', r.nameEn || '—'], ['التصنيف', categoryLabel(r.category)], ['مقاس الحصة', r.portionSize || '—'],
      ['عدد القطع الناتجة', `${r.yieldPieces || 1}`], ['الهامش المستهدف', `${targetMargin}%`],
      ['Food Cost (على صافي)', netPrice ? `${fcPct.toFixed(2)}%` : '—'],
      ['نسبة التكلفة الإجمالية', netPrice ? `${totalCostPctOfNet.toFixed(2)}%` : '—'],
      ['الحالة', r.isActive ? 'نشط' : 'موقوف'],
    ];
    if (suggestedPriceInfo) meta.push([`مقترح السعر (${TARGET_FC_PCT}%)`, suggestedPriceInfo]);

    const totals: [string, string][] = [
      ['تكلفة الأغذية (تتضمن التحضيرات)', `${fmt(costs.foodCost, 2)} ر.س`],
      ['إجمالي التكلفة', `${fmt(costs.totalCost, 2)} ر.س`],
      ['سعر البيع (شامل ضريبة)', grossPrice ? `${fmt(grossPrice, 2)} ر.س` : '—'],
      ['سعر البيع (صافي)', netPrice ? `${fmt(netPrice, 2)} ر.س` : '—'],
      ['Food Cost % (على صافي)', netPrice ? `${fcPct.toFixed(2)}%` : '—'],
      ['نسبة التكلفة الكاملة (إجمالي/صافي)', netPrice ? `${totalCostPctOfNet.toFixed(2)}%` : '—'],
    ];

    return { costs, grossPrice, netPrice, fcPct, totalCostPctOfNet, margin, targetMargin, sugg, tables, meta, totals, suggestedPriceInfo };
  };

  const printOne = (r: StandardRecipe) => {
    const card = buildRecipeCard(r);
    openPrintWindow({
      title: `بطاقة وصفة — ${r.nameAr}`,
      subtitle: r.isCentralKitchenPrep ? 'تحضير مركزي' : 'طبق بيع مباشر',
      compact: true,
      meta: card.meta,
      tables: card.tables,
      totals: card.totals,
      footer: `بطاقة وصفة معيارية (BOM) — ${r.code} — RestoCost ERP`,
    });
  };

  // ترتيب الوصفات: تصنيف ← قسم ← اسم — لخروج الطباعة والتصدير بقائمة مرتبة
  const orderBySections = (items: StandardRecipe[]): StandardRecipe[] =>
    [...items].sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      const sa = a.section?.trim() || '\uffff';
      const sb = b.section?.trim() || '\uffff';
      if (sa !== sb) return sa === '\uffff' ? 1 : sb === '\uffff' ? -1 : sa.localeCompare(sb, 'ar');
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });

  // تقسيم الوصفات إلى مجموعات (تصنيف + قسم) بالترتيب المطلوب للطباعة
  const buildSectionGroups = (items: StandardRecipe[]) => {
    const groups: { category: StandardRecipeCategory; section: string; items: StandardRecipe[] }[] = [];
    orderBySections(items).forEach((r) => {
      const section = r.section?.trim() || '';
      const prev = groups[groups.length - 1];
      if (prev && prev.category === r.category && prev.section === section) prev.items.push(r);
      else groups.push({ category: r.category, section, items: [r] });
    });
    return groups;
  };

  // طباعة بطاقات كاملة — تُطبع كل بطاقة كأنها أمر طباعة مستقل (بدون رأس تقرير)
  const openPrintCardsDoc = (items: StandardRecipe[], groupLabel?: string) => {
    if (!items.length) return;
    const cards: PrintCard[] = [];
    const groups = buildSectionGroups(items);
    groups.forEach((g) => {
      // صفحة فاصل بسيطة لعنوان القسم (مرتبة حسب التقسيم)
      if (items.length > 1) {
        cards.push({
          title: g.section ? `قسم: ${g.section}` : `تصنيف: ${categoryLabel(g.category)}`,
          subtitle: `${categoryLabel(g.category)} • ${g.items.length} وصفات`,
          totals: [['عدد الوصفات في القسم', `${g.items.length}`]],
        });
      }
      g.items.forEach((r) => {
        const card = buildRecipeCard(r);
        cards.push({
          title: `بطاقة وصفة — ${r.nameAr}`,
          subtitle: `${r.code} • ${categoryLabel(r.category)}${r.section ? ` • قسم: ${r.section}` : ''}${groupLabel ? ` • مجموعة: ${groupLabel}` : ''}${r.isCentralKitchenPrep ? ' • تحضير مركزي' : ' • طبق بيع مباشر'}`,
          meta: card.meta,
          tables: card.tables,
          totals: card.totals,
        });
      });
    });
    openPrintWindow({
      title: `طباعة بطاقات الوصفات (${items.length})`,
      compact: true,
      bare: true,
      cards,
      footer: 'طباعة بطاقات الوصفات — RestoCost ERP',
    });
  };

  // طباعة عدة وصفات مرة واحدة — بطاقة كاملة لكل وصفة (وليس تقريراً موحداً)
  const printSelected = () => {
    const items = selectedCount > 0 ? selectedRecipes : recipes;
    if (!items.length) return;
    openPrintCardsDoc(items);
  };

  // تصدير مكونات الوصفات المختارة إلى Excel بجدول منسق — مرتب حسب التصنيف ثم القسم
  // تُصدَّر الكميات والمبالغ كأرقام حقيقية، ومعها صيغ Excel مرتبطة (BOM ← ملخص تكلفة ← إجماليات،
  // وملخص رئيسي بمراجع بين الأوراق) بحيث أي تعديل للأرقام داخل Excel يعيد حساب التكاليف والنسب تلقائياً.
  const exportItemsToExcel = async (items: StandardRecipe[], groupLabel?: string) => {
    if (!items.length) return;
    const ordered = orderBySections(items);

    const recipeSheets: StyledReportSheet[] = [];
    const usedNames = new Set<string>();
    const nameOf = (r: StandardRecipe) => {
      let n = (r.nameAr || r.code || 'وصفة').replace(/[\\/?*[\]]/g, '_').trim().slice(0, 25) || 'وصفة';
      let candidate = n;
      let i = 2;
      while (usedNames.has(candidate)) candidate = `${n} ${i++}`.slice(0, 31);
      usedNames.add(candidate);
      return candidate;
    };

    ordered.forEach((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const grossPrice = r.actualMenuPrice || 0;
      const netPrice = grossPrice ? netOfGross(grossPrice) : 0;
      const fcPct = netPrice ? (costs.foodCost / netPrice) * 100 : 0;
      const totalCostPctOfNet = netPrice ? (costs.totalCost / netPrice) * 100 : 0;
      const sugg = effectiveSugg(grossPrice, totalCostPctOfNet, costs.totalCost);
      const yieldP = Number(r.yieldPieces) > 0 ? Number(r.yieldPieces) : 1;
      const labor = Number(r.directLaborCost) || 0;
      const nBom = r.ingredients.length;
      const subps = r.subPrepIngredients || [];
      const hasSub = subps.length > 0;

      // جدول المكونات (BOM) — الكمية/السعر/الهدر أرقام، والتكلفة صيغة = كمية × سعر × (1 + هدر/100)
      const bomRows: ExcelCellValue[][] = r.ingredients.map((ing, i) => {
        const m = rawMaterials.find((x) => x.id === ing.rawMaterialId);
        const ingUnit = m && m.tradeUomName && m.tradeUomName.trim() ? m.tradeUomName : m?.unit || '';
        const unitPrice = round2(ingredientUnitCost(ing.rawMaterialId));
        return [
          i + 1,
          m?.nameAr || ing.rawMaterialId,
          Number(ing.quantity) || 0,
          ingUnit,
          unitPrice,
          Number(ing.wastagePercent) || 0,
          { formula: '=C{r}*E{r}*(1+F{r}/100)', result: round2(ingredientCost(ing)), numFmt: MONEY_FMT },
        ];
      });

      const tables: StyledReportTable[] = [{
        title: 'المكونات (BOM)',
        dense: true,
        header: ['#', 'المكون', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الهدر %', 'التكلفة'],
        rows: bomRows,
      }];

      if (hasSub) {
        const subRows: ExcelCellValue[][] = subps.map((sp) => {
          const sub = recipes.find((x) => x.id === sp.recipeId);
          const pieces = sub ? (Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces) : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1)) : 1;
          return [sub?.nameAr || sp.recipeId, Number(sp.quantity) || 0, pieces, round2(subPrepItemCost(sp))];
        });
        tables.push({
          title: 'التحضيرات الأساسية المستهلكة',
          dense: true,
          header: ['التحضير', 'الكمية', 'عدد القطع (الدفعة)', 'التكلفة'],
          rows: subRows,
        });
      }

      // جدول ملخص التكلفة — القيمة والنسبة لكل بند صيغة مرتبطة بالجداول أعلاه
      const foodOnly = costs.foodCost - costs.subPrepCost;
      const pctCell = (result: number | null): ExcelCellValue => ({
        formula: '=IF(B{last+3}=0,0,B{r}/B{last+3}*100)',
        result: result === null ? 0 : Number(result.toFixed(1)),
        numFmt: '0.0"%"',
      });
      const summaryRows: ExcelCellValue[][] = [
        [
          'تكلفة الطعام (المكونات + الهدر)',
          nBom > 0 ? { formula: `=SUM(G{first}:G{first+${nBom - 1}})`, result: round2(foodOnly), numFmt: MONEY_FMT } : 0,
          pctCell(costs.totalCost ? (foodOnly / costs.totalCost * 100) : null),
        ],
        [
          'التحضيرات الأساسية المستهلكة',
          hasSub ? { formula: `=SUM(D{t1}:D{t1+${subps.length - 1}})`, result: round2(costs.subPrepCost), numFmt: MONEY_FMT } : 0,
          pctCell(costs.totalCost ? (costs.subPrepCost / costs.totalCost * 100) : null),
        ],
        ['التغليف', round2(Number(r.packagingCost) || 0), pctCell(costs.totalCost ? (Number(r.packagingCost) / costs.totalCost * 100) : null)],
        [
          'التكلفة الإجمالية للوصفة',
          { formula: `=B{last}+B{last+1}+B{last+2}+${round2(labor)}`, result: round2(costs.totalCost), numFmt: MONEY_FMT },
          { formula: '=100', result: 100, numFmt: '0"%"' },
        ],
        [`التكلفة للقطعة الواحدة (÷ ${yieldP} قطعة)`, { formula: `=B{last+3}/${yieldP}`, result: round2(costs.pieceCost), numFmt: MONEY_FMT }, 0],
        ['سعر المنيو (شامل ضريبة)', grossPrice ? round2(grossPrice) : 0, 0],
        ['سعر المنيو (صافي)', grossPrice ? { formula: '=B{last+5}/1.15', result: round2(netPrice), numFmt: MONEY_FMT } : 0, 0],
      ];
      tables.push({ title: 'ملخص التكلفة', dense: true, header: ['البند', 'القيمة', 'النسبة %'], rows: summaryRows });

      // شريط الإجماليات — صيغ مرتبطة بجدول الملخص للإجمالي/الصافي/النسب/السعر المقترح
      const totals: [string, ExcelCellValue][] = [
        ['تكلفة الأغذية (تتضمن التحضيرات)', { formula: '=B{last}+B{last+1}', result: round2(costs.foodCost), numFmt: MONEY_FMT }],
        ['إجمالي التكلفة', { formula: '=B{last+3}', result: round2(costs.totalCost), numFmt: MONEY_FMT }],
        ['سعر البيع (شامل ضريبة)', grossPrice ? { formula: '=B{last+5}', result: round2(grossPrice), numFmt: MONEY_FMT } : 0],
        ['سعر البيع (صافي)', netPrice ? { formula: '=B{last+6}', result: round2(netPrice), numFmt: MONEY_FMT } : 0],
        ['Food Cost % (على صافي)', netPrice ? { formula: '=IF(B{b+3}=0,0,(B{last}+B{last+1})/B{b+3}*100)', result: Number(fcPct.toFixed(2)), numFmt: PCT_FMT } : 0],
        ['نسبة التكلفة الكاملة (إجمالي/صافي)', netPrice ? { formula: '=IF(B{b+3}=0,0,B{last+3}/B{b+3}*100)', result: Number(totalCostPctOfNet.toFixed(2)), numFmt: PCT_FMT } : 0],
        ['هامش الربح %', netPrice ? { formula: '=IF(B{b+3}=0,0,(B{b+3}-B{b+1})/B{b+3}*100)', result: Number((((netPrice - costs.totalCost) / netPrice) * 100).toFixed(2)), numFmt: PCT_FMT } : 0],
        ['السعر المقترح (صافي لـ28%)', { formula: '=B{b+1}/0.28', result: sugg.net ? round2(sugg.net) : 0, numFmt: MONEY_FMT }],
        ['السعر المقترح (شامل ضريبة)', { formula: '=B{b+1}/0.28*1.15', result: sugg.gross ? round2(sugg.gross) : 0, numFmt: MONEY_FMT }],
        ['نسبة التكلفة بعد التعديل (28%)', 28],
      ];

      const meta: [string, ExcelCellValue][] = [
        ['الكود', r.code], ['الاسم بالإنجليزي', r.nameEn || '—'], ['التصنيف', categoryLabel(r.category)], ['مقاس الحصة', r.portionSize || '—'],
        ['عدد القطع الناتجة', yieldP], ['الهامش المستهدف', `${r.targetMarginPercent ?? globalTargetMarginPercent}%`],
        ['Food Cost (على صافي)', netPrice ? Number(fcPct.toFixed(2)) : '—'],
        ['نسبة التكلفة الإجمالية', netPrice ? Number(totalCostPctOfNet.toFixed(2)) : '—'],
        ['الحالة', r.isActive ? 'نشط' : 'موقوف'],
      ];

      recipeSheets.push({
        name: nameOf(r),
        title: r.nameAr,
        subtitle: `${r.code} — ${categoryLabel(r.category)}${r.section?.trim() ? ` — قسم: ${r.section.trim()}` : ''}${r.nameEn ? ` — ${r.nameEn}` : ''}`,
        dense: true,
        meta,
        tables,
        totals,
        footer: 'بطاقة تكلفة وصفة معيارية — RestoCost ERP',
      });
    });

    // ورقة الملخص — أعمدة الأرقام صيغ مرجعية (بين الأوراق) إلى شريط إجماليات ورقة كل وصفة
    const summaryRows: ExcelCellValue[][] = ordered.map((r, i) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const grossPrice = r.actualMenuPrice || 0;
      const netPrice = grossPrice ? netOfGross(grossPrice) : 0;
      const totalCostPct = netPrice ? (c.totalCost / netPrice) * 100 : 0;
      const sugg = effectiveSugg(grossPrice, totalCostPct, c.totalCost);
      const sheetRef = `'${excelSheetName(recipeSheets[i].name)}'`;
      const ts = styledSheetModel(recipeSheets[i]).totalsStart + 1; // أول صف في شريط إجماليات ورقة الوصفة
      const grab = (off: number): ExcelFormula => ({ formula: `${sheetRef}!B${ts + off}`, result: 0, numFmt: MONEY_FMT });
      return [
        r.code, r.nameAr, categoryLabel(r.category), r.section?.trim() || '—',
        { ...grab(0), result: round2(c.foodCost) },
        { ...grab(1), result: round2(c.totalCost) },
        { ...grab(2), result: grossPrice ? round2(grossPrice) : 0 },
        { ...grab(3), result: netPrice ? round2(netPrice) : 0 },
        { ...grab(4), result: netPrice ? Number((c.foodCost / netPrice * 100).toFixed(2)) : 0, numFmt: PCT_FMT },
        { ...grab(8), result: sugg.gross ? round2(sugg.gross) : 0 },
      ];
    });

    const summaryTotals = ordered.reduce((acc, r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const gross = r.actualMenuPrice || 0;
      const net = gross ? netOfGross(gross) : 0;
      acc.foodCost += c.foodCost;
      acc.totalCost += c.totalCost;
      acc.gross += gross;
      acc.net += net;
      if (gross > 0) {
        acc.soldCount++;
        acc.soldFoodCost += c.foodCost;
        acc.soldTotalCost += c.totalCost;
        acc.soldNet += net;
      }
      return acc;
    }, { foodCost: 0, totalCost: 0, gross: 0, net: 0, soldCount: 0, soldFoodCost: 0, soldTotalCost: 0, soldNet: 0 });

    const n = ordered.length;
    const sheets: StyledReportSheet[] = [{
      name: 'ملخص الوصفات',
      title: 'ملخص الوصفات المعيارية',
      subtitle: `الوصفات المستخرجة: ${items.length}${groupLabel ? ` — المجموعات: ${groupLabel}` : ''}`,
      dense: true,
      meta: [
        ['الوصفات', `${items.length}`],
        ['التكلفة المستهدفة', `${TARGET_FC_PCT}%`],
        ['الضريبة', '15%'],
        ['الإيراد', 'على الصافي'],
      ],
      header: ['الكود', 'الوصفة', 'التصنيف', 'القسم', 'تكلفة الأغذية', 'إجمالي التكلفة', 'سعر البيع (شامل ضريبة)', 'الصافي', 'نسبة تكلفة الأغذية %', 'السعر المقترح (28%)'],
      rows: summaryRows,
      totals: [
        ['مجموع تكلفة الأغذية (الكل)', { formula: `=SUM(E{first}:E{first+${n - 1}})`, result: round2(summaryTotals.foodCost), numFmt: MONEY_FMT }],
        ['منها: الأطباق المباعة', { formula: `=SUMIF(G{first}:G{first+${n - 1}},">0",E{first}:E{first+${n - 1}})`, result: round2(summaryTotals.soldFoodCost), numFmt: MONEY_FMT }],
        ['مجموع إجمالي التكلفة (الكل)', { formula: `=SUM(F{first}:F{first+${n - 1}})`, result: round2(summaryTotals.totalCost), numFmt: MONEY_FMT }],
        [`مجموع سعر البيع (${summaryTotals.soldCount} طبق)`, { formula: `=SUM(G{first}:G{first+${n - 1}})`, result: round2(summaryTotals.gross), numFmt: MONEY_FMT }],
        ['مجموع الصافي', { formula: `=SUM(H{first}:H{first+${n - 1}})`, result: round2(summaryTotals.net), numFmt: MONEY_FMT }],
        ['نسبة تكلفة الأغذية (الأطباق فقط)', { formula: `=IF(SUM(H{first}:H{first+${n - 1}})=0,0,SUM(E{first}:E{first+${n - 1}})/SUM(H{first}:H{first+${n - 1}})*100)`, result: summaryTotals.soldNet ? Number((summaryTotals.soldFoodCost / summaryTotals.soldNet * 100).toFixed(2)) : 0, numFmt: PCT_FMT }],
      ],
      colWidths: [24, 14, 14, 12, 12, 16, 10, 13, 12],
      footer: 'ملخص الوصفات المعيارية — RestoCost ERP',
    }, ...recipeSheets];

    // ربط كل سطر في الملخص بورقة الوصفة الخاصة به (داخل الملف)
    sheets[0].hyperlinks = ordered.map((r, i) => {
      const t = sheets[i + 1] as StyledReportSheet | undefined;
      return { row: i, col: 1, sheet: t?.name || '', text: r.nameAr };
    }).filter((h) => !!h.sheet);
    await exportStyledReport(`الوصفات_${items.length}`, sheets);
  };

  // تصدير Excel للوصفات المختارة (أو الكل إن لم يُحدد شيء)
  const exportSelectedToExcel = () => {
    const items = selectedCount > 0 ? selectedRecipes : recipes;
    void exportItemsToExcel(items).catch((e) => alert(`فشل تصدير Excel: ${(e as Error)?.message || e}`));
  };

  // التقرير الشامل — يطبع جميع الوصفات (ملخص + بطاقات كاملة)
  const printCards = () => {
    const totalFoodCost = recipes.reduce((s, r) => s + calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces).foodCost, 0);
    const priced = recipes.filter((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const price = r.actualMenuPrice || c.suggestedPrice;
      return price > 0;
    });
    const avgFc = priced.length ? priced.reduce((s, r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const price = r.actualMenuPrice || c.suggestedPrice;
      return s + (price ? (c.foodCost / price) * 100 : 0);
    }, 0) / priced.length : 0;
    openPrintWindow({
      title: 'تقرير الوصفات المعيارية الشامل',
      subtitle: `إجمالي ${recipes.length} وصفة`,
      meta: [
        ['عدد الوصفات', `${recipes.length}`],
        ['أطباق البيع المباشر', `${recipes.filter((r) => !r.isCentralKitchenPrep).length}`],
        ['تحضيرات مركزية', `${recipes.filter((r) => r.isCentralKitchenPrep).length}`],
        ['متوسط Food Cost', `${avgFc.toFixed(2)}%`],
        ['الهامش المستهدف الافتراضي', `${globalTargetMarginPercent}%`],
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [
        {
          title: 'ملخص جميع الوصفات',
          dense: true,
          header: ['الكود', 'الوصفة', 'التصنيف', 'الحصة', 'تكلفة الأغذية', 'إجمالي التكلفة', 'سعر البيع', 'Food Cost %', 'الهامش %', 'المستهدف %', 'الحالة'],
          rows: recipes.map((r) => {
            const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
            const price = r.actualMenuPrice || c.suggestedPrice;
            const fc = price ? (c.foodCost / price) * 100 : 0;
            const margin = price ? ((price - c.totalCost) / price) * 100 : 0;
            return [r.code, r.nameAr, categoryLabel(r.category), r.portionSize || '—', fmt(c.foodCost, 2), fmt(c.totalCost, 2), price ? fmt(price, 2) : '—', price ? fc.toFixed(2) : '—', price ? margin.toFixed(2) : '—', `${r.targetMarginPercent ?? globalTargetMarginPercent}%`, r.isCentralKitchenPrep ? 'تحضير مركزي' : r.isActive ? 'نشط' : 'موقوف'];
          }),
        },
        ...recipes.flatMap((r) => {
          const card = buildRecipeCard(r);
          const parts: PrintTable[] = [];
          parts.push(...card.tables);
          return parts;
        }),
      ],
      totals: [
        ['إجمالي تكلفة الأغذية (حصة واحدة لكل وصفة)', `${fmt(totalFoodCost, 2)} ر.س`],
        ['متوسط Food Cost', `${avgFc.toFixed(2)}%`],
        ['الهامش المستهدف', `${globalTargetMarginPercent}%`],
      ],
      footer: 'تقرير شامل لجميع الوصفات المعيارية — RestoCost ERP',
    });
  };

  const printRecipesList = () => {
    const rows = recipes.map((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
      const price = r.actualMenuPrice || c.suggestedPrice;
      const fc = price ? (c.foodCost / price) * 100 : 0;
      const margin = price ? ((price - c.totalCost) / price) * 100 : 0;
      return [r.code, r.nameAr, categoryLabel(r.category), r.portionSize || '—', fmt(c.foodCost, 2), fmt(c.totalCost, 2), price ? fmt(price, 2) : '—', price ? fc.toFixed(2) : '—', price ? margin.toFixed(2) : '—', `${r.targetMarginPercent ?? globalTargetMarginPercent}%`, r.isCentralKitchenPrep ? 'تحضير مركزي' : r.isActive ? 'نشط' : 'موقوف'];
    });
    openPrintWindow({
      title: 'قائمة الوصفات المعيارية',
      subtitle: 'قائمة فقط — بدون تفاصيل المكونات',
      meta: [
        ['عدد الوصفات', `${recipes.length}`],
        ['أطباق البيع المباشر', `${recipes.filter((r) => !r.isCentralKitchenPrep).length}`],
        ['تحضيرات مركزية', `${recipes.filter((r) => r.isCentralKitchenPrep).length}`],
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [
        {
          title: 'الوصفات المعيارية',
          dense: true,
          header: ['الكود', 'الوصفة', 'التصنيف', 'الحصة', 'تكلفة الأغذية', 'إجمالي التكلفة', 'سعر البيع', 'Food Cost %', 'الهامش %', 'المستهدف %', 'الحالة'],
          rows,
        },
      ],
      totals: [
        ['إجمالي تكلفة الأغذية', `${fmt(recipes.reduce((s, r) => s + calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces).foodCost, 0), 2)} ر.س`],
        ['الهامش المستهدف', `${globalTargetMarginPercent}%`],
      ],
      footer: 'قائمة الوصفات المعيارية — بدون المكونات — RestoCost ERP',
    });
  };

  // ====== تقرير التكلفة المخصص (طباعة / Excel حسب التصنيف المختار) ======
  const reportRows = useMemo(() => {
    return recipes
      .filter((r) => reportCats.has(r.category))
      .map((r) => {
        const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
        const gross = r.actualMenuPrice || 0;
        const net = gross ? netOfGross(gross) : 0;
        const foodCostPct = net ? (c.foodCost / net) * 100 : 0;
        const totalCostPct = net ? (c.totalCost / net) * 100 : 0;
        // إبقاء السعر الحالي إن كانت النسبة أقل أو تساوي الهدف — لا اقتراح لسعر جديد
        const sugg = effectiveSugg(gross, totalCostPct, c.totalCost);
        return {
          r, gross, net, foodCost: c.foodCost, packaging: r.packagingCost, totalCost: c.totalCost,
          foodCostPct, totalCostPct, sugg, totalCostPctAfter: sugg.net ? (c.totalCost / sugg.net) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalCostPct - a.totalCostPct);
  }, [recipes, reportCats, calculateRecipeCosts]);

  const reportTotals = useMemo(() => {
    const t = reportRows.reduce((acc, row) => {
      acc.gross += row.gross || 0;
      acc.net += row.net || 0;
      acc.foodCost += row.foodCost;
      acc.packaging += row.packaging;
      acc.totalCost += row.totalCost;
      acc.suggGross += row.sugg.gross || 0;
      acc.suggNet += row.sugg.net || 0;
      return acc;
    }, { gross: 0, net: 0, foodCost: 0, packaging: 0, totalCost: 0, suggGross: 0, suggNet: 0 });
    return {
      ...t,
      foodCostPct: t.net ? (t.foodCost / t.net) * 100 : null,
      totalCostPct: t.net ? (t.totalCost / t.net) * 100 : null,
      totalCostPctAfter: t.suggNet ? (t.totalCost / t.suggNet) * 100 : null,
    };
  }, [reportRows]);

  const selectedCatLabels = CATEGORY_OPTIONS.filter((c) => reportCats.has(c.id)).map((c) => c.label).join('، ') || 'لا شيء';

  const printCostReport = () => {
    if (!reportRows.length) return;
    openPrintWindow({
      title: 'تقرير تكلفة الأطباق والهامش',
      subtitle: `التصنيفات المختارة: ${selectedCatLabels}`,
      orientation: 'landscape',
      compact: true,
      meta: [
        ['التصنيفات', selectedCatLabels],
        ['عدد الأطباق', `${reportRows.length}`],
        ['التكلفة المستهدفة', `${TARGET_FC_PCT}%`],
        ['الضريبة', '15%'],
        ['الإيراد', 'على الصافي'],
      ],
      tables: [
        {
          title: 'تفاصيل التكلفة لكل صنف',
          dense: true,
          colWidths: ['18%', '7%', '6%', '8%', '6%', '8%', '10%', '10%', '9%', '8%', '10%'],
          header: ['الصنف', 'سعر البيع', 'الصافي', 'تكلفة الأغذية', 'التغليف', 'إجمالي التكلفة', 'نسبة تكلفة الأغذية %', 'نسبة التكلفة الإجمالية %', 'السعر المقترح (28%)', 'الصافي بعد التعديل', 'نسبة التكلفة بعد التعديل %'],
          rows: reportRows.map((row) => [
            row.r.nameAr, row.gross ? fmt(row.gross, 2) : '—', row.net ? fmt(row.net, 2) : '—',
            fmt(row.foodCost, 2), fmt(row.packaging, 2), fmt(row.totalCost, 2),
            row.net ? `${row.foodCostPct.toFixed(2)}%` : '—', row.net ? `${row.totalCostPct.toFixed(2)}%` : '—',
            row.sugg.gross ? fmt(row.sugg.gross, 0) : '—', row.sugg.net ? fmt(row.sugg.net, 2) : '—',
            row.sugg.net ? `${row.totalCostPctAfter.toFixed(2)}%` : '—',
          ]),
        },
      ],
      totals: [
        ['مجموع سعر البيع', `${fmt(reportTotals.gross, 2)} ر.س`],
        ['مجموع الصافي', `${fmt(reportTotals.net, 2)} ر.س`],
        ['مجموع تكلفة الأغذية', `${fmt(reportTotals.foodCost, 2)} ر.س`],
        ['مجموع التغليف', `${fmt(reportTotals.packaging, 2)} ر.س`],
        ['مجموع إجمالي التكلفة', `${fmt(reportTotals.totalCost, 2)} ر.س`],
        ['نسبة تكلفة الأغذية (إجمالي)', reportTotals.foodCostPct !== null ? `${reportTotals.foodCostPct.toFixed(2)}%` : '—'],
        ['نسبة التكلفة الإجمالية (إجمالي)', reportTotals.totalCostPct !== null ? `${reportTotals.totalCostPct.toFixed(2)}%` : '—'],
        ['نسبة التكلفة بعد التعديل (إجمالي)', reportTotals.totalCostPctAfter !== null ? `${reportTotals.totalCostPctAfter.toFixed(2)}%` : '—'],
        ['نسبة Food Cost المستهدفة', `${TARGET_FC_PCT}%`],
      ],
      footer: 'تقرير تكلفة الأطباق والهامش — RestoCost ERP',
    });
  };

  const exportCostReport = async () => {
    if (!reportRows.length) return;
    const reportTable: StyledReportSheet = {
      name: 'تقرير التكلفة',
      title: 'تقرير تكلفة الأطباق والهامش',
      subtitle: `التصنيفات المختارة: ${selectedCatLabels}`,
      dense: true,
      meta: [
        ['التصنيفات', selectedCatLabels],
        ['عدد الأطباق', `${reportRows.length}`],
        ['التكلفة المستهدفة', `${TARGET_FC_PCT}%`],
        ['الضريبة', '15%'],
        ['الإيراد', 'على الصافي'],
      ],
      header: ['الصنف', 'سعر البيع', 'الصافي', 'تكلفة الأغذية', 'التغليف', 'إجمالي التكلفة', 'نسبة تكلفة الأغذية %', 'نسبة التكلفة الإجمالية %', 'السعر المقترح (28%)', 'الصافي بعد التعديل', 'نسبة التكلفة بعد التعديل %'],
      rows: reportRows.map((row) => [
        row.r.nameAr,
        row.gross || 0,
        row.net ? { formula: '=B{r}/1.15', result: round2(row.net), numFmt: MONEY_FMT } : 0,
        row.foodCost,
        row.packaging,
        row.totalCost,
        row.net ? { formula: '=IF(C{r}=0,0,D{r}/C{r}*100)', result: Number(row.foodCostPct.toFixed(2)), numFmt: PCT_FMT } : 0,
        row.net ? { formula: '=IF(C{r}=0,0,F{r}/C{r}*100)', result: Number(row.totalCostPct.toFixed(2)), numFmt: PCT_FMT } : 0,
        row.sugg.gross ? { formula: '=IF(F{r}=0,0,F{r}/0.28*1.15)', result: round2(row.sugg.gross), numFmt: MONEY_FMT } : 0,
        row.sugg.net ? { formula: '=IF(F{r}=0,0,F{r}/0.28)', result: round2(row.sugg.net), numFmt: MONEY_FMT } : 0,
        row.sugg.net ? { formula: '=IF(J{r}=0,0,F{r}/J{r}*100)', result: Number(row.totalCostPctAfter.toFixed(2)), numFmt: PCT_FMT } : 0,
      ]),
      colWidths: [22, 10, 10, 12, 8, 13, 14, 14, 11, 12, 14],
      totals: [
        ['مجموع سعر البيع', { formula: `=SUM(B{first}:B{first+${reportRows.length - 1}})`, result: round2(reportTotals.gross), numFmt: MONEY_FMT }],
        ['مجموع الصافي', { formula: `=SUM(C{first}:C{first+${reportRows.length - 1}})`, result: round2(reportTotals.net), numFmt: MONEY_FMT }],
        ['مجموع تكلفة الأغذية', { formula: `=SUM(D{first}:D{first+${reportRows.length - 1}})`, result: round2(reportTotals.foodCost), numFmt: MONEY_FMT }],
        ['مجموع التغليف', { formula: `=SUM(E{first}:E{first+${reportRows.length - 1}})`, result: round2(reportTotals.packaging), numFmt: MONEY_FMT }],
        ['مجموع إجمالي التكلفة', { formula: `=SUM(F{first}:F{first+${reportRows.length - 1}})`, result: round2(reportTotals.totalCost), numFmt: MONEY_FMT }],
        [
          'نسبة تكلفة الأغذية (إجمالي)',
          { formula: `=IF(SUM(C{first}:C{first+${reportRows.length - 1}})=0,0,SUM(D{first}:D{first+${reportRows.length - 1}})/SUM(C{first}:C{first+${reportRows.length - 1}})*100)`, result: reportTotals.foodCostPct !== null ? Number(reportTotals.foodCostPct.toFixed(2)) : 0, numFmt: PCT_FMT },
        ],
        [
          'نسبة التكلفة الإجمالية (إجمالي)',
          { formula: `=IF(SUM(C{first}:C{first+${reportRows.length - 1}})=0,0,SUM(F{first}:F{first+${reportRows.length - 1}})/SUM(C{first}:C{first+${reportRows.length - 1}})*100)`, result: reportTotals.totalCostPct !== null ? Number(reportTotals.totalCostPct.toFixed(2)) : 0, numFmt: PCT_FMT },
        ],
        [
          'نسبة التكلفة بعد التعديل (إجمالي)',
          { formula: `=IF(SUM(J{first}:J{first+${reportRows.length - 1}})=0,0,SUM(F{first}:F{first+${reportRows.length - 1}})/SUM(J{first}:J{first+${reportRows.length - 1}})*100)`, result: reportTotals.totalCostPctAfter !== null ? Number(reportTotals.totalCostPctAfter.toFixed(2)) : 0, numFmt: PCT_FMT },
        ],
      ],
      footer: 'تقرير تكلفة الأطباق والهامش — RestoCost ERP',
    };
    const catAvgRows = CATEGORY_OPTIONS.filter((c) => reportCats.has(c.id)).map((c) => {
      const rows = reportRows.filter((row) => row.r.category === c.id);
      if (!rows.length) return [c.label, 0, '—', '—'];
      const avgFood = rows.reduce((s, row) => s + row.foodCostPct, 0) / rows.length;
      const avgTotal = rows.reduce((s, row) => s + row.totalCostPct, 0) / rows.length;
      return [c.label, rows.length, `${avgFood.toFixed(2)}%`, `${avgTotal.toFixed(2)}%`];
    });
    await exportStyledReport(`تقرير_التكلفة_${reportRows.length}`, [
      reportTable,
      {
        name: 'ملخص التصنيفات',
        title: 'ملخص متوسط النسب حسب التصنيف',
        subtitle: `إجمالي الأصناف المشمولة: ${reportRows.length}`,
        dense: true,
        meta: [['التصنيفات', `${catAvgRows.length}`], ['الأصناف', `${reportRows.length}`]],
        header: ['التصنيف', 'عدد الأصناف', 'متوسط نسبة تكلفة الأغذية %', 'متوسط نسبة التكلفة الإجمالية %'],
        rows: catAvgRows,
        colWidths: [24, 14, 28, 28],
        footer: 'ملخص متوسط النسب حسب التصنيف — RestoCost ERP',
      },
    ]);
  };

  const handleSelectionToggle = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelectedIds(selectedCount === recipes.length ? new Set() : new Set(recipes.map((r) => r.id)));
  const clearSelection = () => setSelectedIds(new Set());

  return (
    <div className="space-y-6">
      <PageHeader title="الوصفات المعيارية (BOM) وتكلفة الأطباق" subtitle="بناء الوصفات، حساب تكلفة الأغذية والهامش، ومتابعة انحرافات Food Cost" icon={<ChefHat className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="الوصفات_المعيارية"
            styled={[
              {
                name: 'الوصفات',
                title: 'قائمة الوصفات المعيارية',
                subtitle: `إجمالي الوصفات: ${recipes.length}`,
                dense: true,
                meta: [['الوصفات', `${recipes.length}`], ['التكلفة المستهدفة', `${TARGET_FC_PCT}%`], ['الضريبة', '15%']],
                header: ['الكود', 'الاسم بالعربي', 'الاسم بالإنجليزي', 'التصنيف', 'مقاس الحصة', 'وقت التحضير', 'تكلفة الأغذية', 'إجمالي التكلفة', 'سعر المنيو', 'Food Cost %', 'هامش %', 'تحضير مركزي', 'الهامش المستهدف'],
                rows: recipes.map((r) => { const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces); const price = r.actualMenuPrice || c.suggestedPrice; return [r.code, r.nameAr, r.nameEn || '', categoryLabel(r.category), Number(r.portionSize) || 0, r.prepTimeMins || 0, c.foodCost, c.totalCost, price, price ? Number(((c.foodCost / price) * 100).toFixed(2)) : '—', price ? Number(((price - c.totalCost) / price * 100).toFixed(2)) : '—', r.isCentralKitchenPrep ? 'نعم' : 'لا', Number(r.targetMarginPercent ?? globalTargetMarginPercent)]; }),
                totals: [
                  ['مجموع تكلفة الأغذية', `${fmt(recipes.reduce((s, r) => s + calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces).foodCost, 0), 2)} ر.س`],
                  ['مجموع إجمالي التكلفة', `${fmt(recipes.reduce((s, r) => s + calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces).totalCost, 0), 2)} ر.س`],
                ],
                colWidths: [10, 22, 20, 12, 12, 10, 12, 12, 12, 10, 10, 12, 12],
                footer: 'قائمة الوصفات المعيارية — RestoCost ERP',
              },
              {
                name: 'المكونات',
                title: 'مكونات الوصفات المعيارية',
                subtitle: `إجمالي الوصفات: ${recipes.length}`,
                dense: true,
                meta: [['الوصفات', `${recipes.length}`], ['الخطوط', `${recipes.reduce((s, r) => s + r.ingredients.length, 0)}`]],
                header: ['الكود', 'الوصفة', 'المكون', 'الكمية', 'الهدر %'],
                rows: recipes.flatMap((r) => r.ingredients.map((ing) => [r.code, r.nameAr, rawMaterials.find((m) => m.id === ing.rawMaterialId)?.nameAr || ing.rawMaterialId, Number(ing.quantity) || 0, Number(ing.wastagePercent) || 0])),
                totals: [['إجمالي الخطوط', `${recipes.reduce((s, r) => s + r.ingredients.length, 0)}`]],
                colWidths: [10, 22, 26, 12, 10],
                footer: 'مكونات الوصفات المعيارية — RestoCost ERP',
              },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Recipes.csv', ['الكود', 'الاسم بالعربي', 'الاسم بالإنجليزي', 'التصنيف', 'تكلفة الأغذية', 'إجمالي التكلفة', 'سعر المنيو'], recipes.map((r) => { const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces); return [r.code, r.nameAr, r.nameEn || '', r.category, c.foodCost, c.totalCost, r.actualMenuPrice]; }))}>تصدير CSV</Btn>
          <Btn tone="ghost" onClick={() => setTab('cost-report')}><Target className="w-4 h-4" /> تقرير التكلفة والهامش</Btn>
          <Btn tone="ghost" onClick={printCards}><Printer className="w-4 h-4" /> تقرير الوصفات الشامل</Btn>
          <Btn tone="ghost" onClick={printRecipesList}><Printer className="w-4 h-4" /> قائمة الوصفات فقط</Btn>
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> وصفة جديدة</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الوصفات</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{recipes.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الأطباق المباشرة</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{recipes.filter((r) => !r.isCentralKitchenPrep).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تحضيرات مركزية</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{recipes.filter((r) => r.isCentralKitchenPrep).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">نسبة Food Cost المستهدفة</span><strong className="text-lg font-extrabold text-indigo-700 block mt-1">{TARGET_FC_PCT}%</strong></div>
      </div>

      <TabBar tabs={[{ id: 'bom', label: 'قائمة الوصفات' }, { id: 'alerts', label: 'انحرافات الهامش' }, { id: 'where-used', label: 'أين يُستخدم الصنف' }, { id: 'cost-report', label: 'تقرير التكلفة والهامش' }]} active={tab} onChange={(id) => setTab(id as 'bom' | 'alerts' | 'where-used' | 'cost-report')} />

      {selectedCount > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-bold text-indigo-800">تم اختيار <span className="text-indigo-600">{selectedCount}</span> وصفة</span>
            <Btn tone="primary" onClick={printSelected}><Printer className="w-4 h-4" /> طباعة المختارة ({selectedCount})</Btn>
            <Btn tone="success" onClick={exportSelectedToExcel}><FileSpreadsheet className="w-4 h-4" /> تصدير Excel ({selectedCount})</Btn>
          </div>
          <div className="flex items-center gap-2">
            <Btn tone="ghost" onClick={toggleAll}>{selectedCount === recipes.length ? 'إلغاء الكل' : 'تحديد الكل'}</Btn>
            <Btn tone="ghost" onClick={clearSelection}><X className="w-4 h-4" /> إلغاء التحديد</Btn>
          </div>
        </div>
      )}

      {tab === 'bom' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orderBySections(recipes).map((r) => {
            const card = buildRecipeCard(r);
            const targetMargin = r.targetMarginPercent ?? globalTargetMarginPercent;
            const breached = card.netPrice ? card.totalCostPctOfNet > (100 - targetMargin) : false;
            return (
              <Card key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => handleSelectionToggle(r.id)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-500">تحديد</span>
                  </label>
                  {card.suggestedPriceInfo && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">يتطلب رفع السعر</span>}
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{r.nameAr}</p>
                    {r.nameEn && <p className="text-[10px] text-indigo-600 font-mono font-bold">{r.nameEn}</p>}
                    {r.section?.trim() ? <span className="inline-block mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{r.section.trim()}</span> : null}
                    {r.isActive === false ? <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5"><Clock className="w-3 h-3" /> مسودة — بانتظار الاعتماد</span> : null}
                    <p className="text-[10px] text-slate-500 font-mono">{r.code} • {r.portionSize}{r.yieldPieces ? ` • ${r.yieldPieces} قطعة` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => printOne(r)} className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg" title="طباعة بطاقة الوصفة"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => openCopy(r)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg" title="نسخ الوصفة مع فرق التكلفة والاعتماد"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(r)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => {
                      if (!window.confirm(`حذف الوصفة «${r.nameAr}»؟ سيُحذف السجل نهائياً.`)) return;
                      deleteRecipe(r.id);
                    }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">سعر القائمة (شامل ضريبة)</span><strong className="font-mono text-emerald-700">{card.grossPrice ? fmt(card.grossPrice, 2) : '—'}</strong></div>
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">الصافي (بدون ضريبة)</span><strong className="font-mono text-indigo-700">{card.netPrice ? fmt(card.netPrice, 2) : '—'}</strong></div>
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">التكلفة الإجمالية</span><strong className="font-mono text-slate-900">{fmt(card.costs.totalCost, 2)}</strong></div>
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><span className="text-slate-500 block">نسبة التكلفة الإجمالية</span><strong className={`font-mono ${card.netPrice && card.totalCostPctOfNet > TARGET_FC_PCT ? 'text-rose-600' : 'text-amber-700'}`}>{card.netPrice ? card.totalCostPctOfNet.toFixed(1) : '—'}%</strong></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[10px] mt-1">
                  <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-200"><span className="text-indigo-600 block">المقترح لـ{TARGET_FC_PCT}% (صافي)</span><strong className="font-mono text-indigo-700">{card.sugg.net ? fmt(card.sugg.net, 2) : '—'}</strong></div>
                  <div className="bg-amber-50 rounded-lg p-2 border border-amber-200"><span className="text-amber-600 block">المقترح لـ{TARGET_FC_PCT}% (شامل ضريبة)</span><strong className="font-mono text-amber-700">{card.sugg.gross ? fmt(card.sugg.gross, 0) : '—'}</strong></div>
                </div>
                {r.subPrepIngredients?.length ? (
                  <div className="flex items-center justify-between text-[10px] font-bold bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-amber-800">من التحضيرات الأساسية ({r.subPrepIngredients.length} صنف)</span>
                    <span className="font-mono text-amber-900">{fmt(card.costs.subPrepCost, 2)} ر.س</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600">التكلفة الإجمالية: <strong className={breached ? 'text-rose-600' : 'text-slate-800'}>{card.netPrice ? card.totalCostPctOfNet.toFixed(2) : '—'}%</strong></span>
                  <span className={`px-2 py-0.5 rounded-full ${breached ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {breached ? `تجاوز +${(card.totalCostPctOfNet - (100 - targetMargin)).toFixed(2)}%` : card.netPrice ? `هامش ${card.margin.toFixed(2)}%` : 'بدون سعر'}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : tab === 'alerts' ? (
        <Card className="p-5">
          <p className="text-xs text-slate-500 font-bold mb-3">الهامش المستهدف لكل وصفة — الافتراضي العام {globalTargetMarginPercent}% (Food Cost {100 - globalTargetMarginPercent}%)</p>
          <div className="space-y-2">
            {recipes.filter((r) => !r.isCentralKitchenPrep).map((r) => {
              const targetMargin = r.targetMarginPercent ?? globalTargetMarginPercent;
              return (
                <div key={r.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-500" />
                    <span className="font-bold text-slate-800 text-xs">{r.nameAr}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="30" max="95" value={targetMargin} onChange={(e) => updateRecipeTargetMargin(r.id, parseFloat(e.target.value) || 72)} className={inputCls + ' !w-24'} />
                    <span className="text-[10px] font-bold text-slate-500">% هامش</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : tab === 'where-used' ? (
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3">اختر المادة الخام لمعرفة تحليل استخدامها في المبيعات</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">المادة الخام</label>
                <AutocompleteSelect
                  value={whereUsedMaterialId}
                  onChange={setWhereUsedMaterialId}
                  options={rawMaterials.filter((m) => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                  getOptionLabel={(opt) => `${opt.code} — ${opt.label}`}
                  placeholder="— ابحث عن مادة خام —"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">من تاريخ</label>
                <input type="date" value={wuFromDate} onChange={(e) => setWuFromDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <input type="date" value={wuToDate} onChange={(e) => setWuToDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </Card>
          {whereUsedMaterialId && (
            <Card className="p-5">
              {whereUsedResults.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800">
                      استخدام <span className="text-indigo-600">{wuMat?.nameAr}</span> في المبيعات
                      <span className="text-[10px] text-slate-500 font-normal mr-2">({whereUsedResults.length} وصفة — {wuFromDate || wuToDate ? `من ${wuFromDate || '—'} إلى ${wuToDate || '—'}` : 'كل الفترات'})</span>
                    </h3>
                    <Btn tone="ghost" onClick={printWhereUsed}><Printer className="w-4 h-4" /> طباعة</Btn>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-indigo-600 font-bold block">إجمالي المبيعات</span>
                      <strong className="text-lg font-extrabold text-indigo-800 font-mono">{whereUsedResults.reduce((s, r) => s + r.totalSold, 0)}</strong>
                      <span className="text-[10px] text-indigo-500 block">حصة</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-amber-600 font-bold block">الكمية المستهلكة</span>
                      <strong className="text-lg font-extrabold text-amber-800 font-mono">{fmt(whereUsedResults.reduce((s, r) => s + r.consumedQty, 0), 3)}</strong>
                      <span className="text-[10px] text-amber-500 block">{wuMat?.unit}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-emerald-600 font-bold block">قيمة الاستهلاك</span>
                      <strong className="text-lg font-extrabold text-emerald-800 font-mono">{fmt(whereUsedResults.reduce((s, r) => s + r.consumedValue, 0), 2)}</strong>
                      <span className="text-[10px] text-emerald-500 block">ر.س</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="p-2 text-right font-bold">الوصفة</th>
                          <th className="p-2 text-right font-bold">التصنيف</th>
                          <th className="p-2 text-right font-bold">النوع</th>
                          <th className="p-2 text-right font-bold">{wuMat?.unit} / حصة</th>
                          <th className="p-2 text-right font-bold">إجمالي المبيعات (حصة)</th>
                          <th className="p-2 text-right font-bold">الكمية المستهلكة</th>
                          <th className="p-2 text-right font-bold">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {whereUsedResults.map((r) => (
                          <tr key={r.recipe.id + r.type} className="hover:bg-slate-50">
                            <td className="p-2">
                              <button type="button" onClick={() => openEdit(r.recipe)} className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-2 text-right" title="اضغط لفتح وتعديل الوصفة">{r.recipe.nameAr}</button>
                            </td>
                            <td className="p-2 text-slate-500">{categoryLabel(r.recipe.category)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.type === 'direct' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                                {r.type === 'direct' ? 'مباشر' : `عبر: ${r.subPrepName || '—'}`}
                              </span>
                            </td>
                            <td className="tnum text-left p-2 text-slate-700">{fmt(r.quantity, 3)}</td>
                            <td className="tnum text-left p-2 font-bold text-indigo-700">{r.totalSold}</td>
                            <td className="tnum text-left p-2 text-amber-700">{fmt(r.consumedQty, 3)} {wuMat?.unit}</td>
                            <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(r.consumedValue, 2)} ر.س</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-200">
                          <td className="p-2" colSpan={3}>الإجمالي</td>
                          <td className="p-2">—</td>
                          <td className="tnum text-left p-2 text-indigo-800">{whereUsedResults.reduce((s, r) => s + r.totalSold, 0)}</td>
                          <td className="tnum text-left p-2 text-amber-800">{fmt(whereUsedResults.reduce((s, r) => s + r.consumedQty, 0), 3)} {wuMat?.unit}</td>
                          <td className="tnum text-left p-2 text-emerald-800">{fmt(whereUsedResults.reduce((s, r) => s + r.consumedValue, 0), 2)} ر.س</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-center text-slate-400 text-sm py-6">لا توجد وصفات تستخدم هذا الصنف في الفترة المحددة</p>
              )}
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">تقرير تكلفة الأطباق والهامش</h3>
                <p className="text-[11px] text-slate-500">
                  تكلفة الأغذية = تكلفة الطعام (المكونات + الهدر) + التحضيرات الأساسية المستهلكة — الإيراد على السعر الصافي (بدون ضريبة 15%)
                  — السعر المقترح يُقرَّب لأعلى رقم صحيح شامل ضريبة بحيث تصبح نسبة التكلفة الإجمالية (خامات + تحضيرات + تغليف + عمالة) {TARGET_FC_PCT}% من الصافي.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Btn tone="primary" onClick={printCostReport}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
                <Btn tone="success" onClick={() => { void exportCostReport().catch((e) => alert(`فشل تصدير Excel: ${(e as Error)?.message || e}`)); }}><FileSpreadsheet className="w-4 h-4" /> تصدير Excel</Btn>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500">التصنيفات:</span>
                <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={allCatsSelected} onChange={() => setReportCats(allCatsSelected ? new Set() : new Set(CATEGORY_OPTIONS.map((c) => c.id)))} className="w-3.5 h-3.5 accent-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-700">الكل</span>
                </label>
                {CATEGORY_OPTIONS.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={reportCats.has(c.id)} onChange={() => toggleCat(c.id)} className="w-3.5 h-3.5 accent-indigo-600" />
                    <span className="text-[11px] font-bold text-slate-700">{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2"><span className="text-[10px] text-indigo-600 font-bold block">الأصناف</span><strong className="text-sm font-extrabold text-indigo-800">{reportRows.length}</strong></div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2"><span className="text-[10px] text-amber-600 font-bold block">تكلفة الأغذية</span><strong className="text-sm font-extrabold text-amber-800 font-mono">{fmt(reportTotals.foodCost, 2)}</strong></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><span className="text-[10px] text-emerald-600 font-bold block">إجمالي التكلفة</span><strong className="text-sm font-extrabold text-emerald-800 font-mono">{fmt(reportTotals.totalCost, 2)}</strong></div>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            {reportRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-2 text-right font-bold">الصنف</th>
                      <th className="p-2 text-right font-bold">سعر البيع</th>
                      <th className="p-2 text-right font-bold">الصافي</th>
                      <th className="p-2 text-right font-bold">تكلفة الأغذية</th>
                      <th className="p-2 text-right font-bold">التغليف</th>
                      <th className="p-2 text-right font-bold">إجمالي التكلفة</th>
                      <th className="p-2 text-right font-bold">نسبة الأغذية %</th>
                      <th className="p-2 text-right font-bold">نسبة التكلفة الإجمالية %</th>
                      <th className="p-2 text-right font-bold">السعر المقترح (28%)</th>
                      <th className="p-2 text-right font-bold">الصافي بعد التعديل</th>
                      <th className="p-2 text-right font-bold">نسبة التكلفة بعد التعديل %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row) => (
                      <tr key={row.r.id} className={`${row.net && row.foodCostPct > TARGET_FC_PCT ? 'bg-rose-50/60' : 'hover:bg-slate-50'}`}>
                        <td className="p-2">
                          <span className="font-bold text-slate-800">{row.r.nameAr}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">{row.r.code}</span>
                        </td>
                        <td className="tnum text-left p-2">{row.gross ? fmt(row.gross, 2) : '—'}</td>
                        <td className="tnum text-left p-2 text-indigo-700">{row.net ? fmt(row.net, 2) : '—'}</td>
                        <td className="tnum text-left p-2">{fmt(row.foodCost, 2)}</td>
                        <td className="tnum text-left p-2">{fmt(row.packaging, 2)}</td>
                        <td className="tnum text-left p-2 font-bold text-slate-800">{fmt(row.totalCost, 2)}</td>
                        <td className={`p-2 font-mono font-bold ${row.net && row.foodCostPct > TARGET_FC_PCT ? 'text-rose-600' : 'text-emerald-700'}`}>{row.net ? `${row.foodCostPct.toFixed(2)}%` : '—'}</td>
                        <td className="tnum text-left p-2 text-amber-700">{row.net ? `${row.totalCostPct.toFixed(2)}%` : '—'}</td>
                        <td className="tnum text-left p-2 font-bold text-rose-600">{row.sugg.gross ? fmt(row.sugg.gross, 0) : '—'}</td>
                        <td className="tnum text-left p-2 text-indigo-700">{row.sugg.net ? fmt(row.sugg.net, 2) : '—'}</td>
                        <td className="tnum text-left p-2 text-emerald-700">{row.sugg.net ? `${row.totalCostPctAfter.toFixed(2)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-200">
                      <td className="p-2" colSpan={4}>الإجمالي ({reportRows.length} صنف)</td>
                      <td className="tnum text-left p-2">{reportTotals.gross ? fmt(reportTotals.gross, 2) : '—'}</td>
                      <td className="tnum text-left p-2 text-indigo-700">{reportTotals.net ? fmt(reportTotals.net, 2) : '—'}</td>
                      <td className="tnum text-left p-2">{fmt(reportTotals.foodCost, 2)}</td>
                      <td className="tnum text-left p-2">{fmt(reportTotals.packaging, 2)}</td>
                      <td className="tnum text-left p-2 text-indigo-800">{fmt(reportTotals.totalCost, 2)}</td>
                      <td className="tnum text-left p-2">{reportTotals.foodCostPct !== null ? `${reportTotals.foodCostPct.toFixed(2)}%` : '—'}</td>
                      <td className="tnum text-left p-2">{reportTotals.totalCostPct !== null ? `${reportTotals.totalCostPct.toFixed(2)}%` : '—'}</td>
                      <td className="tnum text-left p-2">{reportTotals.suggGross ? fmt(reportTotals.suggGross, 0) : '—'}</td>
                      <td className="tnum text-left p-2">{reportTotals.suggNet ? fmt(reportTotals.suggNet, 2) : '—'}</td>
                      <td className="tnum text-left p-2 text-emerald-700">{reportTotals.totalCostPctAfter !== null ? `${reportTotals.totalCostPctAfter.toFixed(2)}%` : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-center text-slate-400 text-sm py-6">اختر تصنيفاً واحداً على الأقل لعرض التقرير</p>
            )}
          </Card>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل وصفة' : 'وصفة معيارية جديدة'} wide>
        {editingId && <DocumentFingerprint entityType="recipe" entityId={editingId} />}
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <Field label="الاسم بالعربية" required><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputCls} required /></Field>
            <Field label="الاسم بالإنجليزي (لفودكس)"><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} placeholder="مثلاً: Masoobi" /></Field>
            <Field label="التصنيف"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as StandardRecipeCategory })} className={inputCls}>
              <option value="main_dish">طبق رئيسي</option><option value="appetizer">مقبلات</option><option value="beverage">مشروبات</option><option value="dessert">حلويات</option><option value="sub_prep">تحضير مسبق</option>
            </select></Field>
          </div>
          {/* قسم فرعي — لوصفات الطعام المرئية فقط (ليست تحضيراً مسبقاً ولا تحضيراً مركزياً) */}
          {!form.isCentralKitchenPrep && form.category !== 'sub_prep' && (
            <div className="grid grid-cols-2 gap-2 items-end">
              <Field label="القسم / المجموعة الفرعية (اختياري)">
                <input list="recipe-section-options" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className={inputCls} placeholder="مثال: مشويات وشوي" onKeyDown={navOnEnter} data-nav />
                <datalist id="recipe-section-options">
                  {sectionOptions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <div className="text-[10px] text-slate-400 pb-2">تُرتَّب الطباعة والتصدير حسب القسم داخل كل تصنيف.</div>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            <Field label="مقاس الحصة"><input value={form.portionSize} onChange={(e) => setForm({ ...form, portionSize: e.target.value })} className={inputCls} /></Field>
            <Field label="عدد القطع الناتجة"><input type="number" min="1" step="1" data-nav value={form.yieldPieces || ''} onChange={(e) => setForm({ ...form, yieldPieces: parseInt(e.target.value) || 1 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="وقت التحضير (دقيقة)"><input type="number" step="1" data-nav value={form.prepTimeMins} onChange={(e) => setForm({ ...form, prepTimeMins: parseInt(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="الهامش المستهدف %"><input type="number" step="0.01" data-nav value={form.targetMarginPercent} onChange={(e) => setForm({ ...form, targetMarginPercent: parseFloat(e.target.value) || 72 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="عمالة مباشرة"><input type="number" step="any" data-nav value={form.directLaborCost || ''} onChange={(e) => setForm({ ...form, directLaborCost: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="تغليف"><input type="number" step="any" data-nav value={form.packagingCost || ''} onChange={(e) => setForm({ ...form, packagingCost: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="سعر المنيو الفعلي (شامل ضريبة)"><input type="number" step="any" data-nav value={form.actualMenuPrice || ''} onChange={(e) => setForm({ ...form, actualMenuPrice: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-700 text-xs"><input type="checkbox" checked={form.isCentralKitchenPrep} onChange={(e) => setForm({ ...form, isCentralKitchenPrep: e.target.checked })} /> صنف تحضير مركزي (لا يباع مباشرة)</label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">المكونات</span>
              <Btn onClick={addIngredient}><Plus className="w-3.5 h-3.5" /> مكون</Btn>
            </div>
            {form.ingredients.map((ing, idx) => {
              const ingMat = rawMaterials.find((x) => x.id === ing.rawMaterialId);
              const ingUnit = ingMat && ingMat.tradeUomName && ingMat.tradeUomName.trim() ? ingMat.tradeUomName : ingMat?.unit || '';
              return (
              <div key={idx} className="grid grid-cols-[1fr_110px_60px_90px_36px] gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-2">
                <div className="col-span-2"><AutocompleteSelect
                    value={ing.rawMaterialId}
                    onChange={(val) => updateIngredient(idx, { rawMaterialId: val })}
                    options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                    getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                    placeholder="— اختر مادة خام —"
                    className="w-full"
                  /></div>
                <div>
                  <div className="relative">
                    <input type="number" step="0.001" data-nav value={ing.quantity || ''} onChange={(e) => updateIngredient(idx, { quantity: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="الكمية" />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">{ingUnit || 'وحدة'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" step="0.01" data-nav value={ing.wastagePercent || ''} onChange={(e) => updateIngredient(idx, { wastagePercent: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="هدر %" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }))} className="text-rose-500 p-1"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              );
            })}
            {form.ingredients.length === 0 && <p className="text-center text-slate-400 text-xs py-3">أضف مكونات للوصفة</p>}
          </div>

          {!form.isCentralKitchenPrep && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">أصناف التحضير الأساسية المستهلكة <span className="text-[10px] text-slate-400 font-medium">(تصنع بالمطبخ المركزي وتُستهلك من رصيد الفرع عند البيع)</span></span>
                <Btn onClick={() => setForm((f) => ({ ...f, subPrepIngredients: [...f.subPrepIngredients, { recipeId: prepRecipes[0]?.id || '', quantity: 0 }] }))}><Plus className="w-3.5 h-3.5" /> إضافة</Btn>
              </div>
              {form.subPrepIngredients.map((sp, idx) => {
                const sub = recipes.find((x) => x.id === sp.recipeId);
                const subTotal = sub ? (sub.totalCalculatedCost > 0 ? sub.totalCalculatedCost : calculateRecipeCosts(sub.ingredients, sub.directLaborCost, sub.packagingCost, sub.subPrepIngredients, sub.yieldPieces).totalCost) : 0;
                const subUnitCost = subTotal / (sub?.yieldPieces || 1);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_120px_90px_36px] gap-2 items-end bg-amber-50/60 border border-amber-200 rounded-xl p-2">
                    <select value={sp.recipeId} onChange={(e) => setForm((f) => ({ ...f, subPrepIngredients: f.subPrepIngredients.map((x, i) => (i === idx ? { ...x, recipeId: e.target.value } : x)) }))} className={inputCls}>
                      {prepRecipes.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
                    </select>
                    <input type="number" step="0.001" data-nav value={sp.quantity || ''} onChange={(e) => setForm((f) => ({ ...f, subPrepIngredients: f.subPrepIngredients.map((x, i) => (i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x)) }))} onKeyDown={navOnEnter} className={inputCls} placeholder="الكمية لكل حصة" />
                    <span className="text-[10px] text-amber-800 font-bold self-center text-center whitespace-nowrap">{sub ? `${fmt(sp.quantity * subUnitCost, 2)} ر.س` : '—'}</span>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, subPrepIngredients: f.subPrepIngredients.filter((_, i) => i !== idx) }))} className="text-rose-500 p-1"><X className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
              {prepRecipes.length === 0 && <p className="text-center text-amber-600 text-xs py-2">لا توجد أصناف تحضير أساسية — أنشئ وصفة بعلامة "تحضير مركزي" أولاً</p>}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div><span className="text-slate-500 text-[10px] block">خامات (مكونات + هدر)</span><strong className="font-mono text-xs text-slate-800">{fmt(liveCosts.foodCost - liveCosts.subPrepCost, 2)}</strong></div>
            <div><span className="text-amber-700 text-[10px] block">التحضيرات الأساسية</span><strong className="font-mono text-xs text-amber-800">{fmt(liveCosts.subPrepCost, 2)}</strong></div>
            <div><span className="text-slate-500 text-[10px] block">عمالة + تغليف</span><strong className="font-mono text-xs text-slate-800">{fmt(form.directLaborCost + form.packagingCost, 2)}</strong></div>
            <div><span className="text-slate-700 text-[10px] block">تكلفة الأغذية</span><strong className="font-mono text-xs text-indigo-700">{fmt(liveCosts.foodCost, 2)}</strong></div>
            <div><span className="text-slate-500 text-[10px] block">إجمالي التكلفة</span><strong className="font-mono text-xs text-slate-800">{fmt(liveCosts.totalCost, 2)}</strong></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3">
            <div><span className="text-indigo-600 text-[10px] block">سعر البيع المقترح (صافي لهدف {TARGET_FC_PCT}% من الإجمالي)</span><strong className="font-mono text-xs text-indigo-700">{liveSugg.net ? fmt(liveSugg.net, 2) : '—'}</strong></div>
            <div><span className="text-amber-600 text-[10px] block">سعر البيع المقترح (شامل ضريبة)</span><strong className="font-mono text-xs text-amber-700">{liveSugg.gross ? fmt(liveSugg.gross, 0) : '—'}</strong></div>
            <div><span className="text-emerald-600 text-[10px] block">نسبة التكلفة الإجمالية بعد التعديل</span><strong className="font-mono text-xs text-emerald-700">{liveSugg.net && liveCosts.totalCost > 0 ? `${(liveCosts.totalCost / liveSugg.net * 100).toFixed(2)}%` : '—'}</strong></div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editingId ? 'حفظ' : 'إنشاء'}</button>
          </div>
        </form>
      </Modal>

      {/* نافذة نسخ الوصفة مع فرق التكلفة قبل/بعد واعتماد مرن (بند 39) */}
      {copySource && copyOrigCosts && copyNewCosts && (
        <Modal open onClose={() => setCopySource(null)} title={`نسخ: «${copySource.nameAr}»`} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="اسم النسخة الجديدة"><input className={inputCls} value={copyName} onChange={(e) => setCopyName(e.target.value)} autoFocus /></Field>
              <Field label="معامل الكميات (مضاعف المكونات) — 1 = نفس الأصلية"><input type="number" step="0.05" min="0.05" className={inputCls} value={copyMult || ''} onChange={(e) => setCopyMult(parseFloat(e.target.value) || 1)} /></Field>
            </div>
            <Field label="ملاحظة (اختياري)"><input className={inputCls} value={copyNote} onChange={(e) => setCopyNote(e.target.value)} placeholder="مثال: توصية المشرف — تعديل مقاس الحصة" /></Field>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div><span className="text-slate-500 text-[10px] block">التكلفة قبل النسخ (الأصلية)</span><strong className="font-mono text-xs text-slate-500">{fmt(copyOrigCosts.totalCost, 2)} ر.س</strong></div>
              <div><span className="text-slate-500 text-[10px] block">التكلفة بعد النسخ (الجديدة)</span><strong className="font-mono text-xs text-slate-800">{fmt(copyNewCosts.totalCost, 2)} ر.س</strong></div>
              <div><span className="text-slate-500 text-[10px] block">الفرق</span><strong className={`font-mono text-xs ${copyDelta > 0.005 ? 'text-rose-600' : copyDelta < -0.005 ? 'text-emerald-600' : 'text-slate-500'}`}>{copyDelta > 0.005 ? '▲' : copyDelta < -0.005 ? '▼' : '—'} {fmt(Math.abs(copyDelta), 2)} ر.س</strong></div>
              <div><span className="text-slate-500 text-[10px] block">السعر المقترح (شامل ضريبة)</span><strong className="font-mono text-xs text-indigo-700">{copyNewCosts.totalCost ? fmt(suggestedForTarget(copyNewCosts.totalCost).gross, 0) : '—'} ر.س</strong></div>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
              <p className="text-xs font-bold text-violet-800">الاعتماد المرن</p>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={copyDraft} onChange={(e) => setCopyDraft(e.target.checked)} /> حفظ كمسودة بانتظار الاعتماد (لا تُفعل في المنيو والبريد حتى يتم اعتمادها)</label>
              <p className="text-[10px] text-slate-500">عند الاعتماد المباشر تُفعَّل النسخة فوراً وتُحسب تكلفتها بأسعار اليوم. يمكنك الاحتفاظ بها كمسودة ومراجعتها لاحقاً من القائمة (شارة "مسودة").</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCopySource(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
              {copyDraft ? (
                <button onClick={confirmCopy} className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium gap-2 flex items-center"><Clock className="w-4 h-4" /> حفظ كمسودة</button>
              ) : (
                <button onClick={confirmCopy} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium gap-2 flex items-center"><CheckCircle2 className="w-4 h-4" /> اعتماد مباشر</button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};