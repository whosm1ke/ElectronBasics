// storage/backups.ts — rotating snapshots of snippets.json, taken
// automatically (and throttled) right before every write. `restoreBackup`
// takes the caller's `writeSnippets` function as a parameter rather than
// requiring storage/snippets.ts directly, since that module calls back into
// this one (backupSnippetsIfDue) — this keeps the two decoupled instead of
// forming a circular require.
import fs from 'node:fs';
import path from 'node:path';
import { SNIPPETS_FILE, BACKUPS_DIR } from '../paths';
import { stripBom } from '../json-file';
import type { BackupInfo, Snippet } from '@shared/types';

const MAX_BACKUPS = 10;
const BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000; // don't snapshot more than once per 5 minutes

export function listBackups(): BackupInfo[] {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => /^snippets-[\w.-]+\.json$/.test(f))
      .map((f) => ({ fileName: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch (err) {
    console.error('Failed to list backups:', err);
    return [];
  }
}

function pruneBackups(): void {
  const files = listBackups();
  files.slice(MAX_BACKUPS).forEach(({ fileName }) => {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, fileName));
    } catch (err) {
      console.error(err);
    }
  });
}

export function backupSnippetsIfDue(): void {
  try {
    if (!fs.existsSync(SNIPPETS_FILE)) return;
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const existing = listBackups();
    if (existing.length > 0 && Date.now() - existing[0].mtime < BACKUP_MIN_INTERVAL_MS) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(SNIPPETS_FILE, path.join(BACKUPS_DIR, `snippets-${stamp}.json`));
    pruneBackups();
  } catch (err) {
    console.error('Failed to write snippet backup:', err);
  }
}

/** Restores snippets.json from a backup file (basename-only, path-traversal safe). */
export function restoreBackup(fileName: string, writeSnippetsFn: (snippets: unknown) => Snippet[]): Snippet[] {
  const base = path.basename(String(fileName || ''));
  if (!/^snippets-[\w.-]+\.json$/.test(base)) {
    throw new Error('Invalid backup file name.');
  }
  const fullPath = path.join(BACKUPS_DIR, base);
  if (!fs.existsSync(fullPath)) throw new Error('Backup not found.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(fs.readFileSync(fullPath, 'utf8')));
  } catch (err) {
    throw new Error(`Backup file is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Backup file is not a valid snippet list.');
  return writeSnippetsFn(parsed); // itself snapshots the pre-restore state first
}
