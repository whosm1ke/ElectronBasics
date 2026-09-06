// CommandPaletteModal.tsx — Ctrl+K: fuzzy-search every snippet (Enter runs
// it, same as clicking Run on its card) plus every other screen/action in
// the app, in one list. Reuses the same tuned Fuse.js options
// snippetsStore.ts's own search uses (see that file's header comment for
// why each option is set the way it is) — a command palette is exactly the
// same "find the right thing fast, typos included" problem.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import { Search, Plus, Layers, Waypoints, Activity, Calendar, History as HistoryIcon, Settings as SettingsIcon, Terminal, HelpCircle } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { snippetIcon } from '../../lib/utils';
import { quickRunSnippet } from '../../lib/quickRun';
import { useCommandPaletteStore, closeCommandPalette } from '../../store/useCommandPaletteStore';
import { openModal } from '../../store/useEditorStore';
import { openGroups } from '../../store/useGroupsStore';
import { openPipelines } from '../../store/usePipelinesStore';
import { openHealth } from '../../store/useHealthStore';
import { openScheduleOverview } from '../../store/useScheduleStore';
import { openTerminalHistory } from '../../store/useTerminalHistoryStore';
import { openHistory } from '../../store/useHistoryStore';
import { openSettings } from '../../store/useSettingsStore';
import { state } from '../../../modules/state';

interface PaletteItem {
  id: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

function actionItems(): PaletteItem[] {
  return [
    { id: 'action-new', icon: <Plus size={14} />, label: 'New snippet', keywords: 'new snippet add create', run: () => openModal(null) },
    { id: 'action-groups', icon: <Layers size={14} />, label: 'Open Groups', keywords: 'groups saved sets', run: openGroups },
    { id: 'action-pipelines', icon: <Waypoints size={14} />, label: 'Open Pipelines', keywords: 'pipelines branching graph', run: openPipelines },
    { id: 'action-health', icon: <Activity size={14} />, label: 'Open Health', keywords: 'health issues broken', run: openHealth },
    { id: 'action-schedule', icon: <Calendar size={14} />, label: 'Open Schedule', keywords: 'schedule cron scheduled', run: openScheduleOverview },
    { id: 'action-terminal-history', icon: <Terminal size={14} />, label: 'Import from terminal history', keywords: 'terminal history import powershell bash', run: openTerminalHistory },
    { id: 'action-history', icon: <HistoryIcon size={14} />, label: 'Open run history', keywords: 'history log runs', run: openHistory },
    { id: 'action-settings', icon: <SettingsIcon size={14} />, label: 'Open Settings', keywords: 'settings preferences appearance triggers', run: openSettings },
    { id: 'action-help', icon: <HelpCircle size={14} />, label: 'Help — how each feature works', keywords: 'help docs how to guide walkthrough', run: () => openSettings('help') },
  ];
}

const SEARCH_OPTIONS: IFuseOptions<PaletteItem> = {
  ignoreLocation: true,
  minMatchCharLength: 2,
  threshold: 0.35,
  keys: [
    { name: 'label', weight: 2 },
    { name: 'keywords', weight: 1 },
  ],
};

export function CommandPaletteModal() {
  const { open } = useCommandPaletteStore();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items: PaletteItem[] = useMemo(() => {
    if (!open) return [];
    const snippetItems: PaletteItem[] = (state.snippets as Snippet[]).map((s) => ({
      id: `snip-${s.id}`,
      icon: <span className="command-palette-snippet-icon">{snippetIcon(s)}</span>,
      label: s.name || '(untitled)',
      hint: s.tag,
      keywords: `${s.tag} ${s.command}`,
      run: () => quickRunSnippet(s),
    }));
    return [...actionItems(), ...snippetItems];
  }, [open]);

  const q = query.trim();
  const results = q.length >= 2 ? new Fuse(items, SEARCH_OPTIONS).search(q).map((r) => r.item).slice(0, 40) : items.slice(0, 40);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.command-palette-item.highlighted')?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  if (!open) return null;

  function runItem(item: PaletteItem) {
    closeCommandPalette();
    item.run();
  }

  return (
    <div className="modal-overlay command-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeCommandPalette(); }}>
      <div className="command-palette">
        <div className="command-palette-search-row">
          <Search size={15} />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Run a snippet, or jump to a screen…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Stops this from ever reaching keyboard.ts's own document-level
              // Escape/shortcut routing: that listener re-checks isXOpen() for
              // every surface once the event bubbles to `document`, by which
              // point Escape/Enter here may have already closed the palette —
              // an Escape that "arrives late" then falls through every other
              // isXOpen() check and ends up hiding the whole launcher window
              // instead of just this palette (confirmed while building this).
              e.stopPropagation();
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); if (results[highlighted]) runItem(results[highlighted]); }
              else if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
            }}
          />
        </div>
        <div className="command-palette-list no-scrollbar" ref={listRef}>
          {results.length === 0 ? (
            <div className="command-palette-empty">No matches</div>
          ) : (
            results.map((item, i) => (
              <button
                type="button"
                key={item.id}
                className={'command-palette-item' + (i === highlighted ? ' highlighted' : '')}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => runItem(item)}
              >
                {item.icon}
                <span className="command-palette-item-label">{item.label}</span>
                {item.hint && <span className="command-palette-item-hint">{item.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
