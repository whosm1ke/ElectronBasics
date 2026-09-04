// test/electron-stub.ts — minimal stand-in for the 'electron' module,
// wired in via vitest.config.ts's resolve.alias. Lets main-process
// pure-logic unit tests (sanitizers, buildInvocation, the cron matcher)
// import their real source files under Vitest — plain Node, no running
// Electron instance — without hand-mocking every transitive import.
// Deliberately minimal: only what's touched at module-load time (e.g.
// paths.ts's top-level `app.getPath('userData')` call) or by the pure
// functions actually under test needs real behavior; everything else is a
// no-op stub.
import os from 'node:os';
import path from 'node:path';

export const app = {
  getPath: (name: string) => path.join(os.tmpdir(), 'snippet-runner-vitest', name),
  getName: () => 'snippet-runner-vitest',
  getVersion: () => '0.0.0-test',
  isPackaged: false,
  isQuitting: false,
  getLoginItemSettings: () => ({ openAtLogin: false }),
  setLoginItemSettings: () => {},
  whenReady: () => Promise.resolve(),
  on: () => {},
  quit: () => {},
};

export class Notification {
  static isSupported() {
    return false;
  }
  constructor(_opts: unknown) {}
  show() {}
  on() {}
}

export const nativeImage = {
  createFromBuffer: () => ({}),
  createEmpty: () => ({}),
};

export const ipcMain = { handle: () => {}, on: () => {} };
export const ipcRenderer = { invoke: () => Promise.resolve(), send: () => {}, on: () => {}, removeListener: () => {} };
export const clipboard = { writeText: () => {} };
export const dialog = {
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
};
export const shell = { openPath: async () => '' };
export const globalShortcut = { register: () => true, unregister: () => {}, unregisterAll: () => {} };
export const screen = { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) };

export class BrowserWindow {
  static getAllWindows() {
    return [];
  }
  webContents = { on: () => {}, send: () => {}, isDevToolsFocused: () => false };
  constructor(_opts?: unknown) {}
  loadFile() {}
  loadURL() {}
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  on() {}
  show() {}
  hide() {}
  focus() {}
  isVisible() {
    return false;
  }
  isDestroyed() {
    return false;
  }
  setPosition() {}
}

export class Tray {
  constructor(_icon?: unknown) {}
  setToolTip() {}
  setContextMenu() {}
  on() {}
}

export const Menu = { buildFromTemplate: () => ({}) };
export const contextBridge = { exposeInMainWorld: () => {} };
