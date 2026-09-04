// The Snippet schema — mirrors sanitizeSnippet() in
// src/main/storage/snippets.js field-for-field, including its backfill
// defaults (documented per-field below where non-obvious). That function
// stays the runtime source of truth; this is its compile-time shape.
import type { ShellType } from './shell';

export interface EnvVar {
  key: string; // trimmed, <=100 chars, non-empty (sanitizeEnvList drops empty-key entries)
  value: string; // <=2000 chars
}

export interface ExpectConfig {
  exitCode: number | null;
  outputContains: string | null; // <=500 chars
}

export type ScheduleType = 'interval' | 'daily' | 'cron';

export interface ScheduleConfig {
  enabled: boolean;
  type: ScheduleType;
  intervalMinutes: number; // >=1
  dailyTime: string; // "HH:MM", validated by /^\d{2}:\d{2}$/
  cronExpr: string; // 5-field cron, <=100 chars
  lastRunAt: string | null; // ISO timestamp
}

export interface Snippet {
  id: string;
  name: string; // <=200 chars
  tag: string; // <=50 chars, default 'misc'
  command: string; // <=5000 chars — for multi-step snippets, steps joined for searchability
  pinned: boolean;
  runCount: number;
  lastRunAt: string | null; // ISO timestamp
  cwd: string | null; // <=1000 chars
  shell: ShellType;
  elevated: boolean; // PowerShell only — runShellCommand errors for every other shell
  steps: string[] | null; // each <=5000 chars, max 20 steps; null (not []) when empty
  stdin: string | null; // <=5000 chars — single-command only, sequences don't support stdin
  icon: string | null; // <=8 chars
  notes: string | null; // <=2000 chars
  env: EnvVar[] | null; // max 20 entries
  expect: ExpectConfig | null;
  runAfterThis: string | null; // id of the snippet THIS one runs after (chained snippet stores the pointer)
  runBefore: string | null; // id of a snippet to run first, every time this one runs
  stopOnStepError: boolean;
  schedule: ScheduleConfig | null;
  // `background` is forced false whenever `steps` is non-empty — a
  // long-running process is single-command only (see process-manager.js).
  background: boolean;
  autoRestart: boolean; // only meaningful when background is true
}
