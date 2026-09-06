// unattendedRun.ts — runs a snippet to completion with no one watching:
// shared by scheduler.ts (a due schedule) and triggerServer.ts (an incoming
// webhook hit). Both contexts have the same constraints — nowhere to prompt
// for a `{{placeholder}}` value, and the result needs to land in history and
// (optionally) a native notification exactly like a manual run would. There
// is no "is this command dangerous" check here, same as everywhere else in
// this app — see CLAUDE.md.
import { Notification } from 'electron';
import { appendHistory } from './storage/history';
import { runShellCommand } from './shell/exec';
import { envListToObject } from './env-utils';
import { newId } from '@shared/id';
import { extractCaptures } from '@shared/captures';
import { showWindow, getMainWindow } from './window';
import { readVariables, writeVariables } from './storage/variables';
import type { Snippet, Variable, ParamValues } from '@shared/types';

// A minimal main-process mirror of the renderer's PLACEHOLDER_RE
// (lib/utils.ts) — kept deliberately tiny rather than shared across the
// process boundary, since this is the only main-process caller that needs it.
// The capturing group is what lets substituteWithVariables() below pull the
// placeholder's own name back out, the same way ParamForm.tsx's own prefill
// does on the renderer side.
const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;
const PLACEHOLDER_CAPTURE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function runnableTextOfSnippet(s: Snippet): string {
  return s.steps && s.steps.length ? s.steps.join('\n') : s.command;
}

export function hasUnresolvedPlaceholder(s: Snippet): boolean {
  return PLACEHOLDER_RE.test(runnableTextOfSnippet(s));
}

/**
 * Substitutes every `{{name}}` in `text`, preferring `overrides` (a
 * context's own fixed values — a schedule's or file-watch trigger's
 * `paramValues`, set once when configuring THAT context, never shared
 * outside it) over the matching global variable. A name with neither an
 * override nor a matching variable is left as-is and reported back in
 * `missing`, deduplicated.
 */
export function substituteWithVariables(text: string, variables: Variable[], overrides?: ParamValues): { resolved: string; missing: string[] } {
  const missing: string[] = [];
  const resolved = text.replace(PLACEHOLDER_CAPTURE_RE, (whole, name: string) => {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
    const v = variables.find((candidate) => candidate.name === name);
    if (!v) {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    return v.value;
  });
  return { resolved, missing };
}

/**
 * Every unattended path (scheduler, external/file-watch triggers, a
 * pipeline's own step nodes) needs the exact same answer to "can this
 * parameterized snippet run right now, with no one to ask?" — yes, if every
 * one of its `{{placeholder}}`s has a matching saved global variable (set
 * once in Settings → Manage variables, not re-typed per run); otherwise no.
 * Returns a shallow copy of `snippet` with `command`/`steps` substituted
 * (the original object is never mutated), plus any placeholder names that
 * had no matching variable — a non-empty `missing` means the returned
 * snippet is NOT safe to run as-is (its command/steps still contain the
 * literal `{{name}}` text for whatever couldn't be resolved).
 */
export function resolveSnippetForUnattended(snippet: Snippet, variables: Variable[], overrides?: ParamValues): { snippet: Snippet; missing: string[] } {
  const allMissing = new Set<string>();
  const command = substituteWithVariables(snippet.command, variables, overrides);
  command.missing.forEach((m) => allMissing.add(m));
  let steps: string[] | null = null;
  if (snippet.steps && snippet.steps.length) {
    steps = snippet.steps.map((step) => {
      const r = substituteWithVariables(step, variables, overrides);
      r.missing.forEach((m) => allMissing.add(m));
      return r.resolved;
    });
  }
  return { snippet: { ...snippet, command: command.resolved, steps }, missing: Array.from(allMissing) };
}

interface UnattendedResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `snippet` to completion (steps loop or single call) with no history/notification/capture side effects — exported so main/pipelineRunner.ts can run a 'step' pipeline node exactly the same way an unattended snippet runs, without duplicating the steps-loop logic. */
export async function executeSnippetOnce(snippet: Snippet): Promise<UnattendedResult> {
  const env = envListToObject(snippet.env);
  if (snippet.steps && snippet.steps.length) {
    const results: UnattendedResult[] = [];
    for (const step of snippet.steps) {
      // eslint-disable-next-line no-await-in-loop
      const stepResult = await runShellCommand(step, { cwd: snippet.cwd, shell: snippet.shell, env, ssh: snippet.ssh });
      results.push(stepResult);
      if (snippet.stopOnStepError && stepResult.code !== 0) break;
    }
    return {
      code: results.every((r) => r.code === 0) ? 0 : 1,
      stdout: results.map((r, i) => `--- step ${i + 1} ---\n${r.stdout}`).join('\n'),
      stderr: results.map((r) => r.stderr).filter(Boolean).join('\n'),
    };
  }
  return runShellCommand(snippet.command, { cwd: snippet.cwd, shell: snippet.shell, env, ssh: snippet.ssh });
}

/** Applies `snippet.captures` (if any) against this run's combined output, creating/updating global variables directly on disk — the main-process equivalent of runEngine.ts's own post-run capture step for a manual run. A captured value never touches a variable's `secret` flag either way (preserved on update, false on create). Exported so main/pipelineRunner.ts can apply the same rule to a pipeline's 'step' nodes. */
export function applyCaptures(snippet: Snippet, combinedText: string): void {
  const captured = extractCaptures(snippet.captures, combinedText);
  if (captured.length === 0) return;
  const variables = readVariables();
  for (const { name, value } of captured) {
    const existing = variables.find((v) => v.name === name);
    if (existing) existing.value = value;
    else variables.push({ id: newId('var'), name, value, secret: false, computed: null });
  }
  writeVariables(variables);
}

export interface UnattendedRunOutcome {
  exitCode: number;
  /** True when the run never actually happened because a `{{placeholder}}` had no matching global variable — `missingVariables` names which ones. */
  skipped: boolean;
  missingVariables: string[];
}

/**
 * Runs `snippet` unattended, appends it to history labeled with `label`
 * (e.g. "scheduled"/"triggered"), and — unless `notify: false` — fires a
 * native notification whose click reopens the launcher on run history.
 *
 * Every `{{placeholder}}` in the snippet is resolved against `paramValues`
 * first (the calling context's own fixed overrides — a schedule's or
 * file-watch trigger's `paramValues`, set once when configuring THAT
 * context) and then the saved global variables (`resolveSnippetForUnattended`
 * — set a value once in Settings → Manage variables, and it's available to
 * every unattended path, not just an interactive run's own inline form). A
 * name with neither means this run is skipped outright rather than sent to
 * the shell with the literal `{{name}}` text still in it — that used to be
 * exactly what happened here (nothing resolved anything before this
 * function's own `executeSnippetOnce()` call), which is why a scheduled or
 * file-watch-triggered run of a parameterized snippet always failed with a
 * shell-level syntax error instead of a clear "missing variable" message.
 *
 * Deliberately does NOT bump the snippet's own `lastRunAt`/`runCount` —
 * callers already hold (or are about to load) their own copy of the
 * snippets array to decide what's due/targeted, and updating those fields
 * here too, via a second independent readSnippets()/writeSnippets() pair,
 * would race the caller's own eventual write and silently lose whichever
 * one lands second (this bit a first version of this refactor: the
 * scheduler's own end-of-tick write clobbered the stats this function had
 * just persisted). Bump `lastRunAt`/`runCount` on the caller's own
 * already-loaded snippet object instead, and let the caller do the one
 * write for both that and anything else it's tracking (e.g. schedule.lastRunAt).
 */
export async function runUnattended(snippet: Snippet, label: string, notify = true, paramValues?: ParamValues): Promise<UnattendedRunOutcome> {
  const startedAt = Date.now();

  if (hasUnresolvedPlaceholder(snippet)) {
    const { snippet: resolved, missing } = resolveSnippetForUnattended(snippet, readVariables(), paramValues);
    if (missing.length > 0) {
      const message = `Skipped — missing value(s) for: ${missing.join(', ')}. Set a fixed value on this schedule/trigger, or a global variable with that name in Settings → Manage variables.`;
      appendHistory({
        id: newId('run'),
        snippetId: snippet.id,
        snippetName: `${snippet.name} (${label})`,
        command: runnableTextOfSnippet(snippet),
        exitCode: 1,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: 0,
        stdoutPreview: '',
        stderrPreview: message.slice(0, 2000),
      });
      if (notify) {
        try {
          if (Notification.isSupported()) new Notification({ title: `Skipped: ${snippet.name}`, body: message }).show();
        } catch (err) {
          console.error(`Failed to show ${label}-skip notification:`, err);
        }
      }
      return { exitCode: 1, skipped: true, missingVariables: missing };
    }
    snippet = resolved;
  }

  const result = await executeSnippetOnce(snippet);

  appendHistory({
    id: newId('run'),
    snippetId: snippet.id,
    snippetName: `${snippet.name} (${label})`,
    command: runnableTextOfSnippet(snippet),
    exitCode: result.code,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPreview: result.stdout.slice(0, 4000),
    stderrPreview: result.stderr.slice(0, 2000),
  });

  if (snippet.captures) applyCaptures(snippet, `${result.stdout}\n${result.stderr}`);

  if (notify) {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: `${label[0].toUpperCase()}${label.slice(1)}: ${snippet.name}`,
          body: result.code === 0 ? 'Completed successfully.' : `Failed (exit code ${result.code}).`,
        });
        notif.on('click', () => {
          showWindow();
          const win = getMainWindow();
          if (win) win.webContents.send('open-history-request');
        });
        notif.show();
      }
    } catch (err) {
      console.error(`Failed to show ${label}-run notification:`, err);
    }
  }

  return { exitCode: result.code, skipped: false, missingVariables: [] };
}
