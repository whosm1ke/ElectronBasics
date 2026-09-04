// snippetsStore.ts — the data layer: load/persist/filter/sort/group and
// the three simple mutations (duplicate/delete/pin) that don't need a
// modal. No rendering lives here — persistSnippets() just emits
// 'snippets-changed'; SnippetList.tsx (via useSnippetsVersion) redraws
// itself. Ported from modules/snippets-store.js.
import type { Snippet } from '@shared/types';
import { newId } from './utils';
import { emitSnippetsChanged } from './events';
import { state } from '../../modules/state';

export type SortMode = 'manual' | 'az' | 'most-used' | 'recent';

export async function loadSnippets(): Promise<void> {
  state.snippets = await window.electronAPI.loadSnippets();
  emitSnippetsChanged();
}

/**
 * Saves state.snippets to disk. By default also fires 'snippets-changed',
 * which redraws the whole card list — pass `silent: true` when a caller is
 * mid-way through updating one card's own live output panel (e.g. the
 * runCount/lastRunAt bump after a run) and a full rebuild would tear out
 * DOM the user is actively looking at. A silent save still reaches disk;
 * it just doesn't trigger a redraw.
 */
export async function persistSnippets({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  state.snippets = await window.electronAPI.saveSnippets(state.snippets);
  if (!silent) emitSnippetsChanged();
}

function comparatorFor(mode: SortMode): (a: Snippet, b: Snippet) => number {
  switch (mode) {
    case 'az':
      return (a, b) => a.name.localeCompare(b.name);
    case 'most-used':
      return (a, b) => (b.runCount || 0) - (a.runCount || 0);
    case 'recent':
      return (a, b) => new Date(b.lastRunAt || 0).getTime() - new Date(a.lastRunAt || 0).getTime();
    default:
      return () => 0; // manual: preserve original relative order
  }
}

export function sortSnippets(list: Snippet[], mode: SortMode): Snippet[] {
  const pinned = list.filter((s) => s.pinned);
  const rest = list.filter((s) => !s.pinned);
  const cmp = comparatorFor(mode);
  pinned.sort(cmp);
  rest.sort(cmp);
  return [...pinned, ...rest];
}

export function regroupByTag(list: Snippet[]): Snippet[] {
  const tags = Array.from(new Set(list.map((s) => s.tag.toLowerCase()))).sort();
  const result: Snippet[] = [];
  tags.forEach((t) => result.push(...list.filter((s) => s.tag.toLowerCase() === t)));
  return result;
}

/** True only when the visible list is the plain, unfiltered manual order — the only state where drag-to-reorder makes sense. */
export function isReorderable(searchValue: string): boolean {
  return state.sortMode === 'manual' && !state.groupView && !state.activeTag && !searchValue.trim() && !state.selectMode;
}

/** Recomputes state.filtered/selectedIndex from state.snippets + the current filters. Does not render — SnippetList.tsx does that on 'snippets-changed' (via refresh()) or when called directly after a filter-only UI change (search/tag/sort/group). */
export function applyFilter(searchValue: string): void {
  const query = searchValue.trim().toLowerCase();
  let list = (state.snippets as Snippet[]).slice();

  if (state.activeTag) {
    list = list.filter((s) => s.tag.toLowerCase() === state.activeTag);
  }
  if (query) {
    list = list.filter((s) => {
      const haystack = [s.name, s.tag, s.command, s.cwd || '', s.notes || '', (s.steps || []).join(' ')].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  list = sortSnippets(list, state.sortMode as SortMode);
  if (state.groupView) list = regroupByTag(list);

  state.filtered = list;
  state.selectedIndex = list.length > 0 ? 0 : -1;
}

export async function togglePin(id: string): Promise<void> {
  const target = (state.snippets as Snippet[]).find((s) => s.id === id);
  if (target) target.pinned = !target.pinned;
  await persistSnippets();
}

export async function duplicateSnippet(id: string): Promise<Snippet | null> {
  const source = (state.snippets as Snippet[]).find((s) => s.id === id);
  if (!source) return null;
  const clone: Snippet = {
    ...source,
    id: newId('snip'),
    name: `${source.name} (copy)`,
    pinned: false,
    runCount: 0,
    lastRunAt: null,
    schedule: source.schedule ? { ...source.schedule, lastRunAt: null } : null,
  };
  const idx = (state.snippets as Snippet[]).findIndex((s) => s.id === id);
  (state.snippets as Snippet[]).splice(idx + 1, 0, clone);
  await persistSnippets();
  return source;
}

/** Removes a snippet and persists; returns {removed, index} so the caller can offer Undo. */
export async function deleteSnippet(id: string): Promise<{ removed: Snippet; index: number } | null> {
  const snippets = state.snippets as Snippet[];
  const idx = snippets.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const [removed] = snippets.splice(idx, 1);
  await persistSnippets();
  return { removed, index: idx };
}

export async function undoDelete(removed: Snippet, index: number): Promise<void> {
  (state.snippets as Snippet[]).splice(index, 0, removed);
  await persistSnippets();
}
