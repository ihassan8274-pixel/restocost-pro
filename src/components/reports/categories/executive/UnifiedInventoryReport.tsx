import React, { useMemo, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { ReportEngine } from '../../_core/ReportEngine';
import { ReportTableBuilder, reportColumn } from '../../_core/ReportFormat';
import { emptyReportFilter, type ReportFilter, type ReportSummaryItem } from '../../_core/ReportTypes';
import { ReportTemplate } from '../../components/ReportTemplate';
import { fmt } from '../../../../utils/helpers';
import { inventoryValuation, coverageDays } from '../../utilities/inventoryMetrics';
import type { InventoryRecord, RawMaterial } from '../../../../types';

/** تقرير المخزون الموحد: تقييم القيم والكميات حسب الصنف */
export const UnifiedInventoryReport: React.FC = () => {
  const { inventory, rawMaterials, batchSalesRecords } = useApp();
  const [filters, setFilters] = useState<ReportFilter>(emptyReportFilter());

  const engine = useMemo(() => {
    const e = new ReportEngine();
    e.register({ id: 'inventory', title: 'تقييم المخزون الموحد', subtitle: 'قيمة المخزون الحالي حسب الصنف' }, [
      // المخزون ليس له تاريخ يعقل فلترة عليه — نسجله بلاdate ليُفلتر بالفرع فقط
      { name: 'inventory', rows: inventory, branch: (r: InventoryRecord) => r.branchId },
      { name: 'sales', rows: batchSalesRecords, date: (r: { date: string }) => r.date, branch: (r: { branchId: string }) => r.branchId },
    ]);
    return e;
  }, [inventory, batchSalesRecords]);

  const result = useMemo(() => {
    const sources = engine.applyFilters('inventory', filters);
    const invRows = sources[0].rows as InventoryRecord[];
    const sales = sources[1].rows as { totalRevenue: number; totalFoodCost: number }[];

    const rowsArr = inventoryValuation(invRows, rawMaterials as RawMaterial[]);
    const totalValue = rowsArr.reduce((s, r) => s + r.value, 0);
    const totalQty = rowsArr.reduce((s, r) => s + r.quantity, 0);
    const foodCost = sales.reduce((s, r) => s + (r.totalFoodCost || 0), 0);

    const summaries: ReportSummaryItem[] = [
      { key: 'value', label: 'قيمة المخزون', value: totalValue, tone: 'indigo' },
      { key: 'items', label: 'عدد الأصناف', value: rowsArr.length },
      { key: 'qty', label: 'إجمالي الكمية', value: totalQty },
      { key: 'coverage', label: 'أيام التغطية (تقديرية)', value: coverageDays(foodCost / 30, totalValue), format: (v) => `${fmt(Number(v))} يوم` },
    ];

    const t = new ReportTableBuilder()
      .addColumn(reportColumn('name', 'المادة'))
      .addColumn(reportColumn('unit', 'الوحدة'))
      .addColumn({ ...reportColumn('qty', 'الكمية'), aggregate: 'sum' })
      .addColumn({ ...reportColumn('price', 'سعر الوحدة') })
      .addColumn({ ...reportColumn('value', 'القيمة'), aggregate: 'sum' })
      .addRows(rowsArr.map((r) => ({
        id: r.rawMaterialId,
        values: { name: r.name, unit: r.unit, qty: r.quantity, price: r.price, value: r.value },
      })));

    return {
      id: 'inventory',
      title: 'تقييم المخزون الموحد',
      subtitle: 'قيمة المخزون الحالي حسب الصنف',
      summaries,
      tables: [t.build()],
      exportSheets: [
        { name: 'تقييم المخزون', header: ['المادة', 'الوحدة', 'الكمية', 'سعر الوحدة', 'القيمة'], rows: [...rowsArr.map((r) => [r.name, r.unit, r.quantity, r.price, r.value]), ['','','','', totalValue]] },
      ],
      generatedAt: new Date().toISOString(),
    };
  }, [engine, filters, rawMaterials]);

  return (
    <ReportTemplate
      report={result}
      filters={filters}
      onFiltersChange={setFilters}
      branches={[]}
    />
  );
};

export default UnifiedInventoryReport;