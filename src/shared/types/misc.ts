// Small IPC result shapes that don't warrant their own file.

export interface HotkeyInfo {
  saved: string; // persisted preference (app-settings.json)
  active: string | null; // currently registered accelerator, or null if none is
}

export interface SetHotkeyResult {
  ok: boolean;
  active: string | null;
  error?: string;
}

export interface BackupInfo {
  fileName: string; // "snippets-<ISO timestamp with : and . replaced by ->.json"
  mtime: number; // ms epoch
}

export interface ExportResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

export interface ImportFailureResult {
  ok: false;
  error?: string;
}

// import-snippets's success payload is a distinct shape carrying the merged
// list — kept as its own type (rather than one ImportResult with optional
// fields) so `ok` is a real discriminant: TS can narrow
// ImportSnippetsResult by `if (res.ok)` and get `snippets`/`importedCount`
// without a cast.
export interface ImportSuccessResult {
  ok: true;
  snippets: import('./snippet').Snippet[];
  importedCount: number;
}

export type ImportSnippetsResult = ImportFailureResult | ImportSuccessResult;

export interface RestoreBackupResult {
  ok: boolean;
  snippets?: import('./snippet').Snippet[];
  error?: string;
}

// update-status event payload — which extra fields are present depends on
// `status` (version on 'available'/'downloaded', percent on 'downloading',
// message on 'error'/'unsupported') — see src/main/updater.js's send().
// 'idle' is never sent by main — it's the renderer's own initial/default
// value before any real check has happened (see useSettingsStore.ts).
export type UpdateStatusValue =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface UpdateStatusEvent {
  status: UpdateStatusValue;
  version?: string;
  percent?: number;
  message?: string;
}
