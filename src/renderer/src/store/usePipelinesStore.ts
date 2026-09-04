// usePipelinesStore.ts — open/closed + list/editor view state for the
// Pipelines modal, plus the saved pipelines list itself (nothing else in
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
}

const useStore = create<PipelinesState>(() => ({ open: false, view: 'list', editingId: null, pipelines: [] }));

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

export function showPipelinesListView(): void {
  useStore.setState({ view: 'list', editingId: null });
}

export function closePipelines(): void {
  useStore.setState({ open: false });
}

export function isPipelinesOpen(): boolean {
  return useStore.getState().open;
}

export async function savePipelinesList(pipelines: Pipeline[]): Promise<void> {
  const saved = await window.electronAPI.savePipelines(pipelines);
  useStore.setState({ pipelines: saved });
}

/** Reopens the modal (to whichever view it was showing) once a pipeline run's results modal closes — see PipelinesModal.tsx's onBatchModalClosed listener for why this needs to be callable from outside a render. */
export function reopenAt(view: 'list' | 'editor'): void {
  useStore.setState({ open: true, view });
}
