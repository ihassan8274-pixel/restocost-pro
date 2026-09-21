import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Coins, FileSpreadsheet, Gauge, Layers, Printer,
  Target, TrendingUp,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { Btn, Card, Field, PageHeader, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import {
  VAT_RATE, downloadCSV, fmt, fmtMoney, fmtNum, forecastSeries, monthLabel, netOfGross,
} from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

const PIE_COLORS = ['#6366f1', '#f59e0b', '#06b6d4', '#f43f5e', '#10b981', '#8b5cf6', '#0ea5e9', '#64748b'];

const WASTE_LABELS: Record<string, string> = {
  prep_waste: 'هدر تحضير', cooking_burn: 'حرق طهي', expired: 'منتهي الصلاحية',
  damaged_storage: 'تلف تخزين', returned_food: 'طعام مُرجع', sample_taste: 'عينة تذوق',
};

const pctTxt = (v: number) => `${v.toFixed(2)}%`;
const primeZone = (v: number) => (v <= 55 ? 'ممتاز' : v <= 60 ? 'جيد' : v <= 65 ? 'تحذير' : 'خطر');
const zoneTone = (v: number) => (v <= 55 ? 'text-emerald-700' : v <= 60 ? 'text-sky-700' : v <= 65 ? 'text-amber-600' : 'text-rose-600');

type TabId = 'breakeven' | 'contribution' | 'prime' | 'trend' | 'drilldown' | 'wastage';

const TABS: { id: string; label: string }[] = [
  { id: 'breakeven', label: 'نقطة التعادل' },
  { id: 'contribution', label: 'هامش المساهمة' },
  { id: 'prime', label: 'Prime Cost' },
  { id: 'trend', label: 'الاتجاه والتنبؤ' },
  { id: 'drilldown', label: 'تفصيل تكلفة الطبق' },
  { id: 'wastage', label: 'أثر الهالك' },
];

interface BranchAggRow {
  id: string; name: string;
  net: number; food: number; labor: number; opex: number; wastage: number;
  variable: number; fixed: number;
  cmPct: number; foodPct: number; laborPct: number; primePct: number;
  profit: number; breakEven: number; beOk: boolean; safety: number;
}

interface DrillLine {
  name: string; unit: string; qty: number;
  yieldPct: number; wastePct: number; effQty: number; price: number; cost: number;
}

const Kpi: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-indigo-700' }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
    <div className="text-[10px] font-bold text-slate-500 mb-1">{label}</div>
    <div className={`text-sm font-extrabold font-mono ${tone}`}>{value}</div>
  </div>
);

export const CostIntelligenceView: React.FC = () => {
  const {
    posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs,
    recipes, rawMaterials, getBranchName, getRawMaterialName, calculateRecipeCosts,
    getAverageUnitCost,
    globalTargetMarginPercent,
  } = useApp();

  const [tab, setTab] = useState<TabId>('breakeven');
  const [recipeSel, setRecipeSel] = useState('');

  /* ============ 1) تجميع الفروع (أساس صافي بدون ضريبة) ============ */
  const branchAgg = useMemo(() => {
    type Acc = { net: number; food: number; labor: number; opex: number; wastage: number };
    const acc = new Map<string, Acc>();
    const ensure = (id: string): Acc => {
      let a = acc.get(id);
      if (!a) { a = { net: 0, food: 0, labor: 0, opex: 0, wastage: 0 }; acc.set(id, a); }
      return a;
    };
    posOrders.forEach((o) => {
      const a = ensure(o.branchId);
      a.net += o.subtotal;
      o.items.forEach((i) => { a.food += i.quantity * i.unitCost; });
    });
    batchSalesRecords.forEach((b) => {
      const a = ensure(b.branchId);
      a.net += b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      a.food += b.totalFoodCost;
    });
    shifts.forEach((s) => { ensure(s.branchId).labor += s.totalShiftCost; });
    operatingExpenses.filter((e) => e.paymentStatus === 'paid').forEach((e) => { ensure(e.branchId).opex += e.amount; });
    wastageLogs.forEach((w) => { ensure(w.branchId).wastage += w.totalCostImpact; });

    const derive = (id: string, v: Acc): BranchAggRow => {
      const variable = v.food + v.wastage;
      const fixed = v.labor + v.opex;
      const cmr = v.net ? (v.net - variable) / v.net : 0;
      const beRaw = cmr > 0 ? fixed / cmr : Infinity;
      return {
        id,
        name: id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id),
        ...v, variable, fixed,
        cmPct: v.net ? cmr * 100 : 0,
        foodPct: v.net ? (v.food / v.net) * 100 : 0,
        laborPct: v.net ? (v.labor / v.net) * 100 : 0,
        primePct: v.net ? ((v.food + v.labor) / v.net) * 100 : 0,
        profit: v.net - variable - fixed,
        breakEven: Number.isFinite(beRaw) ? beRaw : 0,
        beOk: Number.isFinite(beRaw),
        safety: Number.isFinite(beRaw) && v.net ? ((v.net - beRaw) / v.net) * 100 : 0,
      };
    };
    const rows = Array.from(acc.entries()).map(([id, v]) => derive(id, v)).sort((a, b) => b.net - a.net);
    const t = rows.reduce<Acc>((s, r) => ({
      net: s.net + r.net, food: s.food + r.food, labor: s.labor + r.labor,
      opex: s.opex + r.opex, wastage: s.wastage + r.wastage,
    }), { net: 0, food: 0, labor: 0, opex: 0, wastage: 0 });
    const total = derive('ALL', t);
    total.name = 'الإجمالي';
    return { rows, total };
  }, [posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, getBranchName]);

  /* ============ 2) هامش المساهمة لكل طبق ============ */
  const cmRows = useMemo(() => {
    const agg = new Map<string, { qty: number; rev: number; cost: number }>();
    const add = (id: string, q: number, rev: number, c: number) => {
      const cur = agg.get(id) || { qty: 0, rev: 0, cost: 0 };
      cur.qty += q; cur.rev += rev; cur.cost += c;
      agg.set(id, cur);
    };
    posOrders.forEach((o) => {
      const gross = o.items.reduce((s, i) => s + i.lineTotal, 0) || 1;
      const ratio = o.subtotal / gross;
      o.items.forEach((i) => add(i.recipeId, i.quantity, i.lineTotal * ratio, i.quantity * i.unitCost));
    });
    batchSalesRecords.forEach((b) => {
      const gross = b.items.reduce((s, i) => s + i.lineTotalRevenue, 0) || 1;
      const ratio = (b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE)) / gross;
      b.items.forEach((i) => add(i.recipeId, i.quantitySold, i.lineTotalRevenue * ratio, i.lineTotalCost));
    });
    return Array.from(agg.entries()).map(([id, v]) => {
      const rec = recipes.find((x) => x.id === id);
      const price = v.qty ? v.rev / v.qty : (rec?.actualMenuPrice || 0);
      const costs = rec
        ? calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces)
        : null;
      const unitCost = costs ? costs.totalCost : (v.qty ? v.cost / v.qty : 0);
      const cm = price - unitCost;
      return {
        id, name: rec?.nameAr || id, qty: v.qty, price, unitCost, cm,
        cmPct: price ? (cm / price) * 100 : 0,
        totalCM: v.rev - unitCost * v.qty,
      };
    }).filter((r) => r.qty > 0).sort((a, b) => b.totalCM - a.totalCM);
  }, [posOrders, batchSalesRecords, recipes, calculateRecipeCosts]);
  const cmTotal = cmRows.reduce((s, r) => s + r.totalCM, 0);

  /* ============ 3) الاتجاه الشهري + التنبؤ ============ */
  const trend = useMemo(() => {
    const std = new Map(recipes.map((r) => [
      r.id,
      calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces).foodCost,
    ]));
    type M = { sales: number; actual: number; theo: number };
    const m = new Map<string, M>();
    const add = (k: string, s = 0, a = 0, th = 0) => {
      const cur = m.get(k) || { sales: 0, actual: 0, theo: 0 };
      cur.sales += s; cur.actual += a; cur.theo += th;
      m.set(k, cur);
    };
    posOrders.forEach((o) => {
      const k = o.date.slice(0, 7);
      const gross = o.items.reduce((s, i) => s + i.lineTotal, 0) || 1;
      const ratio = o.subtotal / gross;
      o.items.forEach((i) => add(k, i.lineTotal * ratio, i.quantity * i.unitCost, (std.get(i.recipeId) || 0) * i.quantity));
    });
    batchSalesRecords.forEach((b) => {
      const k = b.date.slice(0, 7);
      const gross = b.items.reduce((s, i) => s + i.lineTotalRevenue, 0) || 1;
      const ratio = (b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE)) / gross;
      b.items.forEach((i) => add(k, i.lineTotalRevenue * ratio, i.lineTotalCost, (std.get(i.recipeId) || 0) * i.quantitySold));
    });
    const rows = Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({
      key, name: monthLabel(key),
      sales: v.sales, actual: v.actual, theo: v.theo,
      fcPct: v.sales ? (v.actual / v.sales) * 100 : 0,
      theoPct: v.sales ? (v.theo / v.sales) * 100 : 0,
      variance: v.actual - v.theo,
      variancePct: v.theo ? ((v.actual - v.theo) / v.theo) * 100 : 0,
    }));
    const lastKey = rows.length ? rows[rows.length - 1].key : '';
    const fcFcst = forecastSeries(rows.map((r) => Number(r.fcPct.toFixed(2))), 3);
    const nextLabels = Array.from({ length: 3 }, (_, i) => {
      if (!lastKey) return `توقع ${i + 1}`;
      const [y, mo] = lastKey.split('-').map(Number);
      const d = new Date(y, (mo || 1) - 1 + i + 1, 1);
      return monthLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    const chartData = [
      ...rows.map((r, i) => ({
        name: r.name,
        actualFc: Number(r.fcPct.toFixed(2)),
        fcst: i === rows.length - 1 ? (fcFcst[0] ?? null) : null as number | null,
      })),
      ...fcFcst.map((v, i) => ({ name: nextLabels[i], actualFc: null as number | null, fcst: v })),
    ];
    return { rows, chartData, fcFcst, nextLabels };
  }, [posOrders, batchSalesRecords, recipes, calculateRecipeCosts]);

  /* ============ 4) تفصيل تكلفة الطبق ============ */
  const menuRecipes = useMemo(() => recipes.filter((r) => r.isActive && !r.isCentralKitchenPrep), [recipes]);
  const selRecipe = recipes.find((r) => r.id === recipeSel)
    || menuRecipes.find((r) => r.actualMenuPrice > 0)
    || null;

  const drill = useMemo(() => {
    if (!selRecipe) return null;
    const ingLines: DrillLine[] = selRecipe.ingredients.map((ing) => {
      const mat = rawMaterials.find((x) => x.id === ing.rawMaterialId);
      const yieldF = mat?.yieldPercentage ? mat.yieldPercentage / 100 : 1;
      const wf = 1 + (ing.wastagePercent || 0) / 100;
      const effQty = (ing.quantity / yieldF) * wf;
      const price = getAverageUnitCost(ing.rawMaterialId);
      return {
        name: mat?.nameAr || getRawMaterialName(ing.rawMaterialId),
        unit: mat?.unit || '',
        qty: ing.quantity,
        yieldPct: mat?.yieldPercentage ?? 100,
        wastePct: ing.wastagePercent || 0,
        effQty, price, cost: effQty * price,
      };
    });
    const spLines: DrillLine[] = [];
    (selRecipe.subPrepIngredients || []).forEach((sp) => {
      const sub = recipes.find((r) => r.id === sp.recipeId);
      if (!sub) return;
      const pieces = Number(sub.yieldPieces) > 0 ? Number(sub.yieldPieces)
        : (Number(sub.portionSize) > 0 ? Number(sub.portionSize) : 1);
      const subTotal = calculateRecipeCosts(sub.ingredients, sub.directLaborCost, sub.packagingCost, sub.subPrepIngredients, sub.yieldPieces).totalCost;
      const unit = pieces ? subTotal / pieces : subTotal;
      spLines.push({
        name: `تحضير: ${sub.nameAr}`, unit: 'حصة', qty: sp.quantity,
        yieldPct: pieces, wastePct: 0, effQty: sp.quantity, price: unit, cost: sp.quantity * unit,
      });
    });
    const allLines = [...ingLines, ...spLines];
    const foodCost = allLines.reduce((s, l) => s + l.cost, 0);
    const costs = calculateRecipeCosts(selRecipe.ingredients, selRecipe.directLaborCost, selRecipe.packagingCost, selRecipe.subPrepIngredients, selRecipe.yieldPieces);
    const price = selRecipe.actualMenuPrice || costs.suggestedPrice;
    const targetMargin = selRecipe.targetMarginPercent ?? globalTargetMarginPercent;
    const sorted = [...allLines].sort((a, b) => b.cost - a.cost);
    const top = sorted.slice(0, 8).map((l) => ({ name: l.name, value: l.cost }));
    const restVal = sorted.slice(8).reduce((s, l) => s + l.cost, 0);
    if (restVal > 0) top.push({ name: 'أخرى', value: restVal });
    return {
      ingLines, spLines, foodCost,
      spCost: spLines.reduce((s, l) => s + l.cost, 0),
      totalCost: costs.totalCost,
      price,
      marginVal: price - costs.totalCost,
      marginPct: price ? ((price - costs.totalCost) / price) * 100 : 0,
      targetFc: 100 - targetMargin,
      suggestedPrice: costs.suggestedPrice,
      pieData: top,
    };
  }, [recipeSel, selRecipe, recipes, rawMaterials, calculateRecipeCosts, getRawMaterialName, globalTargetMarginPercent]);

  /* ============ 5) أثر الهالك ============ */
  const wasteByCat = useMemo(() => {
    const map = new Map<string, number>();
    wastageLogs.forEach((w) => map.set(w.category, (map.get(w.category) || 0) + w.totalCostImpact));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      .map(([cat, value]) => ({ name: WASTE_LABELS[cat] || cat, value }));
  }, [wastageLogs]);
  const wasteTotal = wasteByCat.reduce((s, w) => s + w.value, 0);
  const wasteBranch = branchAgg.rows
    .filter((r) => r.wastage > 0)
    .map((r) => ({
      name: r.name, waste: r.wastage,
      pctOfSales: r.net ? (r.wastage / r.net) * 100 : 0,
      pctOfProfit: r.profit > 0 ? (r.wastage / r.profit) * 100 : null as number | null,
    })).sort((a, b) => b.waste - a.waste);

  /* ============ الطباعة ============ */
  const todayStr = new Date().toLocaleDateString('ar-SA-u-nu-latn');
  const baseMeta: [string, string][] = [['تاريخ الطباعة', todayStr]];
  const foot = 'مركز تقارير التكلفة المتقدمة — RestoCost ERP';

  const printBreakeven = () => openPrintWindow({
    title: 'تحليل نقطة التعادل',
    subtitle: 'الإيراد اللازم لتغطية كامل التكاليف',
    meta: baseMeta,
    tables: [{
      title: 'نقطة التعادل حسب الفرع',
      header: ['الفرع', 'المبيعات الصافية', 'التكلفة المتغيرة', 'التكلفة الثابتة', 'هامش المساهمة %', 'نقطة التعادل', 'هامش الأمان %'],
      rows: [
        ...branchAgg.rows.map((r) => [r.name, fmt(r.net), fmt(r.variable), fmt(r.fixed), pctTxt(r.cmPct), r.beOk ? fmt(r.breakEven) : 'غير قابلة', pctTxt(r.safety)]),
        ['الإجمالي', fmt(branchAgg.total.net), fmt(branchAgg.total.variable), fmt(branchAgg.total.fixed), pctTxt(branchAgg.total.cmPct), branchAgg.total.beOk ? fmt(branchAgg.total.breakEven) : 'غير قابلة', pctTxt(branchAgg.total.safety)],
      ],
    }],
    totals: [['صافي الربح الحالي', fmtMoney(branchAgg.total.profit)]],
    footer: foot,
  });

  const printContribution = () => openPrintWindow({
    title: 'تحليل هامش المساهمة لكل طبق',
    subtitle: 'على أساس الإيراد الصافي بدون ضريبة',
    meta: baseMeta,
    tables: [{
      title: 'هامش المساهمة',
      header: ['الطبق', 'الكمية', 'متوسط السعر الصافي', 'تكلفة الوحدة', 'هامش الوحدة', 'الهامش %', 'إجمالي المساهمة'],
      rows: cmRows.map((r) => [r.name, fmt(r.qty), fmt(r.price), fmt(r.unitCost), fmt(r.cm), pctTxt(r.cmPct), fmt(r.totalCM)]),
    }],
    totals: [['إجمالي هامش المساهمة', fmtMoney(cmTotal)]],
    footer: foot,
  });

  const printPrime = () => openPrintWindow({
    title: 'تقرير التكلفة الأولية Prime Cost',
    subtitle: 'تكلفة الطعام + العمالة مقابل المبيعات الصافية',
    meta: baseMeta,
    tables: [{
      title: 'Prime Cost حسب الفرع (المعيار: أقل من 60%)',
      header: ['الفرع', 'المبيعات الصافية', 'تكلفة الطعام %', 'تكلفة العمالة %', 'Prime Cost %', 'التقييم'],
      rows: [
        ...branchAgg.rows.map((r) => [r.name, fmt(r.net), pctTxt(r.foodPct), pctTxt(r.laborPct), pctTxt(r.primePct), primeZone(r.primePct)]),
        ['الإجمالي', fmt(branchAgg.total.net), pctTxt(branchAgg.total.foodPct), pctTxt(branchAgg.total.laborPct), pctTxt(branchAgg.total.primePct), primeZone(branchAgg.total.primePct)],
      ],
    }],
    footer: foot,
  });

  const printTrend = () => openPrintWindow({
    title: 'الاتجاه الشهري لتكلفة الطعام مع التنبؤ',
    subtitle: 'الفعلي مقابل النظري وتوقع الأشهر القادمة',
    meta: baseMeta,
    tables: [
      {
        title: 'الأداء الشهري',
        header: ['الشهر', 'المبيعات الصافية', 'التكلفة الفعلية', 'FC فعلي %', 'FC نظري %', 'انحراف %'],
        rows: trend.rows.map((r) => [r.name, fmt(r.sales), fmt(r.actual), pctTxt(r.fcPct), pctTxt(r.theoPct), pctTxt(r.variancePct)]),
      },
      {
        title: 'التنبؤ للأشهر القادمة (انحدار خطي)',
        header: ['الشهر', 'FC متوقع %'],
        rows: trend.nextLabels.map((n, i) => [n, `${(trend.fcFcst[i] ?? 0).toFixed(2)}%`]),
      },
    ],
    footer: foot,
  });

  const printDrill = () => {
    if (!drill || !selRecipe) return;
    openPrintWindow({
      title: `تفصيل تكلفة الطبق — ${selRecipe.nameAr}`,
      subtitle: 'المكونات والتحضيرات والعمالة والتغليف',
      meta: [...baseMeta, ['سعر البيع الحالي', fmtMoney(drill.price)], ['التكلفة الكلية', fmtMoney(drill.totalCost)], ['الهامش الحالي', pctTxt(drill.marginPct)]],
      tables: [{
        title: 'بنود التكلفة',
        header: ['البند', 'الوحدة', 'الكمية', 'الإنتاجية %', 'هدر %', 'الفعلي بعد الفاقد', 'سعر الوحدة', 'التكلفة'],
        rows: [...drill.ingLines, ...drill.spLines].map((l) => [
          l.name, l.unit, fmt(l.qty), pctTxt(l.yieldPct), pctTxt(l.wastePct), fmt(l.effQty), fmt(l.price), fmt(l.cost),
        ]),
      }],
      totals: [
        ['المكونات الخام', fmtMoney(drill.foodCost - drill.spCost)],
        ['التحضيرات الفرعية', fmtMoney(drill.spCost)],
        ['العمالة المباشرة', fmtMoney(selRecipe.directLaborCost)],
        ['التغليف', fmtMoney(selRecipe.packagingCost)],
        ['إجمالي التكلفة', fmtMoney(drill.totalCost)],
        ['هامش الربح', `${fmtMoney(drill.marginVal)} (${pctTxt(drill.marginPct)})`],
      ],
      footer: foot,
    });
  };

  const printWastage = () => openPrintWindow({
    title: 'تقرير أثر الهوالك على الربحية',
    subtitle: 'الهالك يستهلك من صافي الربح مباشرة',
    meta: baseMeta,
    tables: [
      {
        title: 'حسب الفئة',
        header: ['الفئة', 'قيمة الهالك', '% من الإجمالي'],
        rows: wasteByCat.map((w) => [w.name, fmt(w.value), pctTxt(wasteTotal ? (w.value / wasteTotal) * 100 : 0)]),
      },
      {
        title: 'حسب الفرع',
        header: ['الفرع', 'قيمة الهالك', '% من المبيعات الصافية', '% من صافي الربح'],
        rows: wasteBranch.map((w) => [w.name, fmt(w.waste), pctTxt(w.pctOfSales), w.pctOfProfit !== null ? pctTxt(Math.min(w.pctOfProfit, 999)) : 'ربح سالب']),
      },
    ],
    totals: [['إجمالي الهالك', fmtMoney(wasteTotal)], ['كنسبة من المبيعات الصافية', pctTxt(branchAgg.total.net ? (wasteTotal / branchAgg.total.net) * 100 : 0)]],
    footer: foot,
  });

  /* ============ CSV ============ */
  const csvBreakeven = () => downloadCSV('تحليل_نقطة_التعادل.csv',
    ['الفرع', 'المبيعات الصافية', 'التكلفة المتغيرة', 'التكلفة الثابتة', 'هامش المساهمة %', 'نقطة التعادل', 'هامش الأمان %', 'صافي الربح'],
    branchAgg.rows.map((r) => [r.name, r.net.toFixed(2), r.variable.toFixed(2), r.fixed.toFixed(2), r.cmPct.toFixed(2), r.breakEven.toFixed(2), r.safety.toFixed(2), r.profit.toFixed(2)]));

  const csvContribution = () => downloadCSV('هامش_المساهمة.csv',
    ['الطبق', 'الكمية', 'متوسط السعر الصافي', 'تكلفة الوحدة', 'هامش الوحدة', 'الهامش %', 'إجمالي المساهمة'],
    cmRows.map((r) => [r.name, r.qty.toFixed(2), r.price.toFixed(2), r.unitCost.toFixed(2), r.cm.toFixed(2), r.cmPct.toFixed(2), r.totalCM.toFixed(2)]));

  const csvWastage = () => downloadCSV('أثر_الهالك.csv',
    ['الفرع', 'قيمة الهالك', '% من المبيعات', '% من صافي الربح'],
    wasteBranch.map((w) => [w.name, w.waste.toFixed(2), w.pctOfSales.toFixed(2), w.pctOfProfit !== null ? w.pctOfProfit.toFixed(2) : '-']));

  /* ============ Excel ============ */
  const excelSheets = [
    {
      name: 'نقطة التعادل',
      header: ['الفرع', 'المبيعات الصافية', 'المتغيرة', 'الثابتة', 'CM %', 'نقطة التعادل', 'الأمان %', 'الربح'],
      rows: branchAgg.rows.map((r) => [r.name, r.net, r.variable, r.fixed, r.cmPct, r.breakEven, r.safety, r.profit]),
    },
    {
      name: 'هامش المساهمة',
      header: ['الطبق', 'الكمية', 'السعر الصافي', 'تكلفة الوحدة', 'هامش الوحدة', 'الهامش %', 'إجمالي المساهمة'],
      rows: cmRows.map((r) => [r.name, r.qty, r.price, r.unitCost, r.cm, r.cmPct, r.totalCM]),
    },
    {
      name: 'Prime Cost',
      header: ['الفرع', 'المبيعات', 'طعام %', 'عمالة %', 'Prime %', 'التقييم'],
      rows: branchAgg.rows.map((r) => [r.name, r.net, r.foodPct, r.laborPct, r.primePct, primeZone(r.primePct)]),
    },
    {
      name: 'الاتجاه الشهري',
      header: ['الشهر', 'المبيعات', 'فعلي', 'نظري', 'FC %', 'انحراف %'],
      rows: trend.rows.map((r) => [r.name, r.sales, r.actual, r.theo, r.fcPct, r.variancePct]),
    },
    {
      name: 'أثر الهالك',
      header: ['الفرع', 'الهالك', '% من المبيعات', '% من صافي الربح'],
      rows: wasteBranch.map((w) => [w.name, w.waste, w.pctOfSales, w.pctOfProfit ?? -1]),
    },
  ];

  const th = 'text-right py-2 px-2 font-bold whitespace-nowrap';
  const td = 'py-2 px-2 border-b border-slate-100 font-mono whitespace-nowrap';

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز تقارير التكلفة المتقدمة"
        subtitle="نقطة التعادل · هامش المساهمة · Prime Cost · الاتجاه والتنبؤ · تفصيل الطبق · أثر الهالك"
        icon={<BarChart3 className="w-6 h-6 text-indigo-300" />}
        actions={<ViewToolbar filename="مركز_تقارير_التكلفة_المتقدمة" sheets={excelSheets} />}
      />
      <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

      {/* ================= نقطة التعادل ================= */}
      {tab === 'breakeven' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-500" /> تحليل نقطة التعادل</h3>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={csvBreakeven}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
              <Btn tone="primary" onClick={printBreakeven}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Kpi label="المبيعات الصافية" value={fmtMoney(branchAgg.total.net)} />
            <Kpi label="تكلفة متغيرة" value={fmtMoney(branchAgg.total.variable)} tone="text-rose-600" />
            <Kpi label="تكلفة ثابتة" value={fmtMoney(branchAgg.total.fixed)} tone="text-amber-600" />
            <Kpi label="هامش المساهمة" value={pctTxt(branchAgg.total.cmPct)} tone="text-sky-700" />
            <Kpi label="نقطة التعادل" value={branchAgg.total.beOk ? fmtMoney(branchAgg.total.breakEven) : 'غير قابلة'} tone="text-purple-700" />
            <Kpi label="هامش الأمان" value={pctTxt(branchAgg.total.safety)} tone={branchAgg.total.safety >= 20 ? 'text-emerald-700' : 'text-rose-600'} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={branchAgg.rows} margin={{ top: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="net" name="المبيعات الصافية" fill="#6366f1" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: any) => fmtNum(Number(v), 0) }} />
              <Bar dataKey="breakEven" name="نقطة التعادل" fill="#f59e0b" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: any) => fmtNum(Number(v), 0) }} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {[['الفرع'], ['المبيعات'], ['متغيرة'], ['ثابتة'], ['CM %'], ['نقطة التعادل'], ['الأمان %'], ['الربح']].map((h) => <th key={h[0]} className={th}>{h[0]}</th>)}
              </tr></thead>
              <tbody>
                {branchAgg.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{fmt(r.net)}</td>
                    <td className={td}>{fmt(r.variable)}</td>
                    <td className={td}>{fmt(r.fixed)}</td>
                    <td className={td}>{pctTxt(r.cmPct)}</td>
                    <td className={td}>{r.beOk ? fmt(r.breakEven) : 'غير قابلة'}</td>
                    <td className={`${td} font-bold ${r.safety >= 20 ? 'text-emerald-700' : 'text-rose-600'}`}>{pctTxt(r.safety)}</td>
                    <td className={`${td} ${r.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(r.profit)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className={`${td} text-slate-800`}>الإجمالي</td>
                  <td className={td}>{fmt(branchAgg.total.net)}</td>
                  <td className={td}>{fmt(branchAgg.total.variable)}</td>
                  <td className={td}>{fmt(branchAgg.total.fixed)}</td>
                  <td className={td}>{pctTxt(branchAgg.total.cmPct)}</td>
                  <td className={td}>{branchAgg.total.beOk ? fmt(branchAgg.total.breakEven) : 'غير قابلة'}</td>
                  <td className={td}>{pctTxt(branchAgg.total.safety)}</td>
                  <td className={`${td} ${branchAgg.total.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(branchAgg.total.profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= هامش المساهمة ================= */}
      {tab === 'contribution' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Coins className="w-4 h-4 text-emerald-500" /> هامش المساهمة لكل طبق</h3>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={csvContribution}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
              <Btn tone="primary" onClick={printContribution}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="إجمالي هامش المساهمة" value={fmtMoney(cmTotal)} tone="text-emerald-700" />
            <Kpi label="عدد الأطباق المباعة" value={fmt(cmRows.length)} />
            <Kpi label="أعلى طبق مساهمة" value={cmRows[0]?.name || '—'} tone="text-indigo-700" />
            <Kpi label="متوسط هامش الوحدة %" value={cmRows.length ? pctTxt(cmRows.reduce((s, r) => s + r.cmPct, 0) / cmRows.length) : '0.00%'} tone="text-sky-700" />
          </div>
          <ResponsiveContainer width="100%" height={Math.max(220, Math.min(cmRows.length, 10) * 34 + 60)}>
            <BarChart layout="vertical" data={cmRows.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Bar dataKey="totalCM" name="إجمالي المساهمة" fill="#10b981" radius={[0, 6, 6, 0]} label={{ position: 'insideRight', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: any) => fmtNum(Number(v), 0) }} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['الطبق', 'الكمية', 'متوسط السعر الصافي', 'تكلفة الوحدة', 'هامش الوحدة', 'الهامش %', 'إجمالي المساهمة'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {cmRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{fmt(r.qty)}</td>
                    <td className={td}>{fmt(r.price)}</td>
                    <td className={td}>{fmt(r.unitCost)}</td>
                    <td className={`${td} ${r.cm >= 0 ? '' : 'text-rose-600'}`}>{fmt(r.cm)}</td>
                    <td className={`${td} font-bold ${r.cmPct >= 60 ? 'text-emerald-700' : r.cmPct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{pctTxt(r.cmPct)}</td>
                    <td className={`${td} font-bold text-emerald-700`}>{fmt(r.totalCM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= Prime Cost ================= */}
      {tab === 'prime' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Gauge className="w-4 h-4 text-rose-500" /> التكلفة الأولية Prime Cost (طعام + عمالة)</h3>
            <Btn tone="primary" onClick={printPrime}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Prime Cost للنظام" value={pctTxt(branchAgg.total.primePct)} tone={zoneTone(branchAgg.total.primePct)} />
            <Kpi label="تكلفة الطعام" value={pctTxt(branchAgg.total.foodPct)} tone="text-amber-600" />
            <Kpi label="تكلفة العمالة" value={pctTxt(branchAgg.total.laborPct)} tone="text-sky-700" />
            <Kpi label="التقييم العام" value={primeZone(branchAgg.total.primePct)} tone={zoneTone(branchAgg.total.primePct)} />
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={[...branchAgg.rows, branchAgg.total].map((r) => ({ name: r.name, prime: Number(r.primePct.toFixed(2)) }))} margin={{ top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <ReferenceLine y={60} stroke="#f43f5e" strokeDasharray="6 4" label={{ value: 'حد الخطر 60%', fontSize: 10, fill: '#f43f5e' }} />
              <Bar dataKey="prime" name="Prime Cost %" radius={[6, 6, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 10, fontWeight: 700, formatter: (v: any) => `${Number(v).toFixed(1)}%` }}>
                {[...branchAgg.rows, branchAgg.total].map((r, i) => <Cell key={i} fill={r.primePct <= 55 ? '#10b981' : r.primePct <= 65 ? '#f59e0b' : '#f43f5e'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['الفرع', 'المبيعات الصافية', 'تكلفة الطعام %', 'تكلفة العمالة %', 'Prime Cost %', 'التقييم'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {[...branchAgg.rows, branchAgg.total].map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{fmt(r.net)}</td>
                    <td className={td}>{pctTxt(r.foodPct)}</td>
                    <td className={td}>{pctTxt(r.laborPct)}</td>
                    <td className={`${td} font-extrabold ${zoneTone(r.primePct)}`}>{pctTxt(r.primePct)}</td>
                    <td className={`${td} font-bold ${zoneTone(r.primePct)}`}>{primeZone(r.primePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= الاتجاه والتنبؤ ================= */}
      {tab === 'trend' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-sky-500" /> الاتجاه الشهري + تنبؤ انحدار خطي</h3>
            <Btn tone="primary" onClick={printTrend}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="آخر FC فعلي" value={trend.rows.length ? pctTxt(trend.rows[trend.rows.length - 1].fcPct) : '—'} tone="text-rose-600" />
            <Kpi label="آخر FC نظري" value={trend.rows.length ? pctTxt(trend.rows[trend.rows.length - 1].theoPct) : '—'} tone="text-slate-700" />
            <Kpi label="آخر انحراف عن النظري" value={trend.rows.length ? pctTxt(trend.rows[trend.rows.length - 1].variancePct) : '—'} tone="text-amber-600" />
            <Kpi label={`تنبؤ ${trend.nextLabels[0]}`} value={`${(trend.fcFcst[0] ?? 0).toFixed(2)}%`} tone="text-indigo-700" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="actualFc" name="FC فعلي %" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="fcst" name="تنبؤ" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                {['الشهر', 'المبيعات الصافية', 'التكلفة الفعلية', 'FC فعلي %', 'FC نظري %', 'الانحراف', 'انحراف %'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {trend.rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className={`${td} font-bold text-slate-700`}>{r.name}</td>
                    <td className={td}>{fmt(r.sales)}</td>
                    <td className={td}>{fmt(r.actual)}</td>
                    <td className={`${td} font-bold ${r.fcPct <= 35 ? 'text-emerald-700' : r.fcPct <= 42 ? 'text-amber-600' : 'text-rose-600'}`}>{pctTxt(r.fcPct)}</td>
                    <td className={td}>{pctTxt(r.theoPct)}</td>
                    <td className={`${td} ${r.variance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(r.variance)}</td>
                    <td className={td}>{pctTxt(r.variancePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================= تفصيل تكلفة الطبق ================= */}
      {tab === 'drilldown' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-violet-500" /> تفصيل تكلفة الطبق</h3>
            <Btn tone="primary" onClick={printDrill}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
          <Field label="اختر الطبق">
            <select value={selRecipe?.id || ''} onChange={(e) => setRecipeSel(e.target.value)} className={inputCls}>
              {menuRecipes.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
            </select>
          </Field>
          {!drill || !selRecipe ? (
            <div className="text-center text-xs font-bold text-slate-400 py-8">لا توجد وصفات نشطة متاحة</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Kpi label="سعر البيع" value={fmtMoney(drill.price)} />
                <Kpi label="التكلفة الكلية" value={fmtMoney(drill.totalCost)} tone="text-rose-600" />
                <Kpi label="هامش الربح" value={`${fmtMoney(drill.marginVal)}`} tone="text-emerald-700" />
                <Kpi label="هامش الربح %" value={pctTxt(drill.marginPct)} tone="text-emerald-700" />
                <Kpi label="FC المكونات فقط" value={pctTxt(drill.price ? (drill.foodCost / drill.price) * 100 : 0)} tone="text-amber-600" />
                <Kpi label="السعر المقترح" value={fmtMoney(drill.suggestedPrice)} tone="text-sky-700" />
              </div>
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                      {['البند', 'الوحدة', 'الكمية', 'إنتاجية %', 'هدر %', 'بعد الفاقد', 'سعر الوحدة', 'التكلفة'].map((h) => <th key={h} className={th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[...drill.ingLines, ...drill.spLines].map((l, idx) => (
                        <tr key={`${l.name}-${idx}`} className="hover:bg-slate-50">
                          <td className={`${td} font-bold text-slate-700`}>{l.name}</td>
                          <td className={td}>{l.unit}</td>
                          <td className={td}>{fmt(l.qty)}</td>
                          <td className={td}>{pctTxt(l.yieldPct)}</td>
                          <td className={td}>{pctTxt(l.wastePct)}</td>
                          <td className={td}>{fmt(l.effQty)}</td>
                          <td className={td}>{fmt(l.price)}</td>
                          <td className={`${td} font-bold`}>{fmt(l.cost)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td className={`${td} text-slate-800`} colSpan={7}>إجمالي تكلفة المكونات والتحضيرات</td>
                        <td className={`${td} text-indigo-700`}>{fmt(drill.foodCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={drill.pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {drill.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 text-[11px] font-bold mt-2">
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-1.5"><span className="text-slate-500">العمالة المباشرة</span><span className="font-mono">{fmtMoney(selRecipe.directLaborCost)}</span></div>
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-1.5"><span className="text-slate-500">التغليف</span><span className="font-mono">{fmtMoney(selRecipe.packagingCost)}</span></div>
                    <div className="flex justify-between bg-indigo-50 rounded-lg px-3 py-1.5"><span className="text-indigo-600">إجمالي التكلفة</span><span className="font-mono text-indigo-700">{fmtMoney(drill.totalCost)}</span></div>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ================= أثر الهالك ================= */}
      {tab === 'wastage' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> أثر الهوالك على الربحية</h3>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={csvWastage}><FileSpreadsheet className="w-4 h-4" /> CSV</Btn>
              <Btn tone="primary" onClick={printWastage}><Printer className="w-4 h-4" /> طباعة</Btn>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="إجمالي الهالك" value={fmtMoney(wasteTotal)} tone="text-rose-600" />
            <Kpi label="% من المبيعات الصافية" value={pctTxt(branchAgg.total.net ? (wasteTotal / branchAgg.total.net) * 100 : 0)} tone="text-amber-600" />
            <Kpi label="أعلى فرع" value={wasteBranch[0]?.name || '—'} tone="text-rose-600" />
            <Kpi label="أكبر فئة" value={wasteByCat[0]?.name || '—'} tone="text-indigo-700" />
          </div>
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={wasteByCat} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {wasteByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 border-b-2 border-slate-200">
                  {['الفرع', 'الهالك', '% من المبيعات', '% من صافي الربح'].map((h) => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {wasteBranch.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-6 text-slate-400 font-bold">لا توجد هوالك مسجلة</td></tr>
                  )}
                  {wasteBranch.map((w) => (
                    <tr key={w.name} className="hover:bg-slate-50">
                      <td className={`${td} font-bold text-slate-700`}>{w.name}</td>
                      <td className={td}>{fmt(w.waste)}</td>
                      <td className={`${td} font-bold ${w.pctOfSales > 3 ? 'text-rose-600' : 'text-amber-600'}`}>{pctTxt(w.pctOfSales)}</td>
                      <td className={td}>{w.pctOfProfit !== null ? pctTxt(Math.min(w.pctOfProfit, 999)) : 'ربح سالب'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
