import React, { useMemo, useState } from 'react';
import { AlertTriangle, Printer, FileSpreadsheet, PackageX, ShieldCheck, ArrowRightLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal } from '../ui';
import { fmt, fmtMoney, downloadCSV, categoryLabel } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

type SevFilter = 'all' | 'critical' | 'low';

export const LowStockAlertsView: React.FC = () => {
  const { inventory, rawMaterials, branches, visibleBranchIds, getBranchName, getBranchAverageUnitCost, getAverageUnitCost, addStockTransfer, getStockLevelsFor, materialCategories } = useApp();
  const [branchFilter, setBranchFilter] = useState('all');
  const [sevFilter, setSevFilter] = useState<SevFilter>('all');
  const [showTransfer, setShowTransfer] = useState<null | { matId: string; branchId: string; shortage: number }>(null);
  const [transferQty, setTransferQty] = useState(0);

  const scopedInv = useMemo(() => inventory.filter((i) => visibleBranchIds.includes(i.branchId)), [inventory, visibleBranchIds]);

  // تجميع الكميات لكل خامة في كل فرع — حسب حدود الفرع الفعلية (المخصصة أو الافتراضي العام)
  const alerts = useMemo(() => {
    const rows = scopedInv
      .map((i) => {
        const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
        if (!mat || !mat.isActive) return null;
        const levels = getStockLevelsFor(mat.id, i.branchId);
        const min = levels.minStockLevel;
        const max = levels.maxStockLevel;
        const fullMax = levels.alwaysOrderFullMax; // صنف مستثنى: يُطلب كامل الحد الأقصى دون النظر للرصيد
        const belowMin = min > 0 && i.quantity <= min;
        if (!fullMax && !belowMin) return null;
        const coveragePct = min > 0 ? Math.round((i.quantity / min) * 100) : 100;
        const suggestedQty = fullMax ? Math.max(0, max) : Math.max(0, max - i.quantity);
        const shortage = fullMax ? suggestedQty : Math.max(0, min - i.quantity);
        const severity: 'critical' | 'low' = i.quantity <= 0 || (belowMin && coveragePct <= 30) ? 'critical' : 'low';
        return {
          id: i.id,
          matId: mat.id,
          code: mat.code,
          nameAr: mat.nameAr,
          category: mat.category,
          unit: mat.unit,
          branchId: i.branchId,
          quantity: i.quantity,
          minStockLevel: min,
          maxStockLevel: max,
          fullMax,
          belowMin,
          shortage,
          suggestedQty,
          coveragePct,
          severity,
          reorderValue: suggestedQty * getAverageUnitCost(mat.id),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && (sevFilter === 'all' || r.severity === sevFilter))
      .filter((r) => branchFilter === 'all' || r.branchId === branchFilter)
      .sort((a, b) => a.coveragePct - b.coveragePct);
    return rows;
  }, [scopedInv, rawMaterials, sevFilter, branchFilter, getAverageUnitCost, getStockLevelsFor]);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const zeroCount = alerts.filter((a) => a.quantity <= 0).length;
  const totalReorderValue = alerts.reduce((s, a) => s + a.reorderValue, 0);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const printAlerts = () => openPrintWindow({
    title: 'تقرير تنبيهات نقص المخزون',
    subtitle: 'الأصناف تحت الحد الأدنى — حسب حدود كل فرع',
    meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['عدد الأصناف', `${alerts.length}`], ['حالات حرجة', `${criticalCount}`]],
    tables: [{
      title: 'تنبيهات نقص المخزون',
      header: ['الكود', 'الصنف', 'التصنيف', 'الفرع', 'الرصيد', 'الحد الأدنى', 'المطلوب طلبه', 'التغطية%', 'الحالة'],
      rows: alerts.map((a) => [a.code, a.nameAr, categoryLabel(a.category, materialCategories), getBranchName(a.branchId), fmt(a.quantity), fmt(a.minStockLevel), fmt(a.suggestedQty), `${a.coveragePct}%`, a.fullMax ? 'طلب دوري كامل' : a.severity === 'critical' ? 'حرجة' : 'منخفض']),
    }],
    totals: [['إجمالي قيمة إعادة التوريد المقترحة', fmtMoney(totalReorderValue)]],
    footer: 'RestoCost ERP — تقرير تنبيهات نقص المخزون',
  });

  const exportCsv = () => {
    downloadCSV('تنبيهات_نقص_المخزون.csv',
      ['الكود', 'الصنف', 'التصنيف', 'الفرع', 'الرصيد', 'الحد الأدنى', 'المطلوب طلبه', 'التغطية %', 'الحالة', 'قيمة إعادة التوريد'],
      alerts.map((a) => [a.code, a.nameAr, categoryLabel(a.category, materialCategories), getBranchName(a.branchId), fmt(a.quantity), fmt(a.minStockLevel), fmt(a.suggestedQty), a.coveragePct, a.fullMax ? 'طلب دوري كامل' : a.severity === 'critical' ? 'حرجة' : 'منخفض', fmtMoney(a.reorderValue)]));
  };

  const submitTransfer = () => {
    if (!showTransfer || transferQty <= 0) return;
    const mat = rawMaterials.find((m) => m.id === showTransfer.matId);
    if (!mat) return;
    addStockTransfer({
      fromBranchId: 'b-ck',
      toBranchId: showTransfer.branchId,
      items: [{ itemType: 'raw_material' as const, rawMaterialId: mat.id, itemName: mat.nameAr, quantity: transferQty, unit: mat.unit, unitCost: getBranchAverageUnitCost('b-ck', mat.id) }],
      requestedBy: 'شاشة تنبيهات النقص',
    });
    setShowTransfer(null);
    setTransferQty(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تنبيهات نقص المخزون"
        subtitle="شاشة مستقلة لمتابعة جميع الأصناف التي وصلت أو نزلت عن الحد الأدنى عبر الفروع — مع اقتراح إعادة التوريد والتحويل السريع"
        icon={<AlertTriangle className="w-6 h-6 text-rose-300" />}
        actions={<>
          <Btn onClick={exportCsv}><FileSpreadsheet className="w-4 h-4" /> تصدير Excel/CSV</Btn>
          <Btn tone="dark" onClick={printAlerts}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
        </>} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف تحت الحد الأدنى</span>
          <strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{alerts.length} صنف</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">حالات حرجة (تغطية ≤30%)</span>
          <strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{criticalCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-300 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف نافدة (صفر رصيد)</span>
          <strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1 flex items-center gap-1"><PackageX className="w-4 h-4" />{zeroCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة إعادة التوريد المقترحة</span>
          <strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmtMoney(totalReorderValue)}</strong>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-56'}>
            <option value="all">جميع الفروع</option>
            {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <Field label="مستوى الخطورة">
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as SevFilter)} className={inputCls + ' !w-44'}>
            <option value="all">الكل</option>
            <option value="critical">حرجة فقط</option>
            <option value="low">منخفضة فقط</option>
          </select>
        </Field>
      </Card>

      {/* Alerts table */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-rose-50/50">
          <SectionHeader title="قائمة التنبيهات" subtitle={`مرتبة من الأقل تغطية إلى الأكثر — ${alerts.length} صنف`} icon={<AlertTriangle className="w-5 h-5 text-rose-500" />} />
        </div>
        {alerts.length === 0 ? (
          <Card className="m-4 p-8 text-center text-emerald-600 font-bold border-emerald-200 bg-emerald-50">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2" />
            لا توجد تنبيهات نقص مخزون — جميع الأصناف فوق الحد الأدنى
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">الكود</th><th className="p-3">الصنف</th><th className="p-3">التصنيف</th><th className="p-3">الفرع</th>
                  <th className="p-3">الرصيد الحالي</th><th className="p-3">الحد الأدنى</th><th className="p-3">المطلوب طلبه</th>
                  <th className="p-3">التغطية</th><th className="p-3">الحالة</th><th className="p-3">قيمة التوريد</th><th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((a) => (
                  <tr key={a.id} className={`hover:bg-slate-50 ${a.quantity <= 0 ? 'bg-rose-50' : a.severity === 'critical' ? 'bg-amber-50/40' : ''}`}>
                    <td className="p-3 font-mono text-indigo-700">{a.code}</td>
                    <td className="p-3 font-bold text-slate-900">{a.nameAr}</td>
                    <td className="p-3 text-slate-600">{categoryLabel(a.category, materialCategories)}</td>
                    <td className="p-3 text-slate-600">{getBranchName(a.branchId)}</td>
                    <td className="p-3 font-mono font-extrabold text-slate-900">{fmt(a.quantity)} <span className="text-[10px] text-slate-400">{a.unit}</span></td>
                    <td className="p-3 font-mono text-slate-600">{fmt(a.minStockLevel)}</td>
                    <td className="p-3 font-mono font-extrabold text-rose-600">{fmt(a.suggestedQty)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${a.coveragePct <= 0 ? 'bg-rose-700' : a.coveragePct <= 30 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(Math.max(a.coveragePct, 3), 100)}%` }} />
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{a.coveragePct}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {a.quantity <= 0
                        ? <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">نافد</span>
                        : a.fullMax
                          ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">طلب دوري كامل</span>
                          : a.severity === 'critical'
                            ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">حرجة</span>
                            : <span className="text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">منخفض</span>}
                    </td>
                    <td className="p-3 font-mono text-indigo-700">{fmtMoney(a.reorderValue)}</td>
                    <td className="p-3">
                      <Btn tone="ghost" className="!py-1 !px-2 text-[11px]" onClick={() => { setShowTransfer({ matId: a.matId, branchId: a.branchId, shortage: a.suggestedQty }); setTransferQty(a.suggestedQty); }}>
                        <ArrowRightLeft className="w-3.5 h-3.5" /> طلب تحويل من المركزي
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quick transfer modal */}
      <Modal open={!!showTransfer} onClose={() => setShowTransfer(null)} title={`طلب تحويل سريع — ${rawMaterials.find((m) => m.id === showTransfer?.matId)?.nameAr || ''}`} wide>
        <form onSubmit={(e) => { e.preventDefault(); submitTransfer(); }} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="من"><input readOnly value="المطبخ المركزي والمستودع العام" className={inputCls + ' bg-slate-50'} /></Field>
            <Field label="إلى"><input readOnly value={showTransfer ? getBranchName(showTransfer.branchId) : ''} className={inputCls + ' bg-slate-50'} /></Field>
          </div>
          <Field label={`الكمية المطلوبة (المقترح: ${showTransfer ? fmt(showTransfer.shortage) : ''})`}>
            <input type="number" min="0" step="any" value={transferQty || ''} onChange={(e) => setTransferQty(parseFloat(e.target.value) || 0)} className={inputCls} autoFocus />
          </Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowTransfer(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">تنفيذ التحويل</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
