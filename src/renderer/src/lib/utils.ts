// utils.ts — small, stateless helpers shared across the renderer. No DOM,
// no Electron API calls, no imports of any other app module. Ported
// verbatim from modules/utils.js (now a re-export shim pointing here) —
// see CLAUDE.md's migration notes on the strangler-fig approach.
import type { Snippet, ShellType, PipelineEdge } from '@shared/types';

export const TAG_ICONS: Record<string, string> = {
  network: '\u{1F310}', system: '\u{1F5A5}\u{FE0F}', disk: '\u{1F4BE}',
  hardware: '\u{1F529}', apps: '\u{1F4E6}', security: '\u{1F6E1}\u{FE0F}',
  dev: '\u{1F9D1}‍\u{1F4BB}', files: '\u{1F4C1}', misc: '\u{1F527}',
  git: '\u{1F500}', npm: '\u{1F4E6}', docker: '\u{1F433}', utility: '\u{1F9F0}',
};

export const SHELL_LABELS: Record<ShellType, string> = {
  powershell: 'PowerShell', cmd: 'CMD', gitbash: 'Git Bash', wsl: 'WSL', node: 'Node.js', python: 'Python',
};

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
  return Array.from(names);
}

export function substituteAll(text: string, values: Record<string, string> | null | undefined): string {
  if (!values) return text;
  return text.replace(PLACEHOLDER_RE, (_, k) => values[k] ?? '');
}

export function runnableTextOf(snippet: Pick<Snippet, 'steps' | 'command'>): string {
  return snippet.steps && snippet.steps.length ? snippet.steps.join('\n') : snippet.command;
}

export function hashHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function tagIcon(tag: string): string {
  const key = tag.toLowerCase();
  return TAG_ICONS[key] || tag.charAt(0).toUpperCase() || '\u{1F529}';
}

export function snippetIcon(snippet: Pick<Snippet, 'icon' | 'tag'>): string {
  return snippet.icon || tagIcon(snippet.tag);
}

export function tagColors(tag: string): { bg: string; fg: string } {
  const hue = hashHue(tag.toLowerCase());
  return {
    bg: `hsla(${hue}, 75%, 60%, 0.16)`,
    fg: `hsl(${hue}, 85%, 74%)`,
  };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(str: unknown): string {
  return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function prettyMaybeJson(text: string): string {
  const t = text.trim();
  if (!t) return text;
  const looksJson = (t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']');
  if (!looksJson) return text;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return text;
  }
}

export function newId(prefix = 'snip'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Detects a cycle in the combined runBefore/runAfterThis precedence graph.
 * Both fields point from a snippet to another one it has a fixed run-order
 * with — `s.runBefore = X` means X must finish before s (edge X -> s);
 * `s.runAfterThis = Y` means Y runs right after s (edge s -> Y) — so they
 * share one graph. Returns the cycle as an ordered array of ids (first id
 * repeated at the end), or null if the graph is acyclic. Pass the full
 * snippet list with the pending edit already applied (see editor-modal.js)
 * — this only reports on what's actually there, it doesn't know which node
 * you're mid-editing.
 */
export function findDependencyCycle(snippets: Pick<Snippet, 'id' | 'runBefore' | 'runAfterThis'>[]): string[] | null {
  const successors = new Map<string, string[]>(snippets.map((s) => [s.id, []]));
  snippets.forEach((s) => {
    if (s.runBefore && successors.has(s.runBefore)) successors.get(s.runBefore)!.push(s.id);
    if (s.runAfterThis && successors.has(s.runAfterThis)) successors.get(s.id)!.push(s.runAfterThis);
  });
  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const visitState = new Map<string, number>(snippets.map((s) => [s.id, UNVISITED]));
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    visitState.set(id, VISITING);
    stack.push(id);
    for (const next of successors.get(id) || []) {
      if (visitState.get(next) === VISITING) return stack.slice(stack.indexOf(next)).concat(next);
      if (visitState.get(next) === UNVISITED) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    visitState.set(id, DONE);
    return null;
  }

  for (const s of snippets) {
    if (visitState.get(s.id) === UNVISITED) {
      const found = visit(s.id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Would adding a `from -> to` edge to a pipeline's existing `edges`
 * ({from, to}, node ids) create a cycle? True iff `to` can already reach
 * `from` by following existing edges — completing that path with the new
 * edge would loop back to `from`. Used by pipeline-editor.js before saving
 * a new connection; kept here (not in pipeline-editor.js) since it's a
 * pure graph function with no DOM/state dependency, same reasoning as
 * findDependencyCycle above.
 */
export function pipelineEdgeCreatesCycle(edges: Pick<PipelineEdge, 'from' | 'to'>[], from: string, to: string): boolean {
  if (from === to) return true;
  const successors = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!successors.has(e.from)) successors.set(e.from, []);
    successors.get(e.from)!.push(e.to);
  });
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    (successors.get(cur) || []).forEach((n) => stack.push(n));
  }
  return false;
}

/** The "PowerShell · 3-step sequence · ran 4× · last 2m ago"-style meta line under a card's title. Shared by cards.js (initial render) and run-engine.js (in-place patch after a run, so a run doesn't need a full card rebuild just to update this text). */
export function buildCardMetaText(snippet: Snippet): string {
  const parts: string[] = [];
  if (snippet.shell !== 'powershell') parts.push(SHELL_LABELS[snippet.shell] || snippet.shell);
  if (snippet.steps && snippet.steps.length) parts.push(`${snippet.steps.length}-step sequence`);
  if (snippet.cwd) parts.push(`in ${snippet.cwd}`);
  if (snippet.schedule && snippet.schedule.enabled) {
    const sch = snippet.schedule;
    parts.push(
      sch.type === 'interval'
        ? `every ${sch.intervalMinutes}m`
        : sch.type === 'daily'
          ? `daily ${sch.dailyTime}`
          : `cron ${sch.cronExpr}`
    );
  }
  if (snippet.runCount > 0) parts.push(`ran ${snippet.runCount}× · last ${timeAgo(snippet.lastRunAt)}`);
  return parts.join(' · ');
}
