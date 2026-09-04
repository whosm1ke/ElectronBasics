// Covers buildInvocation's per-shell argv construction — the highest
// blast-radius code in the app (CLAUDE.md: runShellCommand uses execFile
// with explicit argv arrays specifically to avoid exec()'s shell-string
// convention misinterpreting the command for non-cmd/powershell shells).
// A TS port that silently changed one shell's args would be invisible by
// eyeballing the diff but would break every snippet run under that shell.
import { describe, it, expect } from 'vitest';
import { buildInvocation, SHELL_CANDIDATES } from './exec';

describe('buildInvocation', () => {
  it('cmd: wraps with chcp 65001 for UTF-8 output', () => {
    const { candidates, args } = buildInvocation('dir', 'cmd');
    expect(candidates).toBe(SHELL_CANDIDATES.cmd);
    expect(args).toEqual(['/d', '/s', '/c', 'chcp 65001 > nul && dir']);
  });

  it('gitbash: -lc with the raw command, tries known Git-for-Windows paths', () => {
    const { candidates, args } = buildInvocation('ls -la', 'gitbash');
    expect(candidates).toContain('bash.exe');
    expect(candidates).toContain('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(args).toEqual(['-lc', 'ls -la']);
  });

  it('wsl: -e bash -lc with the raw command', () => {
    const { candidates, args } = buildInvocation('uname -a', 'wsl');
    expect(candidates).toBe(SHELL_CANDIDATES.wsl);
    expect(args).toEqual(['-e', 'bash', '-lc', 'uname -a']);
  });

  it('node: -e with the raw command', () => {
    const { args } = buildInvocation('console.log(1)', 'node');
    expect(args).toEqual(['-e', 'console.log(1)']);
  });

  it('python: -c with the raw command', () => {
    const { args } = buildInvocation('print(1)', 'python');
    expect(args).toEqual(['-c', 'print(1)']);
  });

  it('powershell (default): -NoProfile -NonInteractive -Command with the UTF-8 preamble prepended', () => {
    const { candidates, args } = buildInvocation('Get-Process', 'powershell');
    expect(candidates).toBe(SHELL_CANDIDATES.powershell);
    expect(args[0]).toBe('-NoProfile');
    expect(args[1]).toBe('-NonInteractive');
    expect(args[2]).toBe('-Command');
    // The preamble is load-bearing (CLAUDE.md) — assert it's actually there,
    // not just that *some* string got prepended.
    expect(args[3]).toContain('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8');
    expect(args[3]).toContain('chcp 65001 > $null');
    expect(args[3].endsWith('Get-Process')).toBe(true);
  });
});
