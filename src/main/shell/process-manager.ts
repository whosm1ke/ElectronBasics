// shell/process-manager.ts — long-running "background process" snippets:
// dev servers, `docker compose up`, `tail -f`, watchers. Unlike exec.ts's
// runShellCommand (execFile, waits for the process to finish and hands back
// the full stdout/stderr at the end), this spawns a child and keeps it
// alive, streaming output chunks to the renderer as they happen, until the
// user explicitly stops it or the whole app quits. Reuses exec.ts's
// buildInvocation() for the same per-shell argv rules rather than
// re-deriving them here.
//
// Registry is keyed by snippetId, not a separately-minted process id — this
// app's model is "a background snippet has at most one live instance at a
// time" (Start is disabled/becomes Stop once running), which keeps the
// renderer's bookkeeping a plain `snippetId -> status` map instead of an
// extra layer of ids to track. Nothing here is persisted to disk — a
// process's liveness lives only in this module's memory for as long as the
// main process itself is alive; quitting the app stops every one of them
// (see stopAll(), wired into index.ts's quit handlers), and there's no
// "was running before a crash" recovery. That's a deliberate scope
// boundary, not an oversight.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { buildInvocation } from './exec';
import { getMainWindow } from '../window';
import type { ShellType, ProcessStatusValue, ProcessSnapshot, OkResult } from '@shared/types';

const MAX_AUTO_RESTARTS = 5;
const AUTO_RESTART_DELAY_MS = 2000;
// A process that's stayed up this long "earned back" its restart budget —
// otherwise one flaky process that crashes once a week would eventually
// permanently exhaust MAX_AUTO_RESTARTS and never be retried again.
const HEALTHY_RESET_MS = 60_000;

interface ProcessRecord {
  snippetId: string;
  child: ChildProcess | null;
  pid: number | null;
  status: ProcessStatusValue;
  manualStop: boolean;
  restartCount: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  healthyTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number | null;
  options: {
    command: string;
    cwd?: string | null;
    shellType: ShellType;
    env: Record<string, string> | null;
    autoRestart: boolean;
  };
}

const processes = new Map<string, ProcessRecord>();

function send(channel: string, payload: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * A plain `child.kill()` only signals the direct child — on Windows that's
 * very often a shell (cmd.exe/powershell.exe) with the actual long-running
 * work (node, docker, ngrok…) running as *its* child, which would be
 * orphaned and keep running invisibly. `taskkill /T` walks and kills the
 * whole process tree instead, which is what "Stop" actually needs to mean.
 */
function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
  });
}

function clearTimers(record: ProcessRecord): void {
  if (record.restartTimer) {
    clearTimeout(record.restartTimer);
    record.restartTimer = null;
  }
  if (record.healthyTimer) {
    clearTimeout(record.healthyTimer);
    record.healthyTimer = null;
  }
}

function spawnChild(record: ProcessRecord): void {
  const { command, cwd, shellType, env } = record.options;
  const { candidates, args } = buildInvocation(command, shellType);
  const snippetId = record.snippetId;

  let i = 0;
  const tryNext = (): void => {
    if (i >= candidates.length) {
      record.status = 'error';
      send('process-status', {
        snippetId,
        status: 'error',
        message: `Could not find a "${shellType}" executable. Tried: ${candidates.join(', ')}`,
      });
      return;
    }
    const file = candidates[i++];
    let child: ChildProcess;
    try {
      child = spawn(file, args, { cwd: cwd || undefined, env: env ?? undefined, windowsHide: true });
    } catch (err) {
      record.status = 'error';
      send('process-status', { snippetId, status: 'error', message: String((err as Error).message || err) });
      return;
    }
    record.child = child;

    let startedOk = false;
    child.on('spawn', () => {
      startedOk = true;
      record.status = 'running';
      record.pid = child.pid ?? null;
      record.startedAt = Date.now();
      send('process-status', { snippetId, status: 'running', pid: child.pid });
      record.healthyTimer = setTimeout(() => {
        record.restartCount = 0;
      }, HEALTHY_RESET_MS);
    });
    child.stdout?.on('data', (chunk: Buffer) => send('process-output', { snippetId, stream: 'stdout', chunk: chunk.toString('utf8') }));
    child.stderr?.on('data', (chunk: Buffer) => send('process-output', { snippetId, stream: 'stderr', chunk: chunk.toString('utf8') }));
    child.on('error', (err) => {
      if (!startedOk && (err as NodeJS.ErrnoException).code === 'ENOENT' && i < candidates.length) {
        tryNext();
        return;
      }
      record.status = 'error';
      send('process-status', { snippetId, status: 'error', message: String((err as Error).message || err) });
    });
    child.on('exit', (code, signal) => {
      record.child = null;
      record.pid = null;
      clearTimers(record);
      const manualStop = record.manualStop;
      record.status = manualStop ? 'stopped' : code === 0 ? 'exited' : 'crashed';
      send('process-status', { snippetId, status: record.status, code, signal });

      if (!manualStop && record.status === 'crashed' && record.options.autoRestart) {
        if (record.restartCount < MAX_AUTO_RESTARTS) {
          record.restartCount += 1;
          send('process-status', { snippetId, status: 'restarting', attempt: record.restartCount, max: MAX_AUTO_RESTARTS });
          record.restartTimer = setTimeout(() => {
            if (processes.get(snippetId) === record && !record.manualStop) spawnChild(record);
          }, AUTO_RESTART_DELAY_MS);
        } else {
          send('process-status', {
            snippetId,
            status: 'restart-limit',
            message: `Gave up after ${MAX_AUTO_RESTARTS} automatic restarts.`,
          });
        }
      }
    });
  };
  tryNext();
}

export interface StartProcessOptions {
  snippetId: string;
  command: string;
  cwd?: string | null;
  shellType: ShellType;
  env: Record<string, string> | null;
  autoRestart?: boolean;
}

/**
 * Starts a background process for `snippetId`. Refuses if one's already
 * live for this snippet — the renderer shouldn't offer Start while Stop is
 * showing, but this is the backstop against a stray double-click race.
 */
export function startProcess({ snippetId, command, cwd, shellType, env, autoRestart }: StartProcessOptions): OkResult {
  const existing = processes.get(snippetId);
  if (existing && existing.child) return { ok: false, error: 'Already running.' };

  const record: ProcessRecord = {
    snippetId,
    child: null,
    pid: null,
    status: 'starting',
    manualStop: false,
    restartCount: 0,
    restartTimer: null,
    healthyTimer: null,
    startedAt: null,
    options: { command, cwd, shellType, env: env ?? null, autoRestart: Boolean(autoRestart) },
  };
  processes.set(snippetId, record);
  send('process-status', { snippetId, status: 'starting' });
  spawnChild(record);
  return { ok: true };
}

export async function stopProcess(snippetId: string): Promise<OkResult> {
  const record = processes.get(snippetId);
  if (!record) return { ok: false, error: 'Not running.' };
  record.manualStop = true;
  clearTimers(record);
  if (record.child && record.pid) await killTree(record.pid);
  processes.delete(snippetId);
  return { ok: true };
}

/** Kills the current instance (if any) and starts a fresh one with the same options, resetting the auto-restart budget. */
export async function restartProcess(snippetId: string): Promise<OkResult> {
  const record = processes.get(snippetId);
  if (!record) return { ok: false, error: 'Not running — use Start.' };
  clearTimers(record);
  record.manualStop = true; // suppresses the exiting child's own auto-restart race
  if (record.child && record.pid) await killTree(record.pid);
  record.manualStop = false;
  record.restartCount = 0;
  record.status = 'starting';
  send('process-status', { snippetId, status: 'starting' });
  spawnChild(record);
  return { ok: true };
}

/** Snapshot of every live/starting process — used by the renderer at boot (or after a renderer crash/reload) to reconcile UI state with what's actually still running in this main process. */
export function listProcesses(): ProcessSnapshot[] {
  return Array.from(processes.values())
    .filter((r) => r.status !== 'stopped')
    .map((r) => ({ snippetId: r.snippetId, status: r.status, pid: r.pid }));
}

/** Stops every live process — called on app quit (see index.ts) so nothing is orphaned when the app actually exits (as opposed to just being hidden, which leaves them running on purpose). */
export function stopAll(): Promise<OkResult[]> {
  return Promise.all(Array.from(processes.keys()).map((id) => stopProcess(id)));
}
