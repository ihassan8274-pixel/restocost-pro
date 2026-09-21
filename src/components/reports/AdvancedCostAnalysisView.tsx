import React, { useMemo, useState } from 'react';
import { Activity, ArrowRightLeft, FileSpreadsheet, Printer, ShieldAlert, Sparkles, TrendingUp, TrendingDown, Calculator } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, TabBar, Btn, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { AIAnalyzeModal } from '../ai/AIAnalyzeModal';

type TabId = 'variance' | 'prices' | 'simulation' | 'service' | 'wastage_ai';

const WASTAGE_CAT_LABELS: Record<string, string> = {
  prep_waste: 'هدر تحضير', cooking_burn: 'حرق طهي', expired: 'منتهي الصلاحية',
  damaged_storage: 'تلف تخزين', returned_food: 'مرتجع', sample_taste: 'عينة/تذوق',
};

export const AdvancedCostAnalysisView: React.FC = () => {
  const {
    visibleBranchIds, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs,
    grnNotes, stockTransfers, inventory, rawMaterials, recipes, getAverageUnitCost, getBranchName,
    calculateRecipeCosts, globalTargetMarginPercent,
  } = useApp();
  const [tab, setTab] = useState<TabId>('variance');
  const [aiOpen, setAiOpen] = useState(false);
  const [loseOpen, setLoseOpen] = useState(false);
  const [simRecipeId, setSimRecipeId] = useState('');
  const [simNewPrice, setSimNewPrice] = useState(0);
  const [simTargetMargin, setSimTargetMargin] = useState(globalTargetMarginPercent);

  const branchIds = useMemo(() => Array.from(new Set([
    ...visibleBranchIds, 'b-ck',
    ...posOrders.map((o) => o.branchId), ...batchSalesRecords.map((b) => b.branchId),
    ...stockTransfers.map((t) => t.fromBranchId), ...stockTransfers.map((t) => t.toBranchId),
    ...operatingExpenses.map((e) => e.branchId),
  ])), [visibleBranchIds, posOrders, batchSalesRecords, stockTransfers, operatingExpenses]);

  const revenueByBranch = (id: string) =>
    posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.subtotal, 0) +
    batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
  const foodCostByBranch = (id: string) =>
    posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.totalCost, 0) +
    batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + b.totalFoodCost, 0);
  const ordersByBranch = (id: string) =>
    posOrders.filter((o) => o.branchId === id).length + batchSalesRecords.filter((b) => b.branchId === id).length;

  const varianceRows = useMemo(() => branchIds.map((id) => {
    const name = id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id);
    const theoretical = foodCostByBranch(id);
    const purchases = grnNotes.filter((g) => g.status === 'approved' && g.branchId === id).reduce((s, g) => s + g.totalAmount, 0);
    const transferIn = stockTransfers.filter((t) => t.status === 'approved' && t.toBranchId === id).reduce((s, t) => s + t.items.reduce((si, it) => si + it.quantity * it.unitCost, 0), 0);
    const transferOut = stockTransfers.filter((t) => t.status === 'approved' && t.fromBranchId === id).reduce((s, t) => s + t.items.reduce((si, it) => si + it.quantity * it.unitCost, 0), 0);
    const closing = inventory.filter((i) => i.branchId === id).reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
    const wastage = wastageLogs.filter((w) => w.branchId === id).reduce((s, w) => s + w.totalCostImpact, 0);
    const actual = purchases + transferIn - transferOut - closing - wastage;
    const variance = actual - theoretical;
    return {
      id, name, theoretical, actual, variance, closing,
      variancePct: theoretical ? (variance / theoretical) * 100 : 0,
      actualPctOfTheoretical: theoretical ? (actual / theoretical) * 100 : 0,
    };
  }).filter((r) => r.theoretical > 0 || r.actual > 0).sort((a, b) => b.variance - a.variance), [branchIds, posOrders, batchSalesRecords, grnNotes, stockTransfers, inventory, wastageLogs, getAverageUnitCost, getBranchName]);

  const matSuspectRows = useMemo(() => {
    const theoForRecipe = (recipeId: string, qty: number, matId: string) => {
      const r = recipes.find((x) => x.id === recipeId);
      if (!r) return 0;
      return r.ingredients.filter((ing) => ing.rawMaterialId === matId)
        .reduce((s, ing) => s + ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * qty, 0);
    };
    return rawMaterials.map((mat) => {
      const id = mat.id;
      const inflow = grnNotes.filter((g) => g.status === 'approved').reduce((s, g) => s + g.items.filter((i) => i.rawMaterialId === id).reduce((si, i) => si + i.quantityReceived, 0), 0)
        + stockTransfers.filter((t) => t.status === 'approved' && t.toBranchId === id).reduce((s, t) => s + t.items.filter((it) => it.rawMaterialId === id).reduce((si, it) => si + it.quantity, 0), 0)
        - stockTransfers.filter((t) => t.status === 'approved' && t.fromBranchId === id).reduce((s, t) => s + t.items.filter((it) => it.rawMaterialId === id).reduce((si, it) => si + it.quantity, 0), 0);
      const closing = inventory.filter((i) => i.rawMaterialId === id).reduce((s, i) => s + i.quantity, 0);
      const wastageQty = wastageLogs.filter((w) => w.rawMaterialId === id).reduce((s, w) => s + w.quantity, 0);
      const actual = inflow - closing - wastageQty;
      const theoretical = posOrders.reduce((s, o) => s + o.items.reduce((si, it) => si + theoForRecipe(it.recipeId, it.quantity, id), 0), 0)
        + batchSalesRecords.reduce((s, b) => s + b.items.reduce((si, it) => si + theoForRecipe(it.recipeId, it.quantitySold, id), 0), 0);
      const diff = actual - theoretical;
      return { name: mat.nameAr, unit: mat.unit, theoretical, actual, diff, value: diff * getAverageUnitCost(id) };
    }).filter((r) => r.theoretical > 0.001).sort((a, b) => b.value - a.value);
  }, [rawMaterials, grnNotes, stockTransfers, inventory, wastageLogs, posOrders, batchSalesRecords, recipes, getAverageUnitCost]);

  const priceRows = useMemo(() => rawMaterials.map((mat) => {
    const receipts = grnNotes.filter((g) => g.status === 'approved').flatMap((g) => g.items.filter((i) => i.rawMaterialId === mat.id).map((i) => ({ date: g.date, price: i.unitPrice })));
    if (receipts.length === 0) return null;
    const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].price, last = sorted[sorted.length - 1].price;
    const prices = sorted.map((r) => r.price);
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { id: mat.id, name: mat.nameAr, unit: mat.unit, count: receipts.length, first, last, min: Math.min(...prices), max: Math.max(...prices), change, current: getAverageUnitCost(mat.id) };
  }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => b.change - a.change), [rawMaterials, grnNotes, getAverageUnitCost]);

  const affectedRecipes = useMemo(() => {
    const upIds = new Set(priceRows.filter((p) => p.change > 15).map((p) => p.id));
    return recipes.filter((r) => !r.isCentralKitchenPrep && r.ingredients.some((ing) => upIds.has(ing.rawMaterialId))).map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice || costs.suggestedPrice;
      const target = r.targetMarginPercent ?? globalTargetMarginPercent;
      return { name: r.nameAr, code: r.code, foodCost: costs.foodCost, fcPct: price ? (costs.foodCost / price) * 100 : 0, targetFc: 100 - target };
    }).sort((a, b) => b.fcPct - a.fcPct);
  }, [recipes, priceRows, calculateRecipeCosts, globalTargetMarginPercent]);

  const totalRev = useMemo(() => branchIds.reduce((s, id) => s + (id === 'b-ck' ? 0 : revenueByBranch(id)), 0), [branchIds, posOrders, batchSalesRecords]);
  const centralPaid = useMemo(() => operatingExpenses.filter((e) => e.branchId === 'central' && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0), [operatingExpenses]);

  const serviceRows = useMemo(() => branchIds.map((id) => {
    const rev = revenueByBranch(id);
    const orders = ordersByBranch(id);
    const foodCost = foodCostByBranch(id);
    const labor = shifts.filter((s) => s.branchId === id).reduce((s, sh) => s + sh.totalShiftCost, 0);
    const directOpex = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
    const centralShare = id !== 'b-ck' && totalRev > 0 ? centralPaid * (rev / totalRev) : 0;
    const service = labor + directOpex + centralShare;
    return {
      id, name: id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id), rev, orders, foodCost, labor, directOpex, centralShare, service,
      servicePerOrder: orders ? service / orders : 0,
      profitPerOrder: orders ? (rev - foodCost - service) / orders : 0,
      margin: rev ? ((rev - foodCost - service) / rev) * 100 : 0,
    };
  }).filter((r) => r.orders > 0 || r.rev > 0).sort((a, b) => b.rev - a.rev), [branchIds, posOrders, batchSalesRecords, shifts, operatingExpenses, centralPaid, totalRev, getBranchName]);

  const selectedRecipe = recipes.find((r) => r.id === simRecipeId) || recipes[0];
  const simCosts = selectedRecipe ? calculateRecipeCosts(selectedRecipe.ingredients, selectedRecipe.directLaborCost, selectedRecipe.packagingCost) : null;
  const simSoldQty = useMemo(() => {
    if (!selectedRecipe) return 0;
    return posOrders.reduce((s, o) => s + o.items.filter((it) => it.recipeId === selectedRecipe.id).reduce((si, it) => si + it.quantity, 0), 0)
      + batchSalesRecords.reduce((s, b) => s + b.items.filter((it) => it.recipeId === selectedRecipe.id).reduce((si, it) => si + it.quantitySold, 0), 0);
  }, [selectedRecipe, posOrders, batchSalesRecords]);
  const simCurrentPrice = selectedRecipe?.actualMenuPrice || simCosts?.suggestedPrice || 0;
  const simEffPrice = simNewPrice > 0 ? simNewPrice : simCurrentPrice;
  const simSuggested = simCosts ? simCosts.totalCost / (1 - simTargetMargin / 100) : 0;
  const simCurrentProfit = (simCurrentPrice - (simCosts?.totalCost || 0)) * simSoldQty;
  const simNewProfit = (simEffPrice - (simCosts?.totalCost || 0)) * simSoldQty;

  const smartSuggestions = useMemo(() => recipes
    .filter((r) => !r.isCentralKitchenPrep && (r.actualMenuPrice || 0) > 0)
    .map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const margin = r.targetMarginPercent ?? globalTargetMarginPercent;
      const suggested = costs.totalCost / (1 - margin / 100);
      const price = r.actualMenuPrice;
      const diff = suggested - price;
      const qty = posOrders.reduce((s, o) => s + o.items.filter((it) => it.recipeId === r.id).reduce((si, it) => si + it.quantity, 0), 0)
        + batchSalesRecords.reduce((s, b) => s + b.items.filter((it) => it.recipeId === r.id).reduce((si, it) => si + it.quantitySold, 0), 0);
      return { name: r.nameAr, code: r.code, price, cost: costs.totalCost, suggested, diff, qty, revImpact: Math.max(0, diff) * qty };
    })
    .sort((a, b) => b.revImpact - a.revImpact)
    .slice(0, 10), [recipes, calculateRecipeCosts, globalTargetMarginPercent, posOrders, batchSalesRecords]);

  const wastageTotal = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const wastageCount = wastageLogs.length;
  const wastageByCat = wastageLogs.reduce<Record<string, number>>((acc, w) => { acc[w.category] = (acc[w.category] || 0) + w.totalCostImpact; return acc; }, {});
  const wastageByBranch = wastageLogs.reduce<Record<string, number>>((acc, w) => { acc[w.branchId] = (acc[w.branchId] || 0) + w.totalCostImpact; return acc; }, {});
  const wastageByMat = wastageLogs.filter((w) => w.rawMaterialId).reduce<Record<string, number>>((acc, w) => { acc[w.rawMaterialId!] = (acc[w.rawMaterialId!] || 0) + w.totalCostImpact; return acc; }, {});
  const foodCostTotal = posOrders.reduce((s, o) => s + o.totalCost, 0) + batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const topCat = Object.entries(wastageByCat).sort((a, b) => b[1] - a[1])[0];
  const topBranch = Object.entries(wastageByBranch).sort((a, b) => b[1] - a[1])[0];
  const topMat = Object.entries(wastageByMat).sort((a, b) => b[1] - a[1])[0];

  const highFcRecipes = useMemo(() => recipes
    .filter((r) => !r.isCentralKitchenPrep)
    .map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice || costs.suggestedPrice;
      const pct = price ? (costs.foodCost / price) * 100 : 0;
      const targetFc = 100 - (r.targetMarginPercent ?? globalTargetMarginPercent);
      return { name: r.nameAr, pct, targetFc, excess: pct - targetFc };
    })
    .filter((r) => r.excess > 0)
    .sort((a, b) => b.excess - a.excess)
    .slice(0, 5), [recipes, calculateRecipeCosts, globalTargetMarginPercent]);

  const loseInsights = useMemo(() => {
    const out: string[] = [];
    const topVar = varianceRows.find((r) => r.variance > 0);
    if (topVar) out.push(`أعلى استهلاك زائد: ${topVar.name} بانحراف +${fmtMoney(topVar.variance)} (${topVar.variancePct.toFixed(2)}%) مقابل النظري.`);
    const suspect = matSuspectRows.find((r) => r.diff > 0.001);
    if (suspect) out.push(`أخطر مادة باستهلاك زائد: ${suspect.name} (${suspect.diff.toFixed(2)} ${suspect.unit}) بقيمة ${fmtMoney(suspect.value)} — هدر/سرقة/خطأ صرف محتمل.`);
    if (highFcRecipes.length > 0) out.push(`أعلى الأطباق Food Cost: ${highFcRecipes[0].name} بـ ${highFcRecipes[0].pct.toFixed(2)}% (المستهدف ${highFcRecipes[0].targetFc.toFixed(2)}%) — تفوق ${highFcRecipes[0].excess.toFixed(2)} نقطة.`);
    out.push(`الهالك الإجمالي ${fmtMoney(wastageTotal)} (${wastageCount} سجل).`);
    if (wastageTotal / Math.max(1, foodCostTotal) > 0.05) out.push(`الهالك يتجاوز 5% من تكلفة الطعام — تصحيح مطلوب.`);
    return out;
  }, [varianceRows, matSuspectRows, highFcRecipes, wastageTotal, wastageCount, foodCostTotal]);

  const losePrompt = () => [
    `الانحراف حسب الفرع:\n${varianceRows.map((r) => `${r.name}: نظري ${r.theoretical.toFixed(2)} / فعلي ${r.actual.toFixed(2)} / انحراف ${r.variance.toFixed(2)} (${r.variancePct.toFixed(2)}%)`).join('\n')}`,
    `مواد باستهلاك زائد:\n${matSuspectRows.filter((r) => r.diff > 0.001).slice(0, 10).map((r) => `${r.name}: فرق ${r.diff.toFixed(2)} ${r.unit} بقيمة ${r.value.toFixed(2)}`).join('\n')}`,
    `أعلى الأطباق Food Cost:\n${highFcRecipes.map((r) => `${r.name}: FC ${r.pct.toFixed(2)}% (مستهدف ${r.targetFc.toFixed(2)}%)`).join('\n')}`,
    `الهالك الإجمالي ${wastageTotal.toFixed(2)} (${wastageCount} سجل) وهو ${foodCostTotal ? ((wastageTotal / foodCostTotal) * 100).toFixed(2) : 0}% من تكلفة الطعام.`,
    'اكتب تقريراً بالعربية بعنوان "أين تخسر المال؟": ابدأ بأكبر مصدر خسارة مرتباً تنازلياً، ثم 5 توصيات عملية بالأولوية لاسترداد التكلفة. استخدم الأرقام حرفياً.',
  ].join('\n');

  const wastageInsights = useMemo(() => {
    const out: string[] = [];
    out.push(`إجمالي الهالك ${fmtMoney(wastageTotal)} عبر ${wastageCount} سجل — متوسط ${wastageCount ? fmt(wastageTotal / wastageCount, 2) : 0} ر.س لكل سجل.`);
    if (foodCostTotal > 0) out.push(`الهالك يمثل ${((wastageTotal / foodCostTotal) * 100).toFixed(2)}% من تكلفة الطعام الكلية — ${wastageTotal / foodCostTotal > 0.05 ? 'أعلى من حد 5% ويستوجب تدخلاً.' : 'ضمن الحد المقبول (أقل من 5%).'}`);
    if (topBranch) out.push(`الأعلى هالكاً: ${getBranchName(topBranch[0])} بقيمة ${fmtMoney(topBranch[1])}.`);
    if (topCat) out.push(`أكثر فئة: ${WASTAGE_CAT_LABELS[topCat[0]] || topCat[0]} بقيمة ${fmtMoney(topCat[1])} (${wastageTotal ? ((topCat[1] / wastageTotal) * 100).toFixed(2) : 0}% من الهالك).`);
    if (topMat) out.push(`أكثر مادة: ${rawMaterials.find((m) => m.id === topMat[0])?.nameAr || topMat[0]} بقيمة ${fmtMoney(topMat[1])}.`);
    const approvedPct = wastageCount ? (wastageLogs.filter((w) => w.isApproved).length / wastageCount) * 100 : 0;
    out.push(`${approvedPct.toFixed(2)}% من سجلات الهالك معتمدة — مراجعة السجلات غير المعتمدة.`);
    return out;
  }, [wastageTotal, wastageCount, foodCostTotal, topBranch, topCat, topMat, rawMaterials, wastageLogs, getBranchName]);

  const wastageBuildPrompt = () => {
    const catLines = Object.entries(wastageByCat).map(([c, v]) => `${WASTAGE_CAT_LABELS[c] || c}: ${v.toFixed(2)}`).join('\n');
    const branchLines = Object.entries(wastageByBranch).map(([b, v]) => `${getBranchName(b)}: ${v.toFixed(2)}`).join('\n');
    const recent = wastageLogs.slice(0, 10).map((w) => `${w.itemName} (${WASTAGE_CAT_LABELS[w.category] || w.category}): ${w.totalCostImpact.toFixed(2)} — ${w.reason || 'بدون سبب'}`).join('\n');
    return [
      `إجمالي الهالك ${wastageTotal.toFixed(2)} ر.س عبر ${wastageCount} سجل، وهو ${foodCostTotal ? ((wastageTotal / foodCostTotal) * 100).toFixed(2) : 0}% من تكلفة الطعام.`,
      `حسب الفئة:\n${catLines}`,
      `حسب الفرع:\n${branchLines}`,
      `آخر السجلات:\n${recent}`,
      'اكتب تحليلاً لأسباب الهالك بالعربية (3-5 فقرات) واقترح 5 إجراءات عملية مرتبة بالأولوية لتقليل الهالك في الفروع. استخدم الأرقام حرفياً.',
    ].join('\n');
  };

  const exportSheets = [
    { name: 'انحراف نظري vs فعلي', header: ['الفرع', 'النظري (مبيعات)', 'الفعلي (مستهلك)', 'الانحراف', 'الانحراف %'], rows: varianceRows.map((r) => [r.name, r.theoretical.toFixed(2), r.actual.toFixed(2), r.variance.toFixed(2), r.variancePct.toFixed(2)]) },
    { name: 'مواد مشتبهة', header: ['المادة', 'الوحدة', 'نظري', 'فعلي', 'الفرق', 'القيمة ر.س'], rows: matSuspectRows.filter((r) => r.diff > 0.001).slice(0, 25).map((r) => [r.name, r.unit, r.theoretical.toFixed(2), r.actual.toFixed(2), r.diff.toFixed(2), r.value.toFixed(2)]) },
    { name: 'سجل أسعار المواد', header: ['المادة', 'استلامات', 'أول سعر', 'آخر سعر', 'أدنى', 'أعلى', 'التغير %'], rows: priceRows.map((p) => [p.name, p.count, p.first.toFixed(2), p.last.toFixed(2), p.min.toFixed(2), p.max.toFixed(2), p.change.toFixed(2)]) },
    { name: 'وصفات متأثرة بأسعار مرتفعة', header: ['الصنف', 'الكود', 'تكلفة الطعام', 'FC %', 'المستهدف %'], rows: affectedRecipes.map((r) => [r.name, r.code, r.foodCost.toFixed(2), r.fcPct.toFixed(2), r.targetFc.toFixed(2)]) },
    { name: 'مقترحات أسعار ذكية', header: ['الصنف', 'السعر الحالي', 'التكلفة', 'المقترح', 'الفرق', 'الكمية', 'أثر إيراد'], rows: smartSuggestions.map((s) => [s.name, s.price.toFixed(2), s.cost.toFixed(2), s.suggested.toFixed(2), s.diff.toFixed(2), s.qty, s.revImpact.toFixed(2)]) },
    { name: 'تكلفة الخدمة لكل عملية', header: ['الفرع', 'الإيراد', 'العمليات', 'خدمة لكل عملية', 'ربح لكل عملية', 'الهامش %'], rows: serviceRows.map((s) => [s.name, s.rev.toFixed(2), s.orders, s.servicePerOrder.toFixed(2), s.profitPerOrder.toFixed(2), s.margin.toFixed(2)]) },
    { name: 'الهالك حسب الفئة', header: ['الفئة', 'القيمة'], rows: Object.entries(wastageByCat).map(([c, v]) => [WASTAGE_CAT_LABELS[c] || c, v]) },
    { name: 'رصيد نهاية الفترة حسب الفرع', header: ['الفرع', 'قيمة المخزون'], rows: [...varianceRows.map((r) => [r.name, r.closing.toFixed(2)]), ['الإجمالي', varianceRows.reduce((s, r) => s + r.closing, 0).toFixed(2)]] },
  ];

  const printReport = () => {
    openPrintWindow({
      title: 'تحليل التكلفة المتقدم',
      subtitle: 'انحراف، أسعار، محاكاة، خدمة، هالك',
      meta: [['إجمالي الهالك', `${fmtMoney(wastageTotal)}`], ['تكلفة الطعام', `${fmtMoney(foodCostTotal)}`], ['مصروف مركزي', `${fmtMoney(centralPaid)}`], ['رصيد المخزون', `${fmtMoney(varianceRows.reduce((s, r) => s + r.closing, 0))}`]],
      tables: [
        { title: 'انحراف نظري vs فعلي', header: ['الفرع', 'النظري', 'الفعلي', 'الانحراف', 'الانحراف %'], rows: varianceRows.map((r) => [r.name, fmt(r.theoretical, 0), fmt(r.actual, 0), fmt(r.variance, 0), r.variancePct.toFixed(2)]) },
        { title: 'رصيد نهاية الفترة حسب الفرع', header: ['الفرع', 'قيمة المخزون'], rows: varianceRows.map((r) => [r.name, fmt(r.closing, 0)]) },
        { title: 'سجل أسعار المواد (الأعلى تغيراً)', header: ['المادة', 'أول سعر', 'آخر سعر', 'التغير %'], rows: priceRows.slice(0, 15).map((p) => [p.name, p.first.toFixed(2), p.last.toFixed(2), p.change.toFixed(2)]) },
        { title: 'تكلفة الخدمة لكل عملية', header: ['الفرع', 'الإيراد', 'العمليات', 'خدمة/عملية', 'ربح/عملية'], rows: serviceRows.map((s) => [s.name, fmt(s.rev, 0), s.orders, s.servicePerOrder.toFixed(2), s.profitPerOrder.toFixed(2)]) },
        { title: 'الهالك حسب الفئة', header: ['الفئة', 'القيمة'], rows: Object.entries(wastageByCat).map(([c, v]) => [WASTAGE_CAT_LABELS[c] || c, fmt(v, 0)]) },
      ],
      footer: 'تحليل التكلفة المتقدم — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تحليل التكلفة المتقدم" subtitle="انحراف التكلفة، سجل أسعار المواد، محاكاة التسعير، تكلفة الخدمة لكل عملية، ومحلل الهالك بالذكاء الاصطناعي" icon={<Activity className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="تحليل_التكلفة_المتقدم" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn onClick={() => setAiOpen(true)}><Sparkles className="w-4 h-4" /> محلل الهالك AI</Btn>
          <Btn onClick={() => setLoseOpen(true)} tone="ghost"><ShieldAlert className="w-4 h-4" /> أين تخسر المال؟</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('Variance_Report.csv', ['الفرع', 'النظري', 'الفعلي', 'الانحراف', 'الانحراف %'], varianceRows.map((r) => [r.name, r.theoretical.toFixed(2), r.actual.toFixed(2), r.variance.toFixed(2), r.variancePct.toFixed(2)]))}><FileSpreadsheet className="w-4 h-4" /> تصدير CSV</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الهالك</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{fmtMoney(wastageTotal)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الهالك من تكلفة الطعام</span><strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{foodCostTotal ? ((wastageTotal / foodCostTotal) * 100).toFixed(2) : '0.0'}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مصروف مركزي موزع</span><strong className="text-lg font-extrabold font-mono text-violet-600 block mt-1">{fmtMoney(centralPaid)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مواد بارتفاع سعر &gt; 15%</span><strong className="text-lg font-extrabold font-mono text-indigo-600 block mt-1">{priceRows.filter((p) => p.change > 15).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">وصفات متأثرة بالارتفاع</span><strong className="text-lg font-extrabold font-mono text-emerald-600 block mt-1">{affectedRecipes.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أعلى انحراف +</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{varianceRows.length ? fmt(varianceRows[0].variance, 0) : 0} ر.س</strong></div>
      </div>

      <TabBar tabs={[
        { id: 'variance', label: 'انحراف نظري vs فعلي' },
        { id: 'prices', label: 'سجل أسعار المواد' },
        { id: 'simulation', label: 'محاكاة التسعير' },
        { id: 'service', label: 'تكلفة الخدمة / عملية' },
        { id: 'wastage_ai', label: 'محلل الهالك AI' },
      ]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'variance' && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">الفرع</th><th className="p-2">النظري (من المبيعات)</th><th className="p-2">الفعلي (المستهلك)</th><th className="p-2">الانحراف</th><th className="p-2">الانحراف %</th><th className="p-2">الفعلي من النظري</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {varianceRows.map((r) => (
                    <tr key={r.id} className={r.variance > 0 ? 'bg-rose-50/50' : ''}>
                      <td className="p-2 font-bold">{r.name}</td>
                      <td className="p-2 font-mono">{fmtMoney(r.theoretical)}</td>
                      <td className="p-2 font-mono">{fmtMoney(r.actual)}</td>
                      <td className={`p-2 font-mono font-extrabold ${r.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.variance > 0 ? '+' : ''}{fmt(r.variance, 0)}</td>
                      <td className={`p-2 font-mono font-extrabold ${r.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.variance > 0 ? '+' : ''}{r.variancePct.toFixed(2)}%</td>
                      <td className="p-2 font-mono">{r.actualPctOfTheoretical.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {varianceRows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><ShieldAlert className="w-4 h-4 text-rose-600" /> مواد باستهلاك زائد عن النظري (مشتبهة)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">المادة</th><th className="p-2">نظري</th><th className="p-2">فعلي</th><th className="p-2">الفرق</th><th className="p-2">القيمة ر.س</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matSuspectRows.filter((r) => r.diff > 0.001).slice(0, 15).map((r) => (
                    <tr key={r.name} className="bg-rose-50/40">
                      <td className="p-2 font-bold">{r.name} ({r.unit})</td>
                      <td className="p-2 font-mono">{fmt(r.theoretical, 2)}</td>
                      <td className="p-2 font-mono">{fmt(r.actual, 2)}</td>
                      <td className="p-2 font-mono font-extrabold text-rose-700">+{fmt(r.diff, 2)}</td>
                      <td className="p-2 font-mono font-extrabold text-rose-700">{fmtMoney(r.value)}</td>
                    </tr>
                  ))}
                  {matSuspectRows.filter((r) => r.diff > 0.001).length === 0 && <tr><td colSpan={5} className="p-4 text-center text-emerald-600 font-bold">لا توجد انحرافات — الصرف مطابق للنظري.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">حساب النظري يشمل عامل هالك الوصفة؛ الفعلي = الوارد − الرصيد − الهالك المسجل. أي فائض يشير لهدر/سرقة/أخطاء صرف غير موثقة.</p>
          </Card>
        </div>
      )}

      {tab === 'prices' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <h3 className="font-bold text-slate-800 text-xs p-3 border-b border-slate-100">سجل أسعار المواد (حسب التغير)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">المادة</th><th className="p-2">استلامات</th><th className="p-2">أول سعر</th><th className="p-2">آخر سعر</th><th className="p-2">التغير %</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {priceRows.map((p) => (
                    <tr key={p.id} className={p.change > 15 ? 'bg-amber-50/50' : ''}>
                      <td className="p-2 font-bold">{p.name}</td>
                      <td className="p-2 font-mono">{p.count}</td>
                      <td className="p-2 font-mono">{p.first.toFixed(2)}</td>
                      <td className="p-2 font-mono font-extrabold">{p.last.toFixed(2)}</td>
                      <td className={`p-2 font-mono font-extrabold ${p.change > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{p.change > 0 ? '+' : ''}{p.change.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {priceRows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">لا توجد استلامات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><TrendingUp className="w-4 h-4 text-amber-600" /> وصفات متأثرة بارتفاع الأسعار (&gt; 15%)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {affectedRecipes.map((r, idx) => (
                <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs">{r.name} <span className="text-slate-400 font-mono">({r.code})</span></span>
                  <span className={`font-mono font-extrabold text-xs ${r.fcPct > r.targetFc ? 'text-rose-700' : 'text-emerald-700'}`}>FC {r.fcPct.toFixed(2)}% (مستهدف {r.targetFc.toFixed(2)}%)</span>
                </div>
              ))}
              {affectedRecipes.length === 0 && <p className="text-center text-emerald-600 text-xs font-bold py-8">لا توجد وصفات متأثرة حالياً.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'simulation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Calculator className="w-4 h-4 text-indigo-600" /> محاكاة ماذا لو (What-if)</h3>
            <div className="space-y-3">
              <div>
                <span className="font-bold text-slate-700 block mb-1 text-xs">الصنف</span>
                <select value={selectedRecipe?.id || ''} onChange={(e) => { setSimRecipeId(e.target.value); setSimNewPrice(0); }} className={inputCls}>
                  {recipes.filter((r) => !r.isCentralKitchenPrep).map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-bold text-slate-700 block mb-1 text-xs">السعر الجديد المقترح (ر.س)</span>
                  <input type="number" min="0" step="any" value={simNewPrice || ''} placeholder={simCurrentPrice ? String(simCurrentPrice) : 'السعر الحالي'} onChange={(e) => setSimNewPrice(parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
                <div>
                  <span className="font-bold text-slate-700 block mb-1 text-xs">الهامش المستهدف %</span>
                  <input type="number" min="0" max="90" step="0.01" value={simTargetMargin || ''} onChange={(e) => setSimTargetMargin(parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[11px] font-bold text-slate-700 space-y-1">
                <p>تكلفة الطعام: <span className="font-mono">{fmtMoney(simCosts?.foodCost || 0)}</span> | الإجمالية: <span className="font-mono">{fmtMoney(simCosts?.totalCost || 0)}</span></p>
                <p>السعر الحالي: <span className="font-mono">{fmtMoney(simCurrentPrice)}</span> | FC الحالية: <span className="font-mono">{simCurrentPrice ? ((simCosts?.foodCost || 0) / simCurrentPrice * 100).toFixed(2) : '0'}%</span></p>
                <p>FC الجديدة (بعد المحاكاة): <span className={`font-mono ${simEffPrice ? (simCosts!.foodCost / simEffPrice * 100 > 35 ? 'text-rose-700' : 'text-emerald-700') : ''}`}>{simEffPrice ? ((simCosts?.foodCost || 0) / simEffPrice * 100).toFixed(2) : '0'}%</span></p>
                <p>السعر المطلوب لتحقيق هامش {simTargetMargin}%: <span className="font-mono">{fmtMoney(simSuggested)}</span></p>
                <p>الكميات المباعة: <span className="font-mono">{fmt(simSoldQty)}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 text-[10px] block">الربح الحالي</span>
                  <strong className={`font-mono font-extrabold block mt-1 ${simCurrentProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(simCurrentProfit)}</strong>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <span className="text-slate-500 text-[10px] block">الربح بعد المحاكاة</span>
                  <strong className={`font-mono font-extrabold block mt-1 ${simNewProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(simNewProfit)}</strong>
                </div>
              </div>
              <div className="flex justify-end">
                <Btn onClick={() => setSimNewPrice(simSuggested)}><ArrowRightLeft className="w-4 h-4" /> تطبيق السعر المطلوب للهدف</Btn>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><TrendingDown className="w-4 h-4 text-violet-600" /> مقترحات أسعار ذكية (الأثر الأعلى)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {smartSuggestions.map((s, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-700 text-xs">{idx + 1}. {s.name}</span>
                    <span className={`font-mono font-extrabold text-xs ${s.diff > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{s.diff > 0 ? `رفع +${s.diff.toFixed(2)}` : `خفض ${s.diff.toFixed(2)}`}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold">الحالي {s.price.toFixed(2)} → المقترح {s.suggested.toFixed(2)} | كميات {s.qty} | أثر إيراد {fmtMoney(s.revImpact)}</p>
                </div>
              ))}
              {smartSuggestions.length === 0 && <p className="text-center text-slate-400 text-xs py-8">لا توجد بيانات</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'service' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-2">الفرع</th><th className="p-2">الإيراد</th><th className="p-2">العمليات</th><th className="p-2">تكلفة الطعام</th><th className="p-2">العمالة</th><th className="p-2">تشغيلية مباشرة</th><th className="p-2">مخصص مركزي</th><th className="p-2">خدمة / عملية</th><th className="p-2">ربح / عملية</th><th className="p-2">الهامش %</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serviceRows.map((s) => (
                  <tr key={s.id}>
                    <td className="p-2 font-bold">{s.name}</td>
                    <td className="p-2 font-mono">{fmtMoney(s.rev)}</td>
                    <td className="p-2 font-mono">{s.orders}</td>
                    <td className="p-2 font-mono">{fmtMoney(s.foodCost)}</td>
                    <td className="p-2 font-mono">{fmtMoney(s.labor)}</td>
                    <td className="p-2 font-mono">{fmtMoney(s.directOpex)}</td>
                    <td className="p-2 font-mono">{fmtMoney(s.centralShare)}</td>
                    <td className="p-2 font-mono font-extrabold text-violet-700">{fmtMoney(s.servicePerOrder)}</td>
                    <td className={`p-2 font-mono font-extrabold ${s.profitPerOrder >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(s.profitPerOrder)}</td>
                    <td className={`p-2 font-mono font-extrabold ${s.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{s.margin.toFixed(2)}%</td>
                  </tr>
                ))}
                {serviceRows.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 p-3">تكلفة الخدمة = العمالة + التشغيلية المباشرة + حصة المصروف المركزي (موزعة بنسبة الإيراد). الربح لكل عملية يكشف الربحية الحقيقية للوجبة بكل فرع.</p>
        </Card>
      )}

      {tab === 'wastage_ai' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3"><span className="text-rose-500 text-[10px] block">إجمالي الهالك</span><strong className="font-mono font-extrabold text-rose-700 block mt-1 text-sm">{fmtMoney(wastageTotal)}</strong></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><span className="text-slate-500 text-[10px] block">عدد السجلات</span><strong className="font-mono font-extrabold text-slate-900 block mt-1 text-sm">{wastageCount}</strong></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><span className="text-slate-500 text-[10px] block">الأكثر فئة</span><strong className="font-bold text-slate-900 block mt-1 text-sm">{topCat ? WASTAGE_CAT_LABELS[topCat[0]] || topCat[0] : '—'}</strong></div>
            <div className="bg-white border border-slate-200 rounded-xl p-3"><span className="text-slate-500 text-[10px] block">الأكثر فرعاً</span><strong className="font-bold text-slate-900 block mt-1 text-sm">{topBranch ? getBranchName(topBranch[0]) : '—'}</strong></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 text-xs mb-3">الهالك حسب الفئة</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={Object.entries(wastageByCat).map(([c, v]) => ({ name: WASTAGE_CAT_LABELS[c] || c, القيمة: Math.round(v) }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                  <Bar dataKey="القيمة" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 text-xs mb-3">الهالك حسب الفرع</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={Object.entries(wastageByBranch).map(([b, v]) => ({ name: getBranchName(b), القيمة: Math.round(v) }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                  <Bar dataKey="القيمة" fill="#8b5cf6" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Sparkles className="w-4 h-4 text-indigo-600" /> تحليل أسباب الهالك</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">اضغط "محلل الهالك AI" أعلاه لعرض الملاحظات الآلية الفورية وتوليد تحليل ذكي بأسباب الهالك وإجراءات مقترحة حسب الفئة والفرع والمادة.</p>
            <div className="space-y-2">
              {wastageInsights.map((i, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed font-bold text-slate-700">• {i}</div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <AIAnalyzeModal open={aiOpen} onClose={() => setAiOpen(false)} title="محلل أسباب الهالك — تحليل ذكي" insights={wastageInsights} buildPrompt={wastageBuildPrompt} />
      <AIAnalyzeModal open={loseOpen} onClose={() => setLoseOpen(false)} title="أين تخسر المال؟ — تحليل ذكي" insights={loseInsights} buildPrompt={losePrompt} />
    </div>
  );
};