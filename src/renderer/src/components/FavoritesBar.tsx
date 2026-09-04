// FavoritesBar.tsx — ported from modules/favorites.js. Mounted into
// index.html's existing #favoritesBar element. Clicking a favorite still
// finds the now-React-rendered card by data-index and clicks its primary
// button (Run, or a background snippet's Start/Stop — both carry
// .btn-primary) rather than duplicating run-engine.js's logic here — same
// approach as the original, and it works unchanged since real DOM doesn't
// care who created it.
import { useEffect } from 'react';
import type { Snippet } from '@shared/types';
import { snippetIcon, tagColors } from '../lib/utils';
import { useSnippetsVersion } from '../store/useSnippetsVersion';
import { state } from '../../modules/state';
import { dom } from '../../modules/dom';
import { refresh, updateSelectionStyles } from './Card/SnippetList';

export function FavoritesBar() {
  useSnippetsVersion();

  const snippets = state.snippets as Snippet[];
  const pinned = snippets.filter((s) => s.pinned);

  // This component only owns #favoritesBar's *children* — the container's
  // own `hidden` attribute (present by default in index.html's static
  // markup) has to be toggled separately, same as #emptyState/#snippetCount
  // in SnippetList.tsx.
  useEffect(() => {
    if (dom.favoritesBar) dom.favoritesBar.hidden = pinned.length === 0;
  });

  function runFromFavorites(snippet: Snippet) {
    let filtersChanged = false;
    if (state.activeTag && state.activeTag !== snippet.tag.toLowerCase()) {
      state.activeTag = null;
      filtersChanged = true;
    }
    if (dom.searchInput!.value.trim()) {
      dom.searchInput!.value = '';
      filtersChanged = true;
    }
    if (filtersChanged) {
      refresh();
    } else if ((state.filtered as Snippet[]).length === 0) {
      refresh();
    }

    const idx = (state.filtered as Snippet[]).findIndex((s) => s.id === snippet.id);
    if (idx < 0) return;
    state.selectedIndex = idx;
    updateSelectionStyles();
    const card = dom.snippetList!.querySelector(`.card[data-index="${idx}"]`);
    card?.scrollIntoView({ block: 'center' });
    (card?.querySelector('.btn-primary') as HTMLElement | null)?.click();
  }

  if (pinned.length === 0) return null;

  return (
    <>
      {pinned.map((snippet) => {
        const colors = tagColors(snippet.tag);
        return (
          <button
            type="button"
            key={snippet.id}
            className="favorite-item"
            style={{ background: colors.bg }}
            title={snippet.name}
            onClick={() => runFromFavorites(snippet)}
          >
            {snippetIcon(snippet)}
          </button>
        );
      })}
    </>
  );
}
