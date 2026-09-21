import React, { useState } from 'react';
import { KeyRound, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Btn, Field, inputCls, Modal } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<Props> = ({ open, onClose }) => {
  const { changePassword, currentUser } = useApp();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    setError('');
    setSuccess(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError('');
    if (!oldPassword || !newPassword || !confirm) { setError('أدخل كلمة المرور الحالية والجديدة وتأكيدها'); return; }
    if (newPassword.length < 8) { setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف'); return; }
    if (newPassword === oldPassword) { setError('كلمة المرور الجديدة يجب أن تختلف عن الحالية'); return; }
    if (newPassword !== confirm) { setError('تأكيد كلمة المرور غير مطابق'); return; }
    setSaving(true);
    const r = await changePassword(oldPassword, newPassword);
    setSaving(false);
    if (!r.ok) { setError(r.error || 'تعذر تغيير كلمة المرور'); return; }
    setSuccess(true);
  };

  return (
    <Modal open={open} onClose={close} title="تغيير كلمة المرور">
      {success ? (
        <div className="text-center py-6 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="font-extrabold text-slate-800">تم تغيير كلمة المرور بنجاح</p>
          <p className="text-xs text-slate-500">ستستخدم كلمة المرور الجديدة في تسجيل الدخول القادم</p>
          <div className="flex justify-end pt-2">
            <Btn onClick={close}>إغلاق</Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <Lock className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="text-[11px] text-slate-600 font-bold leading-snug">
              حساب: <span className="text-slate-900">{currentUser?.name}</span> ({currentUser?.email})
            </div>
          </div>

          <Field label="كلمة المرور الحالية" required>
            <input dir="ltr" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={inputCls} placeholder="أدخل كلمة المرور الحالية" autoComplete="current-password" />
          </Field>
          <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل وتحتوي حرفاً كبيراً ورقماً">
            <input dir="ltr" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="أدخل كلمة المرور الجديدة" autoComplete="new-password" />
          </Field>
          <Field label="تأكيد كلمة المرور الجديدة" required>
            <input dir="ltr" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="أعد كتابة كلمة المرور الجديدة" autoComplete="new-password" />
          </Field>

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs font-bold text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Btn tone="ghost" onClick={close}>إلغاء</Btn>
            <Btn onClick={submit} disabled={saving}><KeyRound className="w-4 h-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};
