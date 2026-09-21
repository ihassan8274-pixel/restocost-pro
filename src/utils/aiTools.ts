import { runAISummary } from './ai';
import type { POSOrder, BatchSalesRecord } from '../types/pos';
import type { StandardRecipe } from '../types/production';
import type { RawMaterial, InventoryRecord } from '../types/inventory';
import type { OperatingExpense } from '../types/expenses';
import type { LaborShift } from '../types/labor';
import type { Branch } from '../types/structure';

export interface AIContext {
  branches: Branch[];
  posOrders: POSOrder[];
  batchSalesRecords: BatchSalesRecord[];
  shifts: LaborShift[];
  operatingExpenses: OperatingExpense[];
  wastageLogs: { id: string; branchId: string; totalCostImpact: number }[];
  inventory: InventoryRecord[];
  recipes: StandardRecipe[];
  rawMaterials: RawMaterial[];
  globalTargetMarginPercent: number;
  getAverageUnitCost: (rawMaterialId: string) => number;
  calculateRecipeCosts: (ingredients: StandardRecipe['ingredients'], labor: number, packaging: number) => { foodCost: number; totalCost: number; suggestedPrice: number };
}

export interface AITool {
  id: string;
  nameAr: string;
  description: string;
  collect: (ctx: AIContext) => string;
}

const netRev = (b: BatchSalesRecord) => b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15));

const branchOf = (ctx: AIContext) => {
  const ids = Array.from(new Set(['b-ck', ...ctx.posOrders.map((o) => o.branchId), ...ctx.batchSalesRecords.map((b) => b.branchId)]));
  return ids.map((id) => {
    const name = id === 'b-ck' ? 'المطبخ المركزي' : ctx.branches.find((b) => b.id === id)?.nameAr || id;
    const rev = ctx.posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.subtotal, 0) + ctx.batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + netRev(b), 0);
    const fc = ctx.posOrders.filter((o) => o.branchId === id).reduce((s, o) => s + o.totalCost, 0) + ctx.batchSalesRecords.filter((b) => b.branchId === id).reduce((s, b) => s + b.totalFoodCost, 0);
    return { name, rev, fc };
  }).filter((b) => b.rev > 0 || b.fc > 0);
};

export const branchSalesTool: AITool = {
  id: 'branch_sales',
  nameAr: 'مبيعات الفروع',
  description: 'الإيراد وتكلفة الطعام لكل فرع من بيانات المبيعات الحية',
  collect: (ctx) => {
    const rows = branchOf(ctx);
    if (!rows.length) return 'لا توجد مبيعات مسجلة لأي فرع.';
    return rows.map((b) => `${b.name}: إيراد ${b.rev.toFixed(2)}, تكلفة طعام ${b.fc.toFixed(2)} (${b.rev ? ((b.fc / b.rev) * 100).toFixed(2) : 0}%)`).join('\n');
  },
};

export const foodCostTool: AITool = {
  id: 'food_cost',
  nameAr: 'تكلفة الطعام الإجمالية',
  description: 'نسبة Food Cost الإجمالية ومقارنتها بالمستهدف من بيانات المبيعات الحية',
  collect: (ctx) => {
    const revenue = ctx.posOrders.reduce((s, o) => s + o.subtotal, 0) + ctx.batchSalesRecords.reduce((s, b) => s + netRev(b), 0);
    const foodCost = ctx.posOrders.reduce((s, o) => s + o.totalCost, 0) + ctx.batchSalesRecords.reduce((s, b) => s + b.totalFoodCost, 0);
    if (!revenue) return 'لا توجد إيرادات مسجلة لحساب Food Cost.';
    const pct = (foodCost / revenue) * 100;
    const target = 100 - ctx.globalTargetMarginPercent;
    return `الإيراد ${revenue.toFixed(2)}, تكلفة الطعام ${foodCost.toFixed(2)}, النسبة ${pct.toFixed(2)}%, المستهدف ${target}% الفجوة ${(pct - target).toFixed(2)} نقطة مئوية`;
  },
};

export const lowStockTool: AITool = {
  id: 'low_stock',
  nameAr: 'الأصناف تحت الحد الأدنى',
  description: 'أصناف المخزون التي وصلت أو تجاوزت حد إعادة الطلب',
  collect: (ctx) => {
    const low = ctx.inventory.filter((i) => {
      const m = ctx.rawMaterials.find((x) => x.id === i.rawMaterialId);
      return m && i.quantity <= m.minStockLevel;
    });
    if (!low.length) return 'لا توجد أصناف تحت الحد الأدنى للمخزون.';
    const top = Array.from(new Map(low.map((i) => [i.rawMaterialId, i])).values()).slice(0, 5)
      .map((i) => `${ctx.rawMaterials.find((x) => x.id === i.rawMaterialId)?.nameAr || i.rawMaterialId}: ${i.quantity.toFixed(2)} (الحد ${ctx.rawMaterials.find((x) => x.id === i.rawMaterialId)?.minStockLevel})`)
      .join(', ');
    return `${low.length} قيد مخزون تحت الحد الأدنى. أمثلة: ${top}.`;
  },
};

export const wastageTool: AITool = {
  id: 'wastage',
  nameAr: 'الهالك',
  description: 'إجمالي تكلفة الهالك ونسبته من الإيراد',
  collect: (ctx) => {
    const total = ctx.wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
    if (!total) return 'لا توجد سجلات هالك.';
    const revenue = ctx.posOrders.reduce((s, o) => s + o.subtotal, 0) + ctx.batchSalesRecords.reduce((s, b) => s + netRev(b), 0);
    return `إجمالي الهالك ${total.toFixed(2)} ر.س (${revenue ? ((total / revenue) * 100).toFixed(2) : 0}% من الإيراد) في ${ctx.wastageLogs.length} سجل.`;
  },
};

export const recipeStdVsActualTool: AITool = {
  id: 'recipe_std_vs_actual',
  nameAr: 'الأطباق المتجاوزة للهامش المستهدف',
  description: 'مقارنة تكلفة الوصفة المحسوبة بسعرها الفعلي ومطابقتها بهامش الربح المستهدف',
  collect: (ctx) => {
    const rows = ctx.recipes
      .filter((r) => !r.isCentralKitchenPrep)
      .map((r) => {
        const c = ctx.calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
        const price = r.actualMenuPrice || c.suggestedPrice;
        const fc = price ? (c.foodCost / price) * 100 : 0;
        const target = 100 - (r.targetMarginPercent ?? ctx.globalTargetMarginPercent);
        return { name: r.nameAr, fc, target, gap: fc - target };
      })
      .filter((r) => r.fc > 0)
      .sort((a, b) => b.gap - a.gap);
    if (!rows.length) return 'لا توجد وصفات نشطة بحساب تكلفة.';
    const over = rows.filter((r) => r.gap > 0);
    if (!over.length) return `كل الوصفات ضمن الهامش المستهدف. الأعلى تكلفة: ${rows[0].name} (${rows[0].fc.toFixed(2)}%).`;
    return `${over.length} طبقات تتجاوز المستهدف. الأعلى: ${over.slice(0, 4).map((r) => `${r.name} (${r.fc.toFixed(2)}% مقابل ${r.target.toFixed(2)}%)`).join(', ')}.`;
  },
};

export const recipeCostsTool: AITool = {
  id: 'recipe_costs',
  nameAr: 'الأعلى تكلفة من الوصفات',
  description: 'أعلى 5 وصفات من حيث نسبة تكلفة الطعام إلى السعر',
  collect: (ctx) => {
    const rows = ctx.recipes
      .filter((r) => !r.isCentralKitchenPrep)
      .map((r) => {
        const c = ctx.calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
        const price = r.actualMenuPrice || c.suggestedPrice;
        const fc = price ? (c.foodCost / price) * 100 : 0;
        return { name: r.nameAr, fc, price };
      })
      .filter((r) => r.fc > 0)
      .sort((a, b) => b.fc - a.fc)
      .slice(0, 5);
    if (!rows.length) return 'لا توجد وصفات بحساب تكلفة.';
    return rows.map((r) => `${r.name}: ${r.fc.toFixed(2)}% (سعر ${r.price.toFixed(2)})`).join(', ');
  },
};

export const laborCostTool: AITool = {
  id: 'labor_cost',
  nameAr: 'تكلفة العمالة',
  description: 'إجمالي تكلفة الورديات ونسبتها من الإيراد',
  collect: (ctx) => {
    const labor = ctx.shifts.reduce((s, sh) => s + sh.totalShiftCost, 0);
    if (!labor) return 'لا توجد ورديات مسجلة.';
    const revenue = ctx.posOrders.reduce((s, o) => s + o.subtotal, 0) + ctx.batchSalesRecords.reduce((s, b) => s + netRev(b), 0);
    return `تكلفة العمالة ${labor.toFixed(2)} ر.س (${revenue ? ((labor / revenue) * 100).toFixed(2) : 0}% من الإيراد) في ${ctx.shifts.length} وردية.`;
  },
};

export const inventoryValueTool: AITool = {
  id: 'inventory_value',
  nameAr: 'قيمة المخزون',
  description: 'القيمة الإجمالية للمخزون الحالي حسب متوسط تكلفة الوحدة',
  collect: (ctx) => {
    const value = ctx.inventory.reduce((s, i) => s + i.quantity * ctx.getAverageUnitCost(i.rawMaterialId), 0);
    return `قيمة المخزون الحالي ${value.toFixed(2)} ر.س عبر ${ctx.inventory.length} قيد مخزون.`;
  },
};

export const expensesTool: AITool = {
  id: 'operating_expenses',
  nameAr: 'المصاريف التشغيلية',
  description: 'المصاريف المدفوعة والمتأخرة من بيانات المصاريف الحية',
  collect: (ctx) => {
    if (!ctx.operatingExpenses.length) return 'لا توجد مصاريف تشغيلية مسجلة.';
    const paid = ctx.operatingExpenses.filter((e) => e.paymentStatus === 'paid').reduce((s, e) => s + e.amount, 0);
    const overdue = ctx.operatingExpenses.filter((e) => e.paymentStatus === 'overdue').reduce((s, e) => s + e.amount, 0);
    const revenue = ctx.posOrders.reduce((s, o) => s + o.subtotal, 0) + ctx.batchSalesRecords.reduce((s, b) => s + netRev(b), 0);
    return `المصاريف المدفوعة ${paid.toFixed(2)} ر.س (${revenue ? ((paid / revenue) * 100).toFixed(2) : 0}% من الإيراد), متأخرة ${overdue.toFixed(2)} ر.س.`;
  },
};

export const aiTools: AITool[] = [
  foodCostTool,
  branchSalesTool,
  recipeStdVsActualTool,
  recipeCostsTool,
  lowStockTool,
  wastageTool,
  laborCostTool,
  inventoryValueTool,
  expensesTool,
];

export const buildToolContext = (ctx: AIContext, tools: AITool[] = aiTools): string =>
  tools.map((t) => `[${t.nameAr}]\n${t.collect(ctx)}\n`).join('\n');

export const runAIAgent = async (
  systemPrompt: string,
  userPrompt: string,
  ctx: AIContext,
  tools: AITool[] = aiTools,
  modelId?: string,
): Promise<string | null> => {
  const block = buildToolContext(ctx, tools);
  return runAISummary(systemPrompt, `${userPrompt}\n\nالبيانات الحية من أدوات النظام:\n${block}`, modelId);
};

const tgToken = () => localStorage.getItem('rcerp_token');
const tgApi = async (path: string, body?: unknown) => {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(tgToken() ? { Authorization: `Bearer ${tgToken()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  return res ? res.json().catch(() => ({ ok: false, error: 'استجابة غير صالحة' })) : { ok: false, error: 'تعذر الاتصال بالخادم' };
};

export const publishToTelegram = async (text: string): Promise<{ ok: boolean; error?: string }> => {
  const clean = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!clean.trim()) return { ok: false, error: 'لا يوجد نص للنشر' };
  const j = await tgApi('/api/telegram/send', { text: clean, channel: 'main' });
  return j.ok ? { ok: true } : { ok: false, error: j.error || 'تعذر إرسال الرسالة' };
};