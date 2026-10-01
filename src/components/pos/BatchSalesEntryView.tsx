import React, { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { fmt, fmtNum, fmtMoney, navOnEnter, netOfGross, vatOfGross } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import type { BatchSalesRecord } from '../../types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtQty = fmtNum;
const fmtPct = (n: number) => `${fmtNum(n)}%`;

interface Props {
  editId?: string | null;
  onDone: () => void;
}

export const BatchSalesEntryView: React.FC<Props> = ({ editId, onDone }) => {
  const { recipes, visibleBranchIds, branches, batchSalesRecords, addBatchSalesRecord, updateBatchSalesRecord, calculateRecipeCosts, showToast, vatPercent } = useApp();
  const isEditing = !!editId;

  const vatRate = vatPercent / 100;
  const [branchId, setBranchId] = useState(visibleBranchIds.find((b) => b !== 'b-ck') || visibleBranchIds[0] || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<{ recipeId: string; quantitySold: number; unitPrice: number; lineTotal: number }[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [manualTotal, setManualTotal] = useState<number | ''>('');
  const [record, setRecord] = useState<BatchSalesRecord | null>(null);

  const saleItems = recipes.filter((r) => !r.isCentralKitchenPrep && r.isActive);
  const filteredMenu = saleItems.filter((r) => !menuSearch || r.nameAr.includes(menuSearch) || r.code.includes(menuSearch));

  const entryTotal = entries.reduce((s, x) => s + (x.lineTotal || 0), 0);
  const validCount = entries.filter((en) => en.recipeId && en.quantitySold > 0).length;

  const entryNet = netOfGross(entryTotal, vatRate);
  const entryVat = vatOfGross(entryTotal, vatRate);
  const entryFoodCost = entries.reduce((s, x) => {
    if (!x.recipeId || x.quantitySold <= 0) return s;
    const rec = recipes.find((r) => r.id === x.recipeId);
    if (!rec) return s;
    return s + calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces).totalCost * x.quantitySold;
  }, 0);
  const entryFcNet = entryNet ? (entryFoodCost / entryNet) * 100 : 0;

  useEffect(() => {
    if (isEditing) {
      const rec = batchSalesRecords.find((b) => b.id === editId) || null;
      if (rec) {
        setRecord(rec);
        setBranchId(rec.branchId);
        setDate(rec.date);
        setEntries(saleItems.map((r) => {
          const item = rec.items.find((i) => i.recipeId === r.id);
          const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
          const price = item ? item.unitPrice : (r.actualMenuPrice || costs.suggestedPrice);
          return { recipeId: r.id, quantitySold: item ? item.quantitySold : 0, unitPrice: price, lineTotal: item ? item.lineTotalRevenue : 0 };
        }));
      } else {
        showToast('السجل غير موجود');
        onDone();
      }
    } else {
      setRecord(null);
      setEntries(saleItems.map((r) => {
        const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost, r.subPrepIngredients, r.yieldPieces);
        return { recipeId: r.id, quantitySold: 0, unitPrice: r.actualMenuPrice || costs.suggestedPrice, lineTotal: 0 };
      }));
      setDate(new Date().toISOString().slice(0, 10));
      setBranchId(visibleBranchIds.find((b) => b !== 'b-ck') || visibleBranchIds[0] || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const setEntry = (idx: number, patch: Partial<{ recipeId: string; quantitySold: number; unitPrice: number; lineTotal: number }>) =>
    setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const onQty = (idx: number, q: number) => setEntry(idx, { quantitySold: q, lineTotal: round2(q * entries[idx].unitPrice) });
  const onPrice = (idx: number, p: number) => setEntry(idx, { unitPrice: p, lineTotal: round2(entries[idx].quantitySold * p) });
  const onTotal = (idx: number, t: number) => setEntry(idx, { lineTotal: t, unitPrice: entries[idx].quantitySold > 0 ? round2(t / entries[idx].quantitySold) : entries[idx].unitPrice });

  const applyManualTotal = () => {
    const t = Number(manualTotal);
    if (!t || t <= 0) { showToast('أدخل إجمالي المبيعات أولاً'); return; }
    const cur = entries.reduce((s, x) => s + (x.lineTotal || 0), 0);
    if (cur <= 0) { showToast('أضف أصنافاً بمبالغ أولاً'); return; }
    const factor = t / cur;
    setEntries((prev) => prev.map((x) => {
      const lineTotal = round2(x.lineTotal * factor);
      return { ...x, lineTotal, unitPrice: x.quantitySold > 0 ? round2(lineTotal / x.quantitySold) : x.unitPrice };
    }));
    showToast('تم توزيع الإجمالي على الأصناف حسب نسب الإيراد');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = entries.filter((en) => en.recipeId && en.quantitySold > 0);
    if (valid.length === 0) { showToast('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر'); return; }
    const items = valid.map((en) => {
      const rec = recipes.find((r) => r.id === en.recipeId)!;
      const costs = calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces);
      const price = en.unitPrice || rec.actualMenuPrice || costs.suggestedPrice;
      return {
        recipeId: rec.id, recipeNameAr: rec.nameAr, category: rec.category,
        quantitySold: en.quantitySold, unitPrice: price, unitCost: costs.totalCost,
        lineTotalRevenue: round2(price * en.quantitySold), lineTotalCost: round2(costs.totalCost * en.quantitySold),
      };
    });
    const totalRevenue = items.reduce((s, i) => s + i.lineTotalRevenue, 0);
    const totalFoodCost = items.reduce((s, i) => s + i.lineTotalCost, 0);
    const netRevenue = netOfGross(totalRevenue, vatRate);
    const vatAmount = vatOfGross(totalRevenue, vatRate);
    const branch = branches.find((b) => b.id === branchId);
    if (isEditing && editId) {
      updateBatchSalesRecord(editId, { branchId, date, items });
      showToast('تم حفظ تعديل المبيعات — عُدّل المخزون والقيود تلقائياً');
    } else {
      addBatchSalesRecord({
        branchId, branchName: branch?.nameAr || branchId, date,
        items, totalRevenue, totalFoodCost, vatRate: vatRate, netRevenue, vatAmount,
        foodCostPercent: netRevenue ? round2((totalFoodCost / netRevenue) * 100) : 0, enteredBy: 'المستخدم',
      });
      showToast('تم إدخال مبيعات اليوم — خُصم المخزون تلقائياً');
    }
    onDone();
  };

  const printCurrent = () => {
    const valid = entries.filter((en) => en.recipeId && en.quantitySold > 0);
    if (valid.length === 0) { showToast('لا توجد بيانات للطباعة'); return; }
    const items = valid.map((en) => {
      const rec = recipes.find((r) => r.id === en.recipeId)!;
      const costs = calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces);
      const price = en.unitPrice || rec.actualMenuPrice || costs.suggestedPrice;
      return {
        recipeId: rec.id, recipeNameAr: rec.nameAr, category: rec.category,
        quantitySold: en.quantitySold, unitPrice: price, unitCost: costs.totalCost,
        lineTotalRevenue: round2(price * en.quantitySold), lineTotalCost: round2(costs.totalCost * en.quantitySold),
      };
    });
    const totalRevenue = items.reduce((s, i) => s + i.lineTotalRevenue, 0);
    const totalFoodCost = items.reduce((s, i) => s + i.lineTotalCost, 0);
    const netRevenue = netOfGross(totalRevenue, vatRate);
    const branch = branches.find((b) => b.id === branchId);
    openPrintWindow({
      title: `تقرير مبيعات — ${record?.batchNumber || 'مسودة جديدة'}`,
      subtitle: `${branch?.nameAr || branchId} — ${date}`,
      meta: [
        ['الفرع', branch?.nameAr || branchId], ['التاريخ', date],
        ['عدد الأصناف', fmtQty(items.reduce((s, i) => s + i.quantitySold, 0))], ['نسبة الضريبة', fmtPct(vatRate * 100)],
        ['Food Cost (على الصافي)', fmtPct(netRevenue ? (totalFoodCost / netRevenue) * 100 : 0)],
      ],
      tables: [{
        title: 'الأصناف المباعة (شاملة الضريبة)',
        header: ['#', 'الصنف', 'الفئة', 'الكمية', 'سعر الوحدة', 'الإيراد'],
        rows: items.map((it, idx) => [idx + 1, it.recipeNameAr, it.category, fmtQty(it.quantitySold), fmt(it.unitPrice, 2), fmt(it.lineTotalRevenue, 2)]),
      }],
      totals: [
        ['الإجمالي (شامل الضريبة)', `${fmtMoney(totalRevenue)}`],
        ['صافي الإيرادات', `${fmtMoney(netRevenue)}`],
        ['ضريبة القيمة المضافة', `${fmtMoney(vatOfGross(totalRevenue, vatRate))}`],
        ['تكلفة الطعام', `${fmtMoney(totalFoodCost)}`],
        ['هامش الربح (على الصافي)', `${fmtMoney(netRevenue - totalFoodCost)}`],
      ],
      footer: 'تقرير مبيعات يومية — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={isEditing ? 'تعديل سجل المبيعات' : 'إدخال مبيعات اليوم'} subtitle="صفحة كاملة ثابتة — اكتب وانتقل بين الحقول بحرية دون أي اختفاء" icon={<ArrowLeft className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <Btn onClick={onDone} tone="ghost"><ArrowLeft className="w-4 h-4" /> رجوع للقائمة</Btn>
          <Btn onClick={printCurrent} tone="dark"><Printer className="w-4 h-4" /> طباعة</Btn>
        </>} />

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="الفرع">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                {branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="التاريخ">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="بحث في المنيو">
              <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className={inputCls} placeholder="اكتب اسم أو كود الصنف…" />
            </Field>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2.5">الصنف</th>
                    <th className="p-2.5 w-24">الكمية</th>
                    <th className="p-2.5 w-28">السعر</th>
                    <th className="p-2.5 w-28">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMenu.map((r) => {
                    const idx = entries.findIndex((en) => en.recipeId === r.id);
                    const en = idx >= 0 ? entries[idx] : { quantitySold: 0, unitPrice: r.actualMenuPrice || 0, lineTotal: 0 };
                    return (
                      <tr key={r.id} className={en.quantitySold > 0 ? 'bg-indigo-50/40' : ''}>
                        <td className="p-2">
                          <div className="font-bold text-slate-900">{r.nameAr}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" step="0.01" data-nav value={en.quantitySold || ''} onChange={(e) => idx >= 0 && onQty(idx, parseFloat(e.target.value) || 0)} onKeyDown={navOnEnter} className={inputCls} placeholder="0" />
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" step="0.01" data-nav value={en.unitPrice || ''} onChange={(e) => idx >= 0 && onPrice(idx, parseFloat(e.target.value) || 0)} onKeyDown={navOnEnter} className={inputCls} placeholder="0" />
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" step="0.01" data-nav value={en.lineTotal || ''} onChange={(e) => idx >= 0 && onTotal(idx, parseFloat(e.target.value) || 0)} onKeyDown={navOnEnter} className={inputCls + ' !bg-indigo-50 !border-indigo-200'} placeholder="0" />
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMenu.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-amber-600 font-bold">لا يوجد صنف يطابق «{menuSearch}»</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500">الأصناف المختارة: {validCount} — السعر مدخل مسبقاً من المنيو، عدّله يدوياً إن لزم.</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-bold text-slate-500">إجمالي المبيعات:</span>
              <input type="number" min="0" step="0.01" value={manualTotal === '' ? '' : manualTotal} onChange={(e) => setManualTotal(e.target.value === '' ? '' : parseFloat(e.target.value))} className={inputCls + ' !w-28'} placeholder={fmt(entryTotal, 2)} />
              <Btn type="button" tone="ghost" onClick={applyManualTotal}>توزيع على الأصناف</Btn>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200"><span className="text-emerald-700 text-[10px] block font-bold">الإجمالي (شامل الضريبة)</span><strong className="text-emerald-900 font-mono block mt-0.5 text-sm">{fmtMoney(entryTotal)}</strong></div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200"><span className="text-amber-700 text-[10px] block font-bold">ضريبة القيمة المضافة ({vatRate * 100}%)</span><strong className="text-amber-900 font-mono block mt-0.5 text-sm">{fmtMoney(entryVat)}</strong></div>
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200"><span className="text-indigo-700 text-[10px] block font-bold">الصافي</span><strong className="text-indigo-900 font-mono block mt-0.5 text-sm">{fmtMoney(entryNet)}</strong></div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200"><span className="text-slate-500 text-[10px] block font-bold">تكلفة الطعام</span><strong className="text-slate-900 font-mono block mt-0.5 text-sm">{fmtMoney(entryFoodCost)}</strong></div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200"><span className="text-rose-700 text-[10px] block font-bold">Food Cost % (على الصافي)</span><strong className="text-rose-900 font-mono block mt-0.5 text-sm">{entryFcNet.toFixed(2)}%</strong></div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">{isEditing ? 'حفظ التعديل' : 'حفظ المبيعات'}</button>
          </div>
        </form>
      </Card>
    </div>
  );
};