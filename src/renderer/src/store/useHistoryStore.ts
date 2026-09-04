// useHistoryStore.ts — the run-history drawer's data + open/closed state.
// Ported from modules/history-drawer.js. Same imperative-API-over-Zustand
// pattern as useToastStore.ts: openHistory()/closeHistory()/isHistoryOpen()
// stay callable exactly as before from every not-yet-ported module (via
// modules/history-drawer.js, now a re-export shim).
import { create } from 'zustand';
import type { HistoryEntry } from '@shared/types';

interface HistoryState {
  open: boolean;
  entries: HistoryEntry[];
  query: string;
}

const useStore = create<HistoryState>(() => ({ open: false, entries: [], query: '' }));

export function useHistoryStore(): HistoryState {
  return useStore();
}

export async function openHistory(): Promise<void> {
  useStore.setState({ open: true, query: '' });
  const entries = await window.electronAPI.getHistory();
  useStore.setState({ entries });
}

export function closeHistory(): void {
  useStore.setState({ open: false });
  document.getElementById('searchInput')?.focus();
}

export function isHistoryOpen(): boolean {
  return useStore.getState().open;
}

export function setHistoryQuery(query: string): void {
  useStore.setState({ query });
}

export async function clearHistory(): Promise<void> {
  const entries = await window.electronAPI.clearHistory();
  useStore.setState({ entries, query: '' });
}

export async function rerunFromHistory(entry: HistoryEntry): Promise<void> {
  closeHistory();
  await window.electronAPI.runCommand({
    command: entry.command,
    snippetId: entry.snippetId,
    snippetName: entry.snippetName,
  });
  await openHistory();
}
