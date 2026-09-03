// cards.js — builds the visible snippet list: render()/refresh(), each
// card's DOM (header badges, command/steps body, actions, output panel),
// drag-to-reorder, and "Run all" for a category group. Subscribes to
// 'snippets-changed' once at import time so every mutating module
// (editor-modal, snippets-store, batch, menus, keyboard) just needs to
// persist — this module notices and redraws on its own.
import { dom } from './dom.js';
import { state } from './state.js';
import { iconSvg, starIconSvg } from './icons.js';
import { tagIcon, snippetIcon, tagColors, buildCardMetaText, extractPlaceholders, substituteAll, runnableTextOf } from './utils.js';
import { showToast } from './toast.js';
import { applyFilter, isReorderable, persistSnippets, togglePin, duplicateSnippet, deleteSnippet, undoDelete } from './snippets-store.js';
import { runSingleSnippet, runSequenceSnippet } from './run-engine.js';
import { buildParamForm, syncVariablesFromValues } from './params.js';
import { showContextMenu, toggleCopyDropdown } from './menus.js';
import { openModal } from './editor-modal.js';
import { openDetails } from './details-modal.js';
import { onSnippetsChanged, onGroupsChanged } from './events.js';
import { openBatchConfig } from './batch-runner.js';
import { groupsForSnippet } from './groups-modal.js';
import {
  startBackground, startBackgroundWithValues, stopBackground, restartBackground,
  syncCardBackgroundUI, isRunningStatus,
} from './process-engine.js';

export function refresh() {
  applyFilter(dom.searchInput.value);
  render();
}

onSnippetsChanged(refresh);
onGroupsChanged(refresh);

function render() {
  dom.snippetList.innerHTML = '';
  dom.snippetCount.textContent = `${state.snippets.length} snippet${state.snippets.length === 1 ? '' : 's'}`;

  if (state.filtered.length === 0) {
    dom.emptyState.hidden = false;
    return;
  }
  dom.emptyState.hidden = true;

  const reorderable = isReorderable(dom.searchInput.value);
  const fragment = document.createDocumentFragment();
  let currentGroupTag = null;
  state.filtered.forEach((snippet, index) => {
    if (state.groupView && snippet.tag.toLowerCase() !== currentGroupTag) {
      currentGroupTag = snippet.tag.toLowerCase();
      const groupItems = state.filtered.filter((s) => s.tag.toLowerCase() === currentGroupTag);
      fragment.appendChild(buildGroupHeader(currentGroupTag, groupItems));
    }
    fragment.appendChild(buildCard(snippet, index, reorderable));
  });
  dom.snippetList.appendChild(fragment);
}

function buildGroupHeader(tag, items) {
  const header = document.createElement('div');
  header.className = 'group-header';
  const title = document.createElement('div');
  title.className = 'group-header-title';
  title.textContent = `${tagIcon(tag)} ${tag} · ${items.length}`;
  const runAllBtn = document.createElement('button');
  runAllBtn.className = 'btn group-run-all';
  runAllBtn.innerHTML = `${iconSvg('play')}<span>Run all</span>`;
  runAllBtn.addEventListener('click', () => openBatchConfig(items));
  header.append(title, runAllBtn);
  return header;
}

function clearDragOverStyles() {
  dom.snippetList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function buildCard(snippet, index, reorderable) {
  const card = document.createElement('div');
  card.className = 'card' + (index === state.selectedIndex ? ' selected' : '');
  card.dataset.index = String(index);
  card.dataset.snippetId = snippet.id;

  const colors = tagColors(snippet.tag);
  const header = document.createElement('div');
  header.className = 'card-header';

  if (state.selectMode) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'card-select-checkbox';
    checkbox.checked = state.selectedIds.has(snippet.id);
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedIds.add(snippet.id);
      else state.selectedIds.delete(snippet.id);
      document.dispatchEvent(new CustomEvent('batch-selection-changed'));
    });
    header.appendChild(checkbox);
  } else if (reorderable) {
    header.appendChild(buildDragHandle(snippet, card));
  } else if (index < 9) {
    const quickNum = document.createElement('div');
    quickNum.className = 'card-quick-num';
    quickNum.textContent = String(index + 1);
    header.appendChild(quickNum);
  }

  const avatar = document.createElement('div');
  avatar.className = 'card-avatar';
  avatar.style.background = colors.bg;
  avatar.textContent = snippetIcon(snippet);

  const titleGroup = buildTitleGroup(snippet);

  const tag = document.createElement('div');
  tag.className = 'card-tag';
  tag.style.background = colors.bg;
  tag.style.color = colors.fg;
  tag.textContent = snippet.tag;

  const pinBtn = document.createElement('button');
  pinBtn.className = 'pin-btn' + (snippet.pinned ? ' pinned' : '');
  pinBtn.title = snippet.pinned ? 'Unpin' : 'Pin to top';
  pinBtn.innerHTML = starIconSvg(snippet.pinned);
  pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await togglePin(snippet.id);
  });

  header.append(avatar, titleGroup, tag);
  if (snippet.cwd) header.appendChild(buildOpenFolderBtn(snippet));
  header.appendChild(buildTerminalBtn(snippet));
  header.appendChild(buildDetailsBtn(snippet));
  header.appendChild(pinBtn);

  const bodyEl = buildBody(snippet);
  const [notesToggle, notesBody] = buildNotes(snippet);

  let actions, output;
  if (snippet.background) {
    const built = buildBackgroundActionsAndOutput(snippet, card);
    ({ actions, output } = built);
    wireBackgroundControls(snippet, card, built.startStopBtn, built.restartBtn, output);
    syncCardBackgroundUI(card, snippet.id);
  } else {
    const built = buildActionsAndOutput(snippet, card);
    ({ actions, output } = built);
    wireRunButton(snippet, card, built.runBtn, output, built.copyOutputBtn);
  }

  card.addEventListener('click', () => {
    state.selectedIndex = index;
    updateSelectionStyles();
  });
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.selectedIndex = index;
    updateSelectionStyles();
    showContextMenu(e.clientX, e.clientY, snippet, card);
  });

  card.append(header, bodyEl);
  if (notesToggle) card.append(notesToggle, notesBody);
  card.append(actions, output);
  return card;
}

function buildDragHandle(snippet, card) {
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.title = 'Drag to reorder';
  handle.draggable = true;
  handle.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>';
  handle.addEventListener('dragstart', (e) => {
    state.dragSrcId = snippet.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', snippet.id);
  });
  handle.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    clearDragOverStyles();
    state.dragSrcId = null;
  });
  card.addEventListener('dragover', (e) => {
    if (!state.dragSrcId || state.dragSrcId === snippet.id) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    clearDragOverStyles();
    card.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearDragOverStyles();
    if (!state.dragSrcId || state.dragSrcId === snippet.id) return;
    const fromIdx = state.snippets.findIndex((s) => s.id === state.dragSrcId);
    if (fromIdx < 0) return;
    const rect = card.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    const [moved] = state.snippets.splice(fromIdx, 1);
    let insertAt = state.snippets.findIndex((s) => s.id === snippet.id);
    if (!before) insertAt += 1;
    state.snippets.splice(insertAt, 0, moved);
    state.dragSrcId = null;
    await persistSnippets();
  });
  return handle;
}

function buildTitleGroup(snippet) {
  const titleGroup = document.createElement('div');
  titleGroup.className = 'card-title-group';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = snippet.name;
  titleRow.appendChild(title);
  if (snippet.elevated) {
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.title = 'Runs as Administrator (UAC prompt)';
    badge.innerHTML = iconSvg('admin');
    titleRow.appendChild(badge);
  }
  if (snippet.schedule && snippet.schedule.enabled) {
    const schedBadge = document.createElement('span');
    schedBadge.className = 'schedule-badge';
    schedBadge.title = 'Runs automatically on a schedule';
    schedBadge.innerHTML = iconSvg('clock');
    titleRow.appendChild(schedBadge);
  }
  if (snippet.background) {
    const bgBadge = document.createElement('span');
    bgBadge.className = 'background-badge';
    bgBadge.title = snippet.autoRestart
      ? 'Background process (Start/Stop) — restarts automatically if it crashes'
      : 'Background process (Start/Stop instead of run-once)';
    bgBadge.innerHTML = iconSvg('terminal');
    titleRow.appendChild(bgBadge);
  }
  const memberGroups = groupsForSnippet(snippet.id);
  if (memberGroups.length > 0) {
    const groupsBadge = document.createElement('span');
    groupsBadge.className = 'groups-badge';
    groupsBadge.title = memberGroups.length === 1
      ? `In group: ${memberGroups[0].name || '(untitled group)'}${memberGroups[0].description ? ` — ${memberGroups[0].description}` : ''}`
      : `In groups: ${memberGroups.map((g) => g.name || '(untitled group)').join(', ')}`;
    groupsBadge.innerHTML = iconSvg('layers');
    titleRow.appendChild(groupsBadge);
  }
  titleGroup.appendChild(titleRow);

  const metaText = buildCardMetaText(snippet);
  if (metaText) {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = metaText;
    titleGroup.appendChild(meta);
  }
  return titleGroup;
}

function buildOpenFolderBtn(snippet) {
  const btn = document.createElement('button');
  btn.className = 'open-folder-btn';
  btn.title = `Open ${snippet.cwd} in File Explorer`;
  btn.innerHTML = iconSvg('folder');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const res = await window.electronAPI.openPath(snippet.cwd);
    if (!res.ok) showToast(res.error || 'Could not open that folder', 'error');
  });
  return btn;
}

function buildTerminalBtn(snippet) {
  const btn = document.createElement('button');
  btn.className = 'terminal-btn';
  btn.title = 'Open in a real, interactive terminal window';
  btn.innerHTML = iconSvg('terminal');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const res = await window.electronAPI.openTerminal({
      command: runnableTextOf(snippet), cwd: snippet.cwd, shell: snippet.shell,
    });
    if (!res.ok) showToast(res.error || 'Could not open a terminal', 'error');
  });
  return btn;
}

function buildDetailsBtn(snippet) {
  const btn = document.createElement('button');
  btn.className = 'details-btn';
  btn.title = 'Details (dependencies, schedule, stats)';
  btn.innerHTML = iconSvg('info');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDetails(snippet);
  });
  return btn;
}

function buildBody(snippet) {
  if (snippet.steps && snippet.steps.length) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'card-steps';
    snippet.steps.forEach((step, i) => {
      const stepEl = document.createElement('div');
      stepEl.className = 'card-step';
      stepEl.innerHTML = `<span class="card-step-num">${i + 1}.</span><span class="card-step-text"></span>`;
      stepEl.querySelector('.card-step-text').textContent = step;
      bodyEl.appendChild(stepEl);
    });
    return bodyEl;
  }
  const bodyEl = document.createElement('div');
  bodyEl.className = 'card-command';
  bodyEl.textContent = snippet.command;
  return bodyEl;
}

function buildNotes(snippet) {
  if (!snippet.notes) return [null, null];
  const notesToggle = document.createElement('button');
  notesToggle.className = 'notes-toggle';
  notesToggle.innerHTML = `${iconSvg('info')}<span>Notes</span>`;
  const notesBody = document.createElement('div');
  notesBody.className = 'card-notes';
  notesBody.textContent = snippet.notes;
  notesBody.hidden = true;
  notesToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    notesBody.hidden = !notesBody.hidden;
  });
  return [notesToggle, notesBody];
}

/** The Copy/Edit/Duplicate/[spacer]/Delete buttons every card gets regardless of run mode — split out so buildActionsAndOutput and buildBackgroundActionsAndOutput don't duplicate them. */
function buildCommonActionButtons(snippet) {
  const copyWrap = document.createElement('div');
  copyWrap.className = 'copy-split';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.innerHTML = `${iconSvg('copy')}<span>Copy</span>`;
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.electronAPI.copyText(runnableTextOf(snippet));
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = `${iconSvg('check')}<span>Copied!</span>`;
    setTimeout(() => { copyBtn.innerHTML = original; }, 1200);
  });
  const copyCaretBtn = document.createElement('button');
  copyCaretBtn.className = 'copy-caret-btn';
  copyCaretBtn.title = 'Copy as…';
  copyCaretBtn.innerHTML = iconSvg('chevronDown');
  copyCaretBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCopyDropdown(copyCaretBtn, snippet);
  });
  copyWrap.append(copyBtn, copyCaretBtn);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn';
  editBtn.innerHTML = `${iconSvg('edit')}<span>Edit</span>`;
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(snippet);
  });

  const dupBtn = document.createElement('button');
  dupBtn.className = 'btn';
  dupBtn.innerHTML = `${iconSvg('duplicate')}<span>Duplicate</span>`;
  dupBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const source = await duplicateSnippet(snippet.id);
    if (source) showToast(`Duplicated "${source.name}"`);
  });

  const spacer = document.createElement('div');
  spacer.className = 'btn-spacer';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.innerHTML = `${iconSvg('trash')}<span>Delete</span>`;
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // A background snippet's still-live process has no card left to
    // control once the card itself is gone — stop it first so deleting the
    // snippet can never leave an orphaned, now-uncontrollable process
    // running behind the scenes.
    if (snippet.background && isRunningStatus(state.runningProcesses[snippet.id]?.status)) {
      await stopBackground(snippet);
    }
    const result = await deleteSnippet(snippet.id);
    if (result) {
      showToast(`Deleted "${result.removed.name}"`, 'info', 'Undo', () => undoDelete(result.removed, result.index));
    }
  });

  return { copyWrap, editBtn, dupBtn, spacer, deleteBtn };
}

/** The status-dot/status-text output console shared by both run modes — split out for the same reason as buildCommonActionButtons. */
function buildOutputPanel(card) {
  const output = document.createElement('div');
  output.className = 'card-output';
  output.hidden = true;
  output.innerHTML = `
    <div class="card-output-header">
      <span><span class="status-dot"></span><span class="status-text">Idle</span></span>
      <div class="card-output-header-actions">
        <button class="copy-output-btn" title="Copy output" hidden>${iconSvg('copy')}</button>
        <button class="close-output-btn" title="Close output">${iconSvg('close')}</button>
      </div>
    </div>
    <div class="card-output-body"></div>
  `;
  const copyOutputBtn = output.querySelector('.copy-output-btn');
  copyOutputBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.electronAPI.copyText(card._lastOutputText || '');
    const original = copyOutputBtn.innerHTML;
    copyOutputBtn.innerHTML = iconSvg('check');
    setTimeout(() => { copyOutputBtn.innerHTML = original; }, 1000);
  });
  // The output panel otherwise stays visible forever once a card has run —
  // let the user dismiss it without needing to run again just to lose it.
  output.querySelector('.close-output-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    output.hidden = true;
  });

  return { output, copyOutputBtn };
}

function buildActionsAndOutput(snippet, card) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-primary';
  runBtn.innerHTML = `${iconSvg('play')}<span>Run</span>`;

  const { copyWrap, editBtn, dupBtn, spacer, deleteBtn } = buildCommonActionButtons(snippet);
  actions.append(runBtn, copyWrap, editBtn, dupBtn, spacer, deleteBtn);

  const { output, copyOutputBtn } = buildOutputPanel(card);
  return { actions, runBtn, output, copyOutputBtn };
}

/** Same card chrome as buildActionsAndOutput, but Run is replaced by a Start/Stop toggle plus a Restart button — for `snippet.background` snippets (see process-engine.js). Initial label/state gets set right after by syncCardBackgroundUI(); this only needs to build the elements. */
function buildBackgroundActionsAndOutput(snippet, card) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const startStopBtn = document.createElement('button');
  startStopBtn.className = 'btn btn-small btn-primary bg-startstop-btn';
  startStopBtn.innerHTML = `${iconSvg('play')}<span>Start</span>`;

  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn btn-small bg-restart-btn';
  restartBtn.title = 'Restart';
  restartBtn.innerHTML = iconSvg('rerun');
  restartBtn.disabled = true;

  const { copyWrap, editBtn, dupBtn, spacer, deleteBtn } = buildCommonActionButtons(snippet);
  actions.append(startStopBtn, restartBtn, copyWrap, editBtn, dupBtn, spacer, deleteBtn);

  const { output, copyOutputBtn } = buildOutputPanel(card);
  return { actions, startStopBtn, restartBtn, output, copyOutputBtn };
}

/** Wires Start/Stop (collecting placeholder values first, same inline form the normal Run button uses) and Restart to process-engine.js. No confirmation gate, same as everywhere else in this app — Start runs the command exactly like Run does, it just doesn't wait for it to finish. */
function wireBackgroundControls(snippet, card, startStopBtn, restartBtn, output) {
  let paramFormEl = null;
  function removeParamForm() {
    if (paramFormEl) { paramFormEl.remove(); paramFormEl = null; }
  }

  startStopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRunningStatus(state.runningProcesses[snippet.id]?.status)) {
      stopBackground(snippet);
      return;
    }
    if (paramFormEl) return; // form already open — use its own Run button
    const names = startBackground(snippet);
    if (names.length > 0) {
      paramFormEl = buildParamForm(names, (values) => {
        removeParamForm();
        startBackgroundWithValues(snippet, values);
      }, removeParamForm);
      card.insertBefore(paramFormEl, output);
    }
  });

  restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    restartBackground(snippet);
  });
}

/** Wires the Run button: collect placeholder values if any, then hand off to run-engine. No confirmation gate — running a command is the user's call. */
function wireRunButton(snippet, card, runBtn, output, copyOutputBtn) {
  let paramFormEl = null;

  function removeParamForm() {
    if (paramFormEl) {
      paramFormEl.remove();
      paramFormEl = null;
    }
  }

  function proceedRun(values) {
    const isSeq = Boolean(snippet.steps && snippet.steps.length);
    const finalPayload = isSeq
      ? snippet.steps.map((s) => substituteAll(s, values))
      : substituteAll(snippet.command, values);
    if (isSeq) runSequenceSnippet(snippet, card, finalPayload, output, copyOutputBtn, runBtn);
    else runSingleSnippet(snippet, card, finalPayload, output, copyOutputBtn, runBtn);
  }

  runBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (paramFormEl) return; // form already open — use its own Run button
    const names = extractPlaceholders(runnableTextOf(snippet));
    if (names.length > 0) {
      paramFormEl = buildParamForm(names, (values) => {
        removeParamForm();
        syncVariablesFromValues(values);
        proceedRun(values);
      }, removeParamForm);
      card.insertBefore(paramFormEl, output);
      return;
    }
    proceedRun(null);
  });
}

export function updateSelectionStyles() {
  const cards = dom.snippetList.querySelectorAll('.card');
  cards.forEach((card) => {
    const idx = Number(card.dataset.index);
    card.classList.toggle('selected', idx === state.selectedIndex);
  });
}
