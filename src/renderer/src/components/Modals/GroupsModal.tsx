// GroupsModal.tsx — named, saved sets of snippets ("groups") run together
// on demand. Renders as a full-window "screen" (see style.css's `.screen`
// section) rather than a small centered `.modal` dialog — replaces the
// snippet list for as long as it's open, with its own header Back button
// rather than a dimmed-backdrop dialog you click outside of to dismiss.
// Kept the component/file name (not renamed to GroupsScreen.tsx) to avoid
// unrelated import churn, even though it's no longer modal-shaped.
//
// Just the list view now — the editor moved out to its own GroupEditorModal.tsx
// (a `.modal`, opened via useGroupsStore.ts's openGroupEditor()) since a
// focused add/edit form doesn't need a full screen and layers more simply
// above whatever else is open. Still calls straight into batch-runner.js's
// openBatchConfig (not yet ported) to actually run a group — same as the
// original.
import { ArrowLeft, Play, Pencil, Layers, Copy, Clock, Info } from 'lucide-react';
import type { Snippet, Group } from '@shared/types';
import { snippetIcon, newId, tagColors, timeAgo } from '../../lib/utils';
import { InfoHint } from '../shared/InfoHint';
import { showToast } from '../../lib/toast';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { useGroupsStore, closeGroups, openGroupEditor } from '../../store/useGroupsStore';
import { openGroupDetails } from '../../store/useGroupDetailsStore';
import { state } from '../../../modules/state';
import { openBatchConfig } from '../../store/useBatchStore';
import { useScreenOpenAnimation } from '../../lib/screenAnimation';

async function persistGroups() {
  state.groups = await window.electronAPI.saveGroups(state.groups as Group[]);
  bumpSnippetsVersion();
}

function runGroup(group: Group) {
  const list = group.snippetIds.map((id) => (state.snippets as Snippet[]).find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
  if (list.length === 0) {
    showToast('This group has no snippets left to run — edit it first', 'error');
    return;
  }
  // Fire-and-forget — a group's own run-tracking is a nice-to-have counter,
  // not something the batch run itself should ever wait on.
  const groups = state.groups as Group[];
  const g = groups.find((x) => x.id === group.id);
  if (g) {
    g.runCount += 1;
    g.lastRunAt = new Date().toISOString();
    void persistGroups();
  }
  // Deliberately does NOT close Groups first — `.modal-overlay` (the batch
  // config/results modal) renders above `.screen` (see style.css), so it
  // layers correctly on top and closing it lands you right back on Groups,
  // exactly where you started, instead of the main snippet list.
  openBatchConfig(list);
}

function duplicateGroup(group: Group) {
  const groups = state.groups as Group[];
  const copy: Group = { ...group, id: newId('grp'), name: `${group.name || '(untitled group)'} copy`, runCount: 0, lastRunAt: null };
  groups.push(copy);
  void persistGroups();
  showToast(`Duplicated "${group.name || '(untitled group)'}"`);
}

// Cards show at most this many member chips before collapsing the rest
// into a "+N" chip — a group can hold far more snippets than fit on one
// card without this.
const MAX_MEMBER_CHIPS = 6;

function GroupCard({ group }: { group: Group }) {
  const snippets = state.snippets as Snippet[];
  const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
  const validCount = members.length;
  // Groups don't carry their own icon/color in the data model — a
  // hash-derived badge (same function Card.tsx uses for tag colors) gives
  // each group a stable, distinct-enough look without adding a field.
  const colors = tagColors(group.name || group.id);

  return (
    <div className="group-card">
      <div className="group-card-top">
        <div className="group-card-icon" style={{ background: colors.bg, color: colors.fg }}>
          <Layers size={16} />
        </div>
        <div className="group-card-title-group">
          <div className="group-card-name">
            {group.name || '(untitled group)'}
            {group.schedule?.enabled && (
              <span className="schedule-badge" title="Runs automatically on a schedule">
                <Clock size={11} />
              </span>
            )}
          </div>
          <div className="group-card-meta">
            {validCount} snippet{validCount === 1 ? '' : 's'}
            {validCount < group.snippetIds.length ? ' · some deleted' : ''}
            {group.runCount > 0 ? ` · run ${group.runCount}× · ${timeAgo(group.lastRunAt)}` : ''}
          </div>
        </div>
      </div>
      {group.description && <div className="group-card-description">{group.description}</div>}
      {members.length > 0 && (
        <div className="group-card-members">
          {members.slice(0, MAX_MEMBER_CHIPS).map((s) => (
            <span key={s.id} className="group-card-member-chip" title={s.name}>
              <span className="group-card-member-chip-icon">{snippetIcon(s)}</span>
              <span className="group-card-member-chip-name">{s.name}</span>
            </span>
          ))}
          {members.length > MAX_MEMBER_CHIPS && (
            <span className="group-card-member-chip group-card-member-more">+{members.length - MAX_MEMBER_CHIPS} more</span>
          )}
        </div>
      )}
      <div className="group-card-actions">
        <button type="button" className="btn btn-small btn-primary" onClick={() => runGroup(group)}>
          <Play size={13} fill="currentColor" stroke="none" />
          <span>Run</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => openGroupEditor(group)}>
          <Pencil size={13} />
          <span>Edit</span>
        </button>
        <button type="button" className="btn btn-small btn-ghost" title="Duplicate group" onClick={() => duplicateGroup(group)}>
          <Copy size={13} />
        </button>
        <button type="button" className="btn btn-small btn-ghost" title="Details (ID, schedule, member snippet IDs)" onClick={() => openGroupDetails(group)}>
          <Info size={13} />
        </button>
      </div>
    </div>
  );
}

export function GroupsModal() {
  useSnippetsVersion();
  const { open } = useGroupsStore();
  const skipAnim = useScreenOpenAnimation(open);
  if (!open) return null;

  const groups = state.groups as Group[];

  return (
    <div className={'screen' + (skipAnim ? ' screen-no-anim' : '')}>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeGroups}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>
            Groups <InfoHint text="Save a set of snippets once, then run them all together anytime — no reselecting." />
          </h2>
        </div>
        <button type="button" className="btn btn-small" onClick={() => openGroupEditor(null)}>
          + New group
        </button>
      </div>
      <div className="screen-body no-scrollbar">
        {groups.length === 0 ? (
          <div className="variables-empty">No groups yet. Save a set of snippets once, then run them all together with one click.</div>
        ) : (
          <div className="groups-grid">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
