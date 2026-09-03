// details-modal.js — a read-only "Details" panel per snippet: shell/cwd/
// elevation, its Run after/Run before dependencies (in both directions —
// what it depends on, and what depends on it, since that reverse direction
// is otherwise invisible anywhere else in the UI), schedule, assertions,
// and usage stats. Opened from the small info icon on each card.
import { dom } from './dom.js';
import { state } from './state.js';
import { iconSvg } from './icons.js';
import { snippetIcon, SHELL_LABELS, timeAgo } from './utils.js';
import { openModal } from './editor-modal.js';
import { onEditorClosed } from './events.js';
import { groupsForSnippet, openGroupEditor } from './groups-modal.js';

// The snippet id to return to once the editor (opened from a dependency
// link below) closes — set only by snippetLink()'s click, cleared by any
// *normal* close of this modal so a later, unrelated editor session can
// never resurrect a stale "go back to details" jump. See onEditorClosed
// below and its doc comment in events.js for why this is event-bus-based
// rather than editor-modal.js calling back into this module directly.
let pendingReturnId = null;

export function closeDetails() {
  dom.detailsOverlay.hidden = true;
  pendingReturnId = null;
}
export function isDetailsOpen() {
  return !dom.detailsOverlay.hidden;
}
dom.closeDetailsBtn.addEventListener('click', closeDetails);
dom.detailsOverlay.addEventListener('click', (e) => {
  if (e.target === dom.detailsOverlay) closeDetails();
});

onEditorClosed(() => {
  if (!pendingReturnId) return;
  const snippet = state.snippets.find((s) => s.id === pendingReturnId);
  pendingReturnId = null;
  if (snippet) openDetails(snippet);
});

function addRow(label, valueNode) {
  const row = document.createElement('div');
  row.className = 'details-row';
  const labelEl = document.createElement('div');
  labelEl.className = 'details-row-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'details-row-value';
  if (typeof valueNode === 'string') valueEl.textContent = valueNode;
  else valueEl.appendChild(valueNode);
  row.append(labelEl, valueEl);
  dom.detailsBody.appendChild(row);
}

/** A clickable reference to another snippet — jumps straight to editing it, and back to this snippet's own Details once that editor closes (see pendingReturnId above). */
function snippetLink(target, originId) {
  const btn = document.createElement('button');
  btn.className = 'details-link-btn';
  btn.innerHTML = `${snippetIcon(target)} ${target.name}`;
  btn.addEventListener('click', () => {
    pendingReturnId = originId;
    dom.detailsOverlay.hidden = true; // hide without closeDetails() — that would clear pendingReturnId
    openModal(target);
  });
  return btn;
}

/** A clickable reference to a group this snippet belongs to — jumps straight to editing that group. */
function groupLink(group) {
  const btn = document.createElement('button');
  btn.className = 'details-link-btn';
  btn.innerHTML = `${iconSvg('layers')} ${group.name || '(untitled group)'}`;
  if (group.description) btn.title = group.description;
  btn.addEventListener('click', () => {
    dom.detailsOverlay.hidden = true; // hide without closeDetails() — no return-to-details tracking needed here
    openGroupEditor(group);
  });
  return btn;
}

function addSectionHeading(text) {
  const h = document.createElement('div');
  h.className = 'details-section-heading';
  h.textContent = text;
  dom.detailsBody.appendChild(h);
}

export function openDetails(snippet) {
  dom.detailsTitle.textContent = `${snippetIcon(snippet)} ${snippet.name}`;
  dom.detailsBody.innerHTML = '';

  addRow('Tag', snippet.tag);
  addRow('Shell', SHELL_LABELS[snippet.shell] || snippet.shell);
  if (snippet.cwd) addRow('Working directory', snippet.cwd);
  if (snippet.elevated) addRow('Elevation', 'Runs as Administrator (UAC prompt)');
  if (snippet.stdin) addRow('Stdin', 'Provides input as the command runs');
  if (snippet.env && snippet.env.length) addRow('Environment variables', snippet.env.map((e) => e.key).join(', '));
  if (snippet.steps && snippet.steps.length) {
    addRow('Steps', `${snippet.steps.length} steps · ${snippet.stopOnStepError ? 'stops on the first failed step' : 'runs every step regardless of failures'}`);
  }
  if (snippet.expect) {
    const parts = [];
    if (snippet.expect.exitCode !== null) parts.push(`exit code ${snippet.expect.exitCode}`);
    if (snippet.expect.outputContains) parts.push(`output contains "${snippet.expect.outputContains}"`);
    addRow('Expects', parts.join(' · '));
  }

  addSectionHeading('Dependencies');
  const before = snippet.runBefore ? state.snippets.find((s) => s.id === snippet.runBefore) : null;
  const after = snippet.runAfterThis ? state.snippets.find((s) => s.id === snippet.runAfterThis) : null;
  const runsAfterThis = state.snippets.filter((s) => s.runAfterThis === snippet.id);
  const runsBeforeThis = state.snippets.filter((s) => s.runBefore === snippet.id);

  addRow('Runs before it', before ? snippetLink(before, snippet.id) : '— (none)');
  addRow('Runs after it', after ? snippetLink(after, snippet.id) : '— (none)');
  if (runsAfterThis.length) {
    const wrap = document.createElement('div');
    runsAfterThis.forEach((s) => wrap.appendChild(snippetLink(s, snippet.id)));
    addRow('Runs once this finishes', wrap);
  }
  if (runsBeforeThis.length) {
    const wrap = document.createElement('div');
    runsBeforeThis.forEach((s) => wrap.appendChild(snippetLink(s, snippet.id)));
    addRow('Runs this one first', wrap);
  }
  if (!before && !after && runsAfterThis.length === 0 && runsBeforeThis.length === 0) {
    addRow('', 'No run-before/run-after links to or from this snippet.');
  }

  if (snippet.schedule && snippet.schedule.enabled) {
    addSectionHeading('Schedule');
    const sch = snippet.schedule;
    const desc = sch.type === 'interval' ? `every ${sch.intervalMinutes} minute(s)`
      : sch.type === 'daily' ? `daily at ${sch.dailyTime}`
      : `cron "${sch.cronExpr}"`;
    addRow('Runs', desc);
    if (sch.lastRunAt) addRow('Last scheduled run', timeAgo(sch.lastRunAt));
  }

  const memberGroups = groupsForSnippet(snippet.id);
  if (memberGroups.length > 0) {
    addSectionHeading('Groups');
    const wrap = document.createElement('div');
    memberGroups.forEach((g) => wrap.appendChild(groupLink(g)));
    addRow('In groups', wrap);
  }

  addSectionHeading('Stats');
  addRow('Pinned', snippet.pinned ? 'Yes' : 'No');
  addRow('Run count', String(snippet.runCount || 0));
  if (snippet.lastRunAt) addRow('Last run', timeAgo(snippet.lastRunAt));

  dom.detailsOverlay.hidden = false;
}
