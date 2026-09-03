// shell/terminal.js — opens a real, visible, interactive terminal window
// pre-loaded with a command.
//
// Spawning the target shell directly with detached:true is NOT reliable
// from an Electron main process on Windows: a console-subsystem process
// with no console of its own does not always get a fresh one allocated
// the way it does when typed into an existing shell, so it can exit
// silently with nothing ever appearing on screen.
//
// The robust, standard technique (same one Explorer's "Run" and VS Code's
// "Open in terminal" ultimately rely on) is to go through `cmd.exe /c
// start`, which explicitly asks the shell to create a brand-new console
// window for the child process. We hand PowerShell the command via
// -EncodedCommand (base64 UTF-16LE) so it never has to survive being
// re-quoted across three layers of argv parsing (cmd -> start -> powershell).
'use strict';

const { spawn } = require('node:child_process');

function encodePs(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

function openTerminal({ command = '', cwd = null, shell: shellType = 'powershell' } = {}) {
  return new Promise((resolve) => {
    try {
      let args;
      if (shellType === 'cmd') {
        // /k keeps the window open; an empty title ("") is required so
        // `start` doesn't mistake the next token for a window title.
        args = ['/c', 'start', '""', 'cmd.exe', '/k', ...(command ? [command] : [])];
      } else {
        const psArgs = command
          ? ['-NoExit', '-EncodedCommand', encodePs(command)]
          : ['-NoExit'];
        args = ['/c', 'start', '""', 'powershell.exe', ...psArgs];
      }

      const child = spawn('cmd.exe', args, {
        cwd: cwd || undefined,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        windowsVerbatimArguments: true,
      });
      child.on('error', (err) => {
        resolve({ ok: false, error: String(err.message || err) });
      });
      child.unref();
      resolve({ ok: true });
    } catch (err) {
      resolve({ ok: false, error: String(err.message || err) });
    }
  });
}

module.exports = { openTerminal };
