// GroupsModal.tsx — named, saved sets of snippets ("groups") run together
// on demand. Renders as a full-window "screen" (see style.css's `.screen`
// section) rather than a small centered `.modal` dialog — replaces the
// snippet list for as long as it's open, with its own header Back button
// rather than a dimmed-backdrop dialog you click outside of to dismiss.
// Kept the component/file name (not renamed to GroupsScreen.tsx) to avoid
// unrelated import churn, even though it's no longer modal-shaped.
//
// Two views (list/editor) in one screen, same list/editor split
// PipelinesModal.tsx's own screen uses. Still calls straight into
// batch-runner.js's openBatchConfig (not yet ported) to actually run a
// group — same as the original.
import { useState } from 'react';
import { ArrowLeft, Play, Pencil, Layers } from 'lucide-react';
import type { Snippet, Group } from '@shared/types';
import { snippetIcon, newId, tagColors } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { useGroupsStore, closeGroups, openGroupEditor, showGroupsListView } from '../../store/useGroupsStore';
import { state } from '../../../modules/state';
import { openBatchConfig } from '../../store/useBatchStore';

function runGroup(group: Group) {
  const list = group.snippetIds.map((id) => (state.snippets as Snippet[]).find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
  if (list.length === 0) {
    showToast('This group has no snippets left to run — edit it first', 'error');
    return;
  }
  closeGroups();
  openBatchConfig(list);
}

function GroupCard({ group }: { group: Group }) {
  const snippets = state.snippets as Snippet[];
  const validCount = group.snippetIds.filter((id) => snippets.some((s) => s.id === id)).length;
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
          <div className="group-card-name">{group.name || '(untitled group)'}</div>
          <div className="group-card-meta">
            {validCount} snippet{validCount === 1 ? '' : 's'}
            {validCount < group.snippetIds.length ? ' · some deleted' : ''}
          </div>
        </div>
      </div>
      {group.description && <div className="group-card-description">{group.description}</div>}
      <div className="group-card-actions">
        <button type="button" className="btn btn-small btn-primary" onClick={() => runGroup(group)}>
          <Play size={13} fill="currentColor" stroke="none" />
          <span>Run</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => openGroupEditor(group)}>
          <Pencil size={13} />
          <span>Edit</span>
        </button>
      </div>
    </div>
  );
}

function GroupsListView() {
  const groups = state.groups as Group[];
  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeGroups}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>Groups</h2>
          <span className="field-hint">Save a set of snippets once, then run them all together anytime — no reselecting.</span>
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
    </>
  );
}

function GroupEditorView({ editingId }: { editingId: string | null }) {
  const groups = state.groups as Group[];
  const editingGroup = editingId ? groups.find((g) => g.id === editingId) : null;
  const [name, setName] = useState(editingGroup?.name || '');
  const [description, setDescription] = useState(editingGroup?.description || '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(editingGroup ? editingGroup.snippetIds : []));

  const snippets = state.snippets as Snippet[];

  async function save() {
    const finalName = name.trim() || 'Untitled group';
    const finalDescription = description.trim();
    const snippetIds = Array.from(selectedIds);
    if (snippetIds.length === 0) {
      showToast('Pick at least one snippet for this group', 'error');
      return;
    }
    const id = editingId || newId('grp');
    const group: Group = { id, name: finalName, description: finalDescription, snippetIds };
    const existingIdx = groups.findIndex((g) => g.id === id);
    if (existingIdx >= 0) groups[existingIdx] = group;
    else groups.push(group);
    state.groups = await window.electronAPI.saveGroups(groups);
    bumpSnippetsVersion();
    showToast(`Saved group "${finalName}"`);
    showGroupsListView();
  }

  async function remove() {
    const idx = groups.findIndex((g) => g.id === editingId);
    if (idx < 0) return;
    const [removed] = groups.splice(idx, 1);
    state.groups = await window.electronAPI.saveGroups(groups);
    bumpSnippetsVersion();
    showToast(`Deleted group "${removed.name || '(untitled group)'}"`);
    showGroupsListView();
  }

  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back to groups" onClick={showGroupsListView}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>{editingGroup ? 'Edit group' : 'New group'}</h2>
        </div>
      </div>
      <div className="screen-body no-scrollbar">
        <label className="field-label" htmlFor="groupNameInput">Name</label>
        <input type="text" id="groupNameInput" className="field-input" placeholder="e.g. Morning setup" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <label className="field-label" htmlFor="groupDescriptionInput">
          Description <span className="field-hint">(optional)</span>
        </label>
        <textarea id="groupDescriptionInput" className="field-textarea" rows={2} placeholder="What this group is for, when to run it…" value={description} onChange={(e) => setDescription(e.target.value)} />

        <label className="field-label">Snippets in this group</label>
        <div className="group-snippet-checklist no-scrollbar">
          {snippets.length === 0 ? (
            <div className="variables-empty">No snippets yet — add some first.</div>
          ) : (
            snippets.map((s) => (
              <label className="group-checklist-row" key={s.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setSelectedIds(next);
                  }}
                />
                <span className="group-checklist-label">
                  {snippetIcon(s)} {s.name}
                </span>
                <span className="group-checklist-tag">{s.tag}</span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="screen-footer screen-footer-left">
        {editingGroup ? (
          <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
            Delete group
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-primary" onClick={save}>
          Save group
        </button>
      </div>
    </>
  );
}

export function GroupsModal() {
  useSnippetsVersion();
  const { open, view, editingId } = useGroupsStore();
  if (!open) return null;

  return <div className="screen">{view === 'list' ? <GroupsListView /> : <GroupEditorView editingId={editingId} />}</div>;
}
