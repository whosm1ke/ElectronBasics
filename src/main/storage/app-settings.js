// storage/app-settings.js — small app-level preferences: the custom hotkey
// and the first-run tray-hint flag. Not snippet data, not a UI preference —
// its own tiny file.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { APP_SETTINGS_FILE } = require('../paths');
const { readJsonFileSafe } = require('../json-file');

const DEFAULT_APP_SETTINGS = { hotkey: 'Control+Shift+Space', hasShownTrayHint: false };

function readAppSettings() {
  if (!fs.existsSync(APP_SETTINGS_FILE)) return { ...DEFAULT_APP_SETTINGS };
  const parsed = readJsonFileSafe(APP_SETTINGS_FILE, {}, (v) => v && typeof v === 'object');
  return { ...DEFAULT_APP_SETTINGS, ...parsed };
}

function writeAppSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(APP_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write app settings:', err);
  }
}

module.exports = { readAppSettings, writeAppSettings, DEFAULT_APP_SETTINGS };
