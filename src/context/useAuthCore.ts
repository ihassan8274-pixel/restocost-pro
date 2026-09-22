import type { Dispatch, SetStateAction } from 'react';
import { verifyPassword } from './appAuth';
import type { User, UserRole } from '../types';

// كتلة المصادقة المستخرجة من AppProvider: تسجيل الدخول/الخروج، تغيير كلمة المرور،
// إدارة المستخدمين (تحديث/حذف/إلغاء الجلسات) والتحقق الثنائي (TOTP). السلوك مطابق
// للأصل — الاعتماديات (الدوال والطابور) تُحقن كوسائط، والآثار الجانبية للشبكة مباشرة.
interface AuthCoreDeps {
  users: User[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  currentUser: User | null;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setMustChangePassword: (v: boolean) => void;
  setAuthExpired: (v: boolean) => void;
  pendingSaves: Map<string, unknown>;
  flushSaves: () => void;
  retryBootstrap: () => void;
}

export const useAuthCore = (deps: AuthCoreDeps) => {
  const {
    users, setUsers, currentUser, setCurrentUser, setMustChangePassword,
    setAuthExpired, pendingSaves, flushSaves, retryBootstrap,
  } = deps;

  const login = async (email: string, password: string, totpCode?: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.totpRequired) return { ok: false as const, totpRequired: true };
        return { ok: false as const, error: json.error || 'تعذر تسجيل الدخول' };
      }
      localStorage.setItem('rcerp_token', json.token);
      setCurrentUser(json.user);
      setUsers((prev) => prev.map((u) => (u.id === json.user.id ? { ...u, ...json.user } : u)));
      if (json.mustChangePassword) setMustChangePassword(true);
      // بعد تسجيل دخول ناجح بالتوكن الجديد: ألغِ حالة "انتهت الجلسة" وأعد إرسال أي تعديلات محلية معلّقة
      // حتى لا تعلق الرسالة "انتهت الجلسة" وتضيع التغييرات.
      setAuthExpired(false);
      if (pendingSaves.size > 0) flushSaves();
      // أعد التحميل الكامل من الخادم بالتوكن الجديد — الشرط قبل هذا (pendingSaves>0) كان
      // يعرض الكاش القديم بدل بيانات الخادم الحية بعد كل إعادة دخول.
      retryBootstrap();
      return { ok: true };
    } catch {
      // Server unreachable — fall back to local verification
      const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) return { ok: false, error: 'البريد الإلكتروني غير مسجل في النظام' };
      if (user.needsActivation) return { ok: false, error: 'حسابك في انتظار تفعيل مسؤول النظام' };
      if (!user.isActive) return { ok: false, error: 'هذا الحساب موقوف، تواصل مع مدير النظام' };
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return { ok: false, error: 'كلمة المرور غير صحيحة' };
      setCurrentUser(user);
      return { ok: true };
    }
  };

  const register = async (name: string, email: string, password: string, role: UserRole, branchId: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name, email, password, role, branchId }),
      });
      const json = await res.json();
      if (!json.ok) return { ok: false, error: json.error || 'تعذر إنشاء الحساب' };
      if (json.pending) {
        // التسجيل الذاتي: الحساب بانتظار تفعيل مسؤول النظام — لا جلسة ولا دخول
        return { ok: true, pending: true };
      }
      if (token) {
        // authenticated creation (e.g. admin panel): keep the caller's session intact
        setUsers((prev) => [...prev, json.user]);
      } else {
        // anonymous first-run: log the new account in
        localStorage.setItem('rcerp_token', json.token);
        setCurrentUser(json.user);
        setUsers((prev) => [...prev, json.user]);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const logout = () => {
    const token = localStorage.getItem('rcerp_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('rcerp_token');
    setCurrentUser(null);
    setMustChangePassword(false);
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر تغيير كلمة المرور' };
      setMustChangePassword(false);
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const updateUser = async (id: string, data: Partial<User>, opts?: { resetPassword?: string }) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...data, password: opts?.resetPassword }),
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر تحديث المستخدم' };
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...json.user } : u)));
      if (json.user && currentUser && json.user.id === currentUser.id) setCurrentUser((c) => (c ? { ...c, ...json.user } : c));
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر حذف المستخدم' };
      setUsers((prev) => prev.filter((u) => u.id !== id));
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const revokeSessions = async (id: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch(`/api/users/${id}/revoke-sessions`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر إلغاء الجلسات' };
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const totpSetup = async () => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/totp/setup', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر إعداد التحقق' };
      return { ok: true as const, secret: json.secret, otpauthUrl: json.otpauthUrl, enabled: !!json.enabled };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const totpEnable = async (code: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر تفعيل التحقق' };
      setCurrentUser((c) => (c ? { ...c, totpEnabled: true } : c));
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  const totpDisable = async (code: string) => {
    try {
      const token = localStorage.getItem('rcerp_token');
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!json.ok) return { ok: false as const, error: json.error || 'تعذر إيقاف التحقق' };
      setCurrentUser((c) => (c ? { ...c, totpEnabled: false } : c));
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
    }
  };

  return { login, register, logout, changePassword, updateUser, deleteUser, revokeSessions, totpSetup, totpEnable, totpDisable };
};