// tray.js — the system tray icon, its context menu, and the one-time
// first-run hint notification pointing new users at the hotkey/tray.
'use strict';

const { Tray, Menu, app, Notification } = require('electron');
const { toggleWindow } = require('./window');
const { writeAppSettings } = require('./storage/app-settings');

let tray = null;

function createTray(appIcon) {
  tray = new Tray(appIcon);
  tray.setToolTip('Snippet Runner — Ctrl+Shift+Space to toggle');

  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide launcher', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Quit Snippet Runner',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
  return tray;
}

/** Called by hotkey.js whenever the active accelerator changes. */
function setTrayTooltip(text) {
  if (tray) tray.setToolTip(text);
}

/** Shows a one-time native notification pointing new users at the hotkey/tray, then never again. */
function maybeShowTrayHint(appSettings, activeHotkeyLabel) {
  if (appSettings.hasShownTrayHint) return;
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Snippet Runner is running',
        body: `Press ${activeHotkeyLabel || 'Ctrl+Shift+Space'} anytime to open it, or use the tray icon.`,
      }).show();
    }
  } catch (err) {
    console.error('Failed to show tray hint notification:', err);
  }
  writeAppSettings({ ...appSettings, hasShownTrayHint: true });
}

module.exports = { createTray, setTrayTooltip, maybeShowTrayHint };
