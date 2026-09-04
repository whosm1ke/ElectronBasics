// useSettingsStore.ts — Settings modal's open/closed state, plus the
// last-known update-check status. updateStatus is kept here (not just
// local component state) so a status change that arrives while Settings is
// closed (e.g. a slow download finishing) isn't lost — SettingsModal.tsx
// reads it fresh every time it opens rather than resetting to "Check for
// updates." Ported from modules/settings-modal.js / modules/state.js.
import { create } from 'zustand';
import type { UpdateStatusEvent } from '@shared/types';

interface SettingsState {
  open: boolean;
  updateStatus: UpdateStatusEvent;
}

const useStore = create<SettingsState>(() => ({ open: false, updateStatus: { status: 'idle' } }));

export function useSettingsStore(): SettingsState {
  return useStore();
}

export function openSettings(): void {
  useStore.setState({ open: true });
}

export function closeSettings(): void {
  useStore.setState({ open: false });
  document.getElementById('searchInput')?.focus();
}

export function isSettingsOpen(): boolean {
  return useStore.getState().open;
}

window.electronAPI.onUpdateStatus((status) => {
  useStore.setState({ updateStatus: status });
});
