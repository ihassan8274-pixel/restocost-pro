import React, { useState } from 'react';
import { Settings2, Printer, FileSpreadsheet, AlertTriangle, RotateCcw, Trash2, Check, FileDown, Loader2, DatabaseBackup, ArchiveRestore, HardDriveDownload, HardDriveUpload, KeyRound, ShieldCheck, ShieldOff, Boxes, Clock3, Banknote, ShoppingCart, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, SectionHeader } from '../ui';
import {
  downloadCSV, EXPENSE_CATEGORY_LABELS, MATERIAL_CATEGORY_LABELS,
  RESERVATION_STATUS_LABELS, INVOICE_STATUS_LABELS, PO_STATUS_LABELS, VAT_RATE, netOfGross,
} from '../../utils/helpers';
import { exportPDF } from '../../utils/pdf';
import { openPrintWindow } from '../../utils/print';

export const SystemCenterView: React.FC = () => {
  const {
    plSummaries, batchSalesRecords, operatingExpenses, wastageLogs, inventory, rawMaterials, recipes,
    suppliers, grnNotes, purchaseOrders, customers, reservations, invoices, shifts,
    getBranchName, getRawMaterialName, calculateRecipeCosts, can, clearSystemData,
    resetDemoData, currentUser, totpSetup, totpEnable, totpDisable,
    clearCollections, posOrders, posReturns, stockTransfers, recipeInventory, workOrders, employees,
    journalEntries, accounts, fixedAssets, monthlyInventory, foodMenus, dailyCounts,
    employeeMeals, productionRuns, attendance, payrollPeriods, scheduledReports, automationRules,
    openingBalances, physicalCounts, supplierQuotes, supplierReturns, expenseBudgets,
    inventoryMovements, customerOrders, deliverySales, branches, requisitions,
    getBranchAverageUnitCost,
  } = useApp();

  const [confirmAction, setConfirmAction] = useState<'clear' | 'reset' | null>(null);
  const [typedWord, setTypedWord] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [restorePreview, setRestorePreview] = useState<{ fileName: string; createdAt: string; createdBy?: string; counts: Record<string, number> } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const [totpOpen, setTotpOpen] = useState(false);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUrlText, setTotpUrlText] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const isAdmin = currentUser?.role === 'admin';
  const totpEnabled = !!currentUser?.totpEnabled;

  const openTotpSetup = async () => {
    setTotpMsg('');
    setTotpCode('');
    setTotpBusy(true);
    const res = await totpSetup();
    setTotpBusy(false);
    if (!res.ok) { setTotpMsg(`تعذر الإعداد: ${res.error}`); return; }
    setTotpSecret(res.secret || '');
    setTotpUrlText(res.otpauthUrl || '');
    setTotpOpen(true);
  };

  const submitTotp = async () => {
    setTotpMsg('');
    setTotpBusy(true);
    const res = totpEnabled ? await totpDisable(totpCode) : await totpEnable(totpCode);
    setTotpBusy(false);
    if (!res.ok) { setTotpMsg(res.error || 'فشل العملية'); return; }
    setTotpMsg(totpEnabled ? 'تم إيقاف المصادقة الثنائية.' : 'تم تفعيل المصادقة الثنائية بنجاح.');
    setTotpCode('');
    if (totpEnabled) { setTotpOpen(false); setTotpSecret(''); setTotpUrlText(''); }
  };

  const totalSales = plSummaries.reduce((s, p) => s + p.totalSales, 0);
  const totalFood = plSummaries.reduce((s, p) => s + p.foodCost, 0);
  const totalLabor = plSummaries.reduce((s, p) => s + p.laborCost, 0);
  const totalNet = plSummaries.reduce((s, p) => s + p.netProfit, 0);

  const exportables: { name: string; header: string[]; rows: (string | number)[][] }[] = [
    {
      name: 'ملخص الأداء',
      header: ['البند', 'القيمة'],
      rows: [
        ['إجمالي المبيعات', totalSales], ['تكلفة الطعام', totalFood], ['العمالة', totalLabor],
        ['صافي الربح', totalNet], ['نسبة Food Cost', totalSales ? (totalFood / totalSales) * 100 : 0],
      ],
    },
    {
      name: 'قائمة الدخل (P&L) حسب الفروع',
      header: ['الفرع', 'الفترة', 'المبيعات', 'تكلفة الطعام', 'العمالة', 'إجمالي التكلفة الأولية', 'التشغيلية', 'صافي الربح', 'هامش الصافي %'],
      rows: plSummaries.map((p) => [p.branchName, p.period, p.totalSales, p.foodCost, p.laborCost, p.primeCost, p.operatingExpenses, p.netProfit, p.netProfitPercent]),
    },
    {
      name: 'المبيعات اليومية',
      header: ['الدفعة', 'التاريخ', 'الفرع', 'الإجمالي (شامل الضريبة)', 'الصافي', 'الضريبة', 'تكلفة الطعام', 'نسبة FC % (على الصافي)'],
      rows: batchSalesRecords.map((b) => {
        const net = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
        const vat = b.vatAmount ?? (b.totalRevenue - net);
        return [b.batchNumber, b.date, b.branchName, b.totalRevenue, net, vat, b.totalFoodCost, net ? (b.totalFoodCost / net) * 100 : 0];
      }),
    },
    {
      name: 'المخزون',
      header: ['المادة', 'التصنيف', 'الفرع', 'الكمية', 'الوحدة', 'سعر الوحدة', 'القيمة'],
      rows: inventory.map((i) => {
        const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
        const uPrice = getBranchAverageUnitCost(i.branchId, i.rawMaterialId);
        return [getRawMaterialName(i.rawMaterialId), mat ? MATERIAL_CATEGORY_LABELS[mat.category] : '', i.branchId === 'b-ck' ? 'المطبخ المركزي' : i.branchId, i.quantity, mat?.unit || '', uPrice, (i.quantity * uPrice)];
      }),
    },
    {
      name: 'الوصفات المعيارية',
      header: ['الكود', 'الاسم', 'التصنيف', 'تكلفة الطعام', 'إجمالي التكلفة', 'سعر المنيو'],
      rows: recipes.map((r) => {
        const c = calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost);
        return [r.code, r.nameAr, r.category, c.foodCost, c.totalCost, r.actualMenuPrice || c.suggestedPrice];
      }),
    },
    {
      name: 'الموردون',
      header: ['الكود', 'الاسم', 'مسؤول التواصل', 'الهاتف', 'التقييم', 'شروط الدفع', 'الحالة'],
      rows: suppliers.map((s) => [s.code, s.name, s.contactPerson, s.phone, s.rating, `${s.paymentTermsDays} يوم`, s.isActive ? 'نشط' : 'موقوف']),
    },
    {
      name: 'أوامر الشراء',
      header: ['الرقم', 'المورد', 'التاريخ', 'الإجمالي', 'الحالة'],
      rows: purchaseOrders.map((p) => [p.poNumber, p.supplierName || p.supplierId, p.orderDate, p.totalAmount, PO_STATUS_LABELS[p.status] || p.status]),
    },
    {
      name: 'فواتير الاستلام (GRN)',
      header: ['الرقم', 'المورد', 'الفرع', 'التاريخ', 'الإجمالي', 'الحالة'],
      rows: grnNotes.map((g) => [g.grnNumber, g.supplierName || g.supplierId, g.branchId, g.date, g.totalAmount, g.status]),
    },
    {
      name: 'المصاريف التشغيلية',
      header: ['الرقم', 'التصنيف', 'الوصف', 'المبلغ', 'الاستحقاق', 'الحالة', 'التكرار'],
      rows: operatingExpenses.map((e) => [e.expenseNumber, EXPENSE_CATEGORY_LABELS[e.category], e.description, e.amount, e.dueDate, e.paymentStatus, e.recurrence]),
    },
    {
      name: 'الهوالك والفاقد',
      header: ['التاريخ', 'الصنف', 'الكمية', 'التصنيف', 'الأثر المالي', 'المسؤول', 'السبب'],
      rows: wastageLogs.map((w) => [w.date, w.itemName, `${w.quantity} ${w.unit}`, w.category, w.totalCostImpact, w.responsibleStaff, w.reason]),
    },
    {
      name: 'العملاء',
      header: ['الكود', 'الاسم', 'الهاتف', 'النوع', 'الفرع', 'الزيارات', 'إجمالي الإنفاق', 'VIP'],
      rows: customers.map((c) => [c.code, c.name, c.phone, c.type, getBranchName(c.branchId), c.visits, c.totalSpent, c.isVip ? 'نعم' : 'لا']),
    },
    {
      name: 'الحجوزات',
      header: ['الرقم', 'العميل', 'الهاتف', 'الضيوف', 'التاريخ', 'الوقت', 'الحالة'],
      rows: reservations.map((r) => [r.reservationNumber, r.customerName, r.phone, r.guests, r.date, r.time, RESERVATION_STATUS_LABELS[r.status] || r.status]),
    },
    {
      name: 'الفواتير',
      header: ['الرقم', 'النوع', 'الطرف', 'التاريخ', 'الإجمالي', 'المدفوع', 'الحالة'],
      rows: invoices.map((i) => [i.invoiceNumber, i.type === 'sales' ? 'مبيعات' : 'مشتريات', i.partyName, i.date, i.totalAmount, i.paidAmount, INVOICE_STATUS_LABELS[i.status] || i.status]),
    },
    {
      name: 'الموظفون والورديات',
      header: ['الموظف', 'الفرع', 'التاريخ', 'ساعات', 'إضافي', 'تكلفة الوردية'],
      rows: shifts.map((s) => [s.employeeName, getBranchName(s.branchId), s.date, s.hoursWorked, s.overtimeHours, s.totalShiftCost]),
    },
  ];

  const exportSingle = (x: { name: string; header: string[]; rows: (string | number)[][] }) => {
    downloadCSV(`${x.name}.csv`, x.header, x.rows);
    setExportMsg(`تم تصدير: ${x.name}`);
    setTimeout(() => setExportMsg(''), 2500);
  };

  const exportAll = () => {
    const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
    const parts: string[] = [];
    exportables.forEach((x) => {
      parts.push(`===== ${x.name} =====`);
      parts.push(x.header.map(escape).join(','));
      x.rows.forEach((r) => parts.push(r.map(escape).join(',')));
      parts.push('');
    });
    const blob = new Blob(["\uFEFF" + parts.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'RestoCost_All_Reports.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportMsg('تم تصدير جميع التقارير في ملف واحد');
    setTimeout(() => setExportMsg(''), 2500);
  };

  const exportPdfSingle = async (x: { name: string; header: string[]; rows: (string | number)[][] }) => {
    setPdfBusy(true);
    try {
      await exportPDF(`${x.name}.pdf`, [x], x.name);
      setExportMsg(`تم تصدير PDF: ${x.name}`);
    } catch {
      setExportMsg('تعذر تصدير PDF لهذا التقرير');
    } finally {
      setPdfBusy(false);
      setTimeout(() => setExportMsg(''), 2500);
    }
  };

  const exportPdfAll = async () => {
    setPdfBusy(true);
    try {
      await exportPDF('RestoCost_All_Reports.pdf', exportables);
      setExportMsg('تم تصدير جميع التقارير في ملف PDF واحد');
    } catch {
      setExportMsg('تعذر تصدير ملف PDF الشامل');
    } finally {
      setPdfBusy(false);
      setTimeout(() => setExportMsg(''), 2500);
    }
  };

  const canReset = can('reset_system');

  const doAction = () => {
    if (typedWord.trim() !== 'تأكيد') return;
    if (confirmAction === 'clear') { clearSystemData(); alert('تم تفريغ النظام من جميع البيانات.'); }
    if (confirmAction === 'reset') { resetDemoData(); alert('تمت إعادة تعيين البيانات التجريبية.'); }
    setConfirmAction(null);
    setTypedWord('');
  };

  const token = localStorage.getItem('rcerp_token');

  // ====== تفريغ محدد للبيانات (اختيار الجداول) ======
  const [clearSelection, setClearSelection] = useState<Set<string>>(new Set());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const clearGroups: { group: string; icon: React.ReactNode; options: { key: string; label: string; count: number; danger?: boolean }[] }[] = [
    {
      group: 'المبيعات', icon: <ShoppingCart className="w-4 h-4 text-emerald-600" />,
      options: [
        { key: 'rcerp_pos_orders', label: 'طلبات نقاط البيع', count: posOrders.length },
        { key: 'rcerp_pos_returns', label: 'مرتجعات نقاط البيع', count: posReturns.length },
        { key: 'rcerp_batch_sales', label: 'المبيعات المجمعة (دفعات)', count: batchSalesRecords.length },
        { key: 'rcerp_delivery_sales', label: 'مبيعات التوصيل', count: deliverySales.length },
        { key: 'rcerp_food_menus', label: 'قوائم المنيو', count: foodMenus.length },
      ],
    },
    {
      group: 'المشتريات والمخزون', icon: <Boxes className="w-4 h-4 text-indigo-600" />,
      options: [
        { key: 'rcerp_branches', label: 'الفروع', count: branches.length, danger: true },
        { key: 'rcerp_raw_materials', label: 'المواد الخام', count: rawMaterials.length, danger: true },
        { key: 'rcerp_recipes', label: 'الوصفات المعيارية', count: recipes.length },
        { key: 'rcerp_inventory', label: 'أرصدة المخزون', count: inventory.length, danger: true },
        { key: 'rcerp_recipe_inventory', label: 'رصيد الأصناف المصنّعة', count: recipeInventory.length },
        { key: 'rcerp_suppliers', label: 'الموردون', count: suppliers.length },
        { key: 'rcerp_purchase_orders', label: 'أوامر الشراء', count: purchaseOrders.length },
        { key: 'rcerp_grn', label: 'إشعارات الاستلام (GRN)', count: grnNotes.length },
        { key: 'rcerp_supplier_quotes', label: 'عروض أسعار الموردين', count: supplierQuotes.length },
        { key: 'rcerp_supplier_returns', label: 'مرتجعات الموردين', count: supplierReturns.length },
        { key: 'rcerp_work_orders', label: 'أوامر التصنيع', count: workOrders.length },
        { key: 'rcerp_stock_transfers', label: 'التحويلات المخزنية بين الفروع', count: stockTransfers.length },
        { key: 'rcerp_wastage', label: 'الهالك والفاقد', count: wastageLogs.length },
        { key: 'rcerp_inventory_movements', label: 'سجل حركات المخزون', count: inventoryMovements.length },
        { key: 'rcerp_monthly_inventory', label: 'دورات الجرد الشهري', count: monthlyInventory.length },
        { key: 'rcerp_physical_counts', label: 'العدّ الفعلي', count: physicalCounts.length },
      ],
    },
    {
      group: 'المالية والمحاسبة', icon: <Banknote className="w-4 h-4 text-amber-600" />,
      options: [
        { key: 'rcerp_operating_expenses', label: 'المصاريف التشغيلية', count: operatingExpenses.length },
        { key: 'rcerp_expense_budgets', label: 'موازنات المصاريف', count: expenseBudgets.length },
        { key: 'rcerp_invoices', label: 'الفواتير (مبيعات/مشتريات)', count: invoices.length },
        { key: 'rcerp_accounts', label: 'شجرة الحسابات', count: accounts.length },
        { key: 'rcerp_journal', label: 'القيود المحاسبية', count: journalEntries.length },
        { key: 'rcerp_fixed_assets', label: 'الأصول الثابتة', count: fixedAssets.length },
        { key: 'rcerp_opening_balances', label: 'الأرصدة الافتتاحية', count: openingBalances.length },
      ],
    },
    {
      group: 'التشغيل والموارد البشرية', icon: <Clock3 className="w-4 h-4 text-rose-600" />,
      options: [
        { key: 'rcerp_employees', label: 'الموظفون', count: employees.length },
        { key: 'rcerp_shifts', label: 'الورديات (العمالة)', count: shifts.length },
        { key: 'rcerp_attendance', label: 'سجل الحضور', count: attendance.length },
        { key: 'rcerp_payroll', label: 'فترات الرواتب', count: payrollPeriods.length },
        { key: 'rcerp_employee_meals', label: 'وجبات الموظفين', count: employeeMeals.length },
        { key: 'rcerp_production_runs', label: 'دورات الإنتاج', count: productionRuns.length },
        { key: 'rcerp_daily_counts', label: 'الفحص والجرد اليومي', count: dailyCounts.length },
        { key: 'rcerp_requisitions', label: 'طلبات التوريد الداخلي', count: requisitions.length },
      ],
    },
    {
      group: 'العملاء والجدولة والتقارير', icon: <Users className="w-4 h-4 text-sky-600" />,
      options: [
        { key: 'rcerp_customers', label: 'العملاء', count: customers.length },
        { key: 'rcerp_reservations', label: 'الحجوزات', count: reservations.length },
        { key: 'rcerp_customer_orders', label: 'طلبات العملاء المفتوحة', count: customerOrders.length },
        { key: 'rcerp_scheduled_reports', label: 'التقارير المجدولة', count: scheduledReports.length },
        { key: 'rcerp_automation_rules', label: 'قواعد الأتمتة', count: automationRules.length },
        { key: 'rcerp_audit', label: 'سجل التدقيق', count: 0 },
      ],
    },
  ];
  const allClearKeys = clearGroups.flatMap((g) => g.options.map((o) => o.key));
  const selectedClearCount = clearSelection.size;
  const toggleClear = (key: string) => {
    const next = new Set(clearSelection);
    if (next.has(key)) next.delete(key); else next.add(key);
    setClearSelection(next);
  };

  const doClearSelected = () => {
    if (typedWord.trim() !== 'تأكيد' || selectedClearCount === 0) return;
    clearCollections(Array.from(clearSelection));
    alert(`تم تفريغ ${selectedClearCount} جدول من البيانات المحددة.`);
    setClearSelection(new Set());
    setClearConfirmOpen(false);
    setTypedWord('');
  };

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!json.ok || !json.backup) throw new Error(json.error || 'فشل النسخ الاحتياطي');
      const backup = json.backup;
      const date = new Date(backup.createdAt);
      const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
      const blob = new Blob([JSON.stringify({ ...backup }, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `RestoCost_Backup_${stamp}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupMsg(`تم إنشاء نسخة احتياطية: ${Object.keys(backup.data).length} وحدة بيانات (${stamp})`);
    } catch (e) {
      setBackupMsg(`تعذر إنشاء النسخة الاحتياطية: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`);
    } finally {
      setBackupBusy(false);
      setTimeout(() => setBackupMsg(''), 4000);
    }
  };

  const onPickRestoreFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
          setBackupMsg('ملف غير صالح: يجب أن يحتوي على مفتاح data يحتوي كامل البيانات.');
          setTimeout(() => setBackupMsg(''), 4000);
          return;
        }
        setRestoreFile(file);
        setRestorePreview({
          fileName: file.name,
          createdAt: obj.createdAt || 'غير معروف',
          createdBy: obj.createdBy,
          counts: obj.counts || {},
        });
        setTypedWord('');
      } catch {
        setBackupMsg('تعذر قراءة الملف: ليس ملف JSON صالحاً.');
        setTimeout(() => setBackupMsg(''), 4000);
      }
    };
    reader.readAsText(file, 'utf-8');
    const input = document.getElementById('restore-file') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const submitRestore = async () => {
    if (typedWord.trim() !== 'تأكيد' || !restoreFile) return;
    setRestoreBusy(true);
    try {
      const obj = JSON.parse(await restoreFile.text());
      if (!obj || typeof obj !== 'object' || !obj.data) throw new Error('ملف غير صالح');
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backup: obj }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشلت الاستعادة');
      setRestorePreview(null);
      setRestoreFile(null);
      setTypedWord('');
      setBackupMsg(`تمت استعادة ${json.restored} وحدة بيانات. سيتم إعادة تحميل النظام...`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setBackupMsg(`تعذرت الاستعادة: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`);
    } finally {
      setRestoreBusy(false);
      setTimeout(() => setBackupMsg(''), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="مركز النظام: التصدير والطباعة وإدارة البيانات" subtitle="تصدير جميع التقارير، طباعة تقرير شامل، وتفريغ بيانات النظام" icon={<Settings2 className="w-6 h-6 text-indigo-600" />} />

      {exportMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{exportMsg}</div>}

      <Card className="p-4">
        <SectionHeader title="تصدير وطباعة التقارير" subtitle="تصدير كل تقرير CSV أو PDF أو طباعة التقرير الشامل" icon={<FileSpreadsheet className="w-5 h-5 text-indigo-500" />} extra={
          <div className="flex gap-2">
            <Btn tone="dark" onClick={exportAll}><FileSpreadsheet className="w-4 h-4" /> تصدير الكل CSV</Btn>
            <Btn tone="success" onClick={exportPdfAll} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} تصدير PDF شامل</Btn>
            <Btn onClick={() => openPrintWindow({ title: 'التقرير الشامل لجميع البيانات', subtitle: 'مركز النظام', meta: [['تاريخ الطباعة', new Date().toLocaleString('ar-SA-u-nu-latn')], ['عدد التقارير', `${exportables.length}`]], tables: exportables.map((x) => ({ title: x.name, header: x.header, rows: x.rows })), footer: 'التقرير الشامل — RestoCost ERP' })}><Printer className="w-4 h-4" /> طباعة</Btn>
          </div>
        } />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          {exportables.map((x) => (
            <div key={x.name} className="flex items-center justify-between bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl pl-2.5 pr-3 py-2 text-xs font-bold text-slate-700 transition-colors">
              <span className="truncate flex-1">{x.name}</span>
              <button onClick={() => exportSingle(x)} title="تصدير CSV" className="p-1.5 text-indigo-500 hover:text-indigo-700 shrink-0"><FileSpreadsheet className="w-4 h-4" /></button>
              <button onClick={() => exportPdfSingle(x)} title="تصدير PDF" disabled={pdfBusy} className="p-1.5 text-rose-500 hover:text-rose-700 shrink-0 disabled:opacity-40"><FileDown className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="النسخ الاحتياطي والاستعادة" subtitle={canReset ? 'نسخة كاملة لجميع بيانات النظام في ملف، واستعادتها عند الحاجة (صلاحية مدير النظام)' : 'الوصول مقيد بصلاحية إدارة النظام (reset_system)'} icon={<DatabaseBackup className="w-5 h-5 text-emerald-500" />} extra={
          <div className="flex gap-2">
            <Btn tone="success" onClick={downloadBackup} disabled={!canReset || backupBusy}>{backupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />} تنزيل نسخة احتياطية</Btn>
            <label className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${canReset ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              <HardDriveUpload className="w-4 h-4" /> استعادة من ملف
              <input id="restore-file" type="file" accept=".json,application/json" className="hidden" disabled={!canReset || restoreBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickRestoreFile(f); }} />
            </label>
          </div>
        } />
        {backupMsg && <p className="mt-2 text-xs font-bold text-slate-600">{backupMsg}</p>}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="font-extrabold text-emerald-800 text-xs flex items-center gap-1.5"><HardDriveDownload className="w-4 h-4" /> النسخة الاحتياطية</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">تنزيل ملف JSON واحد يحتوي جميع وحدات البيانات (المخزون، المبيعات، المصاريف، الفواتير، الحسابات، المستخدمون...) لحفظه على جهازك أو سحابة.</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <p className="font-extrabold text-indigo-800 text-xs flex items-center gap-1.5"><ArchiveRestore className="w-4 h-4" /> الاستعادة</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">اختر ملف نسخة احتياطية سابقة لعرض محتواها، ثم أكّد كتابة «تأكيد» لاستبدال بيانات النظام الحالية بها. تعرض جميع الجلسات وتسجيل دخول مطلوب.</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="font-extrabold text-amber-800 text-xs flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> تنبيه مهم</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">الاستعادة تستبدل البيانات الحالية بالكامل. أنشئ نسخة احتياطية قبل أي استعادة للاحتفاظ بالبيانات الحالية.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="المصادقة الثنائية (2FA)" subtitle={isAdmin ? 'حماية إضافية لحساب مدير النظام عبر تطبيق مصادقة (TOTP)' : 'متاحة لحساب مدير النظام فقط'} icon={<KeyRound className="w-5 h-5 text-indigo-500" />} extra={
          isAdmin && <Btn tone={totpEnabled ? 'danger' : 'success'} onClick={openTotpSetup} disabled={totpBusy}>{totpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : totpEnabled ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}{totpEnabled ? 'إيقاف المصادقة الثنائية' : 'تفعيل المصادقة الثنائية'}</Btn>
        } />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className={`rounded-xl border p-3 ${totpEnabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="font-extrabold text-xs flex items-center gap-1.5 ${totpEnabled ? 'text-emerald-800' : 'text-slate-600'}"><ShieldCheck className="w-4 h-4" /> الحالة</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">{totpEnabled ? 'المصادقة الثنائية مفعّلة — يُطلب رمز TOTP عند تسجيل الدخول.' : 'غير مفعّلة بعد.'}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <p className="font-extrabold text-indigo-800 text-xs flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> كيف تَعمل؟</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">تسجيل الدخول يتطلب كلمة المرور + رمزاً سداسياً متغيراً من تطبيق مصادقة على هاتفك.</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <p className="font-extrabold text-amber-800 text-xs flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> تنبيه</p>
            <p className="text-[11px] text-slate-600 mt-1 leading-5">احتفظ برمز الاستعادة في مكان آمن. عند فقدان هاتفك، مدير آخر يملك صلاحية يمكنه إيقافها من قاعدة البيانات.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="تفريغ بيانات محدد (اختيار الجداول)" subtitle={canReset ? 'حدد أنواع البيانات المطلوب تفريغها فقط دون مسح النظام كاملاً (يبقى المستخدمون وصلاحياتهم)' : 'الوصول مقيد بصلاحية إدارة النظام (reset_system)'} icon={<Trash2 className="w-5 h-5 text-rose-500" />} extra={canReset && (
          <div className="flex items-center gap-2 flex-wrap">
            <Btn tone="dark" disabled={selectedClearCount === allClearKeys.length} onClick={() => setClearSelection(new Set(allClearKeys))}>تحديد الكل</Btn>
            <Btn tone="ghost" disabled={selectedClearCount === 0} onClick={() => setClearSelection(new Set())}>إلغاء التحديد</Btn>
            <Btn tone="danger" disabled={selectedClearCount === 0} onClick={() => setClearConfirmOpen(true)}><Trash2 className="w-4 h-4" /> تفريغ المحدد ({selectedClearCount} جدول)</Btn>
          </div>
        )} />
        <div className="mt-4">
          {!canReset ? (
            <p className="text-xs text-slate-500">ليست لديك صلاحية. يمكن لمدير النظام فقط إجراء التفريغ المحدد.</p>
          ) : (
            <div className="space-y-4">
              {clearGroups.map((g) => (
                <div key={g.group} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-extrabold text-xs text-slate-700 flex items-center gap-1.5 mb-2">{g.icon} {g.group}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-2">
                    {g.options.map((o) => (
                      <label key={o.key} className={`flex items-center justify-between gap-2 rounded-lg border p-2 cursor-pointer transition-colors select-none ${clearSelection.has(o.key) ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={clearSelection.has(o.key)} onChange={() => toggleClear(o.key)} className="w-4 h-4 accent-rose-500 shrink-0" />
                          <span className="text-xs font-medium text-slate-700 truncate">{o.label}</span>
                          {o.count > 0 && <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ${o.danger ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{o.count}</span>}
                        </span>
                        {o.danger && <span className="text-[9px] font-bold text-rose-600 shrink-0">خطير</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> الحذف فوري ولا يمكن التراجع عنه. يُنشأ تلقائياً «نقطة استعادة» فلا تتردد بأخذ نسخة احتياطية قبل البدء.</p>
            </div>
          )}
        </div>
      </Card>

      <Modal open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} title={`تأكيد تفريغ ${selectedClearCount} جدول من البيانات`}>
        <div className="space-y-3 text-xs">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold">
            سيتم حذف البيانات المحددة (المجموعات بعلامة «خطير» تؤثر على تشغيل النظام) ولا يمكن استعادتها. يبقى المستخدمون وصلاحياتهم فقط.
          </div>
          <p className="font-bold text-slate-700">اكتب كلمة <span className="text-rose-600">تأكيد</span> للمتابعة:</p>
          <input dir="rtl" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-rose-500" placeholder="تأكيد" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setClearConfirmOpen(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="button" onClick={doClearSelected} disabled={typedWord.trim() !== 'تأكيد'} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5"><Check className="w-4 h-4" /> تنفيذ</button>
          </div>
        </div>
      </Modal>

      <Card className="p-4">
        <SectionHeader title="إدارة بيانات النظام" subtitle={canReset ? 'إفراغ النظام أو إعادة تعيين البيانات التجريبية (إجراء لا يمكن التراجع عنه)' : 'الوصول مقيد بصلاحية إدارة النظام (reset_system)'} icon={<AlertTriangle className="w-5 h-5 text-rose-500" />} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button onClick={() => canReset && setConfirmAction('clear')} disabled={!canReset} className={`flex items-center justify-between rounded-xl border p-4 text-right transition-colors ${canReset ? 'bg-rose-50 border-rose-200 hover:bg-rose-100 cursor-pointer' : 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'}`}>
            <div>
              <p className="font-extrabold text-rose-800 text-xs flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> تفريغ النظام من البيانات</p>
              <p className="text-[11px] text-slate-600 mt-1">حذف جميع السجلات (مخزون، مبيعات، مصاريف، عملاء، فواتير...) لبدء التشغيل الفعلي من الصفر.</p>
            </div>
            <Btn tone="danger" onClick={() => setConfirmAction('clear')}>تفريغ</Btn>
          </button>
          <button onClick={() => canReset && setConfirmAction('reset')} disabled={!canReset} className={`flex items-center justify-between rounded-xl border p-4 text-right transition-colors ${canReset ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer' : 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'}`}>
            <div>
              <p className="font-extrabold text-indigo-800 text-xs flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> إعادة تعيين البيانات التجريبية</p>
              <p className="text-[11px] text-slate-600 mt-1">استعادة البيانات التجريبية الأولية للعرض والتجربة.</p>
            </div>
            <Btn tone="dark" onClick={() => setConfirmAction('reset')}>إعادة تعيين</Btn>
          </button>
        </div>
      </Card>

      <Modal open={confirmAction !== null} onClose={() => setConfirmAction(null)} title={confirmAction === 'clear' ? 'تأكيد تفريغ النظام من البيانات' : 'تأكيد إعادة تعيين البيانات'}>
        <div className="space-y-3 text-xs">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold">
            {confirmAction === 'clear'
              ? 'سيتم حذف جميع البيانات نهائياً ولا يمكن استعادتها. يبقى المستخدمون وصلاحياتهم فقط.'
              : 'سيتم استبدال البيانات الحالية بالبيانات التجريبية الأولية.'}
          </div>
          <p className="font-bold text-slate-700">اكتب كلمة <span className="text-rose-600">تأكيد</span> للمتابعة:</p>
          <input dir="rtl" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-rose-500" placeholder="تأكيد" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmAction(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="button" onClick={doAction} disabled={typedWord.trim() !== 'تأكيد'} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5"><Check className="w-4 h-4" /> تنفيذ</button>
          </div>
        </div>
      </Modal>

      <Modal open={restorePreview !== null} onClose={() => { setRestorePreview(null); setRestoreFile(null); setTypedWord(''); }} title="استعادة النسخة الاحتياطية">
        {restorePreview && (
          <div className="space-y-3 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 font-bold">
              سيتم استبدال جميع بيانات النظام الحالية ببيانات النسخة الاحتياطية التالية ولا يمكن التراجع:
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-slate-700 font-medium">
              <p className="flex justify-between"><span className="font-bold">اسم الملف:</span> <span dir="ltr" className="font-mono">{restorePreview.fileName}</span></p>
              <p className="flex justify-between"><span className="font-bold">تاريخ النسخة:</span> {restorePreview.createdAt}</p>
              {restorePreview.createdBy && <p className="flex justify-between"><span className="font-bold">أنشئت بواسطة:</span> {restorePreview.createdBy}</p>}
            </div>
            <div>
              <p className="font-extrabold text-slate-700 mb-1.5">محتوى النسخة ({Object.keys(restorePreview.counts).length} وحدة):</p>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl">
                {Object.entries(restorePreview.counts).map(([k, c]) => (
                  <div key={k} className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 last:border-0 text-slate-600">
                    <span className="font-mono text-[10px]">{k}</span>
                    <span className="font-bold">{c} سجل</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="font-bold text-slate-700">اكتب كلمة <span className="text-rose-600">تأكيد</span> للمتابعة:</p>
            <input dir="rtl" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500" placeholder="تأكيد" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setRestorePreview(null); setRestoreFile(null); setTypedWord(''); }} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
              <button type="button" onClick={submitRestore} disabled={typedWord.trim() !== 'تأكيد' || restoreBusy} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5">
                {restoreBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />} استعادة البيانات
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={totpOpen} onClose={() => setTotpOpen(false)} title={totpEnabled ? 'إيقاف المصادقة الثنائية' : 'تفعيل المصادقة الثنائية'}>
        <div className="space-y-3 text-xs">
          {!totpEnabled && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
              <p className="font-extrabold text-indigo-800">أضف المفتاح إلى تطبيق المصادقة:</p>
              <p className="text-slate-600 leading-5">افتح تطبيق Google Authenticator أو Microsoft Authenticator، ثم أضف حساباً جديداً. يمكنك إدخال الرمز يدوياً من الأسفل:</p>
              <div className="bg-white border border-indigo-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 mb-1">المفتاح السري (بدون الرمز المالي):</p>
                <p dir="ltr" className="font-mono text-[13px] text-slate-900 select-all break-all">{totpSecret}</p>
              </div>
              <div className="bg-white border border-indigo-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-500 mb-1">رابط otpauth (للماسح الضوئي):</p>
                <p dir="ltr" className="font-mono text-[10px] text-slate-700 select-all break-all">{totpUrlText}</p>
              </div>
            </div>
          )}
          <p className="font-bold text-slate-700">{totpEnabled ? 'أدخل رمز التحقق الحالي لتأكيد الإيقاف:' : 'بعد الإضافة، أدخل الرمز الحالي (6 أرقام) للتأكيد:'}</p>
          <input inputMode="numeric" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456"
            dir="ltr" className="w-full border border-slate-300 rounded-xl p-2.5 text-center tracking-[0.4em] font-mono text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
          {totpMsg && <p className={`text-xs font-bold rounded-lg p-2 ${String(totpMsg).startsWith('تم') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>{totpMsg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTotpOpen(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="button" onClick={submitTotp} disabled={totpBusy || totpCode.length !== 6} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5">
              {totpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {totpEnabled ? 'إيقاف' : 'تفعيل'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};