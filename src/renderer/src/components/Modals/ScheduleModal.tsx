// ScheduleModal.tsx — the Schedule overview screen: every snippet with an
// enabled schedule, sorted by when it's next due (see
// lib/scheduleOverview.ts for the actual next-run math). Renders as a
// `.screen` like Groups/Pipelines/Health — read-only, links out to the real
// editor rather than owning its own.
import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Play } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { snippetIcon, timeUntil, extractPlaceholders, runnableTextOf } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { scheduledSnippetRows, scheduleDescription } from '../../lib/scheduleOverview';
import { useScheduleOverviewStore, closeScheduleOverview } from '../../store/useScheduleStore';
import { openModal } from '../../store/useEditorStore';
import { state } from '../../../modules/state';

async function runNow(snippet: Snippet) {
  if (extractPlaceholders(runnableTextOf(snippet)).length > 0) {
    showToast('This snippet needs input — open it to fill in its parameters first', 'error');
    openModal(snippet);
    return;
  }
  showToast(`Running "${snippet.name}"…`);
  const result =
    snippet.steps && snippet.steps.length
      ? await window.electronAPI.runSequence({ steps: snippet.steps, snippetId: snippet.id, snippetName: snippet.name, cwd: snippet.cwd, shell: snippet.shell, env: snippet.env })
      : await window.electronAPI.runCommand({ command: snippet.command, snippetId: snippet.id, snippetName: snippet.name, cwd: snippet.cwd, shell: snippet.shell, elevated: snippet.elevated, env: snippet.env });
  const code = 'overallCode' in result ? result.overallCode : result.code;
  showToast(code === 0 ? `"${snippet.name}" finished successfully` : `"${snippet.name}" failed (exit code ${code})`, code === 0 ? 'info' : 'error');
}

export function ScheduleModal() {
  const { open } = useScheduleOverviewStore();
  // Recomputed every 30s while open so "in 4h" doesn't visibly go stale
  // during a long-open session — cheap, this is pure date math, no IPC.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const rows = scheduledSnippetRows(state.snippets as Snippet[]);

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeScheduleOverview}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>Schedule</h2>
          <span className="field-hint">Every snippet running on a schedule, soonest due first.</span>
        </div>
      </div>
      <div className="screen-body no-scrollbar">
        {rows.length === 0 ? (
          <div className="variables-empty">No snippet is currently scheduled. Enable "Run on a schedule" in a snippet's editor to see it here.</div>
        ) : (
          <div className="health-list">
            {rows.map(({ snippet, nextRun }) => (
              <div className="health-row" key={snippet.id}>
                <div className="health-row-main">
                  <span className="health-row-icon">{snippetIcon(snippet)}</span>
                  <div className="health-row-body">
                    <div className="health-row-name">{snippet.name || '(untitled)'}</div>
                    <div className="health-row-issues">
                      <span className="health-issue-badge schedule-overview-badge">
                        <Clock size={12} />
                        <span>{snippet.schedule ? scheduleDescription(snippet.schedule) : ''}</span>
                      </span>
                      <span className="health-issue-badge schedule-overview-badge schedule-overview-next">
                        <span>Next: {nextRun ? timeUntil(nextRun) : '— (invalid schedule)'}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="health-row-actions">
                  <button type="button" className="btn btn-small" onClick={() => openModal(snippet)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => runNow(snippet)}>
                    <Play size={12} fill="currentColor" stroke="none" />
                    <span>Run now</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
