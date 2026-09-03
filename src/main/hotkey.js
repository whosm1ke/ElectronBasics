// hotkey.js — the single place that calls globalShortcut.register/unregister,
// so the "currently active accelerator" is never tracked in two places.
'use strict';

const { globalShortcut } = require('electron');
const { toggleWindow } = require('./window');
const { setTrayTooltip } = require('./tray');

let currentHotkey = null;

/** Tries to register `accelerator` as the toggle hotkey, replacing any current one. Returns success. */
function registerHotkey(accelerator) {
  const previous = currentHotkey;
  if (previous) {
    try { globalShortcut.unregister(previous); } catch (err) { console.error(err); }
  }
  try {
    if (globalShortcut.register(accelerator, toggleWindow)) {
      currentHotkey = accelerator;
      setTrayTooltip(`Snippet Runner — ${accelerator} to toggle`);
      return true;
    }
  } catch (err) {
    console.error(`Failed to register hotkey ${accelerator}:`, err);
  }
  // Roll back to whatever was working before.
  currentHotkey = null;
  if (previous) {
    try {
      if (globalShortcut.register(previous, toggleWindow)) currentHotkey = previous;
    } catch (err) { console.error(err); }
  }
  return false;
}

function getCurrentHotkey() {
  return currentHotkey;
}

module.exports = { registerHotkey, getCurrentHotkey };
