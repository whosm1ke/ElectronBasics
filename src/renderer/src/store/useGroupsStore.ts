// useGroupsStore.ts — open/closed + list/editor view state for the Groups
// modal. Ported from modules/groups-modal.js. state.groups itself stays on
// modules/state.js (Card.tsx's "in group" badges and other not-yet-ported
// modules read it directly) — same split as useVariablesStore.ts.
import { create } from 'zustand';
import type { Group } from '@shared/types';
import { state } from '../../modules/state';
import { bumpSnippetsVersion } from './useSnippetsVersion';

interface GroupsState {
  open: boolean;
  view: 'list' | 'editor';
  editingId: string | null;
}

const useStore = create<GroupsState>(() => ({ open: false, view: 'list', editingId: null }));

export function useGroupsStore(): GroupsState {
  return useStore();
}

export function groupsForSnippet(snippetId: string): Group[] {
  return (state.groups as Group[]).filter((g) => g.snippetIds.includes(snippetId));
}

export async function openGroups(): Promise<void> {
  useStore.setState({ open: true, view: 'list', editingId: null });
  state.groups = await window.electronAPI.getGroups();
  bumpSnippetsVersion();
}

/** Opens straight to the editor for `group` (or blank when null) — also used by DetailsModal.tsx to jump into a specific group from a snippet's "in group" link. */
export function openGroupEditor(group: Group | null): void {
  useStore.setState({ open: true, view: 'editor', editingId: group ? group.id : null });
}

export function showGroupsListView(): void {
  useStore.setState({ view: 'list', editingId: null });
}

export function closeGroups(): void {
  useStore.setState({ open: false });
}

export function isGroupsOpen(): boolean {
  return useStore.getState().open;
}
