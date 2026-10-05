import React, { useMemo, useState } from 'react';
import { ShieldAlert, CalendarRange, Search, Printer, Gauge } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, allCategoryLabels } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface CoverRow {
  id: string;
  code: string;
  nameAr: string;
  unit: string;
  category: string;
  stock: number;
  avgDaily: number;
  days: number; // Infinity when no consumption
  stockValue: number;
  minLevel: number;
  maxLevel: number;
  status: 'critical' | 'warning' | 'healthy' | 'overstock';
}

export const StockCoverView: React.FC = () => {
  const {
    rawMaterials, inventory, recipes, posOrders, batchSalesRecords, workOrders,
    branches, visibleBranchIds, getStockLevelsFor, getAverageUnitCost,
    materialCategories,
  } = useApp();
  const [daysWindow, setDaysWindow] = useState(30);
  const [scopeBranch, setScopeBranch] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tab, setTab] = useState<'cover' | 'symbols'>('cover');

  const scopeBranches = scopeBranch === 'all' ? visibleBranchIds : visibleBranchIds.filter((id) => id === scopeBranch);

  const { consumption, stockByMat, stockValueByMat } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysWindow);
    const inWindow = (d: string) => { const t = new Date(d).getTime(); return !isNaN(t) && t >= cutoff.getTime(); };
    const usage: Record<string, number> = {};
    const addRecipeUsage = (recipeId: string, qty: number) => {
      const r = recipes.find((x) => x.id === recipeId);
      r?.ingredients.forEach((ing) => { usage[ing.rawMaterialId] = (usage[ing.rawMaterialId] || 0) + ing.quantity * qty; });
    };
    posOrders.filter((o) => scopeBranches.includes(o.branchId) && inWindow(o.date))
      .forEach((o) => o.items.forEach((i) => addRecipeUsage(i.recipeId, i.quantity)));
    batchSalesRecords.filter((b) => scopeBranches.includes(b.branchId) && inWindow(b.date))
      .forEach((b) => b.items.forEach((i) => addRecipeUsage(i.recipeId, i.quantitySold)));
    workOrders.filter((w) => w.status === 'completed' && w.rawMaterialsDeducted && inWindow(w.completionDate || w.startDate))
      .forEach((w) => addRecipeUsage(w.recipeId, w.targetQuantity));

    const stock: Record<string, number> = {};
    const stockValue: Record<string, number> = {};
    inventory.filter((i) => scopeBranches.includes(i.branchId)).forEach((i) => {
      stock[i.rawMaterialId] = (stock[i.rawMaterialId] || 0) + i.quantity;
    });
    rawMaterials.forEach((m) => {
      const qty = stock[m.id] || 0;
      stockValue[m.id] = qty * getAverageUnitCost(m.id);
    });

    return { consumption: usage, stockByMat: stock, stockValueByMat: stockValue };
  }, [recipes, posOrders, batchSalesRecords, workOrders, inventory, rawMaterials, scopeBranches, daysWindow, getAverageUnitCost]);

  const rows = useMemo(() => {
    const effLevels = (matId: string) => {
      const bids = scopeBranch === 'all' ? scopeBranches : [scopeBranch];
      let min = 0, max = 0;
      bids.forEach((bid) => {
        const lv = getStockLevelsFor(matId, bid);
        min += lv.minStockLevel;
        max += lv.maxStockLevel;
      });
      return { min, max };
    };
    const out: CoverRow[] = rawMaterials
      .filter((m) => m.isActive)
      .map((m) => {
        const consumed = consumption[m.id] || 0;
        const stock = stockByMat[m.id] || 0;
        const avgDaily = consumed / daysWindow;
        const days = avgDaily > 0 ? stock / avgDaily : Infinity;
        const { min, max } = effLevels(m.id);
        let status: CoverRow['status'];
        if (avgDaily > 0 && days < 3) status = 'critical';
        else if (days <= 5) status = 'warning';
        else if (avgDaily > 0 && days > 30) status = 'overstock';
        else status = 'healthy';
        return {
          id: m.id, code: m.code, nameAr: m.nameAr, unit: m.unit, category: m.category,
          stock, avgDaily, days, stockValue: stockValueByMat[m.id] || 0, minLevel: min, maxLevel: max, status,
        };
      });
    return out
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .filter((r) => categoryFilter === 'all' || r.category === categoryFilter)
      .filter((r) => !search || r.nameAr.includes(search) || r.code.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (Number.isFinite(a.days) ? a.days : 99999) - (Number.isFinite(b.days) ? b.days : 99999));
  }, [rawMaterials, consumption, stockByMat, stockValueByMat, daysWindow, getStockLevelsFor, scopeBranches, scopeBranch, statusFilter, categoryFilter, search]);

  const critical = rows.filter((r) => r.status === 'critical').length;
  const warning = rows.filter((r) => r.status === 'warning').length;
  const healthy = rows.filter((r) => r.status === 'healthy').length;
  const overstock = rows.filter((r) => r.status === 'overstock').length;
  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);

  const stats = [
    { label: 'أصناف حرجة (< 3 أيام)', value: critical, tone: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
    { label: 'تحذير (3-5 أيام)', value: warning, tone: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    { label: 'مستقرة', value: healthy, tone: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'زيادة (> 30 يوم)', value: overstock, tone: 'text-brand-600', bg: 'bg-brand-50 border-brand-200' },
  ];

  const STATUS_LABEL: Record<CoverRow['status'], string> = { critical: 'حرج', warning: 'تحذير', healthy: 'مستقر', overstock: 'زيادة' };
  const STATUS_TONE: Record<CoverRow['status'], string> = {
    critical: 'bg-rose-100 text-rose-700',
    warning: 'bg-amber-100 text-amber-700',
    healthy: 'bg-emerald-100 text-emerald-700',
    overstock: 'bg-brand-100 text-brand-700',
  };

  const exportSheets = [{
    name: 'تغطية المخزون',
    header: ['الكود', 'الصنف', 'الوحدة', 'المخزون', 'متوسط الاستهلاك/يوم', 'تغطية (أيام)', 'قيمة المخزون', 'حد أدنى', 'حد أقصى', 'الحالة'],
    rows: rows.map((r) => [r.code, r.nameAr, r.unit, fmt(r.stock, 2), fmt(r.avgDaily, 2), Number.isFinite(r.days) ? r.days.toFixed(1) : '∞', fmt(r.stockValue, 2), r.minLevel, r.maxLevel, STATUS_LABEL[r.status]]),
  }];

  const printReport = () => {
    openPrintWindow({
      title: 'تغطية المخزون بالأيام',
      subtitle: `آخر ${daysWindow} يوم — ${scopeBranch === 'all' ? 'كل الفروع' : branches.find((b) => b.id === scopeBranch)?.nameAr || ''}`,
      meta: [
        ['حرجة', `${critical}`], ['تحذير', `${warning}`], ['زيادة', `${overstock}`], ['قيمة المخزون', `${fmtMoney(totalValue)}`],
      ],
      tables: [{
        title: 'مصفوفة التغطية',
        header: ['الكود', 'الصنف', 'المخزون', 'متوسط/يوم', 'تغطية (أيام)', 'الحالة'],
        rows: rows.map((r) => [r.code, r.nameAr, fmt(r.stock, 2), fmt(r.avgDaily, 2), Number.isFinite(r.days) ? r.days.toFixed(1) : '∞', STATUS_LABEL[r.status]]),
      }],
      totals: [['إجمالي قيمة المخزون المغطى', `${fmtMoney(totalValue)}`]],
      footer: 'تغطية المخزون = الرصيد ÷ متوسط الاستهلاك اليومي — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تغطية المخزون بالأيام" subtitle="كم يوماً من الاستهلاك المتبقي لكل صنف بناءً على متوسط الاستهلاك اليومي الفعلي من المبيعات والإنتاج" icon={<Gauge className="w-6 h-6 text-emerald-600" />}
        actions={<>
          <ViewToolbar filename="تغطية المخزون" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('تغطية_المخزون.csv', exportSheets[0].header, exportSheets[0].rows)}><CalendarRange className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="نافذة الاستهلاك (أيام)">
          <input type="number" min={1} max={365} value={daysWindow} onChange={(e) => setDaysWindow(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))} className={inputCls + ' !w-28'} />
        </Field>
        <Field label="الفرع">
          <select value={scopeBranch} onChange={(e) => setScopeBranch(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الفروع</option>
            {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <Field label="التصنيف">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls + ' !w-40'}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(allCategoryLabels(materialCategories)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="الحالة">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls + ' !w-28'}>
            <option value="all">الكل</option>
            <option value="critical">حرج</option>
            <option value="warning">تحذير</option>
            <option value="healthy">مستقر</option>
            <option value="overstock">زيادة</option>
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-48'} placeholder="اسم الصنف أو الكود" />
          </div>
        </Field>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`p-4 rounded-xl border shadow-xs ${s.bg}`}>
            <span className="text-slate-500 text-[11px] block">{s.label}</span>
            <strong className={`text-lg font-extrabold font-mono block mt-1 ${s.tone}`}>{s.value}</strong>
          </div>
        ))}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة المخزون المغطى</span>
          <strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmtMoney(totalValue)}</strong>
        </div>
      </div>

      <TabBar tabs={[{ id: 'cover', label: 'مصفوفة التغطية' }, { id: 'symbols', label: 'توضيح المؤشرات' }]} active={tab} onChange={(id) => setTab(id as 'cover' | 'symbols')} />

      {tab === 'cover' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">الأيام المتبقية من التغطية لكل صنف</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">الكود</th>
                  <th className="text-right p-2 font-bold">الصنف</th>
                  <th className="text-right p-2 font-bold">المخزون</th>
                  <th className="text-right p-2 font-bold">متوسط/يوم</th>
                  <th className="text-right p-2 font-bold">تغطية (أيام)</th>
                  <th className="text-right p-2 font-bold">قيمة المخزون</th>
                  <th className="text-right p-2 font-bold">حد أدنى</th>
                  <th className="text-right p-2 font-bold">حد أقصى</th>
                  <th className="text-right p-2 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="tnum text-left p-2 font-bold text-brand-700">{r.code}</td>
                    <td className="p-2 font-bold text-slate-800">{r.nameAr}</td>
                    <td className="tnum text-left p-2 text-slate-800">{fmt(r.stock, 2)} {r.unit}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(r.avgDaily, 2)}</td>
                    <td className={`p-2 font-mono font-extrabold ${r.status === 'critical' ? 'text-rose-600' : r.status === 'warning' ? 'text-amber-600' : r.status === 'overstock' ? 'text-brand-600' : 'text-emerald-700'}`}>{Number.isFinite(r.days) ? r.days.toFixed(1) : '∞'}</td>
                    <td className="tnum text-left p-2 text-slate-600">{fmtMoney(r.stockValue)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(r.minLevel, 2)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(r.maxLevel, 2)}</td>
                    <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف مطابقة للفلاتر</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'symbols' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">دليل قراءة المؤشرات</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div><strong className="text-rose-700 block mb-1">حرج (أقل من 3 أيام)</strong><span className="text-slate-600">المخزون سيكفيك أقل من 3 أيام وفق متوسط الاستهلاك الحالي. توصية فورية بالشراء أو التحويل من فرع آخر.</span></div>
            </div>
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <CalendarRange className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div><strong className="text-amber-700 block mb-1">تحذير (3 إلى 5 أيام)</strong><span className="text-slate-600">اقترب من نقطة إعادة الطلب. رتّب أمر شراء خلال الأيام القادمة.</span></div>
            </div>
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <Gauge className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div><strong className="text-emerald-700 block mb-1">مستقر (5 إلى 30 يوم)</strong><span className="text-slate-600">التغطية كافية ضمن النطاق الطبيعي. لا يلزم إجراء.</span></div>
            </div>
            <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-xl p-4">
              <ShieldAlert className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
              <div><strong className="text-brand-700 block mb-1">زيادة (أكثر من 30 يوم)</strong><span className="text-slate-600">مخزون يزيد عن تغطية شهر. راجع دورة الشراء وأجل الكميات الزائدة (تقليل تجميد رأس المال).</span></div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
