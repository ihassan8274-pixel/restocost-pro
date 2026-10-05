import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ToastEntry } from '../useToasts';

/**
 * Applies the theme to <html> so the `.dark` rules in index.css actually take
 * effect.
 *
 * The store already held `theme` and the header already toggled it, but
 * nothing ever touched the DOM, so the .dark block in index.css was dead CSS -
 * the button changed the sun/moon icon and nothing else happened. Applying it
 * here also keeps the change in one place instead of duplicating the effect in
 * every component that reads the theme.
 */
export function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Lets the browser theme the scrollbars and form controls to match.
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#1c1917' : '#fafaf9';
}

interface UIState {
  theme: 'light' | 'dark';
  toast: ToastEntry | null;
  commandPalette: { open: boolean; mode: 'search' | 'new' | 'export' | null };
  showAlerts: boolean;
  sidebarOpen: boolean;
  activeModal: string | null;
  errorBoundaryResetKey: number;
  
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  
  showToast: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void;
  clearToast: () => void;
  
  openCommandPalette: (mode: 'search' | 'new' | 'export') => void;
  closeCommandPalette: () => void;
  
  openAlerts: () => void;
  closeAlerts: () => void;
  
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  openModal: (modalId: string) => void;
  closeModal: () => void;
  
  resetErrorBoundary: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, _get) => ({
      theme: 'light',
      toast: null,
      commandPalette: { open: false, mode: null },
      showAlerts: false,
      sidebarOpen: false,
      activeModal: null,
      errorBoundaryResetKey: 0,
      
      toggleTheme: () =>
        set((state) => {
          const theme = state.theme === 'light' ? 'dark' : 'light';
          applyTheme(theme);
          return { theme };
        }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      
      showToast: (message, opts) => set({ toast: { message, ...opts } as ToastEntry }),
      clearToast: () => set({ toast: null }),
      
      openCommandPalette: (mode) => set({ commandPalette: { open: true, mode } }),
      closeCommandPalette: () => set({ commandPalette: { open: false, mode: null } }),
      
      openAlerts: () => set({ showAlerts: true }),
      closeAlerts: () => set({ showAlerts: false }),
      
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      openModal: (modalId) => set({ activeModal: modalId }),
      closeModal: () => set({ activeModal: null }),
      
      resetErrorBoundary: () => set((state) => ({ errorBoundaryResetKey: state.errorBoundaryResetKey + 1 })),
    }),
    {
      name: 'rcerp-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
      // Re-apply on boot: the persisted theme is otherwise only read back into
      // state, so a user who chose dark mode would land on a light UI.
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    }
  )
);

export const useTheme = () => useUIStore(state => state.theme);
export const useToast = () => useUIStore(state => state.toast);
export const useCommandPalette = () => useUIStore(state => state.commandPalette);
export const useShowAlerts = () => useUIStore(state => state.showAlerts);
export const useSidebarOpen = () => useUIStore(state => state.sidebarOpen);
export const useActiveModal = () => useUIStore(state => state.activeModal);
export const useErrorBoundaryResetKey = () => useUIStore(state => state.errorBoundaryResetKey);

export const useUIActions = () => useUIStore(state => ({
  toggleTheme: state.toggleTheme,
  setTheme: state.setTheme,
  showToast: state.showToast,
  clearToast: state.clearToast,
  openCommandPalette: state.openCommandPalette,
  closeCommandPalette: state.closeCommandPalette,
  openAlerts: state.openAlerts,
  closeAlerts: state.closeAlerts,
  toggleSidebar: state.toggleSidebar,
  setSidebarOpen: state.setSidebarOpen,
  openModal: state.openModal,
  closeModal: state.closeModal,
  resetErrorBoundary: state.resetErrorBoundary,
}));
