// utils.js — small, stateless helpers shared across the renderer. No DOM,
// no Electron API calls, no imports of any other app module.

export const TAG_ICONS = {
  network: '\u{1F310}', system: '\u{1F5A5}\u{FE0F}', disk: '\u{1F4BE}',
  hardware: '\u{1F529}', apps: '\u{1F4E6}', security: '\u{1F6E1}\u{FE0F}',
  dev: '\u{1F9D1}‍\u{1F4BB}', files: '\u{1F4C1}', misc: '\u{1F527}',
  git: '\u{1F500}', npm: '\u{1F4E6}', docker: '\u{1F433}', utility: '\u{1F9F0}',
};

export const SHELL_LABELS = {
  powershell: 'PowerShell', cmd: 'CMD', gitbash: 'Git Bash', wsl: 'WSL', node: 'Node.js', python: 'Python',
};

export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(text) {
  if (!text) return [];
  const names = new Set();
  for (const m of text.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
  return Array.from(names);
}

export function substituteAll(text, values) {
  if (!values) return text;
  return text.replace(PLACEHOLDER_RE, (_, k) => (values[k] ?? ''));
}

export function runnableTextOf(snippet) {
  return snippet.steps && snippet.steps.length ? snippet.steps.join('\n') : snippet.command;
}

export function hashHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function tagIcon(tag) {
  const key = tag.toLowerCase();
  return TAG_ICONS[key] || tag.charAt(0).toUpperCase() || '\u{1F529}';
}

export function snippetIcon(snippet) {
  return snippet.icon || tagIcon(snippet.tag);
}

export function tagColors(tag) {
  const hue = hashHue(tag.toLowerCase());
  return {
    bg: `hsla(${hue}, 75%, 60%, 0.16)`,
    fg: `hsl(${hue}, 85%, 74%)`,
  };
}

export function timeAgo(iso) {
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

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function prettyMaybeJson(text) {
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

export function newId(prefix = 'snip') {
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
export function findDependencyCycle(snippets) {
  const successors = new Map(snippets.map((s) => [s.id, []]));
  snippets.forEach((s) => {
    if (s.runBefore && successors.has(s.runBefore)) successors.get(s.runBefore).push(s.id);
    if (s.runAfterThis && successors.has(s.runAfterThis)) successors.get(s.id).push(s.runAfterThis);
  });
  const UNVISITED = 0; const VISITING = 1; const DONE = 2;
  const state2 = new Map(snippets.map((s) => [s.id, UNVISITED]));
  const stack = [];

  function visit(id) {
    state2.set(id, VISITING);
    stack.push(id);
    for (const next of successors.get(id) || []) {
      if (state2.get(next) === VISITING) return stack.slice(stack.indexOf(next)).concat(next);
      if (state2.get(next) === UNVISITED) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state2.set(id, DONE);
    return null;
  }

  for (const s of snippets) {
    if (state2.get(s.id) === UNVISITED) {
      const found = visit(s.id);
      if (found) return found;
    }
  }
  return null;
}

/** The "PowerShell · 3-step sequence · ran 4× · last 2m ago"-style meta line under a card's title. Shared by cards.js (initial render) and run-engine.js (in-place patch after a run, so a run doesn't need a full card rebuild just to update this text). */
export function buildCardMetaText(snippet) {
  const parts = [];
  if (snippet.shell !== 'powershell') parts.push(SHELL_LABELS[snippet.shell] || snippet.shell);
  if (snippet.steps && snippet.steps.length) parts.push(`${snippet.steps.length}-step sequence`);
  if (snippet.cwd) parts.push(`in ${snippet.cwd}`);
  if (snippet.schedule && snippet.schedule.enabled) {
    const sch = snippet.schedule;
    parts.push(sch.type === 'interval' ? `every ${sch.intervalMinutes}m`
      : sch.type === 'daily' ? `daily ${sch.dailyTime}`
      : `cron ${sch.cronExpr}`);
  }
  if (snippet.runCount > 0) parts.push(`ran ${snippet.runCount}× · last ${timeAgo(snippet.lastRunAt)}`);
  return parts.join(' · ');
}
