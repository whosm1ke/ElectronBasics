// batch-runner.js — the shared "configure, then run a list of snippets with
// live per-row output" engine plus the batch modal's open/close plumbing.
// Used by both batch.js (the select-mode flow) and cards.js ("Run all" on a
// tag group) so a group run gets the exact same order/mode/stop-on-error
// config step and live output a manually-selected batch gets. Deliberately
// has no dependency on cards.js (which needs to import this) — keeping it a
// leaf module is what avoids a cards.js <-> batch.js import cycle.
import { dom } from './dom.js';
import { state } from './state.js';
import { snippetIcon, prettyMaybeJson, runnableTextOf, extractPlaceholders } from './utils.js';

export function showConfigView() {
  dom.batchConfigView.hidden = false;
  dom.batchResultsView.hidden = true;
}
export function showResultsView() {
  dom.batchConfigView.hidden = true;
  dom.batchResultsView.hidden = false;
}
/** Opens the modal straight to the live-results view (skips the order/mode config step). */
export function openBatchResultsModal() {
  showResultsView();
  dom.batchModalOverlay.hidden = false;
}
export function closeBatchModal() {
  dom.batchModalOverlay.hidden = true;
}
export function isBatchModalOpen() {
  return !dom.batchModalOverlay.hidden;
}
dom.cancelBatchBtn.addEventListener('click', closeBatchModal);
dom.closeBatchResultsBtn.addEventListener('click', closeBatchModal);
dom.batchModalOverlay.addEventListener('click', (e) => {
  if (e.target === dom.batchModalOverlay) closeBatchModal();
});

// --- Order/mode config step (shared by select-mode batch and "Run all" on a group) ---

function updateModeSegmented() {
  dom.batchModeSegmented.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === state.batchModeValue);
  });
  dom.batchStopOnErrorToggle.disabled = state.batchModeValue !== 'sequential';
}
dom.batchModeSegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented-btn');
  if (!btn) return;
  state.batchModeValue = btn.dataset.value;
  updateModeSegmented();
});
dom.batchStopOnErrorToggle.addEventListener('change', () => {
  state.batchStopOnError = dom.batchStopOnErrorToggle.checked;
});

function clearOrderDragOverStyles() {
  dom.batchOrderList.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function renderOrderList() {
  dom.batchOrderList.innerHTML = '';
  state.batchOrder.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'batch-order-row';
    row.draggable = true;
    row.innerHTML = `<span class="batch-order-num">${i + 1}</span><span class="batch-order-name"></span>`;
    row.querySelector('.batch-order-name').textContent = `${snippetIcon(s)} ${s.name}`;
    row.addEventListener('dragstart', () => {
      state.batchDragSrcId = s.id;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      clearOrderDragOverStyles();
      state.batchDragSrcId = null;
    });
    row.addEventListener('dragover', (e) => {
      if (!state.batchDragSrcId || state.batchDragSrcId === s.id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      clearOrderDragOverStyles();
      row.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      clearOrderDragOverStyles();
      if (!state.batchDragSrcId || state.batchDragSrcId === s.id) return;
      const fromIdx = state.batchOrder.findIndex((x) => x.id === state.batchDragSrcId);
      if (fromIdx < 0) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      const [moved] = state.batchOrder.splice(fromIdx, 1);
      let insertAt = state.batchOrder.findIndex((x) => x.id === s.id);
      if (!before) insertAt += 1;
      state.batchOrder.splice(insertAt, 0, moved);
      state.batchDragSrcId = null;
      renderOrderList();
    });
    dom.batchOrderList.appendChild(row);
  });
}

/** Seeds state.batchOrder from `list` and opens the modal at the config step (order/mode/stop-on-error), ready for the shared "Run" button (wired in batch.js) to start it. */
export function openBatchConfig(list) {
  state.batchOrder = list.slice();
  state.batchModeValue = 'sequential';
  state.batchStopOnError = false;
  dom.batchStopOnErrorToggle.checked = false;
  updateModeSegmented();
  renderOrderList();
  showConfigView();
  dom.batchModalOverlay.hidden = false;
}

// --- Live-results run ---

/** Builds one live-updating result row; returns handles to update it as the run progresses. */
function buildResultRow(snippet) {
  const row = document.createElement('div');
  row.className = 'batch-result-row';
  row.innerHTML = `
    <div class="batch-result-header">
      <span class="status-dot"></span>
      <span class="batch-result-name"></span>
    </div>
    <div class="batch-result-body" hidden></div>
  `;
  row.querySelector('.batch-result-name').textContent = `${snippetIcon(snippet)} ${snippet.name}`;
  const statusDot = row.querySelector('.status-dot');
  const body = row.querySelector('.batch-result-body');
  row.querySelector('.batch-result-header').addEventListener('click', () => {
    if (body.textContent.trim()) body.hidden = !body.hidden;
  });
  return { row, statusDot, body };
}

function setRowPending(handles) {
  handles.statusDot.className = 'status-dot';
}
function setRowRunning(handles) {
  handles.statusDot.className = 'status-dot running';
}
function setRowDone(handles, result) {
  const success = result.code === 0;
  handles.statusDot.className = `status-dot ${success ? 'ok' : 'error'}`;
  const text = prettyMaybeJson((result.stdout || '').trim()) || (result.stderr || '').trim() || '(no output)';
  handles.body.textContent = text;
  handles.body.hidden = false;
  return success;
}
function setRowSkipped(handles) {
  handles.statusDot.className = 'status-dot';
  handles.body.textContent = 'Skipped — needs input (parameterized snippet).';
  handles.body.hidden = false;
}
function setRowNotRun(handles) {
  handles.statusDot.className = 'status-dot';
  handles.body.textContent = 'Not run — an earlier snippet failed ("Stop if a snippet fails" is on).';
  handles.body.hidden = false;
}

async function runOne(snippet) {
  if (snippet.steps && snippet.steps.length) {
    const result = await window.electronAPI.runSequence({
      steps: snippet.steps, snippetId: snippet.id, snippetName: snippet.name,
      cwd: snippet.cwd, shell: snippet.shell, elevated: snippet.elevated, env: snippet.env,
      stopOnError: Boolean(snippet.stopOnStepError),
    });
    return { code: result.overallCode, stdout: result.steps.map((s) => s.stdout).join('\n'), stderr: result.steps.map((s) => s.stderr).filter(Boolean).join('\n') };
  }
  return window.electronAPI.runCommand({
    command: snippet.command, snippetId: snippet.id, snippetName: snippet.name,
    cwd: snippet.cwd, shell: snippet.shell, elevated: snippet.elevated, env: snippet.env, stdin: snippet.stdin,
  });
}

/**
 * Runs `list` (sequential or parallel per `mode`), populating
 * `dom.batchResultsList` with one live row per snippet as it goes.
 * Bumps each ran snippet's runCount/lastRunAt on `state.snippets` — the
 * caller is still responsible for persisting and re-rendering afterward.
 * `stopOnError` (sequential mode only) halts the run after the first
 * snippet failure, marking the rest "not run" instead of executing them.
 * Returns `{ total, ran, skipped, notRun }`.
 */
export async function runBatchList(list, mode, { stopOnError = false } = {}) {
  dom.batchResultsList.innerHTML = '';
  dom.closeBatchResultsBtn.textContent = 'Running…';
  dom.closeBatchResultsBtn.disabled = true;

  const rows = list.map((snippet) => {
    const handles = buildResultRow(snippet);
    dom.batchResultsList.appendChild(handles.row);
    return { snippet, handles };
  });

  const runnable = rows.filter(({ snippet }) => extractPlaceholders(runnableTextOf(snippet)).length === 0);
  rows.filter(({ snippet }) => extractPlaceholders(runnableTextOf(snippet)).length > 0)
    .forEach(({ handles }) => setRowSkipped(handles));
  runnable.forEach(({ handles }) => setRowPending(handles));

  async function runAndMark({ snippet, handles }) {
    setRowRunning(handles);
    const result = await runOne(snippet);
    const success = setRowDone(handles, result);
    const target = state.snippets.find((x) => x.id === snippet.id);
    if (target) {
      target.runCount = (target.runCount || 0) + 1;
      target.lastRunAt = new Date().toISOString();
    }
    return success;
  }

  let notRunCount = 0;
  if (mode === 'parallel') {
    await Promise.all(runnable.map(runAndMark));
  } else {
    for (let i = 0; i < runnable.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const success = await runAndMark(runnable[i]);
      if (stopOnError && !success) {
        const remaining = runnable.slice(i + 1);
        remaining.forEach(({ handles }) => setRowNotRun(handles));
        notRunCount = remaining.length;
        break;
      }
    }
  }

  dom.closeBatchResultsBtn.textContent = 'Close';
  dom.closeBatchResultsBtn.disabled = false;
  return { total: rows.length, ran: runnable.length - notRunCount, skipped: rows.length - runnable.length, notRun: notRunCount };
}
