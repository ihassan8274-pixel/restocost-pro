import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CustomReport, AuditLogEntry, SystemNotification, FoodCostAlert } from '../../types';

interface ReportsState {
  customReports: CustomReport[];
  auditLogs: AuditLogEntry[];
  notifications: SystemNotification[];
  foodCostAlerts: FoodCostAlert[];
  
  pendingChanges: Map<string, unknown>;
  
  // Setters (for sync engine)
  setCustomReports: (data: CustomReport[]) => void;
  setAuditLogs: (data: AuditLogEntry[]) => void;
  setNotifications: (data: SystemNotification[]) => void;
  setFoodCostAlerts: (data: FoodCostAlert[]) => void;
  
  // Actions
  addCustomReport: (report: Omit<CustomReport, 'id'>) => void;
  deleteCustomReport: (id: string) => void;
  
  logAudit: (action: string, module: string, details?: string, entity?: { type: string; id: string }) => void;
  
  acknowledgeAlert: (recipeId: string) => void;
  unacknowledgeAlert: (recipeId: string) => void;
  
  addNotification: (notification: Omit<SystemNotification, 'id' | 'createdAt'>) => void;
  dismissNotification: (id: string) => void;
  
  // Sync
  markPending: (key: string, data: unknown) => void;
  clearPending: (key: string) => void;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const useReportsStore = create<ReportsState>()(
  persist(
    (set, get) => ({
      customReports: [],
      auditLogs: [],
      notifications: [],
      foodCostAlerts: [],
      pendingChanges: new Map(),
      
      // Setters
      setCustomReports: (data) => { set({ customReports: data }); get().markPending('rcerp_custom_reports', data); },
      setAuditLogs: (data) => { set({ auditLogs: data }); get().markPending('rcerp_audit', data); },
      setNotifications: (data) => { set({ notifications: data }); get().markPending('rcerp_notifications', data); },
      setFoodCostAlerts: (data) => { set({ foodCostAlerts: data }); get().markPending('rcerp_food_cost_alerts', data); },
      
      // Actions
      addCustomReport: (report) => { set((state) => ({ customReports: [...state.customReports, { ...report, id: uid('cr') }] })); get().markPending('rcerp_custom_reports', get().customReports); },
      deleteCustomReport: (id) => { set((state) => ({ customReports: state.customReports.filter(r => r.id !== id) })); get().markPending('rcerp_custom_reports', get().customReports); },
      
      logAudit: (action, module, details, entity) => {
        const entry: AuditLogEntry = {
          id: uid('aud'),
          userId: 'current-user',
          userName: 'Current User',
          action,
          module,
          timestamp: new Date().toISOString(),
          details,
          entityType: entity?.type,
          entityId: entity?.id,
        };
        set((state) => ({ auditLogs: [entry, ...state.auditLogs].slice(0, 500) }));
        get().markPending('rcerp_audit', get().auditLogs);
      },
      
      acknowledgeAlert: (_recipeId) => { /* handled in financial store */ },
      unacknowledgeAlert: (_recipeId) => { /* handled in financial store */ },
      
      addNotification: (notification) => { set((state) => ({ notifications: [...state.notifications, { ...notification, id: uid('notif'), createdAt: new Date().toISOString() }] })); get().markPending('rcerp_notifications', get().notifications); },
      dismissNotification: (id) => { set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) })); get().markPending('rcerp_notifications', get().notifications); },
      
      // Sync
      markPending: (key, data) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.set(key, data); return { pendingChanges: newMap }; }); },
      clearPending: (key) => { set((state) => { const newMap = new Map(state.pendingChanges); newMap.delete(key); return { pendingChanges: newMap }; }); },
    }),
    {
      name: 'rcerp-reports',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        customReports: state.customReports,
        auditLogs: state.auditLogs,
        notifications: state.notifications,
      }),
    }
  )
);

export const useCustomReports = () => useReportsStore(state => state.customReports);
export const useAuditLogs = () => useReportsStore(state => state.auditLogs);
export const useNotifications = () => useReportsStore(state => state.notifications);
export const useFoodCostAlerts = () => useReportsStore(state => state.foodCostAlerts);

export const useReportsActions = () => useReportsStore(state => ({
  addCustomReport: state.addCustomReport,
  deleteCustomReport: state.deleteCustomReport,
  logAudit: state.logAudit,
  acknowledgeAlert: state.acknowledgeAlert,
  unacknowledgeAlert: state.unacknowledgeAlert,
  addNotification: state.addNotification,
  dismissNotification: state.dismissNotification,
}));

export const useReportsSyncActions = () => useReportsStore(state => ({
  setCustomReports: state.setCustomReports,
  setAuditLogs: state.setAuditLogs,
  setNotifications: state.setNotifications,
  setFoodCostAlerts: state.setFoodCostAlerts,
  markPending: state.markPending,
  clearPending: state.clearPending,
}));