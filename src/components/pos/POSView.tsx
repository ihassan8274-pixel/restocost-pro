import React, { useState, useRef, useEffect } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, Printer, Pencil, Search, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, DocumentFingerprint } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney } from '../../utils/helpers';
import { vatSplit } from '../../utils/vat';
import { openPrintWindow } from '../../utils/print';
import { sellerFor, zatcaTLV, zatcaQrDataUrl } from '../../utils/zatca';
import { POSOrderItem, POSOrder } from '../../types';
import { posAliasMatch } from '../../utils/aliases';

const TYPE_LABEL: Record<string, string> = { dine_in: 'في المطعم', takeaway: 'استلام', delivery_app: 'تطبيق توصيل' };

export const POSView: React.FC = () => {
  const { recipes, visibleBranchIds, branches, companies, addPOSOrder, updatePOSOrder, deletePOSOrder, posOrders, getBranchName, calculateRecipeCosts, showToast, vatPercent, vatInclusive, addRecentDoc } = useApp();
  const [branchId, setBranchId] = useState(visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery_app'>('dine_in');
  const [cart, setCart] = useState<POSOrderItem[]>([]);
  const [posSearch, setPosSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setPosSearch('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [editOrder, setEditOrder] = useState<POSOrder | null>(null);
  const [editItems, setEditItems] = useState<POSOrderItem[]>([]);
  const [editBranch, setEditBranch] = useState('');
  const [editType, setEditType] = useState<'dine_in' | 'takeaway' | 'delivery_app'>('dine_in');

  const vatInfo = (gross: number) => {
    const { vat, total } = vatSplit(gross, vatPercent / 100, vatInclusive);
    return { vat, total };
  };

  const saleItems = recipes.filter((r) => !r.isCentralKitchenPrep && r.isActive);
  const filteredSaleItems = posSearch.trim() ? saleItems.filter((r) => posAliasMatch(posSearch, r)) : saleItems;
  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const recent = posOrders.slice(0, 12);

  const addToCart = (recipeId: string) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    const costs = calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost);
    const price = rec.actualMenuPrice || costs.suggestedPrice;
    setCart((prev) => {
      const existing = prev.find((i) => i.recipeId === recipeId);
      if (existing) return prev.map((i) => (i.recipeId === recipeId ? { ...i, quantity: i.quantity + 1, lineTotal: (i.quantity + 1) * i.unitPrice } : i));
      return [...prev, { recipeId: rec.id, recipeName: rec.nameAr, quantity: 1, unitPrice: price, unitCost: costs.totalCost, lineTotal: price }];
    });
  };

  const changeQty = (recipeId: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.recipeId !== recipeId) return i;
      const q = i.quantity + delta;
      if (q <= 0) return i;
      return { ...i, quantity: q, lineTotal: q * i.unitPrice };
    }));
  };

  const removeItem = (recipeId: string) => setCart((prev) => prev.filter((i) => i.recipeId !== recipeId));

  const checkout = () => {
    if (cart.length === 0) return;
    const res = addPOSOrder({ branchId, orderType, items: cart, cashierName: 'المستخدم' });
    if (res && res.autoSupplied.length > 0) {
      showToast(`تم التوريد التلقائي من المطبخ المركزي لتغطية: ${res.autoSupplied.slice(0, 5).join('، ')}${res.autoSupplied.length > 5 ? '…' : ''}`);
    }
    const title = cart.length > 0 ? `${cart.reduce((s, i) => s + i.quantity, 0)} صنف — ${fmtMoney(cart.reduce((s, i) => s + i.lineTotal, 0))}` : 'مبيعة نقطة البيع';
    addRecentDoc({ type: 'pos', title, tab: 'pos' });
    setCart([]);
  };

  const printInvoice = async (o: POSOrder) => {
    let qr: string | undefined;
    if (o.vatAmount > 0) {
      const seller = sellerFor(companies, branches, o.branchId);
      if (seller.vatNumber) {
        qr = await zatcaQrDataUrl(zatcaTLV({ sellerName: seller.name, vatNumber: seller.vatNumber, timeISO: new Date(o.date).toISOString(), totalWithVat: o.totalAmount, vatAmount: o.vatAmount }));
      }
    }
    openPrintWindow({
      title: `فاتورة نقطة البيع — ${o.orderNumber}`,
      subtitle: 'فاتورة بيع',
      meta: [
        ['الفرع', o.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(o.branchId)],
        ['نوع الطلب', TYPE_LABEL[o.orderType]],
        ['التاريخ', new Date(o.date).toLocaleString('ar-SA-u-nu-latn')],
        ['الكاشير', o.cashierName || '—'],
        ['رقم الفاتورة', o.orderNumber],
      ],
      tables: [{
        title: 'الأصناف',
        header: ['#', 'الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي'],
        rows: o.items.map((it, idx) => [idx + 1, it.recipeName, it.quantity, fmt(it.unitPrice), fmt(it.lineTotal)]),
      }],
      totals: [
        ['الإجمالي قبل الضريبة', `${fmtMoney(o.subtotal)}`],
        ['ضريبة القيمة المضافة', `${fmtMoney(o.vatAmount)}`],
        ['الإجمالي النهائي', `${fmtMoney(o.totalAmount)}`],
      ],
      footer: 'فاتورة بيع صادرة من نظام RestoCost ERP',
      qr,
    });
  };

  const openEdit = (o: POSOrder) => {
    setEditOrder(o);
    setEditItems(o.items.map((i) => ({ ...i })));
    setEditBranch(o.branchId);
    setEditType(o.orderType);
  };

  const editTotal = editItems.reduce((s, i) => s + i.lineTotal, 0);

  const addEditItem = () => {
    const rec = saleItems.find((r) => !editItems.some((i) => i.recipeId === r.id)) || saleItems[0];
    if (!rec) return;
    const costs = calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost);
    const price = rec.actualMenuPrice || costs.suggestedPrice;
    setEditItems((prev) => [...prev, { recipeId: rec.id, recipeName: rec.nameAr, quantity: 1, unitPrice: price, unitCost: costs.totalCost, lineTotal: price }]);
  };
  const changeEditQty = (recipeId: string, delta: number) => {
    setEditItems((prev) => prev.map((i) => {
      if (i.recipeId !== recipeId) return i;
      const q = Math.max(0, i.quantity + delta);
      return { ...i, quantity: q, lineTotal: q * i.unitPrice };
    }).filter((i) => i.quantity > 0));
  };
  const saveEdit = () => {
    if (!editOrder) return;
    const items = editItems;
    if (items.length === 0) return;
    updatePOSOrder(editOrder.id, { branchId: editBranch, orderType: editType, items });
    setEditOrder(null);
  };
  const confirmDelete = (o: POSOrder) => {
    if (confirm(`حذف الفاتورة ${o.orderNumber}؟ سيُرجع المخزون المستهلك تلقائياً.`)) deletePOSOrder(o.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="نقطة البيع (POS)" subtitle="إصدار فواتير سريعة، طباعة، تعديل أو حذف الفواتير الصادرة، وخصم المخزون تلقائياً" icon={<ShoppingCart className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="نقطة_البيع"
            sheets={[
              { name: 'الأصناف المتاحة', header: ['الكود', 'الصنف', 'الفئة', 'سعر البيع'], rows: saleItems.map((r) => { const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost); const price = r.actualMenuPrice || costs.suggestedPrice; return [r.code, r.nameAr, r.category, price]; }) },
              { name: 'الفاتورة الحالية', header: ['الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي'], rows: cart.map((i) => [i.recipeName, i.quantity, i.unitPrice, i.lineTotal]) },
              { name: 'الفواتير الصادرة', header: ['الرقم', 'الفرع', 'النوع', 'التاريخ', 'الأصناف', 'الإجمالي'], rows: recent.map((o) => [o.orderNumber, o.branchId, TYPE_LABEL[o.orderType], o.date, o.items.reduce((s, i) => s + i.quantity, 0), o.totalAmount]) },
            ]}
          />
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              {branches.filter((b) => visibleBranchIds.includes(b.id) && b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
            <div className="flex gap-1">
              {(['dine_in', 'takeaway', 'delivery_app'] as const).map((t) => (
                <button key={t} onClick={() => setOrderType(t)} className={`px-3 py-1.5 text-[11px] font-bold rounded-lg ${orderType === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t === 'dine_in' ? 'في المطعم' : t === 'takeaway' ? 'استلام' : 'تطبيق توصيل'}</button>
              ))}
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
            <input
              ref={searchRef}
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredSaleItems.length > 0) { addToCart(filteredSaleItems[0].id); setPosSearch(''); }
                }
              }}
              placeholder="بحث بلغة المطبخ (مثال: بن قهوة، قرش، معصوب، عصيدة) — اضغط / للبحث"
              className="w-full pl-8 pr-9 py-2 text-xs font-bold rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:bg-white outline-none transition-colors"
            />
            {posSearch && (
              <button onClick={() => setPosSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredSaleItems.map((r) => {
              const costs = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
              const price = r.actualMenuPrice || costs.suggestedPrice;
              return (
                <button key={r.id} onClick={() => addToCart(r.id)} className="bg-slate-50 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl p-3 text-right transition-colors">
                  <p className="font-bold text-slate-800 text-xs">{r.nameAr}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{r.code}</p>
                  <p className="font-mono font-extrabold text-indigo-700 text-xs mt-1">{fmt(price, 2)} ر.س</p>
                </button>
              );
            })}
            {filteredSaleItems.length === 0 && (
              <div className="col-span-full text-center py-10 text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-xl">
                لا نتائج لـ «{posSearch}» — جرّب مرادفاً آخر (مثال: قرش، معصوب، بن قهوة)
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col">
          <h3 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5"><ShoppingCart className="w-4 h-4 text-indigo-500" /> الفاتورة الحالية</h3>
          <div className="flex-1 space-y-2 max-h-[380px] overflow-y-auto">
            {cart.length === 0 && <p className="text-center text-slate-400 text-xs py-8 font-bold">الفاتورة فارغة</p>}
            {cart.map((i) => (
              <div key={i.recipeId} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-xs truncate">{i.recipeName}</p>
                  <p className="font-mono text-[10px] text-slate-500">{fmt(i.unitPrice)} × {fmt(i.quantity)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(i.recipeId, -1)} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center font-mono font-bold text-xs">{fmt(i.quantity)}</span>
                  <button onClick={() => changeQty(i.recipeId, 1)} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => removeItem(i.recipeId)} className="w-6 h-6 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-3 mt-3 border-t border-slate-200 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-600 font-bold"><span>الإجمالي</span><span className="font-mono">{fmt(subtotal, 2)}</span></div>
            <div className="flex justify-between text-xs text-slate-600 font-bold"><span>الضريبة ({vatPercent}%)</span><span className="font-mono">{fmt(vatInfo(subtotal).vat, 2)}</span></div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900"><span>النهائي</span><span className="font-mono text-indigo-700">{fmtMoney(vatInfo(subtotal).total)}</span></div>
            <Btn className="w-full justify-center mt-1" onClick={() => { if (cart.length > 0) checkout(); }}><CreditCard className="w-4 h-4" /> إصدار الفاتورة</Btn>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <h3 className="font-bold text-slate-800 text-xs">الفواتير الصادرة ({recent.length}) — طباعة / تعديل (إضافة أو تغيير أو حذف أصناف) / حذف</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-2">رقم الفاتورة</th><th className="p-2">الفرع</th><th className="p-2">النوع</th><th className="p-2">التاريخ</th><th className="p-2">الأصناف</th><th className="p-2">الإجمالي</th><th className="p-2">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="p-2 font-mono font-bold text-indigo-700">{o.orderNumber}</td>
                  <td className="p-2 text-slate-600">{o.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(o.branchId)}</td>
                  <td className="p-2">{TYPE_LABEL[o.orderType]}</td>
                  <td className="p-2 font-mono text-slate-500">{new Date(o.date).toLocaleString('ar-SA-u-nu-latn')}</td>
                  <td className="p-2 font-bold">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="p-2 font-mono font-extrabold">{fmtMoney(o.totalAmount)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button onClick={() => printInvoice(o)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="طباعة الفاتورة"><Printer className="w-4 h-4" /></button>
                      <button onClick={() => openEdit(o)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="تعديل الفاتورة (إضافة/تغيير/حذف أصناف)"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => confirmDelete(o)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف الفاتورة"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">لا توجد فواتير صادرة بعد</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={editOrder !== null} onClose={() => setEditOrder(null)} title={`تعديل الفاتورة ${editOrder?.orderNumber || ''}`} wide>
        <DocumentFingerprint entityType="posOrder" entityId={editOrder?.id || ''} title={`بصمة الفاتورة ${editOrder?.orderNumber || ''}`} />
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع">
              <select value={editBranch} onChange={(e) => setEditBranch(e.target.value)} className={inputCls}>
                {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="نوع الطلب">
              <select value={editType} onChange={(e) => setEditType(e.target.value as 'dine_in' | 'takeaway' | 'delivery_app')} className={inputCls}>
                <option value="dine_in">في المطعم</option><option value="takeaway">استلام</option><option value="delivery_app">تطبيق توصيل</option>
              </select>
            </Field>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">أصناف الفاتورة</span>
              <Btn onClick={addEditItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
            </div>
            {editItems.map((i) => (
              <div key={i.recipeId} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-xs truncate">{i.recipeName}</p>
                  <p className="font-mono text-[10px] text-slate-500">{fmt(i.unitPrice)} × {fmt(i.quantity)} = {fmt(i.lineTotal, 2)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeEditQty(i.recipeId, -1)} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center font-mono font-bold text-xs">{fmt(i.quantity)}</span>
                  <button onClick={() => changeEditQty(i.recipeId, 1)} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
            {editItems.length === 0 && <p className="text-center text-slate-400 text-xs py-3">لا توجد أصناف — أضف صنفاً على الأقل</p>}
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 flex items-center justify-between">
            <span className="font-bold text-indigo-950">الإجمالي الجديد</span>
            <span className="text-lg font-black text-indigo-800 font-mono">{fmtMoney(vatInfo(editTotal).total)}</span>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button onClick={() => setEditOrder(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button onClick={saveEdit} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ التعديل</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};