// build/beforePack.js — electron-builder beforePack hook. Regenerates
// build/icon.ico (see generate-icon.js) right before packaging starts, so
// `build.win.icon`/`build.icon` always find a fresh file on disk — without
// this, electron-builder falls back to Electron's own default icon for the
// .exe/taskbar/installer (the app's runtime tray/window icon, drawn by
// src/main/icon.ts, is unaffected either way since that one is a
// NativeImage built in-process, not a packaged file).
'use strict';

const { generate } = require('./generate-icon');

module.exports = async function beforePack() {
  generate();
};
