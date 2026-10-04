import React, { useMemo, useState } from 'react';
import { ClipboardList, Save, Plus, Trash2, Eye, FileSpreadsheet, FileDown, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, TabBar, Modal } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, today, downloadCSV, navOnEnter } from '../../utils/helpers';
import { exportPDF, PDFReport } from '../../utils/pdf';
import type { DailyInventoryCount, DailyInventoryItem } from '../../types';

const toNum = (v: string): number => {
  if (v === undefined || v === null || v === '') return NaN;
  const arabic = v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const normalized = arabic.replace(/,/g, '.');
  return parseFloat(normalized);
};

export const DailyInventoryView: React.FC = () => {
  const {
    inventory, rawMaterials, branches, grnNotes, dailyCounts, visibleBranchIds, getAverageUnitCost,
    getRawMaterialName, getBranchName, addDailyCount, deleteDailyCount,
  } = useApp();
  const [tab, setTab] = useState<'entry' | 'balances' | 'history'>('entry');
  const [branch, setBranch] = useState(visibleBranchIds[0] || 'b-01');
  const [date, setDate] = useState(today());
  const [countedBy, setCountedBy] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [viewCount, setViewCount] = useState<DailyInventoryCount | null>(null);
  const [balanceDate, setBalanceDate] = useState(today());

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchItems = rawMaterials.filter((m) => m.isActive);

  // Previous balance: latest daily count for branch+item before selected date, else current inventory
  const openingOf = (rmId: string) => {
    const prior = dailyCounts
      .filter((d) => d.branchId === branch && d.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const priorItem = prior?.items.find((i) => i.rawMaterialId === rmId);
    if (priorItem) return priorItem.countedQty;
    return inventory.find((i) => i.branchId === branch && i.rawMaterialId === rmId)?.quantity || 0;
  };

  // Purchases recorded for the selected day (approved GRNs on that branch/date)
  const purchasedOf = (rmId: string) =>
    grnNotes
      .filter((g) => g.status === 'approved' && g.branchId === branch && g.date === date)
      .reduce((sum, g) => sum + g.items.filter((i) => i.rawMaterialId === rmId).reduce((a, i) => a + i.quantityReceived, 0), 0);

  // Balance per branch+item as of the selected balances date: latest daily count on or before that
  // date, otherwise the current inventory quantity.
  const balanceOf = (bId: string, rmId: string): number => {
    const prior = dailyCounts
      .filter((d) => d.branchId === bId && d.date <= balanceDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const priorItem = prior?.items.find((i) => i.rawMaterialId === rmId);
    if (priorItem) return priorItem.countedQty;
    return inventory.find((i) => i.branchId === bId && i.rawMaterialId === rmId)?.quantity || 0;
  };

  const rows: DailyInventoryItem[] = useMemo(() => branchItems.map((m) => {
    const openingQty = openingOf(m.id);
    const purchasedQty = purchasedOf(m.id);
    const theoreticalQty = openingQty + purchasedQty;
    const countedQty = counts[m.id] !== undefined && counts[m.id] !== '' ? toNum(counts[m.id]) : theoreticalQty;
    const consumedQty = theoreticalQty - countedQty;
    const unitCost = getAverageUnitCost(m.id);
    return {
      rawMaterialId: m.id, itemName: m.nameAr, unit: m.unit,
      openingQty, purchasedQty, theoreticalQty, countedQty, consumedQty,
      unitCost, consumedValue: consumedQty * unitCost,
    };
  }), [branch, date, counts, dailyCounts, inventory, grnNotes, rawMaterials, branchItems]);

  const totalConsumedQty = rows.reduce((s, r) => s + r.consumedQty, 0);
  const totalConsumedValue = rows.reduce((s, r) => s + r.consumedValue, 0);

  const resetCounts = () => {
    const base: Record<string, string> = {};
    branchItems.forEach((m) => {
      base[m.id] = String(openingOf(m.id) + purchasedOf(m.id));
    });
    setCounts(base);
  };

  const saveCount = () => {
    if (!branch || !date) return;
    addDailyCount({
      branchId: branch, date, countedBy: countedBy || 'المستخدم', status: 'saved',
      items: rows, totalConsumedQty, totalConsumedValue,
    });
    setCountedBy('');
  };

  const summaryByBranch = visibleBranches.map((b) => {
    const qty = branchItems.reduce((s, m) => s + balanceOf(b.id, m.id), 0);
    const val = branchItems.reduce((s, m) => s + balanceOf(b.id, m.id) * getAverageUnitCost(m.id), 0);
    return { branch: b, qty, val };
  });

  const [pdfBusy, setPdfBusy] = useState(false);

  const exportBalancesPDF = async () => {
    setPdfBusy(true);
    try {
      const header = ['الكود', 'الصنف', ...visibleBranches.map((b) => b.nameAr), 'الإجمالي كمية', 'الإجمالي قيمة'];
      const pdfRows = rows.map((r) => [
        rawMaterials.find((m) => m.id === r.rawMaterialId)?.code || '—',
        r.itemName,
        ...visibleBranches.map((b) => balanceOf(b.id, r.rawMaterialId)),
        visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId), 0),
        visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId) * getAverageUnitCost(r.rawMaterialId), 0),
      ]);
      const codeW = 40;
      const nameW = visibleBranches.length > 4 ? 150 : 180;
      const totalW = 70;
      const branchW = Math.max(45, (802 - codeW - nameW - totalW * 2) / visibleBranches.length);
      const colWidths = [codeW, nameW, ...visibleBranches.map(() => branchW), totalW, totalW];
      const reports: PDFReport[] = [{ name: `أرصدة الفروع حتى تاريخ ${balanceDate}`, header, rows: pdfRows, colWidths }];
      await exportPDF(`أرصدة_الفروع_${balanceDate}.pdf`, reports, `الأرصدة في جميع الفروع — ${balanceDate}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const th = 'border border-slate-300 bg-slate-100 p-2 font-extrabold';
  const td = 'border border-slate-300 p-2';

  return (
    <div className="space-y-6">
      <PageHeader title="الجرد اليومي للفروع" subtitle="إدراج الجرد اليومي واحتساب الكمية المستهلكة وقيمتها وفقاً للجرد السابق ومشتريات اليوم، مع عرض الأرصدة لكل الأصناف والفروع" icon={<ClipboardList className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="الجرد_اليومي"
            sheets={[
              { name: 'أرصدة الفروع', header: ['الصنف', 'الفرع', 'الكمية', 'متوسط السعر', 'القيمة'], rows: inventory.map((i) => [getRawMaterialName(i.rawMaterialId), getBranchName(i.branchId), i.quantity, getAverageUnitCost(i.rawMaterialId), i.quantity * getAverageUnitCost(i.rawMaterialId)]) },
              { name: 'سجل الجرد', header: ['التاريخ', 'الفرع', 'المُدرج من', 'الكمية المستهلكة', 'قيمة المستهلك'], rows: dailyCounts.map((c) => [c.date, getBranchName(c.branchId), c.countedBy, c.totalConsumedQty, c.totalConsumedValue]) },
            ]}
          />
          <Btn onClick={() => setTab('entry')}><Plus className="w-4 h-4" /> جرد جديد</Btn>
        </>} />

      <TabBar tabs={[{ id: 'entry', label: 'إدراج الجرد' }, { id: 'balances', label: 'الأرصدة في الفروع' }, { id: 'history', label: 'سجل الجرد' }]} active={tab} onChange={(id) => setTab(id as 'entry' | 'balances' | 'history')} />

      {tab === 'entry' && (
        <Card className="p-5">
          <SectionHeader title="إدراج جرد يومي" subtitle="الكمية المستهلكة = رصيد الجرد السابق + مشتريات اليوم − الجرد الفعلي المرصود" icon={<ClipboardList className="w-5 h-5 text-indigo-500" />} />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="الفرع">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="تاريخ الجرد">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="المُدرج من">
              <input value={countedBy} onChange={(e) => setCountedBy(e.target.value)} className={inputCls} placeholder="اسم المسؤول" />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Btn tone="dark" onClick={resetCounts}>استعادة الافتراضي (المتاح النظري)</Btn>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th className={th}>الكود</th><th className={th}>الصنف</th><th className={th}>الوحدة</th>
                  <th className={th}>رصيد الجرد السابق</th><th className={th}>مشتريات اليوم</th><th className={th}>المتاح النظري</th>
                  <th className={th}>الجرد الفعلي</th><th className={th}>المستهلك</th><th className={th}>متوسط السعر</th><th className={th}>قيمة المستهلك</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rawMaterialId} className="hover:bg-slate-50">
                    <td className={`${td} font-mono font-bold text-indigo-700`}>{rawMaterials.find((m) => m.id === r.rawMaterialId)?.code || '—'}</td>
                    <td className={`${td} font-bold text-slate-900`}>{r.itemName}</td>
                    <td className={td}>{r.unit}</td>
                    <td className={`${td} font-mono`}>{fmt(r.openingQty)}</td>
                    <td className={`${td} font-mono text-emerald-700`}>{r.purchasedQty > 0 ? `+${fmt(r.purchasedQty)}` : '—'}</td>
                    <td className={`${td} font-mono font-bold`}>{fmt(r.theoreticalQty)}</td>
                    <td className={td}>
                      <input type="text" inputMode="decimal" data-nav value={counts[r.rawMaterialId] !== undefined ? counts[r.rawMaterialId] : String(r.theoreticalQty)}
                        onChange={(e) => setCounts({ ...counts, [r.rawMaterialId]: e.target.value })}
                        onKeyDown={navOnEnter}
                        className={inputCls + ' !p-1.5 w-28'} />
                    </td>
                    <td className={`${td} font-mono font-extrabold ${r.consumedQty > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>{fmt(r.consumedQty)}</td>
                    <td className={`${td} font-mono`}>{fmt(r.unitCost, 2)}</td>
                    <td className={`${td} font-mono font-bold text-indigo-700`}>{fmtMoney(r.consumedValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 font-extrabold">
                  <td className={td} colSpan={7}>الإجمالي</td>
                  <td className={td}>{fmt(totalConsumedQty)}</td>
                  <td className={td}>—</td>
                  <td className={td}>{fmtMoney(totalConsumedValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <Btn tone="success" onClick={saveCount}><Save className="w-4 h-4" /> حفظ الجرد اليومي</Btn>
          </div>
        </Card>
      )}

      {tab === 'balances' && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="الأرصدة في جميع الفروع" subtitle="الكميات والقيم لكل الأصناف والفروع حتى التاريخ المحدد (آخر جرد يومي أو الرصيد الحالي)" icon={<Eye className="w-5 h-5 text-indigo-500" />} />
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600">عرض حتى تاريخ:</label>
              <input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} className={inputCls + ' !w-auto !p-1.5'} />
              <Btn tone="ghost" className="!bg-slate-100 !text-slate-700" onClick={() => downloadCSV(`أرصدة_الفروع_${balanceDate}.csv`, ['الكود', 'الصنف', ...visibleBranches.map((b) => b.nameAr), 'الإجمالي كمية', 'الإجمالي قيمة'], rows.map((r) => [rawMaterials.find((m) => m.id === r.rawMaterialId)?.code || '', r.itemName, ...visibleBranches.map((b) => balanceOf(b.id, r.rawMaterialId)), visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId), 0), visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId) * getAverageUnitCost(r.rawMaterialId), 0)]))}><FileSpreadsheet className="w-4 h-4" /> تصدير</Btn>
              <Btn tone="danger" className="!text-white" onClick={exportBalancesPDF} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF</Btn>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr>
                  <th className={th}>الكود</th><th className={th}>الصنف</th>
                  {visibleBranches.map((b) => <th key={b.id} className={th}>{b.nameAr}</th>)}
                  <th className={th}>الإجمالي كمية</th><th className={th}>الإجمالي قيمة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const totalQty = visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId), 0);
                  const totalVal = visibleBranches.reduce((s, b) => s + balanceOf(b.id, r.rawMaterialId) * getAverageUnitCost(r.rawMaterialId), 0);
                  return (
                    <tr key={r.rawMaterialId} className="hover:bg-slate-50">
                      <td className={`${td} font-mono font-bold text-indigo-700`}>{rawMaterials.find((m) => m.id === r.rawMaterialId)?.code || '—'}</td>
                      <td className={`${td} font-bold text-slate-900`}>{r.itemName} <span className="text-slate-400 text-[10px]">({r.unit})</span></td>
                      {visibleBranches.map((b) => {
                        const qty = balanceOf(b.id, r.rawMaterialId);
                        return <td key={b.id} className={`${td} font-mono ${qty > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{fmt(qty)}</td>;
                      })}
                      <td className={`${td} font-mono font-extrabold text-slate-900`}>{fmt(totalQty)}</td>
                      <td className={`${td} font-mono font-bold text-indigo-700`}>{fmtMoney(totalVal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 font-extrabold">
                  <td className={td} colSpan={2}>الإجمالي الكلي</td>
                  {summaryByBranch.map((s) => <td key={s.branch.id} className={`${td} font-mono`}>{fmt(s.qty)} <span className="text-[9px] block text-slate-500">{fmtMoney(s.val)}</span></td>)}
                  <td className={`${td} font-mono`}>{fmt(summaryByBranch.reduce((s, x) => s + x.qty, 0))}</td>
                  <td className={`${td} font-mono text-indigo-800`}>{(() => { const t = summaryByBranch.reduce((s, x) => s + x.val, 0); return t === 0 ? '—' : fmt(t); })()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs">سجل الجرد اليومي ({dailyCounts.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">التاريخ</th><th className="p-3">الفرع</th><th className="p-3">المُدرج من</th><th className="p-3">المستهلك (كمية)</th><th className="p-3">قيمة المستهلك</th><th className="p-3">الأصناف</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyCounts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-3 text-slate-600">{c.date}</td>
                    <td className="p-3 font-bold text-slate-900">{getBranchName(c.branchId)}</td>
                    <td className="p-3">{c.countedBy}</td>
                    <td className="tnum text-left p-3 font-extrabold text-indigo-700">{fmt(c.totalConsumedQty)}</td>
                    <td className="tnum text-left p-3 font-bold text-indigo-700">{fmtMoney(c.totalConsumedValue)}</td>
                    <td className="p-3">{c.items.length} صنف</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewCount(c)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="عرض التفاصيل"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => deleteDailyCount(c.id)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {dailyCounts.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات جرد بعد — أدرج جرداً يومياً من تبويب "إدراج الجرد"</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={viewCount !== null} onClose={() => setViewCount(null)} title={`تفاصيل جرد ${viewCount ? getBranchName(viewCount.branchId) : ''} — ${viewCount?.date || ''}`} wide>
        {viewCount && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold">
              <span>المُدرج من: {viewCount.countedBy}</span>
              <span>المستهلك الكلي: <span className="font-mono text-indigo-700">{fmt(viewCount.totalConsumedQty)}</span></span>
              <span>القيمة: <span className="font-mono text-indigo-700">{fmtMoney(viewCount.totalConsumedValue)}</span></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] border-collapse">
                <thead><tr><th className={th}>الصنف</th><th className={th}>سابق</th><th className={th}>مشتريات</th><th className={th}>نظري</th><th className={th}>فعلي</th><th className={th}>مستهلك</th><th className={th}>القيمة</th></tr></thead>
                <tbody>
                  {viewCount.items.map((it: DailyInventoryItem) => (
                    <tr key={it.rawMaterialId} className="hover:bg-slate-50">
                      <td className={`${td} font-bold`}>{it.itemName}</td>
                      <td className={`${td} font-mono`}>{fmt(it.openingQty)}</td>
                      <td className={`${td} font-mono text-emerald-700`}>{it.purchasedQty || '—'}</td>
                      <td className={`${td} font-mono`}>{fmt(it.theoreticalQty)}</td>
                      <td className={`${td} font-mono`}>{fmt(it.countedQty)}</td>
                      <td className={`${td} font-mono font-extrabold text-indigo-700`}>{fmt(it.consumedQty)}</td>
                      <td className={`${td} font-mono font-bold`}>{fmtMoney(it.consumedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
