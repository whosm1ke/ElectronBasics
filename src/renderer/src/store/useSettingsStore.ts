// useSettingsStore.ts — Settings modal's open/closed state, plus the
// last-known update-check status. updateStatus is kept here (not just
// local component state) so a status change that arrives while Settings is
// closed (e.g. a slow download finishing) isn't lost — SettingsModal.tsx
// reads it fresh every time it opens rather than resetting to "Check for
// updates." Ported from modules/settings-modal.js / modules/state.js.
import { create } from 'zustand';
import type { UpdateStatusEvent } from '@shared/types';

// The category SettingsModal.tsx's sidebar lands on when Settings opens —
// defined here (not in the component) so a caller elsewhere in the app
// (the command palette's "Help" entry) can jump straight to a category
// without SettingsModal.tsx needing to export anything back to it.
export type SettingsCategory = 'appearance' | 'behavior' | 'automation' | 'updates' | 'libraries' | 'data' | 'help';

interface SettingsState {
  open: boolean;
  updateStatus: UpdateStatusEvent;
  initialCategory: SettingsCategory;
}

const useStore = create<SettingsState>(() => ({ open: false, updateStatus: { status: 'idle' }, initialCategory: 'appearance' }));

export function useSettingsStore(): SettingsState {
  return useStore();
}

export function openSettings(category: SettingsCategory = 'appearance'): void {
  useStore.setState({ open: true, initialCategory: category });
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
