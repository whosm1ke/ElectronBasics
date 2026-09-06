// shell/history-import.ts — backs the "Import from terminal history" screen:
// reads whatever real shell history already exists on this machine
// (PowerShell's PSReadLine log, Git Bash's .bash_history) so the user can
// turn commands they already typed by hand into a saved, reusable snippet
// instead of retyping them into the editor from memory.
//
// Read-only, best-effort — a missing file (the user never ran that shell,
// or history logging is off) is simply absent from the result, not an
// error; this app has no business creating or enabling shell history files
// it doesn't already find.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { HistorySource } from '@shared/types';

const MAX_LINES_PER_SOURCE = 300;

function readLinesSafe(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    console.error(`Failed to read shell history at ${filePath}:`, err);
    return [];
  }
}

/** Newest-first, deduplicated (keeping the most recent occurrence's position), capped. */
function dedupeNewestFirst(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = lines.length - 1; i >= 0 && result.length < MAX_LINES_PER_SOURCE; i--) {
    const line = lines[i];
    if (seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

export function readShellHistorySources(): HistorySource[] {
  const sources: HistorySource[] = [];

  // PowerShell's PSReadLine module logs every line typed into an
  // interactive session here, independent of any per-process history.
  const psHistoryPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt');
  const psLines = dedupeNewestFirst(readLinesSafe(psHistoryPath));
  if (psLines.length > 0) sources.push({ shell: 'powershell', label: 'PowerShell', lines: psLines });

  // Git Bash on Windows is msys2 with its $HOME at the Windows user profile
  // by default — the same place os.homedir() resolves to.
  const bashHistoryPath = path.join(os.homedir(), '.bash_history');
  const bashLines = dedupeNewestFirst(readLinesSafe(bashHistoryPath));
  if (bashLines.length > 0) sources.push({ shell: 'gitbash', label: 'Git Bash', lines: bashLines });

  return sources;
}
