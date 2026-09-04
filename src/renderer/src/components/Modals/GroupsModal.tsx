// GroupsModal.tsx — named, saved sets of snippets ("groups") run together
// on demand. Ported from modules/groups-modal.js: two views (list/editor)
// inside one modal, same pattern as batch-runner.js's config/results.
// Still calls straight into batch-runner.js's openBatchConfig (not yet
// ported) to actually run a group — same as the original.
import { useState } from 'react';
import type { Snippet, Group } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { snippetIcon, newId } from '../../lib/utils';
import { showToast } from '../../store/useToastStore';
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

function GroupRow({ group }: { group: Group }) {
  const snippets = state.snippets as Snippet[];
  const validCount = group.snippetIds.filter((id) => snippets.some((s) => s.id === id)).length;
  return (
    <div className="group-row">
      <div className="group-row-info">
        <div className="group-row-name">{group.name || '(untitled group)'}</div>
        <div className="group-row-count">
          {validCount} snippet{validCount === 1 ? '' : 's'}
          {validCount < group.snippetIds.length ? ' (some were deleted)' : ''}
        </div>
        {group.description && <div className="group-row-description">{group.description}</div>}
      </div>
      <button type="button" className="btn btn-small btn-primary" onClick={() => runGroup(group)} dangerouslySetInnerHTML={{ __html: `${iconSvg('play')}<span>Run</span>` }} />
      <button type="button" className="btn btn-small" onClick={() => openGroupEditor(group)} dangerouslySetInnerHTML={{ __html: `${iconSvg('edit')}<span>Edit</span>` }} />
    </div>
  );
}

function GroupsListView() {
  const groups = state.groups as Group[];
  return (
    <div>
      <h2>Groups</h2>
      <p className="field-hint">Save a set of snippets once, then run them all together anytime — no reselecting.</p>
      <div className="groups-list no-scrollbar">
        {groups.length === 0 ? (
          <div className="variables-empty">No groups yet. Save a set of snippets once, then run them all together with one click.</div>
        ) : (
          groups.map((g) => <GroupRow key={g.id} group={g} />)
        )}
      </div>
      <div className="modal-actions modal-actions-left">
        <button type="button" className="btn btn-small" onClick={() => openGroupEditor(null)}>
          + New group
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeGroups}>
          Done
        </button>
      </div>
    </div>
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
    <div>
      <h2>{editingGroup ? 'Edit group' : 'New group'}</h2>
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

      <div className="modal-actions modal-actions-left">
        {editingGroup && (
          <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
            Delete group
          </button>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={showGroupsListView}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save group
        </button>
      </div>
    </div>
  );
}

export function GroupsModal() {
  useSnippetsVersion();
  const { open, view, editingId } = useGroupsStore();
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeGroups(); }}>
      <div className="modal modal-wide">{view === 'list' ? <GroupsListView /> : <GroupEditorView editingId={editingId} />}</div>
    </div>
  );
}
