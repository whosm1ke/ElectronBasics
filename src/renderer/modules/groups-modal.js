// groups-modal.js — named, saved sets of snippets ("groups") you configure
// once and run together on demand, without reselecting them via select mode
// each time. Two views inside one modal (list / editor), the same
// show-one-hide-other pattern batch-runner.js uses for config/results.
// Running a group hands its resolved snippet list to batch-runner.js's
// existing order/mode config step — a group run gets the exact same live
// per-row output a manually-selected batch or a tag "Run all" gets.
// `groupsForSnippet()` is the one thing cards.js and details-modal.js need
// back from here (to show "in group" badges) — importing it creates no
// cycle since this module never imports cards.js or details-modal.js.
import { dom } from './dom.js';
import { state } from './state.js';
import { iconSvg } from './icons.js';
import { snippetIcon, newId } from './utils.js';
import { showToast } from './toast.js';
import { emitGroupsChanged } from './events.js';
import { openBatchConfig } from './batch-runner.js';

export function groupsForSnippet(snippetId) {
  return state.groups.filter((g) => g.snippetIds.includes(snippetId));
}

function showGroupsListView() {
  dom.groupEditorView.hidden = true;
  dom.groupsListView.hidden = false;
  state.editingGroupId = null;
  renderGroupsList();
}

/** Opens straight to the editor for `group` (or a blank one when null) — also used by details-modal.js to jump into a specific group from a snippet's "in group" link. */
export function openGroupEditor(group) {
  dom.groupsOverlay.hidden = false;
  state.editingGroupId = group ? group.id : null;
  dom.groupEditorTitle.textContent = group ? 'Edit group' : 'New group';
  dom.groupNameInput.value = group ? group.name : '';
  dom.deleteGroupBtn.hidden = !group;
  renderChecklist(new Set(group ? group.snippetIds : []));
  dom.groupsListView.hidden = true;
  dom.groupEditorView.hidden = false;
  dom.groupNameInput.focus();
}

export async function openGroups() {
  dom.groupsOverlay.hidden = false;
  state.groups = await window.electronAPI.getGroups();
  showGroupsListView();
}

export function closeGroups() {
  dom.groupsOverlay.hidden = true;
}

export function isGroupsOpen() {
  return !dom.groupsOverlay.hidden;
}

function runGroup(group) {
  const list = group.snippetIds.map((id) => state.snippets.find((s) => s.id === id)).filter(Boolean);
  if (list.length === 0) {
    showToast('This group has no snippets left to run — edit it first', 'error');
    return;
  }
  closeGroups();
  openBatchConfig(list);
}

function buildGroupRow(group) {
  const row = document.createElement('div');
  row.className = 'group-row';

  const info = document.createElement('div');
  info.className = 'group-row-info';
  const name = document.createElement('div');
  name.className = 'group-row-name';
  name.textContent = group.name || '(untitled group)';
  const validCount = group.snippetIds.filter((id) => state.snippets.some((s) => s.id === id)).length;
  const count = document.createElement('div');
  count.className = 'group-row-count';
  count.textContent = `${validCount} snippet${validCount === 1 ? '' : 's'}`
    + (validCount < group.snippetIds.length ? ' (some were deleted)' : '');
  info.append(name, count);

  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-small btn-primary';
  runBtn.innerHTML = `${iconSvg('play')}<span>Run</span>`;
  runBtn.addEventListener('click', () => runGroup(group));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-small';
  editBtn.innerHTML = `${iconSvg('edit')}<span>Edit</span>`;
  editBtn.addEventListener('click', () => openGroupEditor(group));

  row.append(info, runBtn, editBtn);
  return row;
}

function renderGroupsList() {
  dom.groupsList.innerHTML = '';
  if (state.groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'variables-empty';
    empty.textContent = 'No groups yet. Save a set of snippets once, then run them all together with one click.';
    dom.groupsList.appendChild(empty);
    return;
  }
  state.groups.forEach((g) => dom.groupsList.appendChild(buildGroupRow(g)));
}

function buildChecklistRow(snippet, checked) {
  const row = document.createElement('label');
  row.className = 'group-checklist-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.dataset.snippetId = snippet.id;
  const label = document.createElement('span');
  label.className = 'group-checklist-label';
  label.textContent = `${snippetIcon(snippet)} ${snippet.name}`;
  const tag = document.createElement('span');
  tag.className = 'group-checklist-tag';
  tag.textContent = snippet.tag;
  row.append(checkbox, label, tag);
  return row;
}

function renderChecklist(selectedIds) {
  dom.groupSnippetChecklist.innerHTML = '';
  if (state.snippets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'variables-empty';
    empty.textContent = 'No snippets yet — add some first.';
    dom.groupSnippetChecklist.appendChild(empty);
    return;
  }
  state.snippets.forEach((s) => dom.groupSnippetChecklist.appendChild(buildChecklistRow(s, selectedIds.has(s.id))));
}

dom.groupsBtn.addEventListener('click', openGroups);
dom.closeGroupsBtn.addEventListener('click', closeGroups);
dom.groupsOverlay.addEventListener('click', (e) => {
  if (e.target === dom.groupsOverlay) closeGroups();
});

dom.addGroupBtn.addEventListener('click', () => openGroupEditor(null));
dom.cancelGroupEditBtn.addEventListener('click', showGroupsListView);

dom.saveGroupBtn.addEventListener('click', async () => {
  const name = dom.groupNameInput.value.trim() || 'Untitled group';
  const snippetIds = Array.from(dom.groupSnippetChecklist.querySelectorAll('input[type="checkbox"]:checked'))
    .map((cb) => cb.dataset.snippetId);
  if (snippetIds.length === 0) {
    showToast('Pick at least one snippet for this group', 'error');
    return;
  }
  const id = state.editingGroupId || newId('grp');
  const group = { id, name, snippetIds };
  const existingIdx = state.groups.findIndex((g) => g.id === id);
  if (existingIdx >= 0) state.groups[existingIdx] = group;
  else state.groups.push(group);
  state.groups = await window.electronAPI.saveGroups(state.groups);
  emitGroupsChanged();
  showToast(`Saved group "${name}"`);
  showGroupsListView();
});

dom.deleteGroupBtn.addEventListener('click', async () => {
  const idx = state.groups.findIndex((g) => g.id === state.editingGroupId);
  if (idx < 0) return;
  const [removed] = state.groups.splice(idx, 1);
  state.groups = await window.electronAPI.saveGroups(state.groups);
  emitGroupsChanged();
  showToast(`Deleted group "${removed.name || '(untitled group)'}"`);
  showGroupsListView();
});
