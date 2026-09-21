export interface Employee {
  id: string;
  code: string;
  name: string;
  role: string;
  branchId: string;
  hourlyRate: number;
  monthlyBaseSalary: number;
  phone: string;
  isActive: boolean;
}

export interface LaborShift {
  id: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  totalShiftCost: number;
  ordersHandled: number;
}

// ============ ATTENDANCE & PAYROLL ============
export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'late';

export interface AttendanceRecord {
  id: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  hoursWorked: number;
  overtimeHours: number;
  overtimeRateMultiplier?: number;
  bonus?: number;
  deduction?: number;
  notes?: string;
  recordedBy?: string;
}

export type PayrollStatus = 'draft' | 'confirmed';

export interface PayrollLine {
  employeeId: string;
  employeeName: string;
  branchId: string;
  baseSalary: number;
  workedDays: number;
  absentDays: number;
  hoursWorked: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  deduction: number;
  grossSalary: number;
  netSalary: number;
  hourlyRate: number;
  isHourly: boolean;
}

export interface PayrollPeriod {
  id: string;
  month: string;            // YYYY-MM
  status: PayrollStatus;
  lines: PayrollLine[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  generatedBy?: string;
  confirmedBy?: string;
  createdAt: string;
  confirmedAt?: string;
}