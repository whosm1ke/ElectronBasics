// useToastStore.ts — the small floating status pill at the bottom of the
// window, ported from modules/toast.js. Zustand rather than a component-
// local useState specifically so `showToast()` stays callable exactly like
// the original from plain (not-yet-ported) renderer modules via
// `store.getState()` — see modules/toast.js, now a one-line re-export shim
// pointing here so every existing call site keeps working unchanged.
import { create } from 'zustand';

export type ToastType = 'info' | 'error';

interface ToastState {
  message: string | null;
  type: ToastType;
  actionLabel: string | null;
  actionFn: (() => void) | null;
  show: (message: string, type?: ToastType, actionLabel?: string, actionFn?: () => void) => void;
  hide: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'info',
  actionLabel: null,
  actionFn: null,
  show: (message, type = 'info', actionLabel, actionFn) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ message, type, actionLabel: actionLabel ?? null, actionFn: actionFn ?? null });
    toastTimer = setTimeout(() => set({ message: null }), actionLabel ? 5000 : 2600);
  },
  hide: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ message: null });
  },
}));

/** Imperative call, usable from anywhere (React or plain JS) — same signature as the original showToast(). */
export function showToast(message: string, type: ToastType = 'info', actionLabel?: string, actionFn?: () => void): void {
  useToastStore.getState().show(message, type, actionLabel, actionFn);
}
