// groupRunner.ts — the main process's UNATTENDED (scheduled) group runner:
// runs every member snippet in a Group with no one watching, on the Group's
// own `schedule` (scheduler.ts's tick). This is triggerServer.ts's
// `handleGroupRun()` twin for the scheduler boundary — same "run every
// member, aggregate the outcomes into one notification/history entry"
// shape, just triggered by a due schedule instead of an incoming HTTP
// request, and with `schedule.paramValues` (a single flat override dict) in
// place of a per-snippet-id JSON body.
import { Notification } from 'electron';
import { readSnippets, writeSnippets } from './storage/snippets';
import { appendHistory } from './storage/history';
import { runUnattended, runnableTextOfSnippet } from './unattendedRun';
import { newId } from '@shared/id';
import type { Group, Snippet } from '@shared/types';

/** Runs every member of `group` unattended, bumps each ran (not skipped) snippet's own runCount/lastRunAt plus the group's, logs ONE aggregate history entry (same "a multi-part run reads as a single unit" spirit as a multi-step snippet's own sequence-level entry, or a scheduled pipeline's own — see pipelineRunner.ts), and fires one aggregate notification summarizing ok/failed/skipped counts. */
export async function runScheduledGroup(group: Group): Promise<void> {
  const startedAt = Date.now();
  const snippets = readSnippets();
  const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));

  const results: { snippet: Snippet; ok: boolean; skipped: boolean }[] = [];
  for (const snippet of members) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await runUnattended(snippet, 'scheduled', false, group.schedule?.paramValues);
    if (!outcome.skipped) {
      snippet.runCount = (snippet.runCount || 0) + 1;
      snippet.lastRunAt = new Date().toISOString();
    }
    results.push({ snippet, ok: !outcome.skipped && outcome.exitCode === 0, skipped: outcome.skipped });
  }
  writeSnippets(snippets);

  const okCount = results.filter((r) => r.ok).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const failCount = results.length - okCount - skippedCount;

  appendHistory({
    id: newId('run'),
    snippetId: null,
    snippetName: `${group.name || '(untitled group)'} (scheduled group)`,
    command: members.map((s) => runnableTextOfSnippet(s)).join('\n---\n'),
    exitCode: failCount === 0 && skippedCount === 0 ? 0 : 1,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPreview: `${okCount} of ${results.length} snippet(s) ran successfully.`,
    stderrPreview: [failCount ? `${failCount} failed` : null, skippedCount ? `${skippedCount} skipped (missing values)` : null].filter(Boolean).join(', '),
  });

  try {
    if (Notification.isSupported()) {
      const parts = [`${okCount} ok`, failCount ? `${failCount} failed` : null, skippedCount ? `${skippedCount} skipped` : null].filter(Boolean);
      new Notification({ title: `Scheduled group: ${group.name || '(untitled group)'}`, body: parts.join(', ') + '.' }).show();
    }
  } catch (err) {
    console.error('Failed to show scheduled-group notification:', err);
  }
}
