import React, { useState, useEffect } from 'react';
import { Warehouse, ArrowRightLeft, ClipboardList, AlertTriangle, Plus, Package, Clock4, Pencil, Trash2, QrCode, Scan, Printer, Barcode, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, TabBar, AutocompleteSelect } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { ImportExcelModal, ImportColumn } from '../ui/ImportExcelModal';
import { fmt, allCategoryLabels, DEFAULT_MATERIAL_CATEGORIES, categoryLabel, navOnEnter } from '../../utils/helpers';
import { openQrLabelsWindow } from '../../utils/labels';
import type { RawMaterial, MaterialBarcode } from '../../types';

const MATERIAL_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', label: 'الكود', aliases: ['الكود', 'code', 'رمز'], sample: 'RM-101' },
  { key: 'nameAr', label: 'الاسم العربي', required: true, aliases: ['الاسم', 'الاسم العربي', 'name', 'nameAr', 'اسم الصنف'], sample: 'دجاج طازج' },
  { key: 'nameEn', label: 'الاسم الإنجليزي', aliases: ['الاسم الانجليزي', 'nameEn', 'name_en'], sample: 'Fresh Chicken' },
  { key: 'category', label: 'التصنيف', type: 'select', aliases: ['التصنيف', 'category', 'فئة'], options: Object.entries(DEFAULT_MATERIAL_CATEGORIES).map(([k, v]) => ({ value: k, label: v.labelAr })), sample: 'لحوم ودواجن' },
  { key: 'unit', label: 'الوحدة', aliases: ['الوحدة', 'unit', 'وحدة'], sample: 'كغم' },
  { key: 'standardPrice', label: 'سعر الوحدة', type: 'number', aliases: ['السعر', 'سعر الوحدة', 'price', 'standardPrice', 'تكلفة'], sample: '15.5' },
  { key: 'minStockLevel', label: 'حد أدنى', type: 'number', aliases: ['حد ادنى', 'minStockLevel', 'min_stock'], sample: '50' },
  { key: 'maxStockLevel', label: 'حد أقصى', type: 'number', aliases: ['حد اقصى', 'maxStockLevel', 'max_stock'], sample: '200' },
  { key: 'yieldPercentage', label: 'نسبة الإنتاجية %', type: 'number', aliases: ['الانتاجية', 'yield', 'yieldPercentage', 'نسبة الانتاجية'], sample: '90' },
  { key: 'storageType', label: 'التخزين', type: 'select', aliases: ['التخزين', 'storageType', 'storage'], options: [
    { value: 'frozen', label: 'مجمد' }, { value: 'chilled', label: 'مبرد' }, { value: 'dry', label: 'جاف' },
  ], sample: 'مبرد' },
  { key: 'supplierId', label: 'المورد', aliases: ['المورد', 'supplier', 'supplierId'], sample: '' },
];

export const InventoryView: React.FC = () => {
  const { inventory, rawMaterials, branches, suppliers, visibleBranchIds, stockTransfers, physicalCounts, addStockTransfer, recordPhysicalCount, getRawMaterialName, getBranchName, getRawMaterialUnitCost, getBranchAverageUnitCost, getAverageUnitCost, importRawMaterials, addRawMaterial, updateRawMaterial, deleteRawMaterial, materialCategories, unitsOfMeasure, materialBarcodes, addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode, showToast } = useApp();
  const [filterBranch, setFilterBranch] = useState('all');
  const [tab, setTab] = useState<'stock' | 'transfers' | 'count' | 'items' | 'expiry'>('stock');
  const [showImport, setShowImport] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ rawMaterialId: string; branchId: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrCount, setQrCount] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string>('');

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const filteredInv = filterBranch === 'all' ? inventory : inventory.filter((i) => i.branchId === filterBranch);

  const totalStockValue = filteredInv.reduce((s, i) => s + i.quantity * getRawMaterialUnitCost(i.rawMaterialId), 0);

  // Transfer form
  const [showTransfer, setShowTransfer] = useState(false);
  const [fromBranch, setFromBranch] = useState('b-ck');
  const [toBranch, setToBranch] = useState('b-01');
  const [transferItems, setTransferItems] = useState<{ rawMaterialId: string; quantity: number }[]>([{ rawMaterialId: rawMaterials[0]?.id || '', quantity: 0 }]);

  // Count form
  const [showCount, setShowCount] = useState(false);
  const [countBranch, setCountBranch] = useState(visibleBranchIds[0] || '');
  const [countedBy, setCountedBy] = useState('');
  const [countValues, setCountValues] = useState<Record<string, string>>({});

  const theoreticalOf = (mId: string) => inventory.find((x) => x.branchId === countBranch && x.rawMaterialId === mId)?.quantity || 0;

  // QR code printing (بند 57) — يولد ملصق QR للصنف في الفرع
  const printQrLabel = (m: RawMaterial, branchId: string) => {
    setQrCount(1);
    setQrTarget({ rawMaterialId: m.id, branchId });
  };

  // محتوى QR مقروء بأي قارئ عادي: السطر الأول بيانات الصنف، الثاني معرف تقني (mat/br)
  const qrPayloadOf = (mat: RawMaterial, branchId: string) => {
    const branchName = branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(branchId);
    return `${mat.nameAr} (${mat.unit}) — ${branchName}\nmat:${mat.id}|br:${branchId}`;
  };

  // QR code generation effect
  useEffect(() => {
    if (qrTarget) {
      const mat = rawMaterials.find((m) => m.id === qrTarget.rawMaterialId);
      if (mat) {
        const payload = qrPayloadOf(mat, qrTarget.branchId);
        import('qrcode').then((QRCode) => QRCode.toDataURL(payload, { width: 256, margin: 2, errorCorrectionLevel: 'M' }))
          .then((url) => setQrDataUrl(url))
          .catch(() => setQrDataUrl(''));
      }
    }
  }, [qrTarget, rawMaterials]);

  // طباعة N ملصقات QR (بأي عدد في أي وقت — غير مرتبطة بالاستلام)
  const printQrLabels = async () => {
    if (!qrTarget) return;
    const mat = rawMaterials.find((m) => m.id === qrTarget.rawMaterialId);
    if (!mat) return;
    const count = Math.max(1, Math.min(2000, Math.round(qrCount) || 1));
    if (count !== (Math.round(qrCount) || 1)) showToast(`العدد كبير — سيُطبع ${count} ملصق`);
    const branchName = qrTarget.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(qrTarget.branchId);
    const payload = qrPayloadOf(mat, qrTarget.branchId);
    await openQrLabelsWindow(`ملصقات QR — ${mat.nameAr} (${count})`, Array.from({ length: count }, () => ({ materialName: mat.nameAr, branchName, unit: mat.unit, payload })));
  };

  const openCount = () => {
    const vals: Record<string, string> = {};
    rawMaterials.forEach((m) => { vals[m.id] = String(theoreticalOf(m.id)); });
    setCountValues(vals);
    setShowCount(true);
  };

  // Item add/edit
  const emptyItemForm = () => ({ code: '', nameAr: '', nameEn: '', category: 'dry_goods' as RawMaterial['category'], unit: 'كغم', purchaseUnit: '', purchaseUnitConversion: 1, purchaseUnitPrice: 0, standardPrice: 0, minStockLevel: 0, maxStockLevel: 0, reorderPoint: 0, leadTimeDays: 0, yieldPercentage: 100, supplierId: suppliers[0]?.id || '', storageType: 'dry' as RawMaterial['storageType'], isActive: true, tradeUomId: '', tradeUomName: '', tradeUomConversion: 0 });
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(emptyItemForm());

  // باركود form — نفس المنتج قد له أكثر من باركود حسب المورد/التعبئة
  const emptyBcForm = () => ({ barcode: '', supplierId: '', packagingLevel: 'unit' as MaterialBarcode['packagingLevel'], packagingQty: 0, isPrimary: false, barcodeType: 'EAN13' as MaterialBarcode['barcodeType'] });
  const [bcForm, setBcForm] = useState(emptyBcForm());
  const [bcEditId, setBcEditId] = useState<string | null>(null);
  const [bcError, setBcError] = useState('');
  const setBc = (patch: Partial<ReturnType<typeof emptyBcForm>>) => setBcForm((p) => ({ ...p, ...patch }));

  const itemBarcodes = editingId ? materialBarcodes.filter((b) => b.rawMaterialId === editingId) : [];

  const submitBarcode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const code = bcForm.barcode.trim();
    if (!code) { setBcError('أدخل رقم الباركود'); return; }
    const dup = materialBarcodes.find((b) => b.barcode === code && b.id !== bcEditId);
    if (dup) { setBcError(`الباركود ${code} مسجل مسبقاً على صنف آخر`); return; }
    if (bcEditId) {
      updateMaterialBarcode(bcEditId, {
        barcode: code, supplierId: bcForm.supplierId || undefined, packagingLevel: bcForm.packagingLevel, packagingQty: bcForm.packagingQty || undefined, isPrimary: bcForm.isPrimary, barcodeType: bcForm.barcodeType,
      });
    } else {
      addMaterialBarcode({ rawMaterialId: editingId, barcode: code, supplierId: bcForm.supplierId || undefined, packagingLevel: bcForm.packagingLevel, packagingQty: bcForm.packagingQty || undefined, isPrimary: bcForm.isPrimary, barcodeType: bcForm.barcodeType });
    }
    setBcForm(emptyBcForm()); setBcEditId(null); setBcError('');
  };

  const startEditBarcode = (b: MaterialBarcode) => {
    setBcEditId(b.id);
    setBcForm({ barcode: b.barcode, supplierId: b.supplierId || '', packagingLevel: b.packagingLevel || 'unit', packagingQty: b.packagingQty || 0, isPrimary: !!b.isPrimary, barcodeType: b.barcodeType || 'EAN13' });
  };

  const openAddItem = () => { setEditingId(null); setItemForm(emptyItemForm()); setBcForm(emptyBcForm()); setBcEditId(null); setShowItemModal(true); };
  const openEditItem = (m: RawMaterial) => {
    setEditingId(m.id);
    setItemForm({ code: m.code, nameAr: m.nameAr, nameEn: m.nameEn, category: m.category, unit: m.unit, purchaseUnit: m.purchaseUnit || '', purchaseUnitConversion: m.purchaseUnitConversion || 1, purchaseUnitPrice: m.purchaseUnitPrice || 0, standardPrice: m.standardPrice, minStockLevel: m.minStockLevel, maxStockLevel: m.maxStockLevel, reorderPoint: m.reorderPoint || 0, leadTimeDays: m.leadTimeDays || 0, yieldPercentage: m.yieldPercentage, supplierId: m.supplierId || suppliers[0]?.id || '', storageType: m.storageType, isActive: m.isActive, tradeUomId: m.tradeUomId || '', tradeUomName: m.tradeUomName || '', tradeUomConversion: m.tradeUomConversion || 0 });
    setShowItemModal(true);
  };
  const setF = (patch: Partial<typeof itemForm>) => setItemForm((p) => ({ ...p, ...patch }));

  const submitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.nameAr.trim()) return;
    if (editingId) {
      updateRawMaterial(editingId, { ...itemForm, purchaseUnit: itemForm.purchaseUnit || undefined, tradeUomId: itemForm.tradeUomId || undefined, tradeUomName: itemForm.tradeUomName || undefined, tradeUomConversion: itemForm.tradeUomConversion > 0 ? itemForm.tradeUomConversion : undefined, code: itemForm.code });
    } else {
      addRawMaterial({ nameAr: itemForm.nameAr.trim(), nameEn: itemForm.nameEn.trim() || itemForm.nameAr.trim(), category: itemForm.category, unit: itemForm.unit || 'كغم', purchaseUnit: itemForm.purchaseUnit || undefined, purchaseUnitConversion: itemForm.purchaseUnitConversion, purchaseUnitPrice: itemForm.purchaseUnitPrice, standardPrice: itemForm.standardPrice, minStockLevel: itemForm.minStockLevel, maxStockLevel: itemForm.maxStockLevel, reorderPoint: itemForm.reorderPoint > 0 ? itemForm.reorderPoint : undefined, leadTimeDays: itemForm.leadTimeDays > 0 ? itemForm.leadTimeDays : undefined, yieldPercentage: itemForm.yieldPercentage || 100, supplierId: itemForm.supplierId, storageType: itemForm.storageType, isActive: itemForm.isActive, tradeUomId: itemForm.tradeUomId || undefined, tradeUomName: itemForm.tradeUomName || undefined, tradeUomConversion: itemForm.tradeUomConversion > 0 ? itemForm.tradeUomConversion : undefined });
    }
    setShowItemModal(false);
  };

  const submitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromBranch === toBranch) return;
    const validItems = transferItems.filter((i) => i.quantity > 0 && i.rawMaterialId);
    if (validItems.length === 0) return;
    addStockTransfer({
      fromBranchId: fromBranch, toBranchId: toBranch,
      items: validItems.map((i) => ({ itemType: 'raw_material' as const, rawMaterialId: i.rawMaterialId, itemName: getRawMaterialName(i.rawMaterialId), quantity: i.quantity, unit: rawMaterials.find((m) => m.id === i.rawMaterialId)?.unit || '', unitCost: getBranchAverageUnitCost(fromBranch, i.rawMaterialId) })),
      requestedBy: 'المستخدم',
    });
    setShowTransfer(false); setTransferItems([{ rawMaterialId: rawMaterials[0]?.id || '', quantity: 0 }]);
  };

  const submitCount = (e: React.FormEvent) => {
    e.preventDefault();
    const items = rawMaterials
      .filter((m) => countValues[m.id] !== undefined && countValues[m.id] !== '')
      .map((m) => {
        const theoreticalQty = theoreticalOf(m.id);
        const actualQty = parseFloat(countValues[m.id]) || 0;
        const unitCost = getRawMaterialUnitCost(m.id);
        return { rawMaterialId: m.id, theoreticalQty, actualQty, varianceQty: actualQty - theoreticalQty, unitCost, varianceCost: (actualQty - theoreticalQty) * unitCost };
      });
    if (items.length === 0) return;
    recordPhysicalCount({ branchId: countBranch, countedBy: countedBy || 'المستخدم', items, totalVarianceCost: items.reduce((s, x) => s + x.varianceCost, 0) });
    setShowCount(false); setCountedBy(''); setCountValues({});
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المخزون والتحويلات والجرد" subtitle="مراقبة الأرصدة، تنبيهات الحد الأدنى، التحويلات بين الفروع، والجرد الدوري" icon={<Warehouse className="w-6 h-6 text-brand-600" />}
        actions={<>
          <ViewToolbar
            filename="المخزون"
            onImport={() => setShowImport(true)}
            importLabel="استيراد الأصناف"
            sheets={[
              { name: 'الأرصدة', header: ['المادة', 'التصنيف', 'الفرع', 'الكمية', 'الوحدة', 'سعر الوحدة', 'القيمة'], rows: filteredInv.map((i) => [getRawMaterialName(i.rawMaterialId), categoryLabel(rawMaterials.find((m) => m.id === i.rawMaterialId)?.category || 'dry_goods', materialCategories), i.branchId === 'b-ck' ? 'المطبخ المركزي' : i.branchId, i.quantity, rawMaterials.find((m) => m.id === i.rawMaterialId)?.unit || '', rawMaterials.find((m) => m.id === i.rawMaterialId)?.standardPrice || 0, i.quantity * (rawMaterials.find((m) => m.id === i.rawMaterialId)?.standardPrice || 0)]) },
              { name: 'الأصناف', header: ['الكود', 'الاسم', 'الاسم EN', 'التصنيف', 'الوحدة', 'السعر', 'حد أدنى', 'حد أقصى', 'الإنتاجية %', 'التخزين'], rows: rawMaterials.map((m) => [m.code, m.nameAr, m.nameEn, categoryLabel(m.category, materialCategories), m.unit, m.standardPrice, m.minStockLevel, m.maxStockLevel, m.yieldPercentage, m.storageType]) },
              { name: 'التحويلات', header: ['الرقم', 'من', 'إلى', 'التاريخ', 'الأصناف'], rows: stockTransfers.map((t) => [t.transferNumber, t.fromBranchId === 'b-ck' ? 'المطبخ المركزي' : t.fromBranchId, t.toBranchId === 'b-ck' ? 'المطبخ المركزي' : t.toBranchId, t.date, t.items.length]) },
              { name: 'الصلاحية', header: ['المادة', 'الفرع', 'الكمية', 'الدفعة', 'تاريخ الانتهاء', 'الحالة'], rows: filteredInv.filter((i) => i.expiryDate).map((i) => [getRawMaterialName(i.rawMaterialId), i.branchId, i.quantity, i.batchNumber || '', i.expiryDate || '', Math.floor((new Date(i.expiryDate!).getTime() - Date.now()) / 86400000) <= 0 ? 'منتهية' : 'سليمة']) },
            ]}
          />
          <Btn onClick={() => setShowTransfer(true)}><ArrowRightLeft className="w-4 h-4" /> تحويل</Btn>
          <Btn tone="dark" onClick={openCount}><ClipboardList className="w-4 h-4" /> جرد فعلي</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي قيمة المخزون</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(totalStockValue)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مراقبة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{filteredInv.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تحويلات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{stockTransfers.length}</strong></div>
      </div>

      <Card className="p-4 flex items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
      </Card>

      <TabBar tabs={[{ id: 'stock', label: 'الأرصدة' }, { id: 'items', label: 'الأصناف' }, { id: 'transfers', label: 'التحويلات' }, { id: 'count', label: 'سجل الجرد' }, { id: 'expiry', label: 'الصلاحية' }]} active={tab} onChange={(id) => setTab(id as 'stock' | 'transfers' | 'count' | 'items' | 'expiry')} />

      {tab === 'stock' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">المادة</th><th className="p-3">التصنيف</th><th className="p-3">الفرع</th><th className="p-3">الكمية</th><th className="p-3">الوحدة</th><th className="p-3">متوسط السعر</th><th className="p-3">سعر قياسي</th><th className="p-3">القيمة</th><th className="p-3">الحالة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInv.map((i) => {
                  const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
                  const isLow = mat && i.quantity <= mat.minStockLevel;
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{getRawMaterialName(i.rawMaterialId)}</td>
                      <td className="p-3">{mat ? categoryLabel(mat.category, materialCategories) : ''}</td>
                      <td className="p-3 text-slate-600">{i.branchId === 'b-ck' ? 'المطبخ المركزي' : i.branchId}</td>
                      <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmt(i.quantity)}</td>
                      <td className="p-3 text-slate-500">{mat?.unit}</td>
                      <td className="tnum text-left p-3 font-bold text-brand-700">{fmt(getBranchAverageUnitCost(i.branchId, i.rawMaterialId))}</td>
                      <td className="tnum text-left p-3 text-slate-500">{fmt(mat?.standardPrice || 0)}</td>
                      <td className="tnum text-left p-3 font-bold text-brand-700">{fmt(i.quantity * getBranchAverageUnitCost(i.branchId, i.rawMaterialId))} ر.س</td>
                      <td className="p-3">{isLow ? <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">منخفض</span> : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">آمن</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'items' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <p className="text-xs font-extrabold text-slate-700 flex items-center gap-2"><Package className="w-4 h-4 text-brand-500" /> الأصناف المسجلة ({rawMaterials.length})</p>
            <div className="flex gap-2">
              <Btn onClick={() => setScanning(true)}><Scan className="w-4 h-4" /> مسح QR</Btn>
              <Btn onClick={openAddItem}><Plus className="w-4 h-4" /> إضافة صنف</Btn>
              <Btn onClick={() => setShowImport(true)}><Plus className="w-4 h-4" /> استيراد أصناف من Excel</Btn>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">التصنيف</th><th className="p-3">المخزون (وحدة)</th><th className="p-3">التداول (الوصفات)</th><th className="p-3">سعر الوحدة</th><th className="p-3">حد أدنى</th><th className="p-3">حد أقصى</th><th className="p-3">الإنتاجية</th><th className="p-3">التخزين</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rawMaterials.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-3 font-bold text-brand-700">{m.code}</td>
                    <td className="p-3 font-bold text-slate-900">{m.nameAr}</td>
                    <td className="p-3 text-slate-600">{categoryLabel(m.category, materialCategories)}</td>
                    <td className="p-3 text-slate-500">{m.unit}</td>
                    <td className="p-3 text-amber-700">{m.tradeUomName ? `${m.tradeUomName} ×${m.tradeUomConversion}` : m.unit}</td>
                    <td className="tnum text-left p-3 font-bold">{fmt(m.standardPrice)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{fmt(m.minStockLevel)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{fmt(m.maxStockLevel)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{m.yieldPercentage}%</td>
                    <td className="p-3 text-slate-500">{{ frozen: 'مجمد', chilled: 'مبرد', dry: 'جاف' }[m.storageType]}</td>
                    <td className="p-3">{m.isActive ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">نشط</span> : <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">موقوف</span>}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => printQrLabel(m, filterBranch !== 'all' ? filterBranch : visibleBranchIds[0] || 'b-ck')} className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors" title="طباعة ملصق QR"><QrCode className="w-4 h-4" /></button>
                        <button onClick={() => openEditItem(m)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-brand-50 transition-colors" title="تعديل الصنف"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => {
                          if (!window.confirm(`حذف الصنف «${m.nameAr}»؟`)) return;
                          const res = deleteRawMaterial(m.id);
                          if (!res.ok) alert(res.error);
                        }} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors" title="حذف الصنف"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'transfers' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الرقم</th><th className="p-3">من</th><th className="p-3">إلى</th><th className="p-3">التاريخ</th><th className="p-3">الأصناف</th><th className="p-3">الحالة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-3 font-bold text-brand-700">{t.transferNumber}</td>
                    <td className="p-3">{getBranchName(t.fromBranchId)}</td>
                    <td className="p-3">{getBranchName(t.toBranchId)}</td>
                    <td className="tnum text-left p-3 text-slate-600">{t.date}</td>
                    <td className="p-3">{t.items.length} صنف</td>
                    <td className="p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      t.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : t.status === 'submitted' ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : t.status === 'rejected' ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                    }">{
                      t.status === 'approved' ? 'معتمد'
                      : t.status === 'submitted' ? 'مقدَّم للاعتماد'
                      : t.status === 'rejected' ? 'مرفوض'
                      : 'مسودة'
                    }</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'count' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold">سجل الجرد الفعلي — {physicalCounts.length} عملية جرد</p>
            <Btn tone="dark" onClick={openCount}><ClipboardList className="w-4 h-4" /> جرد فعلي جديد</Btn>
          </div>
          {physicalCounts.length === 0 ? (
            <Card className="p-8 text-center text-slate-500 font-bold text-xs">لا توجد عمليات جرد بعد — أضف جرداً فعلياً من زر "جرد فعلي" بالأعلى</Card>
          ) : (
            [...physicalCounts].sort((a, b) => b.date.localeCompare(a.date)).map((c) => {
              const totalTheoretical = c.items.reduce((s, x) => s + x.theoreticalQty, 0);
              const totalActual = c.items.reduce((s, x) => s + x.actualQty, 0);
              return (
                <Card key={c.id} className="overflow-hidden">
                  <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-extrabold text-slate-800">{getBranchName(c.branchId)}</span>
                      <span className="font-mono text-slate-500">{c.date}</span>
                      <span className="text-slate-500">بواسطة {c.countedBy}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.totalVarianceCost >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      فرق {fmt(Math.abs(c.totalVarianceCost))} ر.س
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr><th className="p-2.5">المادة</th><th className="p-2.5">نظري</th><th className="p-2.5">فعلي</th><th className="p-2.5">الفرق</th><th className="p-2.5">القيمة</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {c.items.map((it) => (
                          <tr key={it.rawMaterialId} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{getRawMaterialName(it.rawMaterialId)}</td>
                            <td className="tnum text-left p-2.5 text-slate-600">{fmt(it.theoreticalQty)}</td>
                            <td className="tnum text-left p-2.5 font-extrabold text-slate-900">{fmt(it.actualQty)}</td>
                            <td className={`p-2.5 font-mono font-extrabold ${it.varianceQty === 0 ? 'text-slate-400' : it.varianceQty > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {it.varianceQty === 0 ? '—' : `${it.varianceQty > 0 ? '+' : ''}${fmt(it.varianceQty)}`}
                            </td>
                            <td className={`p-2.5 font-mono font-bold ${it.varianceCost === 0 ? 'text-slate-400' : it.varianceCost > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(it.varianceCost)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-extrabold">
                          <td className="p-2.5">الإجمالي</td>
                          <td className="tnum text-left p-2.5">{fmt(totalTheoretical)}</td>
                          <td className="tnum text-left p-2.5">{fmt(totalActual)}</td>
                          <td className="tnum text-left p-2.5">{fmt(totalActual - totalTheoretical)}</td>
                          <td className={`p-2.5 font-mono ${c.totalVarianceCost >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(c.totalVarianceCost)} ر.س</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'expiry' && (() => {
        const scoped = filteredInv.filter((i) => i.expiryDate);
        const daysLeft = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
        const expired = scoped.filter((i) => daysLeft(i.expiryDate!) <= 0);
        const near = scoped.filter((i) => { const d = daysLeft(i.expiryDate!); return d > 0 && d <= 14; });
        const safe = scoped.filter((i) => daysLeft(i.expiryDate!) > 14);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف بتاريخ صلاحية</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{scoped.length}</strong></div>
              <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs"><span className="text-rose-500 text-[11px] block">منتهية الصلاحية</span><strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{expired.length}</strong></div>
              <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">تنتهي خلال 14 يوم</span><strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{near.length}</strong></div>
              <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">سليمة الصلاحية</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{safe.length}</strong></div>
            </div>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-slate-100">
                <p className="text-xs font-extrabold text-slate-700 flex items-center gap-2"><Clock4 className="w-4 h-4 text-brand-500" /> تتبع الصلاحية حسب الدفعات (batchNumber / expiryDate)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr><th className="p-3">المادة</th><th className="p-3">الفرع</th><th className="p-3">الكمية</th><th className="p-3">الدفعة</th><th className="p-3">تاريخ الانتهاء</th><th className="p-3">الأيام المتبقية</th><th className="p-3">الحالة</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...scoped].sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '')).map((i) => {
                      const d = daysLeft(i.expiryDate!);
                      const badge = d <= 0 ? { t: 'منتهية', c: 'bg-rose-100 text-rose-700' } : d <= 7 ? { t: 'حرج', c: 'bg-rose-50 text-rose-600 border border-rose-200' } : d <= 14 ? { t: 'قريبة', c: 'bg-amber-100 text-amber-700' } : { t: 'سليمة', c: 'bg-emerald-100 text-emerald-700' };
                      return (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{getRawMaterialName(i.rawMaterialId)}</td>
                      <td className="p-3 text-slate-600">{getBranchName(i.branchId)}</td>
                          <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmt(i.quantity)}</td>
                          <td className="tnum text-left p-3 text-brand-700">{i.batchNumber || '—'}</td>
                          <td className="tnum text-left p-3 text-slate-600">{i.expiryDate}</td>
                          <td className={`p-3 font-mono font-extrabold ${d <= 0 ? 'text-rose-700' : d <= 14 ? 'text-amber-700' : 'text-emerald-700'}`}>{d <= 0 ? `منتهية منذ ${Math.abs(d)} يوم` : `${d} يوم`}</td>
                          <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span></td>
                        </tr>
                      );
                    })}
                    {scoped.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-bold">لا توجد أصناف مسجلة بتاريخ صلاحية — تُسجل تواريخ الانتهاء تلقائياً عند استلام دفعات جديدة (GRN)</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Transfer modal */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="تحويل مخزون بين الفروع" wide>
        <form onSubmit={submitTransfer} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="من فرع"><select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} className={inputCls}>{visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
            <Field label="إلى فرع"><select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className={inputCls}>{visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
          </div>
          {fromBranch === toBranch && <p className="text-[10px] font-bold text-rose-600">يجب اختيار فرعين مختلفين</p>}
          <div className="space-y-2">
            {transferItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 items-end">
                <AutocompleteSelect
                  value={item.rawMaterialId}
                  onChange={(val) => setTransferItems(transferItems.map((it, i) => (i === idx ? { ...it, rawMaterialId: val } : it)))}
                  options={rawMaterials.filter(m => m.isActive).map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                  getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                  placeholder="— اختر مادة خام —"
                  className="w-full"
                />
                <div className="flex items-center gap-1">
                  <input type="number" min="0" step="any" data-nav value={item.quantity || ''} onChange={(e) => setTransferItems(transferItems.map((it, i) => (i === idx ? { ...it, quantity: parseFloat(e.target.value) || 0 } : it)))} onKeyDown={navOnEnter} className={inputCls} placeholder="الكمية" />
                  <button type="button" onClick={() => setTransferItems(transferItems.filter((_, i) => i !== idx))} className="text-rose-500 p-1">✕</button>
                </div>
                <p className="col-span-2 text-[10px] font-bold text-brand-600">متوسط سعر الوحدة: {fmt(getAverageUnitCost(item.rawMaterialId))} ر.س</p>
              </div>
            ))}
          </div>
          <Btn onClick={() => setTransferItems([...transferItems, { rawMaterialId: rawMaterials[0]?.id || '', quantity: 0 }])}><Plus className="w-3.5 h-3.5" /> صنف إضافي</Btn>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowTransfer(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">تنفيذ التحويل</button>
          </div>
        </form>
      </Modal>

      {/* Count modal */}
      <Modal open={showCount} onClose={() => setShowCount(false)} title={`جرد فعلي للمخزون — ${getBranchName(countBranch)} (${rawMaterials.length} صنف)`} wide>
        <form onSubmit={submitCount} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع"><select value={countBranch} onChange={(e) => setCountBranch(e.target.value)} className={inputCls}>{visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
            <Field label="قام بالجرد"><input value={countedBy} onChange={(e) => setCountedBy(e.target.value)} className={inputCls} /></Field>
          </div>
          <p className="text-[10px] font-bold text-slate-500">جميع الأصناف محمّلة ({rawMaterials.length}). أعدّل كميات "الجرد الفعلي" فقط ثم اعتمد الجرد. القيمة الافتراضية = الرصيد النظري الحالي.</p>
          <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                <tr>
                  <th className="p-2">الكود</th><th className="p-2">الصنف</th><th className="p-2">الوحدة</th>
                  <th className="p-2">المتاح النظري</th><th className="p-2">الجرد الفعلي</th><th className="p-2">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rawMaterials.map((m) => {
                  const theoretical = theoreticalOf(m.id);
                  const actual = parseFloat(countValues[m.id] || '') || 0;
                  const variance = actual - theoretical;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="tnum text-left p-2 font-bold text-brand-700">{m.code}</td>
                      <td className="p-2 font-bold text-slate-800">{m.nameAr}</td>
                      <td className="p-2 text-slate-500">{m.unit}</td>
                      <td className="tnum text-left p-2 text-slate-600">{fmt(theoretical)}</td>
                      <td className="p-2">
                        <input type="number" min="0" step="any" data-nav value={countValues[m.id] !== undefined ? countValues[m.id] : ''}
                          onChange={(e) => setCountValues({ ...countValues, [m.id]: e.target.value })}
                          onKeyDown={navOnEnter} className={inputCls + ' !w-28 !h-8'} />
                      </td>
                      <td className={`p-2 font-mono font-bold ${variance < 0 ? 'text-amber-700' : variance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{fmt(variance, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCount(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">اعتماد الجرد</button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit item modal */}
      <Modal open={showItemModal} onClose={() => setShowItemModal(false)} title={editingId ? `تعديل الصنف: ${itemForm.nameAr}` : 'إضافة صنف جديد'} wide>
        <form onSubmit={submitItem} className="space-y-3 text-xs">
          {editingId && (
            <Field label="الكود">
              <input type="text" value={itemForm.code} onChange={(e) => setF({ code: e.target.value })} className={inputCls} />
            </Field>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الاسم العربي" required>
              <input type="text" value={itemForm.nameAr} onChange={(e) => setF({ nameAr: e.target.value })} className={inputCls} placeholder="مثال: دجاج طازج" required />
            </Field>
            <Field label="الاسم الإنجليزي">
              <input type="text" value={itemForm.nameEn} onChange={(e) => setF({ nameEn: e.target.value })} className={inputCls} placeholder="Fresh Chicken" />
            </Field>
            <Field label="التصنيف">
              <select value={itemForm.category} onChange={(e) => setF({ category: e.target.value as RawMaterial['category'] })} className={inputCls}>
                {Object.entries(allCategoryLabels(materialCategories)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="وحدة القياس">
              <input type="text" value={itemForm.unit} onChange={(e) => setF({ unit: e.target.value })} className={inputCls} placeholder="كغم / لتر / عبوة" />
            </Field>
            <Field label="سعر الوحدة (ر.س)">
              <input type="number" min="0" step="0.01" value={itemForm.standardPrice || ''} onChange={(e) => setF({ standardPrice: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="حد أدنى للمخزون">
              <input type="number" min="0" step="0.01" value={itemForm.minStockLevel || ''} onChange={(e) => setF({ minStockLevel: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="حد أقصى للمخزون">
              <input type="number" min="0" step="0.01" value={itemForm.maxStockLevel || ''} onChange={(e) => setF({ maxStockLevel: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="نقطة إعادة الطلب">
              <input type="number" min="0" step="0.01" value={itemForm.reorderPoint || ''} onChange={(e) => setF({ reorderPoint: parseFloat(e.target.value) || 0 })} className={inputCls} placeholder="مثال: 30" />
            </Field>
            <Field label="مهلة التوريد (أيام)">
              <input type="number" min="0" step="1" value={itemForm.leadTimeDays || ''} onChange={(e) => setF({ leadTimeDays: parseInt(e.target.value, 10) || 0 })} className={inputCls} placeholder="مثال: 5" />
            </Field>
            <Field label="نسبة الإنتاجية %">
              <input type="number" min="1" max="100" value={itemForm.yieldPercentage || ''} onChange={(e) => setF({ yieldPercentage: parseFloat(e.target.value) || 100 })} className={inputCls} />
            </Field>
            <Field label="التخزين">
              <select value={itemForm.storageType} onChange={(e) => setF({ storageType: e.target.value as RawMaterial['storageType'] })} className={inputCls}>
                <option value="frozen">مجمد</option><option value="chilled">مبرد</option><option value="dry">جاف</option>
              </select>
            </Field>
            <Field label="المورد الرئيسي">
              <select value={itemForm.supplierId} onChange={(e) => setF({ supplierId: e.target.value })} className={inputCls}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {suppliers.length === 0 && <option value="">لا يوجد موردون</option>}
              </select>
            </Field>
            <Field label="وحدة الشراء">
              <input type="text" value={itemForm.purchaseUnit || ''} onChange={(e) => setF({ purchaseUnit: e.target.value })} className={inputCls} placeholder="مثال: صندوق / كرتون" />
            </Field>
            <Field label="سعر وحدة الشراء (ر.س)">
              <input type="number" min="0" step="0.01" value={itemForm.purchaseUnitPrice || ''} onChange={(e) => setF({ purchaseUnitPrice: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="معامل التحويل (وحدة شراء =؟)">
              <input type="number" min="0" step="0.01" value={itemForm.purchaseUnitConversion || ''} onChange={(e) => setF({ purchaseUnitConversion: parseFloat(e.target.value) || 1 })} className={inputCls} placeholder="مثال: 10 كغم لكل صندوق" />
            </Field>
            <Field label="وحدة التداول في الوصفات (القياسية)">
              <select
                value={itemForm.tradeUomId}
                onChange={(e) => {
                  const u = unitsOfMeasure.find((x) => x.id === e.target.value);
                  setF({ tradeUomId: u ? u.id : '', tradeUomName: u ? u.nameAr : '' });
                }}
                className={inputCls}
              >
                <option value="">— بدون (وحدة المخزون هي وحدة التداول) —</option>
                {unitsOfMeasure.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.nameAr} ({u.code})</option>)}
              </select>
            </Field>
            <Field label="معامل خاص للصنف (1 وحدة مخزون = ؟)">
              <input type="number" min="0" step="0.001" value={itemForm.tradeUomConversion || ''} onChange={(e) => setF({ tradeUomConversion: parseFloat(e.target.value) || 0 })} className={inputCls} placeholder="مثال: زجاجة زيت = 0.7 لتر" />
            </Field>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setF({ isActive: e.target.checked })} className="accent-brand-600 w-4 h-4" />
            الصنف نشط (متاح للاستخدام في الوصفات والشراء)
          </label>

          {/* باركود section — باركود متعدد حسب المورد/التعبئة */}
          {editingId && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-brand-600" />
                <h4 className="font-bold text-slate-800 text-sm">الباركودات ({itemBarcodes.length})</h4>
                <p className="text-[10px] text-slate-400">نفس المنتج قد يُورد من أكثر من مورد وكل مورد له باركود مختلف</p>
              </div>
              {itemBarcodes.length === 0 && (
                <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2">لا توجد باركودات — أضف باركود المورد الموجود على العبوة ليسهل مسحه في الاستلام والجرد.</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-200 text-right">
                      <th className="py-1.5 px-2 font-bold">الباركود</th>
                      <th className="py-1.5 px-2 font-bold">المورد</th>
                      <th className="py-1.5 px-2 font-bold">التعبئة</th>
                      <th className="py-1.5 px-2 font-bold">وحدات بالعبوة</th>
                      <th className="py-1.5 px-2 font-bold">أساسي</th>
                      <th className="py-1.5 px-2 font-bold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemBarcodes.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="tnum py-1.5 px-2 font-bold text-brand-700 dir-ltr text-left">{b.barcode}</td>
                        <td className="py-1.5 px-2">{b.supplierId ? (suppliers.find((s) => s.id === b.supplierId)?.name || '—') : 'عام'}</td>
                        <td className="py-1.5 px-2 text-slate-600">{b.packagingLevel === 'unit' ? 'وحدة' : b.packagingLevel === 'carton' ? 'كرتون' : b.packagingLevel === 'pallet' ? 'باليت' : 'مخصص'}</td>
                        <td className="tnum text-left py-1.5 px-2">{b.packagingQty || '—'}</td>
                        <td className="py-1.5 px-2">
                          <button type="button" onClick={() => updateMaterialBarcode(b.id, { isPrimary: !b.isPrimary })} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.isPrimary ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}>
                            {b.isPrimary ? 'الافتراضي' : 'جعله أساسي'}
                          </button>
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => startEditBarcode(b)} className="p-1 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="تعديل"><Pencil className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => deleteMaterialBarcode(b.id)} className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form onSubmit={submitBarcode} className="bg-slate-50 rounded-lg p-2.5 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <Field label={bcEditId ? 'تعديل الباركود' : 'إضافة باركود'} required>
                  <input type="text" value={bcForm.barcode} onChange={(e) => setBc({ barcode: e.target.value })} className={inputCls + ' dir-ltr'} placeholder="مثال: 6291041500213" />
                </Field>
                <Field label="المورد">
                  <select value={bcForm.supplierId} onChange={(e) => setBc({ supplierId: e.target.value })} className={inputCls}>
                    <option value="">عام (كل الموردين)</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="التعبئة">
                    <select value={bcForm.packagingLevel} onChange={(e) => setBc({ packagingLevel: e.target.value as MaterialBarcode['packagingLevel'] })} className={inputCls}>
                      <option value="unit">وحدة</option>
                      <option value="carton">كرتون</option>
                      <option value="pallet">باليت</option>
                      <option value="custom">مخصص</option>
                    </select>
                  </Field>
                  <Field label="وحدات بالعبوة">
                    <input type="number" min="0" step="any" value={bcForm.packagingQty || ''} onChange={(e) => setBc({ packagingQty: parseFloat(e.target.value) || 0 })} className={inputCls} placeholder="مثال: 24" />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-2 md:col-span-3">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={bcForm.isPrimary} onChange={(e) => setBc({ isPrimary: e.target.checked })} className="accent-brand-600 w-3.5 h-3.5" />
                    باركود افتراضي (للطباعة والبحث السريع)
                  </label>
                  <div className="flex items-center gap-2">
                    {bcEditId && (
                      <button type="button" onClick={() => { setBcForm(emptyBcForm()); setBcEditId(null); setBcError(''); }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-600">إلغاء التعديل</button>
                    )}
                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {bcEditId ? 'حفظ الباركود' : 'إضافة الباركود'}
                    </button>
                  </div>
                </div>
                {bcError && <p className="text-rose-600 text-[10px] font-bold md:col-span-3">{bcError}</p>}
              </form>
            </div>
          )}
          {!editingId && (
            <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg p-2">احفظ الصنف أولاً ثم عدّل عليه لإضافة الباركودات (كل مورد له باركود مختلف).</p>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowItemModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">{editingId ? 'حفظ التعديلات' : 'إضافة الصنف'}</button>
          </div>
        </form>
      </Modal>

      {/* Import materials from Excel */}
      <ImportExcelModal
        open={showImport}
        onClose={() => setShowImport(false)}
        columns={MATERIAL_IMPORT_COLUMNS}
        title="استيراد الأصناف من Excel"
        subtitle="اختر ملف Excel يحتوي على أصناف (المواد الخام) — يُضاف الجديد ويُحدَّث الموجود تلقائياً حسب الكود أو الاسم."
        templateName="قالب_الأصناف"
        existingCodes={rawMaterials.map((m) => m.code)}
        codeKey="code"
        onImport={(records) => { importRawMaterials(records); }}
      />

      {/* QR Label Modal (بند 57) */}
      {qrTarget && (
        <Modal open={!!qrTarget} title="ملصق QR للصنف" onClose={() => { setQrTarget(null); setQrDataUrl(''); }} wide>
          <div className="text-center space-y-4">
            {(() => {
              const mat = rawMaterials.find((m) => m.id === qrTarget!.rawMaterialId);
              const branchName = getBranchName(qrTarget!.branchId);
              if (!mat) return <p className="text-rose-600">الصنف غير موجود</p>;
              const payload = qrPayloadOf(mat, qrTarget!.branchId);
              return (
                <div>
                  <h4 className="font-black text-slate-800">{mat.nameAr}</h4>
                  <p className="text-slate-500 text-sm">{branchName} · {mat.unit}</p>
                  <div className="inline-block bg-white p-4 rounded-xl border border-slate-200">
                    {qrDataUrl ? <img src={qrDataUrl} alt="QR" width="256" height="256" /> : <div className="w-64 h-64 mx-auto flex items-center justify-center text-slate-400">جارٍ التوليد…</div>}
                  </div>
                  <div className="max-w-md mx-auto bg-slate-50 rounded-xl p-3 text-left">
                    <p className="text-[10px] text-slate-400 font-bold mb-1">محتوى QR (يظهر لأي قارئ):</p>
                    <p className="text-[11px] text-slate-600 font-[family-name:var(--font-sans)] whitespace-pre-line leading-relaxed">{payload}</p>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <label className="text-xs font-extrabold text-slate-700">عدد الملصقات:</label>
                    <input type="number" min={1} max={2000} value={qrCount}
                      onChange={(e) => setQrCount(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-center" />
                    <Btn onClick={() => { void printQrLabels(); }}><Printer className="w-4 h-4" /> طباعة {qrCount} ملصق QR</Btn>
                  </div>
                  <p className="text-[10px] text-slate-400">أي قارئ QR (كاميرا الهاتف) يعرض الآن اسم الصنف والوحدة والفرع بدلاً من كود خام.</p>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* QR Scanner Modal (بند 57) */}
      <Modal title="مسح QR — فتح البطاقة الفنية" open={scanning} onClose={() => { setScanning(false); setScanResult(''); }}>
        <div className="space-y-3 text-center">
          <div className="bg-slate-100 rounded-xl aspect-square flex items-center justify-center">
            <Scan className="w-16 h-16 text-slate-400" />
          </div>
          <p className="text-[11px] text-slate-500">للمسح، افتح كاميرا الهاتف ووجّهها لملصق QR على الصنف</p>
          {scanResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="font-bold text-emerald-800">تم التعرف: <span className="font-mono">{scanResult}</span></p>
              <div className="mt-2 flex gap-2 justify-center">
                <Btn onClick={() => { setScanning(false); setScanResult(''); }}>تم</Btn>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};