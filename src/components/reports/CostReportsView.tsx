import React, { useState, useMemo } from 'react';
import { BarChart as BarIcon, TrendingDown, TrendingUp, Printer, Receipt, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, Btn, inputCls } from '../ui';
import {
  ErpPanel, ErpPageHeader, ErpButton, ErpKpi, ErpTabs,
} from '../ui/erp';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, EXPENSE_CATEGORY_LABELS } from '../../utils/helpers';
import { captureCharts, openPrintWindow } from '../../utils/print';
import { AIAnalyzeModal } from '../ai/AIAnalyzeModal';

type TabId = 'costs' | 'branches' | 'vat' | 'recipes' | 'expenses' | 'wastage';

export const CostReportsView: React.FC = () => {
  const { batchSalesRecords, operatingExpenses, wastageLogs, grnNotes, shifts, recipes, vatPercent, setVatPercent, vatInclusive, setVatInclusive, getBranchName, calculateRecipeCosts, globalTargetMarginPercent, inventory, rawMaterials, getRawMaterialName } = useApp();
  const [tab, setTab] = useState<TabId>('costs');
  const [aiOpen, setAiOpen] = useState(false);

  const netOf = (b: { netRevenue?: number; totalRevenue: number; vatRate?: number }) => b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? vatPercent / 100));
  const monthlyRevenue = batchSalesRecords.reduce((s, b) => s + netOf(b), 0);
  const monthlyFoodCost = batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
  const monthlyExpenses = operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
  const monthlyWastage = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const monthlyLabor = shifts.reduce((s, sh) => s + sh.totalShiftCost, 0);
  const fcPct = monthlyRevenue ? (monthlyFoodCost / monthlyRevenue) * 100 : 0;
  const totalOverhead = monthlyExpenses + monthlyWastage + monthlyLabor;
  const overheadPct = monthlyRevenue ? (totalOverhead / monthlyRevenue) * 100 : 0;
  const totalCostPct = fcPct + overheadPct;

  const revenueByBranch = batchSalesRecords.reduce<Record<string, number>>((acc, b) => { acc[b.branchId] = (acc[b.branchId] || 0) + netOf(b); return acc; }, {});
  const costByBranch = batchSalesRecords.reduce<Record<string, number>>((acc, b) => { acc[b.branchId] = (acc[b.branchId] || 0) + b.totalFoodCost; return acc; }, {});
  const branchChartData = Object.keys(revenueByBranch).map((id) => ({
    name: id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id),
    الإيراد: Math.round(revenueByBranch[id]),
    التكلفة: Math.round(costByBranch[id] || 0),
  }));

  const branchIds = Array.from(new Set([...batchSalesRecords.map((b) => b.branchId), ...shifts.map((s) => s.branchId), ...operatingExpenses.map((e) => e.branchId), ...wastageLogs.map((w) => w.branchId)]));
  const branchDetail = branchIds.map((id) => {
    const name = id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id);
    const rev = batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + netOf(b), 0);
    const fc = batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + b.totalFoodCost, 0);
    const labor = shifts.filter((s) => s.branchId === id).reduce((s, sh) => s + sh.totalShiftCost, 0);
    const exp = operatingExpenses.filter((e) => e.branchId === id && e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
    const was = wastageLogs.filter((w) => w.branchId === id).reduce((s, w) => s + w.totalCostImpact, 0);
    const total = fc + labor + exp + was;
    const profit = rev - total;
    return { id, name, rev, fc, fcPct: rev ? (fc / rev) * 100 : 0, labor, exp, was, total, profit, margin: rev ? (profit / rev) * 100 : 0 };
  }).sort((a, b) => b.margin - a.margin);

  const expenseByCategory = operatingExpenses
    .filter((e) => e.paymentStatus === 'paid')
    .reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
  const expenseChartData = Object.entries(expenseByCategory).map(([cat, total]) => ({
    name: EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat,
    المبلغ: Math.round(total),
  }));

  const wastageByCategory = wastageLogs.reduce<Record<string, number>>((acc, w) => { acc[w.category] = (acc[w.category] || 0) + w.totalCostImpact; return acc; }, {});

  const vatRows = grnNotes.map((g) => {
    const net = g.totalAmount - (g.vatAmount || 0);
    return { g, net, vat: g.vatAmount || 0, rate: g.vatRate ?? vatPercent };
  });
  const vatSummary = { net: vatRows.reduce((s, r) => s + r.net, 0), vat: vatRows.reduce((s, r) => s + r.vat, 0), gross: vatRows.reduce((s, r) => s + r.g.totalAmount, 0) };

  const recipeCostRows = recipes
    .filter((r) => !r.isCentralKitchenPrep)
    .map((r) => {
      const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
      const price = r.actualMenuPrice || costs.suggestedPrice;
      const pct = price ? (costs.foodCost / price) * 100 : 0;
      const target = r.targetMarginPercent ?? globalTargetMarginPercent;
      const targetFc = 100 - target;
      const gap = pct - targetFc;
      return { name: r.nameAr, price, cost: costs.foodCost, pct, targetFc, gap, excessPerPortion: gap > 0 ? (costs.foodCost - (price * targetFc) / 100) : 0 };
    })
    .filter((r) => r.price > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 15);

  const bestBranch = branchDetail[0];
  const worstBranch = branchDetail[branchDetail.length - 1];
  const aiInsights = useMemo<string[]>(() => {
    const out: string[] = [];
    out.push(fcPct > 35 ? `تكلفة الطعام ${fcPct.toFixed(2)}% من الإيراد — فوق معيار 35%: راجع مقادير الوصفات وفاوض الموردين.` : `تكلفة الطعام ${fcPct.toFixed(2)}% ضمن المعيار (أقل من 35%).`);
    out.push(`إجمالي التكلفة ${totalCostPct.toFixed(2)}% بهامش ${(100 - totalCostPct).toFixed(2)}% — ${100 - totalCostPct >= 0 ? 'مربح' : 'خاسر'}.`);
    if (bestBranch) out.push(`أفضل مركز: ${bestBranch.name} بهامش ${bestBranch.margin.toFixed(2)}% (إيراد ${fmtMoney(bestBranch.rev)}).`);
    if (worstBranch && worstBranch.margin < 0) out.push(`مركز خاسر: ${worstBranch.name} بهامش ${worstBranch.margin.toFixed(2)}% — راجع أسعاره وتكاليفه فوراً.`);
    if (recipeCostRows.length > 0) out.push(`أعلى طبق تكلفة: ${recipeCostRows[0].name} بـ FC ${recipeCostRows[0].pct.toFixed(2)}% (المستهدف ${recipeCostRows[0].targetFc.toFixed(2)}%) مع خسارة ${fmtMoney(recipeCostRows[0].excessPerPortion)} لكل وجبة.`);
    out.push(`ضريبة المشتريات المسترجعة (VAT Input): ${fmtMoney(vatSummary.vat)} على إجمالي مشتريات ${fmtMoney(vatSummary.gross)}.`);
    return out;
  }, [fcPct, totalCostPct, bestBranch, worstBranch, recipeCostRows, vatSummary]);
  const aiBuildPrompt = () => {
    const branchLines = branchDetail.map((b) => `${b.name}: إيراد ${b.rev.toFixed(2)}، FC ${b.fcPct.toFixed(2)}%، هامش ${b.margin.toFixed(2)}%`).join('\n');
    const recipeLines = recipeCostRows.slice(0, 5).map((r) => `${r.name}: FC ${r.pct.toFixed(2)}% (مستهدف ${r.targetFc.toFixed(2)}%)`).join('\n');
    return [
      `الإيراد ${monthlyRevenue.toFixed(2)}، تكلفة الطعام ${monthlyFoodCost.toFixed(2)} (${fcPct.toFixed(2)}%)، العمالة ${monthlyLabor.toFixed(2)}، التشغيلية المدفوعة ${monthlyExpenses.toFixed(2)}، الهالك ${monthlyWastage.toFixed(2)}، إجمالي التكلفة ${totalCostPct.toFixed(2)}%، هامش ${(100 - totalCostPct).toFixed(2)}%.`,
      `مراكز التكلفة:\n${branchLines}`,
      `الأطباق الأعلى تكلفة:\n${recipeLines}`,
      'اكتب تحليلاً موجزاً بالعربية (3-5 فقرات): قراءة للأرقام، أبرز 3 مشاكل في التكلفة، ثم 5 توصيات مرقمة بترتيب الأولوية. استخدم الأرقام حرفياً ولا تختلق قيماً.',
    ].join('\n');
  };

  const balanceByMaterial = inventory.reduce<Record<string, { name: string; unit: string; qty: number; price: number; value: number }>>((acc, i) => {
    const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
    const price = mat?.standardPrice || 0;
    if (!acc[i.rawMaterialId]) acc[i.rawMaterialId] = { name: getRawMaterialName(i.rawMaterialId), unit: mat?.unit || '', qty: 0, price, value: 0 };
    acc[i.rawMaterialId].qty += i.quantity;
    acc[i.rawMaterialId].value += i.quantity * price;
    return acc;
  }, {});
  const balanceRows = Object.values(balanceByMaterial).sort((a, b) => b.value - a.value);
  const balanceTotalValue = balanceRows.reduce((s, b) => s + b.value, 0);

  const exportSheets = [
    {
      name: 'ملخص التكاليف',
      header: ['البند', 'القيمة'],
      rows: [
        ['إجمالي الإيراد', monthlyRevenue],
        ['تكلفة الطعام', monthlyFoodCost],
        ['نسبة Food Cost', `${fcPct.toFixed(2)}%`],
        ['التشغيلية المدفوعة', monthlyExpenses],
        ['تكلفة العمالة', monthlyLabor],
        ['الهوالك', monthlyWastage],
        ['إجمالي التكاليف', totalOverhead],
        ['إجمالي التكلفة %', `${totalCostPct.toFixed(2)}%`],
        ['هامش الربح', `${(100 - totalCostPct).toFixed(2)}%`],
      ],
    },
    {
      name: 'تفصيل التكلفة حسب الفرع',
      header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'نسبة FC %', 'العمالة', 'التشغيلية', 'الهوالك', 'إجمالي التكاليف', 'الربح', 'الهامش %'],
      rows: branchDetail.map((b) => [b.name, b.rev, b.fc, b.fcPct.toFixed(2), b.labor, b.exp, b.was, b.total, b.profit, b.margin.toFixed(2)]),
    },
    {
      name: 'أعلى الأطباق تكلفة',
      header: ['الصنف', 'سعر المنيو', 'التكلفة', 'FC %', 'المستهدف %', 'الفجوة %', 'الخسارة لكل وجبة'],
      rows: recipeCostRows.map((r) => [r.name, r.price, r.cost.toFixed(2), r.pct.toFixed(2), r.targetFc.toFixed(2), r.gap.toFixed(2), r.excessPerPortion.toFixed(2)]),
    },
    {
      name: 'سجل ضريبة المشتريات',
      header: ['رقم GRN', 'المورد', 'الفرع', 'التاريخ', 'الفاتورة', 'الصافي', 'الضريبة %', 'الضريبة', 'الإجمالي'],
      rows: vatRows.map((r) => [r.g.grnNumber, r.g.supplierName, r.g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.g.branchId), r.g.date, r.g.invoiceNumber, r.net.toFixed(2), r.rate, r.vat.toFixed(2), r.g.totalAmount]),
    },
    {
      name: 'المصاريف حسب التصنيف',
      header: ['التصنيف', 'المبلغ'],
      rows: Object.entries(expenseByCategory).map(([cat, total]) => [EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat, total]),
    },
    {
      name: 'الهوالك حسب التصنيف',
      header: ['التصنيف', 'القيمة'],
      rows: Object.entries(wastageByCategory).map(([cat, total]) => [cat, total]),
    },
    {
      name: 'الأرصدة الحالية (المخزون)',
      header: ['المادة', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة'],
      rows: [...balanceRows.map((b) => [b.name, b.unit, b.qty, b.price, b.value]), ['إجمالي قيمة المخزون', '', '', '', balanceTotalValue]],
    },
  ];

  const printReport = async () => {
    const charts = await captureCharts();
    openPrintWindow({
      title: 'التقرير الشامل للتكاليف',
      subtitle: 'شامل الرسوم البيانية',
      charts,
      meta: [
        ['إجمالي الإيراد', `${fmtMoney(monthlyRevenue)}`],
        ['تكلفة الطعام', `${fmtMoney(monthlyFoodCost)}`],
        ['نسبة Food Cost', `${fcPct.toFixed(2)}%`],
        ['التشغيلية', `${fmtMoney(monthlyExpenses)}`],
        ['العمالة', `${fmtMoney(monthlyLabor)}`],
        ['الهوالك', `${fmtMoney(monthlyWastage)}`],
        ['إجمالي التكلفة %', `${totalCostPct.toFixed(2)}%`],
        ['هامش الربح', `${(100 - totalCostPct).toFixed(2)}%`],
      ],
      tables: [
        {
          title: 'تفصيل التكلفة حسب الفرع',
          header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'التشغيلية', 'الهوالك', 'إجمالي التكاليف', 'الربح', 'الهامش %'],
          rows: branchDetail.map((b) => [b.name, fmt(b.rev, 0), fmt(b.fc, 0), b.fcPct.toFixed(2), fmt(b.labor, 0), fmt(b.exp, 0), fmt(b.was, 0), fmt(b.total, 0), fmt(b.profit, 0), b.margin.toFixed(2)]),
        },
        {
          title: 'أعلى الأطباق تكلفة (Food Cost)',
          header: ['الصنف', 'سعر المنيو', 'التكلفة', 'FC %', 'المستهدف %', 'الفجوة %'],
          rows: recipeCostRows.map((r) => [r.name, r.price, r.cost.toFixed(2), r.pct.toFixed(2), r.targetFc.toFixed(2), r.gap.toFixed(2)]),
        },
        {
          title: 'سجل ضريبة المشتريات',
          header: ['رقم GRN', 'المورد', 'الفرع', 'التاريخ', 'الصافي', 'الضريبة %', 'الضريبة', 'الإجمالي'],
          rows: vatRows.map((r) => [r.g.grnNumber, r.g.supplierName, r.g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.g.branchId), r.g.date, r.net.toFixed(2), r.rate, r.vat.toFixed(2), r.g.totalAmount]),
        },
        {
          title: 'الأرصدة الحالية (المخزون)',
          header: ['المادة', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة'],
          rows: balanceRows.map((b) => [b.name, b.unit, fmt(b.qty), fmt(b.price), fmt(b.value)]),
        },
      ],
      totals: [
        ['صافي المشتريات', `${fmtMoney(vatSummary.net)}`],
        ['ضريبة القيمة المضافة', `${fmtMoney(vatSummary.vat)}`],
        ['إجمالي المشتريات', `${fmtMoney(vatSummary.gross)}`],
        ['إجمالي قيمة المخزون الحالي', `${fmtMoney(balanceTotalValue)}`],
      ],
      footer: 'التقرير مُولّد آلياً — RestoCost ERP',
    });
  };

  const branchRowsAll = branchDetail.map((b) => [b.name, fmt(b.rev, 0), fmt(b.fc, 0), `${b.fcPct.toFixed(2)}%`, fmt(b.labor, 0), fmt(b.exp, 0), fmt(b.was, 0), fmt(b.total, 0), fmt(b.profit, 0), `${b.margin.toFixed(2)}%`]);
  const tRev = branchDetail.reduce((s, b) => s + b.rev, 0);
  const tCost = branchDetail.reduce((s, b) => s + b.total, 0);
  const tProfit = branchDetail.reduce((s, b) => s + b.profit, 0);

  const printBranches = () => {
    openPrintWindow({
      title: 'التكلفة والأرباح حسب الفرع',
      subtitle: 'شاملة العمالة والتشغيلية والهوالك',
      meta: [
        ['عدد مراكز التكلفة', `${branchDetail.length}`],
        ['إجمالي الإيراد', fmtMoney(tRev)],
        ['إجمالي التكاليف', fmtMoney(tCost)],
        ['إجمالي الربح', fmtMoney(tProfit)],
        ['متوسط الهامش', `${tRev ? ((tProfit / tRev) * 100).toFixed(2) : '0.00'}%`],
      ],
      tables: [{
        title: 'تفصيل مراكز التكلفة (تكلفة الطعام + العمالة + المصاريف التشغيلية + الهوالك)',
        header: ['الفرع', 'الإيراد', 'تكلفة الطعام', 'FC %', 'العمالة', 'التشغيلية', 'الهوالك', 'إجمالي التكاليف', 'الربح', 'الهامش %'],
        rows: branchRowsAll,
      }],
      totals: [
        ['إجمالي الإيرادات', fmtMoney(tRev)],
        ['إجمالي التكاليف', fmtMoney(tCost)],
        ['إجمالي الأرباح', fmtMoney(tProfit)],
        ['هامش الربح العام', `${tRev ? ((tProfit / tRev) * 100).toFixed(2) : '0.00'}%`],
      ],
      footer: 'تقرير التكلفة والأرباح حسب الفرع — RestoCost ERP',
    });
  };

  const printCostsTab = async () => {
    const charts = await captureCharts();
    openPrintWindow({
      title: 'الإيراد مقابل تكلفة الطعام حسب الفرع',
      subtitle: 'مع الرسم البياني',
      charts,
      meta: [
        ['إجمالي الإيراد', fmtMoney(monthlyRevenue)],
        ['تكلفة الطعام', fmtMoney(monthlyFoodCost)],
        ['نسبة Food Cost', `${fcPct.toFixed(2)}%`],
        ['إجمالي التكلفة %', `${totalCostPct.toFixed(2)}%`],
      ],
      tables: [{
        title: 'ملخص الفترة',
        header: ['البند', 'القيمة'],
        rows: [
          ['إجمالي الإيراد', fmt(monthlyRevenue, 0)],
          ['تكلفة الطعام', fmt(monthlyFoodCost, 0)],
          ['نسبة Food Cost', `${fcPct.toFixed(2)}%`],
          ['تكلفة العمالة', fmt(monthlyLabor, 0)],
          ['التشغيلية المدفوعة', fmt(monthlyExpenses, 0)],
          ['الهوالك', fmt(monthlyWastage, 0)],
        ],
      }],
      footer: 'تحليل تكلفة الطعام — RestoCost ERP',
    });
  };

  const printVatTab = () => {
    openPrintWindow({
      title: 'سجل ضريبة المشتريات المسترجعة (VAT Input)',
      meta: [
        ['صافي المشتريات', fmtMoney(vatSummary.net)],
        ['ضريبة المشتريات', fmtMoney(vatSummary.vat)],
        ['إجمالي المشتريات', fmtMoney(vatSummary.gross)],
        ['نسبة الضريبة الافتراضية', `${vatPercent}%`],
      ],
      tables: [{
        title: 'إشعارات الاستلام',
        header: ['رقم GRN', 'المورد', 'الفرع', 'التاريخ', 'الفاتورة', 'الصافي', 'الضريبة %', 'الضريبة', 'الإجمالي'],
        rows: vatRows.map((r) => [r.g.grnNumber, r.g.supplierName, r.g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.g.branchId), r.g.date, r.g.invoiceNumber || '—', fmt(r.net, 2), `${r.rate}%`, fmt(r.vat, 2), fmt(r.g.totalAmount, 2)]),
      }],
      totals: [
        ['صافي المشتريات', fmtMoney(vatSummary.net)],
        ['ضريبة القيمة المضافة', fmtMoney(vatSummary.vat)],
        ['إجمالي المشتريات', fmtMoney(vatSummary.gross)],
      ],
      footer: 'سجل ضريبة المدخلات — RestoCost ERP',
    });
  };

  const printRecipesTab = () => {
    openPrintWindow({
      title: 'أعلى الأطباق تكلفة مقارنة بالمستهدف',
      subtitle: 'Top Food Cost Dishes',
      meta: [['عدد الأصناف المعروضة', `${recipeCostRows.length}`], ['هامش الربح المستهدف العام', `${globalTargetMarginPercent}%`]],
      tables: [{
        title: 'الأصناف الأعلى في نسبة تكلفة الطعام',
        header: ['الصنف', 'سعر المنيو', 'التكلفة', 'FC %', 'المستهدف %', 'الفجوة %', 'الخسارة/وجبة'],
        rows: recipeCostRows.map((r) => [r.name, fmt(r.price, 2), fmt(r.cost, 2), `${r.pct.toFixed(2)}%`, `${r.targetFc.toFixed(2)}%`, `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(2)}%`, fmt(r.excessPerPortion, 2)]),
      }],
      footer: 'تحليل تكلفة الأطباق — RestoCost ERP',
    });
  };

  const printExpensesTab = async () => {
    const charts = await captureCharts();
    openPrintWindow({
      title: 'المصاريف التشغيلية حسب التصنيف',
      subtitle: 'مع الرسم البياني',
      charts,
      meta: [['إجمالي المدفوع', fmtMoney(monthlyExpenses)], ['عدد التصنيفات', `${Object.keys(expenseByCategory).length}`]],
      tables: [{
        title: 'المصاريف المدفوعة حسب التصنيف',
        header: ['التصنيف', 'المبلغ'],
        rows: Object.entries(expenseByCategory).map(([cat, total]) => [EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat, fmt(total, 0)]),
      }],
      totals: [['إجمالي المصاريف التشغيلية المدفوعة', fmtMoney(monthlyExpenses)]],
      footer: 'المصاريف التشغيلية — RestoCost ERP',
    });
  };

  const printWastageTab = () => {
    openPrintWindow({
      title: 'الهوالك حسب التصنيف',
      meta: [['إجمالي قيمة الهوالك', fmtMoney(monthlyWastage)], ['عدد التصنيفات', `${Object.keys(wastageByCategory).length}`]],
      tables: [{
        title: 'قيمة الهوالك لكل تصنيف',
        header: ['التصنيف', 'القيمة'],
        rows: Object.entries(wastageByCategory).map(([cat, total]) => [cat, fmt(total, 0)]),
      }],
      totals: [['إجمالي الهوالك', fmtMoney(monthlyWastage)]],
      footer: 'رقابة الهوالك — RestoCost ERP',
    });
  };

  // ── مساعدات صف الإجمالي ──
  // كان جدول الفروع بلا صف إجمالي. الفروع 17 موزّعة على أكثر من شاشة، فيضطر
  // المستخدم للتحقق من المجموع ذهنياً أو عبر التصدير.

  const sumBranch = (k: 'rev' | 'fc' | 'labor' | 'exp' | 'was' | 'total' | 'profit') =>
    branchDetail.reduce((s, b) => s + (Number(b[k]) || 0), 0);

  const pctOfRevenue = (v: number) =>
    (monthlyRevenue ? (v / monthlyRevenue) * 100 : 0).toFixed(2);

  return (
    <div className="space-y-4">
      {/* ═════ الترويسة + المؤشرات + التبويبات (نمط ERP الموحّد — docs/design/03) ═════
          كانت PageHeader عامة فوق شبكة بطاقات مكتوبة يدوياً، فبقيت المؤشرات بلا
          ترقيم جدولي ولا لون دلالّي موحّد مع باقي النظام. */}
      <ErpPanel>
        <ErpPageHeader
          icon={<BarIcon className="w-6 h-6" />}
          title="تقارير التكاليف المتطورة"
          subtitle="تحليل تكلفة الطعام، الضريبة، تفصيل الفروع، المصاريف، والهوالك"
          actions={
            <>
              <ViewToolbar filename="تقارير_التكاليف_الشاملة" sheets={exportSheets} />
              <ErpButton onClick={printReport}>
                <Printer className="w-3.5 h-3.5" /> طباعة شامل
              </ErpButton>
              <ErpButton variant="primary" onClick={() => setAiOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" /> تحليل ذكي
              </ErpButton>
              <ErpButton
                onClick={() => downloadCSV('CostReport.csv', ['البند', 'القيمة'], [['الإيراد', monthlyRevenue], ['تكلفة الطعام', monthlyFoodCost], ['التشغيلية', monthlyExpenses], ['العمالة', monthlyLabor], ['الهوالك', monthlyWastage]])}
              >
                <TrendingDown className="w-3.5 h-3.5" /> CSV
              </ErpButton>
            </>
          }
        />

        <div className="px-6 pb-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ErpKpi
            label="Food Cost"
            value={`${fcPct.toFixed(2)}%`}
            sub={fcPct > 35 ? 'أعلى من المستهدف 35%' : 'ضمن المستهدف (<35%)'}
            subTone={fcPct > 35 ? 'down' : 'up'}
            highlight={fcPct <= 35}
          />
          <ErpKpi label="التكاليف التشغيلية" value={`${overheadPct.toFixed(2)}%`} sub="من الإيراد" />
          <ErpKpi
            label="تكلفة العمالة"
            value={`${(monthlyRevenue ? (monthlyLabor / monthlyRevenue) * 100 : 0).toFixed(2)}%`}
            sub="من الإيراد"
          />
          <ErpKpi label="إجمالي التكلفة" value={`${totalCostPct.toFixed(2)}%`} sub="تكلفة + تشغيلية + عمالة" />
          <ErpKpi
            label="هامش الربح"
            value={`${(100 - totalCostPct).toFixed(2)}%`}
            sub={100 - totalCostPct >= 0 ? 'إيراد − إجمالي التكلفة' : 'خسارة'}
            subTone={100 - totalCostPct >= 0 ? 'up' : 'down'}
            highlight={100 - totalCostPct >= 0}
          />
          <ErpKpi label="ضريبة مشتريات" value={fmtMoney(vatSummary.vat)} sub={`إجمالي ${fmtMoney(vatSummary.gross)}`} />
        </div>

        <ErpTabs
          tabs={[
            { id: 'costs', label: 'تكلفة الطعام' },
            { id: 'branches', label: 'تفصيل الفروع', badge: branchDetail.length || undefined },
            { id: 'vat', label: 'ضريبة المشتريات', badge: vatRows.length || undefined },
            { id: 'recipes', label: 'تكلفة الأطباق' },
            { id: 'expenses', label: 'المصاريف' },
            { id: 'wastage', label: 'الهوالك' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as TabId)}
        />
      </ErpPanel>

      {tab === 'costs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-bold text-slate-800 text-xs">الإيراد مقابل تكلفة الطعام حسب الفرع</h3>
              <Btn tone="ghost" onClick={printCostsTab}><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={branchChartData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Bar dataKey="الإيراد" fill="#6366f1" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
                <Bar dataKey="التكلفة" fill="#f43f5e" radius={[4, 4, 0, 0]} label={{ position: 'insideTop', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">ملخص الفترة</h3>
            <div className="space-y-2">
              {[
                { label: 'إجمالي الإيراد', value: monthlyRevenue, icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
                { label: 'تكلفة الطعام', value: monthlyFoodCost, icon: <TrendingDown className="w-4 h-4 text-rose-500" /> },
                { label: 'تكلفة العمالة', value: monthlyLabor, icon: <BarIcon className="w-4 h-4 text-violet-500" /> },
                { label: 'التشغيلية المدفوعة', value: monthlyExpenses, icon: <BarIcon className="w-4 h-4 text-brand-500" /> },
                { label: 'الهوالك', value: monthlyWastage, icon: <TrendingDown className="w-4 h-4 text-amber-500" /> },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="flex items-center gap-2 font-bold text-slate-700 text-xs">{row.icon}{row.label}</span>
                  <span className="font-mono font-extrabold text-slate-900 text-sm">{fmt(row.value, 0)} ر.س</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'branches' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-slate-800 text-xs">التكلفة والأرباح حسب الفرع (بما فيها العمالة والتشغيلية والهوالك)</h3>
            <Btn onClick={printBranches}><Printer className="w-4 h-4" /> طباعة هذا التقرير</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                {/* الأرقام: tnum + محاذاة يسار (قاعدة النظام) */}
                <tr><th className="p-2 text-right">الفرع</th><th className="p-2 text-left">الإيراد</th><th className="p-2 text-left">تكلفة الطعام</th><th className="p-2 text-left">FC %</th><th className="p-2 text-left">العمالة</th><th className="p-2 text-left">التشغيلية</th><th className="p-2 text-left">الهوالك</th><th className="p-2 text-left">إجمالي التكاليف</th><th className="p-2 text-left">الربح</th><th className="p-2 text-left">الهامش %</th></tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {branchDetail.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="p-2 font-extrabold text-slate-900">{b.name}</td>
                    <td className="p-2 text-left tnum font-bold">{fmt(b.rev, 0)}</td>
                    <td className="p-2 text-left tnum">{fmt(b.fc, 0)}</td>
                    <td className="p-2 text-left tnum font-bold">{b.fcPct.toFixed(2)}%</td>
                    <td className="p-2 text-left tnum">{fmt(b.labor, 0)}</td>
                    <td className="p-2 text-left tnum">{fmt(b.exp, 0)}</td>
                    <td className="p-2 text-left tnum text-rose-700">{fmt(b.was, 0)}</td>
                    <td className="p-2 text-left tnum font-extrabold">{fmt(b.total, 0)}</td>
                    <td className={`p-2 text-left tnum font-extrabold ${b.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(b.profit, 0)}</td>
                    <td className={`p-2 text-left tnum font-extrabold ${b.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{b.margin.toFixed(2)}%</td>
                  </tr>
                ))}
                {branchDetail.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-400 text-xs">لا توجد بيانات فروع</td></tr>}
              </tbody>
              {branchDetail.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-line">
                    <td className="px-3 py-2.5 font-bold text-slate-700">الإجمالي</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{fmt(sumBranch('rev'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{fmt(sumBranch('fc'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{pctOfRevenue(sumBranch('fc'))}%</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{fmt(sumBranch('labor'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{fmt(sumBranch('exp'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-bold text-rose-700">{fmt(sumBranch('was'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-extrabold text-slate-900">{fmt(sumBranch('total'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-extrabold text-slate-900">{fmt(sumBranch('profit'), 0)}</td>
                    <td className="px-2 py-2.5 text-left tnum font-extrabold text-slate-900">{pctOfRevenue(sumBranch('profit'))}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {tab === 'vat' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-4">
            <div>
              <span className="font-bold text-slate-700 text-xs block mb-1">نسبة ضريبة القيمة المضافة للمشتريات الافتراضية</span>
              <input type="number" min="0" max="100" value={vatPercent || ''} onChange={(e) => setVatPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={inputCls + ' !w-28'} />
            </div>
            <div>
              <span className="font-bold text-slate-700 text-xs block mb-1">أسعار الموردين</span>
              <div className="flex gap-2">
                <button onClick={() => setVatInclusive(true)} className={`px-3 py-2 rounded-lg text-xs font-extrabold border ${vatInclusive ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>شاملة الضريبة</button>
                <button onClick={() => setVatInclusive(false)} className={`px-3 py-2 rounded-lg text-xs font-extrabold border ${!vatInclusive ? 'bg-brand-600 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-300'}`}>غير شاملة</button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed basis-full">تُطبَّق هذه القيمة كافتراضي عند إدخال إشعارات استلام جديدة، ويمكن تغييرها لكل إشعار. تُسجَّل الضريبة في القيد المحاسبي (مدين ضريبة / صافي المخزون / دائن المورد).</p>
          </Card>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي المشتريات</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(vatSummary.net)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ضريبة المشتريات</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(vatSummary.vat)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المشتريات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmtMoney(vatSummary.gross)}</strong></div>
          </div>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-2 gap-2">
              <h3 className="font-bold text-slate-800 text-xs">سجل إشعارات الاستلام</h3>
              <Btn tone="ghost" onClick={printVatTab}><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                  <tr><th className="p-2">رقم GRN</th><th className="p-2">المورد</th><th className="p-2">الفرع</th><th className="p-2">التاريخ</th><th className="p-2">الفاتورة</th><th className="p-2">الصافي</th><th className="p-2">الضريبة %</th><th className="p-2">الضريبة</th><th className="p-2">الإجمالي</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vatRows.map((r) => (
                    <tr key={r.g.id} className="hover:bg-slate-50">
                      <td className="tnum text-left p-2 font-bold text-brand-700">{r.g.grnNumber}</td>
                      <td className="p-2 font-bold">{r.g.supplierName}</td>
                      <td className="p-2 text-slate-600">{r.g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.g.branchId)}</td>
                      <td className="tnum text-left p-2">{r.g.date}</td>
                      <td className="tnum text-left p-2">{r.g.invoiceNumber || '—'}</td>
                      <td className="tnum text-left p-2">{fmt(r.net, 2)}</td>
                      <td className="tnum text-left p-2">{r.rate}%</td>
                      <td className="tnum text-left p-2 text-amber-700">{fmt(r.vat, 2)}</td>
                      <td className="tnum text-left p-2 font-extrabold">{fmt(r.g.totalAmount, 2)}</td>
                    </tr>
                  ))}
                  {vatRows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-400 text-xs"><Receipt className="w-4 h-4 inline ml-1" />لا توجد إشعارات استلام مسجلة بعد</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'recipes' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-slate-800 text-xs">أعلى 15 صنفاً في تكلفة الطعام مقارنة بالمستهدف (الخسارة لكل وجبة)</h3>
            <Btn tone="ghost" onClick={printRecipesTab}><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
                <tr><th className="p-2">الصنف</th><th className="p-2">سعر المنيو</th><th className="p-2">التكلفة</th><th className="p-2">FC %</th><th className="p-2">المستهدف %</th><th className="p-2">الفجوة %</th><th className="p-2">الخسارة/وجبة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipeCostRows.map((r) => (
                  <tr key={r.name} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-900">{r.name}</td>
                    <td className="tnum text-left p-2">{fmt(r.price, 2)}</td>
                    <td className="tnum text-left p-2">{fmt(r.cost, 2)}</td>
                    <td className={`p-2 font-mono font-bold ${r.pct > r.targetFc ? 'text-rose-700' : 'text-emerald-700'}`}>{r.pct.toFixed(2)}%</td>
                    <td className="tnum text-left p-2">{r.targetFc.toFixed(2)}%</td>
                    <td className={`p-2 font-mono font-extrabold ${r.gap > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.gap > 0 ? '+' : ''}{r.gap.toFixed(2)}%</td>
                    <td className={`p-2 font-mono font-extrabold ${r.excessPerPortion > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{fmt(r.excessPerPortion, 2)}</td>
                  </tr>
                ))}
                {recipeCostRows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-xs">لا توجد أصناف بأسعار مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-bold text-slate-800 text-xs">المصاريف حسب التصنيف</h3>
              <Btn tone="ghost" onClick={printExpensesTab}><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={expenseChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: unknown) => `${fmt(Number(v), 0)} ر.س`} />
                <Bar dataKey="المبلغ" fill="#6366f1" radius={[0, 4, 4, 0]} label={{ position: 'insideRight', fill: '#ffffff', fontSize: 9, fontWeight: 700, formatter: (v: unknown) => fmt(Number(v), 0) }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">تفاصيل المصاريف</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(expenseByCategory).map(([cat, total]) => (
                <div key={cat} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="font-bold text-slate-700 text-xs">{EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] || cat}</span>
                  <span className="font-mono font-extrabold text-brand-700">{fmt(total, 0)} ر.س</span>
                </div>
              ))}
              {Object.keys(expenseByCategory).length === 0 && <p className="text-center text-slate-400 text-xs py-8">لا توجد مصاريف مدفوعة</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'wastage' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-bold text-slate-800 text-xs">الهوالك حسب التصنيف</h3>
            <Btn tone="ghost" onClick={printWastageTab}><Printer className="w-3.5 h-3.5" /> طباعة</Btn>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(wastageByCategory).map(([cat, total]) => (
              <div key={cat} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl p-3">
                <span className="font-bold text-slate-700 text-xs">{cat}</span>
                <span className="font-mono font-extrabold text-rose-700">{fmt(total, 0)} ر.س</span>
              </div>
            ))}
            {Object.keys(wastageByCategory).length === 0 && <p className="text-center text-slate-400 text-xs py-8">لا توجد هوالك مسجلة</p>}
          </div>
        </Card>
      )}

      <AIAnalyzeModal open={aiOpen} onClose={() => setAiOpen(false)} title="تحليل ذكي — تقارير التكاليف" insights={aiInsights} buildPrompt={aiBuildPrompt} />
    </div>
  );
};