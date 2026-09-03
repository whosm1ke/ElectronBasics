// events.js — a tiny pub/sub so modules that mutate `state.snippets` (the
// editor, batch run, drag reorder, delete/duplicate/pin, import/restore)
// don't need to import the list-rendering module (cards.js) directly just
// to say "please redraw." cards.js, tags.js, and favorites.js each
// subscribe once at import time; everyone else just emits after a change.
// This is what keeps the dependency graph a DAG instead of a knot.

const bus = new EventTarget();
const SNIPPETS_CHANGED = 'snippets-changed';
const EDITOR_CLOSED = 'editor-closed';
const GROUPS_CHANGED = 'groups-changed';

export function onSnippetsChanged(handler) {
  bus.addEventListener(SNIPPETS_CHANGED, handler);
}

export function emitSnippetsChanged() {
  bus.dispatchEvent(new Event(SNIPPETS_CHANGED));
}

/** Fired whenever the saved groups list changes (add/edit/delete a group) —
 * cards.js listens so a card's "in group(s)" badge stays current without
 * groups-modal.js needing to import cards.js directly (see events.js's own
 * header comment for why this indirection matters). */
export function onGroupsChanged(handler) {
  bus.addEventListener(GROUPS_CHANGED, handler);
}

export function emitGroupsChanged() {
  bus.dispatchEvent(new Event(GROUPS_CHANGED));
}

/**
 * Fired whenever the shared batch-results modal (batch-runner.js) closes —
 * used by pipeline-editor.js to reopen the Pipelines modal it hid before
 * starting a run (see pipeline-editor.js's pendingPipelineReturn), so
 * seeing pipeline results never requires closing the pipeline editor
 * first. Generic on purpose (batch-runner.js has no idea pipelines exist —
 * it just announces "I closed"); harmless no-op for every other caller
 * (select-mode batch, group run, tag "Run all") since nothing else listens.
 */
const BATCH_MODAL_CLOSED = 'batch-modal-closed';
export function onBatchModalClosed(handler) {
  bus.addEventListener(BATCH_MODAL_CLOSED, handler);
}
export function emitBatchModalClosed() {
  bus.dispatchEvent(new Event(BATCH_MODAL_CLOSED));
}

/**
 * Fired whenever the Add/Edit snippet modal closes (Cancel, Save, or
 * Escape) — used by details-modal.js to reopen Details for wherever the
 * editor was navigated FROM (via a "Runs before it"/"Runs after it" link),
 * without editor-modal.js needing to import details-modal.js back (which
 * would make a cycle, since details-modal.js already imports editor-modal.js
 * to open a linked snippet's editor in the first place). A listener with
 * nothing pending just no-ops.
 */
export function onEditorClosed(handler) {
  bus.addEventListener(EDITOR_CLOSED, handler);
}

export function emitEditorClosed() {
  bus.dispatchEvent(new Event(EDITOR_CLOSED));
}
