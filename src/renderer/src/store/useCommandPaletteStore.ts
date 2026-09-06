// useCommandPaletteStore.ts — open/closed state for the command palette
// (Ctrl+K): a fuzzy-searchable list of every snippet (Enter runs it) plus
// every other screen/action in the app, so you don't have to remember
// which header icon opens Health vs. Schedule vs. Settings.
import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
}

const useStore = create<CommandPaletteState>(() => ({ open: false }));

export function useCommandPaletteStore(): CommandPaletteState {
  return useStore();
}

export function openCommandPalette(): void {
  useStore.setState({ open: true });
}

export function closeCommandPalette(): void {
  useStore.setState({ open: false });
}

export function isCommandPaletteOpen(): boolean {
  return useStore.getState().open;
}
