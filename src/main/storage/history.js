// storage/history.js — the run-history log (last MAX_HISTORY entries, newest first).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { HISTORY_FILE } = require('../paths');
const { readJsonFileSafe } = require('../json-file');

const MAX_HISTORY = 100;

function ensureHistoryFile() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
      fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
    }
  } catch (err) {
    console.error('Failed to initialize history file:', err);
  }
}

function readHistory() {
  ensureHistoryFile();
  return readJsonFileSafe(HISTORY_FILE, [], Array.isArray);
}

function appendHistory(entry) {
  try {
    const history = readHistory();
    history.unshift(entry); // newest first
    const trimmed = history.slice(0, MAX_HISTORY);
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    return trimmed;
  } catch (err) {
    console.error('Failed to append history:', err);
    return readHistory();
  }
}

function clearHistory() {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  return [];
}

module.exports = { ensureHistoryFile, readHistory, appendHistory, clearHistory };
