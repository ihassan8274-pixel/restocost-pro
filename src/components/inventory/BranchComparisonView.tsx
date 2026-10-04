import React, { useMemo, useState } from 'react';
import { GitCompare, Printer, FileSpreadsheet, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

interface Cell {
  branchId: string;
  qty: number;
  min: number;
  max: number;
  fullMax: boolean;
  override: boolean;
  needsOrder: boolean;
  suggestedQty: number;
}

export const BranchComparisonView: React.FC = () => {
  const {
    branches, rawMaterials, visibleBranchIds, inventory,
    getStockLevelsFor, getBranchName, getAverageUnitCost,
  } = useApp();

  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const rows = useMemo(() => {
    return rawMaterials
      .filter((m) => m.isActive)
      .map((m) => {
        const cells: Cell[] = visibleBranches.map((b) => {
          const lv = getStockLevelsFor(m.id, b.id);
          const qty = inventory.filter((i) => i.branchId === b.id && i.rawMaterialId === m.id).reduce((s, i) => s + i.quantity, 0);
          const needsOrder = lv.alwaysOrderFullMax ? true : lv.minStockLevel > 0 && qty <= lv.minStockLevel;
          const suggestedQty = !needsOrder ? 0 : lv.alwaysOrderFullMax ? Math.max(0, lv.maxStockLevel) : Math.max(0, lv.maxStockLevel - qty);
          return { branchId: b.id, qty, min: lv.minStockLevel, max: lv.maxStockLevel, fullMax: lv.alwaysOrderFullMax, override: lv.isOverride, needsOrder, suggestedQty };
        });
        const totalSuggested = cells.reduce((s, c) => s + c.suggestedQty, 0);
        return {
          mat: m, cells, totalSuggested,
          value: totalSuggested * getAverageUnitCost(m.id),
          anyNeed: cells.some((c) => c.needsOrder),
          anyCustom: cells.some((c) => c.override || c.fullMax),
        };
      })
      .filter((r) => showAll || r.anyNeed)
      .filter((r) => !search || r.mat.nameAr.includes(search) || r.mat.code.includes(search.toUpperCase()) || r.mat.nameEn.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => Number(b.anyNeed) - Number(a.anyNeed) || b.value - a.value || a.mat.nameAr.localeCompare(b.mat.nameAr));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMaterials, visibleBranches, inventory, getStockLevelsFor, search, showAll]);

  // صفوف مسطّحة (فرع × صنف) للتقرير المطبوع والتصدير
  const flatRows = useMemo(() => rows.flatMap((r) =>
    r.cells.filter((c) => c.needsOrder).map((c) => ({
      branch: getBranchName(c.branchId), code: r.mat.code, name: r.mat.nameAr, unit: r.mat.unit,
      qty: c.qty, min: c.min, max: c.max, suggested: c.suggestedQty,
      status: c.fullMax ? 'طلب دوري كامل' : 'تحت الحد الأدنى',
      value: c.suggestedQty * getAverageUnitCost(r.mat.id),
    })),
  ), [rows, getBranchName, getAverageUnitCost]);

  const totalValue = flatRows.reduce((s, r) => s + r.value, 0);
  const customCount = rows.filter((r) => r.anyCustom).length;

  const exportCsv = () => downloadCSV('مقارنة_الفروع_حدود_المخزون.csv',
    ['الفرع', 'الكود', 'الصنف', 'الوحدة', 'الرصيد', 'الحد الأدنى', 'الحد الأقصى', 'الحالة', 'المطلوب طلبه', 'القيمة'],
    flatRows.map((r) => [r.branch, r.code, r.name, r.unit, fmt(r.qty), fmt(r.min), fmt(r.max), r.status, fmt(r.suggested), fmtMoney(r.value)]));

  const printReport = () => openPrintWindow({
    title: 'تقرير مقارنة الفروع — حدود المخزون',
    subtitle: `الأصناف التي تحتاج طلباً حسب حدود كل فرع — ${visibleBranches.length} فرع`,
    meta: [
      ['عدد الفروع', `${visibleBranches.length}`],
      ['أصناف تحتاج طلباً', `${flatRows.length}`],
      ['إجمالي قيمة الطلب المقترح', fmtMoney(totalValue)],
      ['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')],
    ],
    tables: [{
      title: 'الأصناف المحتاجة للطلب موزعة على الفروع',
      header: ['الفرع', 'الكود', 'الصنف', 'الرصيد', 'حد أدنى', 'حد أقصى', 'الحالة', 'المطلوب طلبه', 'القيمة'],
      rows: flatRows.map((r) => [r.branch, r.code, r.name, fmt(r.qty), fmt(r.min), fmt(r.max), r.status, `${fmt(r.suggested)} ${r.unit}`, fmtMoney(r.value)]),
    }],
    totals: [['إجمالي قيمة الطلب المقترح (كل الفروع)', fmtMoney(totalValue)]],
    footer: 'RestoCost ERP — تقرير مقارنة الفروع لحدود المخزون',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="مقارنة الفروع — حدود المخزون"
        subtitle="كل الفروع في شاشة واحدة: الرصيد مقابل الحد الأدنى/الأقصى المخصص لكل فرع، مع كمية الطلب المقترحة وقيمتها"
        icon={<GitCompare className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <Btn onClick={exportCsv}><FileSpreadsheet className="w-4 h-4" /> تصدير CSV</Btn>
          <Btn tone="dark" onClick={printReport}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">الفروع المعروضة</span>
          <strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{visibleBranches.length}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">حالات تحتاج طلباً</span>
          <strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{flatRows.length}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف بحدود مخصصة</span>
          <strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{customCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة الطلب المقترح (كل الفروع)</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalValue)}</strong>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-56'} placeholder="اسم الصنف أو الكود" />
          </div>
        </Field>
        <button onClick={() => setShowAll((v) => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition-colors ${showAll ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          {showAll ? 'إظهار المحتاج للطلب فقط' : 'إظهار كل الأصناف'}
        </button>
        <span className="text-[10px] text-slate-400 font-bold mr-auto">خلية كل فرع تعرض: الرصيد — وكمية الطلب المقترحة عند الحاجة</span>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="p-3">الكود</th><th className="p-3">الصنف</th><th className="p-3">الوحدة</th>
                {visibleBranches.map((b) => <th key={b.id} className="p-3 bg-indigo-50/60">{b.nameAr}</th>)}
                <th className="p-3 bg-emerald-50">المطلوب (كل الفروع)</th><th className="p-3">القيمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.mat.id} className={`hover:bg-slate-50 ${r.anyNeed ? '' : 'opacity-70'}`}>
                  <td className="tnum text-left p-3 text-indigo-700">{r.mat.code}</td>
                  <td className="p-3 font-bold text-slate-900">
                    {r.mat.nameAr}
                    {r.anyCustom && <span className="ml-1 text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">حدود مخصصة</span>}
                  </td>
                  <td className="p-3 text-slate-500">{r.mat.unit}</td>
                  {r.cells.map((c) => (
                    <td key={c.branchId} className={`p-2 text-center align-top ${c.needsOrder ? 'bg-rose-50/60' : ''}`}
                      title={`${getBranchName(c.branchId)} — الرصيد ${fmt(c.qty)} / أدنى ${fmt(c.min)} / أقصى ${fmt(c.max)}`}>
                      <div className={`font-mono font-extrabold ${!c.needsOrder ? 'text-emerald-600' : c.fullMax ? 'text-amber-600' : 'text-rose-600'}`}>
                        {fmt(c.qty)}
                      </div>
                      {c.needsOrder && (
                        <div className="text-[9px] font-bold text-slate-500">
                          {c.fullMax ? 'طلب كامل' : 'تحت الأدنى'} · اطلب {fmt(c.suggestedQty)}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="tnum text-left p-3 font-extrabold text-indigo-700 bg-emerald-50/40">{r.totalSuggested > 0 ? `${fmt(r.totalSuggested)} ${r.mat.unit}` : '—'}</td>
                  <td className="tnum text-left p-3 text-slate-600">{r.totalSuggested > 0 ? fmtMoney(r.value) : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={3 + visibleBranches.length + 2} className="p-10 text-center text-emerald-600 font-bold">لا توجد أصناف تحت الحد الأدنى في أي فرع — كل شيء آمن</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 text-[11px] text-slate-600 space-y-1">
        <p className="font-extrabold text-slate-800">كيف تُقرأ الشاشة:</p>
        <p>• كل عمود يمثل فرعاً، وكل خلية تعرض رصيد الصنف في ذلك الفرع حسب <b>حدوده الخاصة</b> (المخصصة إن وُجدت وإلا الافتراضي العام).</p>
        <p>• <b>أحمر:</b> تحت الحد الأدنى — الكمية المقترحة = (الحد الأقصى − الرصيد). <b>كهرماني:</b> صنف «طلب كامل» مستثنى — يُطلب كامل الحد الأقصى. <b>أخضر:</b> آمن.</p>
        <p>• استخدم «طباعة التقرير» أو «تصدير CSV» للحصول على قائمة مفصلة بكل فرع وصنف يحتاج طلباً.</p>
      </Card>
    </div>
  );
};
