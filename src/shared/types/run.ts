// Payload/result shapes for the run-command and run-sequence IPC channels
// (src/main/ipc.js), built on top of runShellCommand's result
// (src/main/shell/exec.js).
import type { EnvVar } from './snippet';
import type { ShellType } from './shell';

export interface RunCommandPayload {
  command: string;
  snippetId?: string | null;
  snippetName?: string;
  cwd?: string | null;
  shell?: ShellType;
  elevated?: boolean;
  env?: EnvVar[] | null;
  stdin?: string | null;
  debug?: boolean;
}

// Present only when `debug: true` was requested. The elevated path (which
// stitches stdout/stderr back out of temp files via the ELEVATED_MARKER
// sentinel) doesn't have a single literal argv to show, so it reports a
// fixed placeholder file/args pair instead of the real invocation.
export interface DebugInfo {
  file: string;
  args: string[];
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  debugInfo?: DebugInfo;
}

export interface RunSequencePayload {
  steps: string[];
  snippetId?: string | null;
  snippetName?: string;
  cwd?: string | null;
  shell?: ShellType;
  elevated?: boolean;
  env?: EnvVar[] | null;
  stopOnError?: boolean;
}

export interface SequenceStepResult extends RunResult {
  command: string;
}

export interface SequenceResult {
  steps: SequenceStepResult[];
  // 0 only if every step that ran succeeded; steps skipped after a
  // stopOnError break are simply absent from `steps`, not recorded here.
  overallCode: number;
}

export interface OpenTerminalPayload {
  command?: string;
  cwd?: string;
  shell?: ShellType;
}

export interface OkResult {
  ok: boolean;
  error?: string;
}
