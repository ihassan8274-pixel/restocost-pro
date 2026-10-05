import { useState } from 'react';
import { useApp } from '../stores/hooks/useAppCompat';

export const useAdminDelete = () => {
  const { verifyAdminPassword, showToast } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requestDelete = (action: () => void) => {
    setPendingAction(() => action);
    setIsModalOpen(true);
    setPassword('');
  };

  const confirmDelete = async () => {
    if (!(await verifyAdminPassword(password))) {
      showToast('كلمة مرور مسؤول النظام خاطئة');
      return;
    }
    if (pendingAction) {
      pendingAction();
    }
    setIsModalOpen(false);
    setPassword('');
    setPendingAction(null);
  };

  const cancelDelete = () => {
    setIsModalOpen(false);
    setPassword('');
    setPendingAction(null);
  };

  return {
    isModalOpen,
    password,
    setPassword,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
};

export const AdminDeleteModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  password: string;
  setPassword: (p: string) => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
}> = ({ isOpen, onClose, onConfirm, password, setPassword, title = 'تأكيد الحذف', message = 'هذا الإجراء لا يمكن التراجع عنه. يرجى إدخال كلمة مرور مسؤول النظام للمتابعة.', confirmLabel = 'تأكيد الحذف' }) => {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{message}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">كلمة مرور مسؤول النظام</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              autoComplete="current-password"
              autoFocus
              placeholder="أدخل كلمة المرور"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium">{confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
};