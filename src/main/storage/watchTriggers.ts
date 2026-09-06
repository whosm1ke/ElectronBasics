// storage/watchTriggers.ts — saved "run this snippet whenever this path
// changes" rules ({id, path, snippetId, debounceMs, enabled}). Same
// ensure/read/write/sanitize shape every other storage module in this app
// follows — see storage/groups.ts for the template this copies.
import fs from 'node:fs';
import { WATCH_TRIGGERS_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { WatchTrigger } from '@shared/types';
import { WatchTriggerSchema } from '@shared/types';

export function sanitizeWatchTrigger(w: unknown): WatchTrigger {
  return WatchTriggerSchema.parse(w);
}

export function readWatchTriggers(): WatchTrigger[] {
  if (!fs.existsSync(WATCH_TRIGGERS_FILE)) return [];
  const parsed = readJsonFileSafe<WatchTrigger[]>(WATCH_TRIGGERS_FILE, [], Array.isArray);
  return parsed.map(sanitizeWatchTrigger);
}

export function writeWatchTriggers(triggers: unknown): WatchTrigger[] {
  const sanitized = Array.isArray(triggers) ? triggers.map(sanitizeWatchTrigger) : [];
  writeJsonFileAtomic(WATCH_TRIGGERS_FILE, sanitized);
  return sanitized;
}
