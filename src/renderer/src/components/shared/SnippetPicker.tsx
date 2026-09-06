// SnippetPicker.tsx — the searchable, tag-filterable "pick one (or more) of
// these" UI originally built for PipelinesModal.tsx's "+ Snippet"/"Change
// step…"/"+ Sub-pipeline…"/"Connect to…" pickers, pulled out here so every
// other "pick a snippet" spot in the app (Settings' file-watch triggers,
// Variables' computed-variable source, Groups' member checklist, EditorModal's
// run-before/run-after fields, …) gets the same fast search + tag chips
// instead of a plain `<select>`/free-scroll checklist.
//
// Three exports cover the three ways this gets used, all sharing
// useSnippetFilter()'s search+tag-filter logic so it's written once:
// - `SnippetPickerMenu` + `PickerItem`/`SnippetPickerState` — the generic
//   FLOATING menu, for a call site that already manages its own
//   anchor/open state (PipelinesModal.tsx's Inspector, which points this at
//   snippets, other pipelines, AND other steps depending on which button
//   was clicked — not always snippets, so it stays generic here).
// - `SnippetPickerField` — a self-contained "current value + Change…
//   button" field wrapping SnippetPickerMenu, for the common case of
//   picking exactly one snippet and nothing else.
// - `SnippetMultiPickerList` — an always-visible (not floating), checkbox-
//   based INLINE list for picking several at once (Groups' member
//   checklist) — same search box + tag chips, no popup/positioning needed
//   since it's meant to sit directly in a form, not appear on a click.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { snippetIcon } from '../../lib/utils';

export interface PickerItem {
  id: string;
  label: ReactNode;
  /** The item's category/tag, when it has one — drives the filter-chip row below. Omit where a tag doesn't apply. */
  tag?: string;
  /** Lowercased search blob the search box matches against — same "search everything, cheaply" shape as the main list's own free-text search. */
  filterText: string;
}

export interface SnippetPickerState {
  anchor: DOMRect;
  items: PickerItem[];
  emptyLabel: string;
  onPick: (id: string) => void;
}

/** Every snippet, formatted for this picker — the common case nearly every call site wants; a call site with a different item shape (other pipelines, other pipeline steps) just builds its own `PickerItem[]` instead. */
export function snippetPickerItems(snippets: Snippet[]): PickerItem[] {
  return snippets.map((s) => ({
    id: s.id,
    label: (
      <>
        {snippetIcon(s)} {s.name}
      </>
    ),
    tag: s.tag,
    filterText: `${s.name} ${s.tag} ${s.command}`.toLowerCase(),
  }));
}

/** The search-text + active-tag-chip state and the resulting filtered/tag list — shared by the floating menu and the inline multi-picker list below so neither hand-rolls its own copy of "match query, match tag" filtering. */
function useSnippetFilter(items: PickerItem[]) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Every distinct tag among this picker's own items, alphabetical — not
  // the whole library's tag set, so a tag-less item list simply shows no
  // chip row.
  const tags = Array.from(new Set(items.map((i) => i.tag).filter((t): t is string => Boolean(t)))).sort((a, b) => a.localeCompare(b));
  const q = query.trim().toLowerCase();
  const visible = items.filter((item) => (!activeTag || item.tag === activeTag) && (!q || item.filterText.includes(q)));
  return { query, setQuery, activeTag, setActiveTag, tags, visible };
}

let pickerMenuIdCounter = 0;

export function SnippetPickerMenu({ picker, onClose }: { picker: SnippetPickerState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Unique per mounted instance — two of these could conceivably be
  // triggered from different parts of the same screen; a shared id would
  // make the outside-mousedown check below think a click inside ONE
  // instance should never close the OTHER.
  const idRef = useRef(`snippetPickerMenu-${++pickerMenuIdCounter}`);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { query, setQuery, activeTag, setActiveTag, tags, visible } = useSnippetFilter(picker.items);

  // Reposition whenever the *content* height changes too (typing a query or
  // picking a tag can shrink the list a lot), not just on first mount —
  // otherwise a long "no matches" gap could open up below a short filtered
  // list, or the menu could clip past the viewport bottom on a big one.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const mRect = menu.getBoundingClientRect();
    setPos({
      left: Math.max(6, Math.min(picker.anchor.left, window.innerWidth - mRect.width - 6)),
      top: Math.min(picker.anchor.bottom + 4, window.innerHeight - mRect.height - 6),
    });
  }, [picker, query, activeTag]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(`#${idRef.current}`)) onClose();
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  function pick(id: string) {
    picker.onPick(id);
    onClose();
  }

  // Portaled straight to <body> rather than rendered in place: this menu is
  // `position: fixed` positioned from the anchor button's own *viewport*
  // coordinates (getBoundingClientRect() above), which only lines up
  // correctly if nothing between it and the viewport establishes a new
  // containing block for fixed-position descendants. EditorModal.tsx's
  // (and VariablesModal.tsx's) `.modal` does exactly that: its entrance
  // animation (`modal-in`) ends on `transform: scale(1) translateY(0)`,
  // and a computed `transform` other than `none` — even a no-op identity
  // scale — creates a containing block per spec, same class of quirk as
  // `.app-shell`'s own UI-scale transform. Without the portal, a menu
  // opened from a field inside that modal positioned itself relative to
  // the MODAL's box instead of the viewport, landing outside it. Rendering
  // as a `.screen` (PipelinesModal.tsx's own usage, `animation: fade-in` —
  // opacity only) never hit this, which is why it looked fine there.
  return createPortal(
    <div
      ref={menuRef}
      className="context-menu pipeline-picker-menu"
      id={idRef.current}
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        // Stops Escape from also reaching keyboard.ts's document-level
        // routing once it bubbles — that listener falls back to whichever
        // isXOpen() check matches first (the screen/modal this picker was
        // opened from), closing that entirely instead of just this menu.
        e.stopPropagation();
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'Enter' && visible.length > 0) { e.preventDefault(); pick(visible[0].id); }
      }}
    >
      {picker.items.length > 0 && (
        <input
          type="text"
          className="field-input pipeline-picker-search"
          placeholder="Search by name, tag, or command…"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {tags.length > 1 && (
        <div className="pipeline-picker-tags no-scrollbar">
          <button type="button" className={'pipeline-picker-tag-chip' + (activeTag === null ? ' active' : '')} onClick={() => setActiveTag(null)}>
            All
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={'pipeline-picker-tag-chip' + (activeTag === tag ? ' active' : '')}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="pipeline-picker-list no-scrollbar">
        {picker.items.length === 0 ? (
          <div className="context-menu-item">{picker.emptyLabel}</div>
        ) : visible.length === 0 ? (
          <div className="context-menu-item pipeline-picker-empty">No matches</div>
        ) : (
          visible.map((item) => (
            <button type="button" key={item.id} className="context-menu-item" onClick={() => pick(item.id)}>
              <span>{item.label}</span>
              {item.tag && <span className="pipeline-picker-item-tag">{item.tag}</span>}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

interface SnippetMultiPickerListProps {
  items: PickerItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel?: string;
}

/** The inline, always-visible sibling of SnippetPickerMenu — same search box + tag chips, checkboxes instead of click-to-pick-and-close, no floating/positioning since it's meant to sit directly in a form (Groups' member checklist). */
export function SnippetMultiPickerList({ items, selectedIds, onToggle, emptyLabel = 'No snippets yet — add some first.' }: SnippetMultiPickerListProps) {
  const { query, setQuery, activeTag, setActiveTag, tags, visible } = useSnippetFilter(items);

  return (
    <div className="snippet-multi-picker">
      {items.length > 5 && (
        <input
          type="text"
          className="field-input pipeline-picker-search"
          placeholder="Search by name, tag, or command…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {tags.length > 1 && (
        <div className="pipeline-picker-tags no-scrollbar">
          <button type="button" className={'pipeline-picker-tag-chip' + (activeTag === null ? ' active' : '')} onClick={() => setActiveTag(null)}>
            All
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={'pipeline-picker-tag-chip' + (activeTag === tag ? ' active' : '')}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="group-snippet-checklist no-scrollbar">
        {items.length === 0 ? (
          <div className="variables-empty">{emptyLabel}</div>
        ) : visible.length === 0 ? (
          <div className="variables-empty">No matches.</div>
        ) : (
          visible.map((item) => (
            <label className="group-checklist-row" key={item.id}>
              <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => onToggle(item.id)} />
              <span className="group-checklist-label">{item.label}</span>
              {item.tag && <span className="group-checklist-tag">{item.tag}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

interface SnippetPickerFieldProps {
  value: string; // a snippet id, or '' for none picked yet
  onChange: (snippetId: string) => void;
  snippets: Snippet[];
  placeholder?: string;
  emptyLabel?: string;
  /** Shows a small clear (×) button next to Change… whenever a value is picked — for a field where "nothing picked" is itself a valid, meaningful state (EditorModal's optional run-before/run-after) rather than something the field always needs filled in (a file-watch trigger's target, a computed variable's source). Omit for the latter. */
  clearable?: boolean;
}

/** A self-contained "pick exactly one snippet" field: a button showing the current pick (or a placeholder), opening the same searchable/taggable menu on click. Owns its own anchor/open state, so a call site just needs `value`/`onChange`. */
export function SnippetPickerField({ value, onChange, snippets, placeholder = 'Pick a snippet…', emptyLabel = 'No snippets yet', clearable = false }: SnippetPickerFieldProps) {
  const [picker, setPicker] = useState<SnippetPickerState | null>(null);
  const current = snippets.find((s) => s.id === value);

  return (
    <div className="snippet-picker-field-wrap">
      <button
        type="button"
        className="btn snippet-picker-field-btn"
        onClick={(e) => setPicker({ anchor: e.currentTarget.getBoundingClientRect(), items: snippetPickerItems(snippets), emptyLabel, onPick: onChange })}
      >
        <span className="snippet-picker-field-value">{current ? <>{snippetIcon(current)} {current.name}</> : placeholder}</span>
        <Pencil size={12} />
      </button>
      {clearable && current && (
        <button type="button" className="btn btn-ghost snippet-picker-field-clear" title="Clear" onClick={() => onChange('')}>
          ×
        </button>
      )}
      {picker && <SnippetPickerMenu picker={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
