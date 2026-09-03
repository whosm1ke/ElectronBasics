// json-file.js — shared safe JSON read for every storage/*.js module. Two
// real-world failure modes it guards against: a leading UTF-8 BOM (an
// actual incident — a `Set-Content -Encoding UTF8` write from outside the
// app once prepended one to snippets.json, and Node's JSON.parse chokes on
// it with a cryptic "Unexpected token" error at position 0), and a file
// that's just plain corrupt/truncated (disk full, killed mid-write,
// hand-edited badly). Every storage module's read function should go
// through readJsonFileSafe() instead of a bare JSON.parse(readFileSync())
// — that's what keeps one damaged file from crashing the app at startup
// instead of just resetting that one file to its default.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

const notifiedPaths = new Set();

/** Fires a one-time-per-file native notification so a silent reset isn't invisible to the user. Never throws — notification failures are logged, not propagated. */
function notifyCorruption(filePath, backupPath) {
  if (notifiedPaths.has(filePath)) return;
  notifiedPaths.add(filePath);
  try {
    const { Notification } = require('electron');
    if (!Notification.isSupported()) return;
    new Notification({
      title: 'Snippet Runner — a data file was reset',
      body: backupPath
        ? `${path.basename(filePath)} couldn't be read and was reset to defaults. The broken file was kept as ${path.basename(backupPath)}.`
        : `${path.basename(filePath)} couldn't be read and was reset to defaults.`,
    }).show();
  } catch (err) {
    console.error('Failed to show data-corruption notification:', err);
  }
}

/**
 * Reads and JSON.parses `filePath`. On any failure — missing file, invalid
 * JSON, or a root shape `validate` rejects — logs the problem, preserves an
 * existing-but-corrupt file next to itself as `<name>.corrupt-<timestamp>`
 * (so a reset is never a silent full data loss), and returns `fallback`
 * instead of throwing.
 *
 * @param {string} filePath
 * @param {*} fallback value to return (and implicitly "reset to") on failure
 * @param {(parsed: any) => boolean} [validate] extra shape check beyond "is valid JSON"
 */
function readJsonFileSafe(filePath, fallback, validate = () => true) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Failed to read ${filePath}:`, err);
    return fallback;
  }

  try {
    const parsed = JSON.parse(stripBom(raw));
    if (!validate(parsed)) throw new Error('unexpected JSON shape');
    return parsed;
  } catch (err) {
    console.error(`Corrupt data in ${filePath}, resetting to defaults:`, err.message);
    let backupPath = null;
    try {
      backupPath = `${filePath}.corrupt-${Date.now()}`;
      fs.copyFileSync(filePath, backupPath);
      console.error(`The broken file was preserved at ${backupPath}`);
    } catch (backupErr) {
      console.error('Could not preserve the corrupt file:', backupErr);
      backupPath = null;
    }
    notifyCorruption(filePath, backupPath);
    return fallback;
  }
}

module.exports = { readJsonFileSafe, stripBom };
