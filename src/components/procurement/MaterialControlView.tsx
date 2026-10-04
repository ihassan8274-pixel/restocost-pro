import React, { useState } from 'react';
import { RotateCcw, RefreshCcw, BadgeCheck, Send, Ban, Plus, Trash2, Printer, FileDown, ClipboardCheck, PackageCheck, PackageSearch, Truck, Factory, Scale, Landmark, ShoppingBag, CheckCircle2, History } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, TabBar, Btn, inputCls, Field, Modal, StatusPill, CurrencySelect, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { SupplierQuote, SupplierReturnItem } from '../../types';

type TabId = 'cycle' | 'quotes' | 'receiving' | 'returns';

const RETURN_STATUS_LABELS: Record<string, string> = { draft: 'مسودة', submitted: 'مقدمة', approved: 'معتمدة', rejected: 'مرفوضة' };

export const MaterialControlView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    rawMaterials, recipes, suppliers, supplierQuotes, supplierReturns, purchaseOrders, grnNotes,
    stockTransfers, workOrders, wastageLogs, physicalCounts, inventory, journalEntries, branches,
    visibleBranchIds, currentUser, can, getAverageUnitCost, getQuotePrice,
    addSupplierQuote, updateSupplierQuote, deleteSupplierQuote,
    addSupplierReturn, updateSupplierReturn, approveSupplierReturn, getBranchName,
    getCurrencyRate,
  } = useApp();
  const [tab, setTab] = useState<TabId>('cycle');

  // ---------- cycle computations ----------
  const onHandOf = (matId: string) => inventory.filter((i) => i.rawMaterialId === matId).reduce((s, i) => s + i.quantity, 0);
  const lowStockMats = rawMaterials.filter((m) => m.isActive && onHandOf(m.id) < m.minStockLevel);
  const lowStockValue = lowStockMats.reduce((s, m) => s + Math.max(0, m.minStockLevel - onHandOf(m.id)) * getAverageUnitCost(m.id), 0);
  const openPOs = purchaseOrders.filter((p) => ['draft', 'submitted', 'approved'].includes(p.status));
  const openPOValue = openPOs.reduce((s, p) => s + p.totalAmount, 0);
  const pendingPO = purchaseOrders.filter((p) => p.status === 'submitted').length;
  const approvedGRNs = grnNotes.filter((g) => g.status === 'approved');
  const grnValue = approvedGRNs.reduce((s, g) => s + g.totalAmount, 0);
  const openTransfers = stockTransfers.filter((t) => t.status !== 'approved').length;
  const openWorkOrders = workOrders.filter((w) => w.status === 'planned' || w.status === 'in_progress').length;
  const wastageValue = wastageLogs.reduce((s, w) => s + w.totalCostImpact, 0);
  const returnPending = supplierReturns.filter((r) => r.status === 'draft' || r.status === 'submitted');
  const returnValue = returnPending.reduce((s, r) => s + r.totalAmount, 0);
  const varianceCost = physicalCounts.reduce((s, c) => s + c.totalVarianceCost, 0);
  const stockValue = inventory.reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
  const autoEntries = journalEntries.filter((j) => j.source === 'auto').length;

  const stages = [
    { id: 1, icon: <ClipboardCheck className="w-5 h-5" />, label: 'التكوين', sub: `${rawMaterials.length} مادة · ${recipes.length} وصفة · ${suppliers.length} مورد`, badge: `${supplierQuotes.length} عرض سعر`, nav: 'inventory', color: 'from-slate-500 to-slate-600' },
    { id: 2, icon: <ShoppingBag className="w-5 h-5" />, label: 'الاقتراحات', sub: `${lowStockMats.length} مادة تحت الحد الأدنى`, badge: fmtMoney(lowStockValue), nav: 'true_cost', color: 'from-amber-500 to-orange-600' },
    { id: 3, icon: <PackageSearch className="w-5 h-5" />, label: 'أوامر الشراء', sub: `${openPOs.length} مفتوحة · ${pendingPO} بانتظار الاعتماد`, badge: fmtMoney(openPOValue), nav: 'purchase_orders', color: 'from-indigo-500 to-violet-600' },
    { id: 4, icon: <PackageCheck className="w-5 h-5" />, label: 'الاستلام (GRN)', sub: `${approvedGRNs.length} إشعار معتمد`, badge: fmtMoney(grnValue), nav: 'goods_receiving', color: 'from-emerald-500 to-teal-600' },
    { id: 5, icon: <Factory className="w-5 h-5" />, label: 'التحويل والإنتاج', sub: `${openTransfers} تحويل مفتوح · ${openWorkOrders} أمر عمل`, badge: 'حركة بينية', nav: 'stock_transfers', color: 'from-cyan-500 to-sky-600' },
    { id: 6, icon: <Truck className="w-5 h-5" />, label: 'الصرف والإرجاع', sub: `${wastageLogs.length} هالك · ${returnPending.length} إرجاع قيد الاعتماد`, badge: fmtMoney(wastageValue + returnValue), nav: 'wastage', color: 'from-rose-500 to-pink-600' },
    { id: 7, icon: <Scale className="w-5 h-5" />, label: 'الجرد والمراجعة', sub: `${physicalCounts.length} جولة جرد`, badge: `${fmtMoney(varianceCost)} فرق`, nav: 'inventory', color: 'from-blue-500 to-indigo-600' },
    { id: 8, icon: <Landmark className="w-5 h-5" />, label: 'التقييم والقيود', sub: `${autoEntries} قيد تلقائي للمستندات`, badge: fmtMoney(stockValue), nav: 'inventory_valuation', color: 'from-slate-700 to-slate-900' },
  ];

  // ---------- quotes ----------
  const [qSupplier, setQSupplier] = useState(suppliers[0]?.id || '');
  const [qMaterial, setQMaterial] = useState(rawMaterials[0]?.id || '');
  const [qPrice, setQPrice] = useState('');
  const [qCurrency, setQCurrency] = useState('SAR');
  const [qFrom, setQFrom] = useState(new Date().toISOString().slice(0, 10));
  const [qTo, setQTo] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [qEditId, setQEditId] = useState('');
  const [histTarget, setHistTarget] = useState<SupplierQuote | null>(null);

  const saveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qSupplier || !qMaterial || !parseFloat(qPrice) || parseFloat(qPrice) <= 0) return;
    const payload = { supplierId: qSupplier, rawMaterialId: qMaterial, price: parseFloat(qPrice), currencyCode: qCurrency !== 'SAR' ? qCurrency : undefined, validFrom: qFrom, validTo: qTo || undefined, notes: qNotes || undefined };
    if (qEditId) { updateSupplierQuote(qEditId, payload); setQEditId(''); }
    else addSupplierQuote(payload);
    setQPrice(''); setQNotes('');
  };
  const editQuote = (q: SupplierQuote) => {
    setQEditId(q.id); setQSupplier(q.supplierId); setQMaterial(q.rawMaterialId);
    setQPrice(String(q.price)); setQCurrency(q.currencyCode || 'SAR'); setQFrom(q.validFrom); setQTo(q.validTo || ''); setQNotes(q.notes || '');
  };

  // ---------- receiving control ----------
  const [tolerance, setTolerance] = useState<number>(() => { try { return parseFloat(localStorage.getItem('rcerp_grn_tolerance') || '5'); } catch { return 5; } });
  const setTol = (v: number) => { setTolerance(v); try { localStorage.setItem('rcerp_grn_tolerance', String(v)); } catch { /* ignore */ } };
  const recRows = approvedGRNs.flatMap((g) => {
    const po = g.purchaseOrderId ? purchaseOrders.find((p) => p.id === g.purchaseOrderId) : undefined;
    const grnRate = g.currencyCode ? getCurrencyRate(g.currencyCode) : 1;
    const poRate = po?.currencyCode ? getCurrencyRate(po.currencyCode) : 1;
    const hasCurrencyDiff = (!!g.currencyCode && g.currencyCode !== 'SAR') || (!!po?.currencyCode && po.currencyCode !== 'SAR');
    return g.items.map((it) => {
      const poItem = po?.items.find((pi) => pi.rawMaterialId === it.rawMaterialId);
      const poQty = poItem?.quantity ?? null;
      const diff = poQty !== null ? it.quantityReceived - poQty : null;
      const diffPct = poQty ? (diff! / poQty) * 100 : null;
      const over = poQty !== null && diff !== null && diff > poQty * (tolerance / 100);
      const short = poQty !== null && diff !== null && diff < 0;
      const grnPriceRaw = it.unitPrice;
      const poPriceRaw = poItem?.unitPrice ?? null;
      const grnPriceBase = grnPriceRaw * grnRate;
      const poPriceBase = poPriceRaw !== null ? poPriceRaw * poRate : null;
      const priceDiff = poItem ? (grnPriceBase - poPriceBase!) * it.quantityReceived : 0;
      return { grn: g, mat: it, po, poQty, diff, diffPct, over, short, grnPriceRaw, poPriceRaw, grnPriceBase, poPriceBase, hasCurrencyDiff, priceDiff };
    });
  });
  const overCount = recRows.filter((r) => r.over).length;
  const shortCount = recRows.filter((r) => r.short).length;
  const priceDiffTotal = recRows.reduce((s, r) => s + r.priceDiff, 0);

  // ---------- returns ----------
  const [retOpen, setRetOpen] = useState(false);
  const [retSupplier, setRetSupplier] = useState(suppliers[0]?.id || '');
  const [retBranch, setRetBranch] = useState(visibleBranchIds[0] || 'b-ck');
  const [retReason, setRetReason] = useState('');
  const [retCurrency, setRetCurrency] = useState('SAR');
  const [retRate, setRetRate] = useState(1);
  const [retItems, setRetItems] = useState<SupplierReturnItem[]>([]);
  const retVisibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const retSupplierObj = suppliers.find((s) => s.id === retSupplier);
  const retTotal = retItems.reduce((s, i) => s + i.lineTotal, 0);

  const addRetItem = () => {
    const mat = rawMaterials[0];
    if (!mat) return;
    setRetItems((prev) => [...prev, { rawMaterialId: mat.id, itemName: mat.nameAr, quantity: 1, unit: mat.unit, unitPrice: getQuotePrice(retSupplier, mat.id) ?? getAverageUnitCost(mat.id), lineTotal: 0 }]);
  };
  const updRetItem = (idx: number, patch: Partial<SupplierReturnItem>) => {
    setRetItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.lineTotal = merged.quantity * merged.unitPrice;
      return merged;
    }));
  };
  const submitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!retSupplierObj || retItems.length === 0 || retItems.some((i) => i.quantity <= 0)) return;
    addSupplierReturn({
      supplierId: retSupplierObj.id, supplierName: retSupplierObj.name, branchId: retBranch,
      date: new Date().toISOString().split('T')[0], reason: retReason,
      items: retItems, totalAmount: retTotal, status: 'draft', createdBy: currentUser?.name || 'المستخدم',
      currencyCode: retCurrency !== 'SAR' ? retCurrency : undefined,
      exchangeRate: retCurrency !== 'SAR' ? retRate : undefined,
    });
    setRetItems([]); setRetReason(''); setRetOpen(false); setRetCurrency('SAR'); setRetRate(1);
  };
  const printReturn = (r: typeof supplierReturns[number]) => {
    openPrintWindow({
      title: `مذكرة إرجاع — ${r.returnNumber}`,
      subtitle: RETURN_STATUS_LABELS[r.status],
      meta: [
        ['المورد', r.supplierName],
        ['الفرع', r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)],
        ['التاريخ', r.date],
        ['السبب', r.reason || '—'],
        ['أنشأها', r.createdBy],
        ...(r.currencyCode ? ([['عملة المذكرة', r.currencyCode], ['سعر الصرف', String(r.exchangeRate || 0)]] as [string, string][]) : []),
      ],
      tables: [{
        title: 'الأصناف المُرجعة',
        header: ['#', 'الصنف', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي'],
        rows: r.items.map((it, idx) => [idx + 1, it.itemName, it.quantity, it.unit, `${it.unitPrice} ${r.currencyCode || 'ر.س'}`, `${it.lineTotal.toFixed(2)} ${r.currencyCode || 'ر.س'}`]),
      }],
      totals: [
        ['إجمالي مذكرة الإرجاع', `${fmtMoney(r.totalAmount)}${r.currencyCode ? ` (${r.currencyCode})` : ''}`],
        ...(r.currencyCode ? ([['المعادل بالريال (ر.س)', `${fmtMoney(r.totalAmount * (r.exchangeRate || 0))}`]] as [string, string][]) : []),
      ],
      footer: 'يُخصم من مخزون الفرع عند الاعتماد ويُسجل كرصيد للمورد',
    });
  };

  const quoteRows = supplierQuotes.map((q) => {
    const mat = rawMaterials.find((m) => m.id === q.rawMaterialId);
    const sup = suppliers.find((s) => s.id === q.supplierId);
    const avg = getAverageUnitCost(q.rawMaterialId);
    const std = mat?.standardPrice || 0;
    const base = q.currencyCode ? q.price * getCurrencyRate(q.currencyCode) : q.price;
    return { q, matName: mat?.nameAr || q.rawMaterialId, supName: sup?.name || q.supplierId, avg, std, base, vsAvg: avg ? ((base - avg) / avg) * 100 : 0, vsStd: std ? ((base - std) / std) * 100 : 0 };
  });

  const exportSheets = [
    { name: 'دورة المواد', header: ['المرحلة', 'التفاصيل', 'القيمة'], rows: stages.map((s) => [s.label, s.sub, s.badge]) },
    { name: 'دفتر أسعار الموردين', header: ['المورد', 'المادة', 'السعر', 'العملة', 'المعادل بالريال', 'يبدأ من', 'ينتهي', 'متوسط التكلفة', 'الفرق %'], rows: quoteRows.map((r) => [r.supName, r.matName, r.q.price, r.q.currencyCode || 'SAR', r.base.toFixed(2), r.q.validFrom, r.q.validTo || '', r.avg.toFixed(2), r.vsAvg.toFixed(2)]) },
    { name: 'رقابة الاستلام', header: ['GRN', 'أمر الشراء', 'المادة', 'كمية PO', 'المستلم', 'الفرق %', 'الحالة', 'فرق السعر'], rows: recRows.map((r) => [r.grn.grnNumber, r.po?.poNumber || '—', rawMaterials.find((m) => m.id === r.mat.rawMaterialId)?.nameAr || r.mat.rawMaterialId, r.poQty ?? '—', r.mat.quantityReceived, r.diffPct !== null ? r.diffPct.toFixed(2) : '—', r.over ? 'زائد' : r.short ? 'ناقص' : 'مطابق', r.priceDiff.toFixed(2)]) },
    { name: 'إرجاع الموردين', header: ['رقم', 'المورد', 'الفرع', 'التاريخ', 'الأصناف', 'الإجمالي', 'العملة', 'معادل الريال', 'الحالة', 'السبب'], rows: supplierReturns.map((r) => [r.returnNumber, r.supplierName, r.branchId === 'b-ck' ? 'المطبخ المركزي' : r.branchId, r.date, r.items.length, r.totalAmount, r.currencyCode || 'SAR', (r.totalAmount * (r.exchangeRate || 0)).toFixed(2), RETURN_STATUS_LABELS[r.status], r.reason]) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="دورة المواد (Material Control)" subtitle="دورة كاملة تحاكي Oracle Hospitality Material Control: تكوين ← اقتراح ← شراء ← استلام ← تحويل/إنتاج ← صرف/إرجاع ← جرد ← تقييم وقيود" icon={<RotateCcw className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar filename="دورة_المواد" sheets={exportSheets} />
          <Btn tone="ghost" onClick={() => downloadCSV('دورة_المواد.csv', ['المرحلة', 'التفاصيل', 'القيمة'], stages.map((s) => [s.label, s.sub, s.badge]))}><FileDown className="w-4 h-4" /> تصدير الدورة</Btn>
        </>} />

      <TabBar tabs={[
        { id: 'cycle', label: 'الدورة (8 مراحل)' },
        { id: 'quotes', label: 'دفتر أسعار الموردين' },
        { id: 'receiving', label: 'رقابة الاستلام' },
        { id: 'returns', label: 'إرجاع الموردين' },
      ]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'cycle' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stages.slice(0, 4).map((s) => (
              <button key={s.id} onClick={() => onNavigate(s.nav)} className={`text-right bg-gradient-to-l ${s.color} text-white rounded-2xl p-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`}>
                <div className="flex items-center justify-between">
                  <span className="opacity-90">{s.icon}</span>
                  <span className="text-[10px] font-bold bg-white/20 rounded-full px-2 py-0.5">المرحلة {s.id}</span>
                </div>
                <div className="mt-2 text-sm font-black">{s.label}</div>
                <div className="text-[10px] opacity-90 font-bold mt-0.5">{s.sub}</div>
                <div className="mt-2 text-base font-black">{s.badge}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stages.slice(4).map((s) => (
              <button key={s.id} onClick={() => onNavigate(s.nav)} className={`text-right bg-gradient-to-l ${s.color} text-white rounded-2xl p-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`}>
                <div className="flex items-center justify-between">
                  <span className="opacity-90">{s.icon}</span>
                  <span className="text-[10px] font-bold bg-white/20 rounded-full px-2 py-0.5">المرحلة {s.id}</span>
                </div>
                <div className="mt-2 text-sm font-black">{s.label}</div>
                <div className="text-[10px] opacity-90 font-bold mt-0.5">{s.sub}</div>
                <div className="mt-2 text-base font-black">{s.badge}</div>
              </button>
            ))}
          </div>
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 text-xs mb-3">كيف تعمل الدورة كاملة؟</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed text-slate-600 font-bold">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">1. <span className="text-slate-900">التكوين:</span> المواد بـ min/max والعائد، الوصفات بمكوناتها وهالكها، الموردون وأسعارهم في دفتر الأسعار.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">2. <span className="text-slate-900">الاقتراحات:</span> إعادة الطلب الذكية تحسب المطلوب من الاستهلاك + التسليم + الأمان − المتاح − أوامر مفتوحة.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">3. <span className="text-slate-900">الشراء:</span> إنشاء أوامر شراء (تلقائي/يدوي) بدورة اعتماد: مسودة ← إرسال ← اعتماد/رفض ← استلام.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">4. <span className="text-slate-900">الاستلام:</span> GRN برقابة كمية (زائد/ناقص ضمن تسامح) وفرق سعر مقابل PO، ويُحدَّث المخزون والقيود تلقائياً.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">5. <span className="text-slate-900">التحويل والإنتاج:</span> تحويلات بين الفروع (بموافقة) وأوامر عمل تصنيع من المطبخ المركزي.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">6. <span className="text-slate-900">الصرف والإرجاع:</span> تسجيل الهوالك بموافقة، وإرجاع البضاعة للمورد بمذكرة إرجاع (Debit Note) تخفض المخزون وتسجل رصيداً.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">7. <span className="text-slate-900">الجرد:</span> جولات جرد دورية تحسب النظري مقابل الفعلي وفرق القيمة للاعتماد.</div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">8. <span className="text-slate-900">التقييم والقيود:</span> تقييم FIFO للمخزون، ومقارنة الانحراف النظري/الفعلي، وكل مستند يولّد قيداً محاسبياً تلقائياً.</div>
            </div>
          </Card>
        </>
      )}

      {tab === 'quotes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 lg:col-span-1">
            <h3 className="font-bold text-slate-800 text-xs mb-3">{qEditId ? 'تعديل عرض سعر' : 'إضافة عرض سعر مورد'}</h3>
            <form onSubmit={saveQuote} className="space-y-3">
              <Field label="المورد" required>
                <select value={qSupplier} onChange={(e) => setQSupplier(e.target.value)} className={inputCls}>
                  {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="المادة" required>
                <AutocompleteSelect
                  value={qMaterial}
                  onChange={(val) => setQMaterial(val)}
                  options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                  getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                  placeholder="— اختر مادة خام —"
                  className="w-full"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`السعر (${qCurrency === 'SAR' ? 'ر.س' : qCurrency})`} required>
                  <input type="number" min="0" step="0.01" value={qPrice} onChange={(e) => setQPrice(e.target.value)} className={inputCls} />
                </Field>
                <Field label="العملة">
                  <CurrencySelect value={qCurrency} onChange={setQCurrency} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="صالح من" required><input type="date" value={qFrom} onChange={(e) => setQFrom(e.target.value)} className={inputCls} /></Field>
                <Field label="صالح حتى"><input type="date" value={qTo} onChange={(e) => setQTo(e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="ملاحظات"><input value={qNotes} onChange={(e) => setQNotes(e.target.value)} className={inputCls} /></Field>
              <div className="flex gap-2">
                <Btn type="submit">{qEditId ? 'حفظ التعديل' : 'إضافة العرض'}</Btn>
                {qEditId && <Btn tone="ghost" onClick={() => setQEditId('')}>إلغاء التعديل</Btn>}
              </div>
            </form>
            <p className="mt-3 text-[10px] text-slate-500 font-bold leading-relaxed">السعر الصالح يُستخدم تلقائياً عند تعبئة أوامر الشراء وأصناف الاستلام، ويراجع به فرق السعر.</p>
          </Card>
          <Card className="p-4 lg:col-span-2">
            <h3 className="font-bold text-slate-800 text-xs mb-3">قائمة عروض الأسعار الصالحة {quoteRows.length ? `(${quoteRows.length})` : ''}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <tr><th className="text-right p-2 font-bold">المورد</th><th className="text-right p-2 font-bold">المادة</th><th className="text-right p-2 font-bold">السعر</th><th className="text-right p-2 font-bold">العملة</th><th className="text-right p-2 font-bold">المعادل (ر.س)</th><th className="text-right p-2 font-bold">المدة</th><th className="text-right p-2 font-bold">متوسط التكلفة</th><th className="text-right p-2 font-bold">فرق %</th><th className="text-right p-2 font-bold">إجراء</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {quoteRows.map((r) => (
                    <tr key={r.q.id} className="hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-800">{r.supName}</td>
                      <td className="p-2 font-bold">{r.matName}</td>
                      <td className="tnum text-left p-2 font-extrabold text-indigo-700">{fmt(r.q.price)} <span className="text-[9px] text-slate-400">{r.q.currencyCode || 'ر.س'}</span></td>
                      <td className="tnum text-left p-2 text-amber-700">{r.q.currencyCode || 'SAR'}</td>
                      <td className="tnum text-left p-2 text-slate-600">{fmtMoney(r.base)}</td>
                      <td className="p-2 text-slate-500">{r.q.validFrom}{r.q.validTo ? ` → ${r.q.validTo}` : ' (مفتوح)'}{r.q.updatedAt ? <span className="block text-[9px] text-slate-400">آخر تحديث: {new Date(r.q.updatedAt).toLocaleString()}</span> : null}</td>
                      <td className="tnum text-left p-2">{fmtMoney(r.avg)}</td>
                      <td className={`p-2 font-mono font-bold ${r.vsAvg <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{r.vsAvg > 0 ? '+' : ''}{r.vsAvg.toFixed(2)}%</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {Array.isArray(r.q.history) && r.q.history.length > 0 && (
                            <button onClick={() => setHistTarget(r.q)} className="p-1.5 text-slate-500 hover:bg-amber-50 rounded-lg" title="سجل تغييرات السعر"><History className="w-4 h-4" /></button>
                          )}
                          <button onClick={() => editQuote(r.q)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><RefreshCcw className="w-4 h-4" /></button>
                          <button onClick={() => deleteSupplierQuote(r.q.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {quoteRows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-400 font-bold">لا توجد عروض أسعار بعد — أضف عروض الموردين ليتسعّر الشراء تلقائياً</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {histTarget && (
        <Modal open={!!histTarget} title="سجل تغييرات السعر" onClose={() => setHistTarget(null)}>
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 font-bold">
              {(() => {
                const sup = suppliers.find((s) => s.id === histTarget.supplierId);
                const mat = rawMaterials.find((m) => m.id === histTarget.rawMaterialId);
                return `${sup?.name || histTarget.supplierId} — ${mat?.nameAr || histTarget.rawMaterialId}`;
              })()}
              {' '}· سعر حالي: <span className="font-mono font-extrabold text-indigo-700">{fmt(histTarget.price)} {histTarget.currencyCode || 'ر.س'}</span>
            </p>
            {(histTarget.history || []).slice().reverse().map((v, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="font-black text-slate-800">{fmt(v.price)} <span className="text-[9px] text-slate-500 font-bold">{(v.currencyCode || 'ر.س')}</span></div>
                  <div className="text-[10px] text-slate-500 font-bold mt-0.5">صالح: {v.validFrom}{v.validTo ? ` → ${v.validTo}` : ' (مفتوح)'}</div>
                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">بواسطة: {v.changedBy} — {v.changedAt ? new Date(v.changedAt).toLocaleString() : ''}</div>
                </div>
                <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">نسخة {histTarget.history!.length - i}</span>
              </div>
            ))}
            {Array.isArray(histTarget.history) && histTarget.history.length === 0 && (
              <p className="text-center text-slate-400 font-bold py-4">لا يوجد سجل إصدارات بعد</p>
            )}
          </div>
        </Modal>
      )}

      {tab === 'receiving' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بنود استلام خاضعة للرقابة</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{recRows.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">كميات زائدة (Over)</span><strong className="text-lg font-extrabold text-amber-700 block mt-1">{overCount}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs"><span className="text-rose-600 text-[11px] block">كميات ناقصة (Short)</span><strong className="text-lg font-extrabold text-rose-700 block mt-1">{shortCount}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">فرق أسعار (مقابل PO)</span><strong className={`text-lg font-extrabold block mt-1 ${priceDiffTotal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{priceDiffTotal > 0 ? '+' : ''}{fmtMoney(priceDiffTotal)}</strong></div>
          </div>
          <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
            <Field label="تسامح الكميات المسموح (زائد) %">
              <input type="number" min="0" max="50" step="0.01" value={tolerance || ''} onChange={(e) => setTol(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))} className={inputCls + ' !w-32'} />
            </Field>
            <p className="text-[10px] text-slate-500 font-bold pb-2">أي كمية مستلمة تفوق أمر الشراء بأكثر من هذا التسامح تُعلَّم "زائد" للمراجعة قبل الرفض أو القبول، وأي كمية أقل تُعلَّم "ناقص". عند اختلاف عملة المستند عن عملة أمر الشراء يُحسب فرق السعر بالمعادل الريالي.</p>
          </Card>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">GRN</th><th className="p-2">PO</th><th className="p-2">المادة</th><th className="p-2">كمية PO</th><th className="p-2">المستلم</th><th className="p-2">الفرق %</th><th className="p-2">الحالة</th><th className="p-2">سعر PO</th><th className="p-2">سعر الاستلام</th><th className="p-2">فرق السعر</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recRows.map((r, idx) => (
                    <tr key={idx} className={r.over ? 'bg-amber-50/50' : r.short ? 'bg-rose-50/40' : ''}>
                      <td className="tnum text-left p-2 font-bold text-indigo-700">{r.grn.grnNumber}</td>
                      <td className="tnum text-left p-2">{r.po?.poNumber || '—'}</td>
                      <td className="p-2 font-bold">{rawMaterials.find((m) => m.id === r.mat.rawMaterialId)?.nameAr || r.mat.rawMaterialId}</td>
                      <td className="tnum text-left p-2">{r.poQty ?? '—'}</td>
                      <td className="tnum text-left p-2 font-extrabold">{r.mat.quantityReceived}</td>
                      <td className="tnum text-left p-2">{r.diffPct !== null ? `${r.diffPct > 0 ? '+' : ''}${r.diffPct.toFixed(2)}%` : '—'}</td>
                      <td className="p-2">{r.over ? <span className="text-amber-700 font-extrabold">زائد (أكثر من {tolerance}%)</span> : r.short ? <span className="text-rose-600 font-extrabold">ناقص</span> : <span className="text-emerald-600 font-extrabold">مطابق</span>}</td>
                      <td className="tnum text-left p-2">{r.po && r.poPriceRaw !== null ? fmtMoney(r.poPriceRaw) : '—'}{r.hasCurrencyDiff && r.po && r.poPriceBase !== null && <div className="text-[9px] text-slate-400">{fmtMoney(r.poPriceBase)} ر.س</div>}</td>
                      <td className="tnum text-left p-2">{fmtMoney(r.grnPriceRaw)}{r.hasCurrencyDiff && <div className="text-[9px] text-slate-400">{fmtMoney(r.grnPriceBase)} ر.س</div>}</td>
                      <td className={`p-2 font-mono font-bold ${r.priceDiff > 0 ? 'text-rose-600' : r.priceDiff < 0 ? 'text-emerald-600' : ''}`}>{r.priceDiff > 0 ? '+' : ''}{fmtMoney(r.priceDiff)}{r.hasCurrencyDiff && <div className="text-[9px] text-slate-400">بالمعادل الريالي</div>}</td>
                    </tr>
                  ))}
                  {recRows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-400 font-bold">لا توجد إشعارات استلام مرتبطة بأوامر شراء بعد — استلم مواد مقابل PO لتظهر الرقابة هنا</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'returns' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Btn onClick={() => setRetOpen(true)}><Plus className="w-4 h-4" /> مذكرة إرجاع جديدة</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-2">رقم المذكرة</th><th className="p-2">المورد</th><th className="p-2">الفرع</th><th className="p-2">التاريخ</th><th className="p-2">الأصناف</th><th className="p-2">الإجمالي</th><th className="p-2">العملة</th><th className="p-2">السبب</th><th className="p-2">الحالة</th><th className="p-2">إجراءات</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="tnum text-left p-2 font-bold text-indigo-700">{r.returnNumber}</td>
                      <td className="p-2 font-bold">{r.supplierName}</td>
                      <td className="p-2 text-slate-600">{r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)}</td>
                      <td className="tnum text-left p-2 text-slate-600">{r.date}</td>
                      <td className="p-2 font-bold">{r.items.length}</td>
                      <td className="tnum text-left p-2 font-extrabold">{fmtMoney(r.totalAmount)}</td>
                      <td className="tnum text-left p-2 text-amber-700">{r.currencyCode || 'SAR'}</td>
                      <td className="p-2 text-slate-500 max-w-40 truncate">{r.reason || '—'}</td>
                      <td className="p-2"><StatusPill status={r.status} map={RETURN_STATUS_LABELS} /></td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {r.status === 'draft' && <button onClick={() => updateSupplierReturn(r.id, { status: 'submitted' })} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إرسال للاعتماد"><Send className="w-4 h-4" /></button>}
                          {r.status === 'submitted' && (
                            <>
                              {can('approve_purchase_orders') && <button onClick={() => approveSupplierReturn(r.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="اعتماد (يخفض المخزون ويسجل رصيداً)"><BadgeCheck className="w-4 h-4" /></button>}
                              <button onClick={() => updateSupplierReturn(r.id, { status: 'rejected' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض"><Ban className="w-4 h-4" /></button>
                            </>
                          )}
                          {r.status === 'approved' && <span className="text-emerald-600 self-center"><CheckCircle2 className="w-4 h-4 inline" /> خُصم من المخزون</span>}
                          <button onClick={() => printReturn(r)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="طباعة"><Printer className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {supplierReturns.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-400 font-bold">لا توجد مذكرات إرجاع</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Modal open={retOpen} onClose={() => setRetOpen(false)} title="مذكرة إرجاع للمورد (Debit Note)" wide>
            <form onSubmit={submitReturn} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Field label="المورد" required>
                  <select value={retSupplier} onChange={(e) => setRetSupplier(e.target.value)} className={inputCls}>
                    {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="الفرع" required>
                  <select value={retBranch} onChange={(e) => setRetBranch(e.target.value)} className={inputCls}>
                    {retVisibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                    <option value="b-ck">المطبخ المركزي</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="سبب الإرجاع"><input value={retReason} onChange={(e) => setRetReason(e.target.value)} className={inputCls} placeholder="جودة/كمية زائدة/انتهاء/خطأ طلب..." /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="العملة">
                    <CurrencySelect value={retCurrency} onChange={(code) => { setRetCurrency(code); setRetRate(getCurrencyRate(code)); }} />
                  </Field>
                  {retCurrency !== 'SAR' && (
                    <Field label={`سعر الصرف (1 ${retCurrency} = ... ر.س)`} required>
                      <input type="number" min="0" step="0.0001" value={retRate || ''} onChange={(e) => setRetRate(parseFloat(e.target.value) || 0)} className={inputCls} required />
                    </Field>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">الأصناف المُرجعة (تُسعّر تلقائياً من عرض المورد أو متوسط التكلفة)</span>
                  <Btn onClick={addRetItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
                </div>
                {retItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-2">
                    <div className="col-span-2"><AutocompleteSelect
                        value={item.rawMaterialId}
                        onChange={(val) => { const m = rawMaterials.find((x) => x.id === val); updRetItem(idx, { rawMaterialId: val, itemName: m?.nameAr || '', unit: m?.unit || '', unitPrice: getQuotePrice(retSupplier, val) ?? getAverageUnitCost(val) }); }}
                        options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                        getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                        placeholder="— اختر مادة خام —"
                        className="w-full"
                      /></div>
                    <input type="number" min="0" step="any" value={item.quantity || ''} onChange={(e) => updRetItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className={inputCls} placeholder="الكمية" />
                    <input type="number" min="0" step="any" value={item.unitPrice || ''} onChange={(e) => updRetItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} className={inputCls} placeholder="السعر" />
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800">{fmt(item.lineTotal)}</span>
                      <button type="button" onClick={() => setRetItems(retItems.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 p-1">✕</button>
                    </div>
                  </div>
                ))}
                {retItems.length === 0 && <p className="text-center text-slate-400 text-xs py-3">أضف أصنافاً للإرجاع</p>}
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-rose-950">إجمالي مذكرة الإرجاع (رصيد للمورد)</span>
                  <span className="text-lg font-black text-rose-800 font-mono">{fmtMoney(retTotal)}{retCurrency !== 'SAR' && <span className="text-[10px] text-rose-500 mr-1">({retCurrency})</span>}</span>
                </div>
                {retCurrency !== 'SAR' && (
                  <div className="flex justify-between items-center text-[11px] bg-white/60 rounded-lg px-2 py-1">
                    <span className="font-bold text-rose-950">المعادل بالريال (ر.س) — للقيد المحاسبي</span>
                    <span className="font-mono font-extrabold text-emerald-700">{fmtMoney(retTotal * retRate)}</span>
                  </div>
                )}
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setRetOpen(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ كمسودة</button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </div>
  );
};