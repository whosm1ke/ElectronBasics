// snippetsStore.ts — the data layer: load/persist/filter/sort/group and
// the three simple mutations (duplicate/delete/pin) that don't need a
// modal. No rendering lives here — persistSnippets() just emits
// 'snippets-changed'; SnippetList.tsx (via useSnippetsVersion) redraws
// itself. Ported from modules/snippets-store.js.
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Snippet } from '@shared/types';
import { newId } from './utils';
import { emitSnippetsChanged } from './events';
import { state } from '../../modules/state';

export type SortMode = 'manual' | 'az' | 'most-used' | 'recent';

// Weighted multi-field fuzzy search (replaces the old plain
// haystack.includes(query) substring match) — name matches rank above one
// buried in a long multi-step command, and typos/partial words still find
// the right snippet. `steps` alongside `command` is belt-and-suspenders:
// storage/snippets.ts always keeps `command` populated (joined from `steps`
// for a sequence) so this key alone should already cover multi-step
// snippets, but searching both matches what the original substring haystack
// did (it explicitly included both too).
//
// Every option below was tuned against this app's own default 42-snippet
// library, not left at Fuse's defaults (0.6 threshold, no minMatchCharLength)
// — the note that recommended this library explicitly warned to do exactly
// that ("tune the weights/threshold... to avoid making results feel worse
// via over-eager fuzzy matches"), and the untuned defaults genuinely did:
// - `ignoreLocation: true` is required, not optional — Fuse's default
//   location-sensitive scoring only looks near the *start* of a field, so a
//   word appearing late in a long multi-step `command` string (exactly the
//   case this library replacement was meant to help with) scored as no
//   match at all. Confirmed with a synthetic long-command snippet during
//   this tuning: `kubectl` buried ~130 characters into a joined command was
//   found with ignoreLocation:true and silently missed without it.
// - `minMatchCharLength: 3` turned out load-bearing too: without it, a
//   short/common-letter query (e.g. "gti", a two-letter transposition typo
//   of "git") fuzzy-matched against 20+ unrelated snippets once the
//   threshold was loose enough to tolerate the typo at all — short queries
//   have very little "edit budget" to work with, so weak partial-character
//   matches on long free-text fields (`command`/`notes`) satisfied the
//   threshold almost by coincidence. Filtering out sub-3-character partial
//   matches removed that noise entirely without giving up the typo
//   tolerance itself: "gti" now returns exactly the same result set as
//   typing "git" correctly, no more and no less.
// - `threshold: 0.35` (Fuse's own default is 0.6, notably looser) is the
//   tightest value that still caught realistic single-typo queries tested
//   against the real snippet set ("staus"→status, "netowrk"→network,
//   "dokcer"→docker, "uptme"→uptime) without also matching queries that
//   share no real relationship to the result.
const SEARCH_OPTIONS: IFuseOptions<Snippet> = {
  ignoreLocation: true,
  minMatchCharLength: 3,
  threshold: 0.35,
  keys: [
    { name: 'name', weight: 2 },
    { name: 'tag', weight: 1.5 },
    { name: 'command', weight: 1 },
    { name: 'steps', weight: 1 },
    { name: 'cwd', weight: 0.5 },
    { name: 'notes', weight: 0.5 },
  ],
};

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
  const query = searchValue.trim();
  let list = (state.snippets as Snippet[]).slice();

  if (state.activeTag) {
    list = list.filter((s) => s.tag.toLowerCase() === state.activeTag);
  }

  if (query) {
    // Relevance ranking (fuse.js) wins over state.sortMode while actively
    // searching — az/most-used/recent describe how to browse the *whole*
    // library, not how to rank one search's own results. Pinned-first still
    // applies on top, bucketed exactly like sortSnippets does for every
    // other mode, just ranked by relevance *within* each bucket instead of
    // by the sort comparator.
    const ranked = new Fuse(list, SEARCH_OPTIONS).search(query).map((r) => r.item);
    list = [...ranked.filter((s) => s.pinned), ...ranked.filter((s) => !s.pinned)];
  } else {
    list = sortSnippets(list, state.sortMode as SortMode);
  }

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
