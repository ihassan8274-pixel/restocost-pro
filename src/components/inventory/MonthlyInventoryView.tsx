import React, { useState, useMemo } from 'react';
import { ClipboardCheck, Lock, Play, Save, Printer, Calculator, Trash2, Unlock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { monthLabelFor } from '../../utils/financials';
import { openPrintWindow } from '../../utils/print';
import { useAdminDelete, AdminDeleteModal } from '../../hooks';
import { MonthlyInventoryPeriod, MonthlyInventoryItem } from '../../types';

export const MonthlyInventoryView: React.FC = () => {
  const { branches, visibleBranchIds, rawMaterials, monthlyInventory, closedMonths, isMonthClosed, startMonthlyInventoryWithItems, saveMonthlyInventoryCounts, closeMonthlyInventory, deleteMonthlyInventory, reopenMonthlyInventory, getBranchName, can, addRecentDoc } = useApp();

  const [branch, setBranch] = useState(visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [active, setActive] = useState<MonthlyInventoryPeriod | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<'delete' | 'reopen' | null>(null);
  const adminDelete = useAdminDelete();

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck');
  const period = monthlyInventory.find((p) => p.branchId === branch && p.monthKey === month);
  const branchPeriods = monthlyInventory.filter((p) => p.branchId === branch).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  // خريطة كود الصنف (للترتيب حسب الكود rackو serial)
  const matCode = useMemo(() => {
    const m: Record<string, string> = {};
    rawMaterials.forEach((r) => { m[r.id] = r.code; });
    return m;
  }, [rawMaterials]);
  const sortByCode = (list: MonthlyInventoryItem[]) =>
    [...list].sort((a, b) => (matCode[a.rawMaterialId] || '').localeCompare(matCode[b.rawMaterialId] || '', undefined, { numeric: true }));

  const openActive = (p: MonthlyInventoryPeriod) => {
    setActive(p);
    const base: Record<string, string> = {};
    p.items.forEach((it) => { base[it.rawMaterialId] = String(it.countedQty); });
    setCounts(base);
  };

  const setCount = (id: string, v: string) => setCounts({ ...counts, [id]: v });

  const saveCounts = () => {
    if (!active) return;
    const record: Record<string, number> = {};
    Object.entries(counts).forEach(([k, v]) => { const n = parseFloat(v); if (!Number.isNaN(n)) record[k] = n; });
    saveMonthlyInventoryCounts(active.id, record);
    addRecentDoc({ type: 'inventory_count', title: `جرد ${monthLabelFor(active.monthKey)} — ${getBranchName(active.branchId)}`, tab: 'monthly_inventory' });
    setActive(null);
  };

  const printReport = (p: MonthlyInventoryPeriod) => {
    openPrintWindow({
      title: `تقرير جرد شهر ${monthLabelFor(p.monthKey)} — ${getBranchName(p.branchId)}`,
      subtitle: p.status === 'closed' ? 'مُقفَل' : 'قيد الجرد',
      meta: [
        ['الفرع', getBranchName(p.branchId)],
        ['الشهر', monthLabelFor(p.monthKey)],
        ['تاريخ البدء', p.createdAt],
        ['الإقفال', p.closedAt ? new Date(p.closedAt).toLocaleString('ar-SA-u-nu-latn') : '—'],
        ['أُغلق بواسطة', p.closedBy || '—'],
        ['إجمالي الانحراف', `${fmtMoney(p.totalVarianceCost)}`],
      ],
      tables: [{
        title: 'جرد الأصناف',
        header: ['#', 'الصنف', 'الوحدة', 'نظري', 'المعدود', 'الانحراف', 'التكلفة', 'الانحراف (ر.س)'],
        rows: sortByCode(p.items).filter((it) => it.varianceQty !== 0 || it.countedQty !== 0).map((it, idx) => [idx + 1, it.itemName, it.unit, it.theoreticalQty, it.countedQty, it.varianceQty, fmt(it.unitCost, 2), it.varianceCost.toFixed(2)]),
      }],
      totals: [
        ['الاستخدام النظري', `${fmtMoney(p.totalTheoreticalUsage)}`],
        ['الاستخدام الفعلي', `${fmtMoney(p.totalActualUsage)}`],
        ['فرق الاستخدام', `${fmtMoney(p.totalUsageVariance)}`],
        ['تكلفة الانحراف', `${fmtMoney(p.totalVarianceCost)}`],
      ],
      footer: 'تقرير جرد شهري صادر من RestoCost ERP',
    });
  };

  const printBranchInventoryReport = (p: MonthlyInventoryPeriod) => {
    const branchName = getBranchName(p.branchId);
    const monthLabel = monthLabelFor(p.monthKey);
    const sortedItems = sortByCode(p.items);
    const totalItems = sortedItems.length;
    const totalQty = sortedItems.reduce((s, it) => s + it.countedQty, 0);
    const totalValue = sortedItems.reduce((s, it) => s + it.countedQty * it.unitCost, 0);

    openPrintWindow({
      title: `تقرير أرصدة الفرع بعد الإقفال — ${branchName}`,
      subtitle: `الجرد الشهري لـ ${monthLabel} — تم الإقفال في ${p.closedAt ? new Date(p.closedAt).toLocaleString('ar-SA-u-nu-latn') : '—'}`,
      meta: [
        ['الفرع', branchName],
        ['الشهر', monthLabel],
        ['تاريخ الإقفال', p.closedAt ? new Date(p.closedAt).toLocaleString('ar-SA-u-nu-latn') : '—'],
        ['أُغلق بواسطة', p.closedBy || '—'],
        ['إجمالي الأصناف', totalItems.toString()],
        ['إجمالي الكمية', `${fmt(totalQty)}`],
        ['إجمالي القيمة', `${fmtMoney(totalValue)}`],
      ],
      tables: [{
        title: 'تفاصيل الأرصدة حسب الصنف',
        header: ['#', 'الصنف', 'الوحدة', 'الكمية المعدودة', 'متوسط السعر (ر.س)', 'القيمة الإجمالية (ر.س)'],
        rows: sortByCode(p.items).map((it, idx) => [
          idx + 1,
          it.itemName,
          it.unit,
          fmt(it.countedQty),
          fmt(it.unitCost, 2),
          fmtMoney(it.countedQty * it.unitCost),
        ]),
      }],
      totals: [
        ['إجمالي الأصناف', totalItems.toString()],
        ['إجمالي الكمية', `${fmt(totalQty)}`],
        ['إجمالي القيمة', `${fmtMoney(totalValue)}`],
      ],
      footer: 'تقرير أرصدة الفرع بعد إقفال الجرد الشهري — صادر من RestoCost ERP',
    });
  };

  const confirmCloseId = confirmClose ? monthlyInventory.find((p) => p.id === confirmClose) : null;

  const requestDeleteCount = (p: MonthlyInventoryPeriod) => {
    setConfirmKind('delete');
    adminDelete.requestDelete(() => { deleteMonthlyInventory(p.id); setConfirmKind(null); });
  };

  const requestReopen = (p: MonthlyInventoryPeriod) => {
    setConfirmKind('reopen');
    adminDelete.requestDelete(() => { reopenMonthlyInventory(p.id); setConfirmKind(null); });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الجرد الشهري والإقفال" subtitle="كما في Oracle Material Control — جرد نظري/فعلي، قياس انحراف، وإقفال الشهر (يمنع أي حركة على الشهر المقفَل ويحوّل الفرق للمخزون وقيد محاسبي)" icon={<ClipboardCheck className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename={`الجرد_الشهري_${month}`}
            sheets={[
              { name: 'الأجندة', header: ['الشهر', 'الفرع', 'الحالة', 'الاستخدام النظري', 'الاستخدام الفعلي', 'تكلفة الانحراف'], rows: branchPeriods.map((p) => [p.monthKey, getBranchName(p.branchId), p.status, p.totalTheoreticalUsage, p.totalActualUsage, p.totalVarianceCost]) },
              { name: 'الشهور المغلقة', header: ['الشهر'], rows: closedMonths.map((m) => [m]) },
            ]}
          />
          <Btn tone="ghost" onClick={() => openPrintWindow({ title: 'الشهور المغلقة', subtitle: 'قائمة الشهور التي أُقفلت', meta: [], tables: [{ title: 'الشهور', header: ['الشهر'], rows: closedMonths.map((m) => [monthLabelFor(m)]) }], footer: 'الأشهر المغلقة تمنع جميع الحركات عليها' })}><Printer className="w-4 h-4" /> طباعة المقفلة</Btn>
        </>} />

      <Card className="p-5">
        <SectionHeader title="بدء جرد جديد" subtitle="اختر الفرع والشهر ثم ابدأ الجرد — يُحتسب الرصيد النظري تلقائياً من (الافتتاحي + مشتريات + تحويلات واردة − تحويلات صادرة − الاستخدام النظري)" icon={<Play className="w-5 h-5 text-indigo-500" />} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label="الفرع">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <Field label="الشهر">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
          </Field>
          <div>
            {period ? (
              period.status === 'closed'
                ? <div className="px-4 py-2 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center gap-2"><Lock className="w-4 h-4" /> الشهر مقفل — لا يمكن بدء جرد جديد</div>
                : <Btn tone="ghost" disabled><Play className="w-4 h-4" /> جرد هذا الشهر قيد التنفيذ</Btn>
            ) : (
              isMonthClosed(month)
                ? <div className="px-4 py-2 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center gap-2"><Lock className="w-4 h-4" /> {monthLabelFor(month)} مقفل بالكامل</div>
                : <Btn tone="success" onClick={() => { startMonthlyInventoryWithItems(branch, month); }}><Play className="w-4 h-4" /> بدء جرد الشهر</Btn>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-xs">جرد الشهور — فرع {getBranchName(branch)}</h3>
          <div className="flex gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{monthlyInventory.length} دورة جرد</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{closedMonths.length} شهر مقفل</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الشهر</th><th className="p-3">الحالة</th><th className="p-3">الفرع</th><th className="p-3">نظري</th><th className="p-3">فعلي</th><th className="p-3">فرق الاستخدام</th><th className="p-3">تكلفة الانحراف</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchPeriods.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-slate-800">{monthLabelFor(p.monthKey)}</td>
                  <td className="p-3">{p.status === 'closed' ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1 w-fit"><Lock className="w-3 h-3" /> مقفل</span> : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">قيد الجرد</span>}</td>
                  <td className="p-3 text-slate-600">{getBranchName(p.branchId)}</td>
                  <td className="p-3 font-mono">{fmt(p.totalTheoreticalUsage)}</td>
                  <td className="p-3 font-mono">{fmt(p.totalActualUsage)}</td>
                  <td className="p-3 font-mono">{fmt(p.totalUsageVariance)}</td>
                  <td className="p-3 font-mono font-extrabold text-amber-700">{fmtMoney(p.totalVarianceCost)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => openActive(p)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إدخال الأعداد / التعديل"><Calculator className="w-4 h-4" /></button>
                      {p.status === 'counting' && <button onClick={() => setConfirmClose(p.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="إقفال الشهر"><Lock className="w-4 h-4" /></button>}
                      {p.status === 'counting' && can('delete_data') && <button onClick={() => requestDeleteCount(p)} className="p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg" title="حذف (مسموح فقط قبل الإقفال)"><Trash2 className="w-4 h-4" /></button>}
                      {p.status === 'closed' && can('delete_data') && <button onClick={() => requestReopen(p)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="فتح الفترة والتعديل"><Unlock className="w-4 h-4" /></button>}
                      <button onClick={() => printReport(p)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="طباعة التقرير"><Printer className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {branchPeriods.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد دورات جرد لهذا الفرع بعد</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={active !== null} onClose={() => setActive(null)} title={`إدخال أعداد الجرد — ${active ? monthLabelFor(active.monthKey) : ''}`} wide>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-[11px] font-bold text-indigo-800">
            عدّل الكمية المعدودة لكل صنف — الفرق بين المعدود والنظري يظهر فوراً كفرق انحراف. عند الإقفال يُحوَّل الفرق إلى المخزون مع قيد محاسبي.
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-right text-[11px] border-collapse min-w-[700px]">
              <thead>
                <tr className="sticky top-0 bg-slate-100">
                  <th className="border border-slate-300 bg-slate-100 p-2">الصنف</th>
                  <th className="border border-slate-300 bg-slate-100 p-2">الوحدة</th>
                  <th className="border border-slate-300 bg-slate-100 p-2">النظري</th>
                  <th className="border border-slate-300 bg-slate-100 p-2">المعدود</th>
                  <th className="border border-slate-300 bg-slate-100 p-2">الانحراف</th>
                  <th className="border border-slate-300 bg-slate-100 p-2">تكلفة الانحراف</th>
                </tr>
              </thead>
              <tbody>
                {sortByCode(active?.items || []).map((it) => {
                  const counted = parseFloat(counts[it.rawMaterialId] ?? String(it.countedQty));
                  const varQty = Number((counted - it.theoreticalQty).toFixed(2));
                  return (
                    <tr key={it.rawMaterialId} className={varQty !== 0 ? 'bg-amber-50/40' : ''}>
                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">{it.itemName}</td>
                      <td className="border border-slate-300 p-1.5">{it.unit}</td>
                      <td className="border border-slate-300 p-1.5 font-mono">{fmt(it.theoreticalQty)}</td>
                      <td className="border border-slate-300 p-1.5"><input type="text" inputMode="decimal" value={counts[it.rawMaterialId] ?? String(it.countedQty)} onChange={(e) => setCount(it.rawMaterialId, e.target.value)} className={inputCls + ' !p-1 w-24'} /></td>
                      <td className={`border border-slate-300 p-1.5 font-mono font-bold ${varQty === 0 ? 'text-slate-400' : varQty > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(varQty)}</td>
                      <td className="border border-slate-300 p-1.5 font-mono">{fmtMoney(varQty * it.unitCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button onClick={() => setActive(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button onClick={saveCounts} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium"><Save className="w-4 h-4 inline ml-1" /> حفظ الأعداد</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmCloseId !== null} onClose={() => setConfirmClose(null)} title={`إقفال شهر ${confirmCloseId ? monthLabelFor(confirmCloseId.monthKey) : ''}`} wide>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[11px] font-bold text-rose-800">
            <Lock className="w-4 h-4" /> بعد الإقفال: يُعدَّل المخزون بالفرق (فائض/عجز)، يُسجَّل قيد محاسبي (acc-inv مقابل acc-cogs)، ويُمنع أي حركة على هذا الشهر نهائياً.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200"><span className="text-slate-500 block text-[10px] font-bold">استخدام نظري</span><strong className="font-mono text-slate-900">{fmtMoney(confirmCloseId?.totalTheoreticalUsage || 0)}</strong></div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200"><span className="text-slate-500 block text-[10px] font-bold">استخدام فعلي</span><strong className="font-mono text-slate-900">{fmtMoney(confirmCloseId?.totalActualUsage || 0)}</strong></div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200"><span className="text-slate-500 block text-[10px] font-bold">فرق الاستخدام</span><strong className="font-mono text-amber-700">{fmtMoney(confirmCloseId?.totalUsageVariance || 0)}</strong></div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200"><span className="text-amber-500 block text-[10px] font-bold">تكلفة الانحراف</span><strong className="font-mono text-amber-700">{fmtMoney(confirmCloseId?.totalVarianceCost || 0)}</strong></div>
          </div>
          {confirmCloseId && (
            <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
              <table className="w-full text-right text-[11px] border-collapse min-w-[500px]">
                <thead><tr className="sticky top-0 bg-slate-100"><th className="border border-slate-300 bg-slate-100 p-1.5">الصنف</th><th className="border border-slate-300 bg-slate-100 p-1.5">النظري</th><th className="border border-slate-300 bg-slate-100 p-1.5">المعدود</th><th className="border border-slate-300 bg-slate-100 p-1.5">الانحراف</th><th className="border border-slate-300 bg-slate-100 p-1.5">التكلفة</th></tr></thead>
                <tbody>
                  {sortByCode(confirmCloseId.items).filter((it) => it.varianceQty !== 0).map((it) => (
                    <tr key={it.rawMaterialId}>
                      <td className="border border-slate-300 p-1.5 font-bold">{it.itemName}</td>
                      <td className="border border-slate-300 p-1.5 font-mono">{fmt(it.theoreticalQty)}</td>
                      <td className="border border-slate-300 p-1.5 font-mono">{fmt(it.countedQty)}</td>
                      <td className={`border border-slate-300 p-1.5 font-mono font-bold ${it.varianceQty > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(it.varianceQty)}</td>
                      <td className="border border-slate-300 p-1.5 font-mono">{fmtMoney(it.varianceCost)}</td>
                    </tr>
                  ))}
                  {sortByCode(confirmCloseId.items).filter((it) => it.varianceQty !== 0).length === 0 && <tr><td colSpan={5} className="border border-slate-300 p-3 text-center text-slate-400 font-bold">لا توجد انحرافات — الأرصدة مطابقة تماماً</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Btn tone="ghost" onClick={() => setConfirmClose(null)}>إلغاء</Btn>
            <Btn tone="dark" onClick={() => { if (confirmCloseId) printBranchInventoryReport(confirmCloseId); }}><Printer className="w-4 h-4" /> طباعة تقرير الأرصدة</Btn>
            <Btn tone="danger" onClick={() => { if (confirmCloseId) closeMonthlyInventory(confirmCloseId.id); setConfirmClose(null); }}><Lock className="w-4 h-4" /> تأكيد الإقفال</Btn>
          </div>
        </div>
      </Modal>

      <AdminDeleteModal
        isOpen={adminDelete.isModalOpen}
        onClose={() => { adminDelete.cancelDelete(); setConfirmKind(null); }}
        onConfirm={adminDelete.confirmDelete}
        password={adminDelete.password}
        setPassword={adminDelete.setPassword}
        title={confirmKind === 'reopen' ? 'فتح الفترة والتعديل' : 'حذف دورة الجرد'}
        message={confirmKind === 'reopen'
          ? 'بعد التأكيد يُفتح الشهر من جديد (مقفل ← قيد الجرد)، وتُعكس تسويات المخزون والقيد المحاسبي، ويمكن تعديل الأعداد ثم إعادة الإقفال. يتطلب صلاحية مسؤول النظام.'
          : 'سيتم حذف دورة الجرد نهائياً، وهذا مسموح فقط طالما لم يُقفل الشهر. يتطلب صلاحية مسؤول النظام.'}
        confirmLabel={confirmKind === 'reopen' ? 'فتح الفترة' : 'تأكيد الحذف'}
      />
    </div>
  );
};