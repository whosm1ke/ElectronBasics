// window.ts — the single launcher BrowserWindow: creation, show/hide/toggle.
import path from 'node:path';
import { app, BrowserWindow, screen, type NativeImage } from 'electron';

export const WINDOW_WIDTH = 760;
export const WINDOW_HEIGHT = 620;

let mainWindow: BrowserWindow | null = null;

// electron-vite sets ELECTRON_RENDERER_URL only while `electron-vite dev` is
// running its Vite dev server for the renderer (localhost, HMR); the built
// app never has this env var, so it always falls through to loadFile against
// the packed out/renderer/index.html. Keeping loadFile as the production
// path (not loadURL against a bundled file:// URL) matches how this window
// has always been loaded — only the dev-time source changes.
function loadRendererContent(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

export function createWindow(appIcon: NativeImage): BrowserWindow {
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

  loadRendererContent(mainWindow);
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
      loadRendererContent(mainWindow);
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

export function showWindow(): void {
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

export function hideWindow(): void {
  if (!mainWindow) return;
  mainWindow.hide();
}

export function toggleWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) hideWindow();
  else showWindow();
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
