import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, Printer, FileSpreadsheet, Save, RotateCcw, Search, CheckSquare, Square, ShoppingCart, Upload, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, SectionHeader, Modal } from '../ui';
import { fmt, fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { readExcelFile, downloadTemplate, parseNum } from '../../utils/excel';
import { lastSupplierIdFor } from '../../business/purchaseRequests';

export const BranchStockLimitsView: React.FC = () => {
  const {
    branches, rawMaterials, visibleBranchIds, inventory, branchStockLimits,
    getStockLevelsFor, upsertBranchStockLimit, removeBranchStockLimit,
    getBranchName, getAverageUnitCost, suppliers, addPurchaseOrder, showToast, grnNotes,
  } = useApp();

  const [branchId, setBranchId] = useState(visibleBranchIds[0] || '');
  const [search, setSearch] = useState('');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'needsOrder'>('code');
  const [importModal, setImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const downloadImportTemplate = () => {
    downloadTemplate(`قالب_حدود_المخزون_${getBranchName(branchId)}`, ['الكود', 'الحد الأدنى', 'الحد الأقصى', 'طلب كامل (نعم/لا)'], [
      ['RM-001', 10, 50, 'لا'],
      ['RM-002', 5, 20, 'نعم'],
    ]);
  };

  const handleImport = async () => {
    if (!importFile) { showToast('اختر ملف Excel أو CSV أولاً'); return; }
    try {
      const sheets = await readExcelFile(importFile);
      const rowsData = sheets[0]?.rows || [];
      let imported = 0;
      for (const row of rowsData) {
        const code = parseStr(row['الكود'] || row['Code'] || row['code'] || '');
        const min = parseNum(row['الحد الأدنى'] || row['Min'] || row['min'] || 0);
        const max = parseNum(row['الحد الأقصى'] || row['Max'] || row['max'] || 0);
        const fullMaxStr = parseStr(row['طلب كامل (نعم/لا)'] || row['FullMax'] || row['fullmax'] || 'لا').toLowerCase();
        const alwaysOrderFullMax = fullMaxStr === 'نعم' || fullMaxStr === 'yes' || fullMaxStr === 'true' || fullMaxStr === '1';
        const mat = rawMaterials.find((m) => m.code === code || m.id === code);
        if (!mat) continue;
        upsertBranchStockLimit(branchId, mat.id, { minStockLevel: min, maxStockLevel: max, alwaysOrderFullMax });
        imported++;
      }
      showToast(`تم استيراد ${imported} صنف من ملف Excel`);
      setImportModal(false);
      setImportFile(null);
    } catch (e: unknown) {
      showToast('خطأ في قراءة الملف: ' + (e instanceof Error ? e.message : 'تنسيق غير صالح'));
    }
  };

  const parseStr = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  };
  const branchQtyOf = (matId: string) =>
    inventory.filter((i) => i.branchId === branchId && i.rawMaterialId === matId).reduce((s, i) => s + i.quantity, 0);

  // صفوف الشاشة: كل الأصناف النشطة مع حدود الفرع الفعلية
  const rows = useMemo(() => {
    return rawMaterials
      .filter((m) => m.isActive)
      .map((m) => {
        const levels = getStockLevelsFor(m.id, branchId);
        const qty = branchQtyOf(m.id);
        // منطق الطلب:
        // - صنف "طلب كامل": يُطلب كامل الحد الأقصى دائماً دون النظر للرصيد
        // - عادي: عند الوصول للحد الأدنى يُطلب (الحد الأقصى - الرصيد)
        const needsOrder = levels.alwaysOrderFullMax ? true : qty <= levels.minStockLevel;
        const suggestedQty = levels.alwaysOrderFullMax ? Math.max(0, levels.maxStockLevel) : Math.max(0, levels.maxStockLevel - qty);
        return { mat: m, ...levels, qty, needsOrder, suggestedQty, value: suggestedQty * getAverageUnitCost(m.id) };
      })
      .filter((r) => !search || r.mat.nameAr.includes(search) || r.mat.code.includes(search.toUpperCase()) || r.mat.nameEn.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => !onlyOverrides || r.isOverride || r.alwaysOrderFullMax)
      .sort((a, b) => {
      if (sortBy === 'needsOrder') return Number(b.needsOrder) - Number(a.needsOrder) || a.mat.code.localeCompare(b.mat.code, undefined, { numeric: true });
      if (sortBy === 'name') return a.mat.nameAr.localeCompare(b.mat.nameAr);
      return a.mat.code.localeCompare(b.mat.code, undefined, { numeric: true });
    });
  }, [rawMaterials, branchId, search, onlyOverrides, inventory, branchStockLimits, sortBy]);

  const overrideCount = rawMaterials.filter((m) => getStockLevelsFor(m.id, branchId).isOverride).length;
  const fullMaxCount = rawMaterials.filter((m) => getStockLevelsFor(m.id, branchId).alwaysOrderFullMax).length;
  const belowMinCount = rows.filter((r) => r.needsOrder && !r.alwaysOrderFullMax && r.qty <= r.minStockLevel).length;
  const totalSuggestedValue = rows.reduce((s, r) => s + r.value, 0);
  const orderRows = rows.filter((r) => r.needsOrder && r.suggestedQty > 0);

  // توليد أوامر شراء تلقائية: الطلب طبقاً للحد الأقصى
  // - عادي: عند الوصول للحد الأدنى أو أقل → (الحد الأقصى − الرصيد)
  // - مستثنى (طلب كامل): كامل كمية الحد الأقصى دون النظر للرصيد
  const createPurchaseOrders = () => {
    if (orderRows.length === 0) { showToast('لا توجد أصناف تحتاج طلباً لهذا الفرع حالياً'); return; }
    const bySupplier: Record<string, typeof orderRows> = {};
    orderRows.forEach((r) => {
      const sid = lastSupplierIdFor(grnNotes, r.mat.id, r.mat.supplierId) || suppliers[0]?.id || '';
      (bySupplier[sid] = bySupplier[sid] || []).push(r);
    });
    const date = new Date().toISOString().split('T')[0];
    Object.entries(bySupplier).forEach(([sid, items]) => {
      const supplier = suppliers.find((s) => s.id === sid);
      const poItems = items.map((r) => {
        const conv = r.mat.purchaseUnitConversion || 1;
        const usePU = conv > 1 && !!r.mat.purchaseUnit && !!r.mat.purchaseUnitPrice;
        const purchaseQty = Math.ceil(r.suggestedQty / conv);
        return {
          rawMaterialId: r.mat.id, materialName: r.mat.nameAr,
          quantity: usePU ? purchaseQty * conv : r.suggestedQty, unit: r.mat.unit,
          purchaseUnit: usePU ? r.mat.purchaseUnit : undefined,
          purchaseUnitConversion: usePU ? conv : undefined,
          purchaseQty: usePU ? purchaseQty : undefined,
          unitPrice: usePU ? (r.mat.purchaseUnitPrice || r.mat.standardPrice) : r.mat.standardPrice,
          lineTotal: usePU ? purchaseQty * (r.mat.purchaseUnitPrice || 0) : r.suggestedQty * r.mat.standardPrice,
        };
      });
      addPurchaseOrder({
        supplierId: sid, supplierName: supplier?.name || sid, branchId, orderDate: date,
        expectedDate: date, status: 'submitted', items: poItems,
        totalAmount: poItems.reduce((s, i) => s + i.lineTotal, 0),
        requestedBy: 'حدود المخزون التلقائية',
        notes: `طلب تلقائي حتى الحد الأقصى — فرع ${getBranchName(branchId)}`,
      });
    });
    showToast(`تم إنشاء ${Object.keys(bySupplier).length} أمر شراء لـ ${orderRows.length} صنف — فرع ${getBranchName(branchId)}`);
  };

  const exportCsv = () => downloadCSV(`حدود_المخزون_${getBranchName(branchId)}.csv`,
    ['الكود', 'الصنف', 'الوحدة', 'الرصيد الحالي', 'الحد الأدنى', 'الحد الأقصى', 'طلب كامل؟', 'يحتاج طلب؟', 'الكمية المقترحة'],
    rows.map((r) => [r.mat.code, r.mat.nameAr, r.mat.unit, r.qty, r.minStockLevel, r.maxStockLevel, r.alwaysOrderFullMax ? 'نعم' : 'لا', r.needsOrder ? 'نعم' : 'لا', r.suggestedQty]));

  const printLimits = () => openPrintWindow({
    title: `حدود المخزون — ${getBranchName(branchId)}`,
    subtitle: 'الحد الأدنى والأقصى وكميات الطلب المقترحة',
    meta: [['الفرع', getBranchName(branchId)], ['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['عدد الأصناف', `${rows.length}`]],
    tables: [{
      title: 'حدود المخزون والطلب المقترح',
      header: ['الكود', 'الصنف', 'الوحدة', 'الرصيد', 'حد أدنى', 'حد أقصى', 'الحالة', 'المقترح طلبه'],
      rows: rows.map((r) => [
        r.mat.code, r.mat.nameAr, r.mat.unit, fmt(r.qty), fmt(r.minStockLevel), fmt(r.maxStockLevel),
        r.alwaysOrderFullMax ? 'طلب كامل (مستثنى)' : r.qty <= r.minStockLevel ? 'تحت الحد الأدنى' : 'طبيعي',
        r.needsOrder ? `${fmt(r.suggestedQty)} ${r.mat.unit}` : '—',
      ]),
    }],
    totals: [['إجمالي قيمة الطلب المقترح', fmtMoney(totalSuggestedValue)]],
    footer: 'RestoCost ERP — شاشة حدود المخزون للفروع',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="حدود المخزون للفروع (الأدنى والأقصى)"
        subtitle="لكل فرع حد أدنى وأقصى مختلف لكل صنف — الطلب يتم حتى الحد الأقصى عند وصول الرصيد للحد الأدنى، ويمكن استثناء أصناف لتُطلب بالكمية القصوى كاملة دون النظر للرصيد"
        icon={<SlidersHorizontal className="w-6 h-6 text-brand-600" />}
        actions={<>
          <Btn onClick={exportCsv}><FileSpreadsheet className="w-4 h-4" /> تصدير CSV</Btn>
          <Btn onClick={() => setImportModal(true)}><Upload className="w-4 h-4" /> استيراد من Excel</Btn>
          <Btn onClick={downloadImportTemplate}><Download className="w-4 h-4" /> قالب استيراد</Btn>
          <Btn tone="dark" onClick={printLimits}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
          <Btn tone="primary" onClick={createPurchaseOrders}><ShoppingCart className="w-4 h-4" /> إنشاء أوامر شراء ({orderRows.length})</Btn>
        </>} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف تحت الحد الأدنى</span>
          <strong className="text-lg font-extrabold font-mono text-rose-600 block mt-1">{belowMinCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف بحدود مخصصة لهذا الفرع</span>
          <strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{overrideCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">أصناف "طلب كامل" (مستثناة)</span>
          <strong className="text-lg font-extrabold font-mono text-amber-600 block mt-1">{fullMaxCount}</strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة الطلب المقترح</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmtMoney(totalSuggestedValue)}</strong>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="الفرع (تُعرض وتُعدَّل حدود هذا الفرع فقط)">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls + ' !w-64'}>
            {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' pr-8 !w-52'} placeholder="اسم الصنف أو الكود" />
          </div>
        </Field>
        <Field label="الترتيب">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'code' | 'name' | 'needsOrder')} className={inputCls + ' !w-40'}>
            <option value="code">بالكود</option>
            <option value="name">بالاسم</option>
            <option value="needsOrder">بالحاجة للطلب</option>
          </select>
        </Field>
        <button onClick={() => setOnlyOverrides((v) => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition-colors ${onlyOverrides ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          {onlyOverrides ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          المخصص فقط
        </button>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50/60">
          <SectionHeader
            title={`حدود ${getBranchName(branchId)}`}
            subtitle="عدّل الحد الأدنى/الأقصى مباشرة — التغيير يُحفظ تلقائياً لهذا الفرع. زر ⟲ يعيد الافتراضي العام."
            icon={<SlidersHorizontal className="w-5 h-5 text-brand-500" />} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[1100px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">الكود</th><th className="p-3">الصنف</th><th className="p-3">الوحدة</th>
                <th className="p-3">الرصيد الحالي</th>
                <th className="p-3 bg-brand-50">الحد الأدنى</th>
                <th className="p-3 bg-brand-50">الحد الأقصى</th>
                <th className="p-3 bg-amber-50">طلب كامل (استثناء)</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الكمية المقترحة</th>
                <th className="p-3">قيمة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.mat.id} className={`hover:bg-slate-50 ${r.needsOrder ? 'bg-rose-50/40' : ''}`}>
                  <td className="tnum text-left p-3 text-brand-700">{r.mat.code}</td>
                  <td className="p-3 font-bold text-slate-900">
                    {r.mat.nameAr}
                    {(r.isOverride || r.alwaysOrderFullMax) && (
                      <span className="ml-1 text-[9px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">مخصص</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-500">{r.mat.unit}</td>
                  <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmt(r.qty)}</td>
                  <td className="p-3 bg-brand-50/30">
                    <input type="number" min="0" step="any" value={r.minStockLevel || ''}
                      onChange={(e) => upsertBranchStockLimit(branchId, r.mat.id, { minStockLevel: parseFloat(e.target.value) || 0 })}
                      className={inputCls + ' !w-24 !h-8'} />
                  </td>
                  <td className="p-3 bg-brand-50/30">
                    <input type="number" min="0" step="any" value={r.maxStockLevel || ''}
                      onChange={(e) => upsertBranchStockLimit(branchId, r.mat.id, { maxStockLevel: parseFloat(e.target.value) || 0 })}
                      className={inputCls + ' !w-24 !h-8'} />
                  </td>
                  <td className="p-3 bg-amber-50/30 text-center">
                    <button
                      onClick={() => upsertBranchStockLimit(branchId, r.mat.id, { alwaysOrderFullMax: !r.alwaysOrderFullMax })}
                      title="استثناء من منطق الحد الأدنى: يُطلب كامل الحد الأقصى دون النظر للرصيد"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] transition-colors ${r.alwaysOrderFullMax ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-amber-100'}`}>
                      {r.alwaysOrderFullMax ? '✓ طلب كامل' : 'عادي'}
                    </button>
                  </td>
                  <td className="p-3">
                    {r.alwaysOrderFullMax ? (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">طلب دوري كامل</span>
                    ) : r.qty <= r.minStockLevel ? (
                      <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">تحت الأدنى</span>
                    ) : (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">آمن</span>
                    )}
                  </td>
                  <td className="tnum text-left p-3 font-extrabold text-brand-700">
                    {r.needsOrder ? `${fmt(r.suggestedQty)} ${r.mat.unit}` : '—'}
                  </td>
                  <td className="tnum text-left p-3 text-slate-600">{r.needsOrder ? fmtMoney(r.value) : '—'}</td>
                  <td className="p-3">
                    {r.isOverride || r.alwaysOrderFullMax ? (
                      <button onClick={() => removeBranchStockLimit(branchId, r.mat.id)}
                        title="إعادة الافتراضي العام وإلغاء الاستثناء"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 text-[11px] text-slate-600 space-y-1">
        <p className="font-extrabold text-slate-800 flex items-center gap-1"><Save className="w-3.5 h-3.5" /> كيف يعمل النظام:</p>
        <p>• <b>العادي:</b> عند وصول رصيد الصنف إلى الحد الأدنى، تظهر تنبيهات نقص بكمية مقترحة = <b>(الحد الأقصى − الرصيد)</b>.</p>
        <p>• <b>طلب كامل (استثناء):</b> الأصناف المستثناة تظهر دائماً في التنبيهات بكمية = <b>كامل الحد الأقصى</b> دون النظر إلى الرصيد المتاح.</p>
        <p>• <b>إنشاء أوامر شراء:</b> زر «إنشاء أوامر شراء» يولّد أوامر شراء فعلياً للأصناف المحتاجة مجمّعة حسب المورد، بالكميات المقترحة وبوحدة الشراء.</p>
        <p>• كل فرع يحتفظ بحدوده الخاصة؛ إن لم تخصص حداً للفرع يستخدم الافتراضي العام المعرّف في بطاقة الصنف.</p>
      </Card>

      <Modal open={importModal} onClose={() => setImportModal(false)} title="استيراد حدود المخزون من Excel / CSV" wide>
        <div className="space-y-4 text-xs">
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
            <p className="font-bold text-brand-950">تعليمات الاستيراد:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-slate-700">
              <li>الملف يجب أن يحتوي على الأعمدة: <b>الكود</b>، <b>الحد الأدنى</b>، <b>الحد الأقصى</b>، <b>طلب كامل (نعم/لا)</b></li>
              <li>الكود يجب أن يطابق كود الصنف في النظام (مثال: RM-001)</li>
              <li>عمود "طلب كامل": اكتب "نعم" للأصناف التي تُطلب بالكمية القصوى كاملة، و"لا" للأصناف العادية</li>
              <li>الأصناف غير الموجودة في النظام سيتم تجاهلها</li>
            </ul>
          </div>
          <Field label="ملف Excel / CSV">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className={inputCls} />
          </Field>
          <div className="pt-2 flex justify-end gap-2">
            <button onClick={() => { setImportModal(false); setImportFile(null); }} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button onClick={handleImport} className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">استيراد وتطبيق</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
