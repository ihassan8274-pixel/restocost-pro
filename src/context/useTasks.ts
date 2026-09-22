import { useState } from 'react';
import type { Task } from '../types';
import type { ToastEntry } from './useToasts';

// كبسولة «المهام والتكليفات» المستخرجة من AppProvider: الحالة + كل الموجّهات (حفظ/
// تعديل/إنجاز/إعادة فتح/إلغاء/حذف). السلوك مطابق للأصل — الآثار الجانبية (audit/toast
// واسم المكلِّف) تُحقن كاعتماديات.
interface UseTasksDeps {
  currentUser: { name?: string } | null;
  logAudit: (action: string, module: string, details?: string) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void;
}

export const useTasks = ({ currentUser, logAudit, showToast }: UseTasksDeps) => {
  const [tasks, setTasks] = useState<Task[]>([]);

  const addTask = (data: Omit<Task, 'id' | 'createdAt' | 'status' | 'assignedBy'>) => {
    const t: Task = {
      ...data,
      id: `task-${Date.now()}`,
      assignedBy: currentUser?.name || 'النظام',
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [t, ...prev]);
    logAudit('إنشاء مهمة', 'المهام', t.title);
    showToast(`أُسندت مهمة «${t.title}»${t.assigneeIds.length ? ' إلى ' + t.assigneeIds.length + ' مستخدم' : ''}`);
  };
  const updateTask = (id: string, data: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    logAudit('تعديل مهمة', 'المهام', id);
  };
  const completeTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done', completedAt: new Date().toISOString() } : t)));
    logAudit('إنجاز مهمة', 'المهام', id);
    showToast('أُنجزت المهمة ✓');
  };
  const reopenTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'open', completedAt: undefined } : t)));
    logAudit('إعادة فتح مهمة', 'المهام', id);
  };
  const cancelTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t)));
    logAudit('إلغاء مهمة', 'المهام', id);
  };
  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    logAudit('حذف مهمة', 'المهام', id);
  };

  return { tasks, setTasks, addTask, updateTask, completeTask, reopenTask, cancelTask, deleteTask };
};