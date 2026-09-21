// ============ OPERATING EXPENSES ============
export type OperatingExpenseCategory =
  | 'rent' | 'utilities' | 'internet_telecom' | 'maintenance_repairs'
  | 'cleaning_supplies' | 'marketing_advertising' | 'delivery_platform_commissions'
  | 'licensing_permits' | 'software_subscriptions' | 'insurance' | 'misc';

export type ExpensePaymentStatus = 'paid' | 'pending' | 'overdue';
export type ExpenseRecurrence = 'one_time' | 'monthly' | 'quarterly' | 'yearly';

export interface OperatingExpense {
  id: string;
  expenseNumber: string;
  branchId: string;
  category: OperatingExpenseCategory;
  description: string;
  amount: number;
  dueDate: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: string;
  recurrence: ExpenseRecurrence;
  vendor?: string;
  invoiceNumber?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface ExpenseBudgetItem {
  category: OperatingExpenseCategory;
  budgetedAmount: number;
}

export interface ExpenseBudget {
  branchId: string;
  month: string;
  items: ExpenseBudgetItem[];
}