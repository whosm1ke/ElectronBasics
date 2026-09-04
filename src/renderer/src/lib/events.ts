// events.ts — a tiny pub/sub so modules that mutate `state.snippets` (the
// editor, batch run, drag reorder, delete/duplicate/pin, import/restore)
// don't need to import the list-rendering module directly just to say
// "please redraw." SnippetList.tsx/TagFilters.tsx/FavoritesBar.tsx each
// subscribe once (via useSnippetsVersion's bumpSnippetsVersion, itself
// wired to onSnippetsChanged); everyone else just emits after a change.
// Ported verbatim from modules/events.js.
const bus = new EventTarget();
const SNIPPETS_CHANGED = 'snippets-changed';
const EDITOR_CLOSED = 'editor-closed';
const GROUPS_CHANGED = 'groups-changed';
const BATCH_MODAL_CLOSED = 'batch-modal-closed';

type Handler = () => void;

export function onSnippetsChanged(handler: Handler): void {
  bus.addEventListener(SNIPPETS_CHANGED, handler);
}
export function emitSnippetsChanged(): void {
  bus.dispatchEvent(new Event(SNIPPETS_CHANGED));
}

/** Fired whenever the saved groups list changes (add/edit/delete a group) — Card.tsx reads groupsForSnippet() on every render, driven by the same signal. */
export function onGroupsChanged(handler: Handler): void {
  bus.addEventListener(GROUPS_CHANGED, handler);
}
export function emitGroupsChanged(): void {
  bus.dispatchEvent(new Event(GROUPS_CHANGED));
}

/**
 * Fired whenever the shared batch-results modal (BatchModal.tsx) closes —
 * used by PipelinesModal.tsx to reopen the Pipelines modal it hid before
 * starting a run, so seeing pipeline results never requires closing the
 * pipeline editor first. Generic on purpose (BatchModal has no idea
 * pipelines exist — it just announces "I closed"); harmless no-op for
 * every other caller (select-mode batch, group run, tag "Run all") since
 * nothing else listens.
 */
export function onBatchModalClosed(handler: Handler): void {
  bus.addEventListener(BATCH_MODAL_CLOSED, handler);
}
export function emitBatchModalClosed(): void {
  bus.dispatchEvent(new Event(BATCH_MODAL_CLOSED));
}

/**
 * Fired whenever the Add/Edit snippet modal closes (Cancel, Save, or
 * Escape) — used by useDetailsStore.ts to reopen Details for wherever the
 * editor was navigated FROM (via a "Runs before it"/"Runs after it" link).
 * A listener with nothing pending just no-ops.
 */
export function onEditorClosed(handler: Handler): void {
  bus.addEventListener(EDITOR_CLOSED, handler);
}
export function emitEditorClosed(): void {
  bus.dispatchEvent(new Event(EDITOR_CLOSED));
}
