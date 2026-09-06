// ScheduleModal.tsx — the Schedule overview screen: every snippet, pipeline,
// and group with an enabled schedule, split into tabs by source (see
// lib/scheduleOverview.ts for the actual next-run math, shared unchanged
// across all three). Renders as a `.screen` like Groups/Pipelines/Health —
// read-only, links out to the real editor rather than owning its own.
import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Play, Pencil } from 'lucide-react';
import type { Snippet, Pipeline, Group } from '@shared/types';
import { snippetIcon, timeUntil } from '../../lib/utils';
import { quickRunSnippet } from '../../lib/quickRun';
import { scheduledSnippetRows, scheduledPipelineRows, scheduledGroupRows, scheduleDescription } from '../../lib/scheduleOverview';
import { useScheduleOverviewStore, closeScheduleOverview } from '../../store/useScheduleStore';
import { openModal } from '../../store/useEditorStore';
import { openPipelineEditorByIdFrom } from '../../store/usePipelinesStore';
import { openGroupEditor } from '../../store/useGroupsStore';
import { openBatchConfig } from '../../store/useBatchStore';
import { closeAllScreens } from '../../lib/screens';
import { useScreenOpenAnimation } from '../../lib/screenAnimation';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { showToast } from '../../lib/toast';
import { state } from '../../../modules/state';
import { InfoHint } from '../shared/InfoHint';

type Tab = 'snippets' | 'pipelines' | 'groups';

/** Same "resolve members, bump the group's own counters, hand off to the batch runner" shape GroupsModal.tsx's own runGroup() uses — small enough to duplicate here rather than export/import across two independent screens for one call site. */
function runGroupNow(group: Group) {
  const list = group.snippetIds.map((id) => (state.snippets as Snippet[]).find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
  if (list.length === 0) {
    showToast('This group has no snippets left to run — edit it first', 'error');
    return;
  }
  const groups = state.groups as Group[];
  const g = groups.find((x) => x.id === group.id);
  if (g) {
    g.runCount += 1;
    g.lastRunAt = new Date().toISOString();
    void (async () => {
      state.groups = await window.electronAPI.saveGroups(state.groups as Group[]);
      bumpSnippetsVersion();
    })();
  }
  openBatchConfig(list);
}

function RowShell({ icon, name, badge, next, actions }: { icon: React.ReactNode; name: string; badge: React.ReactNode; next: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="health-row">
      <div className="health-row-main">
        <span className="health-row-icon">{icon}</span>
        <div className="health-row-body">
          <div className="health-row-name">{name}</div>
          <div className="health-row-issues">
            <span className="health-issue-badge schedule-overview-badge">
              <Clock size={12} />
              <span>{badge}</span>
            </span>
            <span className="health-issue-badge schedule-overview-badge schedule-overview-next">
              <span>Next: {next}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="health-row-actions">{actions}</div>
    </div>
  );
}

export function ScheduleModal() {
  const { open } = useScheduleOverviewStore();
  useSnippetsVersion();
  const [tab, setTab] = useState<Tab>('snippets');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  // Recomputed every 30s while open so "in 4h" doesn't visibly go stale
  // during a long-open session — cheap, this is pure date math, no IPC.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [open]);

  // Pipelines aren't preloaded at app boot the way snippets/groups are (see
  // usePipelinesStore.ts's own header comment) — fetch fresh each time this
  // screen opens so a pipeline schedule shows up here even if the Pipelines
  // screen itself was never opened this session.
  useEffect(() => {
    if (!open) return;
    void window.electronAPI.getPipelines().then(setPipelines);
  }, [open]);

  const skipAnim = useScreenOpenAnimation(open);
  if (!open) return null;

  const snippetRows = scheduledSnippetRows(state.snippets as Snippet[]);
  const pipelineRows = scheduledPipelineRows(pipelines);
  const groupRows = scheduledGroupRows(state.groups as Group[]);
  const counts = { snippets: snippetRows.length, pipelines: pipelineRows.length, groups: groupRows.length };

  function editPipeline(pipeline: Pipeline) {
    closeAllScreens(); // see DetailsModal.tsx's GroupLink for why — Schedule and the Pipelines editor are both `.screen`s sharing one z-index
    void openPipelineEditorByIdFrom(pipeline.id, { screen: 'schedule' });
  }
  function editGroup(group: Group) {
    // The group editor is a `.modal` now (GroupEditorModal.tsx) — it layers
    // above this screen without closing it first, unlike editPipeline()
    // just above (the Pipelines editor is still a `.screen`).
    openGroupEditor(group);
  }

  return (
    <div className={'screen' + (skipAnim ? ' screen-no-anim' : '')}>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeScheduleOverview}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>
            Schedule <InfoHint text="Every snippet, pipeline, and group running on a schedule, soonest due first." />
          </h2>
        </div>
      </div>
      <div className="segmented schedule-tabs">
        <button type="button" className={'segmented-btn' + (tab === 'snippets' ? ' active' : '')} onClick={() => setTab('snippets')}>
          Snippets {counts.snippets > 0 ? `(${counts.snippets})` : ''}
        </button>
        <button type="button" className={'segmented-btn' + (tab === 'pipelines' ? ' active' : '')} onClick={() => setTab('pipelines')}>
          Pipelines {counts.pipelines > 0 ? `(${counts.pipelines})` : ''}
        </button>
        <button type="button" className={'segmented-btn' + (tab === 'groups' ? ' active' : '')} onClick={() => setTab('groups')}>
          Groups {counts.groups > 0 ? `(${counts.groups})` : ''}
        </button>
      </div>
      <div className="screen-body no-scrollbar">
        {tab === 'snippets' &&
          (snippetRows.length === 0 ? (
            <div className="variables-empty">No snippet is currently scheduled. Enable "Run on a schedule" in a snippet's editor to see it here.</div>
          ) : (
            <div className="health-list">
              {snippetRows.map(({ snippet, nextRun }) => (
                <RowShell
                  key={snippet.id}
                  icon={snippetIcon(snippet)}
                  name={snippet.name || '(untitled)'}
                  badge={snippet.schedule ? scheduleDescription(snippet.schedule) : ''}
                  next={nextRun ? timeUntil(nextRun) : '— (invalid schedule)'}
                  actions={
                    <>
                      <button type="button" className="btn btn-small" onClick={() => openModal(snippet)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-small btn-primary" onClick={() => quickRunSnippet(snippet)}>
                        <Play size={12} fill="currentColor" stroke="none" />
                        <span>Run now</span>
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          ))}

        {tab === 'pipelines' &&
          (pipelineRows.length === 0 ? (
            <div className="variables-empty">No pipeline is currently scheduled. Turn on "Run this whole pipeline on a schedule" in a pipeline's Settings panel to see it here.</div>
          ) : (
            <div className="health-list">
              {pipelineRows.map(({ pipeline, nextRun }) => (
                <RowShell
                  key={pipeline.id}
                  icon={<Clock size={14} />}
                  name={pipeline.name || '(untitled pipeline)'}
                  badge={pipeline.schedule ? scheduleDescription(pipeline.schedule) : ''}
                  next={nextRun ? timeUntil(nextRun) : '— (invalid schedule)'}
                  actions={
                    <button type="button" className="btn btn-small" onClick={() => editPipeline(pipeline)}>
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>
                  }
                />
              ))}
            </div>
          ))}

        {tab === 'groups' &&
          (groupRows.length === 0 ? (
            <div className="variables-empty">No group is currently scheduled. Turn on "Run every snippet in this group on a schedule" in a group's Schedule panel to see it here.</div>
          ) : (
            <div className="health-list">
              {groupRows.map(({ group, nextRun }) => (
                <RowShell
                  key={group.id}
                  icon={<Clock size={14} />}
                  name={group.name || '(untitled group)'}
                  badge={group.schedule ? scheduleDescription(group.schedule) : ''}
                  next={nextRun ? timeUntil(nextRun) : '— (invalid schedule)'}
                  actions={
                    <>
                      <button type="button" className="btn btn-small" onClick={() => editGroup(group)}>
                        <Pencil size={12} />
                        <span>Edit</span>
                      </button>
                      <button type="button" className="btn btn-small btn-primary" onClick={() => runGroupNow(group)}>
                        <Play size={12} fill="currentColor" stroke="none" />
                        <span>Run now</span>
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
