// useGroupsStore.ts — open/closed state for the Groups list screen, plus
// open/editing state for the group editor. The editor is a `.modal`
// (GroupEditorModal.tsx), not part of this screen — a `.modal-overlay`
// always renders above every `.screen` (Schedule, Pipelines, the plain
// groups list, …), so opening it never needs to close anything first or
// track which screen to return to once it's done: whatever was open
// underneath was never touched, and just reappears exactly as it was the
// moment this modal closes. state.groups itself stays on modules/state.js
// (Card.tsx's "in group" badges and other not-yet-ported modules read it
// directly) — same split as useVariablesStore.ts.
//
// The one exception is Details, itself a `.modal` — modal-over-modal shares
// the same z-index-tie ambiguity `.screen`-over-`.screen` used to have (see
// lib/screens.ts's own header comment on that). DetailsModal.tsx's own
// GroupLink handles this itself: it hides Details (hideDetailsForNavigation)
// rather than leaving it open, and closeGroupEditor() below fires the same
// onEditorClosed bus event the snippet editor modal already fires on close
// — useDetailsStore.ts's existing subscription reopens Details from that,
// no Groups-specific plumbing needed.
import { create } from 'zustand';
import type { Group } from '@shared/types';
import { state } from '../../modules/state';
import { bumpSnippetsVersion } from './useSnippetsVersion';
import { emitEditorClosed } from '../lib/events';

interface GroupsState {
  open: boolean; // the groups list screen
  editorOpen: boolean; // the group editor modal
  editingId: string | null; // which group the editor modal is for; null = "new group"
}

const useStore = create<GroupsState>(() => ({ open: false, editorOpen: false, editingId: null }));

export function useGroupsStore(): GroupsState {
  return useStore();
}

export function groupsForSnippet(snippetId: string): Group[] {
  return (state.groups as Group[]).filter((g) => g.snippetIds.includes(snippetId));
}

export async function openGroups(): Promise<void> {
  useStore.setState({ open: true });
  state.groups = await window.electronAPI.getGroups();
  bumpSnippetsVersion();
}

export function closeGroups(): void {
  useStore.setState({ open: false });
}

export function isGroupsOpen(): boolean {
  return useStore.getState().open;
}

/** Opens the group editor modal for `group` (or blank for a new one) — safe to call from anywhere (the plain groups list, Details, Schedule, a pipeline's own Inspector, …) since it's a `.modal`, not a `.screen`. */
export function openGroupEditor(group: Group | null): void {
  useStore.setState({ editorOpen: true, editingId: group ? group.id : null });
}

/** Closes the group editor modal — see this file's own header comment on why this fires the shared onEditorClosed bus event. */
export function closeGroupEditor(): void {
  useStore.setState({ editorOpen: false, editingId: null });
  emitEditorClosed();
}

export function isGroupEditorOpen(): boolean {
  return useStore.getState().editorOpen;
}
