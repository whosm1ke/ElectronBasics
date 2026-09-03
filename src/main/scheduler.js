// scheduler.js — runs snippets in the background on their configured
// schedule (interval / daily / cron). There is no "skip if dangerous" check
// here — a scheduled command runs exactly like a manually-run one; the user
// who enabled the schedule is trusted to know what they turned on.
'use strict';

const { Notification } = require('electron');
const { readSnippets, writeSnippets } = require('./storage/snippets');
const { appendHistory } = require('./storage/history');
const { runShellCommand } = require('./shell/exec');
const { envListToObject } = require('./env-utils');
const { newId } = require('./id');
const { showWindow, getMainWindow } = require('./window');

const SCHEDULE_CHECK_INTERVAL_MS = 30 * 1000;

function cronFieldMatches(fieldExpr, value, min, max) {
  if (fieldExpr === '*') return true;
  return fieldExpr.split(',').some((part) => {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr) || 1;
      const [start, end] = range === '*' ? [min, max] : range.split('-').map(Number);
      for (let v = start; v <= end; v += step) if (v === value) return true;
      return false;
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return value >= start && value <= end;
    }
    return Number(part) === value;
  });
}

/** Minimal 5-field cron matcher: minute hour day-of-month month day-of-week. */
function cronMatches(expr, date) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  try {
    return (
      cronFieldMatches(min, date.getMinutes(), 0, 59) &&
      cronFieldMatches(hour, date.getHours(), 0, 23) &&
      cronFieldMatches(dom, date.getDate(), 1, 31) &&
      cronFieldMatches(month, date.getMonth() + 1, 1, 12) &&
      cronFieldMatches(dow, date.getDay(), 0, 6)
    );
  } catch (err) {
    console.error(`Invalid cron expression "${expr}":`, err);
    return false;
  }
}

function isScheduleDue(schedule, now) {
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

function runnableTextOfSnippet(s) {
  return s.steps && s.steps.length ? s.steps.join('\n') : s.command;
}

async function runScheduledSnippet(snippet) {
  const startedAt = Date.now();
  const env = envListToObject(snippet.env);
  let result;
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

async function tickScheduler() {
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

function startScheduler() {
  setInterval(tickScheduler, SCHEDULE_CHECK_INTERVAL_MS);
}

module.exports = { startScheduler };
