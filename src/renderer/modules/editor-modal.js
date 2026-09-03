// editor-modal.js — the Add/Edit snippet modal: every field, every
// sub-widget (steps list, env list, schedule type tabs, icon picker), and
// saving. This is intentionally the biggest single module in the renderer —
// it's one cohesive form, splitting it further would just scatter one
// concern across files without making any of them simpler.
import { dom } from './dom.js';
import { state, ICON_PRESETS } from './state.js';
import { iconSvg } from './icons.js';
import { newId, findDependencyCycle } from './utils.js';
import { persistSnippets } from './snippets-store.js';
import { showToast } from './toast.js';
import { emitEditorClosed } from './events.js';

function showSingleGroup() {
  dom.singleCommandGroup.hidden = false;
  dom.stepsGroup.hidden = true;
}
function showStepsGroupUI() {
  dom.singleCommandGroup.hidden = true;
  dom.stepsGroup.hidden = false;
}

function renumberSteps() {
  dom.stepsList.querySelectorAll('.step-row').forEach((row, i) => {
    row.querySelector('.step-row-num').textContent = `${i + 1}.`;
  });
}

function addStepRow(value = '') {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `
    <span class="step-row-num"></span>
    <input type="text" class="step-row-input" placeholder="Get-Process {{name}}" />
    <button type="button" class="step-remove-btn" title="Remove step">${iconSvg('trash')}</button>
  `;
  row.querySelector('.step-row-input').value = value;
  row.querySelector('.step-remove-btn').addEventListener('click', () => {
    row.remove();
    renumberSteps();
  });
  dom.stepsList.appendChild(row);
  renumberSteps();
}

function setStepsList(steps) {
  dom.stepsList.innerHTML = '';
  (steps && steps.length ? steps : ['', '']).forEach((s) => addStepRow(s));
}

// Background mode only makes sense for a single command (see
// storage/snippets.js's sanitizeSnippet, which enforces the same rule
// server-side) — hide the toggle entirely rather than let the user pick a
// combination the sanitizer would just silently undo on the next save.
function syncBackgroundAvailability() {
  dom.backgroundGroup.hidden = dom.multiStepToggle.checked;
  if (dom.multiStepToggle.checked) dom.backgroundToggle.checked = false;
}

dom.multiStepToggle.addEventListener('change', () => {
  if (dom.multiStepToggle.checked) {
    if (dom.stepsList.children.length === 0) setStepsList(null);
    showStepsGroupUI();
  } else {
    showSingleGroup();
  }
  syncBackgroundAvailability();
});
dom.addStepBtn.addEventListener('click', () => addStepRow(''));

dom.backgroundToggle.addEventListener('change', () => {
  dom.autoRestartRow.hidden = !dom.backgroundToggle.checked;
  if (!dom.backgroundToggle.checked) dom.autoRestartToggle.checked = false;
});

// --- Environment variables editor ---
function addEnvRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'env-row';
  row.innerHTML = `
    <input type="text" class="field-input env-key-input" placeholder="KEY" />
    <input type="text" class="field-input env-value-input" placeholder="value" />
    <button type="button" class="step-remove-btn" title="Remove">${iconSvg('trash')}</button>
  `;
  row.querySelector('.env-key-input').value = key;
  row.querySelector('.env-value-input').value = value;
  row.querySelector('.step-remove-btn').addEventListener('click', () => row.remove());
  dom.envList.appendChild(row);
}
function setEnvList(env) {
  dom.envList.innerHTML = '';
  (env || []).forEach((e) => addEnvRow(e.key, e.value));
}
dom.addEnvBtn.addEventListener('click', () => addEnvRow('', ''));

// --- stdin toggle ---
dom.stdinToggle.addEventListener('change', () => {
  dom.stdinGroup.hidden = !dom.stdinToggle.checked;
});

// --- Shell choice ⇄ elevation availability (elevation is PowerShell-only) ---
function syncElevatedAvailability() {
  const disable = dom.newShell.value !== 'powershell';
  dom.newElevated.disabled = disable;
  dom.elevatedRow.classList.toggle('disabled', disable);
  if (disable) dom.newElevated.checked = false;
}
dom.newShell.addEventListener('change', syncElevatedAvailability);

// --- Schedule type tabs (only the active type's fields are shown) ---
function updateScheduleTypeUI() {
  dom.scheduleIntervalRow.hidden = state.scheduleTypeValue !== 'interval';
  dom.scheduleDailyRow.hidden = state.scheduleTypeValue !== 'daily';
  dom.scheduleCronRow.hidden = state.scheduleTypeValue !== 'cron';
  dom.scheduleTypeSegmented.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === state.scheduleTypeValue);
  });
}
dom.scheduleTypeSegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented-btn');
  if (!btn) return;
  state.scheduleTypeValue = btn.dataset.value;
  updateScheduleTypeUI();
});
dom.scheduleToggle.addEventListener('change', () => {
  dom.scheduleGroup.hidden = !dom.scheduleToggle.checked;
});

function initIconPicker() {
  dom.iconPicker.innerHTML = '';
  ICON_PRESETS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => { dom.newIcon.value = emoji; });
    dom.iconPicker.appendChild(btn);
  });
}
initIconPicker();

/** Every tag already in use, so the plain text `newTag` input gets native browser autocomplete (via its `list="tagDatalist"` attribute) toward an existing category instead of the user having to remember/retype it exactly. */
function populateTagDatalist() {
  const tags = Array.from(new Set(state.snippets.map((s) => s.tag))).sort();
  dom.tagDatalist.innerHTML = '';
  tags.forEach((tag) => {
    const opt = document.createElement('option');
    opt.value = tag;
    dom.tagDatalist.appendChild(opt);
  });
}

// --- Run before / Run after: text input + native datalist, same "type to
// autocomplete" pattern as the tag field, instead of a plain <select> — a
// name is what's typed/shown, but the field ultimately needs to save an
// id, so each input keeps a displayText -> id map (rebuilt every time the
// modal opens) to resolve what was typed/picked back to an id on save.
// Two snippets can share a name (nothing enforces uniqueness), so a
// colliding name is disambiguated with its tag in the suggestion list.
let runAfterNameToId = new Map();
let runBeforeNameToId = new Map();

function displayTextFor(snippet, candidates) {
  const isAmbiguous = candidates.filter((s) => s.name === snippet.name).length > 1;
  return isAmbiguous ? `${snippet.name} (${snippet.tag})` : snippet.name;
}

/** Populates `datalistEl` with every other snippet's (disambiguated) name and returns the displayText -> id map used to resolve the input's typed value back to an id. */
function populateSnippetDatalist(datalistEl, candidates) {
  const nameToId = new Map();
  datalistEl.innerHTML = '';
  candidates.forEach((s) => {
    const text = displayTextFor(s, candidates);
    nameToId.set(text, s.id);
    const opt = document.createElement('option');
    opt.value = text;
    datalistEl.appendChild(opt);
  });
  return nameToId;
}

/** Resolves a Run before/after input's typed text back to a snippet id via its displayText -> id map, tolerating a case mismatch (hand-typed rather than picked from the suggestion list); shows a toast and returns null for empty or unrecognized text rather than silently keeping a stale value. */
function resolveSnippetRef(inputEl, nameToId, fieldLabel) {
  const typed = inputEl.value.trim();
  if (!typed) return null;
  if (nameToId.has(typed)) return nameToId.get(typed);
  const lower = typed.toLowerCase();
  for (const [text, id] of nameToId) {
    if (text.toLowerCase() === lower) return id;
  }
  showToast(`"${typed}" doesn't match any snippet — ${fieldLabel} left empty`, 'error');
  return null;
}

export function openModal(snippetToEdit) {
  state.editingId = snippetToEdit ? snippetToEdit.id : null;
  dom.modalTitle.textContent = state.editingId ? 'Edit snippet' : 'New snippet';
  dom.saveAddBtn.textContent = state.editingId ? 'Save changes' : 'Save snippet';
  dom.newIcon.value = (snippetToEdit && snippetToEdit.icon) || '';
  dom.newName.value = snippetToEdit ? snippetToEdit.name : '';
  dom.newTag.value = snippetToEdit ? snippetToEdit.tag : '';
  populateTagDatalist();
  dom.newCwd.value = (snippetToEdit && snippetToEdit.cwd) || '';
  dom.newShell.value = (snippetToEdit && snippetToEdit.shell) || 'powershell';
  syncElevatedAvailability();
  dom.newElevated.checked = Boolean(snippetToEdit && snippetToEdit.elevated) && dom.newShell.value === 'powershell';
  dom.newNotes.value = (snippetToEdit && snippetToEdit.notes) || '';

  const hasSteps = Boolean(snippetToEdit && snippetToEdit.steps && snippetToEdit.steps.length);
  dom.multiStepToggle.checked = hasSteps;
  dom.stopOnStepErrorToggle.checked = Boolean(snippetToEdit && snippetToEdit.stopOnStepError);
  // Always reset the steps list here, even when this snippet has none —
  // otherwise leftover rows from a previous snippet's edit sit hidden in
  // stepsGroup, and toggling "Multi-step sequence" back on for a brand-new
  // snippet resurrects that stale content instead of two blank rows (the
  // toggle's own change handler only resets when the list is *already*
  // empty, which it no longer is once this has fired once).
  setStepsList(hasSteps ? snippetToEdit.steps : null);
  if (hasSteps) {
    showStepsGroupUI();
  } else {
    dom.newCommand.value = snippetToEdit ? snippetToEdit.command : '';
    showSingleGroup();
  }
  syncBackgroundAvailability();
  dom.backgroundToggle.checked = Boolean(snippetToEdit && snippetToEdit.background) && !hasSteps;
  dom.autoRestartRow.hidden = !dom.backgroundToggle.checked;
  dom.autoRestartToggle.checked = Boolean(snippetToEdit && snippetToEdit.autoRestart) && dom.backgroundToggle.checked;

  dom.stdinToggle.checked = Boolean(snippetToEdit && snippetToEdit.stdin);
  dom.newStdin.value = (snippetToEdit && snippetToEdit.stdin) || '';
  dom.stdinGroup.hidden = !dom.stdinToggle.checked;

  setEnvList(snippetToEdit && snippetToEdit.env);

  const expect = snippetToEdit && snippetToEdit.expect;
  dom.expectExitCode.value = expect && expect.exitCode !== null && expect.exitCode !== undefined ? String(expect.exitCode) : '';
  dom.expectOutput.value = (expect && expect.outputContains) || '';

  const chainCandidates = state.snippets.filter((s) => s.id !== state.editingId);
  runAfterNameToId = populateSnippetDatalist(dom.runAfterDatalist, chainCandidates);
  runBeforeNameToId = populateSnippetDatalist(dom.runBeforeDatalist, chainCandidates);
  const afterTarget = snippetToEdit && snippetToEdit.runAfterThis ? state.snippets.find((s) => s.id === snippetToEdit.runAfterThis) : null;
  const beforeTarget = snippetToEdit && snippetToEdit.runBefore ? state.snippets.find((s) => s.id === snippetToEdit.runBefore) : null;
  dom.runAfterInput.value = afterTarget ? displayTextFor(afterTarget, chainCandidates) : '';
  dom.runBeforeInput.value = beforeTarget ? displayTextFor(beforeTarget, chainCandidates) : '';

  const sch = snippetToEdit && snippetToEdit.schedule;
  dom.scheduleToggle.checked = Boolean(sch && sch.enabled);
  dom.scheduleGroup.hidden = !dom.scheduleToggle.checked;
  state.scheduleTypeValue = (sch && sch.type) || 'interval';
  updateScheduleTypeUI();
  dom.scheduleIntervalMinutes.value = (sch && sch.intervalMinutes) || 60;
  dom.scheduleDailyTime.value = (sch && sch.dailyTime) || '09:00';
  dom.scheduleCronExpr.value = (sch && sch.cronExpr) || '*/15 * * * *';

  dom.modalOverlay.hidden = false;
  setTimeout(() => dom.newName.focus(), 0);
}

export function closeModal() {
  dom.modalOverlay.hidden = true;
  state.editingId = null;
  dom.searchInput.focus();
  emitEditorClosed();
}

export function isEditorOpen() {
  return !dom.modalOverlay.hidden;
}

async function saveModalSnippet() {
  const name = dom.newName.value.trim();
  const tag = dom.newTag.value.trim() || 'misc';
  const cwd = dom.newCwd.value.trim() || null;
  const shell = dom.newShell.value;
  const elevated = dom.newElevated.checked && shell === 'powershell';
  const icon = dom.newIcon.value.trim() || null;
  const notes = dom.newNotes.value.trim() || null;
  const stdin = dom.stdinToggle.checked ? (dom.newStdin.value || null) : null;

  if (!name) {
    dom.newName.focus();
    return;
  }

  let command = '';
  let steps = null;
  if (dom.multiStepToggle.checked) {
    steps = Array.from(dom.stepsList.querySelectorAll('.step-row-input'))
      .map((i) => i.value.trim())
      .filter(Boolean);
    if (steps.length === 0) {
      const firstInput = dom.stepsList.querySelector('.step-row-input');
      if (firstInput) firstInput.focus();
      return;
    }
    command = steps.join('\n');
  } else {
    command = dom.newCommand.value.trim();
    if (!command) {
      dom.newCommand.focus();
      return;
    }
  }

  const env = Array.from(dom.envList.querySelectorAll('.env-row')).map((row) => ({
    key: row.querySelector('.env-key-input').value.trim(),
    value: row.querySelector('.env-value-input').value,
  })).filter((e) => e.key);

  const expectExitVal = dom.expectExitCode.value.trim();
  const expectOutVal = dom.expectOutput.value.trim();
  const expect = (expectExitVal !== '' || expectOutVal)
    ? { exitCode: expectExitVal !== '' ? Number(expectExitVal) : null, outputContains: expectOutVal || null }
    : null;

  const runAfterThis = resolveSnippetRef(dom.runAfterInput, runAfterNameToId, '"Run after this one"');
  const runBefore = resolveSnippetRef(dom.runBeforeInput, runBeforeNameToId, '"Run before this one"');
  const stopOnStepError = dom.stopOnStepErrorToggle.checked;

  // A brand-new snippet can never be part of a cycle (nothing existing can
  // point at an id that doesn't exist yet) — only check when editing.
  if (state.editingId) {
    const scratch = state.snippets.map((s) => (
      s.id === state.editingId ? { id: s.id, runAfterThis, runBefore } : { id: s.id, runAfterThis: s.runAfterThis, runBefore: s.runBefore }
    ));
    const cycle = findDependencyCycle(scratch);
    if (cycle) {
      const names = cycle.map((id) => (id === state.editingId ? name : (state.snippets.find((s) => s.id === id)?.name || id)));
      showToast(`Can't save — "Run before"/"Run after this one" would create a loop: ${names.join(' → ')}`, 'error');
      return;
    }
  }

  const existingSchedule = state.editingId ? state.snippets.find((s) => s.id === state.editingId)?.schedule : null;
  const schedule = dom.scheduleToggle.checked ? {
    enabled: true,
    type: state.scheduleTypeValue,
    intervalMinutes: Number(dom.scheduleIntervalMinutes.value) || 60,
    dailyTime: dom.scheduleDailyTime.value || '09:00',
    cronExpr: dom.scheduleCronExpr.value.trim() || '*/15 * * * *',
    lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
  } : null;

  const background = dom.backgroundToggle.checked && !steps;
  const autoRestart = background && dom.autoRestartToggle.checked;

  const fields = {
    name, tag, command, steps, cwd, shell, elevated, icon, notes, stdin, env, expect,
    runAfterThis, runBefore, stopOnStepError, schedule, background, autoRestart,
  };

  if (state.editingId) {
    const target = state.snippets.find((s) => s.id === state.editingId);
    if (target) Object.assign(target, fields);
  } else {
    state.snippets.push({
      id: newId('snip'), ...fields, pinned: false, runCount: 0, lastRunAt: null,
    });
  }

  await persistSnippets(); // emits 'snippets-changed' — cards/tags/favorites redraw themselves
  closeModal();
}

dom.addBtn.addEventListener('click', () => openModal(null));
dom.cancelAddBtn.addEventListener('click', closeModal);
dom.saveAddBtn.addEventListener('click', saveModalSnippet);
dom.modalOverlay.addEventListener('click', (e) => {
  if (e.target === dom.modalOverlay) closeModal();
});
