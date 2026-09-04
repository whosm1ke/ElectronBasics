// Background/long-running-process types — src/main/shell/process-manager.js.
// The registry is keyed by snippetId (at most one live instance per
// snippet), not a separately-minted process id.
import type { EnvVar } from './snippet';
import type { ShellType } from './shell';

// 'idle' is never sent by main — it's the renderer's own default for a
// snippetId with no recorded process yet (see processEngine.ts's
// ensureEntry).
export type ProcessStatusValue =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'exited'
  | 'crashed'
  | 'restarting'
  | 'restart-limit'
  | 'error';

export interface StartProcessPayload {
  snippetId: string;
  command: string;
  cwd?: string | null;
  shell?: ShellType;
  env?: EnvVar[] | null;
  autoRestart?: boolean;
}

// A snapshot row from list-processes — used at renderer boot to reconcile UI
// state with whatever's still actually running in the main process (which
// survives a renderer-only reload/crash).
export interface ProcessSnapshot {
  snippetId: string;
  status: ProcessStatusValue;
  pid: number | null;
}

// The process-status IPC event payload. Which extra fields are present
// depends on `status` (pid on 'running', code/signal on 'exited'/'crashed',
// attempt/max on 'restarting', message on 'error'/'restart-limit') — kept as
// optional fields on one shape rather than a discriminated union, matching
// how process-manager.js actually constructs each `send('process-status', ...)` call.
export interface ProcessStatusEvent {
  snippetId: string;
  status: ProcessStatusValue;
  pid?: number | null;
  code?: number | null;
  signal?: string | null;
  attempt?: number;
  max?: number;
  message?: string;
}

export interface ProcessOutputEvent {
  snippetId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}
