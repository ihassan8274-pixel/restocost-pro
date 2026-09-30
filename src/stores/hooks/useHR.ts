import { useHRStore } from '@stores/hrStore';

export const useHR = () => {
  const {
    employees, shifts, attendance, payrollPeriods, employeeMeals,
    tasks, tempLogs, haccpInspections,
    addShift, addEmployee, updateEmployee, deleteEmployee,
    addAttendance, updateAttendance, deleteAttendance,
    generatePayroll, confirmPayroll, deletePayrollPeriod,
    addEmployeeMeal, deleteEmployeeMeal,
    addTask, updateTask, completeTask, reopenTask, cancelTask, deleteTask,
    addTempLog, deleteTempLog, addHaccpInspection,
  } = useHRStore();

  return {
    employees, shifts, attendance, payrollPeriods, employeeMeals,
    tasks, tempLogs, haccpInspections,
    addShift, addEmployee, updateEmployee, deleteEmployee,
    addAttendance, updateAttendance, deleteAttendance,
    generatePayroll, confirmPayroll, deletePayrollPeriod,
    addEmployeeMeal, deleteEmployeeMeal,
    addTask, updateTask, completeTask, reopenTask, cancelTask, deleteTask,
    addTempLog, deleteTempLog, addHaccpInspection,
  };
};