// ipc.js — every ipcMain.handle/on registration. Pure wiring: each handler
// delegates to the relevant module (shell/exec, storage/*, hotkey, terminal)
// and shapes its response — no execution or persistence logic lives here.
'use strict';

const { ipcMain, clipboard, dialog, shell, app } = require('electron');
const fs = require('node:fs');

const { getMainWindow, hideWindow, showWindow } = require('./window');
const { registerHotkey, getCurrentHotkey } = require('./hotkey');
const { runShellCommand } = require('./shell/exec');
const { openTerminal } = require('./shell/terminal');
const processManager = require('./shell/process-manager');
const { envListToObject } = require('./env-utils');
const { newId } = require('./id');

const snippetsStore = require('./storage/snippets');
const historyStore = require('./storage/history');
const appSettingsStore = require('./storage/app-settings');
const variablesStore = require('./storage/variables');
const groupsStore = require('./storage/groups');
const pipelinesStore = require('./storage/pipelines');
const backupsStore = require('./storage/backups');
const updater = require('./updater');

function registerIpcHandlers() {
  ipcMain.handle('run-command', async (_event, payload) => {
    const {
      command, snippetId = null, snippetName = 'Untitled',
      cwd = null, shell: shellType = 'powershell', elevated = false,
      env = null, stdin = null, debug = false,
    } = payload && typeof payload === 'object' ? payload : { command: payload };

    const startedAt = Date.now();
    const result = await runShellCommand(command, {
      cwd, shell: shellType, elevated, env: envListToObject(env), stdin, debug,
    });
    const durationMs = Date.now() - startedAt;

    historyStore.appendHistory({
      id: newId('run'),
      snippetId,
      snippetName,
      command,
      exitCode: result.code,
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      stdoutPreview: result.stdout.slice(0, 4000),
      stderrPreview: result.stderr.slice(0, 2000),
    });

    return result;
  });

  ipcMain.handle('run-sequence', async (_event, payload) => {
    const {
      steps = [], snippetId = null, snippetName = 'Untitled',
      cwd = null, shell: shellType = 'powershell', elevated = false, env = null,
      stopOnError = false,
    } = payload && typeof payload === 'object' ? payload : {};

    const stepList = Array.isArray(steps) ? steps.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (stepList.length === 0) {
      return { steps: [], overallCode: 1 };
    }

    const startedAt = Date.now();
    const results = [];
    const envObj = envListToObject(env);
    for (const step of stepList) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runShellCommand(step, { cwd, shell: shellType, elevated, env: envObj });
      results.push({ command: step, ...result });
      if (stopOnError && result.code !== 0) break; // remaining steps are simply absent from `results`
    }
    const durationMs = Date.now() - startedAt;
    const overallCode = results.every((r) => r.code === 0) ? 0 : 1;

    historyStore.appendHistory({
      id: newId('run'),
      snippetId,
      snippetName,
      command: stepList.join('\n'),
      exitCode: overallCode,
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      stdoutPreview: results.map((r, i) => `--- step ${i + 1} ---\n${r.stdout}`).join('\n').slice(0, 4000),
      stderrPreview: results.map((r) => r.stderr).filter(Boolean).join('\n').slice(0, 2000),
    });

    return { steps: results, overallCode };
  });

  ipcMain.handle('open-terminal', async (_event, payload) => {
    return openTerminal(payload || {});
  });

  ipcMain.handle('start-process', async (_event, payload) => {
    const {
      snippetId, command, cwd = null, shell: shellType = 'powershell', env = null, autoRestart = false,
    } = payload || {};
    return processManager.startProcess({ snippetId, command, cwd, shellType, env: envListToObject(env), autoRestart });
  });

  ipcMain.handle('stop-process', async (_event, snippetId) => {
    return processManager.stopProcess(snippetId);
  });

  ipcMain.handle('restart-process', async (_event, snippetId) => {
    return processManager.restartProcess(snippetId);
  });

  ipcMain.handle('list-processes', async () => {
    return processManager.listProcesses();
  });

  ipcMain.handle('copy-text', async (_event, text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  ipcMain.handle('load-snippets', async () => {
    return snippetsStore.readSnippets();
  });

  ipcMain.handle('save-snippets', async (_event, snippets) => {
    return snippetsStore.writeSnippets(snippets);
  });

  ipcMain.handle('get-history', async () => {
    return historyStore.readHistory();
  });

  ipcMain.handle('clear-history', async () => {
    return historyStore.clearHistory();
  });

  ipcMain.handle('export-snippets', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export snippets',
      defaultPath: 'snippets-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      fs.writeFileSync(filePath, JSON.stringify(snippetsStore.readSnippets(), null, 2), 'utf8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('import-snippets', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Import snippets',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    try {
      const raw = fs.readFileSync(filePaths[0], 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { ok: false, error: 'File must contain an array of snippets.' };
      // Imported snippets always get fresh ids so they can never collide
      // with (or silently overwrite) existing ones — import is additive.
      const incoming = parsed.map((s) => snippetsStore.sanitizeSnippet({ ...s, id: newId('snip') }));
      const merged = snippetsStore.writeSnippets([...snippetsStore.readSnippets(), ...incoming]);
      return { ok: true, snippets: merged, importedCount: incoming.length };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('get-launch-on-startup', async () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-launch-on-startup', async (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('get-hotkey', async () => {
    const settings = appSettingsStore.readAppSettings();
    return { saved: settings.hotkey, active: getCurrentHotkey() };
  });

  ipcMain.handle('set-hotkey', async (_event, accelerator) => {
    if (typeof accelerator !== 'string' || !accelerator.trim()) {
      return { ok: false, error: 'Empty shortcut.' };
    }
    const ok = registerHotkey(accelerator);
    if (ok) {
      appSettingsStore.writeAppSettings({ ...appSettingsStore.readAppSettings(), hotkey: accelerator });
      return { ok: true, active: getCurrentHotkey() };
    }
    return {
      ok: false,
      error: 'Could not register that shortcut — it may already be in use by another app.',
      active: getCurrentHotkey(),
    };
  });

  ipcMain.handle('get-variables', async () => {
    return variablesStore.readVariables();
  });

  ipcMain.handle('save-variables', async (_event, vars) => {
    return variablesStore.writeVariables(vars);
  });

  ipcMain.handle('get-groups', async () => {
    return groupsStore.readGroups();
  });

  ipcMain.handle('save-groups', async (_event, groups) => {
    return groupsStore.writeGroups(groups);
  });

  ipcMain.handle('get-pipelines', async () => {
    return pipelinesStore.readPipelines();
  });

  ipcMain.handle('save-pipelines', async (_event, pipelines) => {
    return pipelinesStore.writePipelines(pipelines);
  });

  ipcMain.handle('open-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) return { ok: false };
    try {
      const result = await shell.openPath(targetPath);
      return result ? { ok: false, error: result } : { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('list-backups', async () => {
    return backupsStore.listBackups();
  });

  ipcMain.handle('restore-backup', async (_event, fileName) => {
    try {
      return { ok: true, snippets: backupsStore.restoreBackup(fileName, snippetsStore.writeSnippets) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('check-for-updates', async () => {
    updater.checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    updater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', async () => {
    updater.quitAndInstall();
  });

  ipcMain.on('hide-window', () => {
    hideWindow();
  });

  ipcMain.on('show-window', () => {
    showWindow();
  });
}

module.exports = { registerIpcHandlers };
