// One run-history log entry, as appended by ipc.js's run-command/
// run-sequence handlers (src/main/storage/history.js just stores whatever
// shape is handed to appendHistory — this is that shape, not a separately
// sanitized one). Newest-first, capped at MAX_HISTORY (100) entries on disk.
export interface HistoryEntry {
  id: string;
  snippetId: string | null;
  snippetName: string;
  command: string; // multi-step: steps joined with '\n'
  exitCode: number;
  startedAt: string; // ISO timestamp
  durationMs: number;
  stdoutPreview: string; // truncated to 4000 chars (combined across steps for a sequence)
  stderrPreview: string; // truncated to 2000 chars
}
