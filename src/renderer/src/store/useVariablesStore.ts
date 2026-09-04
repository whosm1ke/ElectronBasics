// useVariablesStore.ts — open/closed state for the global variables
// manager. The actual variable list stays on modules/state.js (state.variables)
// since many not-yet-ported modules read/write it directly (params.js's
// syncVariablesFromValues, ParamForm.tsx) — this store only tracks whether
// the modal itself is open, same split as useHistoryStore.ts.
import { create } from 'zustand';
import { state } from '../../modules/state';
import { bumpSnippetsVersion } from './useSnippetsVersion';
import { openSettings, closeSettings } from './useSettingsStore';

const useStore = create<{ open: boolean }>(() => ({ open: false }));

export function useVariablesOpen(): boolean {
  return useStore((s) => s.open);
}

export async function openVariables(): Promise<void> {
  // Settings is React now too (SettingsModal.tsx/useSettingsStore.ts) —
  // this hide/show is still the same Settings<->Variables swap
  // modules/settings-modal.js always did, just via that store instead of
  // toggling a DOM node's `hidden` directly.
  closeSettings();
  useStore.setState({ open: true });
  state.variables = await window.electronAPI.getVariables();
  bumpSnippetsVersion(); // ParamForm/Card reads state.variables too — keep them fresh
}

export function closeVariables(): void {
  useStore.setState({ open: false });
  openSettings();
}

export function isVariablesOpen(): boolean {
  return useStore.getState().open;
}
