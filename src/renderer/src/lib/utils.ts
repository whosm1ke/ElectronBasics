// utils.ts — small, stateless helpers shared across the renderer. No DOM,
// no Electron API calls, no imports of any other app module. Ported
// verbatim from modules/utils.js (now a re-export shim pointing here) —
// see CLAUDE.md's migration notes on the strangler-fig approach.
import { differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks, differenceInMonths, differenceInYears } from 'date-fns';
import { newId } from '@shared/id';
import type { Snippet, ShellType, PipelineEdge, PipelineNode, Pipeline, Group } from '@shared/types';

// Re-exported (not reimplemented) — used to be its own near-identical copy
// here, consolidated into one shared implementation once the zod schemas in
// @shared/types needed the same generator for their id-backfill logic.
// Every call site in this file passes its own prefix explicitly, so
// @shared/id's default ('id') vs this file's old default ('snip') was never
// actually relied upon.
export { newId };

export const TAG_ICONS: Record<string, string> = {
  network: '\u{1F310}', system: '\u{1F5A5}\u{FE0F}', disk: '\u{1F4BE}',
  hardware: '\u{1F529}', apps: '\u{1F4E6}', security: '\u{1F6E1}\u{FE0F}',
  dev: '\u{1F9D1}‍\u{1F4BB}', files: '\u{1F4C1}', misc: '\u{1F527}',
  git: '\u{1F500}', npm: '\u{1F4E6}', docker: '\u{1F433}', utility: '\u{1F9F0}',
};

export const SHELL_LABELS: Record<ShellType, string> = {
  powershell: 'PowerShell', cmd: 'CMD', gitbash: 'Git Bash', wsl: 'WSL', node: 'Node.js', python: 'Python', ssh: 'SSH',
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

// Kept this app's own compact "Ns/Nm/Nh/Nd ago" style rather than switching
// to date-fns's formatDistanceToNow() (wordier: "about 13 hours ago") — the
// actual gap this replaced date-fns for was accuracy past the day tier, not
// the visual style. Hand-rolled month/year math (dividing seconds by a
// fixed 86400*30/86400*365) drifts against real calendar months/years;
// date-fns's differenceInX() functions account for actual month lengths and
// leap years, so a run "412d ago" now correctly reads as "1y ago" instead.
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = Date.now();
  const sec = Math.max(0, differenceInSeconds(now, date));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = differenceInMinutes(now, date);
  if (min < 60) return `${min}m ago`;
  const hr = differenceInHours(now, date);
  if (hr < 24) return `${hr}h ago`;
  const day = differenceInDays(now, date);
  if (day < 7) return `${day}d ago`;
  const week = differenceInWeeks(now, date);
  if (week < 5) return `${week}w ago`; // caps at 4 to avoid ever reading "4w ago" and "1mo ago" for dates a day apart
  const month = differenceInMonths(now, date);
  if (month < 12) return `${month}mo ago`;
  return `${differenceInYears(now, date)}y ago`;
}

// timeAgo's mirror image, for a moment in the future rather than the past —
// used by the Schedule overview screen ("next run: in 4h"). Same tiering,
// same date-fns-for-month/year-accuracy reasoning as timeAgo above.
export function timeUntil(date: Date): string {
  const now = Date.now();
  const sec = Math.max(0, differenceInSeconds(date, now));
  if (sec < 5) return 'any moment now';
  if (sec < 60) return `in ${sec}s`;
  const min = differenceInMinutes(date, now);
  if (min < 60) return `in ${min}m`;
  const hr = differenceInHours(date, now);
  if (hr < 24) return `in ${hr}h`;
  const day = differenceInDays(date, now);
  if (day < 7) return `in ${day}d`;
  const week = differenceInWeeks(date, now);
  if (week < 5) return `in ${week}w`;
  const month = differenceInMonths(date, now);
  if (month < 12) return `in ${month}mo`;
  return `in ${differenceInYears(date, now)}y`;
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

export type CreateEdgeResult = { ok: true; edge: PipelineEdge } | { ok: false; error: string };

/**
 * Validates and builds a new `from -> to` edge (duplicate-connection and
 * cycle checks, both pre-existing rules — see pipelineEdgeCreatesCycle
 * above) without touching any state itself. Shared by both ways this app
 * lets you connect two steps: dragging from a step's out-port onto another
 * step's in-port on the canvas (PipelineCanvas.tsx's onConnect), and the
 * Inspector's explicit "+ Connect to…" picker (PipelinesModal.tsx) — the
 * latter exists as a reliable, precision-drag-free alternative for exactly
 * this pipeline's set of steps, not just a nice-to-have.
 */
export function tryCreatePipelineEdge(edges: PipelineEdge[], from: string, to: string): CreateEdgeResult {
  if (from === to) return { ok: false, error: "A step can't connect to itself" };
  if (edges.some((e) => e.from === from && e.to === to)) {
    return { ok: false, error: 'These two steps are already connected' };
  }
  if (pipelineEdgeCreatesCycle(edges, from, to)) {
    return { ok: false, error: "Can't connect — that would create a loop" };
  }
  return { ok: true, edge: { id: newId('edge'), from, to, condition: 'success', value: null } };
}

/** The human-readable form of a pipeline edge's branch condition — shared by the Inspector's "Connects to" list (PipelinesModal.tsx) and the canvas edge label itself (PipelineConditionEdge.tsx), so the two never drift apart. */
export function pipelineConditionLabel({ condition, value }: Pick<PipelineEdge, 'condition' | 'value'>): string {
  switch (condition) {
    case 'success':
      return 'on success';
    case 'failure':
      return 'on failure';
    case 'always':
      return 'always';
    case 'exitCode':
      return `exit = ${value ?? '?'}`;
    case 'outputContains':
      return `has "${value ?? ''}"`;
    default:
      return condition;
  }
}

/** Every distinct `{{placeholder}}` name across a plain list of snippets — the batch/group equivalent of collectPipelinePlaceholders() below, for BatchModal.tsx's own param-gate (a manually-selected batch, or a Group's "Run"). */
export function collectPlaceholders(snippets: Snippet[]): string[] {
  const names = new Set<string>();
  for (const snippet of snippets) {
    extractPlaceholders(runnableTextOf(snippet)).forEach((name) => names.add(name));
  }
  return Array.from(names);
}

/**
 * Same scan as collectPlaceholders(), but keyed the other way round: which
 * snippet name(s) actually need a given `{{placeholder}}` — passed to
 * ParamForm.tsx's own `usedBy` prop so a batch/group's shared "collect
 * every value once" gate can say *for* which snippet a field is, instead of
 * a flat list of names with no indication which snippet each one belongs
 * to (the exact confusion this was added to fix).
 */
export function collectPlaceholdersUsedBy(snippets: Snippet[]): Record<string, string[]> {
  const usedBy: Record<string, string[]> = {};
  for (const snippet of snippets) {
    const label = snippet.name || '(untitled)';
    for (const name of extractPlaceholders(runnableTextOf(snippet))) {
      (usedBy[name] ??= []).push(label);
    }
  }
  return usedBy;
}

/**
 * Every distinct `{{placeholder}}` name across every 'step' node's snippet
 * in this pipeline, collected once so the whole run can be prompted up
 * front (see PipelinesModal.tsx's param-gate) instead of skipping every
 * parameterized step outright. Deliberately does NOT recurse into a
 * 'pipeline'-kind node's own sub-pipeline — a parameterized step inside a
 * nested sub-pipeline still gets skipped unless its placeholder name
 * happens to already be one this top-level prompt collected; scanning
 * every level down would mean loading every referenced pipeline's own
 * nodes just to build this list, for a rarely-hit case.
 */
export function collectPipelinePlaceholders(nodes: PipelineNode[], snippets: Snippet[]): string[] {
  const names = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'step') continue;
    const snippet = snippets.find((s) => s.id === n.snippetId);
    if (!snippet) continue;
    extractPlaceholders(runnableTextOf(snippet)).forEach((name) => names.add(name));
  }
  return Array.from(names);
}

/** Same idea as collectPlaceholdersUsedBy() above, for a pipeline's own step nodes — which step(s) (by their snippet's name) a given {{placeholder}} actually belongs to, for the pipeline's own param-gate modal. */
export function collectPipelinePlaceholdersUsedBy(nodes: PipelineNode[], snippets: Snippet[]): Record<string, string[]> {
  const usedBy: Record<string, string[]> = {};
  for (const n of nodes) {
    if (n.kind !== 'step') continue;
    const snippet = snippets.find((s) => s.id === n.snippetId);
    if (!snippet) continue;
    const label = snippet.name || '(untitled)';
    for (const name of extractPlaceholders(runnableTextOf(snippet))) {
      (usedBy[name] ??= []).push(label);
    }
  }
  return usedBy;
}

/** A pipeline node's display name regardless of kind — the Inspector's "Connects to" list and canvas node components each need this same lookup (a step's snippet name, a sub-pipeline's or group's own name, or a short generic caption for delay/gate). */
export function pipelineNodeDisplayName(node: Pick<PipelineNode, 'kind' | 'snippetId' | 'subPipelineId' | 'groupId' | 'label' | 'delaySeconds'>, snippets: Snippet[], pipelines: Pipeline[], groups: Group[]): string {
  if (node.kind === 'step') return snippets.find((s) => s.id === node.snippetId)?.name || '⚠ (deleted snippet)';
  if (node.kind === 'pipeline') return pipelines.find((p) => p.id === node.subPipelineId)?.name || node.label || '⚠ (pipeline not found)';
  if (node.kind === 'group') return groups.find((g) => g.id === node.groupId)?.name || node.label || '⚠ (group not found)';
  if (node.kind === 'delay') return node.label || `Wait ${node.delaySeconds}s`;
  return node.label || 'Approval gate';
}

/**
 * Would pipeline `editingId` (about to be saved with `subPipelineIds` —
 * every OTHER pipeline its own 'pipeline'-kind nodes now point at) end up
 * indirectly referencing itself? Walks forward through every OTHER saved
 * pipeline's own sub-pipeline references — same "does X eventually reach
 * itself" shape as pipelineEdgeCreatesCycle above, just one level up (across
 * pipelines instead of within one graph). A brand-new pipeline (editingId
 * null) can't be part of a cycle yet — nothing else can already point at an
 * id that doesn't exist.
 */
export function pipelineReferenceCreatesCycle(pipelines: Pipeline[], editingId: string | null, subPipelineIds: string[]): boolean {
  if (!editingId) return false;
  const byId = new Map(pipelines.map((p) => [p.id, p]));
  const visited = new Set<string>();
  const stack = [...subPipelineIds];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === editingId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const p = byId.get(cur);
    if (!p) continue;
    p.nodes.filter((n) => n.kind === 'pipeline' && n.subPipelineId).forEach((n) => stack.push(n.subPipelineId));
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
