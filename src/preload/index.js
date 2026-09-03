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
});
