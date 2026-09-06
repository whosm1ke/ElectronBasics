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
import { showWindow, getMainWindow } from './window';
import type { Snippet } from '@shared/types';

// A minimal main-process mirror of the renderer's PLACEHOLDER_RE
// (lib/utils.ts) — kept deliberately tiny rather than shared across the
// process boundary, since this is the only main-process caller that needs it.
const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;

export function runnableTextOfSnippet(s: Snippet): string {
  return s.steps && s.steps.length ? s.steps.join('\n') : s.command;
}

export function hasUnresolvedPlaceholder(s: Snippet): boolean {
  return PLACEHOLDER_RE.test(runnableTextOfSnippet(s));
}

interface UnattendedResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function execute(snippet: Snippet): Promise<UnattendedResult> {
  const env = envListToObject(snippet.env);
  if (snippet.steps && snippet.steps.length) {
    const results: UnattendedResult[] = [];
    for (const step of snippet.steps) {
      // eslint-disable-next-line no-await-in-loop
      const stepResult = await runShellCommand(step, { cwd: snippet.cwd, shell: snippet.shell, env });
      results.push(stepResult);
      if (snippet.stopOnStepError && stepResult.code !== 0) break;
    }
    return {
      code: results.every((r) => r.code === 0) ? 0 : 1,
      stdout: results.map((r, i) => `--- step ${i + 1} ---\n${r.stdout}`).join('\n'),
      stderr: results.map((r) => r.stderr).filter(Boolean).join('\n'),
    };
  }
  return runShellCommand(snippet.command, { cwd: snippet.cwd, shell: snippet.shell, env });
}

/**
 * Runs `snippet` unattended, appends it to history labeled with `label`
 * (e.g. "scheduled"/"triggered"), and — unless `notify: false` — fires a
 * native notification whose click reopens the launcher on run history.
 * Returns the exit code so a caller can shape a response around it.
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
export async function runUnattended(snippet: Snippet, label: string, notify = true): Promise<number> {
  const startedAt = Date.now();
  const result = await execute(snippet);

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

  return result.code;
}
