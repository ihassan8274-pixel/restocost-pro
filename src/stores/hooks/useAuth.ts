import { useAuthStore } from '@stores/authStore';
import { useSettingsStore } from '@stores/settingsStore';

// مشتقة من المستخدم الحالي + الفروع — نفس سلوك AppContext القديم
export const visibleBranchIdsFor = (
  currentUser: { branchId?: string } | null,
  branches: { id: string }[],
): string[] => {
  if (!currentUser) return [];
  if (currentUser.branchId === 'all') return branches.map((b) => b.id);
  return currentUser.branchId ? [currentUser.branchId] : [];
};

export const useAuth = () => {
  const {
    users, currentUser, mustChangePassword, setMustChangePassword,
    login, logout, changePassword, updateUser, deleteUser, revokeSessions,
    totpSetup, totpEnable, totpDisable,
    can, hasRole,
    accessRoles, upsertAccessRole, removeAccessRole, screenCan,
    authExpired, setAuthExpired, verifyAdminPassword,
  } = useAuthStore();
  const branches = useSettingsStore((s) => s.branches);
  const visibleBranchIds = visibleBranchIdsFor(currentUser, branches);

  return {
    users, currentUser, mustChangePassword, setMustChangePassword,
    login, logout, changePassword, updateUser, deleteUser, revokeSessions,
    totpSetup, totpEnable, totpDisable,
    can, hasRole, visibleBranchIds,
    accessRoles, upsertAccessRole, removeAccessRole, screenCan,
    authExpired, setAuthExpired, verifyAdminPassword,
  };
};

export { useAuthStore as default };