// HistoryDrawer.tsx — the run-history side panel: list, search, re-run,
// copy, clear. Ported from modules/history-drawer.js, now rendering its
// own full drawer markup (index.html no longer has a static #historyOverlay
// — see the migration plan's note on "React owns the whole overlay" for
// modals/drawers, as opposed to the inline-content pattern used for
// cards/tags/favorites).
import { useState } from 'react';
import type { HistoryEntry } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { escapeHtml, timeAgo } from '../../lib/utils';
import { useHistoryStore, closeHistory, clearHistory, rerunFromHistory, setHistoryQuery } from '../../store/useHistoryStore';

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="history-item">
      <div className="history-item-header">
        <span className={`status-dot ${entry.exitCode === 0 ? 'ok' : 'error'}`} />
        <span className="history-item-name">{escapeHtml(entry.snippetName || 'Untitled')}</span>
        <span className="history-item-time">{escapeHtml(timeAgo(entry.startedAt))}</span>
      </div>
      <div className="history-item-command">{entry.command}</div>
      <div className="history-item-actions">
        <button type="button" className="btn" onClick={() => rerunFromHistory(entry)} dangerouslySetInnerHTML={{ __html: `${iconSvg('rerun')}<span>Re-run</span>` }} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await window.electronAPI.copyText(entry.command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          dangerouslySetInnerHTML={{ __html: copied ? `${iconSvg('check')}<span>Copied!</span>` : `${iconSvg('copy')}<span>Copy</span>` }}
        />
      </div>
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
            <button
              type="button"
              className="icon-btn"
              title="Close (Esc)"
              onClick={closeHistory}
              dangerouslySetInnerHTML={{
                __html:
                  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
              }}
            />
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
