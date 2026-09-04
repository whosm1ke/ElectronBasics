// processEngine.ts — start/stop/restart for background-process snippets
// (see shell/process-manager.ts on the main side) and the live streaming of
// their output into a card. Ported from modules/process-engine.js — the
// document.querySelector + state.runningProcesses buffer pattern is kept
// deliberately unchanged (not rewritten into React state) per the
// migration plan: state.runningProcesses[snippetId] stays the source of
// truth, and output chunks patch the *currently rendered* card's DOM
// directly (a live query, not a captured ref) so a chunk arriving while
// the card isn't mounted (filtered out, mid-rebuild) isn't lost — the next
// syncCardBackgroundUI() call (Card.tsx calls it on every render for a
// background snippet) picks up the buffer. Rewriting this into per-chunk
// setState would risk exactly the re-render storm this design avoids for
// a chatty process like `tail -f` or a dev server.
import type { Snippet, ProcessStatusValue, ProcessOutputEvent, ProcessStatusEvent } from '@shared/types';
import { iconSvg } from './icons';
import { showToast } from '../store/useToastStore';
import { playTone, maybeNotify } from './appearance';
import { extractPlaceholders, runnableTextOf, substituteAll } from './utils';
import { syncVariablesFromValues } from './variables';
import { state } from '../../modules/state';

// Cap how much output we keep per background snippet — a `tail -f` or dev
// server can log forever; without a cap this would grow without bound for
// as long as the app stays open.
const MAX_BUFFER_CHARS = 200_000;

export const STATUS_LABEL: Record<ProcessStatusValue, string> = {
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

const STATUS_DOT_CLASS: Record<ProcessStatusValue, string> = {
  starting: 'running',
  running: 'running',
  restarting: 'running',
  exited: 'ok',
  stopped: '',
  idle: '',
  crashed: 'error',
  error: 'error',
  'restart-limit': 'error',
};

export function isRunningStatus(status: ProcessStatusValue | undefined): boolean {
  return status === 'starting' || status === 'running' || status === 'restarting';
}

interface RunningProcessEntry {
  status: ProcessStatusValue;
  outputBuffer: string;
  pid: number | null;
  _restarting?: boolean;
}

function ensureEntry(snippetId: string): RunningProcessEntry {
  const running = state.runningProcesses as Record<string, RunningProcessEntry>;
  if (!running[snippetId]) {
    running[snippetId] = { status: 'idle', outputBuffer: '', pid: null };
  }
  return running[snippetId];
}

function findCard(snippetId: string): HTMLElement | null {
  return document.querySelector(`.card[data-snippet-id="${snippetId}"]`);
}

/** Patches an already-rendered card's Start/Stop label, Restart's disabled state, and the output header/body to match state.runningProcesses[snippetId] — no full card rebuild. No-ops if the card isn't currently rendered (e.g. filtered out by search); state is still updated by the caller either way, so the next real render picks it up. Card.tsx calls this at build/every-render time for a background snippet, same as the original's cards.js did right after constructing the elements. */
export function syncCardBackgroundUI(card: HTMLElement | null, snippetId: string): void {
  if (!card) return;
  const entry = ensureEntry(snippetId);
  const running = isRunningStatus(entry.status);

  const startStopBtn = card.querySelector<HTMLButtonElement>('.bg-startstop-btn');
  if (startStopBtn) {
    startStopBtn.className = `btn btn-small ${running ? 'btn-danger' : 'btn-primary'} bg-startstop-btn`;
    startStopBtn.innerHTML = running ? `${iconSvg('stop')}<span>Stop</span>` : `${iconSvg('play')}<span>Start</span>`;
  }
  const restartBtn = card.querySelector<HTMLButtonElement>('.bg-restart-btn');
  if (restartBtn) restartBtn.disabled = !running;

  const output = card.querySelector<HTMLElement>('.card-output');
  if (!output) return;
  const statusDot = output.querySelector<HTMLElement>('.status-dot');
  const statusText = output.querySelector<HTMLElement>('.status-text');
  if (statusDot) statusDot.className = `status-dot ${STATUS_DOT_CLASS[entry.status] || ''}`;
  if (statusText) statusText.textContent = STATUS_LABEL[entry.status] || entry.status;

  if (entry.status !== 'idle' || entry.outputBuffer) {
    output.hidden = false;
    const body = output.querySelector<HTMLElement>('.card-output-body');
    if (body && body.textContent !== entry.outputBuffer) {
      body.textContent = entry.outputBuffer;
      body.scrollTop = body.scrollHeight;
    }
    (card as unknown as { _lastOutputText?: string })._lastOutputText = entry.outputBuffer;
    const copyBtn = output.querySelector<HTMLButtonElement>('.copy-output-btn');
    if (copyBtn) copyBtn.hidden = !entry.outputBuffer;
  }
}

function onProcessOutput({ snippetId, chunk }: ProcessOutputEvent): void {
  const entry = ensureEntry(snippetId);
  entry.outputBuffer = (entry.outputBuffer + chunk).slice(-MAX_BUFFER_CHARS);

  const card = findCard(snippetId);
  const body = card?.querySelector<HTMLElement>('.card-output-body');
  if (body && card) {
    body.textContent += chunk;
    body.scrollTop = body.scrollHeight;
    (card as unknown as { _lastOutputText?: string })._lastOutputText = entry.outputBuffer;
    const copyBtn = card.querySelector<HTMLButtonElement>('.copy-output-btn');
    if (copyBtn) copyBtn.hidden = false;
  }
}

function onProcessStatus(data: ProcessStatusEvent): void {
  const { snippetId, status } = data;
  const entry = ensureEntry(snippetId);
  entry.status = status;
  if ('pid' in data) entry.pid = data.pid ?? null;
  // A fresh Start (not a crash-triggered auto-restart) clears the old
  // output — otherwise a second run would look like it's continuing the
  // first one's log instead of starting clean.
  if (status === 'starting' && !entry._restarting) entry.outputBuffer = '';
  entry._restarting = status === 'restarting';

  syncCardBackgroundUI(findCard(snippetId), snippetId);

  const snippet = (state.snippets as Snippet[]).find((s) => s.id === snippetId);
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
      maybeNotify(name, data.message || '');
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
export async function bootstrapRunningProcesses(): Promise<void> {
  const list = await window.electronAPI.listProcesses();
  list.forEach(({ snippetId, status, pid }) => {
    const entry = ensureEntry(snippetId);
    entry.status = status;
    entry.pid = pid;
  });
}

async function doStart(snippet: Snippet, command: string): Promise<void> {
  const entry = ensureEntry(snippet.id);
  entry.status = 'starting';
  entry.outputBuffer = '';
  syncCardBackgroundUI(findCard(snippet.id), snippet.id);
  const res = await window.electronAPI.startProcess({
    snippetId: snippet.id,
    command,
    cwd: snippet.cwd,
    shell: snippet.shell,
    env: snippet.env,
    autoRestart: snippet.autoRestart,
  });
  if (!res.ok) {
    entry.status = 'error';
    syncCardBackgroundUI(findCard(snippet.id), snippet.id);
    showToast(res.error || 'Could not start the process', 'error');
  }
}

/** Starts `snippet` as a background process. Returns the placeholder names still needing values if any — Card.tsx opens the same inline param form the normal Run button uses, then calls startBackgroundWithValues once filled in — rather than starting it here itself. */
export function startBackground(snippet: Snippet): string[] {
  const names = extractPlaceholders(runnableTextOf(snippet));
  if (names.length > 0) return names;
  void doStart(snippet, snippet.command);
  return [];
}

export function startBackgroundWithValues(snippet: Snippet, values: Record<string, string>): void {
  void syncVariablesFromValues(values);
  void doStart(snippet, substituteAll(snippet.command, values));
}

export async function stopBackground(snippet: Snippet): Promise<void> {
  const res = await window.electronAPI.stopProcess(snippet.id);
  if (!res.ok) showToast(res.error || 'Could not stop the process', 'error');
}

export async function restartBackground(snippet: Snippet): Promise<void> {
  const res = await window.electronAPI.restartProcess(snippet.id);
  if (!res.ok) showToast(res.error || 'Could not restart the process', 'error');
}
