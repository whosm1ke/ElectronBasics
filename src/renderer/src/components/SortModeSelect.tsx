// SortModeSelect.tsx — the tag-filters row's sort-order picker. Replaces
// the native <select id="sortModeSelect"> + .select-wrap chevron-overlay
// workaround (see style.css's "Wraps a native <select>..." comment) with
// ThemedSelect, for the same reason the shell picker and every other
// componentized dropdown in the app already made that switch — a real
// themed listbox instead of a native arrow that never quite lined up
// against this app's own padding. Mounted into its own static container
// (#sortModeSelect in index.html) by legacyMounts.tsx, same pattern as
// SnippetList/TagFilters/FavoritesBar — state.sortMode is read/written
// directly (mirroring the plain-DOM code this replaced) since nothing
// outside this component's own onChange ever changes it.
import { useState } from 'react';
import { ThemedSelect } from './shared/ThemedSelect';
import { state } from '../../modules/state';
import { refresh } from './Card/SnippetList';
import type { SortMode } from '../lib/snippetsStore';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Pinned first' },
  { value: 'az', label: 'A–Z' },
  { value: 'most-used', label: 'Most used' },
  { value: 'recent', label: 'Recently run' },
];

export function SortModeSelect() {
  const [sortMode, setSortMode] = useState<SortMode>(() => state.sortMode as SortMode);

  return (
    <ThemedSelect
      value={sortMode}
      options={SORT_OPTIONS}
      onChange={(value) => {
        setSortMode(value);
        state.sortMode = value;
        localStorage.setItem('snippetRunner.sortMode', value);
        refresh();
      }}
    />
  );
}
