// preload.js — Runs in an isolated context with access to Node/Electron APIs.
// Exposes a narrow, explicit surface to the renderer via contextBridge.
// The renderer NEVER gets nodeIntegration or a raw ipcRenderer reference.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Executes a command in the main process under one of several shells.
   * @param {{command: string, snippetId?: string, snippetName?: string, cwd?: string, shell?: 'powershell'|'cmd'|'gitbash'|'wsl'|'node'|'python', elevated?: boolean, env?: Array<{key:string,value:string}>, stdin?: string, debug?: boolean}} payload
   * @returns {Promise<{stdout: string, stderr: string, code: number, debugInfo?: object}>}
   */
  runCommand: (payload) => ipcRenderer.invoke('run-command', payload),

  /**
   * Executes a multi-step snippet sequentially in the main process.
   * @param {{steps: string[], snippetId?: string, snippetName?: string, cwd?: string, shell?: string, elevated?: boolean, env?: Array<{key:string,value:string}>}} payload
   */
  runSequence: (payload) => ipcRenderer.invoke('run-sequence', payload),

  /**
   * Opens a real, visible, interactive terminal window pre-loaded with the command.
   * @param {{command?: string, cwd?: string, shell?: string}} payload
   */
  openTerminal: (payload) => ipcRenderer.invoke('open-terminal', payload),

  /** Copies text to the system clipboard. */
  copyText: (text) => ipcRenderer.invoke('copy-text', text),

  /** Loads the persisted snippet list from disk. */
  loadSnippets: () => ipcRenderer.invoke('load-snippets'),

  /** Persists the full snippet list to disk (returns the sanitized copy). */
  saveSnippets: (snippets) => ipcRenderer.invoke('save-snippets', snippets),

  /** Loads the persisted run-history log (newest first). */
  getHistory: () => ipcRenderer.invoke('get-history'),

  /** Clears the run-history log. */
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  /** Opens a save dialog and writes the current snippets to a JSON file. */
  exportSnippets: () => ipcRenderer.invoke('export-snippets'),

  /** Opens a file dialog and merges snippets from a JSON file (new ids assigned). */
  importSnippets: () => ipcRenderer.invoke('import-snippets'),

  /** Reads whether the app is set to launch at Windows login. */
  getLaunchOnStartup: () => ipcRenderer.invoke('get-launch-on-startup'),

  /** Enables/disables launching the app at Windows login. */
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke('set-launch-on-startup', enabled),

  /** Reads the saved/active global hotkey accelerator string. */
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),

  /** Attempts to register a new global hotkey; returns {ok, active, error?}. */
  setHotkey: (accelerator) => ipcRenderer.invoke('set-hotkey', accelerator),

  /** Loads the reusable global variables (used to prefill {{placeholder}} forms). */
  getVariables: () => ipcRenderer.invoke('get-variables'),

  /** Persists the full variables list. */
  saveVariables: (vars) => ipcRenderer.invoke('save-variables', vars),

  /** Loads the saved snippet groups (named sets of snippet ids, run together on demand). */
  getGroups: () => ipcRenderer.invoke('get-groups'),

  /** Persists the full groups list. */
  saveGroups: (groups) => ipcRenderer.invoke('save-groups', groups),

  /** Loads the saved pipelines (small snippet graphs with branching conditions). */
  getPipelines: () => ipcRenderer.invoke('get-pipelines'),

  /** Persists the full pipelines list. */
  savePipelines: (pipelines) => ipcRenderer.invoke('save-pipelines', pipelines),

  /** Opens a filesystem path in the OS file explorer. */
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),

  /** Lists automatic snippet-library backups (newest first). */
  listBackups: () => ipcRenderer.invoke('list-backups'),

  /** Restores snippets.json from a named backup file. */
  restoreBackup: (fileName) => ipcRenderer.invoke('restore-backup', fileName),

  /** Hides the launcher window (does not quit the app). */
  hideWindow: () => ipcRenderer.send('hide-window'),

  /** Shows and focuses the launcher window (e.g. when a notification is clicked). */
  showWindow: () => ipcRenderer.send('show-window'),

  /** Subscribes to a request (from a clicked scheduled-run notification) to open the run history drawer. */
  onOpenHistoryRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('open-history-request', listener);
    return () => ipcRenderer.removeListener('open-history-request', listener);
  },

  /** Subscribes to the "window shown" event fired each time the window is toggled visible. */
  onWindowShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-shown', listener);
    return () => ipcRenderer.removeListener('window-shown', listener);
  },

  /** Reads the running app's version (package.json's `version`, as packaged). */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /** Asks the main process to check GitHub Releases for a newer version. No-ops (via an 'unsupported' update-status event) when running from source. Result arrives via onUpdateStatus, not this call's return value. */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  /** Downloads an update already reported 'available' via onUpdateStatus. */
  downloadUpdate: () => ipcRenderer.invoke('download-update'),

  /** Quits and installs an update already reported 'downloaded', then relaunches. */
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

  /** Subscribes to update-check/download/install progress: {status: 'checking'|'available'|'not-available'|'downloading'|'downloaded'|'error'|'unsupported', ...}. */
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  /**
   * Starts a snippet as a long-running background process (spawn, not
   * execFile+wait) — see shell/process-manager.js. Returns {ok, error?}
   * immediately; the actual status (running/crashed/exited/...) arrives via
   * onProcessStatus, and its live output via onProcessOutput.
   * @param {{snippetId: string, command: string, cwd?: string, shell?: string, env?: Array<{key:string,value:string}>, autoRestart?: boolean}} payload
   */
  startProcess: (payload) => ipcRenderer.invoke('start-process', payload),

  /** Stops the background process running for `snippetId` (kills its whole process tree, not just the direct child). */
  stopProcess: (snippetId) => ipcRenderer.invoke('stop-process', snippetId),

  /** Stops and re-starts the background process for `snippetId` with the same options, resetting its auto-restart budget. */
  restartProcess: (snippetId) => ipcRenderer.invoke('restart-process', snippetId),

  /** Lists every currently-live background process — used at renderer boot to reconcile UI state with what's actually still running in the main process (which survives a renderer-only reload). */
  listProcesses: () => ipcRenderer.invoke('list-processes'),

  /** Subscribes to background-process output chunks: {snippetId, stream: 'stdout'|'stderr', chunk}. */
  onProcessOutput: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('process-output', listener);
    return () => ipcRenderer.removeListener('process-output', listener);
  },

  /** Subscribes to background-process lifecycle changes: {snippetId, status: 'starting'|'running'|'stopped'|'exited'|'crashed'|'restarting'|'restart-limit'|'error', ...}. */
  onProcessStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('process-status', listener);
    return () => ipcRenderer.removeListener('process-status', listener);
  },
});
