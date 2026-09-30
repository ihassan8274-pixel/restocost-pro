import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface RecentDoc {
  id: string;
  type: string;
  title: string;
  tab: string;
  at: number;
}

interface SyncState {
  offline: boolean;
  offlineSince: string;
  saveFailed: boolean;
  authExpired: boolean;
  saveErrorDetail: string;
  pendingSavesCount: number;
  pendingSaves: Map<string, { key: string; data: unknown; timestamp: number; retries: number }>;
  lastSyncAt: string | null;
  syncInProgress: boolean;
  recentDocs: RecentDoc[];
  
  setOffline: (v: boolean) => void;
  setOfflineSince: (v: string) => void;
  setSaveFailed: (v: boolean) => void;
  setAuthExpired: (v: boolean) => void;
  setSaveErrorDetail: (v: string) => void;
  setPendingSavesCount: (v: number) => void;
  
  addPendingSave: (key: string, data: unknown) => void;
  removePendingSave: (key: string) => void;
  clearPendingSaves: () => void;
  incrementRetry: (key: string) => void;
  
  setLastSyncAt: (v: string) => void;
  setSyncInProgress: (v: boolean) => void;
  
  flushSaves: () => Promise<void>;
  reapplyPending: () => void;
  syncNow: (key?: string) => Promise<boolean>;
  
  // Injected from AppContext
  addRecentDoc: (doc: { type: string; title: string; tab: string }, id?: string) => void;
  clearRecentDocs: () => void;
  setRecentDocs: (data: RecentDoc[]) => void;
  setAddRecentDoc: (fn: (doc: { type: string; title: string; tab: string }, id?: string) => void) => void;
  setClearRecentDocs: (fn: () => void) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      offline: false,
      offlineSince: '',
      saveFailed: false,
      authExpired: false,
      saveErrorDetail: '',
      pendingSavesCount: 0,
      pendingSaves: new Map(),
      lastSyncAt: null,
      syncInProgress: false,
      recentDocs: [],
      
      setOffline: (v) => set({ offline: v }),
      setOfflineSince: (v) => set({ offlineSince: v }),
      setSaveFailed: (v) => set({ saveFailed: v }),
      setAuthExpired: (v) => set({ authExpired: v }),
      setSaveErrorDetail: (v) => set({ saveErrorDetail: v }),
      setPendingSavesCount: (v) => set({ pendingSavesCount: v }),
      
      addPendingSave: (key, data) => {
        set((state) => {
          const newMap = new Map(state.pendingSaves);
          newMap.set(key, { key, data, timestamp: Date.now(), retries: 0 });
          return { pendingSaves: newMap, pendingSavesCount: newMap.size, saveFailed: false };
        });
      },
      
      removePendingSave: (key) => {
        set((state) => {
          const newMap = new Map(state.pendingSaves);
          newMap.delete(key);
          return { pendingSaves: newMap, pendingSavesCount: newMap.size };
        });
      },
      
      clearPendingSaves: () => set({ pendingSaves: new Map(), pendingSavesCount: 0 }),
      
      incrementRetry: (key) => {
        set((state) => {
          const newMap = new Map(state.pendingSaves);
          const existing = newMap.get(key);
          if (existing) {
            newMap.set(key, { ...existing, retries: existing.retries + 1 });
          }
          return { pendingSaves: newMap };
        });
      },
      
      setLastSyncAt: (v) => set({ lastSyncAt: v }),
      setSyncInProgress: (v) => set({ syncInProgress: v }),
      
      flushSaves: async () => {
        const { pendingSaves } = get();
        if (pendingSaves.size === 0) return;
        
        set({ syncInProgress: true });
        await new Promise(resolve => setTimeout(resolve, 100));
        set({ syncInProgress: false, lastSyncAt: new Date().toISOString() });
      },
      
      reapplyPending: () => {
        // Re-apply pending saves after server bootstrap
      },
      
      syncNow: async (_key) => {
        set({ syncInProgress: true });
        await get().flushSaves();
        set({ syncInProgress: false });
        return true;
      },
      
      // Injected from AppContext (stubs)
      addRecentDoc: () => {},
      clearRecentDocs: () => {},
      setRecentDocs: (data) => set({ recentDocs: data }),
      setAddRecentDoc: (fn) => set({ addRecentDoc: fn }),
      setClearRecentDocs: (fn) => set({ clearRecentDocs: fn }),
    }),
    {
      name: 'rcerp-sync',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        offline: state.offline,
        offlineSince: state.offlineSince,
        pendingSavesCount: state.pendingSavesCount,
        recentDocs: state.recentDocs,
      }),
    }
  )
);

export const useOffline = () => useSyncStore(state => state.offline);
export const useOfflineSince = () => useSyncStore(state => state.offlineSince);
export const useSaveFailed = () => useSyncStore(state => state.saveFailed);
export const useAuthExpired = () => useSyncStore(state => state.authExpired);
export const useSaveErrorDetail = () => useSyncStore(state => state.saveErrorDetail);
export const usePendingSavesCount = () => useSyncStore(state => state.pendingSavesCount);
export const usePendingSaves = () => useSyncStore(state => state.pendingSaves);
export const useLastSyncAt = () => useSyncStore(state => state.lastSyncAt);
export const useSyncInProgress = () => useSyncStore(state => state.syncInProgress);
export const useRecentDocs = () => useSyncStore(state => state.recentDocs);
export const useAddRecentDoc = () => useSyncStore(state => state.addRecentDoc);
export const useClearRecentDocs = () => useSyncStore(state => state.clearRecentDocs);

export const useSyncActions = () => useSyncStore(state => ({
  setOffline: state.setOffline,
  setOfflineSince: state.setOfflineSince,
  setSaveFailed: state.setSaveFailed,
  setAuthExpired: state.setAuthExpired,
  setSaveErrorDetail: state.setSaveErrorDetail,
  setPendingSavesCount: state.setPendingSavesCount,
  addPendingSave: state.addPendingSave,
  removePendingSave: state.removePendingSave,
  clearPendingSaves: state.clearPendingSaves,
  incrementRetry: state.incrementRetry,
  setLastSyncAt: state.setLastSyncAt,
  setSyncInProgress: state.setSyncInProgress,
  flushSaves: state.flushSaves,
  reapplyPending: state.reapplyPending,
  syncNow: state.syncNow,
  setRecentDocs: state.setRecentDocs,
  setAddRecentDoc: state.setAddRecentDoc,
  setClearRecentDocs: state.setClearRecentDocs,
}));