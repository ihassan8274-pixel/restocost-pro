import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, UserRole, Permission, AccessRole } from '../types';
import { ROLE_PERMISSIONS } from '../types';
import { getNavItem } from '../navigation';

interface AuthState {
  users: User[];
  currentUser: User | null;
  mustChangePassword: boolean;
  accessRoles: AccessRole[];
  authExpired: boolean;
  setUsers: (users: User[]) => void;
  setCurrentUser: (user: User | null) => void;
  setMustChangePassword: (v: boolean) => void;
  setAuthExpired: (v: boolean) => void;
  login: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; error?: string; totpRequired?: boolean }>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  revokeSessions: (userId: string) => void;
  totpSetup: () => Promise<{ ok: boolean; secret?: string; otpauthUrl?: string; error?: string }>;
  totpEnable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  totpDisable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  can: (permission: Permission) => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  visibleBranchIds: string[];
  upsertAccessRole: (role: AccessRole) => void;
  removeAccessRole: (id: string) => void;
  screenCan: (screenId: string, action?: 'view' | 'add' | 'edit' | 'delete') => boolean;
  verifyAdminPassword: (password: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,
      mustChangePassword: false,
      accessRoles: [],
      authExpired: false,
      visibleBranchIds: [],

      setUsers: (users) => set({ users }),
      setCurrentUser: (user) => set({ currentUser: user }),
      setMustChangePassword: (v) => set({ mustChangePassword: v }),
      setAuthExpired: (v) => set({ authExpired: v }),

      login: async (email, password, totpCode) => {
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
          set({ currentUser: json.user, mustChangePassword: json.mustChangePassword || false, authExpired: false });
          set((state) => ({ users: state.users.map((u) => (u.id === json.user.id ? { ...u, ...json.user } : u)) }));
          return { ok: true };
        } catch {
          const { users } = get();
          const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
          if (!user) return { ok: false, error: 'البريد الإلكتروني غير مسجل في النظام' };
          if (user.needsActivation) return { ok: false, error: 'حسابك في انتظار تفعيل مسؤول النظام' };
          if (!user.isActive) return { ok: false, error: 'هذا الحساب موقوف، تواصل مع مدير النظام' };
          set({ currentUser: user });
          return { ok: true };
        }
      },

      logout: async () => {
        const token = localStorage.getItem('rcerp_token');
        if (token) {
          try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
        }
        localStorage.removeItem('rcerp_token');
        set({ currentUser: null, mustChangePassword: false });
      },

      changePassword: async (oldPassword, newPassword) => {
        try {
          const token = localStorage.getItem('rcerp_token');
          const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ oldPassword, newPassword }),
          });
          const json = await res.json();
          if (!json.ok) return { ok: false, error: json.error || 'فشل تغيير كلمة المرور' };
          return { ok: true };
        } catch {
          return { ok: false, error: 'الخادم غير متاح' };
        }
      },

      updateUser: (id, data) => set((state) => ({ users: state.users.map((u) => (u.id === id ? { ...u, ...data } : u)) })),
      deleteUser: (id) => set((state) => ({ users: state.users.filter((u) => u.id !== id) })),
      revokeSessions: () => {},

      totpSetup: async () => {
        try {
          const token = localStorage.getItem('rcerp_token');
          const res = await fetch('/api/auth/totp/setup', { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
          const json = await res.json();
          if (!json.ok) return { ok: false, error: json.error || 'فشل إعداد TOTP' };
          return { ok: true, secret: json.secret, otpauthUrl: json.otpauthUrl };
        } catch {
          return { ok: false, error: 'الخادم غير متاح' };
        }
      },

      totpEnable: async (code) => {
        try {
          const token = localStorage.getItem('rcerp_token');
          const res = await fetch('/api/auth/totp/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ code }),
          });
          const json = await res.json();
          if (!json.ok) return { ok: false, error: json.error || 'رمز التحقق غير صحيح' };
          return { ok: true };
        } catch {
          return { ok: false, error: 'الخادم غير متاح' };
        }
      },

      totpDisable: async (code) => {
        try {
          const token = localStorage.getItem('rcerp_token');
          const res = await fetch('/api/auth/totp/disable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ code }),
          });
          const json = await res.json();
          if (!json.ok) return { ok: false, error: json.error || 'رمز التحقق غير صحيح' };
          return { ok: true };
        } catch {
          return { ok: false, error: 'الخادم غير متاح' };
        }
      },

      can: (permission) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        const perms = ROLE_PERMISSIONS[currentUser.role] || [];
        return perms.includes(permission);
      },

      hasRole: (...roles) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        return roles.includes(currentUser.role);
      },

      upsertAccessRole: (role) => set((state) => ({
        accessRoles: state.accessRoles.some((r) => r.id === role.id)
          ? state.accessRoles.map((r) => (r.id === role.id ? role : r))
          : [...state.accessRoles, role],
      })),

      removeAccessRole: (id) => set((state) => ({ accessRoles: state.accessRoles.filter((r) => r.id !== id) })),

      screenCan: (screenId, action = 'view') => {
        const { currentUser, accessRoles } = get();
        if (!currentUser || !currentUser.isActive) return false;
        if (currentUser.role === 'admin' || currentUser.role === 'executive') return true;
        const navPerm = getNavItem(screenId)?.permission;
        const role = currentUser.roleId ? accessRoles.find((r) => r.id === currentUser.roleId) : undefined;
        if (!role) {
          if (!navPerm) return action === 'view';
          const legacy = ((ROLE_PERMISSIONS[currentUser.role] || []) as string[]).includes(navPerm);
          return action === 'view' ? legacy : true;
        }
        const p = role.screenPerms[screenId];
        if (p) {
          if (action === 'view') return !!p.view;
          if (action === 'add') return !!p.view && !!p.add;
          if (action === 'edit') return !!p.view && !!p.edit;
          return !!p.view && !!p.del;
        }
        const baseOk = !!navPerm && ((ROLE_PERMISSIONS[role.baseRole] || []) as string[]).includes(navPerm);
        return baseOk && action === 'view';
      },

      verifyAdminPassword: async (password) => {
        if (!password) return false;
        try {
          const token = localStorage.getItem('rcerp_token');
          const res = await fetch('/api/auth/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ password }),
          });
          const json = await res.json();
          return Boolean(json.ok);
        } catch {
          return false;
        }
      },
    }),
    { name: 'rcerp_auth' }
  )
);
