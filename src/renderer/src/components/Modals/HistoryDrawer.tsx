// HistoryDrawer.tsx — the run-history side panel: list, search, re-run,
// copy, clear. Ported from modules/history-drawer.js, now rendering its
// own full drawer markup (index.html no longer has a static #historyOverlay
// — see the migration plan's note on "React owns the whole overlay" for
// modals/drawers, as opposed to the inline-content pattern used for
// cards/tags/favorites).
import { useState } from 'react';
import { RotateCcw, Check, Copy, X, Terminal, ChevronDown } from 'lucide-react';
import type { HistoryEntry } from '@shared/types';
import { escapeHtml, timeAgo } from '../../lib/utils';
import { useHistoryStore, closeHistory, clearHistory, rerunFromHistory, setHistoryQuery } from '../../store/useHistoryStore';

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const [copied, setCopied] = useState(false);
  // Output stays collapsed by default — a history list is meant to be
  // scanned quickly (name/time/status across many runs), and stdout/stderr
  // previews can run to thousands of characters each; showing every run's
  // full output unconditionally would make the list unreadable and force
  // pointless scrolling to see just a few entries at once.
  const [outputOpen, setOutputOpen] = useState(false);
  const hasOutput = Boolean(entry.stdoutPreview || entry.stderrPreview);

  return (
    <div className="history-item">
      <div className="history-item-header">
        <span className={`status-dot ${entry.exitCode === 0 ? 'ok' : 'error'}`} />
        <span className="history-item-name">{escapeHtml(entry.snippetName || 'Untitled')}</span>
        <span className="history-item-time">{escapeHtml(timeAgo(entry.startedAt))}</span>
      </div>
      <div className="history-item-command">{entry.command}</div>
      <div className="history-item-actions">
        <button type="button" className="btn" onClick={() => rerunFromHistory(entry)}>
          <RotateCcw size={12} />
          <span>Re-run</span>
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await window.electronAPI.copyText(entry.command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? (
            <>
              <Check size={13} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
        {hasOutput && (
          <button type="button" className="btn" onClick={() => setOutputOpen((v) => !v)}>
            <Terminal size={12} />
            <span>Output</span>
            <ChevronDown size={12} className={'history-output-chevron' + (outputOpen ? ' open' : '')} />
          </button>
        )}
      </div>
      {outputOpen && hasOutput && (
        <div className="card-output history-item-output">
          <div className="card-output-body no-scrollbar">
            {entry.stdoutPreview && <div className="stdout">{entry.stdoutPreview}</div>}
            {entry.stderrPreview && <div className="stderr">{entry.stderrPreview}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryDrawer() {
  const { open, entries, query } = useHistoryStore();
  if (!open) return null;

  const q = query.trim().toLowerCase();
  const visible = q ? entries.filter((e) => `${e.snippetName || ''} ${e.command || ''}`.toLowerCase().includes(q)) : entries;

  return (
    <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeHistory(); }}>
      <aside className="drawer">
        <div className="drawer-header">
          <h2>Run history</h2>
          <div className="drawer-header-actions">
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => clearHistory()}>
              Clear
            </button>
            <button type="button" className="icon-btn" title="Close (Esc)" onClick={closeHistory}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="drawer-search-row">
          <input
            type="text"
            className="drawer-search"
            placeholder="Search history…"
            autoComplete="off"
            value={query}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
        </div>
        <div className="drawer-body no-scrollbar">
          {visible.length === 0 ? <div className="history-empty">No matching commands.</div> : visible.map((entry) => <HistoryItem key={entry.id} entry={entry} />)}
        </div>
      </aside>
    </div>
  );
}
