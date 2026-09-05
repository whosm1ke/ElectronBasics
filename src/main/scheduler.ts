// scheduler.ts — runs snippets in the background on their configured
// schedule (interval / daily / cron). There is no "skip if dangerous" check
// here — a scheduled command runs exactly like a manually-run one; the user
// who enabled the schedule is trusted to know what they turned on.
import { Notification } from 'electron';
import { Cron } from 'croner';
import { readSnippets, writeSnippets } from './storage/snippets';
import { appendHistory } from './storage/history';
import { runShellCommand } from './shell/exec';
import { envListToObject } from './env-utils';
import { newId } from './id';
import { showWindow, getMainWindow } from './window';
import type { Snippet, ScheduleConfig } from '@shared/types';

const SCHEDULE_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Point-in-time cron match, delegated to `croner` — handles named months/
 * days and more expression forms than the previous hand-rolled 5-field
 * matcher did. `paused: true` stops the constructor from actually scheduling
 * anything (we only ever want a one-off `.match()` check); a malformed
 * expression throws in the constructor rather than returning false, so that
 * gets caught here to keep this function's own "never throws" contract.
 */
export function cronMatches(expr: string, date: Date): boolean {
  try {
    const job = new Cron(expr, { paused: true });
    const matched = job.match(date);
    job.stop();
    return matched;
  } catch (err) {
    console.error(`Invalid cron expression "${expr}":`, err);
    return false;
  }
}

export function isScheduleDue(schedule: ScheduleConfig | null, now: Date): boolean {
  if (!schedule || !schedule.enabled) return false;
  const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  if (schedule.type === 'interval') {
    const intervalMs = schedule.intervalMinutes * 60000;
    return !last || now.getTime() - last.getTime() >= intervalMs;
  }
  if (schedule.type === 'daily') {
    const [h, m] = schedule.dailyTime.split(':').map(Number);
    const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    if (now < scheduledToday) return false;
    if (last && last >= scheduledToday) return false; // already ran today's slot
    return true;
  }
  if (schedule.type === 'cron') {
    if (last && now.getTime() - last.getTime() < 55000) return false; // don't double-fire within the same minute
    return cronMatches(schedule.cronExpr, now);
  }
  return false;
}

function runnableTextOfSnippet(s: Snippet): string {
  return s.steps && s.steps.length ? s.steps.join('\n') : s.command;
}

async function runScheduledSnippet(snippet: Snippet): Promise<void> {
  const startedAt = Date.now();
  const env = envListToObject(snippet.env);
  let result: { code: number; stdout: string; stderr: string };
  if (snippet.steps && snippet.steps.length) {
    const results = [];
    for (const step of snippet.steps) {
      // eslint-disable-next-line no-await-in-loop
      const stepResult = await runShellCommand(step, { cwd: snippet.cwd, shell: snippet.shell, env });
      results.push(stepResult);
      if (snippet.stopOnStepError && stepResult.code !== 0) break;
    }
    result = {
      code: results.every((r) => r.code === 0) ? 0 : 1,
      stdout: results.map((r, i) => `--- step ${i + 1} ---\n${r.stdout}`).join('\n'),
      stderr: results.map((r) => r.stderr).filter(Boolean).join('\n'),
    };
  } else {
    result = await runShellCommand(snippet.command, { cwd: snippet.cwd, shell: snippet.shell, env });
  }

  appendHistory({
    id: newId('run'),
    snippetId: snippet.id,
    snippetName: `${snippet.name} (scheduled)`,
    command: runnableTextOfSnippet(snippet),
    exitCode: result.code,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPreview: result.stdout.slice(0, 4000),
    stderrPreview: result.stderr.slice(0, 2000),
  });

  try {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: `Scheduled: ${snippet.name}`,
        body: result.code === 0 ? 'Completed successfully.' : `Failed (exit code ${result.code}).`,
      });
      // Clicking a background notification should actually take you
      // somewhere — bring the launcher forward and ask it to open the run
      // history, so a failed scheduled run isn't a dead-end notification.
      notif.on('click', () => {
        showWindow();
        const win = getMainWindow();
        if (win) win.webContents.send('open-history-request');
      });
      notif.show();
    }
  } catch (err) {
    console.error('Failed to show scheduled-run notification:', err);
  }
}

export async function tickScheduler(): Promise<void> {
  try {
    const snippets = readSnippets();
    const now = new Date();
    let changed = false;
    for (const snippet of snippets) {
      if (!snippet.schedule || !snippet.schedule.enabled) continue;
      if (!isScheduleDue(snippet.schedule, now)) continue;
      // eslint-disable-next-line no-await-in-loop
      await runScheduledSnippet(snippet);
      snippet.schedule.lastRunAt = new Date().toISOString();
      snippet.lastRunAt = snippet.schedule.lastRunAt;
      snippet.runCount = (snippet.runCount || 0) + 1;
      changed = true;
    }
    if (changed) writeSnippets(snippets);
  } catch (err) {
    console.error('Scheduler tick failed:', err);
  }
}

export function startScheduler(): void {
  setInterval(tickScheduler, SCHEDULE_CHECK_INTERVAL_MS);
}
