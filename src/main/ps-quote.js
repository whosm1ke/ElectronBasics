// ps-quote.js — wraps a string as a single-quoted PowerShell literal.
// Shared by the elevation wrapper (shell/exec.js) and the terminal launcher
// (shell/terminal.js), both of which build a PowerShell -Command string.
'use strict';

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

module.exports = { psQuote };
