import React, { useEffect, useMemo, useState } from 'react';
import { Save, ClipboardList, FileSpreadsheet, Trash2, ChevronDown, ChevronUp, Boxes, History, Pencil, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, categoryLabel, navOnEnter } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import type { OpeningBalanceRecord } from '../../types';

const toNum = (v: string): number => {
  if (v === undefined || v === null || v === '') return NaN;
  const arabic = v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return parseFloat(arabic.replace(/,/g, '.'));
};

export const OpeningBalancesView: React.FC = () => {
  const {
    inventory, rawMaterials, branches, visibleBranchIds, getBranchName, getAverageUnitCost,
    addOpeningBalance, updateOpeningBalance,
    openingBalances, deleteOpeningBalance, materialCategories,
  } = useApp();

  const [branch, setBranch] = useState(visibleBranchIds[0] || 'b-01');
  const [balanceDate, setBalanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState(false);
  const [compareTab, setCompareTab] = useState(false);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const branchItems = rawMaterials.filter((m) => m.isActive);

  // Current opening quantity per item = existing inventory quantity for this branch (or 0)
  const currentOf = (rmId: string) => inventory.find((i) => i.branchId === branch && i.rawMaterialId === rmId)?.quantity || 0;

  const branchHistory = useMemo(() => openingBalances.filter((r) => r.branchId === branch).sort((a, b) => b.date.localeCompare(a.date)), [openingBalances, branch]);
  const editing = editId ? branchHistory.find((r) => r.id === editId) || null : null;

  // الكمية الافتتاحية الثابتة = ما أُدخل فعلياً في آخر سجل محفوظ (لا تتأثر بالخصومات)
  const recordQtyOf = (rmId: string): number => {
    const rec = editing || branchHistory[0] || null;
    return rec ? (rec.items.find((i) => i.rawMaterialId === rmId)?.quantity || 0) : 0;
  };

  const categories = useMemo(() => {
    const seen: string[] = [];
    branchItems.forEach((m) => { if (!seen.includes(m.category)) seen.push(m.category); });
    return seen;
  }, [branchItems]);
  const itemsOf = (cat: string) => branchItems.filter((m) => m.category === cat);
  const catTotal = (cat: string, key: 'qty' | 'val') => itemsOf(cat).reduce((s, m) => {
    const v = toNum(qty[m.id]) > 0 ? toNum(qty[m.id]) : 0;
    const p = toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id);
    return s + (key === 'qty' ? v : v * p);
  }, 0);

  useEffect(() => {
    const base: Record<string, string> = {};
    const pbase: Record<string, string> = {};
    branchItems.forEach((m) => {
      const it = (branchHistory[0] || null)?.items.find((i) => i.rawMaterialId === m.id);
      base[m.id] = String(it ? it.quantity : 0);
      pbase[m.id] = String(it && it.unitCost > 0 ? it.unitCost : getAverageUnitCost(m.id));
    });
    setQty(base);
    setPrice(pbase);
    setEditId(null);
    setSavedMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const loadRecord = (r: OpeningBalanceRecord) => {
    const base: Record<string, string> = {};
    const pbase: Record<string, string> = {};
    branchItems.forEach((m) => {
      const item = r.items.find((i) => i.rawMaterialId === m.id);
      base[m.id] = item ? String(item.quantity) : String(currentOf(m.id));
      pbase[m.id] = String(item && item.unitCost > 0 ? item.unitCost : getAverageUnitCost(m.id));
    });
    setQty(base);
    setPrice(pbase);
    setBalanceDate(r.date);
    setEditId(r.id);
    setSavedMsg('');
  };

  const changedCount = branchItems.filter((m) => toNum(qty[m.id]) !== recordQtyOf(m.id) && !Number.isNaN(toNum(qty[m.id]))).length;
  const priceChangedCount = branchItems.filter((m) => {
    const p = toNum(price[m.id]);
    return !Number.isNaN(p) && p > 0 && p !== getAverageUnitCost(m.id);
  }).length;

const save = () => {
    const quantities: Record<string, number> = {};
    const costs: Record<string, number> = {};
    branchItems.forEach((m) => {
      const v = toNum(qty[m.id]);
      if (!Number.isNaN(v) && v > 0) quantities[m.id] = v;
      const p = toNum(price[m.id]);
      costs[m.id] = !Number.isNaN(p) && p > 0 ? p : getAverageUnitCost(m.id);
    });
    // تسجيل الافتتاح فقط — لا يمسّ أرصدة المخزون الحالية.
    // الوضع القديم كان يستدعي setOpeningBalances الذي يستبدل rcerp_inventory،
    // فإدخال رصيد افتتاحي بتاريخ قديم (30.09 مثلاً) كان يمسح ما تراكم بعده.
    // الأرصدة الفعلية تُعدَّل من شاشة المخزون/الجرد، لا من هنا.
    const items = Object.entries(quantities).map(([rawMaterialId, quantity]) => ({ rawMaterialId, quantity, unitCost: costs[rawMaterialId] }));
    if (editing) {
      updateOpeningBalance(editing.id, { branchId: branch, date: balanceDate, items });
      setSavedMsg(`تم تعديل رصيد الافتتاحي لفرع ${getBranchName(branch)} بتاريخ ${balanceDate} بنجاح (${items.length} صنف)`);
    } else {
      addOpeningBalance({ branchId: branch, date: balanceDate, items });
      setSavedMsg(`تم حفظ الأرصدة الافتتاحية لفرع ${getBranchName(branch)} بتاريخ ${balanceDate} بنجاح (${items.length} صنف${priceChangedCount > 0 ? ` — تحديث أسعار ${priceChangedCount} صنف` : ''})`);
    }
    setConfirmOpen(false);
  };

  const reset = () => {
    const base: Record<string, string> = {};
    const pbase: Record<string, string> = {};
    branchItems.forEach((m) => { base[m.id] = '0'; pbase[m.id] = String(getAverageUnitCost(m.id)); });
    setQty(base);
    setPrice(pbase);
    setEditId(null);
    setBalanceDate(() => new Date().toISOString().slice(0, 10));
  };

  const totalVal = branchItems.reduce((s, m) => s + (toNum(qty[m.id]) > 0 ? toNum(qty[m.id]) : 0) * (toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id)), 0);
  const totalQty = branchItems.reduce((s, m) => s + (toNum(qty[m.id]) > 0 ? toNum(qty[m.id]) : 0), 0);

  const branchCompare = visibleBranches.map((b) => {
    const records = openingBalances.filter((r) => r.branchId === b.id).sort((a, x) => x.date.localeCompare(a.date));
    const latest = records[0] || null;
    const openQty = latest ? latest.items.reduce((s, i) => s + i.quantity, 0) : 0;
    const openVal = latest ? latest.items.reduce((s, i) => s + i.quantity * i.unitCost, 0) : 0;
    const curItems = inventory.filter((i) => i.branchId === b.id);
    const curQty = curItems.reduce((s, i) => s + i.quantity, 0);
    const curVal = curItems.reduce((s, i) => s + i.quantity * (getAverageUnitCost(i.rawMaterialId) || 0), 0);
    return { branch: b, has: !!latest, date: latest?.date || '—', count: latest?.items.length || 0, openQty, openVal, curQty, curVal };
  });

  const latestRecordOf = (branchId: string) => openingBalances.filter((r) => r.branchId === branchId).sort((a, x) => x.date.localeCompare(a.date))[0] || null;

  const branchItemsFor = (branchId: string): { code: string; name: string; cat: string; unit: string; qty: number; cost: number; value: number }[] => {
    const rec = latestRecordOf(branchId);
    if (rec) {
      return rec.items.map((i) => {
        const m = rawMaterials.find((x) => x.id === i.rawMaterialId);
return m ? { code: m.code, name: m.nameAr, cat: categoryLabel(m.category, materialCategories), unit: m.unit, qty: i.quantity, cost: i.unitCost, value: i.quantity * i.unitCost } : null;
      }).filter((x): x is { code: string; name: string; cat: string; unit: string; qty: number; cost: number; value: number } => !!x);
    }
    return inventory.filter((i) => i.branchId === branchId).map((i) => {
      const m = rawMaterials.find((x) => x.id === i.rawMaterialId);
      return m ? { code: m.code, name: m.nameAr, cat: categoryLabel(m.category, materialCategories), unit: m.unit, qty: i.quantity, cost: getAverageUnitCost(m.id), value: i.quantity * getAverageUnitCost(m.id) } : null;
    }).filter((x): x is { code: string; name: string; cat: string; unit: string; qty: number; cost: number; value: number } => !!x);
  };

  const printRecord = (r: OpeningBalanceRecord) => {
    const items = r.items.map((i) => {
      const m = rawMaterials.find((x) => x.id === i.rawMaterialId);
      return m ? { code: m.code, name: m.nameAr, cat: categoryLabel(m.category, materialCategories), unit: m.unit, qty: i.quantity, cost: i.unitCost, value: i.quantity * i.unitCost } : null;
    }).filter((x): x is { code: string; name: string; cat: string; unit: string; qty: number; cost: number; value: number } => !!x);
    const qty = items.reduce((s, i) => s + i.qty, 0);
    const val = items.reduce((s, i) => s + i.value, 0);

    // تجميع الأصناف حسب التصنيف (مثل شاشة الإدخال) — الترتيب يوازي شاشة الإدخال
    const categoriesOrder: string[] = ['meat_poultry', 'seafood', 'vegetables_fruits', 'dairy_eggs', 'dry_goods', 'oils_sauces', 'packaging', 'beverages'];
    const tables = categoriesOrder
      .map((cat) => {
        const catItems = items.filter((i) => i.cat === categoryLabel(cat, materialCategories));
        if (catItems.length === 0) return null;
        const catQty = catItems.reduce((s, i) => s + i.qty, 0);
        const catVal = catItems.reduce((s, i) => s + i.value, 0);
        return {
          title: categoryLabel(cat, materialCategories),
          header: ['الكود', 'الصنف', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة'],
          rows: [
            ...catItems.map((i) => [i.code, i.name, i.unit, i.qty, i.cost, i.value]),
            ['', 'إجمالي التصنيف', '', catQty, '', catVal],
          ],
        };
      })
      .filter((t): t is { title: string; header: string[]; rows: (string | number)[][] } => t !== null);

    openPrintWindow({
      title: `رصيد افتتاحي — ${getBranchName(branch)}`,
      subtitle: `تاريخ ${r.date} — ${r.items.length} صنف`,
      meta: [
        ['الفرع', getBranchName(branch)],
        ['تاريخ السجل', r.date],
        ['عدد الأصناف', `${r.items.length}`],
        ['إجمالي الكمية', fmt(qty)],
        ['إجمالي القيمة', fmtMoney(val)],
      ],
      tables,
      totals: [['إجمالي الكمية', fmt(qty)], ['إجمالي القيمة', fmtMoney(val)]],
      footer: `رصيد افتتاحي محفوظ بتاريخ ${r.date} — RestoCost ERP Pro`,
    });
  };

  const printAllBranches = () => {
    const grandTotal = visibleBranches.reduce((s, b) => s + branchItemsFor(b.id).reduce((x, i) => x + i.value, 0), 0);
    openPrintWindow({
      title: 'الأرصدة الافتتاحية للفروع',
      subtitle: 'تقرير رصيد بداية الفترة — لكل فرع على حدة',
      meta: [
        ['عدد الفروع', `${visibleBranches.length}`],
        ['تاريخ التقرير', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
        ['إجمالي قيمة الفروع', fmtMoney(grandTotal)],
      ],
      tables: visibleBranches.map((b) => {
        const items = branchItemsFor(b.id);
        const rec = latestRecordOf(b.id);
        const qty = items.reduce((s, i) => s + i.qty, 0);
        const val = items.reduce((s, i) => s + i.value, 0);
        return {
          title: `${b.nameAr} ${rec ? `— آخر رصيد ${rec.date}` : '— من الرصيد الحالي'}`,
          header: ['الكود', 'الصنف', 'التصنيف', 'الوحدة', 'الكمية الافتتاحية', 'سعر الوحدة (ر.س)', 'القيمة (ر.س)'],
          rows: [
            ...items.map((i) => [i.code, i.name, i.cat, i.unit, i.qty, i.cost, i.value]),
            ['', 'الإجمالي', '', '', qty, '', val],
          ],
        };
      }),
      totals: [['إجمالي قيمة الأرصدة الافتتاحية لجميع الفروع', fmtMoney(grandTotal)]],
      footer: 'الأرصدة الافتتاحية للفروع — RestoCost ERP Pro',
    });
  };

  const printConsolidated = () => {
    const rows = visibleBranches.map((b, idx) => {
      const rec = latestRecordOf(b.id);
      const q = rec ? rec.items.reduce((s, i) => s + i.quantity, 0) : 0;
      const v = rec ? rec.items.reduce((s, i) => s + i.quantity * i.unitCost, 0) : 0;
      return [idx + 1, b.nameAr, rec?.date || '—', rec ? rec.items.length : 0, q, v];
    });
    const tq = rows.reduce((s, r) => s + (r[4] as number), 0);
    const tv = rows.reduce((s, r) => s + (r[5] as number), 0);
    openPrintWindow({
      title: 'تقرير مجمع بالأرصدة الافتتاحية للفروع',
      subtitle: 'الكميات الافتتاحية الثابتة كما وردت في السجلات المحفوظة — لا تتأثر بحركة الاستهلاك',
      meta: [
        ['عدد الفروع', `${visibleBranches.length}`],
        ['الفروع بدون سجل', `${rows.filter((r) => r[2] === '—').length}`],
        ['تاريخ التقرير', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [{
        title: 'الأرصدة الافتتاحية حسب الفرع',
        header: ['م', 'الفرع', 'تاريخ السجل', 'عدد الأصناف', 'إجمالي الكمية الافتتاحية', 'القيمة (ر.س)'],
        rows: [
          ...rows,
          ['', 'الإجمالي العام', '', '', tq, tv],
        ],
      }],
      totals: [['إجمالي الكمية الافتتاحية (كل الفروع)', fmt(tq)], ['إجمالي القيمة الافتتاحية', fmtMoney(tv)]],
      footer: 'تقرير الأرصدة الافتتاحية المجمع — RestoCost ERP Pro',
    });
  };

  const printBranchComparison = () => {
    const rows = branchCompare.map((c, idx) => [
      idx + 1,
      c.branch.nameAr,
      c.date,
      c.openQty > 0 ? fmt(c.openQty) : '—',
      c.openVal > 0 ? fmtMoney(c.openVal) : '—',
      c.curQty > 0 ? fmt(c.curQty) : '—',
      c.curVal > 0 ? fmtMoney(c.curVal) : '—',
      c.curQty - c.openQty !== 0 ? fmt(c.curQty - c.openQty) : '—',
    ]);
    const totalOpenQty = branchCompare.reduce((s, c) => s + c.openQty, 0);
    const totalOpenVal = branchCompare.reduce((s, c) => s + c.openVal, 0);
    const totalCurQty = branchCompare.reduce((s, c) => s + c.curQty, 0);
    const totalCurVal = branchCompare.reduce((s, c) => s + c.curVal, 0);
    const branchesWithRecord = branchCompare.filter((c) => c.has).length;

    openPrintWindow({
      title: 'مقارنة أرصدة الفروع',
      subtitle: 'مقارنة الرصيد الافتتاحي المسجل مع الرصيد الحالي لكل فرع',
      meta: [
        ['عدد الفروع', `${visibleBranches.length}`],
        ['فروع لها سجل افتتاحي', `${branchesWithRecord}`],
        ['فروع بدون سجل', `${visibleBranches.length - branchesWithRecord}`],
        ['تاريخ التقرير', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [{
        title: 'مقارنة الأرصدة الافتتاحية vs الحالية',
        header: ['م', 'الفرع', 'تاريخ السجل', 'الكمية الافتتاحية', 'قيمة الافتتاحي', 'الرصيد الحالي', 'قيمة الحالية', 'الفرق'],
        rows: [
          ...rows,
          ['', 'الإجمالي العام', '', totalOpenQty > 0 ? fmt(totalOpenQty) : '—', totalOpenVal > 0 ? fmtMoney(totalOpenVal) : '—', totalCurQty > 0 ? fmt(totalCurQty) : '—', totalCurVal > 0 ? fmtMoney(totalCurVal) : '—', totalCurQty - totalOpenQty !== 0 ? fmt(totalCurQty - totalOpenQty) : '—'],
        ],
      }],
      totals: [
        ['إجمالي الكمية الافتتاحية', totalOpenQty > 0 ? fmt(totalOpenQty) : '—'],
        ['إجمالي قيمة الافتتاحي', totalOpenVal > 0 ? fmtMoney(totalOpenVal) : '—'],
        ['إجمالي الرصيد الحالي', totalCurQty > 0 ? fmt(totalCurQty) : '—'],
        ['إجمالي قيمة الحالية', totalCurVal > 0 ? fmtMoney(totalCurVal) : '—'],
      ],
      footer: 'تقرير مقارنة أرصدة الفروع — RestoCost ERP Pro',
    });
  };

  const th = 'border border-slate-300 bg-slate-100 p-2 font-extrabold';
  const td = 'border border-slate-300 p-2';

  return (
    <div className="space-y-6">
      <PageHeader title="الأرصدة الافتتاحية للفروع" subtitle="إدخال أرصدة بداية الفترة لكل صنف وفرع (الكميات الافتتاحية للمخزون) — تُحفظ كرصيد أساس للمخزون" icon={<ClipboardList className="w-6 h-6 text-brand-600" />}
        actions={<>
          <Btn onClick={printAllBranches} tone="dark"><Printer className="w-4 h-4" /> طباعة أرصدة الفروع</Btn>
          <Btn onClick={printConsolidated} tone="primary"><Printer className="w-4 h-4" /> تقرير مجمع</Btn>
          <ViewToolbar
            filename={`الارصدة_الافتتاحية_${getBranchName(branch)}`}
            sheets={[
              { name: 'الأرصدة الافتتاحية', header: ['الكود', 'الصنف', 'التصنيف', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة'], rows: branchItems.map((m) => { const v = toNum(qty[m.id]) > 0 ? toNum(qty[m.id]) : 0; const p = toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id); return [m.code, m.nameAr, categoryLabel(m.category, materialCategories), m.unit, v, p, v * p]; }) },
              { name: 'رصيد كل الفروع', header: ['الكود', 'الصنف', ...visibleBranches.map((b) => b.nameAr), 'الإجمالي'], rows: branchItems.map((m) => [m.code, m.nameAr, ...visibleBranches.map((b) => inventory.find((i) => i.branchId === b.id && i.rawMaterialId === m.id)?.quantity || 0), visibleBranches.reduce((s, b) => s + (inventory.find((i) => i.branchId === b.id && i.rawMaterialId === m.id)?.quantity || 0), 0)]) },
              { name: 'مقارنة الفروع', header: ['الفرع', 'تاريخ السجل', 'عدد الأصناف', 'الكمية الافتتاحية', 'قيمة الافتتاحي'], rows: visibleBranches.map((b) => { const r = latestRecordOf(b.id); return [b.nameAr, r?.date || '—', r?.items.length || 0, r ? r.items.reduce((s, i) => s + i.quantity, 0) : 0, r ? r.items.reduce((s, i) => s + i.quantity * i.unitCost, 0) : 0]; }) },
            ]}
          />
          <Btn onClick={() => setConfirmOpen(true)} tone="success"><Save className="w-4 h-4" /> حفظ الأرصدة</Btn>
        </>} />

      <Card className="p-5">
        <SectionHeader title="إدخال أرصدة افتتاحية" subtitle="حدد الفرع والتاريخ ثم أدخل الكمية الافتتاحية وسعر الوحدة لكل صنف. القيم الافتراضية تُقرأ من آخر سجل افتتاحي محفوظ للفرع — كميات مثبتة لا تتأثر بخصومات المبيعات أو الإنتاج." icon={<ClipboardList className="w-5 h-5 text-brand-500" />} />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="الفرع">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <Field label="تاريخ التسجيل">
            <input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex items-end gap-2">
            <Btn tone="dark" onClick={reset}><Trash2 className="w-4 h-4" /> تصفير الكميات</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV(`الارصدة_الافتتاحية_${getBranchName(branch)}.csv`, ['الكود', 'الصنف', 'التصنيف', 'الوحدة', 'الكمية', 'سعر الوحدة'], branchItems.map((m) => [m.code, m.nameAr, categoryLabel(m.category, materialCategories), m.unit, toNum(qty[m.id]) > 0 ? toNum(qty[m.id]) : 0, toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id)]))}><FileSpreadsheet className="w-4 h-4" /> تصدير</Btn>
          </div>
        </div>

        {editing && (
          <div className="mt-4 rounded-xl p-3 border bg-brand-50/70 border-brand-200 text-xs font-bold text-brand-800 flex items-center justify-between gap-2">
            <span><Pencil className="w-4 h-4 inline ml-1" /> جارٍ تعديل الرصيد الافتتاحي لفرع {getBranchName(branch)} بتاريخ {balanceDate} — الحفظ سيُحدّث نفس السجل مباشرة.</span>
            <button onClick={() => { setEditId(null); setBalanceDate(() => new Date().toISOString().slice(0, 10)); setSavedMsg(''); }} className="px-3 py-1 rounded-lg bg-white border border-brand-300 hover:bg-brand-100">إلغاء التعديل</button>
          </div>
        )}

        {savedMsg && <div className="mt-4 rounded-xl p-3 font-bold border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs">{savedMsg}</div>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th className={th}>الكود</th><th className={th}>الصنف</th><th className={th}>الوحدة</th>
                <th className={th}>الرصيد الحالي</th><th className={th}>الكمية الافتتاحية</th><th className={th}>سعر الوحدة (ر.س)</th><th className={th}>القيمة</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const items = itemsOf(cat);
                const isCollapsed = collapsed[cat];
                return (
                  <React.Fragment key={cat}>
                    <tr className="bg-brand-50/80 border-y-2 border-brand-200 cursor-pointer" onClick={() => setCollapsed({ ...collapsed, [cat]: !isCollapsed })}>
                      <td className={`${td} font-extrabold text-brand-800`} colSpan={7}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2"><Boxes className="w-4 h-4" /> {categoryLabel(cat, materialCategories)} <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">{items.length} صنف</span></span>
                          <span className="flex items-center gap-3 text-[11px]">
                            <span className="font-bold text-brand-900">كمية: {fmt(catTotal(cat, 'qty'))}</span>
                            <span className="font-bold text-brand-900">قيمة: {fmtMoney(catTotal(cat, 'val'))}</span>
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && items.map((m) => {
                      const cur = currentOf(m.id);
                      const v = toNum(qty[m.id]);
                      const p = toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id);
                      const val = v > 0 ? v * p : 0;
                      const isChanged = v !== cur && !Number.isNaN(v);
                      const isPriceChanged = !Number.isNaN(toNum(price[m.id])) && toNum(price[m.id]) > 0 && toNum(price[m.id]) !== getAverageUnitCost(m.id);
                      return (
                        <tr key={m.id} className={`hover:bg-slate-50 ${isChanged || isPriceChanged ? 'bg-amber-50/40' : ''}`}>
                          <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{m.code}</td>
                          <td className={`${td} font-bold text-slate-900`}>{m.nameAr}</td>
                          <td className={td}>{m.unit}</td>
                          <td className={`text-left ${td} tnum`}>{fmt(cur)}</td>
                          <td className={td}>
                            <input type="text" inputMode="decimal" data-nav value={qty[m.id] !== undefined ? qty[m.id] : ''}
                              onChange={(e) => setQty({ ...qty, [m.id]: e.target.value })}
                              onKeyDown={navOnEnter}
                              className={inputCls + ' !p-1.5 w-28'} />
                          </td>
                          <td className={td}>
                            <input type="text" inputMode="decimal" data-nav value={price[m.id] !== undefined ? price[m.id] : ''}
                              onChange={(e) => setPrice({ ...price, [m.id]: e.target.value })}
                              onKeyDown={navOnEnter}
                              className={inputCls + ' !p-1.5 w-24'} />
                          </td>
                          <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{fmtMoney(val)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50 font-extrabold">
                <td className={td} colSpan={4}>الإجمالي الكلي</td>
                <td className={`text-left ${td} tnum`}>{fmt(totalQty)}</td>
                <td className={td}>—</td>
                <td className={`text-left ${td} text-brand-800 tnum`}>{fmtMoney(totalVal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-500">
            {changedCount > 0 ? `${changedCount} صنف سيتم تحديث رصيده` : 'لا توجد تغييرات في الكميات'}
            {priceChangedCount > 0 ? (changedCount > 0 ? ' و' : ' — ') + `${priceChangedCount} صنف سيتم تحديث سعره` : ''}
          </p>
          <Btn tone="success" onClick={() => setConfirmOpen(true)} disabled={changedCount === 0 && priceChangedCount === 0 && !editing}><Save className="w-4 h-4" /> {editing ? 'حفظ التعديل على السجل' : 'حفظ الأرصدة الافتتاحية'}</Btn>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionHeader title="سجل الأرصدة الافتتاحية" subtitle={`سجلات محفوظة لفرع ${getBranchName(branch)} — اختر سجلاً للرجوع إليه وتعديله مباشرة`} icon={<History className="w-5 h-5 text-brand-500" />} />
          <Btn tone="ghost" onClick={() => setHistoryTab(!historyTab)}>{historyTab ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {historyTab ? 'إخفاء' : `عرض (${branchHistory.length})`}</Btn>
        </div>
        {historyTab && (
          <div className="mt-3 overflow-x-auto">
            {branchHistory.length === 0 ? (
              <p className="p-4 text-center text-slate-500 font-bold text-xs">لا توجد أرصدة افتتاحية محفوظة لهذا الفرع بعد</p>
            ) : (
              <table className="w-full text-right text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr>
                    <th className={th}>التاريخ</th><th className={th}>الأصناف</th><th className={th}>إجمالي الكمية</th><th className={th}>إجمالي القيمة</th><th className={th}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {branchHistory.map((r) => {
                    const q = r.items.reduce((s, i) => s + i.quantity, 0);
                    const v = r.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
                    return (
                      <tr key={r.id} className={`hover:bg-slate-50 ${editId === r.id ? 'bg-brand-50/70' : ''}`}>
                        <td className={`text-left ${td} font-bold text-slate-800 tnum`}>{r.date}</td>
                        <td className={`${td}`}>{r.items.length} صنف</td>
                        <td className={`text-left ${td} tnum`}>{fmt(q)}</td>
                        <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{fmtMoney(v)}</td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => printRecord(r)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50" title="طباعة هذا السجل"><Printer className="w-4 h-4" /></button>
                            <button onClick={() => loadRecord(r)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50" title="الرجوع للسجل وتعديله"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => { if (confirm(`حذف الرصيد الافتتاحي بتاريخ ${r.date}؟`)) { deleteOpeningBalance(r.id); if (editId === r.id) setEditId(null); } }} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="حذف السجل"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <SectionHeader title="مقارنة أرصدة الفروع" subtitle="مقارنة سجلات الأرصدة الافتتاحية مع رصيد المخزون الحالي لكل فرع — الفروع التي لا يوجد لها سجل افتتاحي تُظهر صفراً" icon={<FileSpreadsheet className="w-5 h-5 text-brand-500" />} />
          <div className="flex items-center gap-2">
            <Btn onClick={printBranchComparison} tone="primary"><Printer className="w-4 h-4" /> طباعة المقارنة</Btn>
            <Btn tone="ghost" onClick={() => setCompareTab(!compareTab)}>{compareTab ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {compareTab ? 'إخفاء' : `عرض (${branchCompare.length} فرع)`}</Btn>
          </div>
        </div>
        {compareTab && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className={th}>الفرع</th>
                  <th className={th}>سجل افتتاحي؟</th>
                  <th className={th}>آخر تاريخ رصيد</th>
                  <th className={th}>أصناف مسجلة</th>
                  <th className={th}>الكمية الافتتاحية</th>
                  <th className={th}>قيمة الافتتاحي</th>
                  <th className={th}>الرصيد الحالي (كمية)</th>
                  <th className={th}>قيمة الحالي</th>
                  <th className={th}>الفرق</th>
                </tr>
              </thead>
              <tbody>
                {branchCompare.map((c) => (
                  <tr key={c.branch.id} className={`hover:bg-slate-50 ${!c.has ? 'bg-amber-50/60' : ''}`}>
                    <td className={`${td} font-bold text-slate-900`}>{c.branch.nameAr}</td>
                    <td className={`${td}`}>{c.has ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">موجود</span> : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">لا يوجد سجل — يظهر صفر</span>}</td>
                    <td className={`text-left ${td} text-slate-600 tnum`}>{c.date}</td>
                    <td className={`text-left ${td} tnum`}>{c.count}</td>
                    <td className={`text-left ${td} font-bold tnum`}>{fmt(c.openQty)}</td>
                    <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{fmtMoney(c.openVal)}</td>
                    <td className={`text-left ${td} tnum`}>{fmt(c.curQty)}</td>
                    <td className={`text-left ${td} tnum`}>{fmtMoney(c.curVal)}</td>
                    <td className={`text-left ${td} font-extrabold ${c.curQty - c.openQty === 0 ? 'text-slate-400' : 'text-rose-700'} tnum`}>{fmt(c.curQty - c.openQty)}</td>
                  </tr>
                ))}
                {branchCompare.length === 0 && <tr><td colSpan={9} className={`${td} text-center text-slate-500 font-bold`}>لا توجد فروع ظاهرة</td></tr>}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] font-bold text-slate-500">لإضافة فرع جديد للقائمة: من إعدادات المؤسسة، اربط الفرع بحساب المستخدم (الفرع "b-ck" = المطبخ المركزي ولا يظهر هنا). بعد حفظ أول رصيد افتتاحي لأي فرع يُصبح قابلاً للمقارنة.</p>
          </div>
        )}
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأكيد حفظ الأرصدة الافتتاحية" wide>
        <div className="space-y-3 text-xs">
          <p className="font-bold text-slate-700">سيتم تحديث رصيد المخزون لفرع <span className="text-brand-700">{getBranchName(branch)}</span> بالكميات الافتتاحية التالية ({changedCount} صنف):</p>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px] border-collapse">
              <thead><tr><th className={th}>الكود</th><th className={th}>الصنف</th><th className={th}>الرصيد الحالي</th><th className={th}>الافتتاحي الجديد</th><th className={th}>سعر الوحدة</th><th className={th}>القيمة</th></tr></thead>
              <tbody>
                {branchItems.filter((m) => { const v = toNum(qty[m.id]); return v !== currentOf(m.id) && !Number.isNaN(v); }).map((m) => {
                  const v = toNum(qty[m.id]); const p = toNum(price[m.id]) > 0 ? toNum(price[m.id]) : getAverageUnitCost(m.id);
                  return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{m.code}</td>
                    <td className={`${td} font-bold`}>{m.nameAr}</td>
                    <td className={`text-left ${td} tnum`}>{fmt(currentOf(m.id))}</td>
                    <td className={`text-left ${td} font-extrabold text-emerald-700 tnum`}>{fmt(v)}</td>
                    <td className={`text-left ${td} tnum`}>{fmt(p, 2)}</td>
                    <td className={`text-left ${td} font-bold text-brand-700 tnum`}>{fmtMoney(v * p)}</td>
                  </tr>
                  );
                })}
                {changedCount === 0 && <tr><td colSpan={6} className={`${td} text-center text-slate-500 font-bold`}>لا توجد تغييرات في الكميات</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn tone="ghost" onClick={() => setConfirmOpen(false)}>إلغاء</Btn>
            <Btn tone="success" onClick={save}><Save className="w-4 h-4" /> تأكيد الحفظ</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};
