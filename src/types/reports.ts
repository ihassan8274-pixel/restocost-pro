// تقرير مخصص محفوظ من مصمّم التقارير الموحّد (باني داخلي + jsreport)
export interface CustomReport {
  id: string;
  name: string;
  datasetId: string;
  columns: string[];
  filters: Record<string, string>;
  groupBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BranchPLSummary {
  branchId: string;
  branchName: string;
  period: string;
  totalSales: number;
  foodCost: number;
  laborCost: number;
  primeCost: number;
  operatingExpenses: number;
  netProfit: number;
  foodCostPercent: number;
  laborCostPercent: number;
  primeCostPercent: number;
  netProfitPercent: number;
}