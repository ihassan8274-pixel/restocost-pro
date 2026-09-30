import { useSyncStore } from '@stores/syncStore';

export const useSync = () => {
  const {
    booting, setBooting, ready, setReady, offline, setOffline, offlineSince, setOfflineSince,
    refresh, retryBootstrap, saveFailed, saveErrorDetail, pendingSavesCount, pendingSaves,
    applyData, persist, flushSaves, reapplyPending, syncNow,
    serverFpRef, appliedRefsRef, COLLECTION_SETTERS,
  } = useSyncStore();

  return {
    booting, setBooting, ready, setReady, offline, setOffline, offlineSince, setOfflineSince,
    refresh, retryBootstrap, saveFailed, saveErrorDetail, pendingSavesCount, pendingSaves,
    applyData, persist, flushSaves, reapplyPending, syncNow,
    serverFpRef, appliedRefsRef, COLLECTION_SETTERS,
  };
};