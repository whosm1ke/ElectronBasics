// storage/history.ts — the run-history log (last MAX_HISTORY entries, newest first).
import fs from 'node:fs';
import { HISTORY_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { HistoryEntry } from '@shared/types';

const MAX_HISTORY = 100;

export function ensureHistoryFile(): void {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      writeJsonFileAtomic(HISTORY_FILE, []);
    }
  } catch (err) {
    console.error('Failed to initialize history file:', err);
  }
}

export function readHistory(): HistoryEntry[] {
  ensureHistoryFile();
  return readJsonFileSafe<HistoryEntry[]>(HISTORY_FILE, [], Array.isArray);
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  try {
    const history = readHistory();
    history.unshift(entry); // newest first
    const trimmed = history.slice(0, MAX_HISTORY);
    writeJsonFileAtomic(HISTORY_FILE, trimmed);
    return trimmed;
  } catch (err) {
    console.error('Failed to append history:', err);
    return readHistory();
  }
}

export function clearHistory(): HistoryEntry[] {
  writeJsonFileAtomic(HISTORY_FILE, []);
  return [];
}
