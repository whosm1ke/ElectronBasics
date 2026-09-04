// SnippetList.tsx — ported from modules/cards.js's render()/refresh() +
// buildGroupHeader(). Mounted directly into index.html's existing
// #snippetList element (a sibling of #emptyState and the footer's
// #snippetCount — see this file's header comment on why those two are
// still poked imperatively via modules/dom.js rather than owned by this
// component's own render tree). Subscribes to modules/events.js's
// snippets-changed/groups-changed once at module load, exactly like the
// original — see modules/cards.js, now a re-export shim pointing here.
import { useEffect } from 'react';
import type { Snippet } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { tagIcon } from '../../lib/utils';
import { Card } from './Card';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { dom } from '../../../modules/dom';
import { state } from '../../../modules/state';
import { onSnippetsChanged, onGroupsChanged } from '../../lib/events';
import { applyFilter, isReorderable } from '../../lib/snippetsStore';
import { openBatchConfig } from '../../store/useBatchStore';

/** Recomputes state.filtered from the current search box value + filters, then redraws — the same contract modules/cards.js's refresh() had (many not-yet-ported modules call this by that name via the re-export shim). */
export function refresh(): void {
  applyFilter(dom.searchInput!.value);
  bumpSnippetsVersion();
}

onSnippetsChanged(refresh);
onGroupsChanged(refresh);

/** Forces a redraw without re-deriving state.filtered — for a selection-only change (arrow keys, click, favorites). Same name/contract as the original export so keyboard.js/favorites.js keep working via the shim. */
export function updateSelectionStyles(): void {
  bumpSnippetsVersion();
}

function GroupHeader({ tag, count }: { tag: string; count: number }) {
  const items = (state.filtered as Snippet[]).filter((s) => s.tag.toLowerCase() === tag);
  return (
    <div className="group-header">
      <div className="group-header-title">
        {tagIcon(tag)} {tag} · {count}
      </div>
      <button type="button" className="btn group-run-all" onClick={() => openBatchConfig(items)}>
        {/* eslint-disable-next-line react/no-danger */}
        <span dangerouslySetInnerHTML={{ __html: iconSvg('play') }} />
        <span>Run all</span>
      </button>
    </div>
  );
}

export function SnippetList() {
  useSnippetsVersion(); // re-render on every bump; data is read fresh below

  const snippets = state.snippets as Snippet[];
  const filtered = state.filtered as Snippet[];
  const reorderable = isReorderable(dom.searchInput!.value);

  useEffect(() => {
    if (dom.snippetCount) {
      dom.snippetCount.textContent = `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`;
    }
    if (dom.emptyState) dom.emptyState.hidden = filtered.length !== 0;
  });

  if (filtered.length === 0) return null;

  let currentGroupTag: string | null = null;
  const nodes: React.ReactNode[] = [];
  filtered.forEach((snippet, index) => {
    if (state.groupView && snippet.tag.toLowerCase() !== currentGroupTag) {
      currentGroupTag = snippet.tag.toLowerCase();
      const count = filtered.filter((s) => s.tag.toLowerCase() === currentGroupTag).length;
      nodes.push(<GroupHeader key={`group-${currentGroupTag}`} tag={currentGroupTag} count={count} />);
    }
    nodes.push(
      <Card
        key={snippet.id}
        snippet={snippet}
        index={index}
        reorderable={reorderable}
        selected={index === state.selectedIndex}
        selectMode={Boolean(state.selectMode)}
        selectedForBatch={(state.selectedIds as Set<string>).has(snippet.id)}
        onSelectForBatch={(id, checked) => {
          const ids = state.selectedIds as Set<string>;
          if (checked) ids.add(id);
          else ids.delete(id);
          document.dispatchEvent(new CustomEvent('batch-selection-changed'));
          bumpSnippetsVersion();
        }}
        onSelectCard={(index) => {
          state.selectedIndex = index;
          bumpSnippetsVersion();
        }}
      />
    );
  });

  return <>{nodes}</>;
}
