// SnippetList.tsx — ported from modules/cards.js's render()/refresh() +
// buildGroupHeader(). Mounted directly into index.html's existing
// #snippetList element (a sibling of #emptyState and the footer's
// #snippetCount — see this file's header comment on why those two are
// still poked imperatively via modules/dom.js rather than owned by this
// component's own render tree). Subscribes to modules/events.js's
// snippets-changed/groups-changed once at module load, exactly like the
// original — see modules/cards.js, now a re-export shim pointing here.
import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Play } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { tagIcon } from '../../lib/utils';
import { Card } from './Card';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { dom } from '../../../modules/dom';
import { state } from '../../../modules/state';
import { onSnippetsChanged, onGroupsChanged } from '../../lib/events';
import { applyFilter, isReorderable, persistSnippets } from '../../lib/snippetsStore';
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
        <span><Play size={13} fill="currentColor" stroke="none" /></span>
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

  // PointerSensor's small activation distance keeps ordinary clicks (Run,
  // pin, etc.) from being swallowed as micro-drags; KeyboardSensor is what
  // makes the drag handle focusable-and-arrow-key-movable for free (the
  // original native-HTML5-DnD handle had no keyboard path at all).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Drives the "insertion line" indicator on whichever card is currently
  // under the pointer — dnd-kit's own sliding-reflow animation communicates
  // this too, but a visible edge highlight is a clearer, more explicit
  // signal of exactly where the card will land (matches every other
  // drag-and-drop surface in this app).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }
  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  // Mirrors the original handleDrop: reorders the raw state.snippets array
  // by id (not `filtered`, which in manual mode still separates pinned from
  // unpinned — see isReorderable()'s own comment) and persists.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;
    const list = state.snippets as Snippet[];
    const fromIdx = list.findIndex((s) => s.id === active.id);
    const toIdx = list.findIndex((s) => s.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    state.snippets = arrayMove(list, fromIdx, toIdx);
    void persistSnippets();
  }

  useEffect(() => {
    if (dom.snippetCount) {
      dom.snippetCount.textContent = `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`;
    }
    if (dom.emptyState) dom.emptyState.hidden = filtered.length !== 0;
  });

  if (filtered.length === 0) return null;

  // `items` stays empty when not reorderable (grouped view always pushes
  // GroupHeader nodes in between, per isReorderable()'s own !groupView
  // requirement, so `nodes` is a pure Card list whenever this is non-empty).
  const sortableIds = reorderable ? filtered.map((s) => s.id) : [];

  let currentGroupTag: string | null = null;
  const nodes: React.ReactNode[] = [];
  filtered.forEach((snippet, index) => {
    if (state.groupView && snippet.tag.toLowerCase() !== currentGroupTag) {
      currentGroupTag = snippet.tag.toLowerCase();
      const count = filtered.filter((s) => s.tag.toLowerCase() === currentGroupTag).length;
      nodes.push(<GroupHeader key={`group-${currentGroupTag}`} tag={currentGroupTag} count={count} />);
    }
    // Which edge (if any) of THIS card should show the insertion line —
    // "after" when dragging downward past it, "before" when dragging
    // upward past it, based on the active/over card's relative position.
    let dropIndicator: 'before' | 'after' | null = null;
    if (overId === snippet.id && activeId && activeId !== snippet.id) {
      const activeIdx = sortableIds.indexOf(activeId);
      const overIdx = sortableIds.indexOf(overId);
      dropIndicator = activeIdx < overIdx ? 'after' : 'before';
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
        dropIndicator={dropIndicator}
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {nodes}
      </SortableContext>
    </DndContext>
  );
}
