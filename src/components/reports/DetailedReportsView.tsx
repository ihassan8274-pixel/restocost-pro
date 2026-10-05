import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, FileDown, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, TabBar, Btn } from '../ui';
import { fmtMoney, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { buildPLRows } from '../../utils/financials';

type TabId = 'aging' | 'receiving' | 'menu_cost' | 'closing' | 'consolidation';

const STATUS = { closed: 'مقفل', counting: 'جاري الجرد', review: 'قيد المراجعة' };

export const DetailedReportsView: React.FC = () => {
  const { rawMaterials, inventory, grnNotes, recipes, branches, companies, monthlyInventory, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs, closedMonths, getAverageUnitCost, getBranchName } = useApp();
  const [tab, setTab] = useState<TabId>('aging');

  // ---------- 1) aging ----------
  const agingRows = useMemo(() => {
    const rows = inventory
      .filter((i) => i.quantity > 0)
      .map((i) => {
        const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
        const days = i.expiryDate ? Math.floor((new Date(i.expiryDate).getTime() - Date.now()) / 86400000) : null;
        return {
          matName: mat?.nameAr || i.rawMaterialId, branchId: i.branchId, qty: i.quantity, unit: mat?.unit || '',
          batch: i.batchNumber || '—', expiry: i.expiryDate || '—', days,
          value: i.quantity * getAverageUnitCost(i.rawMaterialId),
        };
      })
      .filter((r) => r.days !== null && r.days <= 30)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    return rows;
  }, [inventory, rawMaterials, getAverageUnitCost]);
  const expiredCount = agingRows.filter((r) => (r.days ?? 0) <= 0).length;
  const expiringCount = agingRows.filter((r) => (r.days ?? 0) > 0 && (r.days ?? 0) <= 7).length;
  const agingValue = agingRows.reduce((s, r) => s + r.value, 0);

  // ---------- 2) receiving detail ----------
  const receivingRows = useMemo(() => {
    const rows: { grn: string; supplier: string; branch: string; date: string; mat: string; qty: number; price: number; total: number; currency: string; invoice: string }[] = [];
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => {
      g.items.forEach((it) => {
        rows.push({
          grn: g.grnNumber, supplier: g.supplierName, branch: g.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(g.branchId),
          date: g.date, mat: rawMaterials.find((m) => m.id === it.rawMaterialId)?.nameAr || it.rawMaterialId,
          qty: it.quantityReceived, price: it.unitPrice, total: it.quantityReceived * it.unitPrice,
          currency: g.currencyCode && g.currencyCode !== 'SAR' ? g.currencyCode : '', invoice: g.invoiceNumber || '—',
        });
      });
    });
    return rows;
  }, [grnNotes, rawMaterials, getBranchName]);

  // ---------- 3) menu cost detail ----------
  const menuRows = useMemo(() => recipes.filter((r) => r.isActive).map((r) => {
    const foodCost = r.ingredients.reduce((s, ing) => s + ing.quantity * getAverageUnitCost(ing.rawMaterialId) * (1 + (ing.wastagePercent || 0) / 100), 0);
    const totalCost = foodCost + r.directLaborCost + r.packagingCost;
    const margin = r.actualMenuPrice ? ((r.actualMenuPrice - totalCost) / r.actualMenuPrice) * 100 : 0;
    return { name: r.nameAr, code: r.code, portion: r.portionSize, ingredients: r.ingredients.length, foodCost, totalCost, price: r.actualMenuPrice, margin, targetMargin: r.targetMarginPercent ?? 68, status: r.actualMenuPrice ? margin < (r.targetMarginPercent ?? 68) ? 'low' : 'ok' : 'noprice' };
  }), [recipes, getAverageUnitCost]);
  const lowMargin = menuRows.filter((r) => r.status === 'low').length;

  // ---------- 4) closing worksheet ----------
  const closingRows = monthlyInventory.map((p) => {
    const totalOpening = p.items.reduce((s, i) => s + i.openingQty * i.unitCost, 0);
    const totalPurchased = p.items.reduce((s, i) => s + i.purchasedQty * i.unitCost, 0);
    const totalClosing = p.items.reduce((s, i) => s + (i.openingQty + i.purchasedQty + i.transferredIn - i.transferredOut - i.theoreticalUsage) * i.unitCost, 0);
    return {
      id: p.id, branch: p.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(p.branchId), month: p.monthKey,
      status: p.status, items: p.items.length, totalOpening, totalPurchased,
      totalUsage: p.totalTheoreticalUsage, totalActual: p.totalActualUsage, usageVariance: p.totalUsageVariance,
      totalClosing, varianceCost: p.totalVarianceCost, closedAt: p.closedAt || '—',
    };
  });

  // ---------- 5) consolidation per company ----------
  const consolidation = useMemo(() => {
    const rows = buildPLRows({
      posOrders,
      batchSales: batchSalesRecords.map((b) => ({
        branchId: b.branchId,
        date: b.date,
        netRevenue: b.netRevenue ?? b.totalRevenue / 1.15,
        totalFoodCost: b.totalFoodCost,
      })),
      shifts,
      expenses: operatingExpenses,
      wastage: wastageLogs,
    });
    const byBranch = new Map<string, { sales: number; food: number; labor: number; opex: number; wastage: number }>();
    rows.forEach((r) => {
      const cur = byBranch.get(r.branchId) || { sales: 0, food: 0, labor: 0, opex: 0, wastage: 0 };
      cur.sales += r.totalSales; cur.food += r.foodCost; cur.labor += r.laborCost; cur.opex += r.operatingExpenses; cur.wastage += r.wastage;
      byBranch.set(r.branchId, cur);
    });
    const companyMap = new Map<string, { branches: string[]; sales: number; food: number; labor: number; opex: number; wastage: number; inventoryValue: number }>();
    companies.forEach((c) => {
      const bIds = branches.filter((b) => b.companyId === c.id).map((b) => b.id);
      const acc = { branches: bIds, sales: 0, food: 0, labor: 0, opex: 0, wastage: 0, inventoryValue: 0 };
      bIds.forEach((bid) => {
        const bd = byBranch.get(bid);
        if (bd) { acc.sales += bd.sales; acc.food += bd.food; acc.labor += bd.labor; acc.opex += bd.opex; acc.wastage += bd.wastage; }
        acc.inventoryValue += inventory.filter((i) => i.branchId === bid).reduce((s, i) => s + i.quantity * getAverageUnitCost(i.rawMaterialId), 0);
      });
      companyMap.set(c.id, acc);
    });
    const rowsOut = companies.map((c) => {
      const a = companyMap.get(c.id)!;
      const net = a.sales - (a.food + a.labor + a.opex + a.wastage);
      return { id: c.id, nameAr: c.nameAr, code: c.code, branchCount: a.branches.length, sales: a.sales, food: a.food, labor: a.labor, opex: a.opex, wastage: a.wastage, net, inventoryValue: a.inventoryValue };
    });
    const total = rowsOut.reduce((s, r) => ({ sales: s.sales + r.sales, food: s.food + r.food, labor: s.labor + r.labor, opex: s.opex + r.opex, wastage: s.wastage + r.wastage, net: s.net + r.net, inventoryValue: s.inventoryValue + r.inventoryValue }), { sales: 0, food: 0, labor: 0, opex: 0, wastage: 0, net: 0, inventoryValue: 0 });
    return { rowsOut, total };
  }, [companies, branches, inventory, getAverageUnitCost, posOrders, batchSalesRecords, shifts, operatingExpenses, wastageLogs]);

  const printAging = () => {
    openPrintWindow({
      title: 'تقرير شيخوخة المخزون (نزول قرب الانتهاء)',
      subtitle: `${expiredCount} منتهي · ${expiringCount} قريب الانتهاء`,
      meta: [['إجمالي القيمة المعرضة', `${fmtMoney(agingValue)}`], ['عدد الأصناف', `${agingRows.length}`]],
      tables: [{ title: 'المواد الأقرب للانتهاء', header: ['المادة', 'الفرع', 'الكمية', 'الدفعة', 'الانتهاء', 'أيام متبقية', 'القيمة'], rows: agingRows.map((r) => [r.matName, r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId), r.qty, r.batch, r.expiry, r.days ?? '—', fmtMoney(r.value)]) }],
      footer: 'تشمل المواد المنتهية (أيام ≤ 0) والتي تنتهي خلال 30 يوماً',
    });
  };

  const printReceiving = () => {
    openPrintWindow({
      title: 'تقرير تفصيل الاستلام (GRN)',
      subtitle: `${receivingRows.length} بند استلام معتمد`,
      meta: [['إشعارات', `${grnNotes.filter((g) => g.status === 'approved').length}`], ['إجمالي البنود', `${receivingRows.length}`]],
      tables: [{ title: 'تفاصيل الاستلام', header: ['GRN', 'المورد', 'الفرع', 'التاريخ', 'الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي', 'العملة', 'فاتورة'], rows: receivingRows.map((r) => [r.grn, r.supplier, r.branch, r.date, r.mat, r.qty, r.price, r.total.toFixed(2), r.currency || 'ر.س', r.invoice]) }],
      footer: 'تقرير تفصيلي لجميع إشعارات الاستلام المعتمدة',
    });
  };

  const printMenuCost = () => {
    openPrintWindow({
      title: 'تقرير تفصيل تكلفة الأطباق',
      subtitle: `${lowMargin} صنف بهامش أقل من المستهدف`,
      meta: [['الوصفات', `${menuRows.length}`], ['بهامش منخفض', `${lowMargin}`]],
      tables: [{ title: 'تفصيل التكلفة لكل طبق', header: ['الكود', 'الطبق', 'الحصة', 'عدد المكونات', 'تكلفة الطعام', 'التكلفة الكلية', 'سعر البيع', 'الهامش %', 'المستهدف %', 'الحالة'], rows: menuRows.map((r) => [r.code, r.name, r.portion, r.ingredients, fmtMoney(r.foodCost), fmtMoney(r.totalCost), r.price ? fmtMoney(r.price) : '—', r.price ? r.margin.toFixed(2) : '—', r.targetMargin, r.status === 'low' ? 'أقل من المستهدف' : r.status === 'ok' ? 'سليم' : 'بدون سعر'] ) }],
      footer: 'تكلفة الطعام تحسب من متوسط تكلفة المكونات الفعلي + الهالك، والتكلفة الكلية تشمل العمالة والتغليف',
    });
  };

  const printClosing = () => {
    openPrintWindow({
      title: 'ورقة إقفال الجرد الشهري',
      subtitle: `${monthlyInventory.filter((p) => p.status === 'closed').length} شهر مقفل`,
      tables: [{ title: 'ملخص الإقفال لكل فرع/شهر', header: ['الفرع', 'الشهر', 'الافتتاحي', 'المشتريات', 'الاستهلاك النظري', 'الفعلي', 'فرق الاستهلاك', 'الإجمالي الختامي', 'فرق القيمة', 'الحالة', 'تاريخ الإقفال'], rows: closingRows.map((r) => [r.branch, r.month, fmtMoney(r.totalOpening), fmtMoney(r.totalPurchased), fmtMoney(r.totalUsage), fmtMoney(r.totalActual), fmtMoney(r.usageVariance), fmtMoney(r.totalClosing), fmtMoney(r.varianceCost), STATUS[r.status], r.closedAt]) }],
      footer: `الشهور المقفلة: ${closedMonths.length ? closedMonths.join('، ') : 'لا يوجد'} — لا تُقبل عمليات على الشهر المقفل`,
    });
  };

  const printConsolidation = () => {
    openPrintWindow({
      title: 'التقرير الموحد — الدمج المالي للشركات',
      subtitle: 'موحد لكل الشركات والفروع',
      tables: [{ title: 'الملخص الموحد لكل شركة', header: ['الشركة', 'الفروع', 'الإيراد', 'تكلفة الطعام', 'العمالة', 'التشغيلية', 'الهالك', 'صافي الربح', 'قيمة المخزون'], rows: consolidation.rowsOut.map((r) => [r.nameAr, r.branchCount, fmtMoney(r.sales), fmtMoney(r.food), fmtMoney(r.labor), fmtMoney(r.opex), fmtMoney(r.wastage), fmtMoney(r.net), fmtMoney(r.inventoryValue)]) }],
      totals: [['الإيراد الموحد', fmtMoney(consolidation.total.sales)], ['صافي الربح الموحد', fmtMoney(consolidation.total.net)], ['قيمة المخزون الموحدة', fmtMoney(consolidation.total.inventoryValue)]],
      footer: 'الدمج المالي الموحد لكل الشركات ضمن المجموعة (التحكم اللامركزي)',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="التقارير التفصيلية والدمج الموحد" subtitle="تقارير تفصيلية احترافية قابلة للطباعة والتصدير: شيخوخة المخزون، تفصيل الاستلام، تكلفة الأطباق، ورقة الإقفال، والدمج المالي للشركات" icon={<FileSpreadsheet className="w-6 h-6 text-brand-600" />} />

      <TabBar tabs={[
        { id: 'aging', label: 'شيخوخة المخزون' },
        { id: 'receiving', label: 'تفصيل الاستلام' },
        { id: 'menu_cost', label: 'تفصيل تكلفة الأطباق' },
        { id: 'closing', label: 'ورقة إقفال الجرد' },
        { id: 'consolidation', label: 'الدمج الموحد (الشركات)' },
      ]} active={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'aging' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بنود قريبة من الانتهاء</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{agingRows.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs"><span className="text-rose-600 text-[11px] block">منتهية الصلاحية</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{expiredCount}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">تنتهي خلال 7 أيام</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{expiringCount}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-xs"><span className="text-brand-600 text-[11px] block">قيمة المعرضة</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(agingValue)}</strong></div>
          </div>
          <div className="flex gap-2">
            <Btn onClick={printAging}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV('Inventory_Aging.csv', ['المادة', 'الفرع', 'الكمية', 'الدفعة', 'الانتهاء', 'أيام', 'القيمة'], agingRows.map((r) => [r.matName, r.branchId, r.qty, r.batch, r.expiry, r.days ?? '', r.value.toFixed(2)]))}><FileDown className="w-4 h-4" /> تصدير CSV</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line"><tr><th className="p-3">المادة</th><th className="p-3">الفرع</th><th className="p-3">الكمية</th><th className="p-3">الدفعة</th><th className="p-3">الانتهاء</th><th className="p-3">أيام متبقية</th><th className="p-3">القيمة</th><th className="p-3">الحالة</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {agingRows.map((r, idx) => (
                    <tr key={idx} className={r.days !== null && r.days <= 0 ? 'bg-rose-50/50' : r.days !== null && r.days <= 7 ? 'bg-amber-50/50' : ''}>
                      <td className="p-3 font-bold text-slate-900">{r.matName}</td>
                      <td className="p-3 text-slate-600">{r.branchId === 'b-ck' ? 'المطبخ المركزي' : getBranchName(r.branchId)}</td>
                      <td className="tnum text-left p-3 font-bold">{r.qty} {r.unit}</td>
                      <td className="tnum text-left p-3 text-slate-500">{r.batch}</td>
                      <td className="tnum text-left p-3">{r.expiry}</td>
                      <td className="tnum text-left p-3 font-extrabold">{r.days !== null ? r.days : '—'}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.value)}</td>
                      <td className="p-3">{r.days !== null && r.days <= 0 ? <span className="text-rose-600 font-bold">منتهية</span> : r.days !== null && r.days <= 7 ? <span className="text-amber-700 font-bold">قريب الانتهاء</span> : <span className="text-emerald-600 font-bold">يُتابع</span>}</td>
                    </tr>
                  ))}
                  {agingRows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500 font-bold">لا توجد بنود تنتهي خلال 30 يوماً</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'receiving' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Btn onClick={printReceiving}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV('Receiving_Detail.csv', ['GRN', 'المورد', 'الفرع', 'التاريخ', 'الصنف', 'الكمية', 'السعر', 'الإجمالي', 'العملة'], receivingRows.map((r) => [r.grn, r.supplier, r.branch, r.date, r.mat, r.qty, r.price, r.total.toFixed(2), r.currency || 'ر.س']))}><FileDown className="w-4 h-4" /> تصدير CSV</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line"><tr><th className="p-3">GRN</th><th className="p-3">المورد</th><th className="p-3">الفرع</th><th className="p-3">التاريخ</th><th className="p-3">الصنف</th><th className="p-3">الكمية</th><th className="p-3">سعر الوحدة</th><th className="p-3">الإجمالي</th><th className="p-3">العملة</th><th className="p-3">فاتورة</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {receivingRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="tnum text-left p-3 font-bold text-brand-700">{r.grn}</td>
                      <td className="p-3 font-bold text-slate-900">{r.supplier}</td>
                      <td className="p-3 text-slate-600">{r.branch}</td>
                      <td className="tnum text-left p-3 text-slate-600">{r.date}</td>
                      <td className="p-3 font-bold">{r.mat}</td>
                      <td className="tnum text-left p-3 font-bold">{r.qty}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.price)}</td>
                      <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmtMoney(r.total)}</td>
                      <td className="tnum text-left p-3 text-amber-700">{r.currency || 'ر.س'}</td>
                      <td className="tnum text-left p-3 text-slate-500">{r.invoice}</td>
                    </tr>
                  ))}
                  {receivingRows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد إشعارات استلام معتمدة</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'menu_cost' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الوصفات النشطة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{menuRows.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs"><span className="text-rose-600 text-[11px] block">بهامش أقل من المستهدف</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{lowMargin}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">سليم</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{menuRows.filter((r) => r.status === 'ok').length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">بدون سعر بيع</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{menuRows.filter((r) => r.status === 'noprice').length}</strong></div>
          </div>
          <div className="flex gap-2">
            <Btn onClick={printMenuCost}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV('Menu_Cost_Detail.csv', ['الكود', 'الطبق', 'تكلفة الطعام', 'التكلفة الكلية', 'سعر البيع', 'الهامش %', 'المستهدف %'], menuRows.map((r) => [r.code, r.name, r.foodCost.toFixed(2), r.totalCost.toFixed(2), r.price, r.price ? r.margin.toFixed(2) : '', r.targetMargin]))}><FileDown className="w-4 h-4" /> تصدير CSV</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line"><tr><th className="p-3">الكود</th><th className="p-3">الطبق</th><th className="p-3">الحصة</th><th className="p-3">مكونات</th><th className="p-3">تكلفة الطعام</th><th className="p-3">التكلفة الكلية</th><th className="p-3">سعر البيع</th><th className="p-3">الهامش %</th><th className="p-3">المستهدف %</th><th className="p-3">الحالة</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {menuRows.map((r, idx) => (
                    <tr key={idx} className={r.status === 'low' ? 'bg-rose-50/50' : r.status === 'ok' ? 'bg-emerald-50/30' : ''}>
                      <td className="tnum text-left p-3 font-bold text-brand-700">{r.code}</td>
                      <td className="p-3 font-bold text-slate-900">{r.name}</td>
                      <td className="p-3 text-slate-500">{r.portion}</td>
                      <td className="p-3 font-bold">{r.ingredients}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.foodCost)}</td>
                      <td className="tnum text-left p-3 font-extrabold">{fmtMoney(r.totalCost)}</td>
                      <td className="tnum text-left p-3">{r.price ? fmtMoney(r.price) : '—'}</td>
                      <td className={`p-3 font-mono font-extrabold ${r.price && r.margin < r.targetMargin ? 'text-rose-600' : 'text-emerald-600'}`}>{r.price ? `${r.margin.toFixed(2)}%` : '—'}</td>
                      <td className="tnum text-left p-3 text-slate-500">{r.targetMargin}%</td>
                      <td className="p-3">{r.status === 'low' ? <span className="text-rose-600 font-bold">أقل من المستهدف</span> : r.status === 'ok' ? <span className="text-emerald-600 font-bold">سليم</span> : <span className="text-amber-700 font-bold">بدون سعر</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'closing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">جولات الإقفال</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{closingRows.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">شهور مقفلة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{closingRows.filter((r) => r.status === 'closed').length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">فرق القيمة الإجمالي</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(closingRows.reduce((s, r) => s + r.varianceCost, 0))}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">فرق الاستهلاك</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(closingRows.reduce((s, r) => s + r.usageVariance, 0))}</strong></div>
          </div>
          <div className="flex gap-2">
            <Btn onClick={printClosing}><Printer className="w-4 h-4" /> طباعة ورقة الإقفال</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV('Closing_Worksheet.csv', ['الفرع', 'الشهر', 'الافتتاحي', 'المشتريات', 'الاستهلاك النظري', 'الفعلي', 'فرق القيمة', 'الحالة'], closingRows.map((r) => [r.branch, r.month, r.totalOpening.toFixed(2), r.totalPurchased.toFixed(2), r.totalUsage.toFixed(2), r.totalActual.toFixed(2), r.varianceCost.toFixed(2), STATUS[r.status]]))}><FileDown className="w-4 h-4" /> تصدير CSV</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line"><tr><th className="p-3">الفرع</th><th className="p-3">الشهر</th><th className="p-3">الافتتاحي</th><th className="p-3">المشتريات</th><th className="p-3">الاستهلاك النظري</th><th className="p-3">الفعلي</th><th className="p-3">فرق الاستهلاك</th><th className="p-3">الختامي</th><th className="p-3">فرق القيمة</th><th className="p-3">الحالة</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {closingRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{r.branch}</td>
                      <td className="tnum text-left p-3 font-bold text-brand-700">{r.month}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.totalOpening)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.totalPurchased)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.totalUsage)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.totalActual)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.usageVariance)}</td>
                      <td className="tnum text-left p-3 font-extrabold">{fmtMoney(r.totalClosing)}</td>
                      <td className={`p-3 font-mono font-bold ${r.varianceCost > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmtMoney(r.varianceCost)}</td>
                      <td className="p-3">{r.status === 'closed' ? <span className="text-emerald-600 font-bold">مقفل</span> : <span className="text-amber-700 font-bold">جاري</span>}</td>
                    </tr>
                  ))}
                  {closingRows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد جولات إقفال بعد — ابدأ الجرد الشهري من شاشة "الجرد الشهري والإقفال"</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'consolidation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الشركات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{consolidation.rowsOut.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-xs"><span className="text-brand-600 text-[11px] block">الإيراد الموحد</span><strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{fmtMoney(consolidation.total.sales)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">صافي الربح الموحد</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${consolidation.total.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(consolidation.total.net)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">قيمة المخزون الموحدة</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmtMoney(consolidation.total.inventoryValue)}</strong></div>
          </div>
          <div className="flex gap-2">
            <Btn onClick={printConsolidation}><Printer className="w-4 h-4" /> طباعة التقرير الموحد</Btn>
            <Btn tone="ghost" onClick={() => downloadCSV('Consolidation.csv', ['الشركة', 'الفروع', 'الإيراد', 'تكلفة الطعام', 'العمالة', 'التشغيلية', 'الهالك', 'صافي الربح', 'قيمة المخزون'], consolidation.rowsOut.map((r) => [r.nameAr, r.branchCount, r.sales.toFixed(2), r.food.toFixed(2), r.labor.toFixed(2), r.opex.toFixed(2), r.wastage.toFixed(2), r.net.toFixed(2), r.inventoryValue.toFixed(2)]))}><FileDown className="w-4 h-4" /> تصدير CSV</Btn>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-line"><tr><th className="p-3">الشركة</th><th className="p-3">الفروع</th><th className="p-3">الإيراد</th><th className="p-3">تكلفة الطعام</th><th className="p-3">العمالة</th><th className="p-3">التشغيلية</th><th className="p-3">الهالك</th><th className="p-3">صافي الربح</th><th className="p-3">الهامش %</th><th className="p-3">قيمة المخزون</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {consolidation.rowsOut.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3"><div className="font-bold text-slate-900">{r.nameAr}</div><div className="text-[9px] font-mono text-slate-400">{r.code}</div></td>
                      <td className="p-3 font-bold">{r.branchCount}</td>
                      <td className="tnum text-left p-3 font-bold">{fmtMoney(r.sales)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.food)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.labor)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.opex)}</td>
                      <td className="tnum text-left p-3">{fmtMoney(r.wastage)}</td>
                      <td className={`p-3 font-mono font-extrabold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(r.net)}</td>
                      <td className="tnum text-left p-3">{r.sales ? `${((r.net / r.sales) * 100).toFixed(2)}%` : '—'}</td>
                      <td className="tnum text-left p-3 text-amber-700">{fmtMoney(r.inventoryValue)}</td>
                    </tr>
                  ))}
                  {consolidation.rowsOut.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد شركات — أنشئ الشركات واربط الفروع بها من شاشة "شركات النظام"</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><Layers className="w-4 h-4 text-brand-400" /> الدمج يحسب الإيراد والتكلفة والعمالة والتشغيلية والهالك لكل فرع عبر "قوائم الدخل" ثم يجمعها حسب شركة كل فرع، ويضيف تقييم المخزون الفعلي لكل فرع.</div>
        </div>
      )}
    </div>
  );
};