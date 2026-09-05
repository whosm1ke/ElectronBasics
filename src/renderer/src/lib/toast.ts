// toast.ts — the small floating status pill at the bottom of the window.
// A thin wrapper around `sonner`'s imperative `toast()` API (see App.tsx for
// the mounted <Toaster/> that actually renders these) — kept as a plain
// function rather than a Zustand store (what this used to be, as
// useToastStore.ts) since sonner already owns the queue/stacking/dismiss
// state itself; `showToast()` exists purely so every call site keeps the
// same signature the original hand-rolled version had.
import { toast } from 'sonner';

export type ToastType = 'info' | 'error';

/** Imperative call, usable from anywhere (React or plain JS) — same signature as the original showToast(). */
export function showToast(message: string, type: ToastType = 'info', actionLabel?: string, actionFn?: () => void): void {
  const opts = {
    duration: actionLabel && actionFn ? 5000 : 2600,
    action: actionLabel && actionFn ? { label: actionLabel, onClick: actionFn } : undefined,
  };
  if (type === 'error') toast.error(message, opts);
  else toast(message, opts);
}
