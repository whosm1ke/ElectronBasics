// useSnippetsVersion.ts — the redraw signal shared by every card-list-
// adjacent component ported ahead of state.js itself (SnippetList,
// TagFilters, FavoritesBar). None of these own their data — they all read
// modules/state.js fresh on every render — this store's only job is "when
// to re-render," decoupled from the old modules/events.js bus so a
// selection-only change (cheap) doesn't have to reuse the same channel as
// a real snippets/groups change (which also re-derives state.filtered).
import { create } from 'zustand';

const useVersionStore = create<{ v: number }>(() => ({ v: 0 }));

export function bumpSnippetsVersion(): void {
  useVersionStore.setState((s) => ({ v: s.v + 1 }));
}

/** Subscribe a component to redraw on the next bump. */
export function useSnippetsVersion(): number {
  return useVersionStore((s) => s.v);
}
