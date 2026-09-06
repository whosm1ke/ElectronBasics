// usePipelinesStore.ts — open/closed + list/editor view state for the
// Pipelines screen, plus the saved pipelines list itself (nothing else in
// the app reads it, unlike groups/variables — safe to keep fully local
// here rather than split against modules/state.js). Ported from
// modules/pipeline-editor.js. The *working copy* being edited
// (nodes/edges/selection) is PipelinesModal.tsx's own local component
// state, not here — see that file's header comment on why (Phase 10: the
// migration plan's canvas-drag escape hatch needs it local, not global).
import { create } from 'zustand';
import type { Pipeline } from '@shared/types';

interface PipelinesState {
  open: boolean;
  view: 'list' | 'editor';
  editingId: string | null;
  pipelines: Pipeline[];
  // Set only by closePipelinesForRun() (never the header Back button's plain
  // closePipelines()) — lets the onBatchModalClosed subscription in
  // PipelinesModal.tsx tell "this screen closed to hand off to a run's
  // results modal, reopen once that's dismissed" apart from "the user backed
  // out on purpose, leave it closed."
  pendingReopen: boolean;
}

const useStore = create<PipelinesState>(() => ({ open: false, view: 'list', editingId: null, pipelines: [], pendingReopen: false }));

export function usePipelinesStore(): PipelinesState {
  return useStore();
}

export async function openPipelines(): Promise<void> {
  const pipelines = await window.electronAPI.getPipelines();
  useStore.setState({ open: true, view: 'list', editingId: null, pipelines });
}

export function openPipelineEditor(pipeline: Pipeline | null): void {
  useStore.setState({ open: true, view: 'editor', editingId: pipeline ? pipeline.id : null });
}

/**
 * Opens straight to the editor for a pipeline id without requiring the
 * caller to already hold a fresh `pipelines` list — unlike
 * `openPipelineEditor` above (which trusts the store's current list, fine
 * when called from within the Pipelines screen itself), this re-fetches
 * first. Needed by DetailsModal.tsx's "used in pipeline" links: the
 * Pipelines screen may never have been opened yet this session, so the
 * store's `pipelines` could still be the empty initial array.
 */
export async function openPipelineEditorById(pipelineId: string): Promise<void> {
  const pipelines = await window.electronAPI.getPipelines();
  useStore.setState({ open: true, view: 'editor', editingId: pipelineId, pipelines });
}

export function showPipelinesListView(): void {
  useStore.setState({ view: 'list', editingId: null });
}

export function closePipelines(): void {
  useStore.setState({ open: false });
}

/** Same as closePipelines(), but for the "hand off to a run's results modal" case — see pendingReopen's comment above. `view`/`editingId` are left untouched (already the case for a plain closePipelines()), so reopening lands back exactly where the run started from. */
export function closePipelinesForRun(): void {
  useStore.setState({ open: false, pendingReopen: true });
}

/** Wired to lib/events.ts's onBatchModalClosed by PipelinesModal.tsx — reopens iff the modal that just closed is the one closePipelinesForRun() itself handed off to; a no-op for every other batch/group/tag run's own results modal closing. */
export function consumePendingReopen(): void {
  if (useStore.getState().pendingReopen) useStore.setState({ open: true, pendingReopen: false });
}

export function isPipelinesOpen(): boolean {
  return useStore.getState().open;
}

export async function savePipelinesList(pipelines: Pipeline[]): Promise<void> {
  const saved = await window.electronAPI.savePipelines(pipelines);
  useStore.setState({ pipelines: saved });
}
