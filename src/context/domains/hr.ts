import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Employee, LaborShift, AttendanceRecord, PayrollPeriod, EmployeeMealRecord, User, UserRole } from '../../types';

interface HRState {
  employees: Employee[];
  shifts: LaborShift[];
  attendance: AttendanceRecord[];
  payrollPeriods: PayrollPeriod[];
  employeeMeals: EmployeeMealRecord[];
  users: User[];
  customRoles: string[];
  
  pendingChanges: Map<string, unknown>;
  
  // Setters (for sync engine)
  setEmployees: (data: Employee[]) => void;
  setShifts: (data: LaborShift[]) => void;
  setAttendance: (data: AttendanceRecord[]) => void;
  setPayrollPeriods: (data: PayrollPeriod[]) => void;
  setEmployeeMeals: (data: EmployeeMealRecord[]) => void;
  setUsers: (data: User[]) => void;
  setCustomRoles: (data: string[]) => void;
  
  // Actions
  addEmployee: (e: Omit<Employee, 'id' | 'code'>) => void;
  updateEmployee: (id: string, e: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  
  addShift: (s: Omit<LaborShift, 'id' | 'date'>) => void;
  
  addAttendance: (a: Omit<AttendanceRecord, 'id' | 'employeeName' | 'recordedBy'>) => void;
  updateAttendance: (id: string, a: Partial<AttendanceRecord>) => void;
  deleteAttendance: (id: string) => void;
  
  generatePayroll: (month: string) => { ok: boolean; error?: string };
  confirmPayroll: (id: string) => void;
  deletePayrollPeriod: (id: string) => void;
  
  addEmployeeMeal: (m: Omit<EmployeeMealRecord, 'id'>) => void;
  deleteEmployeeMeal: (id: string) => void;
  
  addCustomRole: (role: string) => void;
  deleteCustomRole: (role: string) => void;
  
  // User management (delegates to auth store for actual API calls)
  login: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; error?: string; totpRequired?: boolean }>;
  register: (name: string, email: string, password: string, role: UserRole, branchId: string) => Promise<{ ok: boolean; error?: string; pending?: boolean }>;
  logout: () => void;
  updateUser: (id: string, data: Partial<User>, opts?: { resetPassword?: string }) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  revokeSessions: (id: string) => Promise<{ ok: boolean; error?: string }>;
  totpSetup: () => Promise<{ ok: boolean; error?: string; secret?: string; otpauthUrl?: string; enabled?: boolean }>;
  totpEnable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  totpDisable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  
  // Sync
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useHRStore = create<HRState>()(
  persist(
    (set, get) => ({
      employees: [],
      shifts: [],
      attendance: [],
      payrollPeriods: [],
      employeeMeals: [],
      users: [],
      customRoles: [],
      pendingChanges: new Map(),
      
      // Setters
      setEmployees: (data) => { set({ employees: data }); get().markPending('rcerp_employees', data); },
      setShifts: (data) => { set({ shifts: data }); get().markPending('rcerp_shifts', data); },
      setAttendance: (data) => { set({ attendance: data }); get().markPending('rcerp_attendance', data); },
      setPayrollPeriods: (data) => { set({ payrollPeriods: data }); get().markPending('rcerp_payroll', data); },
      setEmployeeMeals: (data) => { set({ employeeMeals: data }); get().markPending('rcerp_employee_meals', data); },
      setUsers: (data) => { set({ users: data }); get().markPending('rcerp_users', data); },
      setCustomRoles: (data) => { set({ customRoles: data }); get().markPending('rcerp_custom_roles', data); },
      
      // Actions
      addEmployee: (e) => { set((state) => ({ employees: [...state.employees, { ...e, id: uid('emp'), code: `EMP-${Date.now().toString(36).toUpperCase()}` }] })); get().markPending('rcerp_employees', get().employees); },
      updateEmployee: (id, e) => { set((state) => ({ employees: state.employees.map(emp => emp.id === id ? { ...emp, ...e } : emp) })); get().markPending('rcerp_employees', get().employees); },
      deleteEmployee: (id) => { set((state) => ({ employees: state.employees.filter(emp => emp.id !== id) })); get().markPending('rcerp_employees', get().employees); },
      
      addShift: (s) => { set((state) => ({ shifts: [...state.shifts, { ...s, id: uid('shf'), date: new Date().toISOString().split('T')[0] }] })); get().markPending('rcerp_shifts', get().shifts); },
      
      addAttendance: (a) => { set((state) => ({ attendance: [...state.attendance, { ...a, id: uid('att'), employeeName: '', recordedBy: 'current-user' }] })); get().markPending('rcerp_attendance', get().attendance); },
      updateAttendance: (id, a) => { set((state) => ({ attendance: state.attendance.map(at => at.id === id ? { ...at, ...a } : at) })); get().markPending('rcerp_attendance', get().attendance); },
      deleteAttendance: (id) => { set((state) => ({ attendance: state.attendance.filter(at => at.id !== id) })); get().markPending('rcerp_attendance', get().attendance); },
      
      generatePayroll: (month) => { const period: PayrollPeriod = { id: uid('pp'), month, status: 'draft', lines: [], totalGross: 0, totalDeductions: 0, totalNet: 0, createdAt: new Date().toISOString() }; set((state) => ({ payrollPeriods: [...state.payrollPeriods, period] })); get().markPending('rcerp_payroll', get().payrollPeriods); return { ok: true }; },
      confirmPayroll: (id) => { set((state) => ({ payrollPeriods: state.payrollPeriods.map(p => p.id === id ? { ...p, status: 'confirmed' as const } : p) })); get().markPending('rcerp_payroll', get().payrollPeriods); },
      deletePayrollPeriod: (id) => { set((state) => ({ payrollPeriods: state.payrollPeriods.filter(p => p.id !== id) })); get().markPending('rcerp_payroll', get().payrollPeriods); },
      
      addEmployeeMeal: (m) => { set((state) => ({ employeeMeals: [...state.employeeMeals, { ...m, id: uid('meal') }] })); get().markPending('rcerp_employee_meals', get().employeeMeals); },
      deleteEmployeeMeal: (id) => { set((state) => ({ employeeMeals: state.employeeMeals.filter(m => m.id !== id) })); get().markPending('rcerp_employee_meals', get().employeeMeals); },
      
      addCustomRole: (role) => { set((state) => ({ customRoles: [...state.customRoles, role] })); get().markPending('rcerp_custom_roles', get().customRoles); },
      deleteCustomRole: (role) => { set((state) => ({ customRoles: state.customRoles.filter(r => r !== role) })); get().markPending('rcerp_custom_roles', get().customRoles); },
      
      // User management - placeholders (actual implementation in auth store)
      login: async () => ({ ok: false, error: 'Use useAuthStore for login' }),
      register: async () => ({ ok: false, error: 'Use useAuthStore for register', pending: false }),
      logout: () => {},
      updateUser: async () => ({ ok: false, error: 'Use useAuthStore' }),
      deleteUser: async () => ({ ok: false, error: 'Use useAuthStore' }),
      revokeSessions: async () => ({ ok: false, error: 'Use useAuthStore' }),
      totpSetup: async () => ({ ok: false, error: 'Use useAuthStore' }),
      totpEnable: async () => ({ ok: false, error: 'Use useAuthStore' }),
      totpDisable: async () => ({ ok: false, error: 'Use useAuthStore' }),
      
      // Sync
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-hr',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        employees: state.employees,
        shifts: state.shifts,
        attendance: state.attendance,
        payrollPeriods: state.payrollPeriods,
        employeeMeals: state.employeeMeals,
        customRoles: state.customRoles,
      }),
    }
  )
);

export const useEmployees = () => useHRStore(state => state.employees);
export const useShifts = () => useHRStore(state => state.shifts);
export const useAttendance = () => useHRStore(state => state.attendance);
export const usePayrollPeriods = () => useHRStore(state => state.payrollPeriods);
export const useEmployeeMeals = () => useHRStore(state => state.employeeMeals);
export const useCustomRoles = () => useHRStore(state => state.customRoles);

export const useHRActions = () => useHRStore(state => ({
  addEmployee: state.addEmployee,
  updateEmployee: state.updateEmployee,
  deleteEmployee: state.deleteEmployee,
  addShift: state.addShift,
  addAttendance: state.addAttendance,
  updateAttendance: state.updateAttendance,
  deleteAttendance: state.deleteAttendance,
  generatePayroll: state.generatePayroll,
  confirmPayroll: state.confirmPayroll,
  deletePayrollPeriod: state.deletePayrollPeriod,
  addEmployeeMeal: state.addEmployeeMeal,
  deleteEmployeeMeal: state.deleteEmployeeMeal,
  addCustomRole: state.addCustomRole,
  deleteCustomRole: state.deleteCustomRole,
}));

export const useHRSyncActions = () => useHRStore(state => ({
  setEmployees: state.setEmployees,
  setShifts: state.setShifts,
  setAttendance: state.setAttendance,
  setPayrollPeriods: state.setPayrollPeriods,
  setEmployeeMeals: state.setEmployeeMeals,
  setUsers: state.setUsers,
  setCustomRoles: state.setCustomRoles,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));