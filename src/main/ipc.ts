// ipc.ts — every ipcMain.handle/on registration. Pure wiring: each handler
// delegates to the relevant module (shell/exec, storage/*, hotkey, terminal)
// and shapes its response — no execution or persistence logic lives here.
import { ipcMain, clipboard, dialog, shell, app, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';

import { getMainWindow, hideWindow, showWindow, suppressNextBlurHide } from './window';
import { registerHotkey, getCurrentHotkey } from './hotkey';
import { runShellCommand } from './shell/exec';
import { openTerminal } from './shell/terminal';
import * as processManager from './shell/process-manager';
import { readShellHistorySources } from './shell/history-import';
import { refreshComputedVariable } from './computedVariables';
import * as watchTriggersStore from './storage/watchTriggers';
import { syncFileWatchers } from './fileWatcher';
import { envListToObject } from './env-utils';
import { newId } from '@shared/id';

import * as snippetsStore from './storage/snippets';
import * as historyStore from './storage/history';
import * as appSettingsStore from './storage/app-settings';
import * as variablesStore from './storage/variables';
import * as groupsStore from './storage/groups';
import * as pipelinesStore from './storage/pipelines';
import * as librariesStore from './storage/libraries';
import * as updater from './updater';
import crypto from 'node:crypto';
import { startTriggerServer, stopTriggerServer, isTriggerServerRunning } from './triggerServer';

import type {
  RunCommandPayload,
  RunSequencePayload,
  SequenceStepResult,
  OpenTerminalPayload,
  StartProcessPayload,
  Snippet,
  TriggerConfig,
} from '@shared/types';

export function registerIpcHandlers(): void {
  ipcMain.handle('run-command', async (_event: IpcMainInvokeEvent, payload: RunCommandPayload | string) => {
    const {
      command,
      snippetId = null,
      snippetName = 'Untitled',
      cwd = null,
      shell: shellType = 'powershell',
      elevated = false,
      env = null,
      stdin = null,
      debug = false,
      ssh = null,
    } = (payload && typeof payload === 'object' ? payload : { command: payload }) as RunCommandPayload;

    // An elevated run pops a real UAC consent prompt — a genuinely separate
    // OS window that would otherwise blur (and hide) the launcher the
    // instant it appears, before the user ever gets to answer it.
    if (elevated) suppressNextBlurHide();

    const startedAt = Date.now();
    const result = await runShellCommand(command, {
      cwd, shell: shellType, elevated, env: envListToObject(env), stdin, debug, ssh,
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

  ipcMain.handle('run-sequence', async (_event: IpcMainInvokeEvent, payload: RunSequencePayload) => {
    const {
      steps = [],
      snippetId = null,
      snippetName = 'Untitled',
      cwd = null,
      shell: shellType = 'powershell',
      elevated = false,
      env = null,
      stopOnError = false,
      ssh = null,
    } = (payload && typeof payload === 'object' ? payload : {}) as RunSequencePayload;

    const stepList = Array.isArray(steps) ? steps.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (stepList.length === 0) {
      return { steps: [], overallCode: 1 };
    }

    const startedAt = Date.now();
    const results: SequenceStepResult[] = [];
    const envObj = envListToObject(env);
    for (const step of stepList) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runShellCommand(step, { cwd, shell: shellType, elevated, env: envObj, ssh });
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

  ipcMain.handle('open-terminal', async (_event: IpcMainInvokeEvent, payload: OpenTerminalPayload) => {
    // A real, separate console window is about to steal focus.
    suppressNextBlurHide();
    return openTerminal(payload || {});
  });

  ipcMain.handle('start-process', async (_event: IpcMainInvokeEvent, payload: StartProcessPayload) => {
    const { snippetId, command, cwd = null, shell: shellType = 'powershell', env = null, autoRestart = false } = payload || {};
    return processManager.startProcess({ snippetId, command, cwd, shellType, env: envListToObject(env), autoRestart });
  });

  ipcMain.handle('stop-process', async (_event: IpcMainInvokeEvent, snippetId: string) => {
    return processManager.stopProcess(snippetId);
  });

  ipcMain.handle('restart-process', async (_event: IpcMainInvokeEvent, snippetId: string) => {
    return processManager.restartProcess(snippetId);
  });

  ipcMain.handle('list-processes', async () => {
    return processManager.listProcesses();
  });

  ipcMain.handle('copy-text', async (_event: IpcMainInvokeEvent, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  ipcMain.handle('load-snippets', async () => {
    return snippetsStore.readSnippets();
  });

  ipcMain.handle('save-snippets', async (_event: IpcMainInvokeEvent, snippets: unknown) => {
    return snippetsStore.writeSnippets(snippets);
  });

  ipcMain.handle('get-history', async () => {
    return historyStore.readHistory();
  });

  ipcMain.handle('clear-history', async () => {
    return historyStore.clearHistory();
  });

  ipcMain.handle('export-snippets', async () => {
    suppressNextBlurHide();
    const win = getMainWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export snippets',
      defaultPath: 'snippets-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      fs.writeFileSync(filePath, JSON.stringify(snippetsStore.readSnippets(), null, 2), 'utf8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
    }
  });

  ipcMain.handle('import-snippets', async () => {
    suppressNextBlurHide();
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
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
      const incoming: Snippet[] = parsed.map((s) => snippetsStore.sanitizeSnippet({ ...s, id: newId('snip') }));
      const merged = snippetsStore.writeSnippets([...snippetsStore.readSnippets(), ...incoming]);
      return { ok: true, snippets: merged, importedCount: incoming.length };
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
    }
  });

  ipcMain.handle('get-launch-on-startup', async () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-launch-on-startup', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('get-hotkey', async () => {
    const settings = appSettingsStore.readAppSettings();
    return { saved: settings.hotkey, active: getCurrentHotkey() };
  });

  ipcMain.handle('set-hotkey', async (_event: IpcMainInvokeEvent, accelerator: string) => {
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

  ipcMain.handle('save-variables', async (_event: IpcMainInvokeEvent, vars: unknown) => {
    return variablesStore.writeVariables(vars);
  });

  ipcMain.handle('get-groups', async () => {
    return groupsStore.readGroups();
  });

  ipcMain.handle('save-groups', async (_event: IpcMainInvokeEvent, groups: unknown) => {
    return groupsStore.writeGroups(groups);
  });

  ipcMain.handle('get-pipelines', async () => {
    return pipelinesStore.readPipelines();
  });

  ipcMain.handle('save-pipelines', async (_event: IpcMainInvokeEvent, pipelines: unknown) => {
    return pipelinesStore.writePipelines(pipelines);
  });

  // Backs the Health panel's "missing working directory" check — a plain
  // fs.existsSync, but the renderer has no fs access of its own (sandboxed,
  // no Node integration), so even this one-line check needs a round trip.
  ipcMain.handle('path-exists', async (_event: IpcMainInvokeEvent, targetPath: string) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) return false;
    try {
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  });

  ipcMain.handle('refresh-computed-variable', async (_event: IpcMainInvokeEvent, variableId: string) => {
    return refreshComputedVariable(variableId);
  });

  ipcMain.handle('get-watch-triggers', async () => {
    return watchTriggersStore.readWatchTriggers();
  });

  ipcMain.handle('save-watch-triggers', async (_event: IpcMainInvokeEvent, triggers: unknown) => {
    const saved = watchTriggersStore.writeWatchTriggers(triggers);
    syncFileWatchers();
    return saved;
  });

  ipcMain.handle('pick-watch-path', async () => {
    suppressNextBlurHide();
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Choose a file or folder to watch',
      properties: ['openFile', 'openDirectory'],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    return { ok: true, path: filePaths[0] };
  });

  ipcMain.handle('get-shell-history', async () => {
    return readShellHistorySources();
  });

  ipcMain.handle('get-libraries', async () => {
    return librariesStore.readLibraries();
  });

  ipcMain.handle('add-library', async (_event: IpcMainInvokeEvent, url: string) => {
    if (typeof url !== 'string' || !url.trim()) return { ok: false, error: 'Enter a URL first' };
    const libraries = librariesStore.readLibraries();
    if (libraries.some((l) => l.url === url.trim())) return { ok: false, error: 'Already subscribed to that URL' };
    let name = url.trim();
    try { name = new URL(url.trim()).host; } catch { /* keep the raw url as the name if it's somehow not parseable here */ }
    const library = librariesStore.sanitizeLibrary({ url: url.trim(), name });
    try {
      const { snippets, count } = await librariesStore.syncLibrary(library);
      library.lastSyncedAt = new Date().toISOString();
      library.lastSyncCount = count;
      const saved = librariesStore.writeLibraries([...libraries, library]);
      return { ok: true, libraries: saved, snippets, count };
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
    }
  });

  ipcMain.handle('sync-library', async (_event: IpcMainInvokeEvent, libraryId: string) => {
    const libraries = librariesStore.readLibraries();
    const library = libraries.find((l) => l.id === libraryId);
    if (!library) return { ok: false, error: 'That library was already removed' };
    try {
      const { snippets, count } = await librariesStore.syncLibrary(library);
      library.lastSyncedAt = new Date().toISOString();
      library.lastSyncCount = count;
      const saved = librariesStore.writeLibraries(libraries);
      return { ok: true, libraries: saved, snippets, count };
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
    }
  });

  ipcMain.handle('remove-library', async (_event: IpcMainInvokeEvent, libraryId: string) => {
    const { libraries, snippets } = librariesStore.removeLibraryAndSnippets(libraryId, librariesStore.readLibraries());
    return { libraries, snippets };
  });

  ipcMain.handle('open-path', async (_event: IpcMainInvokeEvent, targetPath: string) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) return { ok: false };
    try {
      const result = await shell.openPath(targetPath);
      return result ? { ok: false, error: result } : { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
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

  ipcMain.handle('get-trigger-config', async (): Promise<TriggerConfig & { running: boolean }> => {
    const { trigger } = appSettingsStore.readAppSettings();
    return { ...trigger, running: isTriggerServerRunning() };
  });

  ipcMain.handle('set-trigger-config', async (_event: IpcMainInvokeEvent, patch: { enabled?: boolean; port?: number }) => {
    const settings = appSettingsStore.readAppSettings();
    const port = Number.isFinite(patch.port) ? Math.min(65535, Math.max(1024, Math.round(patch.port as number))) : settings.trigger.port;
    const trigger: TriggerConfig = { ...settings.trigger, port, enabled: Boolean(patch.enabled ?? settings.trigger.enabled) };
    appSettingsStore.writeAppSettings({ ...settings, trigger });
    if (trigger.enabled) startTriggerServer(trigger.port);
    else stopTriggerServer();
    return { ...trigger, running: isTriggerServerRunning() };
  });

  ipcMain.handle('regenerate-trigger-token', async () => {
    const settings = appSettingsStore.readAppSettings();
    const trigger: TriggerConfig = { ...settings.trigger, token: crypto.randomBytes(24).toString('hex') };
    appSettingsStore.writeAppSettings({ ...settings, trigger });
    // A live server reads the token fresh from disk on every request (see
    // triggerServer.ts's handleRequest), so no restart is needed here.
    return { ...trigger, running: isTriggerServerRunning() };
  });

  ipcMain.on('hide-window', () => {
    hideWindow();
  });

  ipcMain.on('show-window', () => {
    showWindow();
  });
}
