import React, { useState, useMemo, useEffect } from 'react';
import { RotateCcw, Plus, CheckCircle2, XCircle, Printer, Pencil, Send, Ban, Search, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Btn, Modal, Field, inputCls, AutocompleteSelect, DocumentFingerprint } from '../ui';
import { ErpPanel, ErpPageHeader, ErpQueryBar, ErpField, ErpInput, ErpSelect, ErpButton } from '../ui/erp';
import { fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { SupplierReturn, SupplierReturnItem } from '../../types';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ApprovalPathBar, type ApprovalStepDef, type ApprovalTerminalType } from '../ui/ApprovalPath';

/* مسار اعتماد موحّد لإذن إرجاع المورد (بند 41) */
const RETURN_PATH: { steps: Record<'draft' | 'review' | 'approve' | 'post', ApprovalStepDef>; terminal: { type: ApprovalTerminalType; label: string } } = {
  steps: { draft: { id: 'draft', label: 'مسودة' }, review: { id: 'submitted', label: 'مراجعة' }, approve: { id: 'approved', label: 'اعتماد' }, post: { id: 'posted', label: 'ترحيل' } },
  terminal: { type: 'rejected', label: 'مرفوض' },
};

export const SupplierReturnsView: React.FC = () => {
  const {
    supplierReturns, suppliers, rawMaterials, branches, visibleBranchIds,
    addSupplierReturn, updateSupplierReturn, approveSupplierReturn, reprocessSupplierReturn, revertSupplierReturnToDraft,
    getBranchName, can, grnNotes, getReturnedQtyForGrn, verifyAdminPassword, showToast,
  } = useApp();

  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editReturn, setEditReturn] = useState<SupplierReturn | null>(null);
  const [editItems, setEditItems] = useState<SupplierReturnItem[]>([]);
  const [editReason, setEditReason] = useState('');

  const [retSupplierId, setRetSupplierId] = useState(suppliers[0]?.id || '');
  const [retBranchId, setRetBranchId] = useState(visibleBranchIds[0] || '');
  const [retCurrency, setRetCurrency] = useState('SAR');
  const [retRate, setRetRate] = useState(1);
  const [retVatRate, setRetVatRate] = useState<number>(15);
  const [retVatIncl, setRetVatIncl] = useState<boolean>(false);
  const [retInvoiceTotalInput, setRetInvoiceTotalInput] = useState<string>('');
  const [selectedGrnId, setSelectedGrnId] = useState('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const filtered = useMemo(() => {
    return supplierReturns.filter((r) => {
      if (filterBranch !== 'all' && r.branchId !== filterBranch) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (search && !r.supplierName.includes(search) && !r.returnNumber.includes(search) && !r.reason.includes(search)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [supplierReturns, filterBranch, filterStatus, dateFrom, dateTo, search]);

  const RETURN_STATUS_LABELS: Record<SupplierReturn['status'], string> = {
    draft: 'مسودة', submitted: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض',
  };
  const RETURN_STATUS_COLORS: Record<SupplierReturn['status'], string> = {
    draft: 'bg-slate-100 text-slate-700', submitted: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700',
  };

  // Bulk actions (selection system — same as GRN)
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const selectedOf = (status: SupplierReturn['status']) => filtered.filter((r) => selectedIds.has(r.id) && r.status === status);

  const bulkSubmitSelected = () => {
    const list = selectedOf('draft');
    if (!list.length) { showToast('لا توجد إرجاعات مختارة بحالة "مسودة" للإرسال للمراجعة'); return; }
    if (!confirm(`إرسال ${list.length} إرجاع للمراجعة؟ سيتم تحويلها لحالة "قيد المراجعة".`)) return;
    list.forEach((r) => updateSupplierReturn(r.id, { status: 'submitted' }));
    setSelectedIds(new Set());
    showToast(`تم إرسال ${list.length} إرجاع للمراجعة`);
  };

  const bulkApproveSelected = () => {
    const list = selectedOf('submitted');
    if (!list.length) { showToast('لا توجد إرجاعات مختارة بحالة "قيد المراجعة" للاعتماد'); return; }
    if (!confirm(`اعتماد ${list.length} إرجاع؟ سيخفض المخزون ويُنشئ قيوداً محاسبية.`)) return;
    list.forEach((r) => approveSupplierReturn(r.id));
    setSelectedIds(new Set());
    showToast(`تم اعتماد ${list.length} إرجاع`);
  };

  const bulkRevertSelected = async () => {
    const list = filtered.filter((r) => selectedIds.has(r.id) && (r.status === 'submitted' || r.status === 'approved'));
    if (!list.length) { showToast('لا توجد إرجاعات مختارة (قيد المراجعة أو معتمدة) للإرجاع لمسودة'); return; }
    const password = prompt('كلمة مرور مسؤول النظام مطلوبة لإرجاع الإرجاعات المحددة لمسودة:');
    if (!(await verifyAdminPassword(password || ''))) { showToast('كلمة مرور خاطئة — صلاحية مسؤول النظام مطلوبة'); return; }
    const approved = list.filter((r) => r.status === 'approved').length;
    if (!confirm(`تأكيد: سيتم إرجاع ${list.length} إرجاع محدد لمسودة${approved ? ` (${approved} معتمد — ستُعكس حركات المخزون والقيود)` : ''}. المتابعة؟`)) return;
    list.forEach((r) => revertSupplierReturnToDraft(r.id));
    setSelectedIds(new Set());
  };

  // GRNs المعتمدة للفلترة حسب المورد والفرع
  const availableGrns = useMemo(() => {
    if (!retSupplierId || !retBranchId) return [];
    return grnNotes.filter((g) =>
      g.status === 'approved' &&
      g.supplierId === retSupplierId &&
      g.branchId === retBranchId
    ).sort((a, b) => b.date.localeCompare(a.date));
  }, [grnNotes, retSupplierId, retBranchId]);

  // عند اختيار GRN - تعبئة الأصناف تلقائياً
  const handleGrnSelect = (grnId: string) => {
    const grn = grnNotes.find((g) => g.id === grnId);
    if (!grn) return;
    setSelectedGrnId(grnId);
    setRetSupplierId(grn.supplierId);
    setRetBranchId(grn.branchId);
    setRetCurrency(grn.currencyCode || 'SAR');
    setRetRate(grn.exchangeRate || 1);
    setRetVatRate(grn.vatRate ?? 15);
    setRetVatIncl(grn.vatInclusive ?? false);
    // تعبئة الأصناف مع الكمية المتاحة = المستلمة - المرتجعة سابقاً
    const items = grn.items.map((it) => {
      const returned = getReturnedQtyForGrn(grn.id, it.rawMaterialId);
      const available = Math.max(0, it.quantityReceived - returned);
      return {
        rawMaterialId: it.rawMaterialId,
        itemName: rawMaterials.find((m) => m.id === it.rawMaterialId)?.nameAr || it.rawMaterialId,
        quantity: available > 0 ? available : 0,
        unit: it.rawMaterialId ? (rawMaterials.find((m) => m.id === it.rawMaterialId)?.unit || '') : '',
        unitPrice: it.unitPrice,
        lineTotal: 0,
      };
    }).filter((i) => i.quantity > 0);
    setEditItems(items);
  };

  // مسح اختيار GRN عند تغيير المورد/الفرع يدوياً
  useEffect(() => {
    setSelectedGrnId('');
  }, [retSupplierId, retBranchId]);

  // معالجة preselectGrnId من localStorage (عند الضغط على "إنشاء إرجاع" من شاشة الاستلام)
  useEffect(() => {
    const preselectId = localStorage.getItem('preselectGrnId');
    if (preselectId) {
      const grn = grnNotes.find((g) => g.id === preselectId);
      if (grn && grn.status === 'approved') {
        handleGrnSelect(preselectId);
      }
      localStorage.removeItem('preselectGrnId');
    }
  }, []);

  const supplierReturnItems = useMemo(() => {
    return filtered.flatMap((r) => r.items.map((it) => ({
      returnNumber: r.returnNumber, supplierName: r.supplierName,
      branchId: r.branchId, date: r.date, status: r.status,
      itemName: it.itemName, quantity: it.quantity, unit: it.unit,
      unitPrice: it.unitPrice, lineTotal: it.lineTotal,
    })));
  }, [filtered]);

  const printReturns = (list: SupplierReturn[]) => {
    if (list.length === 0) return;
    openPrintWindow({
      title: `إخطارات إرجاع الموردين — ${list.length} إخطار`,
      subtitle: 'طباعة جماعية',
      meta: [['عدد الإخطارات', `${list.length}`], ['إجمالي القيمة', `${fmtMoney(list.reduce((s, g) => s + g.totalAmount, 0))}`], ['فترة', `${dateFrom || 'البداية'} — ${dateTo || 'النهاية'}`]],
      tables: list.map((r) => ({
        title: `${r.returnNumber} — ${r.supplierName} (${r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)}) — ${r.date}`,
        header: ['#', 'الصنف', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي'],
        rows: r.items.map((it, idx) => [idx + 1, it.itemName, it.quantity, it.unit, it.unitPrice, it.lineTotal.toFixed(2)]),
      })),
      footer: 'طباعة جماعية لإخطارات إرجاع الموردين — RestoCost ERP',
    });
  };

  const printSearchScreen = () => {
    openPrintWindow({
      title: `شاشة بحث إرجاع الموردين`,
      subtitle: `فرع: ${filterBranch === 'all' ? 'الكل' : getBranchName(filterBranch)} | حالة: ${filterStatus === 'all' ? 'الكل' : filterStatus} | فترة: ${dateFrom || 'بداية'} — ${dateTo || 'نهاية'}`,
      meta: [['إجمالي السجلات', `${filtered.length}`], ['إجمالي القيمة', `${fmtMoney(filtered.reduce((s, r) => s + r.totalAmount, 0))}`]],
      tables: [{
        title: 'نتائج البحث',
        header: ['رقم الإرجاع', 'المورد', 'الفرع', 'التاريخ', 'السبب', 'عدد الأصناف', 'الإجمالي', 'العملة', 'الحالة'],
        rows: filtered.map((r) => [
          r.returnNumber, r.supplierName, r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId),
          r.date, r.reason, r.items.length, fmtMoney(r.totalAmount), r.currencyCode || 'SAR',
          RETURN_STATUS_LABELS[r.status],
        ]),
      }],
      footer: 'RestoCost ERP — شاشة بحث إرجاع الموردين',
    });
  };

  const addItem = () => {
    const mat = rawMaterials[0];
    if (!mat) return;
    setEditItems((prev) => [...prev, { rawMaterialId: mat.id, itemName: mat.nameAr, quantity: 0, unit: mat.unit, unitPrice: mat.standardPrice, lineTotal: 0 }]);
  };

  const updItem = (idx: number, patch: Partial<SupplierReturnItem>) => setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const calcTotalsWithVat = (items: SupplierReturnItem[]) => {
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const vatAmt = retVatIncl ? (subtotal * retVatRate) / (100 + retVatRate) : (subtotal * retVatRate) / 100;
    return { _subtotal: subtotal, vatAmt, total: retVatIncl ? subtotal : subtotal + vatAmt };
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find((s) => s.id === retSupplierId);
    if (!supplier || editItems.length === 0 || editItems.some((i) => i.quantity <= 0)) return;
    const { vatAmt, total } = calcTotalsWithVat(editItems);
    addSupplierReturn({
      supplierId: supplier.id, supplierName: supplier.name,
      branchId: retBranchId,
      date: new Date().toISOString().split('T')[0], reason: editReason,
      items: editItems.map((i) => ({ ...i, lineTotal: i.quantity * i.unitPrice })),
      totalAmount: total, vatRate: retVatRate, vatAmount: vatAmt, vatInclusive: retVatIncl, status: 'draft', createdBy: 'المستخدم الحالي',
      currencyCode: retCurrency !== 'SAR' ? retCurrency : undefined,
      exchangeRate: retCurrency !== 'SAR' ? retRate : undefined,
    });
    setEditItems([]); setEditReason(''); setShowModal(false); setRetCurrency('SAR'); setRetRate(1); setRetVatRate(15); setRetVatIncl(false);
  };

  const openEdit = (r: SupplierReturn) => {
    setEditReturn(r);
    setEditItems(r.items.map((i) => ({ ...i })));
    setEditReason(r.reason || '');
    setRetVatRate(r.vatRate ?? 15);
    setRetVatIncl(r.vatInclusive ?? false);
    setRetSupplierId(r.supplierId);
    setRetBranchId(r.branchId);
    setRetCurrency(r.currencyCode || 'SAR');
    setRetRate(r.exchangeRate || 1);
  };

  const saveEdit = () => {
    if (!editReturn) return;
    const { vatAmt, total } = calcTotalsWithVat(editItems);
    updateSupplierReturn(editReturn.id, { items: editItems, reason: editReason, totalAmount: total, vatRate: retVatRate, vatAmount: vatAmt, vatInclusive: retVatIncl });
    setEditReturn(null); setEditItems([]); setEditReason(''); setRetVatRate(15); setRetVatIncl(false);
  };

  return (
    <div className="space-y-4">
      <ErpPanel>
        <ErpPageHeader
          icon={<RotateCcw className="w-6 h-6" />}
          title="إذن إرجاع الموردين"
          subtitle="إنشاء وإدارة إخطارات إرجاع المواد للموردين مع اعتماد بمرحلتين (مراجعة ← اعتماد نهائي)"
          actions={
            <>
              <ViewToolbar
                filename="إرجاع_الموردين"
                sheets={[
                  { name: 'الإرجاعات', header: ['رقم', 'المورد', 'الفرع', 'التاريخ', 'السبب', 'الأصناف', 'الإجمالي', 'العملة', 'الحالة'], rows: filtered.map((r) => [r.returnNumber, r.supplierName, r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId), r.date, r.reason, r.items.length, r.totalAmount, r.currencyCode || 'SAR', RETURN_STATUS_LABELS[r.status]]) },
                  { name: 'تفاصيل الأصناف', header: ['رقم الإرجاع', 'المورد', 'الصنف', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'], rows: supplierReturnItems.map((i) => [i.returnNumber, i.supplierName, i.itemName, i.quantity, i.unit, i.unitPrice, i.lineTotal]) },
                ]}
              />
              <ErpButton onClick={printSearchScreen}><Printer className="w-3.5 h-3.5" /> طباعة الشاشة</ErpButton>
              <ErpButton variant="primary" onClick={() => setShowModal(true)}><Plus className="w-3.5 h-3.5" /> إرجاع جديد</ErpButton>
            </>
          }
        />

        {/* إجراءات جماعية */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mb-3 flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-xl border border-primary-200 bg-primary-50/50">
            <span className="text-[11px] font-bold text-primary-800 tnum">محدَّد {selectedIds.size} من {filtered.length}</span>
            {selectedOf('draft').length > 0 && (
              <Btn tone="primary" onClick={bulkSubmitSelected}><Send className="w-4 h-4" /> إرسال للمراجعة ({selectedOf('draft').length})</Btn>
            )}
            {selectedOf('submitted').length > 0 && can('approve_purchase_orders') && (
              <Btn tone="success" onClick={bulkApproveSelected}><Shield className="w-4 h-4" /> اعتماد ({selectedOf('submitted').length})</Btn>
            )}
            {filtered.some((r) => selectedIds.has(r.id) && (r.status === 'submitted' || r.status === 'approved')) && (
              <Btn tone="danger" onClick={bulkRevertSelected}><RotateCcw className="w-4 h-4" /> إرجاع لمسودة</Btn>
            )}
          </div>
        )}

        <div className="px-6 pb-4 border-t border-line/60">
          <ErpQueryBar>
            <ErpField label="الفرع" className="w-48">
              <ErpSelect value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
                <option value="all">جميع الفروع</option>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </ErpSelect>
            </ErpField>
            <ErpField label="الحالة" className="w-40">
              <ErpSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">الكل</option>
                <option value="draft">مسودة</option>
                <option value="submitted">قيد المراجعة</option>
                <option value="approved">معتمد</option>
                <option value="rejected">مرفوض</option>
              </ErpSelect>
            </ErpField>
            <ErpField label="من تاريخ" className="w-40">
              <ErpInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </ErpField>
            <ErpField label="إلى تاريخ" className="w-40">
              <ErpInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </ErpField>
            <ErpField label="بحث" className="w-64">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
                <ErpInput value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" placeholder="المورد، رقم، سبب" />
              </div>
            </ErpField>
            <span className="text-[11px] font-bold text-slate-500 tnum">{filtered.length} إذن من {supplierReturns.length}</span>
          </ErpQueryBar>
        </div>
      </ErpPanel>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-line">
              {/* الأرقام (التاريخ/الأصناف/الإجمالي/العملة) محاذاة يسار + tnum */}
              <tr><th className="p-3 w-10"><input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.id))); else setSelectedIds(new Set()); }} /></th><th className="p-3 text-right">رقم الإرجاع</th><th className="p-3 text-right">المورد</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-left">التاريخ</th><th className="p-3 text-right">السبب</th><th className="p-3 text-left">الأصناف</th><th className="p-3 text-left">الإجمالي</th><th className="p-3 text-left">العملة</th><th className="p-3 text-center">الحالة</th><th className="p-3 text-center">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  <td className="tnum text-left p-3 font-bold text-primary-700">{r.returnNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{r.supplierName}</td>
                  <td className="p-3 text-slate-600">{r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)}</td>
                  <td className="p-3 text-left tnum text-slate-600">{r.date}</td>
                  <td className="p-3 text-slate-600 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                  <td className="p-3 text-left tnum font-bold">{r.items.length}</td>
                  <td className="p-3 text-left tnum font-extrabold text-slate-900">{fmtMoney(r.totalAmount)}</td>
                  <td className="p-3 text-left tnum text-amber-700">{r.currencyCode || 'SAR'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${RETURN_STATUS_COLORS[r.status]}`}>{RETURN_STATUS_LABELS[r.status]}</span></td>
                  <td className="p-3">
                    <div className="flex gap-2 items-center justify-center">
                      {r.status === 'draft' && (
                        <div className="flex gap-1">
                          {can('approve_purchase_orders') && <button onClick={() => updateSupplierReturn(r.id, { status: 'submitted' })} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إرسال للمراجعة"><Send className="w-4 h-4" /></button>}
                          <button onClick={() => openEdit(r)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="تعديل"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => updateSupplierReturn(r.id, { status: 'rejected' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض"><XCircle className="w-4 h-4" /></button>
                        </div>
                      )}
                      {r.status === 'submitted' && (
                        <div className="flex gap-1">
                          {can('approve_purchase_orders') && <button onClick={() => approveSupplierReturn(r.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="اعتماد نهائي (يخفض المخزون)"><Shield className="w-4 h-4" /></button>}
                          <button onClick={() => updateSupplierReturn(r.id, { status: 'rejected' })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="رفض"><Ban className="w-4 h-4" /></button>
                          <button onClick={() => printReturns([r])} className="text-[11px] font-bold text-primary-600 hover:underline">طباعة</button>
                        </div>
                      )}
                      {r.status === 'approved' && (
                        <div className="flex gap-1">
                          <span className="text-emerald-600"><CheckCircle2 className="w-4 h-4 inline" /> معتمد</span>
                          <button onClick={() => { if (confirm('إعادة ترحيل هذا الإرجاع؟ سيُنشأ حركات مخزون وقيود محاسبية جديدة.')) reprocessSupplierReturn(r.id); }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="إعادة ترحيل (إنشاء حركات مخزون)"><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => printReturns([r])} className="text-[11px] font-bold text-primary-600 hover:underline">طباعة</button>
                        </div>
                      )}
                      {r.status === 'rejected' && <span className="text-rose-600"><XCircle className="w-4 h-4 inline" /> مرفوض</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-500 font-bold">لا توجد إخطارات إرجاع</td></tr>}
            </tbody>
            {/* صف الإجمالي — كان مفقوداً: عند التصفية على فرع أو حالة يرى
                المستخدمSubset لا يعرف قيمته الإجمالية إلا عبر التصدير. */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-line">
                  <td className="px-2 py-2.5" />
                  <td className="px-3 py-2.5 font-bold text-slate-700">
                    الإجمالي <span className="tnum text-slate-500">({filtered.length})</span>
                  </td>
                  <td colSpan={3} className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">{filtered.reduce((s, r) => s + r.items.length, 0)}</td>
                  <td className="px-2 py-2.5 text-left tnum font-extrabold text-slate-900">{fmtMoney(filtered.reduce((s, r) => s + (r.totalAmount || 0), 0))}</td>
                  <td colSpan={3} className="px-2 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* New/Edit Modal */}
      <Modal open={showModal || editReturn !== null} onClose={() => { setShowModal(false); setEditReturn(null); setEditItems([]); setEditReason(''); }} title={editReturn ? `تعديل إرجاع ${editReturn.returnNumber} (${editReturn.status === 'draft' ? 'مسودة' : 'قيد المراجعة'})` : 'إذن إرجاع مورد جديد'} wide>
        {editReturn && (
          <div className="mb-3">
            <ApprovalPathBar caption="مسار اعتماد إذن الإرجاع" steps={[RETURN_PATH.steps.draft, RETURN_PATH.steps.review, RETURN_PATH.steps.approve, RETURN_PATH.steps.post]} current={editReturn.status} statusLabel={RETURN_STATUS_LABELS[editReturn.status]} terminal={RETURN_PATH.terminal} />
          </div>
        )}
        {editReturn && <DocumentFingerprint entityType="supplierReturn" entityId={editReturn.id} title={`بصمة الإرجاع ${editReturn.returnNumber}`} />}
        <form onSubmit={editReturn ? saveEdit : submitNew} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <Field label="المورد" required>
              <select value={retSupplierId} onChange={(e) => setRetSupplierId(e.target.value)} disabled={!!editReturn} className={inputCls}>
                {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="الفرع" required>
              <select value={retBranchId} onChange={(e) => setRetBranchId(e.target.value)} disabled={!!editReturn} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="العملة">
              <select value={retCurrency} onChange={(e) => { setRetCurrency(e.target.value); setRetRate(1); }} disabled={!!editReturn} className={inputCls}>
                <option value="SAR">SAR — الريال السعودي</option>
                <option value="USD">USD — الدولار الأمريكي</option>
                <option value="EUR">EUR — اليورو</option>
              </select>
            </Field>
          </div>
          {retCurrency !== 'SAR' && (
            <Field label={`سعر الصرف (1 ${retCurrency} = ... ر.س)`}>
              <input type="number" min="0" step="0.0001" value={retRate || ''} onChange={(e) => setRetRate(parseFloat(e.target.value) || 0)} className={inputCls} />
            </Field>
          )}
          {/* اختيار إشعار استلام (GRN) لتعبئة الأصناف تلقائياً */}
          {availableGrns.length > 0 && !editReturn && (
            <Field label="اختر إشعار استلام (GRN) لتعبئة الأصناف تلقائياً">
              <select value={selectedGrnId} onChange={(e) => handleGrnSelect(e.target.value)} className={inputCls}>
                <option value="">— اختر إشعار استلام معتمد —</option>
                {availableGrns.map((g) => (
                  <option key={g.id} value={g.id}>{g.grnNumber} — {g.date} — {g.invoiceNumber || 'بدون فاتورة'} — {fmtMoney(g.totalAmount)}</option>
                ))}
              </select>
            </Field>
          )}
          {selectedGrnId && !editReturn && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs">
              <span className="font-bold text-emerald-950">تم تحميل أصناف GRN: </span>
              <span className="tnum text-emerald-700">{grnNotes.find((g) => g.id === selectedGrnId)?.grnNumber}</span>
              <span className="ml-2 text-emerald-700">({editItems.length} صنف جاهز للإرجاع)</span>
              <button type="button" onClick={() => { setSelectedGrnId(''); setEditItems([]); }} className="ml-3 text-rose-600 hover:text-rose-800 text-[10px] font-bold underline">مسح الاختيار</button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <Field label="الأسعار شاملة الضريبة">
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setRetVatIncl(true)} className={`px-4 py-1.5 rounded-lg text-xs font-extrabold border transition-colors ${retVatIncl ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300'}`}>شاملة</button>
                <button type="button" onClick={() => setRetVatIncl(false)} className={`px-4 py-1.5 rounded-lg text-xs font-extrabold border transition-colors ${!retVatIncl ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300'}`}>غير شاملة</button>
              </div>
            </Field>
            <Field label="نسبة ضريبة القيمة المضافة %">
              <input type="number" min="0" max="100" value={retVatRate || ''} onChange={(e) => setRetVatRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={inputCls} />
            </Field>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <Field label="إجمالي مذكرة الإرجاع من المورد (اختياري — للتوزيع التلقائي للأسعار)">
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" value={retInvoiceTotalInput} onChange={(e) => setRetInvoiceTotalInput(e.target.value)} className={inputCls} placeholder="أدخل إجمالي مذكرة الإرجاع واضغط توزيع" />
                <Btn tone="ghost" onClick={() => {
                  const targetTotal = parseFloat(retInvoiceTotalInput) || 0;
                  if (targetTotal <= 0) return;
                  const currentSubtotal = editItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                  if (currentSubtotal <= 0) return;
                  const factor = targetTotal / (retVatIncl ? currentSubtotal : currentSubtotal + (currentSubtotal * retVatRate / 100));
                  setEditItems((prev) => prev.map((it) => ({ ...it, unitPrice: Math.round(it.unitPrice * factor * 100) / 100 })));
                  setRetInvoiceTotalInput('');
                }}><RotateCcw className="w-3.5 h-3.5" /> توزيع</Btn>
              </div>
            </Field>
          </div>

          <Field label="سبب الإرجاع"><textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={2} className={inputCls} placeholder="مثال: تلف، عدم مطابقة مواصفات، كمية زائدة..." /></Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="font-bold text-slate-700">الأصناف المرتجعة</span><Btn onClick={addItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn></div>
            {editItems.length > 0 && (
              <div className="border border-line rounded-xl overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 w-9 text-center">#</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-right">المادة الخام</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-center w-24">الكمية</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-center w-28">سعر الوحدة</th>
                      <th className="px-2 py-2 text-[10px] font-bold text-slate-500 text-left w-28">الإجمالي</th>
                      <th className="px-2 py-2 w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-2 py-1 text-center mono text-slate-400 text-xs">{idx + 1}</td>
                        <td className="px-2 py-1"><AutocompleteSelect
                            value={item.rawMaterialId}
                            onChange={(val) => { const m = rawMaterials.find((x) => x.id === val); updItem(idx, { rawMaterialId: val, itemName: m?.nameAr || '', unit: m?.unit || '' }); }}
                            options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                            getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                            placeholder="— اختر مادة خام —"
                            className="w-full"
                          /></td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" value={item.quantity || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => { const q = parseFloat(e.currentTarget.value) || 0; updItem(idx, { quantity: q, lineTotal: (item.unitPrice || 0) * q }); }} className={inputCls + ' text-center tnum'} placeholder="الكمية" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" value={item.unitPrice || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => { const p = parseFloat(e.currentTarget.value) || 0; updItem(idx, { unitPrice: p, lineTotal: (item.quantity || 0) * p }); }} className={inputCls + ' text-center tnum'} placeholder="السعر" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="any" value={item.lineTotal || ''} onInput={(e: React.FormEvent<HTMLInputElement>) => { const total = parseFloat(e.currentTarget.value) || 0; const qty = item.quantity || 0; updItem(idx, { lineTotal: total, unitPrice: qty > 0 ? total / qty : 0 }); }} className={inputCls + ' text-center tnum font-bold'} placeholder="الإجمالي" />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 p-1">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-slate-600 text-xs bg-slate-50 border-t-2 border-line">الإجمالي قبل الضريبة</td>
                      <td className="px-2 py-2.5 text-left tnum font-extrabold text-xs bg-slate-50 border-t-2 border-line">{fmtMoney(calcTotalsWithVat(editItems)._subtotal)}</td>
                      <td className="bg-slate-50 border-t-2 border-line" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {editItems.length === 0 && <p className="text-center text-slate-400 text-xs py-3">أضف أصنافاً للإرجاع</p>}
          </div>

          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-1.5">
            <div className="flex justify-between items-center text-xs"><span className="font-bold text-indigo-950">الإجمالي قبل الضريبة</span><span className="tnum font-extrabold text-indigo-800">{fmtMoney(calcTotalsWithVat(editItems)._subtotal)}</span></div>
            <div className="flex justify-between items-center text-xs"><span className="font-bold text-indigo-950">ضريبة القيمة المضافة ({retVatRate}%) {retVatIncl ? '(مشمولة)' : ''}</span><span className="tnum font-extrabold text-amber-700">{fmtMoney(calcTotalsWithVat(editItems).vatAmt)}</span></div>
            <div className="flex justify-between items-center text-sm border-t border-indigo-200 pt-1.5"><span className="font-black text-indigo-950">إجمالي الإرجاع</span><span className="text-lg font-black text-indigo-800 tnum">{fmtMoney(calcTotalsWithVat(editItems).total)}</span></div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowModal(false); setEditReturn(null); setEditItems([]); setEditReason(''); }} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editReturn ? 'حفظ التعديل' : 'حفظ كمسودة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};