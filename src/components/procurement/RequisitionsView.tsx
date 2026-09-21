import React, { useState } from 'react';
import { ClipboardList, Plus, Send, BadgeCheck, Ban, XCircle, Printer, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, StatusPill, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { RequisitionItem } from '../../types';

const DEPARTMENTS = ['المطبخ الرئيسي', 'مطبخ الإنتاج', 'قسم الحلويات', 'مخزن المشروبات', 'قسم التقديم والخدمة', 'إدارة أخرى'];

const REQ_STATUS_LABELS: Record<string, string> = { draft: 'مسودة', pending: 'بانتظار الاعتماد', approved: 'معتمد ومصروف', rejected: 'مرفوض', cancelled: 'ملغي' };

export const RequisitionsView: React.FC = () => {
  const { requisitions, rawMaterials, branches, visibleBranchIds, addRequisition, submitRequisition,
    approveRequisition, rejectRequisition, cancelRequisition, deleteRequisition, getAverageUnitCost, getBranchName, currentUser, can } = useApp();
  const [filterBranch, setFilterBranch] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [branchId, setBranchId] = useState(visibleBranchIds[0] || 'b-ck');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [requestedBy, setRequestedBy] = useState(currentUser?.name || '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RequisitionItem[]>([]);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const filtered = filterBranch === 'all' ? requisitions : requisitions.filter((r) => r.branchId === filterBranch);
  const costOf = (r: typeof requisitions[number]) => r.items.reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
  const pendingCount = requisitions.filter((r) => r.status === 'pending').length;
  const totalValue = requisitions.filter((r) => r.status === 'approved').reduce((s, r) => s + costOf(r), 0);

  const addItem = () => {
    const mat = rawMaterials[0];
    if (!mat) return;
    setItems((prev) => [...prev, { rawMaterialId: mat.id, itemName: mat.nameAr, unit: mat.unit, quantity: 1 }]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || items.some((i) => i.quantity <= 0)) return;
    addRequisition({ branchId, department, date, requestedBy: requestedBy || currentUser?.name || 'المستخدم', items, notes });
    setItems([]); setNotes(''); setShowModal(false);
  };

  const rejectWithReason = (id: string) => {
    const reason = window.prompt('سبب الرفض:');
    if (reason === null) return;
    rejectRequisition(id, reason.trim() || 'بدون سبب');
  };

  const printReq = (r: typeof requisitions[number]) => {
    openPrintWindow({
      title: `أذن صرف داخلي — ${r.reqNumber}`,
      subtitle: REQ_STATUS_LABELS[r.status],
      meta: [['القسم', r.department], ['الفرع', r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)], ['التاريخ', r.date], ['طلب بواسطة', r.requestedBy], ['اعتمدها', r.approvedBy || '—'], ['عدد الأصناف', `${r.items.length}`]],
      tables: [{ title: 'الأصناف المطلوب صرفها', header: ['#', 'الصنف', 'الكمية', 'الوحدة', 'التكلفة'], rows: r.items.map((it, idx) => [idx + 1, it.itemName, it.quantity, it.unit, fmtMoney(it.quantity * getAverageUnitCost(it.rawMaterialId))]) }],
      totals: [['إجمالي قيمة الصرف', `${fmtMoney(costOf(r))}`]],
      footer: r.notes ? `ملاحظات: ${r.notes}` : 'أذن صرف داخلي من RestoCost ERP — يُصرف ويُقيد على التكلفة عند الاعتماد',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="أذون الصرف الداخلي (Requisition)" subtitle="طلبات صرف مواد من المخزون للأقسام بموافقة إدارية — يُصرف المخزون ويُقيد على التكلفة تلقائياً" icon={<ClipboardList className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="أذون_الصرف"
            sheets={[{ name: 'أذون الصرف', header: ['الرقم', 'القسم', 'الفرع', 'التاريخ', 'الكمية', 'التكلفة', 'الحالة', 'طلب بواسطة', 'اعتمدها', 'ملاحظات'], rows: filtered.map((r) => [r.reqNumber, r.department, r.branchId === 'b-ck' ? 'المطبخ المركزي' : r.branchId, r.date, r.totalQty, costOf(r).toFixed(2), REQ_STATUS_LABELS[r.status], r.requestedBy, r.approvedBy || '', r.rejectReason || r.notes || '']), }]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Requisitions.csv', ['الرقم', 'القسم', 'الفرع', 'التاريخ', 'الكمية', 'التكلفة', 'الحالة'], filtered.map((r) => [r.reqNumber, r.department, r.branchId, r.date, r.totalQty, costOf(r).toFixed(2), r.status]))}>تصدير CSV</Btn>
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> أذن صرف جديد</Btn>
        </>} />

      <Card className="p-4 flex items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الأذون</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{requisitions.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">بانتظار الاعتماد</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{pendingCount}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs"><span className="text-indigo-600 text-[11px] block">أذون معتمدة</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{requisitions.filter((r) => r.status === 'approved').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">قيمة الصرف المعتمد</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalValue)}</strong></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الرقم</th><th className="p-3">القسم</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الأصناف</th><th className="p-3">الكمية</th><th className="p-3">التكلفة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-indigo-700">{r.reqNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{r.department}</td>
                  <td className="p-3 text-slate-600">{r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)}</td>
                  <td className="p-3 font-mono text-slate-600">{r.date}</td>
                  <td className="p-3 font-bold">{r.items.length}</td>
                  <td className="p-3 font-mono font-bold">{fmt(r.totalQty)}</td>
                  <td className="p-3 font-mono font-extrabold text-slate-900">{fmtMoney(costOf(r))}</td>
                  <td className="p-3"><StatusPill status={r.status} map={REQ_STATUS_LABELS} /></td>
                  <td className="p-3">
                    <div className="flex gap-1 items-center">
                      {r.status === 'draft' && (
                        <>
                          <button onClick={() => submitRequisition(r.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إرسال للاعتماد"><Send className="w-4 h-4" /></button>
                          <button onClick={() => cancelRequisition(r.id)} className="p-1.5 text-slate-500 hover:bg-slate-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>
                          <button onClick={() => deleteRequisition(r.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                      {r.status === 'pending' && (
                        <>
                          {can('approve_requisitions') && <button onClick={() => approveRequisition(r.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="اعتماد وصرف (يخفض المخزون ويقيد التكلفة)"><BadgeCheck className="w-4 h-4" /></button>}
                          {can('approve_requisitions') && <button onClick={() => rejectWithReason(r.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض"><Ban className="w-4 h-4" /></button>}
                          <button onClick={() => cancelRequisition(r.id)} className="p-1.5 text-slate-500 hover:bg-slate-50 rounded-lg" title="إلغاء"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      {r.status === 'approved' && <span className="text-emerald-600 text-[10px] font-bold">صُرف{r.approvedAt ? ` ${new Date(r.approvedAt).toLocaleDateString('ar-SA-u-nu-latn')}` : ''}</span>}
                      {r.status === 'rejected' && r.rejectReason && <span className="text-rose-500 text-[10px] font-bold max-w-28 truncate" title={r.rejectReason}>{r.rejectReason}</span>}
                      <button onClick={() => printReq(r)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="طباعة"><Printer className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد أذون صرف — أنشئ أذن صرف للأقسام</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="أذن صرف داخلي جديد" wide>
        <form onSubmit={submit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع" required>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="القسم الطالب" required>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="التاريخ" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
            <Field label="طلب بواسطة"><input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={inputCls} /></Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">الأصناف المطلوب صرفها</span>
              <Btn onClick={addItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-2">
                <div className="col-span-2">
                  <AutocompleteSelect
                    value={item.rawMaterialId}
                    onChange={(val) => { const m = rawMaterials.find((x) => x.id === val); setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, rawMaterialId: val, itemName: m?.nameAr || '', unit: m?.unit || '' } : it))); }}
                    options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                    getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                    placeholder="— اختر مادة خام —"
                    className="w-full"
                  />
                </div>
                <input type="number" min="0.01" step="0.01" value={item.quantity || ''} onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: parseFloat(e.target.value) || 0 } : it)))} className={inputCls} placeholder="الكمية" />
                <div className="flex items-center justify-between">
                  <span className="text-center text-slate-500 text-[10px] pt-2">{item.unit}</span>
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 p-1">✕</button>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="text-center text-slate-400 text-xs py-3">أضف أصنافاً للصرف</p>}
          </div>

          <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">حفظ كمسودة</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};