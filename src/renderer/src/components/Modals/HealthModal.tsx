// HealthModal.tsx — the Health panel: a read-only screen (see style.css's
// `.screen` section, same pattern GroupsModal.tsx/PipelinesModal.tsx use)
// that scans the current snippet library for problems that don't show up
// until you actually run something: a working directory that no longer
// exists, a run-before/run-after pointer left dangling by a deleted
// snippet, or a snippet whose most recent run failed. Nothing here mutates
// anything — every row just links out to the real editor/Details view for
// the snippet in question, same "discoverable path, not the only path"
// philosophy PipelinesModal's inspector panel uses.
import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, FolderX, Unlink, XCircle, CheckCircle2 } from 'lucide-react';
import type { Snippet, HistoryEntry } from '@shared/types';
import { snippetIcon } from '../../lib/utils';
import { useHealthStore, closeHealth } from '../../store/useHealthStore';
import { InfoHint } from '../shared/InfoHint';
import { openModal } from '../../store/useEditorStore';
import { openDetails } from '../../store/useDetailsStore';
import { state } from '../../../modules/state';
import { useScreenOpenAnimation } from '../../lib/screenAnimation';

type IssueKind = 'missing-cwd' | 'dangling-run-before' | 'dangling-run-after' | 'last-run-failed';

interface Issue {
  kind: IssueKind;
  label: string;
}

interface SnippetIssues {
  snippet: Snippet;
  issues: Issue[];
}

const ISSUE_ICON: Record<IssueKind, typeof FolderX> = {
  'missing-cwd': FolderX,
  'dangling-run-before': Unlink,
  'dangling-run-after': Unlink,
  'last-run-failed': XCircle,
};

async function scan(): Promise<SnippetIssues[]> {
  const snippets = state.snippets as Snippet[];
  const byId = new Map(snippets.map((s) => [s.id, s]));
  const history = await window.electronAPI.getHistory();
  // Newest-first (see storage/history.ts) — the first match per snippetId is its most recent run.
  const lastResultBySnippet = new Map<string, HistoryEntry>();
  for (const entry of history) {
    if (entry.snippetId && !lastResultBySnippet.has(entry.snippetId)) lastResultBySnippet.set(entry.snippetId, entry);
  }

  const cwds = Array.from(new Set(snippets.map((s) => s.cwd).filter((c): c is string => Boolean(c))));
  const existsByCwd = new Map<string, boolean>();
  await Promise.all(cwds.map(async (cwd) => existsByCwd.set(cwd, await window.electronAPI.pathExists(cwd))));

  const results: SnippetIssues[] = [];
  for (const s of snippets) {
    const issues: Issue[] = [];
    if (s.cwd && existsByCwd.get(s.cwd) === false) {
      issues.push({ kind: 'missing-cwd', label: `Working directory doesn't exist: ${s.cwd}` });
    }
    if (s.runBefore && !byId.has(s.runBefore)) {
      issues.push({ kind: 'dangling-run-before', label: 'Run-before points at a deleted snippet' });
    }
    if (s.runAfterThis && !byId.has(s.runAfterThis)) {
      issues.push({ kind: 'dangling-run-after', label: 'Run-after points at a deleted snippet' });
    }
    const last = lastResultBySnippet.get(s.id);
    if (last && last.exitCode !== 0) {
      issues.push({ kind: 'last-run-failed', label: `Last run failed (exit code ${last.exitCode})` });
    }
    if (issues.length > 0) results.push({ snippet: s, issues });
  }
  return results;
}

function IssueRow({ item }: { item: SnippetIssues }) {
  const { snippet, issues } = item;
  return (
    <div className="health-row">
      <div className="health-row-main">
        <span className="health-row-icon">{snippetIcon(snippet)}</span>
        <div className="health-row-body">
          <div className="health-row-name">{snippet.name || '(untitled)'}</div>
          <div className="health-row-issues">
            {issues.map((issue, i) => {
              const Icon = ISSUE_ICON[issue.kind];
              return (
                <span className="health-issue-badge" key={i}>
                  <Icon size={12} />
                  <span>{issue.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="health-row-actions">
        <button type="button" className="btn btn-small" onClick={() => openDetails(snippet)}>
          Details
        </button>
        <button type="button" className="btn btn-small btn-primary" onClick={() => openModal(snippet)}>
          Fix…
        </button>
      </div>
    </div>
  );
}

export function HealthModal() {
  const { open } = useHealthStore();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SnippetIssues[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    scan().then((r) => { if (!cancelled) { setResults(r); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open]);

  const skipAnim = useScreenOpenAnimation(open);
  if (!open) return null;

  const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);

  return (
    <div className={'screen' + (skipAnim ? ' screen-no-anim' : '')}>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeHealth}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>
            Health <InfoHint text="Broken working directories, dangling run-before/run-after links, and recently-failing snippets." />
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-small"
          disabled={loading}
          onClick={() => { setLoading(true); scan().then((r) => { setResults(r); setLoading(false); }); }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : undefined} />
          <span>Rescan</span>
        </button>
      </div>
      <div className="screen-body no-scrollbar">
        {loading ? (
          <div className="variables-empty">Scanning…</div>
        ) : results.length === 0 ? (
          <div className="health-all-clear">
            <CheckCircle2 size={28} />
            <p>No issues found — everything looks healthy.</p>
          </div>
        ) : (
          <>
            <p className="field-hint" style={{ marginBottom: 10 }}>
              {totalIssues} issue{totalIssues === 1 ? '' : 's'} across {results.length} snippet{results.length === 1 ? '' : 's'}.
            </p>
            <div className="health-list">
              {results.map((r) => (
                <IssueRow key={r.snippet.id} item={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
