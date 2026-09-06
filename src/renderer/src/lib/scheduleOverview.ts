// scheduleOverview.ts — pure "when does this schedule next fire?" math for
// the Schedule overview screen (ScheduleModal.tsx). `croner` (already a
// dependency of the main process's own scheduler.ts) is pure date math with
// no Node-specific APIs, so it works unmodified in the renderer bundle too
// — no IPC round trip needed just to answer "when's the next cron tick".
import { Cron } from 'croner';
import type { Snippet, ScheduleConfig } from '@shared/types';

/** Mirrors the main process's own 30s tick (scheduler.ts) — interval/daily due-checks below assume the schedule is actually evaluated this often. */
const SCHEDULE_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Returns the next Date this schedule is expected to fire, or null if it's
 * disabled or malformed. Not exact to the second for interval/daily (the
 * real scheduler only checks every 30s), but that's the right precision to
 * show here — "in ~4h", not a false-precision timestamp.
 */
export function computeNextRun(schedule: ScheduleConfig | null): Date | null {
  if (!schedule || !schedule.enabled) return null;
  const now = new Date();

  if (schedule.type === 'interval') {
    const intervalMs = schedule.intervalMinutes * 60000;
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
    if (!last) return now; // never run — due on the next scheduler tick
    const due = new Date(last.getTime() + intervalMs);
    return due < now ? now : due;
  }

  if (schedule.type === 'daily') {
    const [h, m] = schedule.dailyTime.split(':').map(Number);
    const todaySlot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
    const alreadyRanToday = last !== null && last >= todaySlot;
    if (now < todaySlot && !alreadyRanToday) return todaySlot;
    return new Date(todaySlot.getTime() + 24 * 60 * 60 * 1000); // tomorrow's slot
  }

  if (schedule.type === 'cron') {
    try {
      const job = new Cron(schedule.cronExpr, { paused: true });
      const next = job.nextRun();
      job.stop();
      return next;
    } catch {
      return null; // malformed expression — surfaced as "—" rather than a thrown error
    }
  }

  return null;
}

export function scheduleDescription(schedule: ScheduleConfig): string {
  if (schedule.type === 'interval') return `every ${schedule.intervalMinutes} minute${schedule.intervalMinutes === 1 ? '' : 's'}`;
  if (schedule.type === 'daily') return `daily at ${schedule.dailyTime}`;
  return `cron "${schedule.cronExpr}"`;
}

export interface ScheduledSnippetRow {
  snippet: Snippet;
  nextRun: Date | null;
}

/** Every enabled-schedule snippet, soonest-due first (nulls — a malformed cron — sink to the bottom rather than sorting as "overdue"). */
export function scheduledSnippetRows(snippets: Snippet[]): ScheduledSnippetRow[] {
  return snippets
    .filter((s) => s.schedule?.enabled)
    .map((snippet) => ({ snippet, nextRun: computeNextRun(snippet.schedule) }))
    .sort((a, b) => {
      if (!a.nextRun && !b.nextRun) return 0;
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return a.nextRun.getTime() - b.nextRun.getTime();
    });
}

void SCHEDULE_CHECK_INTERVAL_MS; // documents the precision assumption above; not otherwise referenced
