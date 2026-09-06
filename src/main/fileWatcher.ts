// fileWatcher.ts — the optional file-watch triggers (Settings → Triggers):
// run a snippet whenever a saved path changes. One `fs.watch` per enabled
// trigger, keyed by the trigger's own id (not the path — two triggers could
// watch the same path with different snippets/debounce). `recursive: true`
// is supported on Windows, so a directory watch covers its whole subtree
// without walking it ourselves.
import fs from 'node:fs';
import { readWatchTriggers } from './storage/watchTriggers';
import { readSnippets } from './storage/snippets';
import { runUnattended } from './unattendedRun';
import type { WatchTrigger } from '@shared/types';

const watchers = new Map<string, fs.FSWatcher>();
const debounceTimers = new Map<string, NodeJS.Timeout>();

function stopOne(id: string): void {
  watchers.get(id)?.close();
  watchers.delete(id);
  const timer = debounceTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(id);
  }
}

function startOne(trigger: WatchTrigger): void {
  stopOne(trigger.id);
  if (!trigger.enabled || !trigger.path || !trigger.snippetId) return;
  try {
    const watcher = fs.watch(trigger.path, { recursive: true }, () => {
      // Coalesces a burst of change events (a save-triggered rebuild often
      // touches many files at once) into a single run, `debounceMs` after
      // the last one seen.
      const existing = debounceTimers.get(trigger.id);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        trigger.id,
        setTimeout(() => {
          debounceTimers.delete(trigger.id);
          const snippet = readSnippets().find((s) => s.id === trigger.snippetId);
          if (snippet) runUnattended(snippet, 'file-watch', true, trigger.paramValues).catch((err) => console.error('File-watch trigger run failed:', err));
        }, trigger.debounceMs)
      );
    });
    watcher.on('error', (err) => console.error(`File watcher for "${trigger.path}" failed:`, err));
    watchers.set(trigger.id, watcher);
  } catch (err) {
    console.error(`Could not watch "${trigger.path}":`, err);
  }
}

/** Re-reads the saved trigger list and reconciles live `fs.watch` instances against it — call this after every save, not just at startup. */
export function syncFileWatchers(): void {
  const triggers = readWatchTriggers();
  const keepIds = new Set(triggers.map((t) => t.id));
  for (const id of Array.from(watchers.keys())) {
    if (!keepIds.has(id)) stopOne(id);
  }
  triggers.forEach(startOne);
}

export function initFileWatchers(): void {
  syncFileWatchers();
}

export function stopAllFileWatchers(): void {
  Array.from(watchers.keys()).forEach(stopOne);
}
