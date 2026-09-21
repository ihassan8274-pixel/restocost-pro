// ============================================================
// مثال استخدام موديول التقارير الموحد
// ============================================================

// الاستيراد من نقطة الدخول الموحدة
/*
import {
  // Types
  type ReportDefinition,
  type ReportResult,
  type ReportFilters,
  type PeriodRange,
  type ReportFamily,
  type KPIValue,
  type AggregatedRow,
  type MetricId,
  
  // Data Layer
  {
    getBranches,
    getBatchSales,
    getGRN,
    getInventory,
    getDailyCounts,
    getRecipes,
    getOperatingExpenses,
    getJournal,
    getShifts,
    getPayroll,
    getRawMaterials,
    getSuppliers,
    getStockTransfers,
    getDistributions,
    getAudit,
    getPurchaseOrders,
    METRICS_DICTIONARY,
    METRICS_BY_CATEGORY,
    getMetric,
    filterByPeriod,
    filterByBranch,
    resolvePeriod,
    getComparePeriod,
  },
  
  // Engine
  {
    computeReport,
    clearCache,
    computationCache,
  },
  
  // Registry
  {
    REPORT_DEFINITIONS,
    REPORT_FAMILIES,
    getReportDefinition,
    getAllReportDefinitions,
    getReportsByFamily,
    getAllFamilies,
    getFamilyById,
    FAMILY_KPI_METRICS,
  },
  
  // Export
  {
    exportToExcel,
    exportToPDF,
    openPrintWindow,
    downloadBlob,
    buildPrintHTML,
    buildExcelWorkbook,
    buildPrintSpec,
  },
  
  // Hooks
  {
    useReport,
    useReportFamilies,
    useReportFilters,
    usePeriodComparison,
    useKPIs,
    useReportTable,
  },
  
  // Scheduler
  {
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    getScheduledReport,
    getAllScheduledReports,
    startScheduler,
    stopScheduler,
    runScheduledReportNow,
    getSchedulerStatus,
    loadScheduledReportsFromServer,
    syncScheduledReportsToServer,
  },
  
  // UI Components
  {
    UnifiedReportScreen,
    ReportFamilySelector,
    KPICardsGrid,
    DataTable,
    ReportScheduler,
  },
} from '..';
*/

// ============================================================
// مثال: استخدام الخطافات
// ============================================================

/*
function MyReportPage() {
  const {
    result,
    loading,
    filters,
    setFilters,
    resetFilters,
    runReport,
    refresh,
    exportExcel,
    exportPDF,
    printReport,
    kpis,
    rows,
    totals,
    series,
    warnings,
    meta,
    definition,
  } = useReport({
    reportId: 'monthly-branch-performance',
    initialFilters: {
      period: resolvePeriod('this-month'),
      branchIds: ['b-1'],
    },
    autoRun: true,
  });
  
  return (
    <div>
      <h1>تقرير الأداء الشهري</h1>
      
      {/* فلترات *}
      <div>
        <select onChange={(e) => setFilters({ period: resolvePeriod(e.target.value) })}>
          <option value="this-month">هذا الشهر</option>
          <option value="last-month">الشهر الماضي</option>
        </select>
      </div>
      
      {/* KPIs *}
      <KPICardsGrid kpis={kpis} />
      
      {/* جدول *}
      <DataTable rows={rows} totals={totals} filters={filters} />
      
      {/* أزرار التصدير *}
      <button onClick={exportExcel}>تصدير Excel</button>
      <button onClick={exportPDF}>تصدير PDF</button>
      <button onClick={printReport}>طباعة</button>
    </div>
  );
}

// ============================================================
// مثال: استخدام الشاشة الموحدة
// ============================================================

function App() {
  return (
    <div>
      <UnifiedReportScreen
        reportId="monthly-branch-performance"
        availableBranches={[
          { id: 'b-1', name: 'الفرع الرئيسي' },
          { id: 'b-2', name: 'فرع الجبيل' },
        ]}
      />
    </div>
  );
}

// ============================================================
// مثال: الجدولة التلقائية
// ============================================================

/*
function SchedulerExample() {
  // بدء الجدولة
  useEffect(() => {
    startScheduler(60000); // فحص كل دقيقة
    loadScheduledReportsFromServer();
    return () => stopScheduler();
  }, []);
  
  // إنشاء جدولة جديدة
  const handleCreate = () => {
    createScheduledReport({
      reportId: 'monthly-branch-performance',
      name: 'تقرير أداء الفروع الشهري',
      enabled: true,
      schedule: {
        suggested: true,
        frequency: 'monthly',
        cron: '0 6 1 * *',
        channels: ['telegram', 'email', 'file'],
        formats: ['pdf', 'excel'],
      },
      filters: { period: { from: '', to: '', preset: 'this-month' }, branchIds: [], companyIds: [], categoryIds: [], supplierIds: [], expenseCategoryIds: [], movementTypeIds: [], status: [] },
      recipients: [
        { type: 'telegram', target: '-1001234567890', format: 'pdf' },
        { type: 'email', target: 'reports@example.com', format: 'excel' },
      ],
      status: 'pending',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };
  
  return (
    <ReportScheduler
      scheduledReports={getAllScheduledReports()}
      onCreateSchedule={handleCreate}
      onRunNow={(id) => runScheduledReportNow(id)}
      onDelete={(id) => deleteScheduledReport(id)}
    />
  );
}
*/

// هذا الملف مثال توثيقي فقط (كل الأكواد أعلاه معلّقة)، ولا يصدّر أي شيء.
export {};
