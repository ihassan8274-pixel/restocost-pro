import React, { useMemo, useState } from 'react';
import { Scale, ArrowLeftRight, BadgeCheck, CircleAlert, PackageSearch } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, inputCls, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';

interface VarianceLine {
  rawMaterialId: string;
  materialName: string;
  orderedQty: number;
  receivedQty: number;
  orderedPrice: number;
  receivedPrice: number;
  qtyVariance: number;
  priceVariance: number;
  valueVariance: number;
  totalOrderedValue: number;
  totalReceivedValue: number;
  // 3-way match
  invoicedQty: number;
  invoicedPrice: number;
  invoicedValue: number;
  invoiceQtyVariance: number;
  invoicePriceVariance: number;
  invoiceValueVariance: number;
  invoiceId?: string;
  invoiceNumber?: string;
}

interface VarianceRow {
  poId: string;
  poNumber: string;
  supplierName: string;
  branchId: string;
  orderDate: string;
  lines: VarianceLine[];
  status: string;
}

export const PurchaseVarianceView: React.FC = () => {
  const { purchaseOrders, grnNotes, invoices, branches, visibleBranchIds } = useApp();
  const [filterBranch, setFilterBranch] = useState('all');
  const [showZero, setShowZero] = useState(false);
  const [tab, setTab] = useState<'variance' | 'threeway'>('variance');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const rows = useMemo<VarianceRow[]>(() => {
    const scoped = purchaseOrders.filter((p) => visibleBranchIds.includes(p.branchId) || p.branchId === 'b-ck');
    return scoped.map((po) => {
      const grns = grnNotes.filter((g) => g.purchaseOrderId === po.id && g.status === 'approved');
      const purchaseInvoices = invoices.filter((inv) => inv.type === 'purchase' && inv.purchaseOrderId === po.id && inv.status !== 'cancelled');
      
      // Build GRN map per material
      const recvMap: Record<string, { qty: number; value: number }> = {};
      grns.forEach((g) => g.items.forEach((i) => {
        const cur = recvMap[i.rawMaterialId] || { qty: 0, value: 0 };
        recvMap[i.rawMaterialId] = { qty: cur.qty + i.quantityReceived, value: cur.value + i.quantityReceived * i.unitPrice };
      }));
      
      // Build Invoice map per material (using matchedQty/matchedAmount if available, or total/line count)
      const invoiceMap: Record<string, { qty: number; value: number; price: number; invoiceId: string; invoiceNumber: string }> = {};
      purchaseInvoices.forEach((inv) => {
        if (inv.matchedQty && inv.matchedAmount && inv.rawMaterialId) {
          invoiceMap[inv.rawMaterialId] = {
            qty: inv.matchedQty,
            value: inv.matchedAmount,
            price: inv.matchedQty > 0 ? inv.matchedAmount / inv.matchedQty : 0,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
          };
        }
      });
      
      const lines = po.items.map((it) => {
        const recv = recvMap[it.rawMaterialId] || { qty: 0, value: 0 };
        const receivedPrice = recv.qty > 0 ? recv.value / recv.qty : 0;
        const inv = invoiceMap[it.rawMaterialId];
        const invoicedQty = inv?.qty ?? 0;
        const invoicedPrice = inv?.price ?? 0;
        const invoicedValue = inv?.value ?? 0;
        const invoiceQtyVariance = invoicedQty - recv.qty;
        const invoicePriceVariance = (invoicedPrice - receivedPrice) * invoicedQty;
        const invoiceValueVariance = invoicedValue - recv.value;
        
        return {
          rawMaterialId: it.rawMaterialId,
          materialName: it.materialName,
          orderedQty: it.quantity,
          receivedQty: recv.qty,
          orderedPrice: it.unitPrice,
          receivedPrice,
          qtyVariance: recv.qty - it.quantity,
          priceVariance: (receivedPrice - it.unitPrice) * recv.qty,
          valueVariance: recv.value - it.unitPrice * it.quantity,
          totalOrderedValue: it.quantity * it.unitPrice,
          totalReceivedValue: recv.value,
          // 3-way match fields
          invoicedQty,
          invoicedPrice,
          invoicedValue,
          invoiceQtyVariance,
          invoicePriceVariance,
          invoiceValueVariance,
          invoiceId: inv?.invoiceId,
          invoiceNumber: inv?.invoiceNumber,
        };
      });
      return {
        poId: po.id, poNumber: po.poNumber, supplierName: po.supplierName, branchId: po.branchId,
        orderDate: po.orderDate, lines, status: po.status,
      };
    });
  }, [purchaseOrders, grnNotes, invoices, visibleBranchIds]);

  const filteredRows = useMemo(() => {
    const br = filterBranch === 'all' ? rows : rows.filter((r) => r.branchId === filterBranch);
    return showZero ? br : br.filter((r) => r.lines.some((l) => Math.abs(l.valueVariance) > 0.01 || Math.abs(l.qtyVariance) > 0.01));
  }, [rows, filterBranch, showZero]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;

  const stats = useMemo(() => {
    const allLines = rows.flatMap((r) => r.lines);
    const withVariance = allLines.filter((l) => Math.abs(l.valueVariance) > 0.01 || Math.abs(l.qtyVariance) > 0.01);
    const overDelivered = allLines.filter((l) => l.qtyVariance > 0.01);
    const underDelivered = allLines.filter((l) => l.qtyVariance < -0.01);
    const priceHike = allLines.filter((l) => l.priceVariance > 0.01);
    const totalOrdered = allLines.reduce((s, l) => s + l.totalOrderedValue, 0);
    const totalReceived = allLines.reduce((s, l) => s + l.totalReceivedValue, 0);
    const deliveredQty = allLines.reduce((s, l) => s + l.receivedQty, 0);
    const orderedQty = allLines.reduce((s, l) => s + l.orderedQty, 0);
    return {
      totalOrdered, totalReceived, netVariance: totalReceived - totalOrdered,
      varianceLines: withVariance.length, overDelivered: overDelivered.length, underDelivered: underDelivered.length,
      priceHike: priceHike.length, deliveredPct: orderedQty > 0 ? (deliveredQty / orderedQty * 100) : 100,
    };
  }, [rows]);

  const unmatchedGRNs = grnNotes.filter((g) => g.status === 'approved' && !g.purchaseOrderId && visibleBranchIds.includes(g.branchId));

  return (
    <div className="space-y-6">
      <PageHeader title="انحراف أوامر الشراء (PO vs GRN)" subtitle="مقارنة الكميات والأسعار والقيم بين أمر الشراء وما استُلم فعلياً من إشعارات الاستلام المرتبطة" icon={<Scale className="w-6 h-6 text-amber-300" />}
        actions={
          <ViewToolbar
            filename="انحراف_أوامر_الشراء"
            sheets={[
              { name: 'ملخص الانحراف', header: ['رقم PO', 'المورد', 'الصنف', 'الكمية المطلوبة', 'الكمية المستلمة', 'فرق الكمية', 'سعر الطلب', 'متوسط سعر الاستلام', 'فرق السعر', 'قيمة الطلب', 'قيمة الاستلام', 'الانحراف الإجمالي'], rows: filteredRows.flatMap((r) => r.lines.map((l) => [r.poNumber, r.supplierName, l.materialName, l.orderedQty, l.receivedQty, l.qtyVariance, l.orderedPrice, l.receivedPrice.toFixed(2), l.priceVariance.toFixed(2), l.totalOrderedValue, l.totalReceivedValue, l.valueVariance])) },
              { name: 'GRN بدون أمر شراء', header: ['رقم GRN', 'المورد', 'التاريخ', 'المبلغ'], rows: unmatchedGRNs.map((g) => [g.grnNumber, g.supplierName, g.date, g.totalAmount]) },
            ]}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">صافي الانحراف (استلام - طلب)</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${stats.netVariance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{stats.netVariance > 0 ? '+' : ''}{fmt(stats.netVariance)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بنود بها انحراف</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1 flex items-center gap-1"><CircleAlert className="w-4 h-4" />{stats.varianceLines}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">نسبة التسليم الفعلي</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(stats.deliveredPct, 1)}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ارتفاع أسعار عن الطلب</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{stats.priceHike} بند</strong></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة أوامر الشراء</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(stats.totalOrdered)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة ما استُلم فعلياً</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(stats.totalReceived)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بنود زائدة عن المطلوب</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{stats.overDelivered}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بنود ناقصة عن المطلوب</span><strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{stats.underDelivered}</strong></div>
      </div>

      <Card className="p-4 flex items-center gap-3 text-xs flex-wrap">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
        <label className="flex items-center gap-2 font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
          إظهار الأوامر بدون انحراف
        </label>
        <span className="font-bold text-slate-500 mr-auto">{filteredRows.length} أمر شراء مرتبط</span>
      </Card>

      <div className="flex gap-2 border-b border-slate-200 mb-4">
        <button onClick={() => setTab('variance')} className={`px-4 py-2 text-xs font-bold border-b-2 ${tab === 'variance' ? 'border-amber-500 text-amber-700' : 'border-transparent text-slate-400'}`}>
          انحراف PO ↔ GRN
        </button>
        <button onClick={() => setTab('threeway')} className={`px-4 py-2 text-xs font-bold border-b-2 ${tab === 'threeway' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400'}`}>
          المطابقة الثلاثية (PO ↔ GRN ↔ فاتورة)
        </button>
      </div>

      {tab === 'variance' && (
        <>
          {filteredRows.map((r) => {
        const hasVariance = r.lines.some((l) => Math.abs(l.valueVariance) > 0.01 || Math.abs(l.qtyVariance) > 0.01);
        const poNet = r.lines.reduce((s, l) => s + l.valueVariance, 0);
        return (
          <Card key={r.poId} className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PackageSearch className={`w-5 h-5 ${hasVariance ? 'text-amber-600' : 'text-emerald-600'}`} />
                <div>
                  <p className="font-mono font-extrabold text-indigo-700 text-xs">{r.poNumber}</p>
                  <p className="text-[10px] text-slate-500">{r.supplierName} · {branchName(r.branchId)} · {r.orderDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hasVariance ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {hasVariance ? <span className="inline-flex items-center gap-1"><CircleAlert className="w-3 h-3" /> يوجد انحراف</span> : <span className="inline-flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> مطابق</span>}
                </span>
                <span className={`text-[10px] font-extrabold font-mono ${poNet > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{poNet > 0 ? '+' : ''}{fmt(poNet)} ر.س</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-3">الصنف</th><th className="p-3">مطلوب</th><th className="p-3">مستلم</th><th className="p-3">فرق الكمية</th><th className="p-3">سعر الطلب</th><th className="p-3">سعر الاستلام</th><th className="p-3">فرق السعر</th><th className="p-3">انحراف القيمة</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.lines.map((l) => {
                    const hasP = Math.abs(l.priceVariance) > 0.01;
                    const hasV = Math.abs(l.valueVariance) > 0.01;
                    return (
                      <tr key={l.rawMaterialId} className={`hover:bg-slate-50 ${hasV ? 'bg-amber-50/40' : ''}`}>
                        <td className="p-3 font-bold text-slate-900">{l.materialName}</td>
                        <td className="p-3 font-mono">{fmt(l.orderedQty)}</td>
                        <td className="p-3 font-mono font-bold">{fmt(l.receivedQty)}</td>
                        <td className={`p-3 font-mono font-extrabold ${l.qtyVariance > 0.01 ? 'text-rose-700' : l.qtyVariance < -0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>{l.qtyVariance > 0.01 ? '+' : ''}{fmt(l.qtyVariance)}</td>
                        <td className="p-3 font-mono">{fmt(l.orderedPrice)}</td>
                        <td className="p-3 font-mono font-bold">{l.receivedQty > 0 ? fmt(l.receivedPrice) : '—'}</td>
                        <td className={`p-3 font-mono font-extrabold ${l.priceVariance > 0.01 ? 'text-rose-700' : l.priceVariance < -0.01 ? 'text-emerald-700' : 'text-slate-500'}`}>{hasP ? (l.priceVariance > 0 ? '+' : '') + fmt(l.priceVariance) : '—'}</td>
                        <td className={`p-3 font-mono font-extrabold ${hasV ? (l.valueVariance > 0 ? 'text-rose-700' : 'text-emerald-700') : 'text-slate-400'}`}>{hasV ? (l.valueVariance > 0 ? '+' : '') + fmt(l.valueVariance) : 'مطابق'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {filteredRows.length === 0 && (
<Card className="p-10 text-center text-sm font-bold text-slate-400 flex flex-col items-center gap-2">
          <ArrowLeftRight className="w-8 h-8 text-slate-300" />
          لا توجد أوامر شراء مرتبطة بإشعارات استلام — اربط أمر الشراء عند إنشاء GRN ليُحسب الانحراف تلقائياً
        </Card>
      )}
        </>
      )}
 
      {tab === 'threeway' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-emerald-700">المطابقة الثلاثية: أمر شراء ↔ استلام ↔ فاتورة مورد</h3>
            <span className="text-xs text-slate-500">تظهر فقط البنود التي لها فاتورة مرتبطة بأمر الشراء</span>
          </div>
          {filteredRows.map((r) => {
            const linesWithInvoice = r.lines.filter((l) => l.invoiceId && l.invoicedQty > 0);
            if (linesWithInvoice.length === 0) return null;
            return (
              <Card key={r.poId} className="overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PackageSearch className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="font-mono font-extrabold text-emerald-700 text-xs">{r.poNumber}</p>
                      <p className="text-[10px] text-slate-500">{r.supplierName} · {branchName(r.branchId)} · {r.orderDate}</p>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">الصنف</th>
                        <th className="p-3">مطلوب (PO)</th>
                        <th className="p-3">مستلم (GRN)</th>
                        <th className="p-3">مفاتور</th>
                        <th className="p-3">فرق كم (GRN-PO)</th>
                        <th className="p-3">فرق كم (فاتورة-GRN)</th>
                        <th className="p-3">سعر الطلب</th>
                        <th className="p-3">سعر الاستلام</th>
                        <th className="p-3">سعر الفاتورة</th>
                        <th className="p-3">انحراف قيمة (فاتورة-استلام)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {linesWithInvoice.map((l) => (
                        <tr key={l.rawMaterialId} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{l.materialName}</td>
                          <td className="p-3 font-mono">{fmt(l.orderedQty)}</td>
                          <td className="p-3 font-mono font-bold">{fmt(l.receivedQty)}</td>
                          <td className="p-3 font-mono font-bold text-emerald-700">{fmt(l.invoicedQty)}</td>
                          <td className={`p-3 font-mono font-extrabold ${l.qtyVariance > 0.01 ? 'text-rose-700' : l.qtyVariance < -0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>{l.qtyVariance > 0.01 ? '+' : ''}{fmt(l.qtyVariance)}</td>
                          <td className={`p-3 font-mono font-extrabold ${(l.invoiceQtyVariance || 0) > 0.01 ? 'text-rose-700' : (l.invoiceQtyVariance || 0) < -0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>{(l.invoiceQtyVariance || 0) > 0.01 ? '+' : ''}{fmt(l.invoiceQtyVariance || 0)}</td>
                          <td className="p-3 font-mono">{fmt(l.orderedPrice)}</td>
                          <td className="p-3 font-mono font-bold">{l.receivedQty > 0 ? fmt(l.receivedPrice) : '—'}</td>
                          <td className="p-3 font-mono font-bold text-emerald-700">{l.invoicedQty > 0 ? fmt(l.invoicedPrice) : '—'}</td>
                          <td className={`p-3 font-mono font-extrabold ${(l.invoiceValueVariance || 0) > 0 ? 'text-rose-700' : (l.invoiceValueVariance || 0) < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{(l.invoiceValueVariance || 0) > 0 ? '+' : ''}{fmt(l.invoiceValueVariance || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
          {filteredRows.every((r) => !r.lines.some((l) => l.invoiceId)) && (
            <Card className="p-10 text-center text-sm font-bold text-slate-400 flex flex-col items-center gap-2">
              <ArrowLeftRight className="w-8 h-8 text-slate-300" />
              لا توجد فواتير مورد مرتبطة بأوامر الشراء — أنشئ فاتورة مشتريات واربطها بأمر الشراء
            </Card>
          )}
        </div>
      )}
 
      {unmatchedGRNs.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="إشعارات استلام بدون أمر شراء" subtitle="هذه الاستلامات لا تشملها المقارنة — اربطها بأمر شراء عند الإنشاء" icon={<ArrowLeftRight className="w-5 h-5 text-indigo-600" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">رقم GRN</th><th className="p-3">المورد</th><th className="p-3">التاريخ</th><th className="p-3">المبلغ</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmatchedGRNs.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-indigo-700">{g.grnNumber}</td>
                    <td className="p-3 font-bold text-slate-800">{g.supplierName}</td>
                    <td className="p-3 font-mono text-slate-600">{g.date}</td>
                    <td className="p-3 font-mono font-bold">{fmt(g.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};