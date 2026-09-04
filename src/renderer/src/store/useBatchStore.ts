// useBatchStore.ts — the shared "configure, then run a list of snippets
// with live per-row output" engine plus the batch modal's open/close
// state. Ported from modules/batch-runner.js. Used by BatchModal.tsx
// (select-mode flow, Card.tsx's group-header "Run all"), GroupsModal.tsx
// (running a saved group), and modules/pipeline-engine.js (not yet ported
// — still calls the row API below directly, same as it called
// batch-runner.js's DOM-handle functions before; see that file).
import { create } from 'zustand';
import type { Snippet, RunResult } from '@shared/types';
import { newId, prettyMaybeJson, runnableTextOf, extractPlaceholders } from '../lib/utils';
import { emitBatchModalClosed } from '../lib/events';
import { state as legacyState } from '../../modules/state';

export type RowStatus = 'pending' | 'running' | 'ok' | 'error' | 'skipped' | 'not-run';
export type BatchMode = 'sequential' | 'parallel';

export interface BatchRow {
  id: string;
  snippet: Snippet;
  status: RowStatus;
  output: string;
  bodyVisible: boolean;
}

interface BatchState {
  open: boolean;
  view: 'config' | 'results';
  order: Snippet[];
  mode: BatchMode;
  stopOnError: boolean;
  rows: BatchRow[];
  running: boolean;
}

const useStore = create<BatchState>(() => ({
  open: false,
  view: 'config',
  order: [],
  mode: 'sequential',
  stopOnError: false,
  rows: [],
  running: false,
}));

export function useBatchStore(): BatchState {
  return useStore();
}

export function showConfigView(): void {
  useStore.setState({ view: 'config' });
}
export function showResultsView(): void {
  useStore.setState({ view: 'results' });
}
export function closeBatchModal(): void {
  useStore.setState({ open: false });
  emitBatchModalClosed();
}
export function isBatchModalOpen(): boolean {
  return useStore.getState().open;
}

/** Seeds order/mode/stopOnError from `list` and opens the modal at the config step, ready for the shared "Run" button to start it. */
export function openBatchConfig(list: Snippet[]): void {
  useStore.setState({ order: list.slice(), mode: 'sequential', stopOnError: false, view: 'config', open: true });
}

/** Opens the modal straight to the live-results view (skips the order/mode config step) — used by pipeline-engine.js. */
export function openBatchResultsModal(): void {
  useStore.setState({ view: 'results', open: true });
}

export function setBatchMode(mode: BatchMode): void {
  useStore.setState({ mode });
}
export function setBatchStopOnError(stopOnError: boolean): void {
  useStore.setState({ stopOnError });
}
export function setBatchOrder(order: Snippet[]): void {
  useStore.setState({ order });
}

// --- Row API — also used directly by modules/pipeline-engine.js ---

export function resetRows(): void {
  useStore.setState({ rows: [], running: true });
}

export function addRow(snippet: Snippet): string {
  const id = newId('row');
  useStore.setState((s) => ({ rows: [...s.rows, { id, snippet, status: 'pending', output: '', bodyVisible: false }] }));
  return id;
}

function updateRow(id: string, patch: Partial<BatchRow>): void {
  useStore.setState((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

export function setRowPending(id: string): void {
  updateRow(id, { status: 'pending' });
}
export function setRowRunning(id: string): void {
  updateRow(id, { status: 'running' });
}
/** Returns whether the run succeeded (exit code 0). */
export function setRowDone(id: string, result: RunResult): boolean {
  const success = result.code === 0;
  const text = prettyMaybeJson((result.stdout || '').trim()) || (result.stderr || '').trim() || '(no output)';
  updateRow(id, { status: success ? 'ok' : 'error', output: text, bodyVisible: true });
  return success;
}
export function setRowSkipped(id: string): void {
  updateRow(id, { status: 'skipped', output: 'Skipped — needs input (parameterized snippet).', bodyVisible: true });
}
export function setRowNotRun(id: string): void {
  updateRow(id, { status: 'not-run', output: 'Not run — an earlier snippet failed ("Stop if a snippet fails" is on).', bodyVisible: true });
}
export function toggleRowBody(id: string): void {
  useStore.setState((s) => ({ rows: s.rows.map((r) => (r.id === id && r.output.trim() ? { ...r, bodyVisible: !r.bodyVisible } : r)) }));
}
export function finishRun(): void {
  useStore.setState({ running: false });
}

export async function runOne(snippet: Snippet): Promise<RunResult> {
  if (snippet.steps && snippet.steps.length) {
    const result = await window.electronAPI.runSequence({
      steps: snippet.steps,
      snippetId: snippet.id,
      snippetName: snippet.name,
      cwd: snippet.cwd,
      shell: snippet.shell,
      elevated: snippet.elevated,
      env: snippet.env,
      stopOnError: Boolean(snippet.stopOnStepError),
    });
    return { code: result.overallCode, stdout: result.steps.map((s) => s.stdout).join('\n'), stderr: result.steps.map((s) => s.stderr).filter(Boolean).join('\n') };
  }
  return window.electronAPI.runCommand({
    command: snippet.command,
    snippetId: snippet.id,
    snippetName: snippet.name,
    cwd: snippet.cwd,
    shell: snippet.shell,
    elevated: snippet.elevated,
    env: snippet.env,
    stdin: snippet.stdin,
  });
}

/**
 * Runs `list` (sequential or parallel per `mode`), populating the store's
 * `rows` with one live row per snippet as it goes. Bumps each ran
 * snippet's runCount/lastRunAt on modules/state.js's state.snippets — the
 * caller is still responsible for persisting and re-rendering afterward.
 * `stopOnError` (sequential mode only) halts the run after the first
 * snippet failure, marking the rest "not run" instead of executing them.
 */
export async function runBatchList(
  list: Snippet[],
  mode: BatchMode,
  { stopOnError = false }: { stopOnError?: boolean } = {}
): Promise<{ total: number; ran: number; skipped: number; notRun: number }> {
  resetRows();

  const rows = list.map((snippet) => ({ snippet, id: addRow(snippet) }));

  const runnable = rows.filter(({ snippet }) => extractPlaceholders(runnableTextOf(snippet)).length === 0);
  rows.filter(({ snippet }) => extractPlaceholders(runnableTextOf(snippet)).length > 0).forEach(({ id }) => setRowSkipped(id));

  async function runAndMark({ snippet, id }: { snippet: Snippet; id: string }): Promise<boolean> {
    setRowRunning(id);
    const result = await runOne(snippet);
    const success = setRowDone(id, result);
    const snippets = legacyState.snippets as Snippet[];
    const target = snippets.find((x) => x.id === snippet.id);
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
        remaining.forEach(({ id }) => setRowNotRun(id));
        notRunCount = remaining.length;
        break;
      }
    }
  }

  finishRun();
  return { total: rows.length, ran: runnable.length - notRunCount, skipped: rows.length - runnable.length, notRun: notRunCount };
}
