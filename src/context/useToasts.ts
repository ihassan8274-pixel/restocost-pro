// Toast UI state cluster extracted from the monolithic AppContext.
// Three-level toast — level drives shape/behavior, optional Undo action.
import { useRef, useState } from 'react';

export type ToastLevel = 'success' | 'info' | 'error';
export interface ToastEntry {
  message: string;
  level: ToastLevel;
  undo?: () => void;
  duration?: number;
}

export const useToasts = () => {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => {
    setToast({ message, level: opts?.level ?? 'info', undo: opts?.undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), opts?.duration ?? (opts?.level === 'error' ? 6000 : 4000));
  };
  return { toast, showToast };
};