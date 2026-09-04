// useDetailsStore.ts — open/closed state + the currently-shown snippet for
// the read-only Details modal. Ported from modules/details-modal.js.
// pendingReturnId is the same "jump to an editor, come back to Details once
// it closes" tracking the original had — still driven by modules/events.js's
// onEditorClosed bus (editor-modal.js isn't ported yet).
import { create } from 'zustand';
import type { Snippet } from '@shared/types';
import { onEditorClosed } from '../lib/events';
import { state } from '../../modules/state';

interface DetailsState {
  snippet: Snippet | null;
  pendingReturnId: string | null;
}

const useStore = create<DetailsState>(() => ({ snippet: null, pendingReturnId: null }));

export function useDetailsStore(): DetailsState {
  return useStore();
}

export function openDetails(snippet: Snippet): void {
  useStore.setState({ snippet });
}

export function closeDetails(): void {
  useStore.setState({ snippet: null, pendingReturnId: null });
}

export function isDetailsOpen(): boolean {
  return useStore.getState().snippet !== null;
}

/** Hides Details without clearing pendingReturnId — used when navigating away to an editor/group-editor that should come back here. */
export function hideDetailsForNavigation(returnId: string | null): void {
  useStore.setState({ snippet: null, pendingReturnId: returnId });
}

onEditorClosed(() => {
  const { pendingReturnId } = useStore.getState();
  if (!pendingReturnId) return;
  const snippet = (state.snippets as Snippet[]).find((s) => s.id === pendingReturnId);
  useStore.setState({ pendingReturnId: null });
  if (snippet) openDetails(snippet);
});
