import React, { useState } from 'react';
import { ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Btn, inputCls } from '../ui';

export const ForcePasswordChangeView: React.FC = () => {
  const { changePassword, logout, currentUser } = useApp();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    if (!oldPassword || !newPassword) { setError('أدخل كلمة المرور الحالية والجديدة'); return; }
    if (newPassword.length < 8) { setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف'); return; }
    if (newPassword === oldPassword) { setError('كلمة المرور الجديدة يجب أن تختلف عن الحالية'); return; }
    if (newPassword !== confirm) { setError('تأكيد كلمة المرور غير مطابق'); return; }
    setSaving(true);
    const r = await changePassword(oldPassword, newPassword);
    setSaving(false);
    if (!r.ok) { setError(r.error || 'تعذر تغيير كلمة المرور'); return; }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 dark:text-white text-base">تغيير كلمة المرور مطلوب</h1>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">حساب {currentUser?.name || ''} لا يزال يستخدم كلمة المرور الافتراضية</p>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              لأمان بياناتك (خاصة عند فتح النظام عبر الإنترنت) يجب استبدال كلمة المرور الافتراضية
              بكلمة مرور قوية قبل الدخول للنظام.
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور الحالية</label>
              <input type="password" className={inputCls} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="كلمة المرور الحالية" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور الجديدة</label>
              <input type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8 أحرف على الأقل" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">تأكيد كلمة المرور الجديدة</label>
              <input type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="أعد كتابة كلمة المرور" />
            </div>
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

          <div className="flex gap-2">
            <Btn onClick={submit} disabled={saving} tone="primary" className="flex-1">
              {saving ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </Btn>
            <Btn onClick={logout} tone="ghost">تسجيل الخروج</Btn>
          </div>

          <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            بعد الحفظ ستُغلَق جميع الجلسات الأخرى لهذا الحساب تلقائياً.
          </p>
        </div>
      </div>
    </div>
  );
};