// useEditorStore.ts — open/closed state + which snippet (if any) is being
// edited, for the Add/Edit snippet modal. Ported from modules/editor-modal.js.
// The form FIELD state itself lives inside EditorModal.tsx as local
// component state (resets from the target snippet each time the modal
// opens) — this store only tracks "is it open, and editing what."
import { create } from 'zustand';
import { emitEditorClosed } from '../lib/events';

interface EditorState {
  open: boolean;
  editingId: string | null;
}

const useStore = create<EditorState>(() => ({ open: false, editingId: null }));

export function useEditorStore(): EditorState {
  return useStore();
}

/** Pass null to open in "new snippet" mode, or a snippet to edit it. */
export function openModal(snippetToEdit: { id: string } | null): void {
  useStore.setState({ open: true, editingId: snippetToEdit ? snippetToEdit.id : null });
}

export function closeModal(): void {
  useStore.setState({ open: false, editingId: null });
  document.getElementById('searchInput')?.focus();
  emitEditorClosed();
}

export function isEditorOpen(): boolean {
  return useStore.getState().open;
}
