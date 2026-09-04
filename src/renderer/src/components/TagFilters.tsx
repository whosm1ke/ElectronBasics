// TagFilters.tsx — ported from modules/tags.js. Mounted into index.html's
// existing #tagFilters element. Reads modules/state.js directly and
// redraws on the same version signal SnippetList uses (a tag-click
// mutates state.activeTag then calls refresh(), same contract as before).
import type { Snippet } from '@shared/types';
import { tagIcon } from '../lib/utils';
import { useSnippetsVersion } from '../store/useSnippetsVersion';
import { state } from '../../modules/state';
import { refresh } from './Card/SnippetList';

export function TagFilters() {
  useSnippetsVersion();

  const snippets = state.snippets as Snippet[];
  const counts = new Map<string, number>();
  snippets.forEach((s) => {
    const key = s.tag.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  function selectTag(tagKey: string | null) {
    state.activeTag = state.activeTag === tagKey ? null : tagKey;
    refresh();
  }

  return (
    <>
      <button type="button" className={'tag-chip' + (state.activeTag === null ? ' active' : '')} onClick={() => selectTag(null)}>
        All <span className="chip-count">{snippets.length}</span>
      </button>
      {Array.from(counts.keys())
        .sort()
        .map((tag) => (
          <button type="button" key={tag} className={'tag-chip' + (state.activeTag === tag ? ' active' : '')} onClick={() => selectTag(tag)}>
            {tagIcon(tag)} {tag} <span className="chip-count">{counts.get(tag)}</span>
          </button>
        ))}
    </>
  );
}
