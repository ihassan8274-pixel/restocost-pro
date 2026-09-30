import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, UserRole, Permission } from '../../types';

interface AuthState {
  currentUser: User | null;
  mustChangePassword: boolean;
  booting: boolean;
  token: string | null;
  
  setCurrentUser: (user: User | null) => void;
  setMustChangePassword: (v: boolean) => void;
  setBooting: (v: boolean) => void;
  setToken: (token: string | null) => void;
  
  login: (email: string, password: string, totpCode?: string) => Promise<{ ok: boolean; error?: string; totpRequired?: boolean }>;
  register: (name: string, email: string, password: string, role: UserRole, branchId: string) => Promise<{ ok: boolean; error?: string; pending?: boolean }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  updateUser: (id: string, data: Partial<User>, opts?: { resetPassword?: string }) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  revokeSessions: (id: string) => Promise<{ ok: boolean; error?: string }>;
  totpSetup: () => Promise<{ ok: boolean; error?: string; secret?: string; otpauthUrl?: string; enabled?: boolean }>;
  totpEnable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  totpDisable: (code: string) => Promise<{ ok: boolean; error?: string }>;
  verifyAdminPassword: (password: string) => Promise<boolean>;
  can: (permission: Permission) => boolean;
  setCan: (fn: (permission: Permission) => boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      currentUser: null,
      mustChangePassword: false,
      booting: true,
      token: null,
      
      setCurrentUser: (user) => set({ currentUser: user }),
      setMustChangePassword: (v) => set({ mustChangePassword: v }),
      setBooting: (v) => set({ booting: v }),
      setToken: (token) => { set({ token }); if (token) localStorage.setItem('rcerp_token', token); else localStorage.removeItem('rcerp_token'); },
      
      login: async (_email, _password, _totpCode) => {
        return { ok: false, error: 'Use useAuthCore hook for login' };
      },
      
      register: async (_name, _email, _password, _role, _branchId) => {
        return { ok: false, error: 'Use useAuthCore hook for register', pending: false };
      },
      
      logout: () => {
        set({ currentUser: null, token: null, mustChangePassword: false });
        localStorage.removeItem('rcerp_token');
      },
      
      changePassword: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      updateUser: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      deleteUser: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      revokeSessions: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      totpSetup: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      totpEnable: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      totpDisable: async () => ({ ok: false, error: 'Use useAuthCore hook' }),
      verifyAdminPassword: async () => false,
      can: () => false,
      setCan: (fn) => set({ can: fn }),
    }),
    {
      name: 'rcerp-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        mustChangePassword: state.mustChangePassword,
        token: state.token,
      }),
    }
  )
);

export const useCurrentUser = () => useAuthStore(state => state.currentUser);
export const useMustChangePassword = () => useAuthStore(state => state.mustChangePassword);
export const useBooting = () => useAuthStore(state => state.booting);
export const useAuthToken = () => useAuthStore(state => state.token);
export const useCan = () => useAuthStore(state => state.can);

export const useAuthActions = () => useAuthStore(state => ({
  setCurrentUser: state.setCurrentUser,
  setMustChangePassword: state.setMustChangePassword,
  setBooting: state.setBooting,
  setToken: state.setToken,
  setCan: state.setCan,
  login: state.login,
  register: state.register,
  logout: state.logout,
  changePassword: state.changePassword,
  updateUser: state.updateUser,
  deleteUser: state.deleteUser,
  revokeSessions: state.revokeSessions,
  totpSetup: state.totpSetup,
  totpEnable: state.totpEnable,
  totpDisable: state.totpDisable,
  verifyAdminPassword: state.verifyAdminPassword,
}));