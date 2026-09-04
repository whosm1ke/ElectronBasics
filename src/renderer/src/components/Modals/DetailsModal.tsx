// DetailsModal.tsx — a read-only "Details" panel per snippet: shell/cwd/
// elevation, its Run after/Run before dependencies (in both directions),
// schedule, assertions, and usage stats. Ported from modules/details-modal.js.
// Still calls straight into editor-modal.js/groups-modal.js (not yet
// ported) for the dependency/group links — same as Card.tsx does for its
// own not-yet-ported neighbors.
import type { ReactNode } from 'react';
import type { Snippet, Group } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { snippetIcon, SHELL_LABELS, timeAgo } from '../../lib/utils';
import { useDetailsStore, closeDetails, hideDetailsForNavigation } from '../../store/useDetailsStore';
import { state } from '../../../modules/state';
import { openModal } from '../../store/useEditorStore';
import { groupsForSnippet, openGroupEditor } from '../../store/useGroupsStore';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details-row">
      <div className="details-row-label">{label}</div>
      <div className="details-row-value">{children}</div>
    </div>
  );
}

function SnippetLink({ target, originId }: { target: Snippet; originId: string }) {
  return (
    <button
      type="button"
      className="details-link-btn"
      onClick={() => {
        hideDetailsForNavigation(originId); // hide without clearing pendingReturnId
        openModal(target);
      }}
    >
      {snippetIcon(target)} {target.name}
    </button>
  );
}

function GroupLink({ group }: { group: Group }) {
  return (
    <button
      type="button"
      className="details-link-btn"
      title={group.description || undefined}
      onClick={() => {
        hideDetailsForNavigation(null); // no return-to-details tracking needed here
        openGroupEditor(group);
      }}
      dangerouslySetInnerHTML={{ __html: `${iconSvg('layers')} ${group.name || '(untitled group)'}` }}
    />
  );
}

export function DetailsModal() {
  const { snippet } = useDetailsStore();
  if (!snippet) return null;

  const snippets = state.snippets as Snippet[];
  const before = snippet.runBefore ? snippets.find((s) => s.id === snippet.runBefore) : null;
  const after = snippet.runAfterThis ? snippets.find((s) => s.id === snippet.runAfterThis) : null;
  const runsAfterThis = snippets.filter((s) => s.runAfterThis === snippet.id);
  const runsBeforeThis = snippets.filter((s) => s.runBefore === snippet.id);
  const memberGroups: Group[] = groupsForSnippet(snippet.id);
  const noLinks = !before && !after && runsAfterThis.length === 0 && runsBeforeThis.length === 0;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDetails(); }}>
      <div className="modal">
        <h2>
          {snippetIcon(snippet)} {snippet.name}
        </h2>
        <div className="details-body">
          <Row label="Tag">{snippet.tag}</Row>
          <Row label="Shell">{SHELL_LABELS[snippet.shell] || snippet.shell}</Row>
          {snippet.cwd && <Row label="Working directory">{snippet.cwd}</Row>}
          {snippet.elevated && <Row label="Elevation">Runs as Administrator (UAC prompt)</Row>}
          {snippet.stdin && <Row label="Stdin">Provides input as the command runs</Row>}
          {snippet.env && snippet.env.length > 0 && <Row label="Environment variables">{snippet.env.map((e) => e.key).join(', ')}</Row>}
          {snippet.steps && snippet.steps.length > 0 && (
            <Row label="Steps">
              {snippet.steps.length} steps · {snippet.stopOnStepError ? 'stops on the first failed step' : 'runs every step regardless of failures'}
            </Row>
          )}
          {snippet.expect && (
            <Row label="Expects">
              {[
                snippet.expect.exitCode !== null ? `exit code ${snippet.expect.exitCode}` : null,
                snippet.expect.outputContains ? `output contains "${snippet.expect.outputContains}"` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Row>
          )}

          <div className="details-section-heading">Dependencies</div>
          <Row label="Runs before it">{before ? <SnippetLink target={before} originId={snippet.id} /> : '— (none)'}</Row>
          <Row label="Runs after it">{after ? <SnippetLink target={after} originId={snippet.id} /> : '— (none)'}</Row>
          {runsAfterThis.length > 0 && (
            <Row label="Runs once this finishes">
              {runsAfterThis.map((s) => (
                <SnippetLink key={s.id} target={s} originId={snippet.id} />
              ))}
            </Row>
          )}
          {runsBeforeThis.length > 0 && (
            <Row label="Runs this one first">
              {runsBeforeThis.map((s) => (
                <SnippetLink key={s.id} target={s} originId={snippet.id} />
              ))}
            </Row>
          )}
          {noLinks && <Row label="">No run-before/run-after links to or from this snippet.</Row>}

          {snippet.schedule?.enabled && (
            <>
              <div className="details-section-heading">Schedule</div>
              <Row label="Runs">
                {snippet.schedule.type === 'interval'
                  ? `every ${snippet.schedule.intervalMinutes} minute(s)`
                  : snippet.schedule.type === 'daily'
                    ? `daily at ${snippet.schedule.dailyTime}`
                    : `cron "${snippet.schedule.cronExpr}"`}
              </Row>
              {snippet.schedule.lastRunAt && <Row label="Last scheduled run">{timeAgo(snippet.schedule.lastRunAt)}</Row>}
            </>
          )}

          {memberGroups.length > 0 && (
            <>
              <div className="details-section-heading">Groups</div>
              <Row label="In groups">
                {memberGroups.map((g) => (
                  <GroupLink key={g.id} group={g} />
                ))}
              </Row>
            </>
          )}

          <div className="details-section-heading">Stats</div>
          <Row label="Pinned">{snippet.pinned ? 'Yes' : 'No'}</Row>
          <Row label="Run count">{String(snippet.runCount || 0)}</Row>
          {snippet.lastRunAt && <Row label="Last run">{timeAgo(snippet.lastRunAt)}</Row>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={closeDetails}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
