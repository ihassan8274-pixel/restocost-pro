import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, BarChart3, ClipboardList, FileSpreadsheet, Upload, Check, Trash2, ArrowLeftRight, Settings2, Package, ReceiptText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Btn, Card, Field, PageHeader, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, fmtNum, monthLabel, netOfGross } from '../../utils/helpers';
import { DeliverySale, DeliverySaleItem } from '../../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

type TabId = 'import' | 'mapping' | 'dashboard' | 'records';
type ImportMode = 'delivery' | 'batch';

interface FoodicsRow {
  branch: string;
  branchRef: string;
  productEn: string;
  productCode: string;
  totalSales: number;
  netQuantity: number;
  cost: number;
  profit: number;
}

interface MappedRow extends FoodicsRow {
  recipeId: string;
  recipeNameAr: string;
  matched: boolean;
}

const TABS = [
  { id: 'import', label: 'استيراد من فودكس' },
  { id: 'mapping', label: 'ربط المنتجات بالوصفة' },
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'records', label: 'سجل الاستيراد' },
];

const thCls = 'p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50 whitespace-nowrap';

const FoodicsIntegrationView: React.FC = () => {
  const {
    recipes, branches, visibleBranchIds,
    batchSalesRecords, addBatchSalesRecord, deleteBatchSalesRecord,
    deliverySales, addDeliverySale, deleteDeliverySale,
    calculateRecipeCosts, showToast, vatPercent,
  } = useApp();

  const [tab, setTab] = useState<TabId>('import');
  const [rawRows, setRawRows] = useState<FoodicsRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [branchMap, setBranchMap] = useState<Record<string, string>>({});
  const [dateOverride, setDateOverride] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [recSearch, setRecSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('delivery');

  const myBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const foodicsBatchRecords = batchSalesRecords.filter((r) => r.source === 'foodics');
  const foodicsDeliveryRecords = deliverySales.filter((s) => s.platformName === 'Foodics');

  const recipeByEn = useMemo(() => {
    const m = new Map<string, typeof recipes[0]>();
    recipes.forEach((r) => {
      if (r.nameEn) m.set(r.nameEn.trim().toLowerCase(), r);
    });
    return m;
  }, [recipes]);

  const autoMatch = (rows: FoodicsRow[]) => {
    const m: Record<string, string> = {};
    const uniqueProducts = [...new Set(rows.map((r) => r.productEn))];
    uniqueProducts.forEach((pe) => {
      const byEn = recipeByEn.get(pe.trim().toLowerCase());
      if (byEn) { m[pe] = byEn.id; }
    });
    return m;
  };

  const detectFormat = (allRows: unknown[][]): 'branch' | 'product' | null => {
    // تنسيق "المبيعات حسب الفرع" - يبحث عن "الفرع" في العمود 0 و "المنتج" في العمود 2
    const branchIdx = allRows.findIndex((row) =>
      Array.isArray(row) && row[0] === 'الفرع' && row[2] === 'المنتج'
    );
    if (branchIdx >= 0) return 'branch';

    // تنسيق "المبيعات حسب المنتج" - يبحث عن "المنتج" في العمود 0
    const productIdx = allRows.findIndex((row) =>
      Array.isArray(row) && row[0] === 'المنتج' && row[1] === 'كود تعريف المنتج'
    );
    if (productIdx >= 0) return 'product';

    return null;
  };

  const parseBranchFormat = (allRows: unknown[][]) => {
    const dataStart = allRows.findIndex((row) =>
      Array.isArray(row) && row[0] === 'الفرع' && row[2] === 'المنتج'
    );
    const extracted: FoodicsRow[] = [];
    for (let i = dataStart + 1; i < allRows.length; i++) {
      const r = allRows[i] as unknown[];
      if (!r || !r[0] || !r[2]) continue;
      if (String(r[0]).includes('الإجمالي') || String(r[2]).includes('الإجمالي')) continue;
      extracted.push({
        branch: String(r[0] || '').trim(),
        branchRef: String(r[1] || '').trim(),
        productEn: String(r[2] || '').trim(),
        productCode: String(r[3] || '').trim(),
        totalSales: Number(r[4]) || 0,
        netQuantity: Number(r[12]) || 0,
        cost: Number(r[13]) || 0,
        profit: Number(r[18]) || 0,
      });
    }
    return extracted;
  };

  const parseProductFormat = (allRows: unknown[][]) => {
    const dataStart = allRows.findIndex((row) =>
      Array.isArray(row) && row[0] === 'المنتج' && row[1] === 'كود تعريف المنتج'
    );
    const extracted: FoodicsRow[] = [];
    for (let i = dataStart + 1; i < allRows.length; i++) {
      const r = allRows[i] as unknown[];
      if (!r || !r[0]) continue;
      if (String(r[0]).includes('الإجمالي')) continue;
      // الفرع في العمود 2، مرجع الفرع في العمود 3
      extracted.push({
        branch: String(r[2] || '').trim(),
        branchRef: String(r[3] || '').trim(),
        productEn: String(r[0] || '').trim(),
        productCode: String(r[1] || '').trim(),
        totalSales: Number(r[4]) || 0,           // إجمالي المبيعات
        netQuantity: Number(r[12]) || 0,          // صافي الكمية
        cost: Number(r[13]) || 0,                 // التكلفة
        profit: Number(r[18]) || 0,               // الربح
      });
    }
    return extracted;
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const format = detectFormat(allRows);
      let extracted: FoodicsRow[] = [];

      if (format === 'branch') {
        extracted = parseBranchFormat(allRows);
      } else if (format === 'product') {
        extracted = parseProductFormat(allRows);
      } else {
        showToast('لم يتم التعرف على تنسيق فودكس — تأكد من الملف (المبيعات حسب الفرع أو المبيعات حسب المنتج)');
        setBusy(false);
        return;
      }

      if (!extracted.length) { showToast('الملف فارغ أو بدون بيانات مبيعات'); setBusy(false); return; }

      if (!extracted.length) { showToast('الملف فارغ أو بدون بيانات مبيعات'); setBusy(false); return; }

      setRawRows(extracted);
      const auto = autoMatch(extracted);
      setMapping(auto);

      const uniqueBranches = [...new Set(extracted.map((r) => r.branch))];
      const bm: Record<string, string> = {};
      uniqueBranches.forEach((bn) => {
        const lb = bn.toLowerCase().trim();
        const found = myBranches.find((b) =>
          b.nameAr === bn ||
          b.nameEn.toLowerCase().trim() === lb ||
          b.nameAr.includes(bn) ||
          bn.includes(b.nameAr) ||
          b.nameEn.toLowerCase().includes(lb) ||
          lb.includes(b.nameEn.toLowerCase())
        );
        if (found) bm[bn] = found.id;
      });
      setBranchMap(bm);

      setDateOverride(new Date().toISOString().slice(0, 10));

      const matchedCount = Object.values(auto).filter(Boolean).length;
      const totalProducts = new Set(extracted.map((r) => r.productEn)).size;
      const mappedBranchCount = Object.values(bm).filter(Boolean).length;
      showToast(`تم تحميل ${extracted.length} صفاً — ${matchedCount}/${totalProducts} منتج مربوط — ${mappedBranchCount}/${uniqueBranches.length} فرع مربوط`);
      setTab('mapping');
    } catch {
      showToast('تعذر قراءة الملف — تأكد أنه ملف Excel صالح من فودكس');
    } finally {
      setBusy(false);
    }
  };

  const matchedRows = useMemo(() => {
    return rawRows.map((r) => ({
      ...r,
      recipeId: mapping[r.productEn] || '',
      recipeNameAr: (() => { const rid = mapping[r.productEn]; return rid ? (recipes.find((rc) => rc.id === rid)?.nameAr || rid) : ''; })(),
      matched: !!mapping[r.productEn],
    }));
  }, [rawRows, mapping, recipes]);

  const unmatchedProducts = useMemo(() => {
    const seen = new Set<string>();
    return matchedRows.filter((r) => !r.matched && !seen.has(r.productEn) && seen.add(r.productEn));
  }, [matchedRows]);

  const matchedCount = useMemo(() => {
    const seen = new Set<string>();
    return matchedRows.filter((r) => r.matched && !seen.has(r.productEn) && seen.add(r.productEn)).length;
  }, [matchedRows]);

  const totalProducts = useMemo(() => new Set(rawRows.map((r) => r.productEn)).size, [rawRows]);

  const unmappedBranches = useMemo(() => {
    const seen = new Set<string>();
    return rawRows
      .filter((r) => r.branch && !branchMap[r.branch] && !seen.has(r.branch) && seen.add(r.branch))
      .map((r) => r.branch);
  }, [rawRows, branchMap]);

  const doImport = () => {
    if (!rawRows.length) { showToast('لا توجد بيانات للاستيراد'); return; }
    const unmatched = matchedRows.filter((r) => !r.matched);
    if (unmatched.length) { showToast(`${unmatched.length} صنف غير مربوط — اربطها أولاً`); setTab('mapping'); return; }
    if (unmappedBranches.length) { showToast(`${unmappedBranches.length} فرع غير مربوط — اربطها أولاً`); setTab('mapping'); return; }

    const dateStr = dateOverride || new Date().toISOString().slice(0, 10);
    const vatRate = vatPercent / 100;

    const grouped = new Map<string, MappedRow[]>();
    matchedRows.forEach((r) => {
      if (!grouped.has(r.branch)) grouped.set(r.branch, []);
      grouped.get(r.branch)!.push(r);
    });

    if (importMode === 'delivery') {
      let deliveryCount = 0;
      grouped.forEach((items, branchName) => {
        const branchMapEntry = branchMap[branchName];
        const branchId = branchMapEntry || '';
        const mappedBranchLabel = branchMapEntry ? (branches.find((b) => b.id === branchMapEntry)?.nameAr || branchName) : branchName;
        const deliverySaleItems: DeliverySaleItem[] = items.map((r) => {
          const rec = recipes.find((rc) => rc.id === r.recipeId);
          const costs = rec ? calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces) : null;
          const price = rec?.actualMenuPrice || costs?.suggestedPrice || 0;
          return {
            recipeId: r.recipeId,
            recipeNameAr: r.recipeNameAr,
            category: rec?.category || '',
            quantitySold: r.netQuantity,
            unitPrice: price,
            unitCost: costs?.totalCost || 0,
          };
        });
        const gross = deliverySaleItems.reduce((s, it) => s + it.unitPrice * it.quantitySold, 0);
        const net = netOfGross(gross, vatRate);

        const sale: Omit<DeliverySale, 'id'> = {
          platformId: 'foodics',
          platformName: 'Foodics',
          branchId,
          branchName: mappedBranchLabel,
          date: dateStr,
          ordersCount: 0,
          items: deliverySaleItems,
          grossRevenue: round2(gross),
          vatAmount: round2(gross - net),
          netRevenue: round2(net),
          commissionPercent: 0,
          commissionAmount: 0,
          payoutAmount: round2(net),
          createdAt: new Date().toISOString(),
        };
        addDeliverySale(sale);
        deliveryCount++;
      });
      showToast(`تم استيراد ${deliveryCount} سجل طلبات توصيل — يظهر في تطبيقات التوصيل`);
    } else {
      let batchCount = 0;
      grouped.forEach((items, branchName) => {
        const branchId = branchMap[branchName] || '';
        const saleItems = items.map((r) => {
          const rec = recipes.find((rc) => rc.id === r.recipeId);
          const costs = rec ? calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces) : null;
          const price = rec?.actualMenuPrice || costs?.suggestedPrice || 0;
          return {
            recipeId: r.recipeId,
            recipeNameAr: r.recipeNameAr,
            category: rec?.category || '',
            quantitySold: r.netQuantity,
            unitPrice: price,
            unitCost: costs?.totalCost || 0,
            lineTotalRevenue: round2(price * r.netQuantity),
            lineTotalCost: round2((costs?.totalCost || 0) * r.netQuantity),
          };
        });
        const totalRevenue = saleItems.reduce((s, it) => s + it.lineTotalRevenue, 0);
        const totalFoodCost = saleItems.reduce((s, it) => s + it.lineTotalCost, 0);
        const netRevenue = netOfGross(totalRevenue, vatRate);

        addBatchSalesRecord({
          branchId,
          branchName,
          date: dateStr,
          items: saleItems,
          totalRevenue: round2(totalRevenue),
          totalFoodCost: round2(totalFoodCost),
          foodCostPercent: netRevenue ? round2((totalFoodCost / netRevenue) * 100) : 0,
          enteredBy: 'Foodics Import',
          source: 'foodics',
          vatRate,
          vatAmount: round2(totalRevenue - netRevenue),
          netRevenue: round2(netRevenue),
        });
        batchCount++;
      });
      showToast(`تم استيراد ${batchCount} سجل مبيعات مجمعة — يظهر في شاشة المبيعات`);
    }

    setRawRows([]);
    setMapping({});
    setTab('records');
  };

  const deleteRecord = (id: string, type: 'batch' | 'delivery') => {
    if (!window.confirm('حذف سجل مبيعات فودكس؟')) return;
    if (type === 'batch') {
      deleteBatchSalesRecord(id);
    } else {
      deleteDeliverySale(id);
    }
    showToast('تم حذف السجل');
  };

  const filteredRecords = useMemo(() => {
    const all: { id: string; date: string; branchName: string; items: { quantitySold: number }[]; revenue: number; cost: number; fcPct: number; type: 'batch' | 'delivery' }[] = [];
    foodicsBatchRecords.forEach((r) => {
      const rev = r.netRevenue || r.totalRevenue;
      all.push({
        id: r.id, date: r.date, branchName: r.branchName,
        items: r.items.map((it) => ({ quantitySold: it.quantitySold })),
        revenue: rev, cost: r.totalFoodCost, fcPct: r.foodCostPercent, type: 'batch',
      });
    });
    foodicsDeliveryRecords.forEach((s) => {
      const cost = s.items.reduce((a, it) => a + it.unitCost * it.quantitySold, 0);
      all.push({
        id: s.id, date: s.date, branchName: s.branchName,
        items: s.items.map((it) => ({ quantitySold: it.quantitySold })),
        revenue: s.netRevenue, cost, fcPct: s.netRevenue ? round2((cost / s.netRevenue) * 100) : 0, type: 'delivery',
      });
    });
    return all
      .filter((r) => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate))
      .filter((r) => !recSearch || r.branchName.includes(recSearch) || r.date.includes(recSearch))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [foodicsBatchRecords, foodicsDeliveryRecords, fromDate, toDate, recSearch]);

  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'}至 ${toDate || 'اليوم'}` : 'كامل الفترة';

  const branchTotals = useMemo(() => {
    const m = new Map<string, { name: string; records: number; qty: number; revenue: number; cost: number; fcPct: number }>();
    filteredRecords.forEach((r) => {
      const cur = m.get(r.branchName) ?? { name: r.branchName, records: 0, qty: 0, revenue: 0, cost: 0, fcPct: 0 };
      cur.records += 1;
      cur.qty += r.items.reduce((s, it) => s + it.quantitySold, 0);
      cur.revenue += r.revenue;
      cur.cost += r.cost;
      m.set(r.branchName, cur);
    });
    return Array.from(m.values()).map((g) => ({ ...g, fcPct: g.revenue ? round2((g.cost / g.revenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredRecords]);

  const monthChart = useMemo(() => {
    const months = Array.from(new Set(filteredRecords.map((r) => r.date.slice(0, 7)))).sort();
    return months.map((mo) => {
      const recs = filteredRecords.filter((r) => r.date.slice(0, 7) === mo);
      const rev = recs.reduce((s, r) => s + r.revenue, 0);
      const cost = recs.reduce((s, r) => s + r.cost, 0);
      return {
        name: monthLabel(mo),
        الإيراد: round2(rev),
        التكلفة: round2(cost),
      };
    });
  }, [filteredRecords]);

  const productTotals = useMemo(() => {
    const m = new Map<string, { nameEn: string; nameAr: string; qty: number; revenue: number; cost: number }>();
    foodicsBatchRecords.forEach((r) => {
      if ((!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate)) {
        r.items.forEach((it) => {
          const rec = recipes.find((rc) => rc.id === it.recipeId);
          const key = rec?.nameEn || it.recipeId;
          const lineRev = it.unitPrice * it.quantitySold;
          const lineCost = it.unitCost * it.quantitySold;
          const cur = m.get(key) ?? { nameEn: rec?.nameEn || '', nameAr: it.recipeNameAr, qty: 0, revenue: 0, cost: 0 };
          cur.qty += it.quantitySold;
          cur.revenue += lineRev;
          cur.cost += lineCost;
          m.set(key, cur);
        });
      }
    });
    foodicsDeliveryRecords.forEach((s) => {
      if ((!fromDate || s.date >= fromDate) && (!toDate || s.date <= toDate)) {
        s.items.forEach((it) => {
          const rec = recipes.find((rc) => rc.id === it.recipeId);
          const key = rec?.nameEn || it.recipeId;
          const lineRev = it.unitPrice * it.quantitySold;
          const lineCost = it.unitCost * it.quantitySold;
          const cur = m.get(key) ?? { nameEn: rec?.nameEn || '', nameAr: it.recipeNameAr, qty: 0, revenue: 0, cost: 0 };
          cur.qty += it.quantitySold;
          cur.revenue += lineRev;
          cur.cost += lineCost;
          m.set(key, cur);
        });
      }
    });
    return Array.from(m.values()).map((p) => ({ ...p, fcPct: p.revenue ? round2((p.cost / p.revenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [foodicsBatchRecords, foodicsDeliveryRecords, fromDate, toDate, recipes]);

  const tRevenue = filteredRecords.reduce((s, r) => s + r.revenue, 0);
  const tCost = filteredRecords.reduce((s, r) => s + r.cost, 0);
  const tQty = filteredRecords.reduce((s, r) => s + r.items.reduce((a, it) => a + it.quantitySold, 0), 0);
  const tFcPct = tRevenue ? round2((tCost / tRevenue) * 100) : 0;

  const kpis = [
    { label: 'إجمالي الإيراد (صافي)', value: fmtMoney(tRevenue), cls: 'text-slate-900' },
    { label: 'إجمالي تكلفة الطعام', value: fmtMoney(tCost), cls: 'text-amber-700' },
    { label: 'Food Cost %', value: `${tFcPct}%`, cls: tFcPct > 35 ? 'text-rose-600' : 'text-emerald-700' },
    { label: 'إجمالي الكمية', value: fmtNum(tQty, 0), cls: 'text-slate-900' },
    { label: 'عدد السجلات', value: `${filteredRecords.length}`, cls: 'text-indigo-700' },
  ];

  const excelSheets = [
    {
      name: 'ملخص الفروع',
      header: ['الفرع', 'السجلات', 'الكمية', 'الإيراد', 'التكلفة', 'Food Cost %'],
      rows: branchTotals.map((g) => [g.name, g.records, Math.round(g.qty), Number(g.revenue.toFixed(2)), Number(g.cost.toFixed(2)), g.fcPct]),
    },
    {
      name: 'الأصناف',
      header: ['الصنف بالعربي', 'الصنف بالإنجليزي', 'الكمية', 'الإيراد', 'التكلفة', 'Food Cost %'],
      rows: productTotals.map((p) => [p.nameAr, p.nameEn, Math.round(p.qty), Number(p.revenue.toFixed(2)), Number(p.cost.toFixed(2)), p.fcPct]),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<BarChart3 className="w-8 h-8 text-emerald-600" />} title="استيراد مبيعات فودكس" subtitle="استيراد الاسم والكمية فقط — التسعير من قائمة الأجهزة" />

      <TabBar tabs={TABS} active={tab} onChange={(t) => setTab(t as TabId)} />

      {tab === 'import' && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">استيراد مبيعات فودكس</h3>
            </div>
            <p className="text-xs text-slate-500 font-bold">قم بتصدير ملف "المبيعات حسب الفرع" من لوحة تحكم فودكس ثم ارفعه هنا — يتم استخراج الاسم والكمية فقط، والتسعير من قائمة الأسعار المحفوظة في النظام</p>

            <div className="flex gap-3">
              <button
                onClick={() => setImportMode('delivery')}
                className={`flex-1 p-3 rounded-xl border-2 text-xs font-bold transition-all ${importMode === 'delivery' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                <span className="block text-sm mb-1"><Package className="w-5 h-5 mx-auto" /></span>
                استيراد كطلبات توصيل
                <span className="block text-[10px] font-normal mt-1 opacity-70">يظهر في تطبيقات التوصيل</span>
              </button>
              <button
                onClick={() => setImportMode('batch')}
                className={`flex-1 p-3 rounded-xl border-2 text-xs font-bold transition-all ${importMode === 'batch' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                <span className="block text-sm mb-1"><ReceiptText className="w-5 h-5 mx-auto" /></span>
                استيراد كمبيعات مجمعة
                <span className="block text-[10px] font-normal mt-1 opacity-70">يظهر في إدخال مبيعات الفرع</span>
              </button>
            </div>

            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-8 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors text-center">
              <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="font-extrabold text-slate-800">اختر ملف فودكس (.xls أو .xlsx)</p>
                <p className="text-slate-500 mt-1">التنسيق: "المبيعات حسب الفرع" — يتم التعرف تلقائياً</p>
              </div>
              <input type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {busy && <p className="text-center text-emerald-600 font-bold text-xs">جاري التحميل...</p>}
          </div>
        </Card>
      )}

      {tab === 'mapping' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <Field label="تاريخ الاستيراد">
              <input type="date" value={dateOverride} onChange={(e) => setDateOverride(e.target.value)} className={inputCls} />
            </Field>
            <Field label="نوع الاستيراد">
              <select value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)} className={inputCls}>
                <option value="delivery">طلبات توصيل</option>
                <option value="batch">مبيعات مجمعة</option>
              </select>
            </Field>
            <div className="grow" />
            <p className="text-[11px] text-slate-500 font-bold">منتجات: {matchedCount}/{totalProducts} — فروع: {Object.values(branchMap).filter(Boolean).length}/{new Set(rawRows.map((r) => r.branch)).size}</p>
            <Btn tone="success" onClick={doImport} disabled={!rawRows.length || unmatchedProducts.length > 0 || unmappedBranches.length > 0}>
              <Check className="w-4 h-4" /> استيراد ({matchedRows.filter((r) => r.matched).length} صنف)
            </Btn>
          </Card>

          {unmatchedProducts.length > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h4 className="font-extrabold text-amber-800 text-xs">{unmatchedProducts.length} منتج غير مربوط بوصفة في النظام</h4>
              </div>
              <p className="text-[10px] text-amber-700 mb-2">تأكد من إدخال الاسم بالإنجليزي في شاشة الوصفات المعيارية</p>
              <div className="flex flex-wrap gap-2">
                {unmatchedProducts.map((r) => (
                  <span key={r.productEn} className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full">{r.productEn}</span>
                ))}
              </div>
            </Card>
          )}

          {unmappedBranches.length > 0 && (
            <Card className="p-4 border-rose-200 bg-rose-50">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h4 className="font-extrabold text-rose-800 text-xs">{unmappedBranches.length} فرع في الملف غير مربوط بفرع في النظام</h4>
              </div>
              <div className="space-y-2">
                {unmappedBranches.map((bn) => (
                  <div key={bn} className="flex items-center gap-3 bg-white border border-rose-200 rounded-xl px-3 py-2">
                    <span className="font-bold text-rose-700 text-xs shrink-0">{bn}</span>
                    <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0" />
                    <select
                      value={branchMap[bn] || ''}
                      onChange={(e) => setBranchMap((m) => ({ ...m, [bn]: e.target.value }))}
                      className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 bg-white text-xs"
                    >
                      <option value="">— اختر الفرع —</option>
                      {myBranches.map((b) => (
                        <option key={b.id} value={b.id}>{b.nameAr} ({b.nameEn})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {Object.keys(branchMap).length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">ربط الفروع ({Object.values(branchMap).filter(Boolean).length}/{new Set(rawRows.map((r) => r.branch)).size})</h3>
              </div>
              <div className="space-y-2">
                {[...new Set(rawRows.map((r) => r.branch))].map((bn) => (
                  <div key={bn} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="font-bold text-indigo-700 text-xs shrink-0 w-32">{bn}</span>
                    <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0" />
                    <select
                      value={branchMap[bn] || ''}
                      onChange={(e) => setBranchMap((m) => ({ ...m, [bn]: e.target.value }))}
                      className={`flex-1 border rounded-lg px-2 py-1.5 bg-white text-xs ${branchMap[bn] ? 'border-emerald-300' : 'border-amber-300'}`}
                    >
                      <option value="">— اختر الفرع —</option>
                      {myBranches.map((b) => (
                        <option key={b.id} value={b.id}>{b.nameAr} ({b.nameEn})</option>
                      ))}
                    </select>
                    {branchMap[bn] && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">ربط المنتجات بالوصفة</h3>
            </div>
            <p className="text-[11px] text-slate-500 font-bold mb-3">اختر وصفة لكل منتج — السعر يُأخذ تلقائياً من سعر المنيو المحفوظ</p>
            <div className="space-y-2">
              {[...new Set(rawRows.map((r) => r.productEn))].map((pe) => {
                const recipeId = mapping[pe] || '';
                const matched = matchedRows.filter((r) => r.productEn === pe);
                const totalQty = matched.reduce((s, r) => s + r.netQuantity, 0);
                return (
                  <div key={pe} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <div className="w-36 shrink-0">
                      <span className="font-bold text-indigo-700 text-xs font-mono block">{pe}</span>
                      <span className="text-[10px] text-slate-500">كمية: {fmtNum(totalQty, 0)}</span>
                    </div>
                    <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0" />
                    <select
                      value={recipeId}
                      onChange={(e) => setMapping((m) => ({ ...m, [pe]: e.target.value }))}
                      className={`flex-1 border rounded-lg px-2 py-1.5 bg-white text-xs ${recipeId ? 'border-emerald-300' : 'border-amber-300'}`}
                    >
                      <option value="">— اختر الوصفة —</option>
                      {recipes.filter((r) => !r.isCentralKitchenPrep && r.isActive).map((r) => (
                        <option key={r.id} value={r.id}>{r.nameAr} {r.nameEn ? `(${r.nameEn})` : ''} — {fmtMoney(r.actualMenuPrice)}</option>
                      ))}
                    </select>
                    {recipeId && (() => {
                      const rec = recipes.find((r) => r.id === recipeId);
                      return rec ? (
                        <span className="text-[10px] text-emerald-700 font-bold whitespace-nowrap">{fmtMoney(rec.actualMenuPrice)}</span>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <div className="p-4 pb-2">
              <h3 className="font-extrabold text-slate-800 text-sm">معاينة البيانات ({matchedRows.length} صنف)</h3>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>{['الفرع', 'الفرع المرتبط', 'المنتج بالإنجليزي', 'الوصفة المرتبطة', 'الكمية', 'سعر الوحدة', 'الإيراد', 'التكلفة', 'الحالة'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {matchedRows.map((r, i) => {
                  const rec = r.matched ? recipes.find((rc) => rc.id === r.recipeId) : undefined;
                  const price = rec?.actualMenuPrice || 0;
                  const cost = rec ? calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces).totalCost : 0;
                  const branchLinked = !!branchMap[r.branch];
                  return (
                    <tr key={i} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{r.branch}</td>
                      <td className="p-2">
                        {branchLinked ? <span className="text-emerald-600 font-bold text-[10px]">✓ مربوط</span> : <span className="text-rose-500 font-bold text-[10px]">✕ غير مربوط</span>}
                      </td>
                      <td className="p-2 font-mono text-indigo-700">{r.productEn}</td>
                      <td className="p-2 font-bold text-slate-700">{r.matched ? r.recipeNameAr : <span className="text-rose-500">غير مربوط</span>}</td>
                      <td className="p-2 font-mono">{fmtNum(r.netQuantity, 0)}</td>
                      <td className="p-2 font-mono text-emerald-700">{price > 0 ? fmt(price) : '—'}</td>
                      <td className="p-2 font-mono">{fmt(price * r.netQuantity)}</td>
                      <td className="p-2 font-mono text-amber-700">{fmt(cost * r.netQuantity)}</td>
                      <td className="p-2">{r.matched && branchLinked ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-rose-500 font-bold">✕</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'dashboard' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
            {(fromDate || toDate) && <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح الفترة</Btn>}
            <div className="grow" />
            <p className="text-[11px] text-slate-500 font-bold">الفترة: {periodLabel}</p>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
                <span className="text-[11px] text-slate-500 block">{k.label}</span>
                <strong className={`font-mono text-sm block mt-1 ${k.cls}`}>{k.value}</strong>
              </div>
            ))}
          </div>

          {monthChart.length > 0 && (
            <Card className="p-4">
              <h3 className="font-extrabold text-slate-800 text-sm mb-3">الإيراد والتكلفة شهرياً</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => typeof v === 'number' && v > 100 ? fmtMoney(v) : `${v}%`} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="الإيراد" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="التكلفة" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="overflow-x-auto">
              <div className="p-4 pb-2">
                <h3 className="font-extrabold text-slate-800 text-sm">إجمالي الفروع — {periodLabel}</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr>{['الفرع', 'السجلات', 'الكمية', 'الإيراد', 'التكلفة', 'Food Cost %'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {branchTotals.map((g) => (
                    <tr key={g.name} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="p-2 font-bold text-slate-800">{g.name}</td>
                      <td className="p-2 font-mono">{fmtNum(g.records, 0)}</td>
                      <td className="p-2 font-mono">{fmtNum(g.qty, 0)}</td>
                      <td className="p-2 font-mono">{fmt(g.revenue)}</td>
                      <td className="p-2 font-mono text-amber-700">{fmt(g.cost)}</td>
                      <td className="p-2 font-mono font-bold text-emerald-700">{g.fcPct}%</td>
                    </tr>
                  ))}
                  {!branchTotals.length && <tr><td colSpan={6} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto">
              <div className="p-4 pb-2">
                <h3 className="font-extrabold text-slate-800 text-sm">الأصناف الأكثر مبيعاً</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr>{['الصنف', 'بالإنجليزي', 'الكمية', 'الإيراد', 'التكلفة', 'FC %'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {productTotals.slice(0, 15).map((p) => (
                    <tr key={p.nameEn} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="p-2 font-bold text-slate-800">{p.nameAr}</td>
                      <td className="p-2 font-mono text-indigo-600 text-[10px]">{p.nameEn}</td>
                      <td className="p-2 font-mono">{fmtNum(p.qty, 0)}</td>
                      <td className="p-2 font-mono">{fmt(p.revenue)}</td>
                      <td className="p-2 font-mono text-amber-700">{fmt(p.cost)}</td>
                      <td className="p-2 font-mono font-bold text-emerald-700">{p.fcPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}

      {tab === 'records' && (
        <>
          <Card className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">سجل مبيعات فودكس ({filteredRecords.length})</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} max-w-[150px]`} title="من تاريخ" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} max-w-[150px]`} title="إلى تاريخ" />
              <Field label="بحث">
                <input value={recSearch} onChange={(e) => setRecSearch(e.target.value)} placeholder="فرع أو تاريخ..." className={`${inputCls} max-w-xs`} />
              </Field>
              {(fromDate || toDate) && <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح الفترة</Btn>}
            </div>
          </Card>
          <ViewToolbar filename="مبيعات_فودكس" sheets={excelSheets} />

          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>{['التاريخ', 'الفرع', 'النوع', 'الأصناف', 'الكمية', 'الإيراد', 'التكلفة', 'FC %', 'إجراءات'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="p-2 font-mono whitespace-nowrap">{r.date}</td>
                    <td className="p-2 font-bold text-slate-800">{r.branchName}</td>
                    <td className="p-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.type === 'batch' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.type === 'batch' ? 'مبيعات مجمعة' : 'توصيل'}
                      </span>
                    </td>
                    <td className="p-2 font-mono">{r.items.length}</td>
                    <td className="p-2 font-mono">{fmtNum(r.items.reduce((s, it) => s + it.quantitySold, 0), 0)}</td>
                    <td className="p-2 font-mono">{fmt(r.revenue)}</td>
                    <td className="p-2 font-mono text-amber-700">{fmt(r.cost)}</td>
                    <td className="p-2 font-mono font-bold text-emerald-700">{round2(r.fcPct)}%</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button onClick={() => deleteRecord(r.id, r.type)} className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRecords.length && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا توجد سجلات</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
};

export default FoodicsIntegrationView;
