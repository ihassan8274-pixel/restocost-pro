import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Save, Send, Trash2, CheckCircle2, RefreshCw, Eye, ShoppingCart, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal, DocumentFingerprint } from '../ui';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { sendRequestPdfToBot } from '../../utils/purchaseDocs';
import { generateRequestItems } from '../../business/purchaseRequests';
import type { PurchaseRequest, PurchaseRequestItem } from '../../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

const requestPrint = (r: PurchaseRequest, branchName: string) => {
  openPrintWindow({
    title: `طلب شراء — ${r.requestNumber}`,
    subtitle: r.status === 'converted' ? 'تم تحويله لأوامر توريد مبدئية' : 'مرسل لمجموعة المشتريات',
    compact: true,
    meta: [
      ['الفرع', branchName],
      ['التاريخ', r.date],
      ['بواسطة', r.createdBy],
      ['البنود', `${r.items.length} صنف`],
      ['الحالة', r.status === 'converted' ? `تحُوّل (${r.convertedToPOs?.length || 0} أمر)` : 'مرسل'],
    ],
    tables: [{
      title: 'البنود المطلوبة',
      header: ['#', 'الصنف', 'الكمية بوحدة الشراء', 'آخر سعر توريد (30 يوم)', 'آخر مورد', 'القيمة'],
      rows: r.items.map((i, idx) => [idx + 1, i.materialName, `${fmt(i.quantityPU)} ${i.purchaseUnit}`, fmtMoney(i.lastPricePU), i.lastSupplierName || '—', fmtMoney(i.quantityPU * i.lastPricePU)]),
    }],
    totals: [
      ['عدد الأصناف', `${r.items.length}`],
      ['إجمالي الكمية (وحدة شراء)', fmt(r.items.reduce((s, i) => s + i.quantityPU, 0))],
      ['القيمة التقديرية', fmtMoney(r.totalValue)],
    ],
    footer: 'طلب شراء تلقائي بعد الجرد — أقل سعر استلام خلال 30 يوماً وآخر مورد فعلي',
  });
};

const requestTelegramText = (r: PurchaseRequest) => [
  `🛒 <b>طلب شراء جديد — ${r.requestNumber}</b>`,
  `🏪 الفرع: <b>${r.branchName}</b>`,
  `📅 التاريخ: ${r.date}`,
  `📦 الأصناف: ${r.items.length}`,
  `💰 القيمة التقديرية: <b>${fmtMoney(r.totalValue)}</b>`,
  ``,
  ...r.items.map((i) => `• ${i.materialName} — ${fmt(i.quantityPU)} ${i.purchaseUnit} (آخر سعر ${fmtMoney(i.lastPricePU)}/${i.purchaseUnit})`),
  ``,
  `<i>RestoCost ERP</i>`,
].join('\n');

export const PurchaseRequestView: React.FC = () => {
  const {
    branches, rawMaterials, inventory, dailyCounts, branchStockLimits, grnNotes, suppliers,
    visibleBranchIds, currentUser, purchaseRequests, addPurchaseRequest,
    deletePurchaseRequest, convertRequestToPOs, getBranchName, showToast,
  } = useApp();

  const [branchId, setBranchId] = useState(visibleBranchIds[0] || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtyOverride, setQtyOverride] = useState<Record<string, number>>({});
  const [viewReqId, setViewReqId] = useState<string | null>(null);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const rows = useMemo(() => generateRequestItems({
    branchId, rawMaterials, inventory, dailyCounts, branchStockLimits, grnNotes, suppliers, minPriceWindowDays: 30,
  }), [branchId, rawMaterials, inventory, dailyCounts, branchStockLimits, grnNotes, suppliers]);

  useEffect(() => {
    const all: Record<string, boolean> = {};
    rows.forEach((r) => { all[r.rawMaterialId] = true; });
    setSelected(all);
    setQtyOverride({});
  }, [branchId, rows]);

  const selectedRows = rows.filter((r) => selected[r.rawMaterialId] && round2(qtyOverride[r.rawMaterialId] ?? r.quantityPU) > 0);
  const totalValue = selectedRows.reduce((s, r) => s + round2(qtyOverride[r.rawMaterialId] ?? r.quantityPU) * r.lastPricePU, 0);

  const api = async (path: string, body?: unknown) => {
    const token = localStorage.getItem('rcerp_token');
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    return res ? res.json().catch(() => ({ ok: false })) : { ok: false };
  };

  const sendTelegram = async (text: string) => {
    await api('/api/telegram/send', { text, channel: 'purchase' });
  };

  const printRequest = (r: PurchaseRequest) => requestPrint(r, getBranchName(r.branchId));

  const sendTextAndPdf = async (r: PurchaseRequest) => {
    const text = requestTelegramText(r);
    const docRes = await sendRequestPdfToBot(r, text);
    if (!docRes.ok) showToast(docRes.error || 'أُرسل النص ولكن تعذر إرسال PDF');
  };

  const saveRequest = async () => {
    if (selectedRows.length === 0) { showToast('لا توجد أصناف محددة — حدد أصنافاً لحفظ الطلب'); return; }
    const items: PurchaseRequestItem[] = selectedRows.map((r) => ({ ...r, quantityPU: round2(qtyOverride[r.rawMaterialId] ?? r.quantityPU) }));
    const rev = addPurchaseRequest({
      branchId, branchName: getBranchName(branchId), date, createdBy: currentUser?.name || '—',
      status: 'submitted', items,
      totalQtyPU: round2(items.reduce((s, i) => s + i.quantityPU, 0)),
      totalValue: round2(items.reduce((s, i) => s + i.quantityPU * i.lastPricePU, 0)),
    });
    await sendTelegram(requestTelegramText(rev));
    const docRes = await sendRequestPdfToBot(rev, requestTelegramText(rev));
    if (!docRes.ok) showToast(docRes.error || 'أُرسل النص ولكن تعذر إرسال PDF');
    showToast(`تم حفظ طلب الشراء ${rev.requestNumber} (${items.length} صنف) وإرساله نصًّا وPDF لمجموعة المشتريات`);
  };

  const convertRequest = (id: string) => {
    const r = convertRequestToPOs(id);
    if (r.ok) showToast(`تم إنشاء ${r.count} أمر توريد مبدئي — راجعها في شاشة «أوامر التوريد المبدئي»`);
    else showToast(r.error || 'تعذر تحويل الطلب');
  };

  const viewReq = viewReqId ? purchaseRequests.find((r) => r.id === viewReqId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الشراء"
        subtitle="يُحسب الطلب تلقائياً بعد الجرد من الجوال: عند بلوغ الصنف الحد الأدنى أو أقل يُطلب الفرق حتى الحد الأقصى، بالأقل رقمياً لوحدة الشراء — آخر سعر توريد = أقل سعر استلام خلال 30 يوماً، والمورد = آخر مورد تم الشراء منه فعلياً"
        icon={<ClipboardList className="w-6 h-6 text-indigo-600" />}
        actions={
          <Btn tone="primary" onClick={saveRequest}><Save className="w-4 h-4" /> حفظ الطلب ({selectedRows.length})</Btn>
        }
      />

      {/* رأس الطلب: التاريخ + الفرع */}
      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="تاريخ الطلب">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' !w-44'} />
        </Field>
        <Field label="الفرع">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls + ' !w-64'}>
            {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {rows.length} صنف يحتاج طلباً — القيمة التقديرية {fmtMoney(totalValue)}
        </div>
      </Card>

      {/* جدول البنود المحسوبة تلقائياً */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/60">
          <SectionHeader
            title={`بنود الطلب — ${getBranchName(branchId)}`}
            subtitle="قيم محسوبة تلقائياً من آخر جرد وحدود الفرع وأقرب استلامات. عدّل كمية بوحدة الشراء مباشرة."
            icon={<ShoppingCart className="w-5 h-5 text-indigo-500" />} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[1100px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">✓</th>
                <th className="p-3">الصنف</th>
                <th className="p-3">الوحدة</th>
                <th className="p-3 bg-indigo-50">الكـمية بوحدة الشراء</th>
                <th className="p-3 bg-amber-50">آخر سعر توريد (30 يوم)</th>
                <th className="p-3">آخر مورد</th>
                <th className="p-3 bg-rose-50">الحد الأدنى</th>
                <th className="p-3 bg-emerald-50">الحد الأقصى</th>
                <th className="p-3">آخر جرد (جوال)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const checked = !!selected[r.rawMaterialId];
                const qty = round2(qtyOverride[r.rawMaterialId] ?? r.quantityPU);
                return (
                  <tr key={r.rawMaterialId} className={`hover:bg-slate-50 ${checked ? '' : 'opacity-50'}`}>
                    <td className="p-3">
                      <button onClick={() => setSelected((p) => ({ ...p, [r.rawMaterialId]: !p[r.rawMaterialId] }))}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent hover:border-indigo-400'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      <span className="font-mono text-indigo-700 ml-1 text-[10px]">{r.code}</span>
                      <span>{r.materialName}</span>
                      {r.alwaysOrderFullMax && <span className="mr-1 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">طلب كامل</span>}
                    </td>
                    <td className="p-3 text-slate-500">{r.purchaseUnit} ({r.unit})</td>
                    <td className="p-3 bg-indigo-50/30">
                      <input type="number" min="0" step="any" value={qty || ''}
                        onChange={(e) => setQtyOverride((p) => ({ ...p, [r.rawMaterialId]: parseFloat(e.target.value) || 0 }))}
                        className={inputCls + ' !w-24 !h-8'} />
                    </td>
                    <td className="tnum text-left p-3 bg-amber-50/30 font-bold text-slate-800">
                      {r.lastPricePU > 0 ? fmtMoney(r.lastPricePU) : '—'}
                      {r.lastPriceDate ? <span className="block text-[9px] text-slate-400 font-bold">{r.lastPriceDate}</span> : null}
                    </td>
                    <td className="p-3 font-bold text-slate-700">{r.lastSupplierName}</td>
                    <td className="tnum text-left p-3 bg-rose-50/30 text-rose-700 font-bold">{fmt(r.minPU)}</td>
                    <td className="tnum text-left p-3 bg-emerald-50/30 text-emerald-700 font-bold">{fmt(r.maxPU)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{fmt(r.currentPU)} {r.purchaseUnit}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold text-sm">
                  لا توجد أصناف تحت الحد الأدنى لهذا الفرع بعد الجرد — الطلب يُنشأ فقط عند بلوغ الصنف الحد الأدنى أو أقل
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* قائمة الطلبات المحفوظة */}
      <Card className="p-4">
        <SectionHeader title={`الطلبات المحفوظة (${purchaseRequests.length})`} subtitle="حالة الطلب، تحويله إلى أمر توريد مبدئي بأقل سعر 30 يوماً وآخر مورد فعلي، وإعادة إرساله للبوت" icon={<ClipboardList className="w-5 h-5 text-indigo-500" />} />
        <div className="mt-3 space-y-2">
          {purchaseRequests.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-3 border rounded-xl px-4 py-3 text-xs ${r.status === 'converted' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'}`}>
              <div className="flex-1 min-w-[220px]">
                <p className="font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="font-mono text-indigo-700">{r.requestNumber}</span>
                  {r.status === 'converted'
                    ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">تم التحويل ({r.convertedToPOs?.length || 0})</span>
                    : <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">مرسل</span>}
                </p>
                <p className="text-slate-500 font-bold mt-1">فرع {r.branchName} — {r.date} — {r.items.length} صنف — {fmtMoney(r.totalValue)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Btn tone="ghost" onClick={() => setViewReqId(r.id)}><Eye className="w-4 h-4" /> عرض</Btn>
                <Btn tone="ghost" onClick={() => printRequest(r)}><Printer className="w-4 h-4" /> طباعة</Btn>
                <Btn tone="ghost" onClick={() => sendTextAndPdf(r)}><Send className="w-4 h-4" /> إرسال للبوت</Btn>
                {r.status !== 'converted' && (
                  <Btn tone="primary" onClick={() => convertRequest(r.id)}><ShoppingCart className="w-4 h-4" /> تحويل لأمر توريد مبدئي</Btn>
                )}
                <button onClick={() => deletePurchaseRequest(r.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="حذف"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {purchaseRequests.length === 0 && <p className="text-center text-slate-400 font-bold py-6 text-sm">لا توجد طلبات محفوظة بعد</p>}
        </div>
      </Card>

      <Card className="p-4 text-[11px] text-slate-600 space-y-1">
        <p className="font-extrabold text-slate-800 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> كيف يُحسب الطلب تلقائياً:</p>
        <p>• <b>المصدر:</b> آخر جرد من الجوال للفرع (بوحدة الشراء). عند عدم وجود جرد يُستخدم رصيد المخزون الحالي.</p>
        <p>• <b>الإثارة:</b> جرى الطلب فقط عندما يكون آخر جرد ≤ الحد الأدنى، أو للأصناف المحددة «طلب كامل» في حدود المخزون.</p>
        <p>• <b>الكمية:</b> الفرق بين الحد الأقصى والحد الأدنى/الرصيد بوحدة الشراء (وبوحدات الشراء) حتى لا تطلب كرتونات ناقصة.</p>
        <p>• <b>آخر سعر توريد:</b> أقل سعر استلام معتمد خلال آخر 30 يوماً بالوحدة للشراء؛ و<b>آخر مورد</b> = آخر مورد اشتريت منه فعلياً (يتجاهل ربط بطاقة الصنف بالمورد).</p>
        <p>• <b>أمر التوريد المبدئي:</b> تحويل الطلب ينشئ أوامر شراء مجمعة حسب آخر مورد بسعر آخر (الأقل 30 يوماً).</p>
      </Card>

      <Modal open={!!viewReq} onClose={() => setViewReqId(null)} title={`طلب الشراء ${viewReq?.requestNumber || ''} — ${viewReq?.branchName || ''}`} wide>
        <DocumentFingerprint entityType="purchaseRequest" entityId={viewReq?.id || ''} title="بصمة طلب الشراء" />
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-600">
            <span>التاريخ: {viewReq?.date}</span>
            <span>الحالة: {viewReq?.status === 'converted' ? 'تم التحويل' : 'مرسل'}</span>
            <span>بواسطة: {viewReq?.createdBy}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs min-w-[700px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-2">الصنف</th><th className="p-2">الكمية بوحدة الشراء</th><th className="p-2">آخر سعر توريد</th><th className="p-2">آخر مورد</th><th className="p-2">القيمة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {viewReq?.items.map((i) => (
                  <tr key={i.rawMaterialId}>
                    <td className="p-2 font-bold text-slate-900">{i.materialName}</td>
                    <td className="tnum text-left p-2 font-bold text-indigo-700">{fmt(i.quantityPU)} {i.purchaseUnit}</td>
                    <td className="tnum text-left p-2 text-slate-700">{fmtMoney(i.lastPricePU)}</td>
                    <td className="p-2">{i.lastSupplierName}</td>
                    <td className="tnum text-left p-2 text-slate-700">{fmtMoney(i.quantityPU * i.lastPricePU)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            {viewReq && <Btn tone="ghost" onClick={() => printRequest(viewReq)}><Printer className="w-4 h-4" /> طباعة</Btn>}
            {viewReq && viewReq.status !== 'converted' && (
              <Btn tone="primary" onClick={() => { convertRequest(viewReq.id); setViewReqId(null); }}><ShoppingCart className="w-4 h-4" /> تحويل لأمر توريد مبدئي</Btn>
            )}
            <button onClick={() => setViewReqId(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إغلاق</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};