import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PackageCheck, Plus, CheckCircle2, XCircle, Printer, Pencil, Search, Send, Ban, Shield, RotateCw, RotateCcw, Settings, Copy, History, AlertTriangle, ScanLine } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, Btn, Modal, CurrencySelect, DateText, DocumentFingerprint } from '../ui';
import { ErpPanel, ErpPageHeader, ErpQueryBar, ErpField, ErpInput, ErpSelect, ErpButton, ErpKpi, erpInputCls } from '../ui/erp';
import { BarcodeScannerModal } from '../ui/BarcodeScannerModal';
import { fmt, fmtMoney } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { openLabelsWindow } from '../../utils/labels';
import { GoodsReceiptItem } from '../../types';
import { GrnItemsTable } from './GrnItemsTable';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ApprovalPathBar, type ApprovalStepDef, type ApprovalTerminalType } from '../ui/ApprovalPath';

/* مسارات اعتماد موحّدة لكل نوع مستند (بند 41) */
const GRN_PATH: { steps: Record<'draft' | 'review' | 'approve' | 'post', ApprovalStepDef>; order: string[]; terminal: { type: ApprovalTerminalType; label: string } } = {
  steps: { draft: { id: 'draft', label: 'مسودة' }, review: { id: 'submitted', label: 'مراجعة' }, approve: { id: 'approved', label: 'اعتماد' }, post: { id: 'posted', label: 'ترحيل' } },
  order: ['draft', 'submitted', 'approved', 'posted'],
  terminal: { type: 'rejected', label: 'مرفوض' },
};

interface GoodsReceivingViewProps { onNavigate?: (tab: string) => void; }
export const GoodsReceivingView: React.FC<GoodsReceivingViewProps> = ({ onNavigate }) => {
  const {
    grnNotes, suppliers, rawMaterials, branches, visibleBranchIds,
    addGoodsReceiptNote, updateGRNStatus, revertGoodsReceiptToDraft, updateGoodsReceiptNote, purchaseOrders,
    vatPercent, vatInclusive, getBranchName, can, recordPurchaseReceipt, getCurrencyRate, showToast, adjustInventory, verifyAdminPassword, addRecentDoc,
  } = useApp();

  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editGrn, setEditGrn] = useState<typeof grnNotes[number] | null>(null);
  const [editItems, setEditItems] = useState<GoodsReceiptItem[]>([]);
  const [editInvoice, setEditInvoice] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [branchId, setBranchId] = useState((visibleBranchIds || [])[0] || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivedBy, setReceivedBy] = useState('');
  const [items, setItems] = useState<GoodsReceiptItem[]>([]);
  const [notes, setNotes] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [vatRate, setVatRate] = useState<number>(vatPercent);
  const [vatIncl, setVatIncl] = useState<boolean>(vatInclusive);
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [invoiceTotalInput, setInvoiceTotalInput] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReopenModal, setBulkReopenModal] = useState(false);
  const [bulkReopenPassword, setBulkReopenPassword] = useState('');
  const [bulkReopenMovementIds, setBulkReopenMovementIds] = useState<Set<string>>(new Set());

  // Draft text for qty/price/total fields so typing is fluid (no toFixed caret fights).
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const setDraft = (key: string, v: string) => setDraftText((p) => ({ ...p, [key]: v }));
  const clearDraft = (key: string) => setDraftText((p) => { const n = { ...p }; delete n[key]; return n; });
  const draftVal = (key: string, fallback: string | number) => draftText[key] !== undefined ? draftText[key] : String(fallback);

  // Stable per-row keys so deleting a middle row doesn't scramble the draft text of later rows.
  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const [editKeys, setEditKeys] = useState<string[]>([]);
  const keyCounterRef = useRef(0);
  const makeKey = () => `k${++keyCounterRef.current}`;

  const safeVisibleBranchIds = visibleBranchIds || [];
  const visibleBranches = branches.filter((b) => safeVisibleBranchIds.includes(b.id));
  const getBranchDisplayName = (branchId: string) => {
    if (branchId === 'b-ck') return 'المطبخ المركزي';
    const b = branches.find((br) => br.id === branchId);
    return b?.nameAr || branchId;
  };

  const filtered = useMemo(() => {
    return grnNotes.filter((g) => {
      if (filterBranch !== 'all' && g.branchId !== filterBranch) return false;
      if (filterStatus !== 'all' && g.status !== filterStatus) return false;
      if (dateFrom && g.date < dateFrom) return false;
      if (dateTo && g.date > dateTo) return false;
      if (search && !g.supplierName.includes(search) && !g.grnNumber.includes(search) && !g.invoiceNumber.includes(search)) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [grnNotes, filterBranch, filterStatus, dateFrom, dateTo, search]);

  // ═══ عناصر التصميم المعتمد (docs/design/01) ═══
  // عدّ الإشعارات لكل حالة — لم يكن المستخدم يعرف أن 12 منها ينتظر المراجعة
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: grnNotes.length, draft: 0, submitted: 0, approved: 0, rejected: 0 };
    for (const g of grnNotes) c[g.status] = (c[g.status] || 0) + 1;
    return c;
  }, [grnNotes]);

  const QUICK_FILTERS = [
    { id: 'submitted', label: 'الحالة = مراجعة' },
    { id: 'today', label: 'اليوم' },
    { id: 'no_invoice', label: 'بلاء فاتورة' },
    { id: 'top100', label: 'أعلى 100 بالقيمة' },
  ];
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [colsOpen, setColsOpen] = useState(false);
  const toggleCol = useCallback((id: string) => setHiddenCols((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])), []);

  const COL_LABELS: [string, string][] = [
    ['grnNumber', 'رقم GRN'],
    ['supplier', 'المورد'],
    ['branch', 'الفرع'],
    ['date', 'تاريخ النظام'],
    ['invoiceDate', 'تاريخ الفاتورة'],
    ['invoiceNumber', 'الفاتورة'],
    ['net', 'الصافي (ر.س)'],
    ['vat', 'الضريبة (ر.س)'],
    ['total', 'الإجمالي (ر.س)'],
    ['currency', 'العملة'],
    ['items', 'الأصناف'],
    ['status', 'الحالة'],
  ];

  // نطبّق المرشّح السريع على نتيجة الاستعلام
  const filteredQuick = useMemo(() => {
    let list = filtered;
    if (quickFilter === 'submitted') list = list.filter((g) => g.status === 'submitted');
    else if (quickFilter === 'today') list = list.filter((g) => g.date === new Date().toISOString().slice(0, 10));
    else if (quickFilter === 'no_invoice') list = list.filter((g) => !g.invoiceNumber);
    else if (quickFilter === 'top100') list = [...list].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0)).slice(0, 100);
    return list;
  }, [filtered, quickFilter]);

  // ترقيم الصفحات — القائمة فيها مئات الإشعارات
  const pageCount = Math.max(1, Math.ceil(filteredQuick.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filteredQuick.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredQuick, safePage],
  );

  // أي تغيير في الاستعلام يعيد الصفحة للأولى، وإلا بقيت صفحة 3 بلا نتائج
  useEffect(() => { setPage(1); }, [filterBranch, filterStatus, dateFrom, dateTo, search, quickFilter]);

  // مجموع قيمة المحدَّد — يظهر في شريط التحديد
  const selectedTotal = useMemo(
    () => filtered.filter((g) => selectedIds.has(g.id)).reduce((s, g) => s + (g.totalAmount || 0), 0),
    [filtered, selectedIds],
  );

  const supplier = suppliers.find((s) => s.id === supplierId);
  const subtotal = items.reduce((s, i) => s + i.quantityReceived * i.unitPrice, 0);
  const vatAmount = vatIncl ? (subtotal * vatRate) / (100 + vatRate) : (subtotal * vatRate) / 100;
    const totalAmount = vatIncl ? subtotal : subtotal + vatAmount;

    const lastPurchasePrice = (materialId: string, forBranch: string) => {
    if (!materialId || !forBranch) return null;
    const cur = currencyCode || 'SAR';
    const matches = grnNotes
      .filter((g) => g.status === 'approved' && g.branchId === forBranch && (g.currencyCode || 'SAR') === cur)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const g of matches) {
      const it = g.items.find((i) => i.rawMaterialId === materialId && (i.quantityReceived || 0) > 0 && (i.unitPrice || 0) > 0);
      if (it) return it.unitPrice;
    }
    return null;
  };
  const prefillPrice = (m: typeof rawMaterials[number] | undefined, forBranch: string) => lastPurchasePrice(m?.id || '', forBranch) ?? (m?.standardPrice || 0);

  // الأوامر القابلة للاستلام: مرسل، معتمد، أو استُلم جزئياً (يبقى ظاهراً لاستلام الباقي —
  // الاستلام كلي أو جزئي حتى إتمام كل البنود).
  const availablePOs = purchaseOrders.filter((p) => p.supplierId === supplierId && (p.status === 'submitted' || p.status === 'approved' || p.status === 'partially_received') && (p.branchId === branchId || p.branchId === 'b-ck' || branchId === 'b-ck'));
  const selectedPO = purchaseOrders.find((p) => p.id === purchaseOrderId);

  const applyPO = (poId: string) => {
    setPurchaseOrderId(poId);
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    // تعبئة الكمية المتبقية فقط لكل بند (ما لم يُستلم) — مع بقاء البنود المكتملة ظاهرةً بكمية صفرية قابلة للتعديل
    setItems(po.items.map((i) => {
      const received = i.receivedQty || 0;
      const remaining = Math.max(0, (i.quantity || 0) - received);
      return { rawMaterialId: i.rawMaterialId, quantityReceived: remaining, unitPrice: i.unitPrice, batchNumber: '', expiryDate: '', qualityPassed: true };
    }));
    setRowKeys(po.items.map(() => makeKey()));
    setInvoiceNumber((prev) => prev || po.poNumber);
    if (po.currencyCode) { setCurrencyCode(po.currencyCode); setExchangeRate(po.exchangeRate || getCurrencyRate(po.currencyCode)); }
  };

  const addItem = () => {
    setItems((prev) => [...prev, { rawMaterialId: '', quantityReceived: 0, unitPrice: 0, batchNumber: '', expiryDate: '', qualityPassed: true }]);
    setRowKeys((prev) => [...prev, makeKey()]);
  };

  const [scannerOpen, setScannerOpen] = useState(false);
  const onScanned = (code: string) => {
    const raw = code.trim().toLowerCase();
    const mat = rawMaterials.find((m) => (m.code || '').toLowerCase() === raw);
    if (!mat) {
      showToast(`الكود ${code} غير مسجل في الأصناف — أضفه إن لم يكن موجوداً`);
      return;
    }
    if (items.some((i) => i.rawMaterialId === mat.id)) {
      showToast(`الصنف "${mat.nameAr}" موجود بالفعل في القائمة`);
      return;
    }
    setItems((prev) => [...prev, { rawMaterialId: mat.id, quantityReceived: 1, unitPrice: mat.standardPrice, batchNumber: '', expiryDate: '', qualityPassed: true }]);
    setRowKeys((prev) => [...prev, makeKey()]);
    showToast(`تمت إضافة "${mat.nameAr}" — امسح الكود التالي أو أغلق`);
  };

  const updateItem = (idx: number, patch: Partial<GoodsReceiptItem>) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const updateEditItem = (idx: number, patch: Partial<GoodsReceiptItem>) => setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  // --- Fluid numeric typing: keep the edited field as raw text, derive siblings live ---
  const num = (s: string) => { const n = parseFloat(String(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

  const qtyKey = (k: string) => `q${k}`;
  const priceKey = (k: string) => `p${k}`;
  const totalKey = (k: string) => `t${k}`;

  // quantity changed -> recompute total = qty * price
  const onQty = (idx: number, raw: string) => {
    setDraft(qtyKey(rowKeys[idx] ?? idx), raw);
    const qty = num(raw);
    const item = items[idx];
    const price = item?.unitPrice || 0;
    updateItem(idx, { quantityReceived: qty, lineTotal: price * qty });
  };
  const onQtyEdit = (idx: number, raw: string) => {
    setDraft(qtyKey(editKeys[idx] ?? idx) + 'e', raw);
    const qty = num(raw);
    const item = editItems[idx];
    const price = item?.unitPrice || 0;
    updateEditItem(idx, { quantityReceived: qty, lineTotal: price * qty });
  };
  // unit price changed -> recompute total = qty * price
  const onPrice = (idx: number, raw: string) => {
    setDraft(priceKey(rowKeys[idx] ?? idx), raw);
    const price = num(raw);
    const qty = items[idx]?.quantityReceived || 0;
    updateItem(idx, { unitPrice: price, lineTotal: price * qty });
  };
  const onLineTotal = (idx: number, raw: string) => {
    setDraft(totalKey(rowKeys[idx] ?? idx), raw);
    const total = num(raw);
    const qty = items[idx]?.quantityReceived || 0;
    if (qty > 0) {
      const price = total / qty;
      updateItem(idx, { unitPrice: price, lineTotal: total });
    }
  };
  const onPriceEdit = (idx: number, raw: string) => {
    setDraft(priceKey(editKeys[idx] ?? idx) + 'e', raw);
    const price = num(raw);
    const qty = editItems[idx]?.quantityReceived || 0;
    updateEditItem(idx, { unitPrice: price, lineTotal: price * qty });
  };
  const onLineTotalEdit = (idx: number, raw: string) => {
    setDraft(totalKey(editKeys[idx] ?? idx) + 'e', raw);
    const total = num(raw);
    const qty = editItems[idx]?.quantityReceived || 0;
    if (qty > 0) {
      const price = total / qty;
      updateEditItem(idx, { unitPrice: price, lineTotal: total });
    }
  };

  const convOf = (matId: string) => {
    const m = rawMaterials.find((x) => x.id === matId);
    return m && m.purchaseUnitConversion && m.purchaseUnitConversion > 1 ? { conv: m.purchaseUnitConversion, pu: m.purchaseUnit || m.unit } : null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier || items.length === 0 || items.some((i) => !i.rawMaterialId || i.quantityReceived <= 0)) return;
    addGoodsReceiptNote({
      supplierId: supplier.id, supplierName: supplier.name, branchId, date: new Date().toISOString().split('T')[0],
      invoiceNumber, invoiceDate, totalAmount, vatRate, vatAmount, vatInclusive: vatIncl, status: 'draft', receivedBy, items, notes,
      purchaseOrderId: selectedPO?.id, poNumber: selectedPO?.poNumber,
      currencyCode: currencyCode !== 'SAR' ? currencyCode : undefined,
      exchangeRate: currencyCode !== 'SAR' ? exchangeRate : undefined,
    });
    if (selectedPO) recordPurchaseReceipt(selectedPO.id, items.map((i) => ({ rawMaterialId: i.rawMaterialId, quantity: i.quantityReceived })));
    addRecentDoc({ type: 'grn', title: `إشعار استلام — ${supplier.name}`, tab: 'goods_receiving' });
    setItems([]); setRowKeys([]); setShowModal(false); setInvoiceNumber(''); setInvoiceDate(new Date().toISOString().split('T')[0]); setReceivedBy(''); setNotes(''); setPurchaseOrderId(''); setCurrencyCode('SAR'); setExchangeRate(1); setCopySource('');
  };

  const openEdit = (g: typeof grnNotes[number]) => {
    setEditGrn(g);
    setEditItems(g.items.map((i) => ({ ...i })));
    setEditKeys(g.items.map(() => makeKey()));
    setEditInvoice(g.invoiceNumber);
    setEditInvoiceDate(g.invoiceDate || g.date);
    setEditNotes(g.notes || '');
    // تحميل إعدادات الضريبة من الإشعار نفسه
    setVatRate(g.vatRate ?? vatPercent);
    setVatIncl(g.vatInclusive ?? vatInclusive);
  };

  const saveEdit = () => {
    if (!editGrn) return;
    const subtotal = editItems.reduce((s, i) => s + i.quantityReceived * i.unitPrice, 0);
    // استخدام إعدادات الضريبة المحملة من الإشعار (vatRate, vatIncl state)
    const vatAmt = vatIncl ? (subtotal * vatRate) / (100 + vatRate) : (subtotal * vatRate) / 100;
    const total = vatIncl ? subtotal : subtotal + vatAmt;
    updateGoodsReceiptNote(editGrn.id, { 
      items: editItems, 
      invoiceNumber: editInvoice, 
      invoiceDate: editInvoiceDate, 
      notes: editNotes, 
      totalAmount: total, 
      vatAmount: vatAmt, 
      vatRate, 
      vatInclusive: vatIncl 
    });
    setEditGrn(null);
  };

  const printSingle = (g: typeof grnNotes[number]) => {
    const net = g.totalAmount - (g.vatAmount || 0);
    openPrintWindow({
      title: `إشعار استلام — ${g.grnNumber}`,
      subtitle: g.status === 'approved' ? 'معتمد' : g.status === 'submitted' ? 'قيد المراجعة' : 'مسودة',
      meta: [
        ['المورد', g.supplierName],
        ['الفرع', g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchDisplayName(g.branchId)],
        ['تاريخ النظام', g.date],
        ['تاريخ الفاتورة', g.invoiceDate || '—'],
        ['رقم الفاتورة', g.invoiceNumber || '—'],
        ['رقم أمر الشراء', g.poNumber || '—'],
        ['استلمها', g.receivedBy || '—'],
        ['عدد الأصناف', `${g.items.length}`],
        ['الحالة', g.status === 'approved' ? 'معتمد' : g.status === 'submitted' ? 'قيد المراجعة' : g.status],
        ...(g.currencyCode ? ([['عملة المستند', g.currencyCode], ['سعر الصرف', String(g.exchangeRate || 0)]] as [string, string][]) : []),
      ],
      tables: [{
        title: 'الأصناف المستلمة',
        header: ['#', 'الصنف', 'الكمية', 'الوحدة', 'سعر الوحدة', 'الإجمالي', 'الدفعة', 'الانتهاء', 'الجودة', 'وحدة الشراء'],
        rows: g.items.map((it, idx) => {
          const mat = rawMaterials.find((m) => m.id === it.rawMaterialId);
          const conv = convOf(it.rawMaterialId);
          const puQty = conv && it.quantityReceived > 0 ? (it.quantityReceived / conv.conv).toFixed(2) : '—';
          return [idx + 1, mat?.nameAr || it.rawMaterialId, it.quantityReceived, mat?.unit || '—', it.unitPrice, (it.quantityReceived * it.unitPrice).toFixed(2), it.batchNumber || '—', it.expiryDate || '—', it.qualityPassed ? 'سليمة' : 'غير سليمة', conv ? `${puQty} ${conv.pu}` : '—'];
        }),
      }],
      totals: [
        ['الإجمالي قبل الضريبة', `${fmtMoney(net)}${g.currencyCode ? ` (${g.currencyCode})` : ''}`],
        [`ضريبة القيمة المضافة (${g.vatRate ?? 15}%)`, `${fmtMoney(g.vatAmount || 0)}${g.currencyCode ? ` (${g.currencyCode})` : ''}`],
        ['إجمالي الفاتورة', `${fmtMoney(g.totalAmount)}${g.currencyCode ? ` (${g.currencyCode})` : ''}`],
        ...(g.currencyCode ? ([['المعادل بالريال (ر.س)', `${fmtMoney(g.totalAmount * (g.exchangeRate || 0))}`]] as [string, string][]) : []),
      ],
      footer: `وثيقة استلام ${g.status === 'approved' ? 'معتمدة' : 'مسودة/قيد المراجعة'} ضمن نظام RestoCost ERP`,
    });
  };

  // طباعة ملصقات باركود (FEFO) من إشعارات الاستلام المعتمدة/المفلترة —
// عدد الملصقات لكل صنف = عدد وحدات الشراء المستلمة (مثال: 12 كرتونة → 12 ملصق، كرتونة لكل ملصق)
  const printSelectedLabels = () => {
    const sources = filtered.filter((g) => g.status === 'approved' || selectedIds.has(g.id));
    const MAX_LABELS = 2000;
    const items: { materialName: string; batchNumber: string; expiryDate: string; qty: number; unit: string; branchName: string; grnNumber?: string }[] = [];
    let over = false;
    sources.forEach((g) => g.items.forEach((it) => {
      if (!it.batchNumber || over || items.length >= MAX_LABELS) return;
      const mat = rawMaterials.find((m) => m.id === it.rawMaterialId);
      const conv = convOf(it.rawMaterialId);
      // عدد وحدات الشراء لهذا السطر — إن وُجدت وحدة شراء مع تحويل، وإلا فالوحدة نفسها
      const puQty = conv ? Math.max(1, Math.round(it.quantityReceived / conv.conv)) : Math.max(1, Math.round(it.quantityReceived));
      const base = { materialName: mat?.nameAr || it.rawMaterialId, batchNumber: it.batchNumber, expiryDate: it.expiryDate || '—', qty: conv ? 1 : it.quantityReceived, unit: conv ? conv.pu : (mat?.unit || '—'), branchName: g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchDisplayName(g.branchId), grnNumber: g.grnNumber };
      for (let k = 0; k < puQty; k++) {
        if (items.length >= MAX_LABELS) { over = true; break; }
        items.push({ ...base });
      }
    }));
    if (items.length === 0) { showToast('لا توجد بنود بأرقام دفعات للطباعة — أدخل رقم الدفعة لكل صنف عند الاستلام'); return; }
    if (over) showToast(`اكتمل الحد (${MAX_LABELS} ملصق) — زد التقريب حصانة أو اطبع على دفعات`);
    openLabelsWindow(`ملصقات باركود المخزون (${items.length}) — عدد وحدات الشراء`, items);
  };

  const printFiltered = () => {
    if (filtered.length === 0) return;
    openPrintWindow({
      title: `إشعارات الاستلام — ${filtered.length} إشعار (بدون تفاصيل الأصناف)`,
      subtitle: 'طباعة جماعية — ملخص فقط',
      meta: [['عدد الإشعارات', `${filtered.length}`], ['إجمالي القيمة', `${fmtMoney(filtered.reduce((s, g) => s + g.totalAmount, 0))}`], ['فترة', `${dateFrom || 'البداية'} — ${dateTo || 'النهاية'}`], ['الفرع', filterBranch === 'all' ? 'الكل' : getBranchName(filterBranch)], ['الحالة', filterStatus === 'all' ? 'الكل' : filterStatus]],
      tables: [{
        title: 'قائمة إشعارات الاستلام',
        header: ['#', 'رقم GRN', 'المورد', 'الفرع', 'تاريخ النظام', 'تاريخ الفاتورة', 'رقم الفاتورة', 'أمر الشراء', 'الصافي', 'الضريبة', 'الإجمالي', 'العملة', 'الحالة', 'استلمها', 'ملاحظات'],
        rows: filtered.map((g, idx) => [idx + 1, g.grnNumber, g.supplierName, g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchDisplayName(g.branchId), g.date, g.invoiceDate || '—', g.invoiceNumber, g.poNumber || '—', fmtMoney(g.totalAmount - (g.vatAmount || 0)), fmtMoney(g.vatAmount || 0), fmtMoney(g.totalAmount), g.currencyCode || 'SAR', g.status === 'approved' ? 'معتمد' : g.status === 'submitted' ? 'قيد المراجعة' : g.status, g.receivedBy, g.notes || '']),
      }],
      footer: 'طباعة جماعية لإشعارات الاستلام (ملخص فقط) — RestoCost ERP',
    });
  };

  const openPrintModal = () => setShowPrintModal(true);

  // نسخ إشعار كقالب: يفتح نموذج إشعار جديد معبأ بنفس المورد والأصناف والإعدادات
  const [copySource, setCopySource] = useState('');
  const copyAsNew = (g: typeof grnNotes[number]) => {
    setSupplierId(g.supplierId);
    setBranchId(g.branchId);
    setItems(g.items.map((i) => ({ ...i })));
    setRowKeys(g.items.map(() => makeKey()));
    setInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setReceivedBy(g.receivedBy || '');
    setNotes(g.notes || '');
    setPurchaseOrderId('');
    setVatRate(g.vatRate ?? vatPercent);
    setVatIncl(g.vatInclusive ?? vatInclusive);
    if (g.currencyCode) { setCurrencyCode(g.currencyCode); setExchangeRate(g.exchangeRate || 1); }
    setCopySource(`${g.grnNumber} — ${g.supplierName}`);
    setShowModal(true);
  };

  // نسخ جماعي: ينشئ مسودة جديدة (كقالب) لكل إشعار محدد دون فتح نماذج
  const bulkCopySelected = () => {
    const toCopy = filtered.filter((g) => selectedIds.has(g.id));
    if (toCopy.length === 0) { showToast('حدد إشعارات الاستلام أولاً'); return; }
    if (!confirm(`إنشاء ${toCopy.length} مسودة جديدة كنسخ من الإشعارات المحددة؟ تعدل نسخها ثم ترسلها للمراجعة.`)) return;
    const today = new Date().toISOString().split('T')[0];
    toCopy.forEach((g) => {
      addGoodsReceiptNote({
        supplierId: g.supplierId, supplierName: g.supplierName, branchId: g.branchId,
        date: today, invoiceNumber: '', invoiceDate: today,
        totalAmount: g.totalAmount, vatRate: g.vatRate ?? vatPercent, vatAmount: g.vatAmount || 0, vatInclusive: g.vatInclusive ?? vatInclusive,
        status: 'draft', receivedBy: g.receivedBy || '',
        items: g.items.map((i) => ({ ...i })),
        notes: `نسخة قالب من ${g.grnNumber}${g.notes ? ` — ${g.notes}` : ''}`,
        purchaseOrderId: undefined, poNumber: undefined,
        currencyCode: g.currencyCode !== 'SAR' ? g.currencyCode : undefined,
        exchangeRate: g.currencyCode !== 'SAR' ? (g.exchangeRate || 1) : undefined,
      });
    });
    setSelectedIds(new Set());
    showToast(`تم إنشاء ${toCopy.length} مسودة جديدة من القوالب`);
  };

  // تعبئة الجدول بآخر أصناف استلمها المورد سابقاً (من كل إشعاراته) — كقالب تلقائي
  const fillFromSupplierHistory = (supId: string) => {
    if (!supId) return;
    const history = grnNotes.filter((g) => g.supplierId === supId);
    if (history.length === 0) { showToast('لا توجد استلامات سابقة لهذا المورد'); return; }
    // أحدث استلام أولاً، ثم نأخذ لكل صنف أحدث سعر/كمية مستلمة من هذا المورد
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const latestByMaterial = new Map<string, GoodsReceiptItem>();
    for (const g of sorted) {
      for (const it of g.items) {
        if (!it.rawMaterialId) continue;
        latestByMaterial.set(it.rawMaterialId, { ...it, quantityReceived: 0, lineTotal: 0 });
      }
    }
    const list = Array.from(latestByMaterial.values()).sort((a, b) => {
      const ca = rawMaterials.find((m) => m.id === a.rawMaterialId)?.code || '';
      const cb = rawMaterials.find((m) => m.id === b.rawMaterialId)?.code || '';
      return ca.localeCompare(cb, 'ar');
    });
    setItems(list);
    setRowKeys(list.map(() => makeKey()));
    setInvoiceTotalInput('');
    showToast(`تم تعبئة ${list.length} صنف من استلامات المورد السابقة — عدّل الكميات والأسعار`);
  };

  const GRN_STATUS_LABELS: Record<typeof grnNotes[number]['status'], string> = { draft: 'مسودة', submitted: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' };
  const GRN_STATUS_COLORS: Record<typeof grnNotes[number]['status'], string> = { draft: 'bg-slate-100 text-slate-700', submitted: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' };

  // Bulk approve selected GRNs (submitted only)
  const bulkApprove = () => {
    const toApprove = filtered.filter((g) => selectedIds.has(g.id) && g.status === 'submitted');
    if (toApprove.length === 0) { showToast('لا توجد إشعارات مختارة بحالة "قيد المراجعة" للاعتماد'); return; }
    if (!confirm(`اعتماد ${toApprove.length} إشعار استلام؟ سيرفع المخزون ويولد قيوداً محاسبية.`)) return;
    toApprove.forEach((g) => updateGRNStatus(g.id, 'approved'));
    setSelectedIds(new Set());
    showToast(`تم اعتماد ${toApprove.length} إشعار استلام`);
  };

  // Open bulk reopen modal (admin only)
  const openBulkReopen = () => {
    const approvedSelected = filtered.filter((g) => selectedIds.has(g.id) && g.status === 'approved');
    if (approvedSelected.length === 0) { showToast('لا توجد إشعارات مختارة بحالة "معتمد" للإرجاع لمسودة'); return; }
    setBulkReopenMovementIds(new Set());
    setBulkReopenModal(true);
    setBulkReopenPassword('');
  };

  // Execute bulk reopen with password verification (complex modal with movement selection)
  const executeBulkReopen = async () => {
    if (!(await verifyAdminPassword(bulkReopenPassword))) { showToast('كلمة مرور خاطئة — صلاحية مسؤول النظام مطلوبة'); return; }
    const toReopen = filtered.filter((g) => selectedIds.has(g.id) && g.status === 'approved');
    let movementCount = 0;
    toReopen.forEach((g) => {
      g.items.forEach((item) => {
        const moveKey = `${g.id}|${item.rawMaterialId}`;
        if (bulkReopenMovementIds.has(moveKey)) {
          adjustInventory(g.branchId, item.rawMaterialId, -item.quantityReceived);
          movementCount++;
        }
      });
      updateGRNStatus(g.id, 'draft');
    });
    setSelectedIds(new Set());
    setBulkReopenModal(false);
    setBulkReopenPassword('');
    showToast(`تم إرجاع ${toReopen.length} إشعار لمسودة، عكس ${movementCount} حركة مخزون`);
  };

  // Bulk return selected GRNs (submitted/approved) to draft (admin password required)
  const bulkReturnSelectedToDraft = async () => {
    const toReturn = filtered.filter((g) => selectedIds.has(g.id) && (g.status === 'approved' || g.status === 'submitted'));
    if (toReturn.length === 0) { showToast('لا توجد إشعارات مختارة (قيد المراجعة أو معتمدة) للإرجاع لمسودة'); return; }
    const password = prompt('كلمة مرور مسؤول النظام مطلوبة لإرجاع الإشعارات المحددة لمسودة:');
    if (!(await verifyAdminPassword(password || ''))) { showToast('كلمة مرور خاطئة — صلاحية مسؤول النظام مطلوبة'); return; }
    if (!confirm(`تأكيد: سيتم إرجاع ${toReturn.length} إشعار محدد لمسودة${toReturn.some((g) => g.status === 'approved') ? ' وعكس حركات المخزون للمعتمدة منها' : ''}. المتابعة؟`)) return;
    let movementCount = 0;
    toReturn.forEach((g) => { movementCount += revertGoodsReceiptToDraft(g.id); });
    setSelectedIds(new Set());
    showToast(`تم إرجاع ${toReturn.length} إشعار محدد لمسودة، عكس ${movementCount} حركة مخزون`);
  };

  // Bulk submit selected draft GRNs for review (draft -> submitted)
  const bulkSubmitForReview = () => {
    const toSubmit = filtered.filter((g) => selectedIds.has(g.id) && g.status === 'draft');
    if (toSubmit.length === 0) { showToast('لا توجد إشعارات مختارة بحالة "مسودة" لإرسال للمراجعة'); return; }
    if (!confirm(`إرسال ${toSubmit.length} إشعار للمراجعة؟ سيتم تحويلها لحالة "قيد المراجعة" ويسمح بالتعديل.`)) return;
    toSubmit.forEach((g) => updateGRNStatus(g.id, 'submitted'));
    setSelectedIds(new Set());
    showToast(`تم إرسال ${toSubmit.length} إشعار للمراجعة (قيد المراجعة)`);
  };

  return (
    <div className="space-y-4">
      <ErpPanel>
        <ErpPageHeader
          icon={<PackageCheck className="w-6 h-6" />}
          title="استلام المواد الخام (GRN)"
          subtitle="تسجيل إشعارات الاستلام واعتمادها بمرحلتين (مراجعة ← اعتماد نهائي) مع تحديث المخزون تلقائياً"
          actions={
            <>
              <ViewToolbar
                filename="إشعارات_الاستلام"
                sheets={[
                  { name: 'الإشعارات', header: ['رقم GRN', 'المورد', 'الفرع', 'تاريخ النظام', 'تاريخ الفاتورة', 'الفاتورة', 'الصافي', 'الضريبة', 'الإجمالي', 'العملة', 'معادل الريال', 'الأصناف', 'الحالة', 'استلمها', 'ملاحظات'], rows: filtered.map((g) => [g.grnNumber, g.supplierName, g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchDisplayName(g.branchId), g.date, g.invoiceDate || '—', g.invoiceNumber, fmtMoney(g.totalAmount - (g.vatAmount || 0)), fmtMoney(g.vatAmount || 0), fmtMoney(g.totalAmount), g.currencyCode || 'SAR', fmtMoney(g.totalAmount * (g.exchangeRate || 0)), g.items.length, GRN_STATUS_LABELS[g.status], g.receivedBy, g.notes || '']) },
                ]}
              />
              <ErpButton onClick={printSelectedLabels}><Printer className="w-3.5 h-3.5" /> ملصقات</ErpButton>
              <ErpButton onClick={openPrintModal}><Printer className="w-3.5 h-3.5" /> طباعة مخصصة</ErpButton>
              <ErpButton variant="primary" onClick={() => { setCopySource(''); setShowModal(true); }}><Plus className="w-3.5 h-3.5" /> إشعار جديد</ErpButton>
            </>
          }
        />

        {/* إجراءات جماعية — تظهر فقط عند تحديد سجلات */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mb-3 flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-xl border border-primary-200 bg-primary-50/50">
            <span className="text-[11px] font-bold text-primary-800 tnum">
              محدَّد {selectedIds.size} من {filtered.length}
            </span>
            <Btn tone="ghost" onClick={bulkCopySelected}><Copy className="w-4 h-4" /> نسخ كمسودات</Btn>
            {filtered.some((g) => selectedIds.has(g.id) && g.status === 'draft') && (
              <Btn tone="primary" onClick={bulkSubmitForReview}><Send className="w-4 h-4" /> اعتماد المراجعة</Btn>
            )}
            {filtered.some((g) => selectedIds.has(g.id) && g.status === 'submitted') && (
              <Btn tone="success" onClick={bulkApprove}><Shield className="w-4 h-4" /> اعتماد نهائي</Btn>
            )}
            {filtered.some((g) => selectedIds.has(g.id) && (g.status === 'approved' || g.status === 'submitted')) && can('approve_grn') && (
              <>
                <Btn tone="danger" onClick={bulkReturnSelectedToDraft}><RotateCw className="w-4 h-4" /> إرجاع لمسودة</Btn>
                <Btn tone="dark" onClick={openBulkReopen}><Settings className="w-4 h-4" /> إرجاع متقدّم</Btn>
              </>
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
                <ErpInput value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" placeholder="المورد، رقم GRN، رقم الفاتورة" />
              </div>
            </ErpField>
            <ErpButton variant="ghost" onClick={() => { setFilterBranch('all'); setFilterStatus('all'); setDateFrom(''); setDateTo(''); setSearch(''); }} title="مسح كل المرشّحات">
              <RotateCcw className="w-3.5 h-3.5" /> إعادة تعيين
            </ErpButton>
          </ErpQueryBar>
        {/* عدّادات الحالات — التصميم المعتمد:总数 404 · 12 · 356 · 36.
              لم تكن الترويسة تعرض أي عدد، فلم يعرف المستخدم أن 12 إشعاراً
              ينتظر المراجعة إلا بعد فتح القائمة والبحث برقمه. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { id: 'all', label: 'كل الإشعارات', n: statusCounts.all, tone: 'default' },
              { id: 'submitted', label: 'قيد المراجعة', n: statusCounts.submitted, tone: 'amber' },
              { id: 'approved', label: 'معتمد', n: statusCounts.approved, tone: 'emerald' },
              { id: 'rejected', label: 'مرفوض', n: statusCounts.rejected, tone: 'rose' },
            ] as const).map((s) => {
              const on = s.id === 'all' ? filterStatus === 'all' : filterStatus === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setFilterStatus(on && s.id !== 'all' ? 'all' : (s.id === 'all' ? 'all' : s.id))}
                  className={`text-right p-3 rounded-xl border transition-colors ${
                    on ? 'border-primary-300 bg-primary-50/60' : 'border-line bg-surface hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-500 block">{s.label}</span>
                  <span className={`tnum text-xl font-bold block mt-0.5 ${s.tone === 'amber' ? 'text-amber-600' : s.tone === 'emerald' ? 'text-emerald-600' : s.tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>
                    {s.n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-[11px] font-bold text-slate-500">مرشّحات جاهزة:</span>
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setQuickFilter(quickFilter === f.id ? null : f.id)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                  quickFilter === f.id ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-surface text-slate-600 border-line hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* شريط المحدَّد — التصميم المعتمد: «محدَّد 2 إشعار · 17,130.50 ر.س» */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 px-3.5 py-2.5 rounded-xl border border-primary-200 bg-primary-50/50">
              <span className="text-[11px] font-bold text-primary-800 tnum">
                محدَّد {selectedIds.size} إشعار
                {selectedTotal > 0 && ` · ${fmtMoney(selectedTotal)}`}
              </span>
              <Btn tone="success" onClick={bulkApprove}><Shield className="w-4 h-4" /> اعتماد</Btn>
              <Btn tone="ghost" onClick={bulkReturnSelectedToDraft}><RotateCw className="w-4 h-4" /> تحويل لمسودة</Btn>
              <Btn tone="ghost" onClick={openBulkReopen}><Settings className="w-4 h-4" /> إرجاع متقدّم</Btn>
              <Btn tone="ghost" onClick={() => printSelectedLabels}><Printer className="w-4 h-4" /> طباعة مختارة</Btn>
            </div>
          )}

          {/* تخصيص الأعمدة — القائمة 14 عموداً والمعتمد يعرض 10 */}
          <div className="relative mt-3 flex items-center justify-end">
            <button
              onClick={() => setColsOpen((v) => !v)}
              className="text-[11px] font-bold text-slate-600 hover:text-primary-600 transition-colors"
            >
              {colsOpen ? 'إخفاء التخصيص' : 'تخصيص الأعمدة'}
            </button>
            {colsOpen && (
              <div className="absolute top-7 left-0 z-20 w-64 max-h-72 overflow-y-auto bg-surface border border-line rounded-xl shadow-card p-3 grid grid-cols-1 gap-1">
                {COL_LABELS.map(([id, label]) => (
                  <label key={id} className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.includes(id)}
                      onChange={() => toggleCol(id)}
                      className="w-3.5 h-3.5 accent-primary-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </ErpPanel>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={selectedIds.size === paged.length && paged.length > 0} onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(paged.map((g) => g.id))); else setSelectedIds(new Set()); }} /></th>
                <th className="p-3">رقم GRN</th><th className="p-3">المورد</th><th className="p-3">الفرع</th><th className="p-3">تاريخ النظام</th><th className="p-3">تاريخ الفاتورة</th><th className="p-3">الفاتورة</th>
                <th className="p-3"><span className="tnum" dir="ltr">الصافي (ر.س)</span></th><th className="p-3"><span className="tnum" dir="ltr">الضريبة (ر.س)</span></th><th className="p-3"><span className="tnum" dir="ltr">الإجمالي (ر.س)</span></th><th className="p-3">العملة</th><th className="p-3">الأصناف</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paged.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.has(g.id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(g.id); else next.delete(g.id); setSelectedIds(next); }} /></td>
                  <td className="tnum text-left p-3 font-bold text-primary-700">{g.grnNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{g.supplierName}</td>
                  <td className="p-3 text-slate-600">{g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchDisplayName(g.branchId)}</td>
                  <td className="p-3"><DateText value={g.date} /></td>
                  <td className="p-3"><DateText value={g.invoiceDate || ''} /></td>
                  <td className="tnum text-left p-3">{g.invoiceNumber}</td>
                  <td className="p-3"><span className="tnum" dir="ltr">{fmt(g.totalAmount - (g.vatAmount || 0))}</span></td>
                  <td className="p-3"><span className="tnum text-amber-700" dir="ltr">{fmt(g.vatAmount || 0)}</span></td>
                  <td className="p-3 font-extrabold"><span className="tnum" dir="ltr">{fmt(g.totalAmount)}</span></td>
                  <td className="tnum text-left p-3 text-amber-700">{g.currencyCode || 'SAR'}</td>
                  <td className="p-3 font-bold">{g.items.length}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${GRN_STATUS_COLORS[g.status]}`}>{GRN_STATUS_LABELS[g.status]}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 items-center">
                      <button onClick={() => copyAsNew(g)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0" title="نسخ كقالب لإشعار جديد (نفس المورد والأصناف)"><Copy className="w-4 h-4" /></button>
                      {g.status === 'draft' && (
                        <div className="flex flex-wrap gap-1">
                          {can('approve_grn') && <button onClick={() => updateGRNStatus(g.id, 'submitted')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg shrink-0" title="إرسال للمراجعة (يسمح بالتعديل بعد المراجعة)"><Send className="w-4 h-4" /></button>}
                          <button onClick={() => openEdit(g)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg shrink-0" title="تعديل"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => updateGRNStatus(g.id, 'rejected')} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg shrink-0" title="رفض"><XCircle className="w-4 h-4" /></button>
                        </div>
                      )}
                      {g.status === 'submitted' && (
                        <div className="flex flex-wrap gap-1">
                          {can('approve_grn') && <button onClick={() => updateGRNStatus(g.id, 'approved')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0" title="اعتماد نهائي (يرفع للمخزون والقيود - لا يمكن التعديل بعده)"><Shield className="w-4 h-4" /></button>}
                          <button onClick={() => openEdit(g)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg shrink-0" title="تعديل (قيد المراجعة)"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => updateGRNStatus(g.id, 'rejected')} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg shrink-0" title="رفض"><Ban className="w-4 h-4" /></button>
                          <button onClick={() => printSingle(g)} className="text-[11px] font-bold text-primary-600 hover:underline shrink-0">طباعة</button>
                        </div>
                      )}
                      {g.status === 'approved' && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-emerald-600 text-[10px] font-bold"><CheckCircle2 className="w-3.5 h-3.5 inline ml-0.5" /> معتمد</span>
                          <button onClick={() => { onNavigate?.('supplier_returns'); localStorage.setItem('preselectGrnId', g.id); }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg shrink-0" title="إنشاء إرجاع لهذا الاستلام"><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => printSingle(g)} className="text-[11px] font-bold text-primary-600 hover:underline shrink-0">طباعة</button>
                        </div>
                      )}
                      {g.status === 'rejected' && <span className="text-rose-600 text-[10px] font-bold"><XCircle className="w-3.5 h-3.5 inline ml-0.5" /> مرفوض</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={14} className="p-8">{search || filterBranch !== 'all' || filterStatus !== 'all' || dateFrom || dateTo ? <p className="text-center text-slate-500 font-bold">لا توجد نتائج مطابقة للفلاتر الحالية</p> : <div className="flex flex-col items-center gap-2"><PackageCheck className="w-10 h-10 text-slate-300" /><p className="text-center text-slate-500 font-bold">لا توجد إشعارات استلام بعد — أنشئ أول إشعار من زر أعلاه</p></div>}</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-line">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 font-bold text-slate-700">
                    الإجمالي <span className="tnum text-slate-500">({filtered.length})</span>
                  </td>
                  <td colSpan={4} className="px-3 py-2.5 text-[11px] font-bold text-slate-500">
                  <td colSpan={4} className="px-3 py-2.5 text-[11px] font-bold text-slate-500">
                    {'مسودة: ' + filtered.filter((g) => g.status === 'draft').length}
                    {' · قيد المراجعة: ' + filtered.filter((g) => g.status === 'submitted').length}
                    {' · معتمد: ' + filtered.filter((g) => g.status === 'approved').length}
                  </td>
                  </td>
                  <td className="px-2 py-2.5 text-left tnum font-bold text-slate-800">
                    {fmt(filtered.reduce((s, g) => s + (g.totalAmount - (g.vatAmount || 0)), 0))}
                  </td>
                  <td className="px-2 py-2.5 text-left tnum font-bold text-amber-700">
                    {fmt(filtered.reduce((s, g) => s + (g.vatAmount || 0), 0))}
                  </td>
                  <td className="px-2 py-2.5 text-left tnum font-extrabold text-slate-900">
                    {fmt(filtered.reduce((s, g) => s + (g.totalAmount || 0), 0))}
                  </td>
                  <td colSpan={4} className="px-3 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ترقيم الصفحات — التصميم المعتمد: «عرض 1–25 من 404» */}
        <div className="px-4 py-3 bg-slate-50 border-t border-line flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 tnum">
            {filteredQuick.length === 0
              ? 'لا توجد نتائج'
              : `عرض ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredQuick.length)} من ${filteredQuick.length} إشعار`}
          </span>
          {pageCount > 1 && (
            <span className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-line bg-surface text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                السابق
              </button>
              {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1).map((pn) => (
                <button
                  key={pn}
                  onClick={() => setPage(pn)}
                  className={`tnum text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                    pn === safePage ? 'bg-primary-600 text-white border-primary-600' : 'border-line bg-surface text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pn}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                disabled={safePage >= pageCount}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-line bg-surface text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                التالي
              </button>
            </span>
          )}
        </div>
      </Card>

{/* New GRN Modal - Professional Design */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="إشعار استلام جديد (GRN)" xl closeOnOverlayClick={false}>
        <form onSubmit={submit} className="space-y-0">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <PackageCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">{copySource ? 'نسخة قالب' : 'إشعار استلام جديد'}</h3>
                <p className="text-[11px] text-slate-500">{copySource ? `قائم على: ${copySource} — عدل الكميات والأسعار ثم احفظ كمسودة` : 'سجل استلام المواد من المورد — مسودة → مراجعة → اعتماد'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {copySource && <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-primary-50 text-primary-700 border-primary-200">نسخة</span>}
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">مسودة</span>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6">
            {/* Section 1: Header Info */}
            <section className="bg-surface rounded-2xl p-5 border border-line">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PackageCheck className="w-4 h-4 text-primary-600" /> بيانات الإشعار</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <ErpField label="المورد *" required>
                    <div className="flex gap-2">
                      <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${erpInputCls} flex-1`}>
                        {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <Btn type="button" tone="ghost" onClick={() => fillFromSupplierHistory(supplierId)} disabled={!supplierId} className="text-xs px-3 py-2 whitespace-nowrap shrink-0"><History className="w-3.5 h-3.5" /> تعبئة أصناف سابقة</Btn>
                    </div>
                  </ErpField>
                </div>
                <ErpField label="الفرع *" required>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={erpInputCls}>
                    {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                  </select>
                </ErpField>
                <ErpField label="أمر الشراء المرتبط">
                  <select value={purchaseOrderId} onChange={(e) => applyPO(e.target.value)} className={erpInputCls}>
                    <option value="">بدون أمر شراء</option>
                    {availablePOs.map((p) => {
                      const remCount = p.items.filter((i) => (i.receivedQty || 0) < (i.quantity || 0)).length;
                      return <option key={p.id} value={p.id}>{p.poNumber} — {p.supplierName} — {fmtMoney(p.totalAmount)}{p.status === 'partially_received' ? ` — متبقي ${remCount} بند` : ''}</option>;
                    })}
                    {availablePOs.length === 0 && <option value="" disabled>لا توجد أوامر شراء مفتوحة لهذا المورد</option>}
                  </select>
                </ErpField>
                <ErpField label="المستلم"><input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className={erpInputCls} placeholder="اسم الموظف" /></ErpField>
                <ErpField label="ملاحظات" className="lg:col-span-4">
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={erpInputCls}
                    placeholder="مثال: وصل ناقص صنف واحد · تم agreed الكمية مع المندوب"
                  />
                </ErpField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                <ErpField label="رقم فاتورة المورد"><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={erpInputCls} placeholder="اختياري" /></ErpField>
                <ErpField label="تاريخ الفاتورة"><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={erpInputCls} /></ErpField>
                <ErpField label="عملة المستند">
                  <CurrencySelect value={currencyCode} onChange={(code) => { setCurrencyCode(code); setExchangeRate(getCurrencyRate(code)); }} />
                </ErpField>
                {currencyCode !== 'SAR' && (
                  <ErpField label={`سعر الصرف (1 ${currencyCode} = ر.س)`} required>
                    <input type="number" min="0" step="0.0001" value={exchangeRate || ''} onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} className={erpInputCls} required />
                  </ErpField>
                )}
              </div>
            </section>

            {/* Section 2: Items - Professional Table */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck className="w-4 h-4 text-primary-600" /> الأصناف المستلمة</h4>
                <div className="flex gap-2">
                  <Btn tone="ghost" onClick={() => setScannerOpen(true)} className="text-xs px-3 py-1.5"><ScanLine className="w-3.5 h-3.5" /> مسح سريع (كاميرا)</Btn>
                  <Btn onClick={addItem} className="text-xs px-3 py-1.5"><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
                </div>
              </div>
              
              {/* جدول أصناف GRN — نفس المكوّن المستخدم في نموذج التعديل
                  (docs/design/04-grn-entry.html). كان مكرراً مرتين بمخططات
                  مختلفة، فيت drifting أي تحسين بينهما. */}
              <GrnItemsTable
                items={items}
                rowKeys={rowKeys}
                rawMaterials={rawMaterials}
                convOf={convOf}
                prefillPrice={prefillPrice}
                branchId={branchId}
                updateItem={updateItem}
                onQty={onQty}
                onPrice={onPrice}
                onLineTotal={onLineTotal}
                onRemove={(i) => { setItems(items.filter((_, k2) => k2 !== i)); setRowKeys(rowKeys.filter((_, k2) => k2 !== i)); }}
                qtyKey={qtyKey}
                priceKey={priceKey}
                totalKey={totalKey}
                draftVal={draftVal}
                clearDraft={clearDraft}
              />
            </section>

            {/* Section 3: Totals & Actions - Sticky Footer */}
            <div className="sticky bottom-0 z-10 bg-surface border-t border-line py-4 px-6 space-y-4">
              {/* VAT Settings */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <ErpField label="الأسعار">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setVatIncl(true)} className={`px-4 py-2 rounded-lg text-xs font-extrabold border transition-colors ${vatIncl ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300'}`}>شاملة الضريبة</button>
                      <button type="button" onClick={() => setVatIncl(false)} className={`px-4 py-2 rounded-lg text-xs font-extrabold border transition-colors ${!vatIncl ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300'}`}>غير شاملة</button>
                    </div>
                  </ErpField>
                  <ErpField label="نسبة ضريبة القيمة المضافة %">
                    <input type="number" min="0" max="100" value={vatRate || ''} onChange={(e) => setVatRate(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={erpInputCls} />
                  </ErpField>
                  <ErpField label="عملة المستند">
                    <CurrencySelect value={currencyCode} onChange={(code) => { setCurrencyCode(code); setExchangeRate(getCurrencyRate(code)); }} />
                  </ErpField>
                  {currencyCode !== 'SAR' && (
                    <ErpField label={`سعر الصرف (1 ${currencyCode} = ر.س)`} required>
                      <input type="number" min="0" step="0.0001" value={exchangeRate || ''} onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)} className={erpInputCls} required />
                    </ErpField>
                  )}
                </div>
              </div>

              {/* Invoice Total Distribution */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold text-amber-800 block mb-1">إجمالي الفاتورة من المورد (اختياري — للتوزيع التلقائي)</label>
                    <div className="flex gap-2">
                      <input type="number" min="0" step="0.01" value={invoiceTotalInput} onChange={(e) => setInvoiceTotalInput(e.target.value)} className={`${erpInputCls} flex-1`} placeholder="أدخل إجمالي الفاتورة واضغط توزيع" />
                      <Btn tone="ghost" onClick={() => {
                        const targetTotal = parseFloat(invoiceTotalInput) || 0;
                        if (targetTotal <= 0) return;
                        const currentSubtotal = items.reduce((s, i) => s + i.quantityReceived * i.unitPrice, 0);
                        if (currentSubtotal <= 0) return;
                        const factor = targetTotal / (vatIncl ? currentSubtotal : currentSubtotal + (currentSubtotal * vatRate / 100));
                        setItems((prev) => prev.map((it) => ({ ...it, unitPrice: Math.round(it.unitPrice * factor * 100) / 100 })));
                        setInvoiceTotalInput('');
                      }}><RotateCcw className="w-3.5 h-3.5" /> توزيع</Btn>
                    </div>
                  </div>
                </div>
              </div>

              {/* Totals Summary */}
              {/* الإجماليات — ErpKpi. كانت لوحة indigo-950 على bg-indigo-50،
                  خارج نظام التصميم ورموزه. وهي أعلى أربع قيم في النافذة:
                  إن بقيت غير مقروءة لم تُقرأ. الإجمالي وحده يميّز نفسه
                  بـhighlight، والضريبة والمعادلة بلونيهما الدلاليين. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <ErpKpi
                  label={`الإجمالي قبل الضريبة${currencyCode !== 'SAR' ? ` (${currencyCode})` : ''}`}
                  value={fmtMoney(vatIncl ? subtotal - vatAmount : subtotal)}
                />
                <ErpKpi
                  label={`ضريبة القيمة المضافة ${vatRate}%${vatIncl ? ' (مشمولة)' : ''}`}
                  value={fmtMoney(vatAmount)}
                  subTone="down"
                />
                <ErpKpi label="إجمالي الفاتورة" value={fmtMoney(totalAmount)} highlight />
                {currencyCode !== 'SAR' && (
                  <ErpKpi label="المعادل بالريال" value={fmtMoney(totalAmount * exchangeRate)} subTone="up" />
                )}
              </div>
              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors">إلغاء</button>
                <button type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all">حفظ كمسودة</button>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Modal - Professional Design */}
      <Modal open={editGrn !== null} onClose={() => setEditGrn(null)} title={`تعديل الإشعار ${editGrn?.grnNumber || ''} (${editGrn?.status === 'draft' ? 'مسودة' : 'قيد المراجعة'})`} xl closeOnOverlayClick={false}>
        <div className="space-y-0">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">تعديل إشعار الاستلام</h3>
                <p className="text-[11px] text-slate-500">
                  {editGrn?.status === 'draft' ? 'الإشعار مسودة — التعديل مسموح بالكامل' : 'الإشعار قيد المراجعة — يمكن التعديل قبل الاعتماد النهائي'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${editGrn?.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                {editGrn?.status === 'draft' ? 'مسودة' : 'قيد المراجعة'}
              </span>
            </div>
          </div>

          {/* Form Content */}
          <div className="px-6 pt-3">
            <ApprovalPathBar
              caption="مسار اعتماد إشعار الاستلام"
              steps={[GRN_PATH.steps.draft, GRN_PATH.steps.review, GRN_PATH.steps.approve, GRN_PATH.steps.post]}
              current={editGrn?.status || 'draft'}
              statusLabel={GRN_STATUS_LABELS[editGrn?.status || 'draft']}
              terminal={GRN_PATH.terminal}
            />
          </div>
          <div className="px-6 pt-3"><DocumentFingerprint entityType="grn" entityId={editGrn?.id || ''} title={`بصمة الإشعار ${editGrn?.grnNumber || ''}`} /></div>
          <div className="p-6 space-y-6">
            {/* Section 1: Header Info */}
            <section className="bg-surface rounded-2xl p-5 border border-line">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Pencil className="w-4 h-4 text-amber-600" /> بيانات الإشعار</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <ErpField label="المورد *" required>
                    <select value={editGrn?.supplierId || ''} onChange={(e) => updateGoodsReceiptNote(editGrn!.id, { supplierId: e.target.value, supplierName: suppliers.find((s) => s.id === e.target.value)?.name || '' })} disabled={editGrn?.status !== 'draft'} className={erpInputCls}>
                      {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </ErpField>
                </div>
                <ErpField label="الفرع *" required>
                  <select value={editGrn?.branchId || ''} onChange={(e) => updateGoodsReceiptNote(editGrn!.id, { branchId: e.target.value })} disabled={editGrn?.status !== 'draft'} className={erpInputCls}>
                    {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                    <option value="b-ck">المطبخ المركزي</option>
                  </select>
                </ErpField>
                <ErpField label="تاريخ الفاتورة"><input type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} className={erpInputCls} /></ErpField>
                <ErpField label="استلمها"><span className="text-xs font-bold text-slate-500 pt-2 block">{editGrn?.receivedBy || '—'}</span></ErpField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                <ErpField label="رقم فاتورة المورد"><input value={editInvoice} onChange={(e) => setEditInvoice(e.target.value)} className={erpInputCls} /></ErpField>
                <ErpField label="تاريخ الفاتورة"><input type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} className={erpInputCls} /></ErpField>
                <ErpField label="ملاحظات"><textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className={erpInputCls} /></ErpField>
              </div>
            </section>

            {/* Section 2: Items — جدول واحد مشترك مع نموذج الإدخال */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck className="w-4 h-4 text-amber-600" /> الأصناف المستلمة</h4>
              </div>

              <GrnItemsTable
                items={editItems}
              rowKeys={editKeys}
              rawMaterials={rawMaterials}
              convOf={convOf}
              prefillPrice={prefillPrice}
                branchId={editGrn?.branchId || ''}
              updateItem={updateEditItem}
              onQty={onQtyEdit}
              onPrice={onPriceEdit}
              onLineTotal={onLineTotalEdit}
              onRemove={(i) => setEditItems(editItems.filter((_, k) => k !== i))}
              qtyKey={qtyKey}
              priceKey={priceKey}
              totalKey={totalKey}
              draftVal={draftVal}
              clearDraft={clearDraft}
            />
            </section>

            {/* Section 3: Totals & Actions - Sticky Footer */}
            <div className="sticky bottom-0 z-10 bg-surface border-t border-line py-4 px-6 space-y-4">
              {/* Totals Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ErpKpi label="عدد الأصناف" value={String(editItems.length)} />
                  <ErpKpi label="إجمالي الكميات" value={fmt(editItems.reduce((s, i) => s + i.quantityReceived, 0))} />
                  <ErpKpi label="إجمالي التكلفة" value={fmtMoney(editItems.reduce((s, i) => s + i.quantityReceived * i.unitPrice, 0))} highlight />
                </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setEditGrn(null)} className="px-6 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors">إلغاء</button>
                <button onClick={saveEdit} className="px-8 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all">حفظ التعديل</button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bulk Reopen to Draft Modal (Admin only) */}
      <Modal open={bulkReopenModal} onClose={() => { setBulkReopenModal(false); setBulkReopenPassword(''); setBulkReopenMovementIds(new Set()); }} title="إرجاع إشعارات معتمدة لمسودة (صلاحية مسؤول النظام)" wide>
        <div className="space-y-4 text-xs">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
            <p className="font-bold text-rose-950 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> عملية حساسة — تتطلب صلاحية مسؤول النظام</p>
            <p className="text-rose-700 mt-1 text-[11px]">سيتم عكس حركات المخزون للأصناف المختارة فقط. الإشعارات ستعود لحالة "مسودة" ويمكن تعديلها.</p>
          </div>
          <ErpField label="كلمة مرور مسؤول النظام" required>
            <input type="password" value={bulkReopenPassword} onChange={(e) => setBulkReopenPassword(e.target.value)} className={erpInputCls} placeholder="أدخل كلمة المرور" autoComplete="current-password" />
          </ErpField>
          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl p-2">
            <p className="font-bold text-slate-700 mb-2">اختر حركات المخزون لعكسها (كل سطر = صنف في إشعار):</p>
            {filtered.filter((g) => selectedIds.has(g.id) && g.status === 'approved').map((g) => (
              <div key={g.id} className="mb-2 p-2 bg-slate-50 rounded-lg">
                <div className="font-bold text-indigo-700">{g.grnNumber} — {g.supplierName} ({getBranchDisplayName(g.branchId)})</div>
                {g.items.map((item, idx) => {
                  const moveKey = `${g.id}|${item.rawMaterialId}`;
                  const mat = rawMaterials.find((m) => m.id === item.rawMaterialId);
                  return (
                    <label key={idx} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input type="checkbox" checked={bulkReopenMovementIds.has(moveKey)} onChange={(e) => { const next = new Set(bulkReopenMovementIds); if (e.target.checked) next.add(moveKey); else next.delete(moveKey); setBulkReopenMovementIds(next); }} />
                      <span>{mat?.nameAr || item.rawMaterialId}</span>
                      <span className="text-slate-500">× {item.quantityReceived} {mat?.unit || ''}</span>
                      <span className="text-amber-600">(سيُخصم من المخزون)</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {filtered.filter((g) => selectedIds.has(g.id) && g.status === 'approved').length === 0 && (
              <p className="text-center text-slate-500 py-4">لا توجد إشعارات معتمدة مختارة</p>
            )}
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button onClick={() => { setBulkReopenModal(false); setBulkReopenPassword(''); setBulkReopenMovementIds(new Set()); }} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button onClick={executeBulkReopen} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium">تنفيذ الإرجاع لمسودة</button>
          </div>
        </div>
      </Modal>

      {/* Print Options Modal */}
      <Modal open={showPrintModal} onClose={() => setShowPrintModal(false)} title="خيارات طباعة إشعارات الاستلام" wide>
        <div className="space-y-4 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
            <p className="font-bold text-indigo-950">اختر نوع الطباعة:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-slate-700">
              <li><b>طباعة ملخص:</b> قائمة بالإشعارات فقط (بدون تفاصيل الأصناف) — مثالية للأرشفة والمراجعة السريعة</li>
              <li><b>طباعة تفصيلية:</b> إشعار واحد مع كامل تفاصيل الأصناف ووحدات الشراء/التخزين</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Btn tone="primary" onClick={() => { setShowPrintModal(false); printFiltered(); }}><Printer className="w-4 h-4" /> طباعة ملخص المفلترة ({filtered.length})</Btn>
            <Btn tone="ghost" onClick={() => setShowPrintModal(false)}>إلغاء</Btn>
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={onScanned}
        hint="امسح كود الصنف على العبوة ليُضاف فوراً لبنود الاستلام — ويبقى الماسح مفتوحاً للبند التالي."
      />
    </div>
  );
};
