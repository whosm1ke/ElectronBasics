// useTerminalHistoryStore.ts — open/closed state for the "Import from
// terminal history" screen (TerminalHistoryModal.tsx). The actual history
// lines are fetched fresh from disk each time it opens (see the component),
// not cached here — real shell history keeps growing while the app runs.
import { create } from 'zustand';

interface TerminalHistoryState {
  open: boolean;
}

const useStore = create<TerminalHistoryState>(() => ({ open: false }));

export function useTerminalHistoryStore(): TerminalHistoryState {
  return useStore();
}

export function openTerminalHistory(): void {
  useStore.setState({ open: true });
}

export function closeTerminalHistory(): void {
  useStore.setState({ open: false });
}

export function isTerminalHistoryOpen(): boolean {
  return useStore.getState().open;
}
