// shell/exec.ts — the multi-shell command execution engine. Built on
// child_process.execFile with explicit argv arrays per shell — not exec()'s
// shell-string convenience, which on Windows always wraps the command as
// `<shell> /d /s /c "<command>"` regardless of which binary you name. That
// convention only happens to be correct for cmd.exe (and works for
// powershell.exe); it would silently misinterpret the command for
// bash.exe/wsl.exe/node/python. There is no "is this command dangerous"
// check anywhere in this file, or anywhere in the app — running a command is
// entirely the caller's responsibility.
import { execFile } from 'node:child_process';
import { psQuote } from '../ps-quote';
import type { ShellType, RunResult } from '@shared/types';

const COMMAND_TIMEOUT_MS = 20000;
const MAX_BUFFER = 5 * 1024 * 1024; // 5 MB
const ELEVATED_MARKER = '###SNIPPET_RUNNER_STDERR_MARKER###';

// Extra candidate paths tried, in order, when a shell binary isn't resolvable
// via PATH alone — covers the common "Git for Windows didn't add bash.exe to
// PATH" case. Everything else (cmd, powershell, wsl, node, python) is
// expected on PATH if installed at all.
export const SHELL_CANDIDATES: Record<ShellType, string[]> = {
  powershell: ['powershell.exe'],
  cmd: ['cmd.exe'],
  gitbash: ['bash.exe', 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
  wsl: ['wsl.exe'],
  node: ['node.exe', 'node'],
  python: ['python.exe', 'py.exe', 'python'],
};

export interface Invocation {
  candidates: string[];
  args: string[];
}

/** Builds the {candidates, args} argv for a non-elevated invocation of `command` under `shellType`. */
export function buildInvocation(command: string, shellType: ShellType): Invocation {
  switch (shellType) {
    case 'cmd':
      return { candidates: SHELL_CANDIDATES.cmd, args: ['/d', '/s', '/c', `chcp 65001 > nul && ${command}`] };
    case 'gitbash':
      return { candidates: SHELL_CANDIDATES.gitbash, args: ['-lc', command] };
    case 'wsl':
      return { candidates: SHELL_CANDIDATES.wsl, args: ['-e', 'bash', '-lc', command] };
    case 'node':
      return { candidates: SHELL_CANDIDATES.node, args: ['-e', command] };
    case 'python':
      return { candidates: SHELL_CANDIDATES.python, args: ['-c', command] };
    default: {
      // Force UTF-8 console/output encoding inside the PowerShell session so
      // pipes, aliases and Cyrillic output come back decoded correctly.
      const encodingPreamble =
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
        '$OutputEncoding = [System.Text.Encoding]::UTF8; ' +
        'chcp 65001 > $null; ';
      return {
        candidates: SHELL_CANDIDATES.powershell,
        args: ['-NoProfile', '-NonInteractive', '-Command', encodingPreamble + command],
      };
    }
  }
}

export interface RunShellCommandOptions {
  cwd?: string | null;
  shell?: ShellType;
  elevated?: boolean;
  env?: Record<string, string> | null;
  stdin?: string | null;
  debug?: boolean;
}

/**
 * Runs a command string under one of several shells and returns
 * { stdout, stderr, code, debugInfo? }. Forces UTF-8 in/out so pipes,
 * aliases, and Cyrillic text render correctly.
 */
export function runShellCommand(command: string, options: RunShellCommandOptions = {}): Promise<RunResult> {
  const { cwd, shell: shellType = 'powershell', elevated = false, env = null, stdin = null, debug = false } = options;

  return new Promise((resolve) => {
    if (typeof command !== 'string' || command.trim().length === 0) {
      resolve({ stdout: '', stderr: 'Empty command.', code: 1 });
      return;
    }

    const mergedEnv: NodeJS.ProcessEnv =
      shellType === 'python'
        ? { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...(env || {}) }
        : { ...process.env, ...(env || {}) };

    if (elevated) {
      // Run as Administrator is only wired up for PowerShell today — the
      // elevation wrapper below hardcodes an elevated *PowerShell* child, so
      // silently running it for another shell's syntax would misinterpret
      // the command. Fail clearly instead of guessing.
      if (shellType !== 'powershell') {
        resolve({
          stdout: '',
          stderr: 'Run as Administrator is currently only supported for PowerShell commands.',
          code: 1,
        });
        return;
      }
      // Elevated execution: launch a second, elevated PowerShell via
      // Start-Process -Verb RunAs from our own *non-elevated* PowerShell.
      // Output can't be piped normally across the UAC boundary, so the
      // elevated child redirects to temp files which the outer script
      // reads back and stitches together, marker-delimited, once it exits.
      const innerCommand = (cwd ? `Set-Location -LiteralPath ${psQuote(cwd)}; ` : '') + command;
      const encoded = Buffer.from(innerCommand, 'utf16le').toString('base64');
      const fullCommand = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;',
        '$outFile = [System.IO.Path]::GetTempFileName();',
        '$errFile = [System.IO.Path]::GetTempFileName();',
        'try {',
        '  Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait ' +
          '-RedirectStandardOutput $outFile -RedirectStandardError $errFile ' +
          `-ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}');`,
        '  Get-Content -LiteralPath $outFile -Raw -Encoding UTF8;',
        `  Write-Output '${ELEVATED_MARKER}';`,
        '  Get-Content -LiteralPath $errFile -Raw -Encoding UTF8;',
        '} finally {',
        '  Remove-Item -LiteralPath $outFile,$errFile -Force -ErrorAction SilentlyContinue;',
        '}',
      ].join(' ');

      const execOpts = {
        encoding: 'utf8' as const,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: mergedEnv,
      };
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', fullCommand],
        execOpts,
        (error, stdout, stderr) => {
          let outText = stdout ? stdout.toString() : '';
          let errText = stderr ? stderr.toString() : error && !stdout ? error.message : '';
          if (outText.includes(ELEVATED_MARKER)) {
            const [outPart, errPart] = outText.split(ELEVATED_MARKER);
            outText = outPart || '';
            errText = (errPart || '').trim() || errText;
          }
          const result: RunResult = {
            stdout: outText,
            stderr: errText,
            code: error ? (typeof (error as NodeJS.ErrnoException).code === 'number' ? ((error as unknown as { code: number }).code) : 1) : 0,
          };
          if (debug) result.debugInfo = { file: 'powershell.exe (elevated wrapper)', args: ['-Command', '<elevation script>'] };
          resolve(result);
        }
      );
      return;
    }

    const { candidates, args } = buildInvocation(command, shellType);
    const execOpts = {
      encoding: 'utf8' as const,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      cwd: cwd || undefined,
      env: mergedEnv,
    };

    let i = 0;
    const tryNext = (): void => {
      if (i >= candidates.length) {
        resolve({
          stdout: '',
          stderr: `Could not find a "${shellType}" executable. Tried: ${candidates.join(', ')}`,
          code: 127,
        });
        return;
      }
      const file = candidates[i++];
      let child;
      try {
        child = execFile(file, args, execOpts, (error, stdout, stderr) => {
          if (error && (error as NodeJS.ErrnoException).code === 'ENOENT' && i < candidates.length) {
            tryNext();
            return;
          }
          const result: RunResult = {
            stdout: stdout ? stdout.toString() : '',
            stderr: stderr ? stderr.toString() : error && !stdout ? error.message : '',
            code: error ? (typeof (error as unknown as { code: number }).code === 'number' ? (error as unknown as { code: number }).code : 1) : 0,
          };
          if (debug) result.debugInfo = { file, args };
          resolve(result);
        });
      } catch (err) {
        resolve({ stdout: '', stderr: String((err as Error).message || err), code: 1 });
        return;
      }
      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT' && i < candidates.length) {
          tryNext();
          return;
        }
        resolve({ stdout: '', stderr: String((err as Error).message || err), code: 1 });
      });
      // Always close stdin (writing content first, if any) so a command that
      // waits on input never hangs the run.
      if (child.stdin) {
        try {
          if (stdin) child.stdin.write(stdin);
        } catch {
          /* process may have already exited */
        }
        try {
          child.stdin.end();
        } catch {
          /* ditto */
        }
      }
    };
    tryNext();
  });
}
