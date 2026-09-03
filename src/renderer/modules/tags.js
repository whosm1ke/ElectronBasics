// tags.js — the tag filter chips row under the search bar. Self-registers
// on 'snippets-changed' (tag counts can change on add/delete/import) and
// imports cards.js's `refresh` for the one case it needs to force a
// re-render itself: clicking a chip. (cards.js never imports this file.)
import { dom } from './dom.js';
import { state } from './state.js';
import { tagIcon, escapeHtml } from './utils.js';
import { onSnippetsChanged } from './events.js';
import { refresh } from './cards.js';

export function renderTagFilters() {
  dom.tagFilters.innerHTML = '';
  const counts = new Map();
  state.snippets.forEach((s) => {
    const key = s.tag.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  dom.tagFilters.appendChild(buildChip(null, 'All', state.snippets.length));
  Array.from(counts.keys()).sort().forEach((tag) => {
    dom.tagFilters.appendChild(buildChip(tag, tag, counts.get(tag)));
  });
}

onSnippetsChanged(renderTagFilters);

function buildChip(tagKey, label, count) {
  const chip = document.createElement('button');
  chip.className = 'tag-chip' + (state.activeTag === tagKey ? ' active' : '');
  chip.innerHTML = `${tagKey ? tagIcon(tagKey) + ' ' : ''}${escapeHtml(label)} <span class="chip-count">${count}</span>`;
  chip.addEventListener('click', () => {
    state.activeTag = state.activeTag === tagKey ? null : tagKey;
    renderTagFilters();
    refresh();
  });
  return chip;
}
