// useVariablesStore.ts — open/closed state for the global variables
// manager. The actual variable list stays on modules/state.js (state.variables)
// since many not-yet-ported modules read/write it directly (params.js's
// syncVariablesFromValues, ParamForm.tsx) — this store only tracks whether
// the modal itself is open, same split as useHistoryStore.ts.
import { create } from 'zustand';
import { state } from '../../modules/state';
import { bumpSnippetsVersion } from './useSnippetsVersion';

const useStore = create<{ open: boolean }>(() => ({ open: false }));

export function useVariablesOpen(): boolean {
  return useStore((s) => s.open);
}

export async function openVariables(): Promise<void> {
  // Used to close Settings first and reopen it (reset to its default
  // category) on close — a modules/settings-modal.js leftover from before
  // `.modal-overlay` rendered above `.screen` (see style.css). Now that it
  // does, this can just open on top of whatever's already there (Settings
  // or anything else Variables gets opened from) and leave it alone.
  useStore.setState({ open: true });
  state.variables = await window.electronAPI.getVariables();
  bumpSnippetsVersion(); // ParamForm/Card reads state.variables too — keep them fresh
}

export function closeVariables(): void {
  useStore.setState({ open: false });
}

export function isVariablesOpen(): boolean {
  return useStore.getState().open;
}
