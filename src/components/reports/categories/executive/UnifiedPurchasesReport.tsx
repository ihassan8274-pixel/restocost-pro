import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn, reportPct } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { PO_STATUS_LABELS } from '../../../../utils/helpers';
import type { PurchaseOrder, GoodsReceiptNote } from '../../../../types';

const branchName = (id: string, getBranchName: (id: string) => string) =>
  id === 'b-ck' ? 'المطبخ المركزي' : getBranchName(id) || id;

/** تقرير المشتريات الموحد: أوامر الشراء حسب المورد والحالة، واشعارات الاستلام */
export const UnifiedPurchasesReport: React.FC = () => {
  const { purchaseOrders, grnNotes, branches, getBranchName } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.nameAr })), [branches]);

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'purchases', title: 'المشتريات الموحدة', subtitle: 'أوامر الشراء حسب المورد والحالة وإشعارات الاستلام' }, [
      { name: 'po', rows: purchaseOrders, date: (r: PurchaseOrder) => r.orderDate, branch: (r: PurchaseOrder) => r.branchId, status: (r: PurchaseOrder) => r.status },
      { name: 'grn', rows: grnNotes, date: (r: GoodsReceiptNote) => r.date, branch: (r: GoodsReceiptNote) => r.branchId },
    ]);
    return e;
  }, [purchaseOrders, grnNotes]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('purchases', filters);
    const pos = sources[0].rows as PurchaseOrder[];
    const grns = sources[1].rows as GoodsReceiptNote[];

    const totalPO = pos.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const totalGRN = grns.reduce((s, g) => s + (g.totalAmount || 0), 0);
    const vatInput = grns.reduce((s, g) => s + (g.vatAmount || 0), 0);

    const bySupplier = new Map<string, { name: string; count: number; total: number }>();
    pos.forEach((p) => {
      const s = bySupplier.get(p.supplierId) || { name: p.supplierName || p.supplierId, count: 0, total: 0 };
      s.count += 1;
      s.total += p.totalAmount || 0;
      bySupplier.set(p.supplierId, s);
    });

    const byStatus = new Map<string, number>();
    pos.forEach((p) => byStatus.set(p.status, (byStatus.get(p.status) || 0) + (p.totalAmount || 0)));

    const summaries: ReportSummaryItem[] = [
      { key: 'poTotal', label: 'قيمة أوامر الشراء', value: totalPO, tone: 'indigo' },
      { key: 'poCount', label: 'عدد الأوامر', value: pos.length },
      { key: 'grnTotal', label: 'قيمة الاستلامات', value: totalGRN },
      { key: 'vat', label: 'ضريبة مدخلات', value: vatInput, tone: 'amber' },
    ];

    const t1 = new ReportTableBuilder()
      .addColumn(reportColumn('supplier', 'المورد'))
      .addColumn(reportColumn('count', 'عدد الأوامر'))
      .addColumn({ ...reportColumn('total', 'القيمة'), aggregate: 'sum' })
      .addColumn(reportPct('share', 'النسبة %'))
      .addRows(Array.from(bySupplier.entries()).map(([id, s]) => ({
        id,
        values: { supplier: s.name, count: s.count, total: s.total, share: totalPO ? (s.total / totalPO) * 100 : 0 },
      })));

    const t2 = new ReportTableBuilder()
      .addColumn(reportColumn('status', 'الحالة'))
      .addColumn({ ...reportColumn('total', 'القيمة'), aggregate: 'sum' })
      .addColumn(reportColumn('count', 'عدد الأوامر'))
      .addRows(Array.from(byStatus.entries()).map(([st, total]) => ({
        id: st,
        values: { status: PO_STATUS_LABELS[st] || st, total, count: pos.filter((p) => p.status === st).length },
      })));

    const t3 = new ReportTableBuilder()
      .addColumn(reportColumn('grn', 'رقم GRN'))
      .addColumn(reportColumn('supplier', 'المورد'))
      .addColumn(reportColumn('branch', 'الفرع'))
      .addColumn(reportColumn('date', 'التاريخ'))
      .addColumn({ ...reportColumn('net', 'الصافي'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('vat', 'الضريبة'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('gross', 'الإجمالي'), aggregate: 'sum' })
      .addRows(grns.map((g) => ({
        id: g.id,
        values: { grn: g.grnNumber, supplier: g.supplierName, branch: branchName(g.branchId, getBranchName), date: g.date, net: (g.totalAmount || 0) - (g.vatAmount || 0), vat: g.vatAmount || 0, gross: g.totalAmount || 0 },
      })));

    return {
      id: 'purchases',
      title: 'المشتريات الموحدة',
      subtitle: 'أوامر الشراء حسب المورد والحالة وإشعارات الاستلام',
      summaries,
      tables: [t1.build(), t2.build(), t3.build()],
      exportSheets: [
        { name: 'ملخص المشتريات', header: ['البند', 'القيمة'], rows: [['قيمة أوامر الشراء', totalPO], ['عدد الأوامر', pos.length], ['قيمة الاستلامات', totalGRN], ['ضريبة مدخلات', vatInput]] },
        { name: 'حسب المورد', header: ['المورد', 'عدد الأوامر', 'القيمة', 'النسبة %'], rows: Array.from(bySupplier.values()).map((s) => [s.name, s.count, s.total, `${totalPO ? (s.total / totalPO * 100).toFixed(2) : '0.00'}%`]) },
        { name: 'حسب الحالة', header: ['الحالة', 'القيمة', 'عدد الأوامر'], rows: Array.from(byStatus.entries()).map(([st, total]) => [PO_STATUS_LABELS[st] || st, total, pos.filter((p) => p.status === st).length]) },
        { name: 'إشعارات الاستلام', header: ['رقم GRN', 'المورد', 'الفرع', 'التاريخ', 'الصافي', 'الضريبة', 'الإجمالي'], rows: grns.map((g) => [g.grnNumber, g.supplierName, branchName(g.branchId, getBranchName), g.date, (g.totalAmount || 0) - (g.vatAmount || 0), g.vatAmount || 0, g.totalAmount || 0]) },
      ],
      generatedAt: new Date().toISOString(),
    };
  }, [engine, filters, getBranchName]);

  return (
    <ReportTemplate
      report={result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={branchOptions}
      showStatus
      statusOptions={Object.entries(PO_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
    />
  );
};

export default UnifiedPurchasesReport;