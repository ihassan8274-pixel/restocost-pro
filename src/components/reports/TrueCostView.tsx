import React, { useEffect, useMemo, useState } from 'react';
import { Crown, TrendingUp, ShoppingCart, RefreshCw, Printer, Sparkles, History, PackageSearch, Layers, Handshake, ClipboardCheck, PlusCircle } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, TabBar, Btn, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { lastSupplierIdFor } from '../../business/purchaseRequests';
import { AIAnalyzeModal } from '../ai/AIAnalyzeModal';

type TabId = 'absorption' | 'batch' | 'reorder' | 'repricing' | 'forecast' | 'suppliers' | 'review';

const CAT_LABELS: Record<string, string> = { main_dish: 'أطباق رئيسية', appetizer: 'مقبلات', beverage: 'مشروبات', dessert: 'حلويات', sub_prep: 'أصناف أساسية' };

interface CostSnapshot { id: string; date: string; totalFoodCost: number; totalFullCost: number; recipeCount: number; rows?: { recipeId: string; name: string; foodCost: number; totalCost: number }[]; }

const SNAP_KEY = 'rcerp_cost_snapshots';

const linForecast = (pts: { x: number; y: number }[]) => {
  const n = pts.length;
  if (n === 0) return 0;
  const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0), sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return sy / n;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return Math.max(0, intercept + slope * n);
};

export const TrueCostView: React.FC = () => {
  const {
    posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, grnNotes,
    inventory, rawMaterials, recipes, suppliers, purchaseOrders, productionRuns, getAverageUnitCost,
    calculateRecipeCosts, globalTargetMarginPercent, addPurchaseOrder, currentUser,
  } = useApp();
  const [tab, setTab] = useState<TabId>('absorption');
  const [aiOpen, setAiOpen] = useState(false);
  const [leadDays, setLeadDays] = useState(7);
  const [safetyDays, setSafetyDays] = useState(3);
  const [snapshots, setSnapshots] = useState<CostSnapshot[]>(() => {
    try { const raw = localStorage.getItem(SNAP_KEY); return raw ? JSON.parse(raw) as CostSnapshot[] : []; } catch { return []; }
  });
  const [supplierAiOpen, setSupplierAiOpen] = useState(false);
  const [trendRecipeId, setTrendRecipeId] = useState('');
  const trendRecipe = recipes.find((r) => r.id === trendRecipeId) || recipes[0];
  const trendSeries = useMemo(() => [...snapshots]
    .filter((s) => s.rows && s.rows.length > 0)
    .map((s) => {
      const row = s.rows!.find((x) => x.recipeId === trendRecipe?.id);
      return { date: s.date, تكلفة: row ? Math.round(row.foodCost) : null };
    })
    .reverse(), [snapshots, trendRecipe]);
  const firstTrend = trendSeries.find((p) => p.تكلفة !== null)?.تكلفة;
  const lastTrend = [...trendSeries].reverse().find((p) => p.تكلفة !== null)?.تكلفة;
  const trendRise = firstTrend && lastTrend ? ((lastTrend - firstTrend) / firstTrend) * 100 : 0;
  const [resolved, setResolved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('rcerp_cost_review') || '[]') as string[]; } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('rcerp_cost_review', JSON.stringify(resolved)); } catch { /* ignore */ }
  }, [resolved]);

  useEffect(() => {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapshots)); } catch { /* ignore */ }
  }, [snapshots]);

  const [poNote, setPoNote] = useState('');
  const buildPOItems = (rows: { id: string; name: string; unit: string; suggested: number; avgCost: number }[]) =>
    rows.filter((r) => r.suggested > 0).map((r) => ({
      rawMaterialId: r.id, materialName: r.name, quantity: r.suggested, unit: r.unit,
      unitPrice: r.avgCost, lineTotal: r.suggested * r.avgCost,
    }));
  const createPO = (rows: { id: string; name: string; unit: string; suggested: number; avgCost: number; bestSupplierId: string }[]) => {
    const bySupplier = new Map<string, ReturnType<typeof buildPOItems>>();
    rows.forEach((r) => {
      if (r.suggested <= 0) return;
      // المورد الفعلي من سجل الشراء (آخر مورد اشتريت منه) — يتجاهل ربط بطاقة الصنف بالمورد
      const key = lastSupplierIdFor(grnNotes, r.id, r.bestSupplierId) || 'none';
      const list = bySupplier.get(key) || [];
      list.push({ rawMaterialId: r.id, materialName: r.name, quantity: r.suggested, unit: r.unit, unitPrice: r.avgCost, lineTotal: r.suggested * r.avgCost });
      bySupplier.set(key, list);
    });
    let count = 0;
    bySupplier.forEach((items, sid) => {
      const supplier = suppliers.find((s) => s.id === sid) || suppliers[0];
      if (!supplier) return;
      addPurchaseOrder({
        supplierId: supplier.id, supplierName: supplier.name, branchId: 'b-ck',
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate: new Date(Date.now() + leadDays * 86400000).toISOString().split('T')[0],
        status: 'draft', items, totalAmount: items.reduce((s, i) => s + i.lineTotal, 0),
        requestedBy: currentUser?.name || 'مدير النظام',
      });
      count += 1;
    });
    setPoNote(count > 0 ? `تم إنشاء ${count} أمر شراء مقترح (حالة مسودة) — راجعها في المشتريات ثم أرسلها أو استلمها.` : 'لا توجد مقترحات شراء الآن.');
  };

  const totalLaborAll = shifts.reduce((s, sh) => s + sh.totalShiftCost, 0);
  const totalOpexAll = operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
  const totalUnits = posOrders.reduce((s, o) => s + o.items.reduce((si, it) => si + it.quantity, 0), 0)
    + batchSalesRecords.reduce((s, b) => s + b.items.reduce((si, it) => si + it.quantitySold, 0), 0);
  const servicePerUnit = totalUnits ? (totalLaborAll + totalOpexAll) / totalUnits : 0;

  const soldQtyOf = (recipeId: string) =>
    posOrders.reduce((s, o) => s + o.items.filter((it) => it.recipeId === recipeId).reduce((si, it) => si + it.quantity, 0), 0)
    + batchSalesRecords.reduce((s, b) => s + b.items.filter((it) => it.recipeId === recipeId).reduce((si, it) => si + it.quantitySold, 0), 0);

  const absorptionRows = useMemo(() => recipes
    .filter((r) => !r.isCentralKitchenPrep && (r.actualMenuPrice || 0) > 0)
    .map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice;
      const qty = soldQtyOf(r.id);
      const unitFull = costs.totalCost + servicePerUnit;
      const contribution = price - costs.foodCost;
      return {
        id: r.id, name: r.nameAr, category: r.category, price, qty,
        unitFood: costs.foodCost, unitTotal: costs.totalCost, unitFull,
        contribution, contributionPct: price ? (contribution / price) * 100 : 0,
        fullMargin: price ? ((price - unitFull) / price) * 100 : 0,
        targetFc: 100 - (r.targetMarginPercent ?? globalTargetMarginPercent),
        totalContrib: contribution * qty, revenue: price * qty,
      };
    })
    .sort((a, b) => b.totalContrib - a.totalContrib), [recipes, calculateRecipeCosts, servicePerUnit, globalTargetMarginPercent, posOrders, batchSalesRecords]);

  const categoryRows = useMemo(() => {
    const m = new Map<string, { revenue: number; foodCost: number; contribution: number; qty: number }>();
    absorptionRows.forEach((r) => {
      const c = m.get(r.category) || { revenue: 0, foodCost: 0, contribution: 0, qty: 0 };
      c.revenue += r.revenue; c.foodCost += r.unitFood * r.qty; c.contribution += r.totalContrib; c.qty += r.qty;
      m.set(r.category, c);
    });
    return Array.from(m.entries()).map(([cat, c]) => ({
      cat: CAT_LABELS[cat] || cat,
      revenue: c.revenue, foodCost: c.foodCost, contribution: c.contribution, qty: c.qty,
      margin: c.revenue ? (c.contribution / c.revenue) * 100 : 0,
    })).sort((a, b) => b.contribution - a.contribution);
  }, [absorptionRows]);

  const batchRows = useMemo(() => productionRuns.map((run) => {
    const recipe = recipes.find((x) => x.id === run.recipeId);
    const std = recipe ? calculateRecipeCosts(recipe.ingredients, recipe.directLaborCost, recipe.packagingCost) : null;
    const stdFoodCost = std ? std.foodCost * run.batchSize : 0;
    const actual = run.totalCost;
    const variance = actual - stdFoodCost;
    return {
      id: run.id, name: run.recipeName || run.recipeId, batchSize: run.batchSize, date: run.date,
      actual, stdFoodCost, variance, variancePct: stdFoodCost ? (variance / stdFoodCost) * 100 : 0,
      actualPerUnit: run.batchSize ? actual / run.batchSize : 0, stdPerUnit: std ? std.foodCost : 0,
    };
  }).sort((a, b) => b.variance - a.variance), [productionRuns, recipes, calculateRecipeCosts]);

  const allDates = useMemo(() => [
    ...posOrders.map((o) => o.date), ...batchSalesRecords.map((b) => b.date),
    ...grnNotes.filter((g) => g.status === 'approved').map((g) => g.date),
  ].sort(), [posOrders, batchSalesRecords, grnNotes]);
  const spanDays = allDates.length >= 2
    ? Math.max(1, Math.floor((new Date(allDates[allDates.length - 1]).getTime() - new Date(allDates[0]).getTime()) / 86400000))
    : 30;

  const theoForRecipe = (recipeId: string, qty: number, matId: string) => {
    const r = recipes.find((x) => x.id === recipeId);
    if (!r) return 0;
    return r.ingredients.filter((ing) => ing.rawMaterialId === matId)
      .reduce((s, ing) => s + ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * qty, 0);
  };

  const reorderRows = useMemo(() => rawMaterials.map((mat) => {
    const theoretical = posOrders.reduce((s, o) => s + o.items.reduce((si, it) => si + theoForRecipe(it.recipeId, it.quantity, mat.id), 0), 0)
      + batchSalesRecords.reduce((s, b) => s + b.items.reduce((si, it) => si + theoForRecipe(it.recipeId, it.quantitySold, mat.id), 0), 0);
    const daily = spanDays ? theoretical / spanDays : 0;
    const available = inventory.filter((i) => i.rawMaterialId === mat.id).reduce((s, i) => s + i.quantity, 0);
    const openPO = purchaseOrders.filter((po) => ['draft', 'submitted', 'approved', 'partially_received'].includes(po.status))
      .reduce((s, po) => s + po.items.filter((it) => it.rawMaterialId === mat.id).reduce((si, it) => si + it.quantity, 0), 0);
    const safety = daily * safetyDays;
    const suggested = Math.max(0, Math.ceil((daily * leadDays + safety - available - openPO) * 10) / 10);
    const bestSupplier = suppliers.filter((s) => s.isActive && s.categories.includes(mat.category)).sort((a, b) => b.rating - a.rating)[0];
    return { id: mat.id, name: mat.nameAr, unit: mat.unit, daily, available, openPO, safety, suggested, bestSupplier: bestSupplier?.name || '—', bestSupplierId: bestSupplier?.id || '', supplierRating: bestSupplier?.rating || 0, avgCost: getAverageUnitCost(mat.id) };
  }).filter((r) => r.daily > 0 || r.suggested > 0).sort((a, b) => b.suggested - a.suggested), [rawMaterials, posOrders, batchSalesRecords, recipes, spanDays, inventory, purchaseOrders, suppliers, leadDays, safetyDays, getAverageUnitCost]);

  const priceUpMaterials = useMemo(() => rawMaterials.map((mat) => {
    const receipts = grnNotes.filter((g) => g.status === 'approved').flatMap((g) => g.items.filter((i) => i.rawMaterialId === mat.id).map((i) => ({ date: g.date, price: i.unitPrice })));
    if (receipts.length < 2) return null;
    const sorted = [...receipts].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].price, last = sorted[sorted.length - 1].price;
    return { id: mat.id, name: mat.nameAr, change: first > 0 ? ((last - first) / first) * 100 : 0, last };
  }).filter((p): p is NonNullable<typeof p> => p !== null), [rawMaterials, grnNotes]);

  const repricedRecipes = useMemo(() => {
    const upIds = new Set(priceUpMaterials.filter((p) => p.change > 15).map((p) => p.id));
    return recipes.filter((r) => !r.isCentralKitchenPrep && r.ingredients.some((ing) => upIds.has(ing.rawMaterialId))).map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice || costs.suggestedPrice;
      return { name: r.nameAr, code: r.code, foodCost: costs.foodCost, fcPct: price ? (costs.foodCost / price) * 100 : 0, targetFc: 100 - (r.targetMarginPercent ?? globalTargetMarginPercent) };
    }).sort((a, b) => b.fcPct - a.fcPct);
  }, [priceUpMaterials, recipes, calculateRecipeCosts, globalTargetMarginPercent]);

  const monthly = useMemo(() => {
    const m = new Map<string, { revenue: number; foodCost: number; wastage: number }>();
    const add = (month: string, rev: number, fc: number, wa: number) => {
      const c = m.get(month) || { revenue: 0, foodCost: 0, wastage: 0 };
      c.revenue += rev; c.foodCost += fc; c.wastage += wa;
      m.set(month, c);
    };
    posOrders.forEach((o) => add(o.date.slice(0, 7), o.totalAmount, o.totalCost, 0));
    batchSalesRecords.forEach((b) => add(b.date.slice(0, 7), b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15)), b.totalFoodCost, 0));
    wastageLogs.forEach((w) => add(w.date.slice(0, 7), 0, 0, w.totalCostImpact));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, c]) => ({ month, ...c }));
  }, [posOrders, batchSalesRecords, wastageLogs]);

  const lastMonths = monthly.slice(-6);
  const forecastFood = linForecast(lastMonths.map((m, i) => ({ x: i, y: m.foodCost })));
  const forecastRevenue = linForecast(lastMonths.map((m, i) => ({ x: i, y: m.revenue })));
  const forecastWastage = lastMonths.length ? lastMonths.reduce((s, m) => s + m.wastage, 0) / lastMonths.length : 0;
  const lastMonth = lastMonths[lastMonths.length - 1];
  const fcPctNext = forecastRevenue > 0 ? (forecastFood / forecastRevenue) * 100 : 0;
  const fcTarget = 100 - globalTargetMarginPercent;
  const fcOverTarget = fcPctNext > fcTarget;

  const forecastChartData = useMemo(() => [
    ...lastMonths.map((m) => ({ name: m.month.slice(5), الإيراد: Math.round(m.revenue), التكلفة: Math.round(m.foodCost) })),
    { name: 'التنبؤ', الإيراد: Math.round(forecastRevenue), التكلفة: Math.round(forecastFood) },
  ], [lastMonths, forecastRevenue, forecastFood]);

  const saveSnapshot = () => {
    const rows = recipes.filter((r) => !r.isCentralKitchenPrep).map((r) => {
      const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      return { recipeId: r.id, name: r.nameAr, foodCost: c.foodCost, totalCost: c.totalCost };
    });
    const snap: CostSnapshot = {
      id: `snap-${Date.now()}`,
      date: new Date().toLocaleDateString('ar-SA-u-nu-latn'),
      totalFoodCost: rows.reduce((s, r) => s + r.foodCost, 0),
      totalFullCost: rows.reduce((s, r) => s + r.totalCost, 0),
      recipeCount: rows.length,
      rows,
    };
    setSnapshots((prev) => [snap, ...prev].slice(0, 24));
  };

  const forecastInsights = useMemo(() => {
    const out: string[] = [];
    if (lastMonths.length === 0) return ['لا توجد بيانات شهرية كافية للتنبؤ.'];
    out.push(`شملنا ${lastMonths.length} شهر (من ${lastMonths[0].month} إلى ${lastMonths[lastMonths.length - 1].month}).`);
    if (lastMonth) out.push(`آخر شهر فعلي (${lastMonth.month}): إيراد ${fmtMoney(lastMonth.revenue)} وتكلفة طعام ${fmtMoney(lastMonth.foodCost)}.`);
    out.push(`توقع الشهر القادم: إيراد ${fmtMoney(forecastRevenue)} وتكلفة طعام ${fmtMoney(forecastFood)} (Food Cost ${fcPctNext.toFixed(2)}%).`);
    out.push(fcOverTarget ? `التكلفة المتوقعة ${fcPctNext.toFixed(2)}% أعلى من المستهدف (${fcTarget.toFixed(2)}%) — تنبيه ما قبل التجاوز.` : `التكلفة المتوقعة ${fcPctNext.toFixed(2)}% ضمن المستهدف (${fcTarget.toFixed(2)}%).`);
    out.push(`متوسط الهالك الشهري ${fmtMoney(forecastWastage)} — المتوقع القادم في نفس المستوى.`);
    if (lastMonths.length >= 2) {
      const growth = ((lastMonths[lastMonths.length - 1].foodCost - lastMonths[0].foodCost) / Math.max(1, lastMonths[0].foodCost)) * 100;
      out.push(`اتجاه تكلفة الطعام عبر الفترة: ${growth >= 0 ? 'ارتفاع' : 'انخفاض'} بنسبة ${Math.abs(growth).toFixed(2)}%.`);
    }
    return out;
  }, [lastMonths, forecastRevenue, forecastFood, fcPctNext, fcOverTarget, fcTarget, forecastWastage]);

  const forecastPrompt = () => [
    `الأشهر الفعلية (الإيراد / تكلفة الطعام / الهالك):\n${lastMonths.map((m) => `${m.month}: ${m.revenue.toFixed(2)} / ${m.foodCost.toFixed(2)} / ${m.wastage.toFixed(2)}`).join('\n')}`,
    `توقع الشهر القادم: إيراد ${forecastRevenue.toFixed(2)}، تكلفة طعام ${forecastFood.toFixed(2)}، Food Cost ${fcPctNext.toFixed(2)}% (المستهدف ${fcTarget.toFixed(2)}%)، متوسط هالك ${forecastWastage.toFixed(2)}.`,
    'اكتب تنبؤاً بالعربية (3-4 فقرات): قراءة للاتجاه، ما يدفع التكلفة، ثم 5 توصيات لضبط تكلفة الطعام قبل تجاوز الهدف. استخدم الأرقام حرفياً.',
  ].join('\n');

  const supplierRows = useMemo(() => {
    const m = new Map<string, { count: number; spend: number; materials: Set<string>; lastDate: string; prices: number[] }>();
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => {
      const c = m.get(g.supplierId) || { count: 0, spend: 0, materials: new Set<string>(), lastDate: '', prices: [] };
      c.count += 1; c.spend += g.totalAmount;
      g.items.forEach((i) => c.materials.add(rawMaterials.find((x) => x.id === i.rawMaterialId)?.nameAr || i.rawMaterialId));
      if (g.date > c.lastDate) c.lastDate = g.date;
      c.prices.push(g.items.length ? g.items.reduce((s, i) => s + i.unitPrice, 0) / g.items.length : 0);
      m.set(g.supplierId, c);
    });
    return suppliers.filter((s) => m.has(s.id)).map((s) => {
      const c = m.get(s.id)!;
      const prices = c.prices.filter((p) => p > 0);
      const first = prices[0] || 0, last = prices[prices.length - 1] || 0;
      const change = first > 0 ? ((last - first) / first) * 100 : 0;
      return {
        id: s.id, name: s.name, rating: s.rating, terms: s.paymentTermsDays, phone: s.phone,
        count: c.count, spend: c.spend, materials: Array.from(c.materials), change, lastDate: c.lastDate,
        avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [grnNotes, suppliers, rawMaterials]);

  const supplierInsights = useMemo(() => {
    const out: string[] = [];
    if (supplierRows.length === 0) return ['لا توجد مشتريات مسجلة لمقارنة الموردين.'];
    const totalSpend = supplierRows.reduce((s, x) => s + x.spend, 0);
    const top = supplierRows[0];
    out.push(`إجمالي مشتريات الموردين ${fmtMoney(totalSpend)} عبر ${supplierRows.length} مورداً — أكبرهم ${top.name} (${fmtMoney(top.spend)}، ${top.count} استلاماً).`);
    const risers = supplierRows.filter((s) => s.change > 15).sort((a, b) => b.change - a.change);
    if (risers.length) out.push(`${risers.length} مورداً رفعوا الأسعار أكثر من 15% — أبرزهم ${risers[0].name} (${risers[0].change.toFixed(2)}%).`);
    const lowRating = supplierRows.filter((s) => s.rating <= 3).sort((a, b) => a.rating - b.rating);
    if (lowRating.length) out.push(`${lowRating.length} مورداً بتقييم منخفض (${lowRating[0].rating}★) — ${lowRating[0].name} — راجع الجودة والتسليم.`);
    const highTerms = supplierRows.filter((s) => s.terms >= 30).sort((a, b) => b.terms - a.terms);
    if (highTerms.length) out.push(`${highTerms[0].name} يمنح ${highTerms[0].terms} يوماً سداداً — استفد من شروط الدفع للسيولة.`);
    return out;
  }, [supplierRows]);

  const supplierPrompt = () => [
    `الموردون (الاسم / المشتريات / التقييم / تغير الأسعار / أيام السداد / عدد الاستلامات):\n${supplierRows.map((s) => `${s.name}: ${s.spend.toFixed(2)} ر.س / ${s.rating}★ / ${s.change.toFixed(2)}% / ${s.terms} يوم / ${s.count}`).join('\n')}`,
    'اكتب مذكرة تفاوض بالعربية: لأكبر 3 موردين، حدد نقاط القوة والضعف (مشترياتك/ارتفاع الأسعار/التقييم/شروط السداد)، واقترح 5 أهداف تفاوضية وأسئلة وبدائل. استخدم الأرقام حرفياً.',
  ].join('\n');

  const foodCostTotal = posOrders.reduce((s, o) => s + o.totalCost, 0) + batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const wastageTotal = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const lowStockCount = rawMaterials.filter((m) => inventory.filter((i) => i.rawMaterialId === m.id).reduce((s, i) => s + i.quantity, 0) <= m.minStockLevel).length;

  const balanceRows = rawMaterials.map((m) => {
    const qty = inventory.filter((i) => i.rawMaterialId === m.id).reduce((s, i) => s + i.quantity, 0);
    return { name: m.nameAr, unit: m.unit, qty, price: getAverageUnitCost(m.id), value: qty * getAverageUnitCost(m.id), min: m.minStockLevel };
  }).filter((b) => b.qty > 0 || b.min > 0).sort((a, b) => b.value - a.value);
  const totalStockValue = balanceRows.reduce((s, b) => s + b.value, 0);

  const reviewIssues = useMemo(() => {
    const issues: { id: string; label: string; detail: string; severity: 'critical' | 'warning' | 'info' }[] = [];
    const unapproved = wastageLogs.filter((w) => !w.isApproved);
    if (unapproved.length) issues.push({ id: 'wastage_unapproved', label: 'هالك غير معتمد', detail: `${unapproved.length} سجل بقيمة ${fmtMoney(unapproved.reduce((s, w) => s + w.totalCostImpact, 0))} بانتظار الاعتماد في شاشة الهوالك.`, severity: 'warning' });
    if (foodCostTotal > 0 && wastageTotal / foodCostTotal > 0.05) issues.push({ id: 'wastage_pct', label: 'هالك فوق 5%', detail: `الهالك ${((wastageTotal / foodCostTotal) * 100).toFixed(2)}% من تكلفة الطعام — خطة تصحيح مطلوبة.`, severity: 'critical' });
    const overRuns = batchRows.filter((b) => b.variance > 0);
    if (overRuns.length) issues.push({ id: 'batch_over', label: 'دفعات فوق المعيارية', detail: `${overRuns.length} دفعة بتكلفة أعلى من المعيارية — أبرزها ${overRuns[0].name} بانحراف +${fmtMoney(overRuns[0].variance)}.`, severity: 'warning' });
    const risers = priceUpMaterials.filter((p) => p.change > 15);
    if (risers.length) issues.push({ id: 'price_risers', label: 'مواد بارتفاع أسعار', detail: `${risers.length} مادة ارتفعت أكثر من 15% (أبرزها ${risers[0].name} ${risers[0].change.toFixed(2)}%) — أعد التفاوض.`, severity: 'warning' });
    if (lowStockCount > 0) issues.push({ id: 'low_stock', label: 'مواد تحت الحد الأدنى', detail: `${lowStockCount} صنفاً تحت الحد — أنشئ أوامر شراء.`, severity: 'critical' });
    if (issues.length === 0) issues.push({ id: 'all_good', label: 'لا توجد ملاحظات حرجة', detail: 'جميع مؤشرات التكلفة ضمن الحدود.', severity: 'info' });
    return issues;
  }, [wastageLogs, foodCostTotal, wastageTotal, batchRows, priceUpMaterials, lowStockCount]);

  const printKitchenCards = () => {
    openPrintWindow({
      title: 'بطاقات تكلفة المطبخ',
      subtitle: 'تكلفة الوحدة الكاملة لكل صنف',
      meta: [['إصدار', new Date().toLocaleDateString('ar-SA-u-nu-latn')], ['عدد الأصناف', `${absorptionRows.length}`], ['تكلفة الخدمة لكل وحدة', `${fmtMoney(servicePerUnit)}`], ['قيمة المخزون', `${fmtMoney(totalStockValue)}`], ['مواد تحت الحد', `${lowStockCount}`]],
      tables: [
        {
          title: 'بطاقات التكلفة',
          header: ['الصنف', 'السعر', 'تكلفة طعام', 'إجمالية', 'كاملة (خدمة)', 'FC %', 'هامش كامل %', 'المستهدف %'],
          rows: absorptionRows.map((r) => [r.name, r.price.toFixed(2), r.unitFood.toFixed(2), r.unitTotal.toFixed(2), r.unitFull.toFixed(2), ((r.unitFood / r.price) * 100).toFixed(2), r.fullMargin.toFixed(2), r.targetFc.toFixed(2)]),
        },
        {
          title: 'الأرصدة الحالية (المخزون)',
          header: ['المادة', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة', 'الحد الأدنى'],
          rows: balanceRows.map((b) => [b.name, b.unit, fmt(b.qty), fmt(b.price), fmt(b.value), b.min]),
        },
      ],
      footer: 'بطاقات تكلفة المطبخ — RestoCost ERP',
    });
  };

  const exportSheets = [
    { name: 'تكلفة وحدة كاملة', header: ['الصنف', 'السعر', 'تكلفة طعام', 'إجمالية', 'كاملة', 'هامش كامل %', 'مساهمة', 'كميات'], rows: absorptionRows.map((r) => [r.name, r.price.toFixed(2), r.unitFood.toFixed(2), r.unitTotal.toFixed(2), r.unitFull.toFixed(2), r.fullMargin.toFixed(2), r.contribution.toFixed(2), r.qty]) },
    { name: 'ربحية الفئات', header: ['الفئة', 'الإيراد', 'تكلفة طعام', 'المساهمة', 'الهامش %'], rows: categoryRows.map((c) => [c.cat, c.revenue.toFixed(2), c.foodCost.toFixed(2), c.contribution.toFixed(2), c.margin.toFixed(2)]) },
    { name: 'تكلفة الدفعات الفعلية', header: ['الدفعة', 'التاريخ', 'الكمية', 'فعلية', 'معيارية', 'الانحراف', 'الانحراف %'], rows: batchRows.map((b) => [b.name, b.date, b.batchSize, b.actual.toFixed(2), b.stdFoodCost.toFixed(2), b.variance.toFixed(2), b.variancePct.toFixed(2)]) },
    { name: 'اقتراح إعادة الطلب', header: ['المادة', 'الاستهلاك اليومي', 'المتاح', 'أوامر مفتوحة', 'أمان', 'المقترح', 'أفضل مورد'], rows: reorderRows.slice(0, 40).map((r) => [r.name, r.daily.toFixed(2), r.available.toFixed(2), r.openPO.toFixed(2), r.safety.toFixed(2), r.suggested.toFixed(2), r.bestSupplier]) },
    { name: 'وصفات متأثرة بالأسعار', header: ['الصنف', 'الكود', 'تكلفة الطعام', 'FC %', 'المستهدف %'], rows: repricedRecipes.map((r) => [r.name, r.code, r.foodCost.toFixed(2), r.fcPct.toFixed(2), r.targetFc.toFixed(2)]) },
    { name: 'التنبؤ الشهري', header: ['الشهر', 'الإيراد', 'تكلفة الطعام', 'الهالك'], rows: monthly.map((m) => [m.month, m.revenue.toFixed(2), m.foodCost.toFixed(2), m.wastage.toFixed(2)]) },
    { name: 'تحليل الموردين', header: ['المورد', 'مشتريات', 'استلامات', 'تغير أسعار %', 'تقييم', 'سداد أيام'], rows: supplierRows.map((s) => [s.name, s.spend.toFixed(2), s.count, s.change.toFixed(2), s.rating, s.terms]) },
    { name: 'الأرصدة الحالية', header: ['المادة', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة', 'الحد الأدنى'], rows: [...balanceRows.map((b) => [b.name, b.unit, b.qty.toFixed(2), b.price.toFixed(2), b.value.toFixed(2), b.min]), ['الإجمالي', '', '', '', totalStockValue.toFixed(2), '']] },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="التكلفة الحقيقية والشراء الذكي" subtitle="تكلفة الوحدة الكاملة، هامش المساهمة، تكلفة الدفعات، إعادة الطلب الذكية، إعادة التسعير التلقائية، وتنبؤ التكلفة" icon={<Layers className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar filename="التكلفة_الحقيقية_والشراء_الذكي" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printKitchenCards}><Printer className="w-4 h-4" /> بطاقات المطبخ</Btn>
          <Btn onClick={saveSnapshot}><History className="w-4 h-4" /> حفظ نقطة تكلفة</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تكلفة الخدمة / وحدة</span><strong className="text-lg font-extrabold font-mono text-violet-600 block mt-1">{fmtMoney(servicePerUnit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">دفعات إنتاج</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{batchRows.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">مواد تحتاج إعادة طلب</span><strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{reorderRows.filter((r) => r.suggested > 0).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">وصفات متأثرة بأسعار</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{repricedRecipes.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">نقاط تكلفة محفوظة</span><strong className="text-lg font-extrabold font-mono text-brand-600 block mt-1">{snapshots.length}</strong></div>
        <div className={`p-4 rounded-xl border shadow-xs ${fcOverTarget ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}><span className={`text-[11px] block ${fcOverTarget ? 'text-rose-500' : 'text-emerald-600'}`}>Food Cost المتوقعة</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${fcOverTarget ? 'text-rose-700' : 'text-emerald-700'}`}>{fcPctNext.toFixed(2)}%</strong></div>
      </div>

      <TabBar tabs={[
        { id: 'absorption', label: 'تكلفة وحدة كاملة + هامش مساهمة' },
        { id: 'batch', label: 'تكلفة الدفعات الفعلية' },
        { id: 'reorder', label: 'إعادة الطلب الذكية' },
        { id: 'repricing', label: 'إعادة التسعير التلقائية' },
        { id: 'forecast', label: 'تنبؤ التكلفة AI' },
        { id: 'suppliers', label: 'التفاوض مع الموردين' },
        { id: 'review', label: 'نقاط مراجعة التكلفة' },
      ]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'absorption' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Crown className="w-4 h-4 text-amber-600" /> هامش المساهمة حسب الفئة (الأعلى ربحية)</h3>
              <div className="space-y-2">
                {categoryRows.map((c, idx) => (
                  <div key={c.cat} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-xs">{idx + 1}. {c.cat} <span className="text-slate-400 font-mono">({c.qty} وحدة)</span></span>
                    <span className="font-mono font-extrabold text-xs text-brand-700">{fmtMoney(c.contribution)} <span className="text-emerald-700">({c.margin.toFixed(2)}%)</span></span>
                  </div>
                ))}
                {categoryRows.length === 0 && <p className="text-center text-slate-400 text-xs py-6">لا توجد بيانات</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><TrendingUp className="w-4 h-4 text-brand-600" /> توزيع التكلفة لكل وحدة</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={absorptionRows.slice(0, 8).map((r) => ({ name: r.name, طعام: Math.round(r.unitFood), إجمالي: Math.round(r.unitTotal), كامل: Math.round(r.unitFull) }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                  <Legend />
                  <Bar dataKey="طعام" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                  <Bar dataKey="إجمالي" fill="#8b5cf6" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                  <Bar dataKey="كامل" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                  <tr><th className="p-2">الصنف</th><th className="p-2">السعر</th><th className="p-2">تكلفة طعام</th><th className="p-2">إجمالية</th><th className="p-2">كاملة (خدمة)</th><th className="p-2">FC %</th><th className="p-2">هامش كامل %</th><th className="p-2">المستهدف %</th><th className="p-2">كميات</th><th className="p-2">مساهمة</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {absorptionRows.map((r) => (
                    <tr key={r.id} className={r.fullMargin < 0 ? 'bg-rose-50/50' : ''}>
                      <td className="p-2 font-bold">{r.name}</td>
                      <td className="tnum text-left p-2">{r.price.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{r.unitFood.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{r.unitTotal.toFixed(2)}</td>
                      <td className="tnum text-left p-2 font-extrabold text-violet-700">{r.unitFull.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{((r.unitFood / r.price) * 100).toFixed(2)}</td>
                      <td className={`p-2 font-mono font-extrabold ${r.fullMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r.fullMargin.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{r.targetFc.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{fmt(r.qty)}</td>
                      <td className="tnum text-left p-2 font-extrabold text-brand-700">{fmtMoney(r.totalContrib)}</td>
                    </tr>
                  ))}
                  {absorptionRows.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'batch' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                <tr><th className="p-2">الدفعة</th><th className="p-2">التاريخ</th><th className="p-2">الكمية</th><th className="p-2">تكلفة فعلية</th><th className="p-2">معيارية</th><th className="p-2">الانحراف</th><th className="p-2">الانحراف %</th><th className="p-2">فعلية / وحدة</th><th className="p-2">معيارية / وحدة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchRows.map((b) => (
                  <tr key={b.id} className={b.variance > 0 ? 'bg-amber-50/50' : ''}>
                    <td className="p-2 font-bold">{b.name}</td>
                    <td className="tnum text-left p-2">{b.date}</td>
                    <td className="tnum text-left p-2">{fmt(b.batchSize)}</td>
                    <td className="tnum text-left p-2">{fmtMoney(b.actual)}</td>
                    <td className="tnum text-left p-2">{fmtMoney(b.stdFoodCost)}</td>
                    <td className={`p-2 font-mono font-extrabold ${b.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{b.variance > 0 ? '+' : ''}{fmt(b.variance, 0)}</td>
                    <td className={`p-2 font-mono font-extrabold ${b.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{b.variance > 0 ? '+' : ''}{b.variancePct.toFixed(2)}%</td>
                    <td className="tnum text-left p-2">{b.actualPerUnit.toFixed(2)}</td>
                    <td className="tnum text-left p-2">{b.stdPerUnit.toFixed(2)}</td>
                  </tr>
                ))}
                {batchRows.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا توجد دفعات إنتاج مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 p-3">التكلفة الفعلية من صرف الخامات عند التصنيع مقابل التكلفة المعيارية للدفعة — انحراف إيجابي يعني كفاءة أقل في المطبخ.</p>
        </Card>
      )}

      {tab === 'reorder' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><ShoppingCart className="w-4 h-4 text-amber-600" /> إعدادات الخوارزمية</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
              <div><span className="font-bold text-slate-700 block mb-1 text-xs">مدة التسليم (أيام)</span><input type="number" min="1" value={leadDays} onChange={(e) => setLeadDays(Math.max(1, parseInt(e.target.value) || 1))} className={inputCls} /></div>
              <div><span className="font-bold text-slate-700 block mb-1 text-xs">مخزون أمان (أيام)</span><input type="number" min="0" value={safetyDays} onChange={(e) => setSafetyDays(Math.max(0, parseInt(e.target.value) || 0))} className={inputCls} /></div>
              <div className="flex items-end"><p className="text-[10px] text-slate-400 font-bold">المقترح = (استهلاك يومي × التسليم) + أمان − المتاح − أوامر مفتوحة</p></div>
            </div>
          </Card>
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 font-bold">تحويل المقترحات إلى أوامر شراء حقيقية (لكل مورد بأفضل تقييم، فرع: المطبخ المركزي، حالة: مسودة).</p>
            <Btn onClick={() => createPO(reorderRows)}><ShoppingCart className="w-4 h-4" /> إنشاء أوامر الشراء المقترحة</Btn>
          </Card>
          {poNote && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2 text-[11px] font-bold">{poNote}</div>}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                  <tr><th className="p-2">المادة</th><th className="p-2">الاستهلاك اليومي</th><th className="p-2">المتاح</th><th className="p-2">أوامر مفتوحة</th><th className="p-2">أمان</th><th className="p-2">المقترح</th><th className="p-2">أفضل مورد</th><th className="p-2">متوسط التكلفة</th><th className="p-2">إجراء</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reorderRows.slice(0, 40).map((r) => (
                    <tr key={r.id} className={r.suggested > 0 ? 'bg-amber-50/50' : ''}>
                      <td className="p-2 font-bold">{r.name}</td>
                      <td className="tnum text-left p-2">{r.daily.toFixed(2)}</td>
                      <td className="tnum text-left p-2">{fmt(r.available, 1)}</td>
                      <td className="tnum text-left p-2">{fmt(r.openPO, 1)}</td>
                      <td className="tnum text-left p-2">{fmt(r.safety, 1)}</td>
                      <td className="tnum text-left p-2 font-extrabold text-amber-700">{r.suggested > 0 ? `${fmt(r.suggested, 1)} ${r.unit}` : '—'}</td>
                      <td className="p-2 font-bold">{r.bestSupplier} {r.supplierRating > 0 ? `(${r.supplierRating}★)` : ''}</td>
                      <td className="tnum text-left p-2">{r.avgCost.toFixed(2)}</td>
                      <td className="p-2">{r.suggested > 0 && <button onClick={() => createPO([r])} className="text-[10px] px-2 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-extrabold"><PlusCircle className="w-3 h-3 inline ml-1" />PO</button>}</td>
                    </tr>
                  ))}
                  {reorderRows.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'repricing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><RefreshCw className="w-4 h-4 text-brand-600" /> وصفات أُعيد تسعيرها تلقائياً (مواد ارتفعت &gt; 15%)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {repricedRecipes.map((r, idx) => (
                <div key={idx} className="bg-brand-50 border border-brand-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs">{r.name} <span className="text-slate-400 font-mono">({r.code})</span></span>
                  <span className={`font-mono font-extrabold text-xs ${r.fcPct > r.targetFc ? 'text-rose-700' : 'text-emerald-700'}`}>FC {r.fcPct.toFixed(2)}% / {fmtMoney(r.foodCost)}</span>
                </div>
              ))}
              {repricedRecipes.length === 0 && <p className="text-center text-emerald-600 text-xs font-bold py-8">لا توجد وصفات متأثرة — التكلفة محدّثة تلقائياً من أسعار المواد.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><History className="w-4 h-4 text-amber-600" /> نقاط التكلفة التاريخية</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">احفظ نقطة تكلفة دورياً لمتابعة اتجاه تكلفة الوصفات، ثم راقب إجمالي Food Cost.</p>
            <div className="mb-3">
              <span className="font-bold text-slate-700 block mb-1 text-xs">الوصفة</span>
              <select value={trendRecipe?.id || ''} onChange={(e) => setTrendRecipeId(e.target.value)} className={inputCls}>
                {recipes.filter((r) => !r.isCentralKitchenPrep).map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
              </select>
              {trendSeries.length >= 2 && <span className={`inline-block mt-2 text-[10px] font-extrabold px-2 py-1 rounded-lg border ${trendRise > 10 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>اتجاه تكلفة {trendRecipe?.nameAr}: {trendRise > 0 ? '+' : ''}{trendRise.toFixed(2)}% {trendRise > 10 ? '— تنبيه: تجاوز 10%' : ''}</span>}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Line type="monotone" dataKey="تكلفة" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-3 max-h-40 overflow-y-auto">
              {snapshots.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px]">
                  <span className="font-bold text-slate-600">{s.date} — {s.recipeCount} صنف</span>
                  <span className="font-mono font-extrabold text-amber-700">{fmtMoney(s.totalFoodCost)}</span>
                </div>
              ))}
              {snapshots.length === 0 && <p className="text-center text-slate-400 text-xs py-4">لا توجد نقاط محفوظة بعد — اضغط "حفظ نقطة تكلفة".</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><TrendingUp className="w-4 h-4 text-violet-600" /> الإيراد مقابل تكلفة الطعام (آخر 6 شهور + التنبؤ)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={forecastChartData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Legend />
                <Bar dataKey="الإيراد" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                <Bar dataKey="التكلفة" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="text-slate-500 text-[10px] block">إيراد متوقع</span><strong className="font-mono font-extrabold text-brand-700 block mt-1">{fmtMoney(forecastRevenue)}</strong></div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3"><span className="text-slate-500 text-[10px] block">تكلفة متوقعة</span><strong className="font-mono font-extrabold text-rose-700 block mt-1">{fmtMoney(forecastFood)}</strong></div>
              <div className={`rounded-xl p-3 border ${fcOverTarget ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}><span className={`text-[10px] block ${fcOverTarget ? 'text-rose-500' : 'text-emerald-600'}`}>Food Cost متوقعة</span><strong className={`font-mono font-extrabold block mt-1 ${fcOverTarget ? 'text-rose-700' : 'text-emerald-700'}`}>{fcPctNext.toFixed(2)}%</strong></div>
            </div>
            {fcOverTarget && <p className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-xl p-3 flex items-center gap-2"><PackageSearch className="w-4 h-4" /> تنبيه ما قبل التجاوز: Food Cost المتوقعة {fcPctNext.toFixed(2)}% أعلى من المستهدف {fcTarget.toFixed(2)}%.</p>}
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Sparkles className="w-4 h-4 text-brand-600" /> تنبؤ ذكي وتحليل</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">اضغط "تنبؤ ذكي" لعرض الملاحظات الآلية وتوليد تنبؤ سردي بالذكاء الاصطناعي مع توصيات.</p>
            <div className="space-y-2">
              {forecastInsights.map((i, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed font-bold text-slate-700">• {i}</div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Btn onClick={() => setAiOpen(true)}><Sparkles className="w-4 h-4" /> تنبؤ ذكي</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs p-3 border-b border-slate-100"><Handshake className="w-4 h-4 text-brand-600" /> تحليل الموردين</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                  <tr><th className="p-2">المورد</th><th className="p-2">مشتريات</th><th className="p-2">استلامات</th><th className="p-2">تغير أسعار</th><th className="p-2">تقييم</th><th className="p-2">سداد (أيام)</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierRows.map((s) => (
                    <tr key={s.id} className={s.change > 15 ? 'bg-rose-50/50' : ''}>
                      <td className="p-2 font-bold">{s.name}</td>
                      <td className="tnum text-left p-2 font-extrabold">{fmtMoney(s.spend)}</td>
                      <td className="tnum text-left p-2">{s.count}</td>
                      <td className={`p-2 font-mono font-extrabold ${s.change > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%</td>
                      <td className="tnum text-left p-2">{s.rating}★</td>
                      <td className="tnum text-left p-2">{s.terms}</td>
                    </tr>
                  ))}
                  {supplierRows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">لا توجد مشتريات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><Handshake className="w-4 h-4 text-emerald-600" /> مذكرة التفاوض الذكية</h3>
            <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">اضغط "تفاوض ذكي" للحصول على مذكرة تفاوض لأكبر الموردين (نقاط قوة/ضعف، أهداف تفاوضية، أسئلة، بدائل).</p>
            <div className="space-y-2">
              {supplierInsights.map((i, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed font-bold text-slate-700">• {i}</div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Btn onClick={() => setSupplierAiOpen(true)}><Sparkles className="w-4 h-4" /> تفاوض ذكي</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === 'review' && (
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-3"><ClipboardCheck className="w-4 h-4 text-brand-600" /> نقاط مراجعة التكلفة الدورية</h3>
          <p className="text-[11px] text-slate-500 font-bold leading-relaxed mb-3">راجع البنود أدناه وعلّم على ما تم إنجازه — تبقى الحالة محفوظة على جهازك.</p>
          <div className="space-y-2">
            {reviewIssues.map((iss) => {
              const done = resolved.includes(iss.id);
              return (
                <div key={iss.id} className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${done ? 'bg-emerald-50/60 border-emerald-200' : iss.severity === 'critical' ? 'bg-rose-50 border-rose-200' : iss.severity === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <p className={`font-extrabold text-xs flex items-center gap-2 ${done ? 'text-emerald-800 line-through' : 'text-slate-800'}`}>{iss.label} <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold ${iss.severity === 'critical' ? 'bg-rose-200 text-rose-800' : iss.severity === 'warning' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{iss.severity === 'critical' ? 'حرج' : iss.severity === 'warning' ? 'تحذير' : 'معلومات'}</span></p>
                    <p className="text-[11px] text-slate-500 font-bold mt-0.5">{iss.detail}</p>
                  </div>
                  <button onClick={() => setResolved((prev) => done ? prev.filter((x) => x !== iss.id) : [...prev, iss.id])} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-extrabold border ${done ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-600 border-slate-300'}`}>{done ? 'تم ✓' : 'إنجاز'}</button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Btn tone="ghost" onClick={() => setResolved([])}>إعادة ضبط القائمة</Btn>
          </div>
        </Card>
      )}

      <AIAnalyzeModal open={aiOpen} onClose={() => setAiOpen(false)} title="تنبؤ التكلفة بالذكاء الاصطناعي" insights={forecastInsights} buildPrompt={forecastPrompt} />
      <AIAnalyzeModal open={supplierAiOpen} onClose={() => setSupplierAiOpen(false)} title="مذكرة التفاوض مع الموردين" insights={supplierInsights} buildPrompt={supplierPrompt} />
    </div>
  );
};