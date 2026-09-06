// storage/snippets.ts — the snippet library: defaults + read/write. The
// schema itself (SnippetSchema, @shared/types/snippet.ts) is the single
// source of truth for both the Snippet type and the backfill/coercion logic
// that runs on both read and write (so hand-edited or older-schema files
// never break the UI, and nothing malformed ever reaches disk) — see that
// file's own header comment for why it's a zod schema rather than a
// hand-written interface + a separate sanitizer function.
import fs from 'node:fs';
import { SNIPPETS_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { Snippet } from '@shared/types';
import { SnippetSchema, VALID_SHELLS } from '@shared/types';

export { VALID_SHELLS };

/** Thin, still-exported wrapper around SnippetSchema.parse() — kept as a named function since ipc.ts's snippet-import path calls this by name. */
export function sanitizeSnippet(s: unknown): Snippet {
  return SnippetSchema.parse(s);
}

interface DefaultSnippetSeed {
  id: string;
  name: string;
  tag: string;
  command: string;
}

const DEFAULT_SNIPPET_SEEDS: DefaultSnippetSeed[] = [
  // --- git -----------------------------------------------------------------
  { id: 'git-status', name: 'Git status', tag: 'git', command: 'git status' },
  { id: 'git-log-recent', name: 'Recent commits', tag: 'git', command: 'git log --oneline -10' },
  { id: 'git-current-branch', name: 'Current branch', tag: 'git', command: 'git branch --show-current' },
  { id: 'git-pull', name: 'Pull latest', tag: 'git', command: 'git pull' },
  { id: 'git-diff', name: 'Uncommitted changes', tag: 'git', command: 'git diff' },
  { id: 'git-branches', name: 'List all branches', tag: 'git', command: 'git branch -a' },

  // --- npm -------------------------------------------------------------------
  { id: 'npm-install', name: 'Install dependencies', tag: 'npm', command: 'npm install' },
  { id: 'npm-run-dev', name: 'Run dev server', tag: 'npm', command: 'npm run dev' },
  { id: 'npm-run-build', name: 'Build', tag: 'npm', command: 'npm run build' },
  { id: 'npm-outdated', name: 'Outdated packages', tag: 'npm', command: 'npm outdated' },
  { id: 'npm-global-list', name: 'Global packages', tag: 'npm', command: 'npm list -g --depth=0' },
  { id: 'npm-cache-clean', name: 'Clear npm cache', tag: 'npm', command: 'npm cache clean --force' },

  // --- docker ------------------------------------------------------------------
  { id: 'docker-ps', name: 'Running containers', tag: 'docker', command: 'docker ps' },
  { id: 'docker-ps-all', name: 'All containers', tag: 'docker', command: 'docker ps -a' },
  { id: 'docker-images', name: 'List images', tag: 'docker', command: 'docker images' },
  { id: 'docker-compose-up', name: 'Compose up (detached)', tag: 'docker', command: 'docker compose up -d' },
  { id: 'docker-compose-down', name: 'Compose down', tag: 'docker', command: 'docker compose down' },
  { id: 'docker-logs', name: 'Follow container logs', tag: 'docker', command: 'docker logs -f {{container}}' },
  { id: 'docker-prune', name: 'Clean up unused data', tag: 'docker', command: 'docker system prune -f' },

  // --- network -----------------------------------------------------------------
  {
    id: 'listening-ports', name: 'Listening ports', tag: 'network',
    command: 'Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Format-Table -AutoSize',
  },
  { id: 'ping-host', name: 'Ping a host', tag: 'network', command: 'Test-Connection {{host}} -Count 4' },
  {
    id: 'public-ip', name: 'Public IP address', tag: 'network',
    command: "(Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip",
  },
  {
    id: 'flush-dns', name: 'Flush DNS cache', tag: 'network',
    command: 'Clear-DnsClientCache; Write-Output "DNS cache cleared."',
  },
  { id: 'ip-config', name: 'IP configuration', tag: 'network', command: 'ipconfig /all' },
  { id: 'network-status', name: 'Network status (google.com)', tag: 'network', command: 'Test-NetConnection google.com' },

  // --- system ------------------------------------------------------------------
  {
    id: 'top-cpu-processes', name: 'Top 5 CPU processes', tag: 'system',
    command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name,CPU,Id',
  },
  {
    id: 'top-memory-processes', name: 'Top 5 memory processes', tag: 'system',
    command:
      'Get-Process | Sort-Object WS -Descending | Select-Object -First 5 Name,@{N="MemoryMB";E={[math]::Round($_.WS/1MB,1)}}',
  },
  {
    id: 'system-uptime', name: 'System uptime', tag: 'system',
    command: '(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime',
  },
  { id: 'kill-process-by-name', name: 'Kill process by name', tag: 'system', command: 'Stop-Process -Name {{name}} -Force' },
  {
    id: 'restart-explorer', name: 'Restart Windows Explorer', tag: 'system',
    command: 'Stop-Process -Name explorer -Force; Start-Process explorer.exe',
  },
  { id: 'env-variables', name: 'Environment variables', tag: 'system', command: 'Get-ChildItem Env: | Sort-Object Name' },

  // --- files ------------------------------------------------------------------
  {
    id: 'disk-space', name: 'Disk free space', tag: 'files',
    command:
      'Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N="UsedGB";E={[math]::Round($_.Used/1GB,2)}},@{N="FreeGB";E={[math]::Round($_.Free/1GB,2)}}',
  },
  {
    id: 'biggest-files-downloads', name: 'Biggest files in Downloads', tag: 'files',
    command: 'Get-ChildItem "$env:USERPROFILE\\Downloads" -File | Sort-Object Length -Descending | Select-Object -First 10 Name,Length',
  },
  {
    id: 'temp-folder-size', name: 'Measure temp folder size', tag: 'files',
    command:
      'Get-ChildItem $env:TEMP -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | Select-Object @{N="SizeMB";E={[math]::Round($_.Sum/1MB,1)}},Count',
  },
  {
    id: 'find-files-by-name', name: 'Find files by name', tag: 'files',
    command: 'Get-ChildItem "$env:USERPROFILE\\Documents" -Recurse -Filter "*{{name}}*" -ErrorAction SilentlyContinue | Select-Object FullName',
  },
  {
    id: 'clear-temp-files', name: 'Clear temp files', tag: 'files',
    command: 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Write-Output "Temp folder cleared."',
  },

  // --- utility ------------------------------------------------------------------
  { id: 'current-user', name: 'Current user & groups', tag: 'utility', command: 'whoami; whoami /groups' },
  {
    id: 'installed-apps', name: 'Installed applications', tag: 'utility',
    command:
      "Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Select-Object DisplayName,DisplayVersion | Where-Object DisplayName | Sort-Object DisplayName",
  },
  { id: 'open-url', name: 'Open a URL', tag: 'utility', command: 'Start-Process {{url}}' },
  {
    id: 'random-password', name: 'Generate a random password', tag: 'utility',
    command: '-join ((48..57)+(65..90)+(97..122)|Get-Random -Count 16|%{[char]$_})',
  },
  {
    id: 'battery-status', name: 'Battery status', tag: 'utility',
    command: 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus',
  },
  {
    id: 'recent-updates', name: 'Recent Windows updates', tag: 'utility',
    command: 'Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10',
  },
];

export const DEFAULT_SNIPPETS: Snippet[] = DEFAULT_SNIPPET_SEEDS.map((s) => ({
  ...s,
  pinned: false,
  runCount: 0,
  lastRunAt: null,
  cwd: null,
  shell: 'powershell',
  elevated: false,
  steps: null,
  stdin: null,
  icon: null,
  notes: null,
  env: null,
  expect: null,
  runAfterThis: null,
  runBefore: null,
  stopOnStepError: false,
  schedule: null,
  background: false,
  autoRestart: false,
  externalSource: null,
}));

export function ensureSnippetsFile(): void {
  try {
    if (!fs.existsSync(SNIPPETS_FILE)) {
      writeJsonFileAtomic(SNIPPETS_FILE, DEFAULT_SNIPPETS);
    }
  } catch (err) {
    console.error('Failed to initialize snippets file:', err);
  }
}

export function readSnippets(): Snippet[] {
  ensureSnippetsFile();
  const parsed = readJsonFileSafe<Record<string, unknown>[]>(SNIPPETS_FILE, DEFAULT_SNIPPETS as unknown as Record<string, unknown>[], Array.isArray);
  return parsed.map(sanitizeSnippet);
}

export function writeSnippets(snippets: unknown): Snippet[] {
  if (!Array.isArray(snippets)) {
    throw new Error('Snippets payload must be an array.');
  }
  const sanitized = snippets.map(sanitizeSnippet);
  writeJsonFileAtomic(SNIPPETS_FILE, sanitized);
  return sanitized;
}
