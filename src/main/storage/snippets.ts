// storage/snippets.ts — the snippet library: schema, defaults, read/write.
// sanitizeSnippet() is the schema's single source of truth; it backfills
// missing fields on read (so hand-edited or older-schema files never break
// the UI) and on write (so nothing malformed ever reaches disk).
import fs from 'node:fs';
import path from 'node:path';
import { SNIPPETS_FILE } from '../paths';
import { newId } from '../id';
import { backupSnippetsIfDue } from './backups';
import { readJsonFileSafe } from '../json-file';
import type { Snippet, ShellType, EnvVar, ExpectConfig, ScheduleConfig } from '@shared/types';
import { VALID_SHELLS } from '@shared/types';

export { VALID_SHELLS };

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
}));

function sanitizeEnvList(env: unknown): EnvVar[] | null {
  if (!Array.isArray(env)) return null;
  const cleaned = env
    .map((e) => ({
      key: String((e && e.key) ?? '').trim().slice(0, 100),
      value: String((e && e.value) ?? '').slice(0, 2000),
    }))
    .filter((e) => e.key)
    .slice(0, 20);
  return cleaned.length ? cleaned : null;
}

function sanitizeExpect(exp: unknown): ExpectConfig | null {
  if (!exp || typeof exp !== 'object') return null;
  const e = exp as { exitCode?: unknown; outputContains?: unknown };
  const exitCode = Number.isFinite(e.exitCode) ? (e.exitCode as number) : null;
  const outputContains =
    typeof e.outputContains === 'string' && e.outputContains.trim() ? e.outputContains.slice(0, 500) : null;
  if (exitCode === null && !outputContains) return null;
  return { exitCode, outputContains };
}

function sanitizeSchedule(sch: unknown): ScheduleConfig | null {
  if (!sch || typeof sch !== 'object') return null;
  const s = sch as Record<string, unknown>;
  const type = ['interval', 'daily', 'cron'].includes(s.type as string) ? (s.type as ScheduleConfig['type']) : 'interval';
  return {
    enabled: Boolean(s.enabled),
    type,
    intervalMinutes: Number.isFinite(s.intervalMinutes) ? Math.max(1, Math.round(s.intervalMinutes as number)) : 60,
    dailyTime: /^\d{2}:\d{2}$/.test((s.dailyTime as string) || '') ? (s.dailyTime as string) : '09:00',
    cronExpr:
      typeof s.cronExpr === 'string' && s.cronExpr.trim() ? s.cronExpr.trim().slice(0, 100) : '*/15 * * * *',
    lastRunAt: s.lastRunAt ? String(s.lastRunAt) : null,
  };
}

/** Normalizes a raw snippet object, backfilling fields older/hand-edited files may lack. */
export function sanitizeSnippet(s: Record<string, unknown>): Snippet {
  const steps = Array.isArray(s.steps)
    ? (s.steps as unknown[]).map((step) => String(step).slice(0, 5000)).slice(0, 20).filter(Boolean)
    : null;
  return {
    id: String(s.id ?? newId('snip')),
    name: String(s.name ?? '').slice(0, 200),
    tag: String(s.tag ?? 'misc').slice(0, 50),
    command: String(s.command ?? '').slice(0, 5000),
    pinned: Boolean(s.pinned),
    runCount: Number.isFinite(s.runCount) ? (s.runCount as number) : 0,
    lastRunAt: s.lastRunAt ? String(s.lastRunAt) : null,
    cwd: s.cwd ? String(s.cwd).slice(0, 1000) : null,
    shell: VALID_SHELLS.includes(s.shell as ShellType) ? (s.shell as ShellType) : 'powershell',
    elevated: Boolean(s.elevated),
    steps: steps && steps.length > 0 ? steps : null,
    stdin: s.stdin ? String(s.stdin).slice(0, 5000) : null,
    icon: s.icon ? String(s.icon).slice(0, 8) : null,
    notes: s.notes ? String(s.notes).slice(0, 2000) : null,
    env: sanitizeEnvList(s.env),
    expect: sanitizeExpect(s.expect),
    runAfterThis: s.runAfterThis ? String(s.runAfterThis) : null,
    runBefore: s.runBefore ? String(s.runBefore) : null,
    stopOnStepError: Boolean(s.stopOnStepError),
    schedule: sanitizeSchedule(s.schedule),
    // `background`: run as a long-lived process (Start/Stop instead of a
    // one-shot Run) — only meaningful for a single-command snippet, never a
    // multi-step sequence (see process-manager.ts). `autoRestart` only
    // matters when `background` is also true.
    background: Boolean(s.background) && !(steps && steps.length > 0),
    autoRestart: Boolean(s.autoRestart),
  };
}

export function ensureSnippetsFile(): void {
  try {
    if (!fs.existsSync(SNIPPETS_FILE)) {
      fs.mkdirSync(path.dirname(SNIPPETS_FILE), { recursive: true });
      fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(DEFAULT_SNIPPETS, null, 2), 'utf8');
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
  backupSnippetsIfDue(); // snapshot the pre-change state (throttled, see storage/backups.ts)
  fs.mkdirSync(path.dirname(SNIPPETS_FILE), { recursive: true });
  fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}
