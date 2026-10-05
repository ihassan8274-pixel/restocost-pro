import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutTemplate, Save, Play, Trash2, PenLine, Database, Columns3, SlidersHorizontal, FileText,
  Loader2, ArrowRight, Table2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, SectionHeader, PageHeader, Btn, EmptyState, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmtMoney, EXPENSE_CATEGORY_LABELS, today } from '../../utils/helpers';
import {
  buildTable, distinctOptions, fmtCell,
} from '../../utils/reportData';
import type { ReportDataset, ReportTable, ReportSelection } from '../../utils/reportData';
import { CustomReport, tempStatusOf, DEFAULT_MATERIAL_CATEGORIES } from '../../types';

const RCP_CAT: Record<string, string> = { main_dish: 'طبق رئيسي', appetizer: 'مقبلات', beverage: 'مشروبات', dessert: 'حلويات', sub_prep: 'تجهيزات' };
const INV_STATUS: Record<string, string> = { draft: 'مسودة', issued: 'مصدرة', paid: 'مدفوعة', partially_paid: 'جزئية السداد', overdue: 'متأخرة', cancelled: 'ملغاة' };
const INV_TYPE: Record<string, string> = { sales: 'مبيعات', purchase: 'مشتريات' };
const INV_MATCH: Record<string, string> = { matched: 'مطابِق', qty_mismatch: 'فرق كمية', price_mismatch: 'فرق سعر', two_way: 'مطابقة ثنائية', no_docs: 'بلا مستندات' };
const PO_STATUS: Record<string, string> = { draft: 'مسودة', submitted: 'مقدّمة', approved: 'معتمدة', partially_received: 'استلام جزئي', received: 'مستلمة', cancelled: 'ملغاة', rejected: 'مرفوضة' };
const PO_TYPE: Record<string, string> = { regular: 'عادي', preliminary: 'توريد مبدئي' };
const EXP_STATUS: Record<string, string> = { paid: 'مدفوعة', pending: 'معلّقة', overdue: 'متأخرة' };
const EXP_RECUR: Record<string, string> = { one_time: 'مرة واحدة', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
const STORAGE: Record<string, string> = { frozen: 'مجمد', chilled: 'مبرد', dry: 'جاف' };
const TEMP_STATUS: Record<string, string> = { ok: 'سليم', warning: 'تحذير', critical: 'حرج' };

// ═══ بناء مصادر البيانات من حالة النظام — نفس الصيغة تغذي الباني الداخلي وjsreport ═══
const makeDatasets = (app: ReturnType<typeof useApp>): ReportDataset[] => {
  const { getBranchName } = app;
  const bname = (id: string) => (id === 'central' ? 'مركزي' : getBranchName(id));
  const matName = (id: string) => app.rawMaterials.find((m) => m.id === id)?.nameAr || id;
  const catLabel = (key: string) => app.materialCategories.find((c) => c.key === key)?.labelAr || DEFAULT_MATERIAL_CATEGORIES[key as keyof typeof DEFAULT_MATERIAL_CATEGORIES]?.labelAr || key;

  const onHandOf = (matId: string) => round2(app.inventory.reduce((s, r) => (r.rawMaterialId === matId ? s + r.quantity : s), 0));

  return [
    {
      id: 'operating_expenses',
      label: 'المصاريف التشغيلية',
      description: 'مصاريف الفروع بمبالغها وحالات الدفع والتكرار والتوريد.',
      columns: [
        { key: 'dueDate', label: 'التاريخ', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'expenseNumber', label: 'رقم المصروف', defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true, defaultSelected: true },
        { key: 'category', label: 'التصنيف', filterable: true, defaultSelected: true },
        { key: 'description', label: 'البيان', defaultSelected: true },
        { key: 'amount', label: 'المبلغ', kind: 'money', defaultSelected: true },
        { key: 'paymentStatus', label: 'الحالة', filterable: true },
        { key: 'recurrence', label: 'التكرار', filterable: true },
        { key: 'vendor', label: 'المورّد', filterable: true },
        { key: 'createdBy', label: 'أضافها' },
        { key: 'createdAt', label: 'تاريخ الإضافة', kind: 'date' },
      ],
      load: () => app.operatingExpenses.map((e) => ({
        dueDate: e.dueDate, expenseNumber: e.expenseNumber,
        branchId: e.branchId, branchName: bname(e.branchId),
        category: EXPENSE_CATEGORY_LABELS[e.category], description: e.description,
        amount: e.amount, paymentStatus: EXP_STATUS[e.paymentStatus] || e.paymentStatus,
        recurrence: EXP_RECUR[e.recurrence] || e.recurrence, vendor: e.vendor || '',
        createdBy: e.createdBy, createdAt: e.createdAt,
      })),
    },
    {
      id: 'expense_budgets',
      label: 'الميزانيات الشهرية للمصاريف',
      description: 'الموازنة مقابل المخطط مفروشة صفاً لكل تصنيف وشهر.',
      columns: [
        { key: 'branchName', label: 'الفرع', filterable: true, defaultSelected: true },
        { key: 'month', label: 'الشهر', defaultSelected: true },
        { key: 'category', label: 'التصنيف', filterable: true, defaultSelected: true },
        { key: 'budgetedAmount', label: 'المبلغ الموازن', kind: 'money', defaultSelected: true },
      ],
      load: () => app.expenseBudgets.flatMap((b) =>
        b.items.map((i) => ({
          branchId: b.branchId, branchName: bname(b.branchId),
          month: b.month, category: EXPENSE_CATEGORY_LABELS[i.category] || i.category,
          budgetedAmount: i.budgetedAmount,
        }))),
    },
    {
      id: 'invoices',
      label: 'الفواتير (مبيعات / مشتريات)',
      description: 'الفواتير بجوانبها المالية ومطابقة المستندات الثلاثية.',
      columns: [
        { key: 'date', label: 'التاريخ', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'type', label: 'النوع', filterable: true },
        { key: 'invoiceNumber', label: 'الرقم', defaultSelected: true },
        { key: 'partyName', label: 'الطرف', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true },
        { key: 'subtotal', label: 'الضريبي', kind: 'money' },
        { key: 'vatAmount', label: 'الضريبة', kind: 'money' },
        { key: 'totalAmount', label: 'الإجمالي', kind: 'money', defaultSelected: true },
        { key: 'paidAmount', label: 'المدفوع', kind: 'money' },
        { key: 'balance', label: 'المتبقي', kind: 'money', defaultSelected: true },
        { key: 'status', label: 'الحالة', filterable: true, defaultSelected: true },
        { key: 'matchStatus', label: 'المطابقة', filterable: true },
      ],
      load: () => app.invoices.map((iv) => ({
        date: iv.date, type: INV_TYPE[iv.type] || iv.type, invoiceNumber: iv.invoiceNumber,
        partyName: iv.partyName, branchId: iv.branchId, branchName: bname(iv.branchId),
        subtotal: iv.subtotal, vatAmount: iv.vatAmount, totalAmount: iv.totalAmount,
        paidAmount: iv.paidAmount || 0, balance: round2((iv.totalAmount) - (iv.paidAmount || 0)),
        status: INV_STATUS[iv.status] || iv.status,
        matchStatus: iv.matchStatus ? INV_MATCH[iv.matchStatus] || iv.matchStatus : '—',
      })),
    },
    {
      id: 'purchase_orders',
      label: 'أوامر الشراء',
      description: 'أوامر الشراء بحالاتها وقيمها ومواعيد التسليم المتوقعة.',
      columns: [
        { key: 'orderDate', label: 'تاريخ الطلب', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'poNumber', label: 'الرقم', defaultSelected: true },
        { key: 'supplierName', label: 'المورد', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true },
        { key: 'status', label: 'الحالة', filterable: true, defaultSelected: true },
        { key: 'poType', label: 'النوع', filterable: true },
        { key: 'itemsCount', label: 'عدد الأصناف', kind: 'number' },
        { key: 'totalAmount', label: 'القيمة', kind: 'money', defaultSelected: true },
        { key: 'expectedDate', label: 'تسليم متوقع', kind: 'date', filterable: true },
        { key: 'requestedBy', label: 'طلب' },
      ],
      load: () => app.purchaseOrders.map((po) => ({
        orderDate: po.orderDate, poNumber: po.poNumber, supplierName: po.supplierName,
        branchId: po.branchId, branchName: bname(po.branchId),
        status: PO_STATUS[po.status] || po.status, poType: po.poType ? PO_TYPE[po.poType] || po.poType : '—',
        itemsCount: po.items.length, totalAmount: po.totalAmount,
        expectedDate: po.expectedDate, requestedBy: po.requestedBy,
      })),
    },
    {
      id: 'materials',
      label: 'المواد الخام والمخزون',
      description: 'أصناف المواد الخام مع الرصيد الإجمالي لكل الفروع وتكلفة الوحدة المتوسطة.',
      columns: [
        { key: 'code', label: 'الكود', defaultSelected: true },
        { key: 'nameAr', label: 'اسم الصنف', defaultSelected: true },
        { key: 'category', label: 'التصنيف', filterable: true },
        { key: 'unit', label: 'الوحدة' },
        { key: 'standardPrice', label: 'سعر قياسي', kind: 'money' },
        { key: 'averageCost', label: 'متوسط التكلفة', kind: 'money', defaultSelected: true },
        { key: 'onHand', label: 'الرصيد المتاح', kind: 'number', defaultSelected: true },
        { key: 'reorderPoint', label: 'نقطة الطلب', kind: 'number' },
        { key: 'leadTimeDays', label: 'مهلة التوريد (يوم)', kind: 'number' },
        { key: 'minStock', label: 'حد أدنى', kind: 'number' },
        { key: 'maxStock', label: 'حد أقصى', kind: 'number' },
        { key: 'supplierName', label: 'المورد', filterable: true },
        { key: 'storageType', label: 'التخزين', filterable: true },
      ],
      load: () => app.rawMaterials.map((m) => ({
        code: m.code, nameAr: m.nameAr, category: catLabel(m.category), unit: m.unit,
        standardPrice: m.standardPrice, averageCost: round2(app.getAverageUnitCost(m.id)),
        onHand: onHandOf(m.id), reorderPoint: m.reorderPoint ?? 0, leadTimeDays: m.leadTimeDays ?? 0,
        minStock: m.minStockLevel, maxStock: m.maxStockLevel,
        supplierName: app.suppliers.find((s) => s.id === m.supplierId)?.name || '—',
        storageType: STORAGE[m.storageType] || m.storageType, isActive: m.isActive ? 'نشط' : 'موقوف',
      })),
    },
    {
      id: 'batches',
      label: 'دفعات المخزون (FEFO)',
      description: 'تتبع كميات الصلاحية لكل دفعة، مع حالة السريان حسب تاريخ الانتهاء.',
      columns: [
        { key: 'batchNumber', label: 'رقم الدفعة', defaultSelected: true },
        { key: 'materialName', label: 'الصنف', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true },
        { key: 'receivedAt', label: 'تاريخ الاستلام', kind: 'date', filterable: true },
        { key: 'expiryDate', label: 'تاريخ الانتهاء', kind: 'date', defaultSelected: true },
        { key: 'receivedQty', label: 'المستلم', kind: 'number' },
        { key: 'remainingQty', label: 'المتبقي', kind: 'number', defaultSelected: true },
        { key: 'unitPrice', label: 'سعر الوحدة', kind: 'money' },
        { key: 'status', label: 'الحالة', filterable: true, defaultSelected: true },
      ],
      load: () => {
        const tod = today();
        return app.inventoryBatches.map((b) => ({
          batchNumber: b.batchNumber, materialName: matName(b.rawMaterialId),
          branchId: b.branchId, branchName: bname(b.branchId),
          receivedAt: b.receivedAt, expiryDate: b.expiryDate,
          receivedQty: b.receivedQty, remainingQty: b.remainingQty, unitPrice: b.unitPrice,
          status: (b.expiryDate || '') < tod ? 'منتهية' : 'سارية',
        }));
      },
    },
    {
      id: 'temp_logs',
      label: 'سجل درجات الحرارة (HACCP)',
      description: 'قراءات درجات حرارة وحدات التخزين وحالة كل قراءة حسب النطاق الآمن.',
      columns: [
        { key: 'date', label: 'التاريخ', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true, defaultSelected: true },
        { key: 'location', label: 'الموقع', filterable: true, defaultSelected: true },
        { key: 'storageType', label: 'التخزين', filterable: true },
        { key: 'temperature', label: 'الحرارة °م', kind: 'number', defaultSelected: true },
        { key: 'status', label: 'الحالة', filterable: true, defaultSelected: true },
        { key: 'recordedBy', label: 'المسجل' },
      ],
      load: () => app.tempLogs.map((t) => ({
        date: t.date, branchId: t.branchId, branchName: bname(t.branchId),
        location: t.location, storageType: STORAGE[t.storageType] || t.storageType,
        temperature: t.temperature, status: TEMP_STATUS[tempStatusOf(t)] || '—',
        recordedBy: t.recordedBy,
      })),
    },
    {
      id: 'haccp',
      label: 'فحوصات سلامة الغذاء',
      description: 'نتائج التدقيق اليومي/الأسبوعي/الشهري مع عدد البنود الناجحة.',
      columns: [
        { key: 'date', label: 'التاريخ', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true, defaultSelected: true },
        { key: 'type', label: 'النوع', filterable: true },
        { key: 'inspector', label: 'المفتش' },
        { key: 'passedCount', label: 'بنود ناجحة', kind: 'number', defaultSelected: true },
        { key: 'totalItems', label: 'إجمالي البنود', kind: 'number' },
        { key: 'overallPassed', label: 'النتيجة', filterable: true, defaultSelected: true },
        { key: 'notes', label: 'ملاحظات' },
      ],
      load: () => app.haccpInspections.map((h) => ({
        date: h.date, branchId: h.branchId, branchName: bname(h.branchId),
        type: h.type, inspector: h.inspector, passedCount: h.items.filter((i) => i.passed).length,
        totalItems: h.items.length, overallPassed: h.overallPassed ? 'ناجح' : 'فاشل', notes: h.notes || '',
      })),
    },
    {
      id: 'pl',
      label: 'قوائم الربح والخسارة (P&L)',
      description: 'أرباح الفروع الشهرية وحلقات التكلفة ونسبها.',
      columns: [
        { key: 'period', label: 'الفترة', defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true, defaultSelected: true },
        { key: 'totalSales', label: 'المبيعات', kind: 'money' },
        { key: 'foodCost', label: 'تكلفة الطعام', kind: 'money' },
        { key: 'laborCost', label: 'العمالة', kind: 'money' },
        { key: 'primeCost', label: 'التكلفة الأولية', kind: 'money' },
        { key: 'operatingExpenses', label: 'المصاريف', kind: 'money' },
        { key: 'netProfit', label: 'صافي الربح', kind: 'money', defaultSelected: true },
        { key: 'foodCostPercent', label: 'نسبة الطعام', kind: 'pct' },
        { key: 'laborCostPercent', label: 'نسبة العمالة', kind: 'pct' },
        { key: 'primeCostPercent', label: 'نسبة الأولية', kind: 'pct' },
        { key: 'netProfitPercent', label: 'صافي الهامش', kind: 'pct', defaultSelected: true },
      ],
      load: () => app.plSummaries.map((p) => ({
        period: p.period, branchId: p.branchId, branchName: bname(p.branchId),
        totalSales: p.totalSales, foodCost: p.foodCost, laborCost: p.laborCost,
        primeCost: p.primeCost, operatingExpenses: p.operatingExpenses, netProfit: p.netProfit,
        foodCostPercent: round2(p.foodCostPercent), laborCostPercent: round2(p.laborCostPercent),
        primeCostPercent: round2(p.primeCostPercent), netProfitPercent: round2(p.netProfitPercent),
      })),
    },
    {
      id: 'deliveries',
      label: 'مبيعات التوصيل',
      description: 'مبيعات منصات التوصيل: الإجمالي والصافي والعمولة والمستلم.',
      columns: [
        { key: 'date', label: 'التاريخ', kind: 'date', filterable: true, defaultSelected: true },
        { key: 'branchName', label: 'الفرع', filterable: true },
        { key: 'platformName', label: 'المنصة', filterable: true, defaultSelected: true },
        { key: 'ordersCount', label: 'الطلبات', kind: 'number' },
        { key: 'grossRevenue', label: 'الإجمالي شامل الضريبة', kind: 'money' },
        { key: 'vatAmount', label: 'الضريبة', kind: 'money' },
        { key: 'netRevenue', label: 'الصافي', kind: 'money' },
        { key: 'commissionPercent', label: 'العمولة %', kind: 'pct' },
        { key: 'commissionAmount', label: 'قيمة العمولة', kind: 'money' },
        { key: 'payoutAmount', label: 'المستلم الفعلي', kind: 'money', defaultSelected: true },
      ],
      load: () => app.deliverySales.map((d) => ({
        date: d.date, branchId: d.branchId, branchName: bname(d.branchId),
        platformName: d.platformName, ordersCount: d.ordersCount, grossRevenue: d.grossRevenue,
        vatAmount: d.vatAmount, netRevenue: d.netRevenue, commissionPercent: d.commissionPercent,
        commissionAmount: d.commissionAmount, payoutAmount: d.payoutAmount,
      })),
    },
    {
      id: 'recipes',
      label: 'الوصفات المعيارية (تكاليف وهامش)',
      description: 'تكلفة الطبق، أسعار القائمة، وهامش الربح لكل وصفة.',
      columns: [
        { key: 'code', label: 'الكود', defaultSelected: true },
        { key: 'nameAr', label: 'اسم الطبق', defaultSelected: true },
        { key: 'category', label: 'التصنيف', filterable: true },
        { key: 'section', label: 'القسم', filterable: true },
        { key: 'portionSize', label: 'الحصة' },
        { key: 'yieldPieces', label: 'قطع الإنتاج', kind: 'number' },
        { key: 'prepTimeMins', label: 'وقت التحضير (د)', kind: 'number' },
        { key: 'totalCalculatedCost', label: 'التكلفة', kind: 'money', defaultSelected: true },
        { key: 'suggestedPrice', label: 'سعر مقترح', kind: 'money' },
        { key: 'actualMenuPrice', label: 'سعر القائمة', kind: 'money', defaultSelected: true },
        { key: 'marginPct', label: 'هامش الربح %', kind: 'pct', defaultSelected: true },
        { key: 'targetFoodCostPercent', label: 'نسبة تكلفة مستهدفة', kind: 'pct' },
        { key: 'isCentral', label: 'مطبخ مركزي', filterable: true },
      ],
      load: () => {
        return app.recipes.map((r) => {
          const menuPrice = r.actualMenuPrice || 0;
          const marginPct = menuPrice > 0 ? round2(((menuPrice - r.totalCalculatedCost) / menuPrice) * 100) : 0;
          return {
            code: r.code, nameAr: r.nameAr, category: RCP_CAT[r.category] || r.category,
            section: r.section || '—', portionSize: r.portionSize, yieldPieces: r.yieldPieces ?? '',
            prepTimeMins: r.prepTimeMins, totalCalculatedCost: r.totalCalculatedCost,
            suggestedPrice: r.suggestedPrice, actualMenuPrice: menuPrice, marginPct,
            targetFoodCostPercent: r.targetFoodCostPercent ?? '', isCentral: r.isCentralKitchenPrep ? 'نعم' : 'لا',
          };
        });
      },
    },
  ];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const defaultColumns = (ds: ReportDataset) => {
  const sel = ds.columns.filter((c) => c.defaultSelected).map((c) => c.key);
  return sel.length ? sel : ds.columns.slice(0, 5).map((c) => c.key);
};

const FilterRow: React.FC<{ label: string; options: string[]; value: string; onChange: (v: string) => void }> = ({ label, options, value, onChange }) => (
  <div>
    <label className="block font-bold text-slate-600 text-[10px] mb-1">{label}</label>
    <select value={value || 'all'} onChange={(e) => onChange(e.target.value)} className={inputCls + ' !py-1.5 text-xs'}>
      <option value="all">الكل</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export const ReportDesignerView: React.FC = () => {
  const app = useApp();
  const { customReports, setCustomReports, showToast } = app;

  const [mode, setMode] = useState<'catalog' | 'designer'>('catalog');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportName, setReportName] = useState('');
  const [datasetId, setDatasetId] = useState<string>('operating_expenses');
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState('');
  const [busy, setBusy] = useState(false);

  const datasets = makeDatasets(app);
  const ds = datasets.find((d) => d.id === datasetId) || datasets[0];

  useEffect(() => {
    if (!ds) return;
    setSelected(defaultColumns(ds));
    setFilters({});
    setGroupBy('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const filterColumns = ds ? ds.columns.filter((c) => c.filterable).slice(0, 6) : [];
  const records = ds ? ds.load() : [];

  const selection: ReportSelection = { columns: selected, filters, groupBy: selected.includes(groupBy) ? groupBy : '' };
  const table = useMemo<ReportTable | null>(
    () => {
      if (!ds || !selected.length) return null;
      try { return buildTable(ds, selection); } catch { return null; }
    },
    // إعادة الحساب عند تغيّر أي بيانات حالة يلمسها المصدر — البيانات نفسها تُسحب داخل load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds, selected.join('|'), JSON.stringify(filters), groupBy, app.operatingExpenses, app.rawMaterials, app.inventory, app.inventoryBatches, app.tempLogs, app.haccpInspections, app.purchaseOrders, app.invoices, app.expenseBudgets, app.deliverySales, app.plSummaries, app.recipes, app.branches]
  );

  const kindOf = (key: string) => ds?.columns.find((c) => c.key === key)?.kind;

  const toggleColumn = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const newReport = () => {
    setEditingId(null);
    setReportName('');
    setDatasetId('operating_expenses');
    setMode('designer');
  };

  const openReport = (r: CustomReport) => {
    setEditingId(r.id);
    setReportName(r.name);
    setDatasetId(r.datasetId);
    setSelected(r.columns.length ? r.columns : defaultColumns(datasets.find((d) => d.id === r.datasetId) || datasets[0]));
    setFilters(r.filters || {});
    setGroupBy(r.groupBy || '');
    setMode('designer');
  };

  const saveCurrent = () => {
    if (!reportName.trim()) { showToast('اكتب اسماً للتقرير أولاً', { level: 'error' }); return; }
    if (!ds) return;
    const payload = {
      name: reportName.trim(), datasetId: ds.id, columns: selected, filters, groupBy,
    };
    setCustomReports((prev) => {
      const existing = editingId ? prev.find((r) => r.id === editingId) : undefined;
      if (existing) {
        return prev.map((r) => (r.id === editingId ? { ...r, ...payload, updatedAt: new Date().toISOString() } : r));
      }
      const now = new Date().toISOString();
      return [{ id: `cr-${Date.now()}`, ...payload, createdAt: now, updatedAt: now }, ...prev];
    });
    showToast('تم حفظ التقرير في كتالوج التقارير');
  };

  const deleteReport = (id: string) => {
    setCustomReports((prev) => prev.filter((r) => r.id !== id));
    showToast('حُذف التقرير');
  };

  const runJsReport = async () => {
    if (!table || !table.rows.length) { showToast('لا توجد بيانات لتوليد التقرير', { level: 'error' }); return; }
    setBusy(true);
    try {
      const token = localStorage.getItem('rcerp_token') || '';
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: reportName.trim() || ds?.label || 'تقرير', header: table.columns, rows: table.rows }),
      });
      if (res.status === 401) { showToast('انتهت الجلسة — أعد تسجيل الدخول', { level: 'error' }); return; }
      if (res.status === 501) { showToast('محرك jsreport غير مثبت على الخادم — فعّله من ملف server/routes/report.mjs', { level: 'error' }); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error || `فشل التوليد (${res.status})`, { level: 'error' }); return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(reportName.trim() || 'report').replace(/[^\w\u0600-\u06FF]+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('تم توليد PDF عبر jsreport');
    } catch {
      showToast('فشل الاتصال بخادم التقارير', { level: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const cellText = (v: string | number, kind?: string): React.ReactNode => {
    if (v === '' || v === null || v === undefined) return '—';
    if (kind === 'money') return <span className="tnum" dir="ltr">{fmtMoney(Number(v))}</span>;
    if (kind === 'pct') return <span className="tnum" dir="ltr">{fmtCell(v, 'pct')}%</span>;
    if (kind === 'number') return <span className="tnum font-mono">{v}</span>;
    return v;
  };

  const sheetRows = table?.rows.map((r) => r) || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="مصمّم التقارير المخصّصة الموحّد"
        subtitle="باني تقارير داخلي + محرك jsreport على الخادم — اختر مصدراً، فعّل الأعمدة والفلاتر، واحفظ التقرير لإعادة تشغيله"
        icon={<LayoutTemplate className="w-6 h-6" />}
        actions={mode === 'designer'
          ? <Btn tone="ghost" onClick={() => setMode('catalog')}><ArrowRight className="w-3.5 h-3.5" /> التقارير المحفوظة</Btn>
          : <Btn onClick={newReport}><LayoutTemplate className="w-3.5 h-3.5" /> تقرير جديد</Btn>}
      />

      {mode === 'catalog' && (
        <Card className="p-4">
          <SectionHeader title={`كتالوج التقارير المحفوظة (${customReports.length})`} icon={<Table2 className="w-5 h-5 text-brand-600" />}
            extra={<span className="text-[10px] text-slate-400">تُزامَن عبر cloud</span>} />
          {customReports.length === 0 ? (
            <EmptyState title="لا توجد تقارير مخصصة بعد" subtitle="اضغط «تقرير جديد» لبناء أول تقرير من مصادر النظام العشرة" icon={<LayoutTemplate className="w-5 h-5" />} />
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-right text-slate-500 border-b border-slate-200">
                    <th className="p-2 font-semibold">التقرير</th>
                    <th className="p-2 font-semibold">المصدر</th>
                    <th className="p-2 font-semibold text-center">الأعمدة</th>
                    <th className="p-2 font-semibold">آخر تعديل</th>
                    <th className="p-2 font-semibold text-center">تشغيل</th>
                  </tr>
                </thead>
                <tbody>
                  {customReports.map((r) => {
                    const d = datasets.find((x) => x.id === r.datasetId);
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="p-2 font-bold text-slate-800">{r.name}</td>
                        <td className="p-2 text-slate-600">{d?.label || r.datasetId}</td>
                        <td className="p-2 text-center text-slate-600 tnum">{r.columns.length}</td>
                        <td className="p-2 text-slate-500 tnum">{r.updatedAt ? r.updatedAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1">
                            <Btn tone="success" className="!px-2.5 !py-1.5" onClick={() => openReport(r)}><Play className="w-3.5 h-3.5" /> تشغيل</Btn>
                            <Btn tone="ghost" className="!px-2.5 !py-1.5" onClick={() => openReport(r)}><PenLine className="w-3.5 h-3.5" /></Btn>
                            <Btn tone="danger" className="!px-2.5 !py-1.5" onClick={() => deleteReport(r.id)}><Trash2 className="w-3.5 h-3.5" /></Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {mode === 'designer' && ds && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 items-start">
          <div className="space-y-3">
            <Card className="p-4 space-y-3">
              <SectionHeader title="1. المصدر والاسم" icon={<Database className="w-4 h-4 text-brand-600" />} />
              <div>
                <label className="block font-bold text-slate-600 text-[10px] mb-1">اسم التقرير</label>
                <input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="مثال: مصاريف الفروع — يوليو" className={inputCls} />
              </div>
              <div>
                <label className="block font-bold text-slate-600 text-[10px] mb-1">مصدر البيانات</label>
                <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className={inputCls}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                <p className="text-[9px] text-slate-400 mt-1 leading-4">{ds.description}</p>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <SectionHeader title="2. الأعمدة" icon={<Columns3 className="w-4 h-4 text-brand-600" />} />
              <div className="grid grid-cols-2 gap-1">
                {ds.columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggleColumn(c.key)} className="accent-primary-600" />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <SectionHeader title="3. التجميع والفلاتر" icon={<SlidersHorizontal className="w-4 h-4 text-brand-600" />} />
              <div>
                <label className="block font-bold text-slate-600 text-[10px] mb-1">التجميع حسب</label>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={inputCls + ' !py-1.5 text-xs'}>
                  <option value="">بدون تجميع</option>
                  {selected.map((k) => {
                    const c = ds.columns.find((x) => x.key === k);
                    return c ? <option key={k} value={k}>{c.label}</option> : null;
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {filterColumns.map((c) => (
                  <FilterRow
                    key={c.key}
                    label={c.label}
                    options={distinctOptions(records, c.key, c.kind)}
                    value={filters[c.key] || 'all'}
                    onChange={(v) => setFilters((prev) => ({ ...prev, [c.key]: v }))}
                  />
                ))}
              </div>
            </Card>

            <div className="flex items-center gap-2">
              <Btn tone="dark" className="flex-1" onClick={saveCurrent} disabled={busy}><Save className="w-3.5 h-3.5" /> {editingId ? 'تحديث التقرير' : 'حفظ التقرير'}</Btn>
            </div>
          </div>

          <Card className="p-4 space-y-3">
            <SectionHeader title="المعاينة والتشغيل" icon={<Table2 className="w-5 h-5 text-brand-600" />}
              extra={
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <ViewToolbar
                    filename={reportName.trim() || ds.label}
                    sheets={sheetRows.length ? [{ name: reportName.trim() || ds.label, header: table?.columns || [], rows: sheetRows }] : undefined}
                  />
                  <button
                    onClick={() => { void runJsReport(); }}
                    disabled={busy || !table?.rows.length}
                    className="flex items-center gap-1.5 font-bold px-3 py-2 rounded-xl text-xs shadow-xs border border-slate-200 bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50"
                    title="توليد PDF جاهز عبر محرك jsreport على الخادم"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF (jsreport)
                  </button>
                </div>
              } />

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-bold">المعاينة الداخلية (تصدير Excel/طباعة)</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-bold">محرك jsreport — قوالب متقدمة RTL</span>
            </div>

            {table && table.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-right bg-slate-900 text-white">
                      {table.columns.map((c, i) => <th key={i} className="p-2 font-bold whitespace-nowrap">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => {
                      const isTotal = table.hasTotals && ri === table.rows.length - 1;
                      return (
                        <tr key={ri} className={`border-b border-slate-100 ${isTotal ? 'bg-brand-50/70 font-extrabold text-brand-800' : 'hover:bg-slate-50/60'}`}>
                          {row.map((v, ci) => (
                            <td key={ci} className={`p-2 whitespace-nowrap ${isTotal && ci === 0 ? 'font-bold' : ''}`}>
                              {cellText(v, kindOf(table.keys[ci]))}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="لا توجد بيانات لهذا المصدر" subtitle="اختر أعمدة وتأكد من وجود سجلات" icon={<Table2 className="w-5 h-5" />} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
};