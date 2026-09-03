// favorites.js — the always-visible pinned-snippet bar under the search box.
// Self-registers on 'snippets-changed' so it stays in sync with pin
// toggles, deletes, imports, etc. without any other module needing to know
// this bar exists. (cards.js/tags.js never import this file, so importing
// their refresh/render functions here is a one-way edge, not a cycle.)
import { dom } from './dom.js';
import { state } from './state.js';
import { snippetIcon, tagColors } from './utils.js';
import { onSnippetsChanged } from './events.js';
import { refresh, updateSelectionStyles } from './cards.js';
import { renderTagFilters } from './tags.js';

function render() {
  const pinned = state.snippets.filter((s) => s.pinned);
  dom.favoritesBar.innerHTML = '';
  dom.favoritesBar.hidden = pinned.length === 0;
  pinned.forEach((snippet) => {
    const colors = tagColors(snippet.tag);
    const item = document.createElement('button');
    item.className = 'favorite-item';
    item.style.background = colors.bg;
    item.title = snippet.name;
    item.textContent = snippetIcon(snippet);
    item.addEventListener('click', () => runFromFavorites(snippet));
    dom.favoritesBar.appendChild(item);
  });
}

onSnippetsChanged(render);

function runFromFavorites(snippet) {
  let filtersChanged = false;
  if (state.activeTag && state.activeTag !== snippet.tag.toLowerCase()) {
    state.activeTag = null;
    filtersChanged = true;
  }
  if (dom.searchInput.value.trim()) {
    dom.searchInput.value = '';
    filtersChanged = true;
  }
  if (filtersChanged) {
    renderTagFilters();
    refresh();
  } else if (state.filtered.length === 0) {
    refresh();
  }

  const idx = state.filtered.findIndex((s) => s.id === snippet.id);
  if (idx < 0) return;
  state.selectedIndex = idx;
  updateSelectionStyles();
  const card = dom.snippetList.querySelector(`.card[data-index="${idx}"]`);
  card?.scrollIntoView({ block: 'center' });
  card?.querySelector('.btn-primary')?.click();
}
