// window.js — the single launcher BrowserWindow: creation, show/hide/toggle.
'use strict';

const path = require('node:path');
const { app, BrowserWindow, screen } = require('electron');

const WINDOW_WIDTH = 760;
const WINDOW_HEIGHT = 620;

let mainWindow = null;

function createWindow(appIcon) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round((screenWidth - WINDOW_WIDTH) / 2),
    y: Math.round((screenHeight - WINDOW_HEIGHT) / 3),
    frame: false,
    show: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    // hasShadow + the default WS_THICKFRAME style are what paint the black
    // rectangular artifact behind a rounded, transparent frameless window on
    // Windows — the native shadow/frame don't composite the alpha channel
    // correctly. We draw our own soft shadow in CSS (box-shadow on
    // .app-shell) instead, so both are turned off here.
    hasShadow: false,
    thickFrame: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // The renderer crashing (not just a JS error inside it — the whole
  // WebContents process dying, e.g. an out-of-memory kill) would otherwise
  // leave a permanently blank, dead launcher window with no obvious way to
  // recover short of quitting the whole app from the tray. Reload it
  // automatically instead — a fresh load re-reads snippets.json from disk,
  // so nothing unsaved survives anyway.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason);
    if (details.reason !== 'clean-exit' && mainWindow) {
      mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    }
  });

  // Hide (not quit) when the window loses focus — classic launcher behavior.
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.webContents.isDevToolsFocused()) {
      hideWindow();
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideWindow();
    }
  });

  return mainWindow;
}

function showWindow() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  mainWindow.setPosition(
    Math.round((screenWidth - WINDOW_WIDTH) / 2),
    Math.round((screenHeight - WINDOW_HEIGHT) / 3)
  );
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) hideWindow();
  else showWindow();
}

function getMainWindow() {
  return mainWindow;
}

module.exports = {
  createWindow, showWindow, hideWindow, toggleWindow, getMainWindow,
  WINDOW_WIDTH, WINDOW_HEIGHT,
};
