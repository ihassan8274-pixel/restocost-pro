import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Employee, LaborShift, AttendanceRecord, PayrollPeriod,
  EmployeeMealRecord, Task, TempLogEntry, HaccpInspection,
} from '../types';
import { today } from '../utils/helpers';

interface HRState {
  employees: Employee[];
  shifts: LaborShift[];
  attendance: AttendanceRecord[];
  payrollPeriods: PayrollPeriod[];
  employeeMeals: EmployeeMealRecord[];
  tasks: Task[];
  tempLogs: TempLogEntry[];
  haccpInspections: HaccpInspection[];
  addShift: (data: Omit<LaborShift, 'id' | 'date'>) => void;
  addEmployee: (data: Omit<Employee, 'id' | 'code'>) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  addAttendance: (a: Omit<AttendanceRecord, 'id' | 'employeeName' | 'recordedBy'>) => void;
  updateAttendance: (id: string, data: Partial<AttendanceRecord>) => void;
  deleteAttendance: (id: string) => void;
  generatePayroll: (month: string) => { ok: boolean; error?: string };
  confirmPayroll: (id: string) => void;
  deletePayrollPeriod: (id: string) => void;
  addEmployeeMeal: (data: Omit<EmployeeMealRecord, 'id'>) => void;
  deleteEmployeeMeal: (id: string) => void;
  addTask: (data: Omit<Task, 'id' | 'createdAt' | 'status' | 'assignedBy'>) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;
  cancelTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addTempLog: (data: Omit<TempLogEntry, 'id' | 'recordedBy'>) => void;
  deleteTempLog: (id: string) => void;
  addHaccpInspection: (data: Omit<HaccpInspection, 'id' | 'createdAt'>) => void;
}

export const useHRStore = create<HRState>()(
  persist(
    (set, get) => ({
      employees: [],
      shifts: [],
      attendance: [],
      payrollPeriods: [],
      employeeMeals: [],
      tasks: [],
      tempLogs: [],
      haccpInspections: [],

      addShift: (data) => set((state) => ({ shifts: [{ ...data, id: `sft-${Date.now()}`, date: today() }, ...state.shifts] })),
      addEmployee: (data) => set((state) => ({ employees: [...state.employees, { ...data, id: `emp-${Date.now()}`, code: `EMP-${String(state.employees.length + 1).padStart(3, '0')}` }] })),
      updateEmployee: (id, data) => set((state) => ({ employees: state.employees.map((e) => (e.id === id ? { ...e, ...data } : e)) })),
      deleteEmployee: (id) => set((state) => ({ employees: state.employees.filter((e) => e.id !== id) })),

      addAttendance: (a) => {
        const emp = get().employees.find((e) => e.id === a.employeeId);
        if (!emp) return;
        const rec: AttendanceRecord = { ...a, id: `att-${Date.now()}`, employeeName: emp.name, recordedBy: 'المستخدم' };
        set((state) => ({ attendance: state.attendance.some((x) => x.employeeId === a.employeeId && x.date === a.date && x.branchId === a.branchId) ? state.attendance.map((x) => (x.employeeId === a.employeeId && x.date === a.date && x.branchId === a.branchId ? { ...x, ...rec, id: x.id } : x)) : [rec, ...state.attendance] }));
      },
      updateAttendance: (id, data) => set((state) => ({ attendance: state.attendance.map((r) => (r.id === id ? { ...r, ...data } : r)) })),
      deleteAttendance: (id) => set((state) => ({ attendance: state.attendance.filter((r) => r.id !== id) })),

      generatePayroll: (month) => {
        if (get().payrollPeriods.some((p) => p.month === month)) return { ok: false, error: 'يوجد كشف رواتب لهذا الشهر' };
        const lines = get().employees.filter((e) => e.isActive).map((e) => {
          const baseSalary = e.monthlyBaseSalary || 0;
          const workedDays = 30;
          const hoursWorked = workedDays * 8;
          return {
            employeeId: e.id,
            employeeName: e.name,
            branchId: e.branchId || '',
            baseSalary,
            workedDays,
            absentDays: 0,
            hoursWorked,
            overtimeHours: 0,
            overtimePay: 0,
            bonus: 0,
            deduction: 0,
            grossSalary: baseSalary,
            netSalary: baseSalary,
            hourlyRate: hoursWorked > 0 ? baseSalary / hoursWorked : 0,
            isHourly: false,
          };
        });
        const period: PayrollPeriod = { id: `prp-${Date.now()}`, month, status: 'draft', lines, totalGross: 0, totalDeductions: 0, totalNet: 0, generatedBy: 'المستخدم', createdAt: new Date().toISOString() };
        set((state) => ({ payrollPeriods: [period, ...state.payrollPeriods] }));
        return { ok: true };
      },
      confirmPayroll: (id) => set((state) => ({ payrollPeriods: state.payrollPeriods.map((p) => (p.id === id ? { ...p, status: 'confirmed' as const } : p)) })),
      deletePayrollPeriod: (id) => set((state) => ({ payrollPeriods: state.payrollPeriods.filter((p) => p.id !== id) })),

      addEmployeeMeal: (data) => set((state) => ({ employeeMeals: [{ ...data, id: `meal-${Date.now()}` }, ...state.employeeMeals] })),
      deleteEmployeeMeal: (id) => set((state) => ({ employeeMeals: state.employeeMeals.filter((m) => m.id !== id) })),

      addTask: (data) => set((state) => ({ tasks: [{ ...data, id: `task-${Date.now()}`, createdAt: new Date().toISOString(), status: 'open' as const, assignedBy: 'المستخدم' }, ...state.tasks] })),
      updateTask: (id, data) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)) })),
      completeTask: (id) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'done' as const, completedAt: new Date().toISOString() } : t)) })),
      reopenTask: (id) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'open' as const, completedAt: undefined } : t)) })),
      cancelTask: (id) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'cancelled' as const } : t)) })),
      deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      addTempLog: (data) => set((state) => ({ tempLogs: [{ ...data, id: `temp-${Date.now()}`, recordedBy: 'المستخدم' }, ...state.tempLogs] })),
      deleteTempLog: (id) => set((state) => ({ tempLogs: state.tempLogs.filter((t) => t.id !== id) })),
      addHaccpInspection: (data) => set((state) => ({ haccpInspections: [{ ...data, id: `haccp-${Date.now()}`, createdAt: new Date().toISOString() }, ...state.haccpInspections] })),
    }),
    { name: 'rcerp_hr' }
  )
);
