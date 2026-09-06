// scheduler.ts — runs snippets in the background on their configured
// schedule (interval / daily / cron). There is no "skip if dangerous" check
// here — a scheduled command runs exactly like a manually-run one; the user
// who enabled the schedule is trusted to know what they turned on.
import { Cron } from 'croner';
import { readSnippets, writeSnippets } from './storage/snippets';
import { runUnattended } from './unattendedRun';
import type { ScheduleConfig } from '@shared/types';

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

export async function tickScheduler(): Promise<void> {
  try {
    const snippets = readSnippets();
    const now = new Date();
    let changed = false;
    for (const snippet of snippets) {
      if (!snippet.schedule || !snippet.schedule.enabled) continue;
      if (!isScheduleDue(snippet.schedule, now)) continue;
      // eslint-disable-next-line no-await-in-loop
      await runUnattended(snippet, 'scheduled');
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
