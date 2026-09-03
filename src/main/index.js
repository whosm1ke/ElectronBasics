// index.js — main-process entry point. Pure orchestration: wires the
// window, tray, hotkey, IPC handlers, and scheduler together at startup.
// All the actual logic lives in the modules it requires.
'use strict';

const { app, BrowserWindow, globalShortcut } = require('electron');

const { buildAppIcon } = require('./icon');
const { createWindow, showWindow, WINDOW_WIDTH, WINDOW_HEIGHT } = require('./window');
const { createTray, maybeShowTrayHint } = require('./tray');
const { registerHotkey } = require('./hotkey');
const { registerIpcHandlers } = require('./ipc');
const { startScheduler } = require('./scheduler');
const { ensureSnippetsFile } = require('./storage/snippets');
const { ensureHistoryFile } = require('./storage/history');
const { readAppSettings } = require('./storage/app-settings');

// Silence the "unused" hint some editors show for size constants imported
// only for their side-effect of documenting window dimensions elsewhere.
void WINDOW_WIDTH;
void WINDOW_HEIGHT;

// Safety nets: this app spends most of its life in the background (tray +
// hotkey, no visible window), so an uncaught exception or an unawaited
// rejected promise would otherwise crash it — or just silently wedge a
// background timer/IPC handler — with no trace of what happened anywhere
// the user would see. Logging here doesn't fix the bug, but it's the
// difference between "the hotkey mysteriously stopped working" and an
// actual error message to go find and diagnose.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason);
});

const HOTKEYS = ['Control+Shift+Space', 'Alt+Space'];

app.whenReady().then(() => {
  ensureSnippetsFile();
  ensureHistoryFile();
  registerIpcHandlers();

  const appIcon = buildAppIcon();
  createWindow(appIcon);
  createTray(appIcon);

  const appSettings = readAppSettings();
  // Try the user's saved/custom hotkey first, then fall back through the
  // built-in defaults so a combo taken by another app doesn't strand the user.
  const candidates = [appSettings.hotkey, ...HOTKEYS].filter(Boolean);
  let registeredHotkey = null;
  for (const accelerator of candidates) {
    if (registerHotkey(accelerator)) {
      registeredHotkey = accelerator;
      console.log(`Global hotkey registered: ${accelerator}`);
      break;
    }
  }
  if (!registeredHotkey) {
    console.error('Could not register any global hotkey. Use the tray icon to open the launcher.');
  }

  maybeShowTrayHint(appSettings, registeredHotkey);
  startScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(appIcon);
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep the app alive in the background (tray + hotkey stay functional),
  // matching typical launcher/tray-app behavior on Windows.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
