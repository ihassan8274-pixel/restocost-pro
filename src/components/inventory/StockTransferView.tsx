import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Plus, AlertTriangle, Package, ChefHat, Trash2, Printer, Pencil, CheckCircle2, XCircle, Undo2, Send, Shield, RotateCw, Search, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal, AutocompleteSelect, EmptyState, DocumentFingerprint } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, navOnEnter } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import type { StockItemType, StockTransfer } from '../../types';

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة', submitted: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض',
};

interface TransferLine {
  itemType: StockItemType;
  rawMaterialId: string;
  recipeId: string;
  quantity: number;
}

export const StockTransferView: React.FC = () => {
  const {
    branches, visibleBranchIds, inventory, rawMaterials, recipes, stockTransfers,
    recipeInventory, addStockTransfer, updateStockTransfer, submitStockTransfer, approveStockTransfer, rejectStockTransfer, revertStockTransferToDraft, deleteStockTransfer,
    getRawMaterialName, getRawMaterialUnitCost, getBranchAverageUnitCost, getRecipeStock,
    can, showToast, verifyAdminPassword,
  } = useApp();

  const [fromBranchId, setFromBranchId] = useState(() => visibleBranchIds.includes('b-ck') ? 'b-ck' : visibleBranchIds[0] || '');
  const [toBranchId, setToBranchId] = useState(() => visibleBranchIds.find((id) => id !== 'b-ck') || visibleBranchIds[0] || '');
  const [lines, setLines] = useState<TransferLine[]>([{ itemType: 'raw_material', rawMaterialId: rawMaterials[0]?.id || '', recipeId: '', quantity: 0 }]);
  const [msg, setMsg] = useState('');
  const [transferCost, setTransferCost] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // ====== إدارة جماعية بنمط أذون الاستلام (فلاتر + تحديد + شريط أدوات) ======
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRevertOpen, setBulkRevertOpen] = useState(false);
  const [bulkRevertPassword, setBulkRevertPassword] = useState('');

  const filtered = useMemo(() => stockTransfers.filter((t) => {
    const fName = (id: string) => id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === id)?.nameAr || id;
    if (filterBranch !== 'all' && t.fromBranchId !== filterBranch && t.toBranchId !== filterBranch) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    if (search.trim()) {
      const q = search.trim();
      const hay = `${t.transferNumber} ${fName(t.fromBranchId)} ${fName(t.toBranchId)} ${TRANSFER_STATUS_LABELS[t.status] || ''} ${t.items.map((it) => it.itemName || it.materialName).join(' ')}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [stockTransfers, filterBranch, filterStatus, dateFrom, dateTo, search, branches]);

  const bulkSubmitForReview = () => {
    const toSubmit = filtered.filter((t) => selectedIds.has(t.id) && t.status === 'draft');
    toSubmit.forEach((t) => submitStockTransfer(t.id));
    if (toSubmit.length) showToast(`تم إرسال ${toSubmit.length} إذن تحويل للمراجعة`);
    setSelectedIds(new Set());
  };

  const bulkApprove = () => {
    const toApprove = filtered.filter((t) => selectedIds.has(t.id) && t.status === 'submitted');
    if (!toApprove.length) return;
    if (!window.confirm(`اعتماد ${toApprove.length} إذن تحويل؟ ستُطبَّق حركة المخزون بين الفروع فوراً.`)) return;
    toApprove.forEach((t) => approveStockTransfer(t.id));
    showToast(`تم اعتماد ${toApprove.length} إذن تحويل`);
    setSelectedIds(new Set());
  };

  const doBulkRevert = async () => {
    const toRevert = filtered.filter((t) => selectedIds.has(t.id) && (t.status === 'approved' || t.status === 'submitted'));
    if (!(await verifyAdminPassword(bulkRevertPassword))) { showToast('كلمة مرور خاطئة — صلاحية مسؤول النظام مطلوبة'); return; }
    toRevert.forEach((t) => revertStockTransferToDraft(t.id));
    showToast(`تم إرجاع ${toRevert.length} إذن تحويل للمسودة`);
    setBulkRevertOpen(false);
    setBulkRevertPassword('');
    setSelectedIds(new Set());
  };

  // ====== تعديل الإذن (بنمط أذون الاستلام) ======
  const [editTransfer, setEditTransfer] = useState<StockTransfer | null>(null);
  const [editLines, setEditLines] = useState<StockTransfer['items']>([]);
  const [editFromBranch, setEditFromBranch] = useState('');
  const [editToBranch, setEditToBranch] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTransferCost, setEditTransferCost] = useState('');
  const [editTransferNote, setEditTransferNote] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StockTransfer | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const doDelete = async () => {
    if (!deleteTarget) return;
    if (!(await verifyAdminPassword(deletePassword))) { showToast('كلمة مرور خاطئة — صلاحية مسؤول النظام مطلوبة'); return; }
    deleteStockTransfer(deleteTarget.id);
    showToast(`تم حذف ${deleteTarget.transferNumber} نهائياً`);
    setDeleteTarget(null);
    setDeletePassword('');
  };

  const openEdit = (t: StockTransfer) => {
    setEditTransfer(t);
    setEditLines(t.items.map((i) => ({ ...i })));
    setEditFromBranch(t.fromBranchId);
    setEditToBranch(t.toBranchId);
    setEditDate(t.date);
    setEditTransferCost(t.transportCost ? String(t.transportCost) : '');
    setEditTransferNote(t.transportNote || '');
  };

  const saveEdit = () => {
    if (!editTransfer) return;
    const clean = editLines.filter((i) => i.quantity > 0);
    if (clean.length === 0) { return; }
    updateStockTransfer(editTransfer.id, {
      items: clean,
      fromBranchId: editFromBranch,
      toBranchId: editToBranch,
      date: editDate,
      transportCost: parseFloat(editTransferCost) || 0,
      transportNote: editTransferNote || undefined,
      rejectReason: undefined,
    });
    setEditTransfer(null);
  };

  const statusPill = (s: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-600 border-slate-200',
      submitted: 'bg-amber-100 text-amber-700 border-amber-200',
      approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      rejected: 'bg-rose-100 text-rose-700 border-rose-200',
    };
    return `text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[s] || 'bg-slate-100 text-slate-600'}`;
  };

  const prepRecipes = useMemo(() => recipes.filter((r) => r.isCentralKitchenPrep || r.category === 'sub_prep'), [recipes]);
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const getRawStock = (branchId: string, rawMaterialId: string) => inventory.find((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId)?.quantity || 0;

  const lineStock = (line: TransferLine, branchId: string): number => line.itemType === 'recipe' ? getRecipeStock(branchId, line.recipeId) : getRawStock(branchId, line.rawMaterialId);

  const lineName = (line: TransferLine): string => {
    if (line.itemType === 'recipe') return recipes.find((r) => r.id === line.recipeId)?.nameAr || '';
    return getRawMaterialName(line.rawMaterialId);
  };
  const lineUnit = (line: TransferLine): string => {
    if (line.itemType === 'recipe') return recipes.find((r) => r.id === line.recipeId)?.portionSize || 'وحدة';
    return rawMaterials.find((m) => m.id === line.rawMaterialId)?.unit || '';
  };
  const lineCost = (line: TransferLine): number => {
    if (line.itemType === 'recipe') {
      const r = recipes.find((x) => x.id === line.recipeId);
      return r ? Number((r.totalCalculatedCost || 0).toFixed(2)) : 0;
    }
    return getBranchAverageUnitCost(fromBranchId, line.rawMaterialId!);
  };
  const lineAvgSource = (line: TransferLine): string => {
    if (line.itemType === 'recipe') return 'التكلفة المحسوبة للوصفة';
    const avg = getBranchAverageUnitCost(fromBranchId, line.rawMaterialId!);
    return avg !== getRawMaterialUnitCost(line.rawMaterialId) ? 'متوسط سعر الشراء للفرع المرسل (GRN)' : 'السعر القياسي';
  };

  const totalValue = lines.reduce((s, l) => s + l.quantity * lineCost(l), 0);
  const validLines = lines.filter((l) => l.quantity > 0 && lineName(l));
  const overStock = lines.filter((l) => l.quantity > 0 && l.quantity > lineStock(l, fromBranchId));

  const branchName = (id: string) => id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === id)?.nameAr || id;

  const transferName = (it: StockTransfer['items'][number]) => it.itemName || it.materialName || '';

  // ====== طباعة مستند تحويل فردي (بنمط أذون الاستلام) ======
  const printSingle = (t: StockTransfer) => {
    openPrintWindow({
      title: `إذن تحويل — ${t.transferNumber}`,
      subtitle: TRANSFER_STATUS_LABELS[t.status],
      meta: [
        ['من الفرع (المرسل)', branchName(t.fromBranchId)],
        ['إلى الفرع (المستقبل)', branchName(t.toBranchId)],
        ['تاريخ التحويل', t.date],
        ['عدد الأصناف', `${t.items.length}`],
        ['مقدَّم من', t.requestedBy || '—'],
        ...(t.approvedBy ? ([['اعتمد بواسطة', t.approvedBy]] as [string, string][]) : []),
        ...(t.rejectReason ? ([['سبب الرفض', t.rejectReason]] as [string, string][]) : []),
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [{
        title: 'الأصناف المحوّلة',
        header: ['#', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'القيمة'],
        rows: t.items.map((it, idx) => [idx + 1, transferName(it), it.itemType === 'recipe' ? 'صنف مصنّع' : 'مخزني', it.quantity, it.unit, fmtMoney(it.unitCost), fmtMoney(it.quantity * it.unitCost)]),
      }],
      totals: [['إجمالي قيمة التحويل', `${fmtMoney(t.items.reduce((s, it) => s + it.quantity * it.unitCost, 0))}`]],
      footer: `وثيقة تحويل ${TRANSFER_STATUS_LABELS[t.status] || t.status} بين الفروع — RestoCost ERP`,
    });
  };

  const printTransfers = () => {
    openPrintWindow({
      title: 'سجل تحويلات الأصناف بين الفروع',
      subtitle: `إجمالي ${stockTransfers.length} تحويل`,
      meta: [
        ['إجمالي القيمة المحوّلة', `${fmtMoney(stockTransfers.reduce((s, t) => s + t.items.reduce((a, it) => a + it.quantity * it.unitCost, 0), 0))}`],
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
      ],
      tables: [{
        title: 'سجل التحويلات',
        header: ['الرقم', 'من', 'إلى', 'التاريخ', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'القيمة', 'الحالة'],
        rows: stockTransfers.flatMap((t) => t.items.map((it) => [t.transferNumber, branchName(t.fromBranchId), branchName(t.toBranchId), t.date, it.itemName || it.materialName || '', it.itemType === 'recipe' ? 'صنف مصنّع' : 'مخزني', it.quantity, it.unit, it.unitCost, (it.quantity * it.unitCost).toFixed(2), t.status])),
      }],
      totals: [['إجمالي القيمة المحوّلة', `${fmtMoney(stockTransfers.reduce((s, t) => s + t.items.reduce((a, it) => a + it.quantity * it.unitCost, 0), 0))}`]],
      footer: 'سجل تحويلات معتمد — RestoCost ERP',
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromBranchId === toBranchId) { setMsg('يجب اختيار فرعين مختلفين للتحويل'); setTimeout(() => setMsg(''), 2500); return; }
    if (validLines.length === 0) { setMsg('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر'); setTimeout(() => setMsg(''), 2500); return; }
    if (overStock.length > 0) { setMsg('تجاوزت الكمية المخزون المتاح في فرع المرسل'); setTimeout(() => setMsg(''), 2500); return; }
    addStockTransfer({
      fromBranchId, toBranchId,
      items: validLines.map((l) => ({
        itemType: l.itemType,
        rawMaterialId: l.itemType === 'raw_material' ? l.rawMaterialId : undefined,
        recipeId: l.itemType === 'recipe' ? l.recipeId : undefined,
        itemName: lineName(l), quantity: l.quantity, unit: lineUnit(l), unitCost: lineCost(l),
      })),
      requestedBy: 'المستخدم',
      transportCost: parseFloat(transferCost) || 0,
      transportNote: transferNote || undefined,
    });
    setLines([{ itemType: 'raw_material', rawMaterialId: rawMaterials[0]?.id || '', recipeId: '', quantity: 0 }]);
    setMsg('تم إنشاء إذن التحويل كمسودة — أرسله للاعتماد لتطبيق حركة المخزون');
    setTimeout(() => setMsg(''), 3500);
  };

  const updateLine = (idx: number, patch: Partial<TransferLine>) =>
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-6">
      <PageHeader title="تحويل الأصناف بين الفروع" subtitle="تحويل أصناف مخزنية (مواد خام) وأصناف مصنّعة من الوصفات الأساسية بين الفروع والمطبخ المركزي" icon={<ArrowRightLeft className="w-6 h-6 text-brand-600" />}
        actions={
          <>
          <ViewToolbar
            filename="التحويلات_بين_الفروع"
            sheets={[
              { name: 'سجل التحويلات', header: ['الرقم', 'من', 'إلى', 'التاريخ', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'القيمة', 'الحالة'], rows: stockTransfers.flatMap((t) => t.items.map((it) => [t.transferNumber, t.fromBranchId === 'b-ck' ? 'المطبخ المركزي' : t.fromBranchId, t.toBranchId === 'b-ck' ? 'المطبخ المركزي' : t.toBranchId, t.date, it.itemName || it.materialName || '', it.itemType === 'recipe' ? 'صنف مصنّع' : 'مخزني', it.quantity, it.unit, it.unitCost, it.quantity * it.unitCost, t.status])) },
              { name: 'أرصدة الأصناف المصنّعة', header: ['الفرع', 'الصنف', 'الكمية'], rows: recipeInventory.map((r) => [r.branchId === 'b-ck' ? 'المطبخ المركزي' : r.branchId, recipes.find((x) => x.id === r.recipeId)?.nameAr || r.recipeId, r.quantity]) },
            ]}
          />
          <Btn tone="ghost" onClick={printTransfers}><Printer className="w-4 h-4" /> طباعة السجل</Btn>
          </>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي التحويلات</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{stockTransfers.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">قيمة المحوّلة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(stockTransfers.reduce((s, t) => s + t.items.reduce((a, it) => a + it.quantity * it.unitCost, 0), 0))}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مخزنية محوّلة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{stockTransfers.reduce((s, t) => s + t.items.filter((i) => i.itemType !== 'recipe').length, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مصنّعة محوّلة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{stockTransfers.reduce((s, t) => s + t.items.filter((i) => i.itemType === 'recipe').length, 0)}</strong></div>
      </div>

      {/* Transfer form */}
      <Card className="p-5">
        <SectionHeader title="تحويل جديد" subtitle="حدد الفرع المرسل والمستقبل ثم أضف الأصناف — مخزنية (مواد خام) أو مصنّعة (وصفات أساسية)" icon={<ArrowRightLeft className="w-5 h-5 text-brand-600" />} />
        <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
          {msg && <div className={`rounded-xl p-3 font-bold border ${msg.includes('نجاح') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="من الفرع (المرسل)" required>
              <select value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="إلى الفرع (المستقبل)" required>
              <select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
          </div>
          {fromBranchId === toBranchId && <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> يجب اختيار فرعين مختلفين</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="تكلفة النقل (ر.س)"><input type="number" min="0" step="0.01" value={transferCost} onChange={(e) => setTransferCost(e.target.value)} className={inputCls} placeholder="اختياري" /></Field>
            <Field label="ملاحظة النقل / الناقل"><input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} className={inputCls} placeholder="مثال: شاحنة رقم ٥ / سائق أحمد" /></Field>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="hidden md:grid grid-cols-[110px_1fr_1fr_110px_120px_120px_80px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500">
              <span>النوع</span><span>الصنف</span><span>المتوفر لدى المرسل</span><span>الكمية</span><span>متوسط سعر الوحدة</span><span>الإجمالي</span><span></span>
            </div>
            {lines.map((line, idx) => {
              const stock = lineStock(line, fromBranchId);
              const over = line.quantity > stock;
              return (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[110px_1fr_1fr_110px_120px_120px_80px] gap-2 px-3 py-2.5 items-center">
                  <select value={line.itemType} onChange={(e) => updateLine(idx, { itemType: e.target.value as StockItemType })} className={inputCls}>
                    <option value="raw_material">مخزني</option>
                    <option value="recipe">صنف مصنّع</option>
                  </select>
                  {line.itemType === 'recipe' ? (
                    <AutocompleteSelect
                      value={line.recipeId}
                      onChange={(val) => updateLine(idx, { recipeId: val })}
                      options={prepRecipes.map((r) => ({ value: r.id, label: r.nameAr, code: r.code }))}
                      getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                      placeholder="— اختر صنف مصنّع —"
                      className="w-full"
                    />
                  ) : (
                    <AutocompleteSelect
                      value={line.rawMaterialId}
                      onChange={(val) => updateLine(idx, { rawMaterialId: val })}
                      options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                      getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                      placeholder="— اختر مادة خام —"
                      className="w-full"
                    />
                  )}
                  <div className={`rounded-lg px-2 py-1.5 font-bold border ${over ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    {line.itemType === 'recipe'
                      ? <span className="flex items-center gap-1"><ChefHat className="w-3.5 h-3.5" /> {fmt(stock)} {lineUnit(line)}</span>
                      : <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {fmt(stock)} {lineUnit(line)}</span>}
                  </div>
                  <input type="number" min="0" step="any" data-nav value={line.quantity || ''} onChange={(e) => updateLine(idx, { quantity: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="الكمية" />
                  <div className="font-mono font-bold text-brand-700">
                    {fmt(lineCost(line))}
                    <span className="block text-[9px] font-bold text-slate-400">{lineAvgSource(line)}</span>
                  </div>
                  <div className="font-mono font-extrabold text-slate-900">{fmt(line.quantity * lineCost(line))}</div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} disabled={lines.length === 1} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
          {overStock.length > 0 && <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> يوجد صنف تتجاوز كمية التحويل المتوفر — راجع صفوف المرسل</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Btn onClick={() => setLines([...lines, { itemType: 'raw_material', rawMaterialId: rawMaterials[0]?.id || '', recipeId: '', quantity: 0 }])}><Plus className="w-3.5 h-3.5" /> صنف إضافي</Btn>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600">القيمة الإجمالية: <span className="font-mono font-extrabold text-brand-700">{fmt(totalValue)} ر.س</span></span>
              <button type="submit" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs"><ArrowRightLeft className="w-4 h-4" /> تنفيذ التحويل</button>
            </div>
          </div>
        </form>
      </Card>

      {/* History */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <SectionHeader title="سجل التحويلات" subtitle="جميع التحويلات بين الفروع (مخزنية ومصنّعة)" icon={<ArrowRightLeft className="w-5 h-5 text-brand-600" />} extra={
            filtered.length !== stockTransfers.length ? <span className="text-[11px] font-bold text-brand-600">{filtered.length} من {stockTransfers.length}</span> : undefined
          } />
          <div className="flex flex-wrap items-center gap-2">
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-48'}>
              <option value="all">كل الفروع</option>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls + ' !w-40'}>
              <option value="all">كل الحالات</option>
              {Object.entries(TRANSFER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Field label="من تاريخ"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} /></Field>
            <Field label="إلى تاريخ"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} /></Field>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم الإذن، الفرع، الصنف، الحالة..." className={inputCls + ' !pr-8'} />
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5">
              <span className="text-[11px] font-bold text-brand-700 px-1">محدد: {selectedIds.size} إذن</span>
              {filtered.some((t) => selectedIds.has(t.id) && t.status === 'draft') && (
                <Btn onClick={bulkSubmitForReview}><Send className="w-4 h-4" /> إرسال للمراجعة ({filtered.filter((t) => selectedIds.has(t.id) && t.status === 'draft').length})</Btn>
              )}
              {filtered.some((t) => selectedIds.has(t.id) && t.status === 'submitted') && (
                <Btn tone="success" onClick={bulkApprove}><Shield className="w-4 h-4" /> اعتماد المحدد ({filtered.filter((t) => selectedIds.has(t.id) && t.status === 'submitted').length})</Btn>
              )}
              {can('approve_grn') && filtered.some((t) => selectedIds.has(t.id) && (t.status === 'approved' || t.status === 'submitted')) && (
                <Btn tone="danger" onClick={() => setBulkRevertOpen(true)}><RotateCw className="w-4 h-4" /> إرجاع المحدد لمسودة ({filtered.filter((t) => selectedIds.has(t.id) && (t.status === 'approved' || t.status === 'submitted')).length})</Btn>
              )}
              <Btn tone="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Btn>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(filtered.map((t) => t.id))); else setSelectedIds(new Set()); }} className="w-4 h-4 accent-brand-600" /></th>
                <th className="p-3">الرقم</th><th className="p-3">من</th><th className="p-3">إلى</th><th className="p-3">التاريخ</th><th className="p-3">الأصناف المحوّلة</th><th className="p-3">القيمة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className={`hover:bg-slate-50 align-top ${selectedIds.has(t.id) ? 'bg-brand-50/50' : ''}`}>
                  <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.has(t.id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(t.id); else next.delete(t.id); setSelectedIds(next); }} className="w-4 h-4 accent-brand-600" /></td>
                  <td className="tnum text-left p-3 font-bold text-brand-700">{t.transferNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{t.fromBranchId === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === t.fromBranchId)?.nameAr || t.fromBranchId}</td>
                  <td className="p-3 font-bold text-slate-800">{t.toBranchId === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === t.toBranchId)?.nameAr || t.toBranchId}</td>
                  <td className="tnum text-left p-3 text-slate-600">{t.date}</td>
                  <td className="p-3 space-y-1">
                    {t.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${it.itemType === 'recipe' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{it.itemType === 'recipe' ? 'مصنّع' : 'مخزني'}</span>
                        <span className="truncate">{it.itemName || it.materialName}</span>
                        <span className="font-mono text-slate-500 shrink-0">× {fmt(it.quantity)} {it.unit}</span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">بمتوسط {fmt(it.unitCost)}</span>
                      </div>
                    ))}
                    {t.approvedBy && <span className="block text-[9px] text-slate-400 font-bold">اعتمد بواسطة: {t.approvedBy}</span>}
                    {t.rejectReason && <span className="block text-[9px] text-rose-500 font-bold">سبب الرفض: {t.rejectReason}</span>}
                  </td>
                  <td className="tnum text-left p-3 font-bold text-brand-700">{fmt(t.items.reduce((s, it) => s + it.quantity * it.unitCost, 0))}</td>
                  <td className="p-3"><span className={statusPill(t.status)}>{TRANSFER_STATUS_LABELS[t.status]}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => printSingle(t)} title="طباعة المستند" className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><Printer className="w-4 h-4" /></button>
                      {can('approve_grn') && (t.status === 'draft' || t.status === 'rejected') && (
                        <>
                          <button onClick={() => openEdit(t)} title="تعديل" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => submitStockTransfer(t.id)} title="إرسال للمراجعة" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Send className="w-4 h-4" /></button>
                        </>
                      )}
                      {can('approve_grn') && t.status === 'submitted' && (
                        <>
                          <button onClick={() => { if (window.confirm(`اعتماد إذن تحويل ${t.transferNumber}؟ ستُطبَّق حركة المخزون بين الفروع فوراً.`)) approveStockTransfer(t.id); }} title="اعتماد نهائي" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><CheckCircle2 className="w-4 h-4" /></button>
                          <button onClick={() => { setRejectId(t.id); setRejectReason(''); }} title="رفض" className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      {can('approve_grn') && t.status === 'approved' && (
                        <button onClick={() => { if (window.confirm(`إرجاع إذن التحويل ${t.transferNumber} للمسودة؟ سيتم عكس حركة المخزون بين الفروع.`)) revertStockTransferToDraft(t.id); }} title="إرجاع للمسودة (عكس الحركة)" className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"><Undo2 className="w-4 h-4" /></button>
                      )}
                      {can('approve_grn') && (
                        <button onClick={() => { setDeleteTarget(t); setDeletePassword(''); }} title="حذف نهائي" className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-0"><EmptyState title="لا توجد تحويلات مطابقة" subtitle="غيّر الفلتر أو أنشئ تحويلاً جديداً" icon={<ArrowLeftRight className="w-5 h-5" />} compact /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stock balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionHeader title="أرصدة الأصناف المصنّعة" subtitle="المخزون من وصفات التحضير الأساسية حسب الفرع" icon={<ChefHat className="w-5 h-5 text-amber-600" />} />
          <div className="mt-3 space-y-2">
            {recipeInventory.length === 0 && <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">لا توجد أرصدة لأصناف مصنّعة</p>}
            {recipeInventory.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{recipes.find((x) => x.id === r.recipeId)?.nameAr || r.recipeId}</p>
                    <p className="text-[10px] text-slate-500">{r.branchId === 'b-ck' ? 'المطبخ المركزي' : r.branchId}</p>
                  </div>
                </div>
                <span className="font-mono font-extrabold text-amber-700">{fmt(r.quantity)} {recipes.find((x) => x.id === r.recipeId)?.portionSize || 'وحدة'}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="الوصفات الأساسية القابلة للتصنيع" subtitle="الأصناف التي تدخل في تصنيع أصناف أخرى (sub-prep)" icon={<Package className="w-5 h-5 text-brand-600" />} />
          <div className="mt-3 space-y-2">
            {prepRecipes.map((r) => {
              const cost = Number((r.totalCalculatedCost || 0).toFixed(2));
              return (
                <div key={r.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{r.nameAr}</p>
                    <p className="text-[10px] font-mono text-slate-500">{r.code} · {r.portionSize}</p>
                  </div>
                  <span className="font-mono font-extrabold text-brand-700 text-xs">{fmt(cost)} ر.س</span>
                </div>
              );
            })}
            {prepRecipes.length === 0 && <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">لا توجد وصفات تحضير أساسية — أضفها من شاشة الوصفات</p>}
          </div>
        </Card>
      </div>

      <p className="text-center text-[10px] text-slate-400 font-bold">عند إكمال أمر تصنيع بالمطبخ المركزي تُضاف الكمية المنتجة إلى أرصدة الأصناف المصنّعة وتصبح قابلة للتحويل للفروع</p>

      {/* ====== مودال تعديل إذن التحويل (بنمط أذون الاستلام) ====== */}
      <Modal open={editTransfer !== null} onClose={() => setEditTransfer(null)} title={`تعديل إذن التحويل ${editTransfer?.transferNumber || ''}`} wide>
        <DocumentFingerprint entityType="stockTransfer" entityId={editTransfer?.id || ''} title={`بصمة التحويل ${editTransfer?.transferNumber || ''}`} />
        <div className="text-xs space-y-3">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 font-bold">
            تعديل إذن التحويل — بتطبيق التغييرات بعد الاعتماد. الأصناف والأسعار من مقبولة للمسودات والأوراق المرفوضة.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="من الفرع (المرسل)">
              <select value={editFromBranch} onChange={(e) => setEditFromBranch(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="إلى الفرع (المستقبل)">
              <select value={editToBranch} onChange={(e) => setEditToBranch(e.target.value)} className={inputCls}>
                {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="تاريخ التحويل">
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="تكلفة النقل (ر.س)"><input type="number" min="0" step="0.01" value={editTransferCost} onChange={(e) => setEditTransferCost(e.target.value)} className={inputCls} placeholder="اختياري" /></Field>
            <Field label="ملاحظة النقل / الناقل"><input value={editTransferNote} onChange={(e) => setEditTransferNote(e.target.value)} className={inputCls} placeholder="مثال: شاحنة رقم ٥ / سائق أحمد" /></Field>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="hidden md:grid grid-cols-[110px_1fr_110px_130px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500">
              <span>النوع</span><span>الصنف</span><span>الكمية</span><span>تكلفة الوحدة</span>
            </div>
            {editLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[110px_1fr_110px_130px] gap-2 px-3 py-2.5 items-center">
                <span className="text-[10px] font-bold text-slate-500">{line.itemType === 'recipe' ? 'صنف مصنّع' : 'مخزني'}</span>
                <div>
                  {line.itemType === 'recipe' ? (
                    <AutocompleteSelect
                      value={line.recipeId || ''}
                      onChange={(val) => {
                        const r = recipes.find((x) => x.id === val);
                        setEditLines(editLines.map((l, i) => i === idx ? { ...l, recipeId: val, itemName: r?.nameAr || '', unit: r?.portionSize || '', unitCost: r?.totalCalculatedCost || 0 } : l));
                      }}
                      options={prepRecipes.map((r) => ({ value: r.id, label: r.nameAr, code: r.code }))}
                      getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                      placeholder="— اختر صنف مصنّع —"
                      className="w-full"
                    />
                  ) : (
                    <AutocompleteSelect
                      value={line.rawMaterialId || ''}
                      onChange={(val) => {
                        const m = rawMaterials.find((x) => x.id === val);
                        setEditLines(editLines.map((l, i) => i === idx ? { ...l, rawMaterialId: val, itemName: m?.nameAr || '', unit: m?.unit || '', unitCost: getBranchAverageUnitCost(editFromBranch, val) } : l));
                      }}
                      options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                      getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                      placeholder="— اختر مادة خام —"
                      className="w-full"
                    />
                  )}
                  <button
                    type="button" title="حذف الصف"
                    onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                    className="mr-2 p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <input
                  type="number" min="0" step="any"
                  value={line.quantity || ''}
                  onChange={(e) => setEditLines(editLines.map((l, i) => i === idx ? { ...l, quantity: parseFloat(e.target.value) || 0 } : l))}
                  className={inputCls}
                />
                <input
                  type="number" min="0" step="any"
                  value={line.unitCost || ''}
                  onChange={(e) => setEditLines(editLines.map((l, i) => i === idx ? { ...l, unitCost: parseFloat(e.target.value) || 0 } : l))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">إجمالي القيمة: <span className="font-mono font-extrabold text-brand-700">{fmt(editLines.reduce((s, l) => s + l.quantity * l.unitCost, 0))} ر.س</span></span>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={() => setEditTransfer(null)}>إلغاء</Btn>
              <Btn onClick={saveEdit} disabled={editLines.filter((l) => l.quantity > 0).length === 0}>حفظ التعديل</Btn>
            </div>
          </div>
        </div>
      </Modal>

      {/* ====== مودال رفض إذن التحويل ====== */}
      <Modal open={rejectId !== null} onClose={() => setRejectId(null)} title="رفض إذن التحويل">
        <div className="text-xs space-y-3">
          <Field label="سبب الرفض" required>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className={inputCls} placeholder="اكتب سبب رفض إذن التحويل..." />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn tone="ghost" onClick={() => setRejectId(null)}>إلغاء</Btn>
            <Btn onClick={() => { if (rejectId && rejectReason.trim()) { rejectStockTransfer(rejectId, rejectReason.trim()); setRejectId(null); } }} disabled={!rejectReason.trim()} tone="danger">تأكيد الرفض</Btn>
          </div>
        </div>
      </Modal>

      {/* ====== مودال إرجاع جماعي للمسودة (تحقق من مدير النظام) ====== */}
      <Modal open={bulkRevertOpen} onClose={() => setBulkRevertOpen(false)} title={`إرجاع ${filtered.filter((t) => selectedIds.has(t.id) && (t.status === 'approved' || t.status === 'submitted')).length} إذن تحويل للمسودة`}>
        <div className="text-xs space-y-3">
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 font-bold">
            عكس حركة المخزون لإذون التحويل المحددة. يتطلب هذا الإجراء صلاحية مدير النظام.
          </div>
          <Field label="كلمة مرور مدير النظام" required>
            <input type="password" value={bulkRevertPassword} onChange={(e) => setBulkRevertPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn tone="ghost" onClick={() => setBulkRevertOpen(false)}>إلغاء</Btn>
            <Btn onClick={doBulkRevert} disabled={!bulkRevertPassword.trim()} tone="danger">تنفيذ الإرجاع</Btn>
          </div>
        </div>
      </Modal>
    {/* ====== مودال حذف نهائي (تحقق من مدير النظام) ====== */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title={`حذف إذن التحويل ${deleteTarget?.transferNumber || ''}`}>
        <div className="text-xs space-y-3">
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 font-bold">
            حذف نهائي لا يمكن التراجع عنه — سيُحذف السجل بالكامل من سجل التحويلات (بدون عكس حركة المخزون).
          </div>
          <Field label="كلمة مرور مدير النظام" required>
            <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn tone="ghost" onClick={() => setDeleteTarget(null)}>إلغاء</Btn>
            <Btn onClick={doDelete} disabled={!deletePassword.trim()} tone="danger">تأكيد الحذف</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};