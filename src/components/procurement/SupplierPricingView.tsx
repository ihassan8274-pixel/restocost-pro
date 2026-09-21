import React, { useMemo, useState } from 'react';
import { BadgeDollarSign, ShoppingCart, Search, CircleDollarSign, Trophy, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, Modal } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';
import { buildPriceMatrix, cheapestFor } from '../../utils/supplierPricing';

export const SupplierPricingView: React.FC = () => {
  const {
    rawMaterials, suppliers, supplierQuotes, grnNotes, addSupplierQuote,
    inventory, purchaseOrders, visibleBranchIds, branches, addPurchaseOrder, showToast,
  } = useApp();

  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('all');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtyOver, setQtyOver] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [showQuote, setShowQuote] = useState<{ matId: string; matName: string } | null>(null);
  const [quoteForm, setQuoteForm] = useState({ supplierId: '', price: '' });

  const visibleSuppliers = suppliers.filter((s) => s.isActive);
  const scopeBranches = branch === 'all' ? visibleBranchIds : [branch];
  const activeMaterials = rawMaterials.filter((m) => m.isActive);

  const matrix = useMemo(() => buildPriceMatrix(activeMaterials, visibleSuppliers, supplierQuotes, grnNotes), [activeMaterials, visibleSuppliers, supplierQuotes, grnNotes]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeMaterials
      .filter((m) => matrix.has(m.id))
      .filter((m) => !q || m.nameAr.toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q))
      .map((m) => {
        const entries = Object.entries(matrix.get(m.id) || {});
        const prices = entries.map(([sid, e]) => ({ sid, e }));
        let min = Infinity, max = -Infinity;
        prices.forEach(({ e }) => { if (e.price < min) min = e.price; if (e.price > max) max = e.price; });
        const best = cheapestFor(m.id, matrix, visibleSuppliers, m.standardPrice || 0);
        const onHand = inventory.filter((i) => scopeBranches.includes(i.branchId)).reduce((s, i) => s + (i.rawMaterialId === m.id ? i.quantity : 0), 0);
        const onOrder = purchaseOrders.filter((p) => p.status === 'approved' && scopeBranches.includes(p.branchId))
          .reduce((s, p) => s + p.items.filter((i) => i.rawMaterialId === m.id).reduce((x, i) => x + i.quantity, 0), 0);
        const lvl = rawMaterials.find((x) => x.id === m.id)?.maxStockLevel || 0;
        const suggested = Math.max(0, lvl - (onHand + onOrder));
        return { material: m, entries: prices, min, max, best, onHand, onOrder, suggested };
      })
      .sort((a, b) => (b.best?.saving || 0) - (a.best?.saving || 0));
  }, [activeMaterials, matrix, visibleSuppliers, search, inventory, purchaseOrders, scopeBranches, rawMaterials]);

  const totalSaving = rows.reduce((s, r) => s + (r.best?.saving || 0), 0);
  const multiCount = rows.filter((r) => r.entries.length >= 2).length;

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.material.id]);
  const toggleAll = () => { const n: Record<string, boolean> = {}; rows.forEach((r) => { n[r.material.id] = !allSelected; }); setSelected(n); };

  const selectedRows = rows.filter((r) => selected[r.material.id]);

  const totalOrderValue = selectedRows.reduce((s, r) => {
    const q = Number(qtyOver[r.material.id]) || r.suggested;
    return s + q * (r.best?.price || 0);
  }, 0);
  const savingOnOrder = selectedRows.reduce((s, r) => {
    const q = Number(qtyOver[r.material.id]) || r.suggested;
    return s + (r.best?.saving || 0) * q;
  }, 0);

  const createOrders = () => {
    if (selectedRows.length === 0) { setMsg('حدد أصنافاً أولاً'); setTimeout(() => setMsg(''), 3000); return; }
    const bySupplier: Record<string, { material: typeof rows[0]['material']; qty: number; price: number; lineTotal: number }[]> = {};
    selectedRows.forEach((r) => {
      const q = Number(qtyOver[r.material.id]) || r.suggested;
      if (q <= 0 || !r.best) return;
      const sid = r.best.supplierId;
      (bySupplier[sid] = bySupplier[sid] || []).push({ material: r.material, qty: q, price: r.best.price, lineTotal: q * r.best.price });
    });
    const branchId = visibleBranchIds.includes('b-ck') ? 'b-ck' : visibleBranchIds[0] || '';
    if (Object.keys(bySupplier).length === 0) { setMsg('جميع الأصناف المحددة مغطاة بالمخزون'); setTimeout(() => setMsg(''), 3000); return; }
    const today = new Date().toISOString().split('T')[0];
    Object.entries(bySupplier).forEach(([sid, items]) => {
      const supplier = suppliers.find((s) => s.id === sid);
      const conv = items[0].material.purchaseUnitConversion && items[0].material.purchaseUnitConversion > 0 ? items[0].material.purchaseUnitConversion : 1;
      const pu = conv > 1 && !!items[0].material.purchaseUnit && !!items[0].material.purchaseUnitPrice;
      const poItems = items.map((it) => ({
        rawMaterialId: it.material.id, materialName: it.material.nameAr,
        quantity: it.qty, unit: it.material.unit,
        purchaseUnit: pu ? it.material.purchaseUnit : undefined,
        purchaseUnitConversion: pu ? conv : undefined,
        purchaseQty: pu ? it.qty / conv : undefined,
        unitPrice: it.price, lineTotal: it.lineTotal,
      }));
      addPurchaseOrder({
        supplierId: sid, supplierName: supplier?.name || sid, branchId, orderDate: today,
        expectedDate: today, status: 'draft', items: poItems,
        totalAmount: poItems.reduce((s, i) => s + i.lineTotal, 0),
        requestedBy: 'ذكاء أسعار الموردين', notes: `توليد تلقائي بأرخص الأسعار — ${items.length} صنف`,
      });
    });
    setMsg(`تم إنشاء ${Object.keys(bySupplier).length} أمر شراء لأرخص الموردين (توفير مقدر ${fmt(savingOnOrder)})`);
    setTimeout(() => setMsg(''), 4000);
    setSelected({}); setQtyOver({});
  };

  const saveQuote = () => {
    if (!showQuote) return;
    const price = Number(quoteForm.price);
    if (!quoteForm.supplierId || !isFinite(price) || price <= 0) { showToast('أكمل المورد والسعر'); return; }
    addSupplierQuote({ supplierId: quoteForm.supplierId, rawMaterialId: showQuote.matId, price, validFrom: new Date().toISOString().split('T')[0] });
    showToast('أُضيفت التسعيرة وستؤثر مباشرة في مصفوفة الأسعار');
    setShowQuote(null); setQuoteForm({ supplierId: '', price: '' });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="ذكاء أسعار الموردين" subtitle="مصفوفة أسعار فعّالة لكل صنف × مورد (التسعيرات السارية + آخر استلامات)، مع اختيار الأرخص تلقائياً وتوليد أوامر شراء موفّرة"
        icon={<BadgeDollarSign className="w-6 h-6 text-emerald-600" />}
        actions={
          <ViewToolbar filename="أسعار_الموردين"
            sheets={[{
              name: 'المصفوفة', header: ['الصنف', 'عدد المقارنين', 'أرخص مورد', 'السعر', 'توفير'],
              rows: rows.map((r) => [r.material.nameAr, r.entries.length, r.best?.supplierName || '—', r.best?.price || 0, r.best?.saving || 0]),
            }]} />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف بأسعار متاحة</span>
          <strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{rows.length}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">بأكثر من مورد (مقارنة)</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{multiCount}</strong>
          <span className="text-[10px] text-slate-400 font-bold">من {visibleSuppliers.length} مورد نشط</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">التوفير المحتمل (لكل عملية شراء)</span>
          <strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmt(totalSaving)}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة الطلب الذكي المحدد</span>
          <strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(totalOrderValue)}</strong>
          <span className="text-[10px] font-bold text-emerald-600">{selectedRows.length > 0 && `توفير ${fmt(savingOnOrder)}`}</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <Field label="بحث في الأصناف">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' !pr-8'} placeholder="اسم الصنف أو الكود" />
            </div>
          </Field>
          <Field label="نطاق المخزون">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls + ' !w-52'}>
              <option value="all">جميع الفروع المتاحة</option>
              {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <div className="flex gap-2 pb-0.5">
            <Btn onClick={toggleAll}>{allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}</Btn>
            <Btn tone="success" onClick={createOrders}><ShoppingCart className="w-3.5 h-3.5" /> توليد أوامر شراء ذكية ({selectedRows.length})</Btn>
          </div>
        </div>
        {msg && <div className={`mt-3 rounded-xl p-3 font-bold text-xs border ${msg.includes('تم') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg}</div>}
      </Card>

      <Card className="overflow-hidden" >
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[980px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-emerald-600" /></th>
                <th className="p-3">الصنف</th>
                {visibleSuppliers.map((s) => (
                  <th key={s.id} className="p-3">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-[9px] text-slate-400 font-medium">تقييم {s.rating} · دفع {s.paymentTermsDays} يوم</div>
                  </th>
                ))}
                <th className="p-3 text-emerald-700">أرخص مورد</th>
                <th className="p-3">مخزون / طلب</th>
                <th className="p-3 w-32">كمية الطلب</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.material.id} className="hover:bg-slate-50">
                  <td className="p-3"><input type="checkbox" checked={!!selected[r.material.id]} onChange={() => setSelected((s) => ({ ...s, [r.material.id]: !s[r.material.id] }))} className="w-4 h-4 accent-emerald-600" /></td>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{r.material.nameAr}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.material.code} · {r.material.unit}</div>
                  </td>
                  {visibleSuppliers.map((s) => {
                    const e = r.entries.find((x) => x.sid === s.id);
                    if (!e) return <td key={s.id} className="p-3 text-slate-300 text-[10px] font-bold">—</td>;
                    const isMin = e.e.price === r.min;
                    const isMax = e.e.price === r.max && r.min !== r.max;
                    return (
                      <td key={s.id} className={`p-3 font-mono font-bold ${isMin ? 'text-emerald-700' : isMax ? 'text-rose-600' : 'text-slate-700'}`}>
                        {fmt(e.e.price, 2)}
                        <span className={`block text-[9px] font-bold ${e.e.source === 'quote' ? 'text-indigo-400' : 'text-slate-400'}`}>
                          {e.e.source === 'quote' ? 'تسعيرة' : 'استلام'} · {e.e.date.slice(0, 10)}
                        </span>
                        {isMin && <span className="inline-block text-[9px] font-extrabold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full mt-0.5">أرخص</span>}
                      </td>
                    );
                  })}
                  <td className="p-3">
                    {r.best ? (
                      <div>
                        <div className="font-extrabold text-emerald-700 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> {r.best.supplierName}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{fmt(r.best.price, 2)} · توفير {fmt(r.best.saving, 2)} ({fmt(r.best.savingPct, 0)}%)</div>
                      </div>
                    ) : <span className="text-slate-300 text-[10px] font-bold">—</span>}
                  </td>
                  <td className="p-3 font-mono text-[10px] text-slate-500 font-bold">{fmt(r.onHand, 0)} / {fmt(r.onOrder, 0)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" value={qtyOver[r.material.id] ?? (selected[r.material.id] ? r.suggested : '')}
                        onChange={(e) => { if (selected[r.material.id]) setQtyOver((s) => ({ ...s, [r.material.id]: e.target.value })); }}
                        onFocus={() => { if (!selected[r.material.id]) setSelected((s) => ({ ...s, [r.material.id]: true })); }}
                        className={inputCls + ' !py-1 !text-xs !w-20'} placeholder={String(r.suggested)} /> <span className="text-[9px] text-slate-400">{r.material.unit}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <button onClick={() => { setShowQuote({ matId: r.material.id, matName: r.material.nameAr }); setQuoteForm({ supplierId: '', price: '' }); }} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      <CircleDollarSign className="w-3.5 h-3.5" /> تسعيرة
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={visibleSuppliers.length + 6} className="p-10 text-center text-slate-400 text-xs font-bold">
                  لا توجد أسعار مسجلة — أضف تسعيرات من زر «تسعيرة» أو من وحدة الموردين، أو سجّل استلامات GRN لبناء المصفوفة
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!showQuote} onClose={() => setShowQuote(null)} title={`تسعيرة جديدة — ${showQuote?.matName || ''}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="المورد">
            <select value={quoteForm.supplierId} onChange={(e) => setQuoteForm({ ...quoteForm, supplierId: e.target.value })} className={inputCls}>
              <option value="">اختر</option>
              {visibleSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="السعر (لكل وحدة مخزون)">
            <input type="number" step="0.01" value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} className={inputCls} placeholder="0.00" />
          </Field>
        </div>
        <p className="text-[11px] text-slate-500 font-bold mt-3 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> التسعيرة السارية تُفضَّل تلقائياً على آخر أسعار الاستلام وتؤثر فوراً في اختيار «الأرخص».</p>
        <div className="pt-4 flex justify-end gap-2">
          <Btn tone="ghost" onClick={() => setShowQuote(null)}>إلغاء</Btn>
          <Btn onClick={saveQuote}>حفظ التسعيرة</Btn>
        </div>
      </Modal>
    </div>
  );
};