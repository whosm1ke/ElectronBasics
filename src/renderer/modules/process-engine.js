// process-engine.js — start/stop/restart for background-process snippets
// (see shell/process-manager.js on the main side) and the live streaming of
// their output into a card. This module owns ALL of "how process state maps
// onto a card's DOM" (syncCardBackgroundUI) so cards.js only ever needs to
// build the skeleton elements and call back in here — it never has to know
// the status→label/status→dot-class mapping itself.
//
// state.runningProcesses[snippetId] is the source of truth, not any card's
// DOM — cards.js's refresh() fully rebuilds every card on any unrelated
// change (search, sort, an edit elsewhere, groups changing…), which a
// background process can easily outlive. Output chunks are appended
// directly to the currently-rendered card's output body (a live
// querySelector lookup, not a captured element reference — see run-engine.js's
// findCardEl for the same pattern) *and* buffered in state, so a chunk that
// arrives while the card isn't even in the DOM (filtered out, or mid-
// rebuild) isn't lost — the next syncCardBackgroundUI() picks up the buffer.
import { state } from './state.js';
import { iconSvg } from './icons.js';
import { showToast } from './toast.js';
import { playTone, maybeNotify } from './appearance.js';
import { extractPlaceholders, runnableTextOf, substituteAll } from './utils.js';
import { syncVariablesFromValues } from './params.js';

// Cap how much output we keep per background snippet — a `tail -f` or dev
// server can log forever; without a cap this would grow without bound for
// as long as the app stays open. Keep-the-tail, like history.js's preview
// truncation elsewhere in this app.
const MAX_BUFFER_CHARS = 200_000;

export const STATUS_LABEL = {
  idle: 'Idle',
  starting: 'Starting…',
  running: 'Running',
  stopped: 'Stopped',
  exited: 'Exited (0)',
  crashed: 'Crashed',
  restarting: 'Crashed — restarting…',
  'restart-limit': 'Crash-looped — gave up',
  error: 'Error',
};

const STATUS_DOT_CLASS = {
  starting: 'running', running: 'running', restarting: 'running',
  exited: 'ok',
  stopped: '', idle: '',
  crashed: 'error', error: 'error', 'restart-limit': 'error',
};

export function isRunningStatus(status) {
  return status === 'starting' || status === 'running' || status === 'restarting';
}

function ensureEntry(snippetId) {
  if (!state.runningProcesses[snippetId]) {
    state.runningProcesses[snippetId] = { status: 'idle', outputBuffer: '', pid: null };
  }
  return state.runningProcesses[snippetId];
}

function findCard(snippetId) {
  return document.querySelector(`.card[data-snippet-id="${snippetId}"]`);
}

/** Patches an already-rendered card's Start/Stop label, Restart's disabled state, and the output header/body to match state.runningProcesses[snippetId] — no full card rebuild. No-ops if the card isn't currently rendered (e.g. filtered out by search); state is still updated by the caller either way, so the next real render picks it up. Safe to call at card-build time too (cards.js does, right after constructing the elements). */
export function syncCardBackgroundUI(card, snippetId) {
  if (!card) return;
  const entry = ensureEntry(snippetId);
  const running = isRunningStatus(entry.status);

  const startStopBtn = card.querySelector('.bg-startstop-btn');
  if (startStopBtn) {
    startStopBtn.className = `btn btn-small ${running ? 'btn-danger' : 'btn-primary'} bg-startstop-btn`;
    startStopBtn.innerHTML = running ? `${iconSvg('stop')}<span>Stop</span>` : `${iconSvg('play')}<span>Start</span>`;
  }
  const restartBtn = card.querySelector('.bg-restart-btn');
  if (restartBtn) restartBtn.disabled = !running;

  const output = card.querySelector('.card-output');
  if (!output) return;
  const statusDot = output.querySelector('.status-dot');
  const statusText = output.querySelector('.status-text');
  if (statusDot) statusDot.className = `status-dot ${STATUS_DOT_CLASS[entry.status] || ''}`;
  if (statusText) statusText.textContent = STATUS_LABEL[entry.status] || entry.status;

  if (entry.status !== 'idle' || entry.outputBuffer) {
    output.hidden = false;
    const body = output.querySelector('.card-output-body');
    if (body && body.textContent !== entry.outputBuffer) {
      body.textContent = entry.outputBuffer;
      body.scrollTop = body.scrollHeight;
    }
    card._lastOutputText = entry.outputBuffer;
    const copyBtn = output.querySelector('.copy-output-btn');
    if (copyBtn) copyBtn.hidden = !entry.outputBuffer;
  }
}

function onProcessOutput({ snippetId, chunk }) {
  const entry = ensureEntry(snippetId);
  entry.outputBuffer = (entry.outputBuffer + chunk).slice(-MAX_BUFFER_CHARS);

  const card = findCard(snippetId);
  const body = card?.querySelector('.card-output-body');
  if (body) {
    body.textContent += chunk;
    body.scrollTop = body.scrollHeight;
    card._lastOutputText = entry.outputBuffer;
    const copyBtn = card.querySelector('.copy-output-btn');
    if (copyBtn) copyBtn.hidden = false;
  }
}

function onProcessStatus(data) {
  const { snippetId, status } = data;
  const entry = ensureEntry(snippetId);
  entry.status = status;
  if ('pid' in data) entry.pid = data.pid;
  // A fresh Start (not a crash-triggered auto-restart) clears the old
  // output — otherwise a second run would look like it's continuing the
  // first one's log instead of starting clean.
  if (status === 'starting' && !entry._restarting) entry.outputBuffer = '';
  entry._restarting = status === 'restarting';

  syncCardBackgroundUI(findCard(snippetId), snippetId);

  const snippet = state.snippets.find((s) => s.id === snippetId);
  const name = snippet ? snippet.name : snippetId;
  switch (status) {
    case 'crashed':
      showToast(`"${name}" crashed (exit ${data.code})`, 'error');
      playTone(false);
      maybeNotify(name, 'Background process crashed');
      break;
    case 'exited':
      playTone(true);
      maybeNotify(name, 'Background process exited on its own');
      break;
    case 'restarting':
      showToast(`"${name}" crashed — restarting (attempt ${data.attempt}/${data.max})…`, 'error');
      break;
    case 'restart-limit':
      showToast(`"${name}": ${data.message}`, 'error');
      maybeNotify(name, data.message);
      break;
    case 'error':
      showToast(`"${name}": ${data.message}`, 'error');
      break;
    default:
      break;
  }
}

window.electronAPI.onProcessOutput(onProcessOutput);
window.electronAPI.onProcessStatus(onProcessStatus);

/** Seeds state.runningProcesses from whatever's actually still alive in the main process — called once at app boot. Needed because the main process (and any background children it spawned) survives a renderer-only reload/crash even though the renderer's own JS state doesn't; without this, a fresh renderer would show a still-running dev server as idle. */
export async function bootstrapRunningProcesses() {
  const list = await window.electronAPI.listProcesses();
  list.forEach(({ snippetId, status, pid }) => {
    const entry = ensureEntry(snippetId);
    entry.status = status;
    entry.pid = pid;
  });
}

async function doStart(snippet, command) {
  const entry = ensureEntry(snippet.id);
  entry.status = 'starting';
  entry.outputBuffer = '';
  syncCardBackgroundUI(findCard(snippet.id), snippet.id);
  const res = await window.electronAPI.startProcess({
    snippetId: snippet.id, command, cwd: snippet.cwd, shell: snippet.shell, env: snippet.env, autoRestart: snippet.autoRestart,
  });
  if (!res.ok) {
    entry.status = 'error';
    syncCardBackgroundUI(findCard(snippet.id), snippet.id);
    showToast(res.error || 'Could not start the process', 'error');
  }
}

/** Starts `snippet` as a background process. Returns the placeholder names still needing values if any — cards.js opens the same inline param form the normal Run button uses, then calls startBackgroundWithValues once filled in — rather than starting it here itself. */
export function startBackground(snippet) {
  const names = extractPlaceholders(runnableTextOf(snippet));
  if (names.length > 0) return names;
  doStart(snippet, snippet.command);
  return [];
}

export function startBackgroundWithValues(snippet, values) {
  syncVariablesFromValues(values);
  doStart(snippet, substituteAll(snippet.command, values));
}

export async function stopBackground(snippet) {
  const res = await window.electronAPI.stopProcess(snippet.id);
  if (!res.ok) showToast(res.error || 'Could not stop the process', 'error');
}

export async function restartBackground(snippet) {
  const res = await window.electronAPI.restartProcess(snippet.id);
  if (!res.ok) showToast(res.error || 'Could not restart the process', 'error');
}
