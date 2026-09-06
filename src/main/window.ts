// window.ts — the single launcher BrowserWindow: creation, show/hide/toggle,
// and (since the window became user-resizable) persisting/restoring its size.
import path from 'node:path';
import { app, BrowserWindow, screen, type NativeImage } from 'electron';
import { readAppSettings, writeAppSettings } from './storage/app-settings';

export const WINDOW_WIDTH = 760;
export const WINDOW_HEIGHT = 620;

// Below this, the header's search icon + 7 icon buttons (30px + 8px gaps)
// alone already need ~325px, leaving the search input too little room to be
// usable (see style.css's .search-input `min-width: 0` comment for what
// happens without a floor at all — the buttons get pushed off the header
// entirely and clipped) — picked as "still a comfortably usable launcher",
// not an arbitrary small number. MIN_WINDOW_HEIGHT keeps at least a couple
// of card rows visible under the header/tag-filters chrome.
export const MIN_WINDOW_WIDTH = 520;
export const MIN_WINDOW_HEIGHT = 440;

let mainWindow: BrowserWindow | null = null;
let saveSizeTimer: ReturnType<typeof setTimeout> | null = null;

// A handful of actions this app itself triggers deliberately spawn (or
// bring forward) another OS-level window that steals focus — a real
// terminal (shell/terminal.ts's openTerminal), a UAC elevation prompt
// (shell/exec.ts's elevated path), a native file/folder picker
// (dialog.showOpenDialog/showSaveDialog in ipc.ts). Every one of those used
// to blur this window instantly, which the 'blur' handler below then read
// as "the user clicked away" and hid the launcher — vanishing it out from
// under whatever action the user had just clicked *inside* it to start.
// ipc.ts calls suppressNextBlurHide() right before any of those, so a blur
// landing inside the grace window is treated as "caused by us", not by the
// user actually clicking elsewhere.
let suppressBlurHideUntil = 0;
export function suppressNextBlurHide(ms = 2000): void {
  suppressBlurHideUntil = Date.now() + ms;
}

/** Persists the window's current size to app-settings.json — merged in, not overwriting the rest (hotkey, hasShownTrayHint). */
function saveWindowSize(win: BrowserWindow): void {
  const [width, height] = win.getSize();
  const settings = readAppSettings();
  writeAppSettings({ ...settings, windowSize: { width, height } });
}

// 'resize' fires continuously while the user drags an edge — debounced so a
// drag doesn't hammer disk I/O, with a short enough delay that a quit or
// crash shortly after resizing is very unlikely to lose it (and the 'close'
// handler below flushes immediately as a belt-and-suspenders backstop).
function scheduleSaveWindowSize(win: BrowserWindow): void {
  if (saveSizeTimer) clearTimeout(saveSizeTimer);
  saveSizeTimer = setTimeout(() => saveWindowSize(win), 400);
}

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

  // A previously-saved size (see saveWindowSize) wins over the default —
  // clamped to the current minimum in case it was saved by an older version
  // with a smaller/no minimum, or the file was hand-edited.
  const savedSize = readAppSettings().windowSize;
  const width = Math.max(MIN_WINDOW_WIDTH, savedSize?.width ?? WINDOW_WIDTH);
  const height = Math.max(MIN_WINDOW_HEIGHT, savedSize?.height ?? WINDOW_HEIGHT);

  mainWindow = new BrowserWindow({
    width,
    height,
    x: Math.round((screenWidth - width) / 2),
    y: Math.round((screenHeight - height) / 3),
    frame: false,
    show: false,
    resizable: true,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    // hasShadow + the default WS_THICKFRAME style are what paint the black
    // rectangular artifact behind a rounded, transparent frameless window on
    // Windows — the native shadow/frame don't composite the alpha channel
    // correctly. We draw our own soft shadow in CSS (box-shadow on
    // .app-shell) instead, so both are turned off here. thickFrame:false
    // does *not* disable edge-drag resizing — Chromium's own frameless
    // resize handling (hit-testing near the window edges) is independent of
    // the native thick-frame style, so `resizable: true` above is still
    // enough for a user to drag this window's borders despite frame:false.
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

  mainWindow.on('resize', () => {
    if (mainWindow) scheduleSaveWindowSize(mainWindow);
  });

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
  // Skipped for a short grace window right after this app itself opened a
  // terminal/UAC prompt/native dialog — see suppressNextBlurHide() above.
  mainWindow.on('blur', () => {
    if (Date.now() < suppressBlurHideUntil) return;
    if (mainWindow && !mainWindow.webContents.isDevToolsFocused()) {
      hideWindow();
    }
  });

  mainWindow.on('close', (event) => {
    // Flush immediately rather than relying on the debounced save above —
    // this is the one moment a pending timer could otherwise be cut off
    // (a resize followed right away by Quit from the tray).
    if (saveSizeTimer) {
      clearTimeout(saveSizeTimer);
      saveSizeTimer = null;
    }
    if (mainWindow) saveWindowSize(mainWindow);
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
  // Re-center against the window's *actual current* size, not the original
  // default — a resized window should keep re-centering itself the same
  // way on every show/hide cycle, not snap back toward where a 760×620
  // window would have centered.
  const [width, height] = mainWindow.getSize();
  mainWindow.setPosition(
    Math.round((screenWidth - width) / 2),
    Math.round((screenHeight - height) / 3)
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
