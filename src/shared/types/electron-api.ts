// The full contract exposed by src/preload/index.js's
// contextBridge.exposeInMainWorld('electronAPI', {...}) — one property per
// ipcMain handler in src/main/ipc.js. This interface is the thing to check
// both sides against: in Phase 4, preload's own exposeInMainWorld argument
// should be written `satisfies ElectronAPI` so drift between the two is a
// type error, not a silent runtime mismatch.
//
// 31 invoke-based (Promise-returning) methods, 2 fire-and-forget `send`
// methods (hideWindow/showWindow), and 5 subscribe-style event listeners
// (onOpenHistoryRequest, onWindowShown, onUpdateStatus, onProcessOutput,
// onProcessStatus) — each returns an unsubscribe function.
import type { Snippet } from './snippet';
import type { Variable } from './variable';
import type { Group } from './group';
import type { Pipeline } from './pipeline';
import type { HistoryEntry } from './history';
import type {
  RunCommandPayload,
  RunResult,
  RunSequencePayload,
  SequenceResult,
  OpenTerminalPayload,
  OkResult,
} from './run';
import type { StartProcessPayload, ProcessSnapshot, ProcessOutputEvent, ProcessStatusEvent } from './process';
import type {
  HotkeyInfo,
  SetHotkeyResult,
  BackupInfo,
  ExportResult,
  ImportSnippetsResult,
  RestoreBackupResult,
  UpdateStatusEvent,
} from './misc';

// A subscribe-style method's return value: call it to unsubscribe.
type Unsubscribe = () => void;

export interface ElectronAPI {
  runCommand(payload: RunCommandPayload): Promise<RunResult>;
  runSequence(payload: RunSequencePayload): Promise<SequenceResult>;
  openTerminal(payload: OpenTerminalPayload): Promise<OkResult>;
  copyText(text: string): Promise<true>;

  loadSnippets(): Promise<Snippet[]>;
  saveSnippets(snippets: Snippet[]): Promise<Snippet[]>;

  getHistory(): Promise<HistoryEntry[]>;
  clearHistory(): Promise<HistoryEntry[]>;

  exportSnippets(): Promise<ExportResult>;
  importSnippets(): Promise<ImportSnippetsResult>;

  getLaunchOnStartup(): Promise<boolean>;
  setLaunchOnStartup(enabled: boolean): Promise<boolean>;

  getHotkey(): Promise<HotkeyInfo>;
  setHotkey(accelerator: string): Promise<SetHotkeyResult>;

  getVariables(): Promise<Variable[]>;
  saveVariables(vars: Variable[]): Promise<Variable[]>;

  getGroups(): Promise<Group[]>;
  saveGroups(groups: Group[]): Promise<Group[]>;

  getPipelines(): Promise<Pipeline[]>;
  savePipelines(pipelines: Pipeline[]): Promise<Pipeline[]>;

  openPath(targetPath: string): Promise<OkResult>;

  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(fileName: string): Promise<RestoreBackupResult>;

  hideWindow(): void;
  showWindow(): void;

  onOpenHistoryRequest(callback: () => void): Unsubscribe;
  onWindowShown(callback: () => void): Unsubscribe;

  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): Promise<void>;
  onUpdateStatus(callback: (status: UpdateStatusEvent) => void): Unsubscribe;

  startProcess(payload: StartProcessPayload): Promise<OkResult>;
  stopProcess(snippetId: string): Promise<OkResult>;
  restartProcess(snippetId: string): Promise<OkResult>;
  listProcesses(): Promise<ProcessSnapshot[]>;
  onProcessOutput(callback: (data: ProcessOutputEvent) => void): Unsubscribe;
  onProcessStatus(callback: (data: ProcessStatusEvent) => void): Unsubscribe;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
