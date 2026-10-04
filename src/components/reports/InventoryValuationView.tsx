import React, { useMemo, useState } from 'react';
import { Layers, Scale, Search, ArrowRightLeft, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, TabBar, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, allCategoryLabels } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface LayerRow { date: string; ref: string; qty: number; price: number; }

export const InventoryValuationView: React.FC = () => {
  const { rawMaterials, branches, inventory, grnNotes, getAverageUnitCost, materialCategories } = useApp();
  const [tab, setTab] = useState<'valuation' | 'layers'>('valuation');
  const [branchFilter, setBranchFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [layerItem, setLayerItem] = useState(rawMaterials[0]?.id || '');

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const inBranch = (b: string) => branchFilter === 'all' || b === branchFilter;

  const filteredMaterials = useMemo(() => rawMaterials.filter((m) =>
    (categoryFilter === 'all' || m.category === categoryFilter) &&
    (!search || m.nameAr.includes(search) || m.code.toLowerCase().includes(search.toLowerCase()))
  ), [rawMaterials, categoryFilter, search]);

  const valuation = useMemo(() => filteredMaterials.map((m) => {
    let currentQty = 0;
    inventory.forEach((rec) => { if (rec.rawMaterialId === m.id && inBranch(rec.branchId)) currentQty += rec.quantity; });
    const allLayers: LayerRow[] = [];
    grnNotes.forEach((g) => {
      if (g.status === 'rejected' || !inBranch(g.branchId) || !inDate(g.date)) return;
      g.items.forEach((i) => { if (i.rawMaterialId === m.id) allLayers.push({ date: g.date, ref: g.grnNumber, qty: i.quantityReceived, price: i.unitPrice }); });
    });
    allLayers.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
    const totalReceived = allLayers.reduce((s, l) => s + l.qty, 0);
    const avgCost = getAverageUnitCost(m.id);
    const avgValue = currentQty * avgCost;
    let rem = currentQty, fifoValue = 0;
    const usedLayers: LayerRow[] = [];
    for (const l of allLayers) {
      if (rem <= 0) break;
      const take = Math.min(rem, l.qty);
      fifoValue += take * l.price;
      usedLayers.push({ ...l, qty: take });
      rem -= take;
    }
    if (rem > 0) {
      const fallback = totalReceived > 0 ? allLayers.reduce((s, l) => s + l.qty * l.price, 0) / totalReceived : avgCost;
      fifoValue += rem * fallback;
    }
    const fifoCost = currentQty > 0 ? fifoValue / currentQty : 0;
    return { m, currentQty, totalReceived, avgCost, avgValue, fifoCost, fifoValue, diff: fifoValue - avgValue, layers: usedLayers };
  }), [filteredMaterials, branches, inventory, grnNotes, branchFilter, fromDate, toDate, getAverageUnitCost]);

  const totalFifo = valuation.reduce((s, r) => s + r.fifoValue, 0);
  const totalAvg = valuation.reduce((s, r) => s + r.avgValue, 0);

  const layerDetail = useMemo(() => {
    const item = rawMaterials.find((m) => m.id === layerItem);
    if (!item) return { item: null as null | typeof item, all: [] as LayerRow[] };
    const all: LayerRow[] = [];
    grnNotes.forEach((g) => {
      if (g.status === 'rejected') return;
      if (branchFilter !== 'all' && g.branchId !== branchFilter) return;
      if (!inDate(g.date)) return;
      g.items.forEach((i) => { if (i.rawMaterialId === item.id) all.push({ date: g.date, ref: g.grnNumber, qty: i.quantityReceived, price: i.unitPrice }); });
    });
    all.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
    return { item, all };
  }, [rawMaterials, grnNotes, layerItem, branchFilter, fromDate, toDate]);

  const exportSheets = [
    { name: 'تقييم المخزون (FIFO)', header: ['الكود', 'الصنف', 'الوحدة', 'الرصيد', 'كمية المستلم', 'متوسط التكلفة', 'القيمة بالمتوسط', 'تكلفة FIFO', 'القيمة FIFO', 'الأثر (FIFO − متوسط)'], rows: valuation.map((r) => [r.m.code, r.m.nameAr, r.m.unit, r.currentQty, r.totalReceived, r.avgCost, r.avgValue, r.fifoCost, r.fifoValue, r.diff]) },
  ];

  const printReport = () => {
    openPrintWindow({
      title: 'تقييم المخزون بطريقة FIFO',
      subtitle: 'قيمة الأرصدة الحالية بمقارنة FIFO مع المتوسط',
      meta: [
        ['الفترة', fromDate || toDate ? `${fromDate || '...'} إلى ${toDate || '...'}` : 'كامل'],
        ['الأصناف', `${valuation.length}`],
        ['قيمة FIFO', `${fmtMoney(totalFifo)}`],
        ['قيمة المتوسط', `${fmtMoney(totalAvg)}`],
        ['الأثر', `${fmtMoney(totalFifo - totalAvg)}`],
      ],
      tables: [
        {
          title: 'أرصدة وتقييم المخزون',
          header: ['الكود', 'الصنف', 'الوحدة', 'الرصيد الحالي', 'متوسط التكلفة', 'القيمة (متوسط)', 'تكلفة FIFO', 'القيمة (FIFO)', 'الأثر'],
          rows: valuation.map((r) => [r.m.code, r.m.nameAr, r.m.unit, fmt(r.currentQty, 2), fmt(r.avgCost, 2), fmt(r.avgValue, 2), fmt(r.fifoCost, 2), fmt(r.fifoValue, 2), fmt(r.diff, 2)]),
        },
      ],
      totals: [
        ['القيمة الإجمالية (FIFO)', `${fmtMoney(totalFifo)}`],
        ['القيمة الإجمالية (متوسط)', `${fmtMoney(totalAvg)}`],
        ['الأثر (FIFO − متوسط)', `${fmtMoney(totalFifo - totalAvg)}`],
      ],
      footer: 'تُستهلك طبقات الاستلام حسب التاريخ (الأقدم أولاً) — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تقييم المخزون بطريقة FIFO" subtitle="قيمة المخزون الحالي عند احتساب الصرف من أقدم طبقات الاستلام أولاً، مقارنة بالطريقة المتوسطة" icon={<Layers className="w-6 h-6 text-emerald-300" />}
        actions={<>
          <ViewToolbar filename="تقييم المخزون FIFO" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة التقييم</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('تقييم_المخزون_FIFO.csv', exportSheets[0].header, exportSheets[0].rows)}><ArrowRightLeft className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <Field label="استلامات من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
        <Field label="التصنيف">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputCls + ' !w-44'}>
            <option value="all">كل التصنيفات</option>
            {Object.entries(allCategoryLabels(materialCategories)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-48'} placeholder="اسم الصنف أو الكود" />
          </div>
        </Field>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المخزون (FIFO)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalFifo)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المخزون (متوسط)</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalAvg)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الأثر بين الطريقتين</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${totalFifo - totalAvg < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtMoney(totalFifo - totalAvg)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الأصناف المقيّمة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{valuation.length}</strong></div>
      </div>

      <TabBar tabs={[{ id: 'valuation', label: 'جدول التقييم' }, { id: 'layers', label: 'طبقات الاستلام لصنف' }]} active={tab} onChange={(id) => setTab(id as 'valuation' | 'layers')} />

      {tab === 'valuation' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">قيمة المخزون الحالي — FIFO مقابل المتوسط</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">الكود</th>
                  <th className="text-right p-2 font-bold">الصنف</th>
                  <th className="text-right p-2 font-bold">الرصيد الحالي</th>
                  <th className="text-right p-2 font-bold">كمية المستلم</th>
                  <th className="text-right p-2 font-bold">متوسط التكلفة</th>
                  <th className="text-right p-2 font-bold">القيمة (متوسط)</th>
                  <th className="text-right p-2 font-bold">تكلفة FIFO</th>
                  <th className="text-right p-2 font-bold">القيمة (FIFO)</th>
                  <th className="text-right p-2 font-bold">الأثر</th>
                </tr>
              </thead>
              <tbody>
                {valuation.map((r) => (
                  <tr key={r.m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="tnum text-left p-2 font-bold text-indigo-700">{r.m.code}</td>
                    <td className="p-2 font-bold text-slate-800">{r.m.nameAr}</td>
                    <td className="tnum text-left p-2 text-slate-800">{fmt(r.currentQty, 2)} {r.m.unit}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(r.totalReceived, 2)}</td>
                    <td className="tnum text-left p-2 text-indigo-700">{fmt(r.avgCost, 2)}</td>
                    <td className="tnum text-left p-2 text-indigo-700">{fmt(r.avgValue, 2)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmt(r.fifoCost, 2)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmt(r.fifoValue, 2)}</td>
                    <td className={`p-2 font-mono font-bold ${r.diff < -0.001 ? 'text-rose-600' : r.diff > 0.001 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(r.diff, 2)}</td>
                  </tr>
                ))}
                {valuation.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف مطابقة للفلاتر</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-bold">
            <Scale className="w-3.5 h-3.5 text-emerald-500" /> تُستهلك طبقات الاستلام حسب التاريخ (الأقدم أولاً)؛ وعند عدم كفاية الاستلامات يُقيَّم المتبقي بمتوسط تكلفة الاستلامات
            <Layers className="w-3.5 h-3.5 text-indigo-500 mr-2" /> الأثر الإيجابي يعني أن متوسط التكلفة أعلى من FIFO
          </div>
        </Card>
      )}

      {tab === 'layers' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
            <Field label="الصنف">
              <AutocompleteSelect
                value={layerItem}
                onChange={(val) => setLayerItem(val)}
                options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: `${m.code} — ${m.nameAr}`, code: m.code }))}
                getOptionLabel={(opt) => opt.label}
                placeholder="— اختر مادة خام —"
                className="w-full"
              />
            </Field>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">{layerDetail.item ? `طبقات استلام: ${layerDetail.item.nameAr} (${layerDetail.item.code})` : 'اختر صنفاً'}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                    <th className="text-right p-2 font-bold">التاريخ</th>
                    <th className="text-right p-2 font-bold">المرجع GRN</th>
                    <th className="text-right p-2 font-bold">الكمية</th>
                    <th className="text-right p-2 font-bold">سعر الوحدة</th>
                    <th className="text-right p-2 font-bold">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {layerDetail.all.map((l, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="tnum text-left p-2 text-slate-600">{l.date}</td>
                      <td className="p-2 font-bold text-slate-700">{l.ref}</td>
                      <td className="tnum text-left p-2 font-bold text-slate-800">{fmt(l.qty, 2)}</td>
                      <td className="tnum text-left p-2 text-indigo-700">{fmt(l.price, 2)}</td>
                      <td className="tnum text-left p-2 text-slate-700">{fmt(l.qty * l.price, 2)}</td>
                    </tr>
                  ))}
                  {layerDetail.all.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">لا توجد استلامات لهذا الصنف في النطاق المحدد</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};