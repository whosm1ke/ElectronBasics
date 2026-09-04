// runEngine.ts — actually runs a snippet (single command or sequence),
// plus its "run before"/"run after" chain, into a single card's output
// panel: the panel the user actually clicked Run on ("the root"). Every
// chain member runs and renders into that same panel as its own labeled
// section, rather than each snippet in the chain updating its own card —
// one console per triggered run, not one per snippet, with clear before/
// (this one)/after sections so it's obvious what ran and in what order.
// Card.tsx owns the Run button and the placeholder-collection step; this
// module just needs the already-resolved command text and the DOM pieces
// of the root card to render into — ported from modules/run-engine.js with
// that same DOM-patching design kept as-is (not componentized): it renders
// into real DOM elements Card.tsx hands it via refs, exactly as the
// original rendered into elements cards.js handed it.
import type { Snippet, RunResult, SequenceResult, DebugInfo } from '@shared/types';
import { iconSvg } from './icons';
import { prettyMaybeJson, runnableTextOf, extractPlaceholders, buildCardMetaText, snippetIcon } from './utils';
import { playTone, maybeNotify } from './appearance';
import { persistSnippets } from './snippetsStore';
import { showToast } from '../store/useToastStore';
import { useUiStore } from '../store/useUiStore';
import { state } from '../../modules/state';

const MAX_CHAIN_HOPS = 20; // backstop only — `visited` (see runChainMember) is what actually prevents re-running a snippet already seen in this chain

function findCardEl(snippetId: string): HTMLElement | null {
  return document.querySelector(`.card[data-snippet-id="${snippetId}"]`);
}

/** Rewrites a card's "ran N× · last …" meta line in place — cheaper and, critically, DOM-stable compared to letting the runCount bump trigger a full card-list rebuild mid-run (see persistSnippets' `silent` option). */
function patchCardMeta(cardEl: HTMLElement | null, snippet: Snippet): void {
  if (!cardEl) return;
  const titleGroup = cardEl.querySelector('.card-title-group');
  if (!titleGroup) return;
  const text = buildCardMetaText(snippet);
  let meta = titleGroup.querySelector('.card-meta');
  if (!text) {
    if (meta) meta.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'card-meta';
    titleGroup.appendChild(meta);
  }
  meta.textContent = text;
}

async function recordRun(snippet: Snippet, cardEl: HTMLElement | null = null): Promise<void> {
  const target = (state.snippets as Snippet[]).find((s) => s.id === snippet.id);
  if (target) {
    target.runCount = (target.runCount || 0) + 1;
    target.lastRunAt = new Date().toISOString();
    await persistSnippets({ silent: true });
    patchCardMeta(cardEl, target);
  }
}

export interface AssertionResult {
  pass: boolean;
  reasons: string[];
}

export function checkExpectation(snippet: Snippet, result: { code: number; stdout?: string; stderr?: string }): AssertionResult | null {
  if (!snippet.expect) return null;
  const { exitCode, outputContains } = snippet.expect;
  const reasons: string[] = [];
  if (exitCode !== null && result.code !== exitCode) reasons.push(`exit code ${result.code} ≠ expected ${exitCode}`);
  if (outputContains) {
    const haystack = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (!haystack.includes(outputContains)) reasons.push(`output does not contain "${outputContains}"`);
  }
  return { pass: reasons.length === 0, reasons };
}

function renderAssertion(body: HTMLElement, assertion: AssertionResult): void {
  const line = document.createElement('div');
  line.className = 'assertion-line ' + (assertion.pass ? 'pass' : 'fail');
  line.innerHTML = `${iconSvg(assertion.pass ? 'check' : 'warning')}<span>${
    assertion.pass ? 'Expectation met' : `Expectation failed — ${assertion.reasons.join('; ')}`
  }</span>`;
  body.appendChild(line);
}

function renderCommandResult(body: HTMLElement, result: RunResult): string {
  body.innerHTML = '';
  const { stdout, stderr } = result;
  if (stdout) {
    const pre = document.createElement('div');
    pre.className = 'stdout';
    pre.textContent = prettyMaybeJson(stdout.trim());
    body.appendChild(pre);
  }
  if (stderr) {
    const pre = document.createElement('div');
    pre.className = 'stderr';
    pre.textContent = stderr.trim();
    body.appendChild(pre);
  }
  if (!stdout && !stderr) body.textContent = '(no output)';
  return (stdout || stderr || '').trim();
}

function renderSequenceResult(body: HTMLElement, result: SequenceResult, totalStepCount: number): string {
  body.innerHTML = '';
  const parts: string[] = [];
  result.steps.forEach((step, i) => {
    const block = document.createElement('div');
    block.className = 'step-block';
    const titleEl = document.createElement('div');
    titleEl.className = 'step-block-title';
    titleEl.innerHTML = `<span class="status-dot ${step.code === 0 ? 'ok' : 'error'}"></span>Step ${i + 1} — exit ${step.code}`;
    block.appendChild(titleEl);

    const text = prettyMaybeJson((step.stdout || '').trim()) || (step.stderr || '').trim() || '(no output)';
    const textEl = document.createElement('div');
    textEl.className = step.stderr && !step.stdout ? 'stderr' : 'stdout';
    textEl.textContent = text;
    block.appendChild(textEl);
    body.appendChild(block);

    parts.push(`Step ${i + 1}: ${text}`);
  });
  if (result.steps.length < totalStepCount) {
    const skipped = document.createElement('div');
    skipped.className = 'step-block step-block-skipped';
    skipped.textContent = `Stopped after step ${result.steps.length} failed — ${totalStepCount - result.steps.length} step(s) not run (Stop on step failure is on for this snippet).`;
    body.appendChild(skipped);
    parts.push(skipped.textContent);
  }
  return parts.join('\n\n');
}

type ExecResult =
  | { isSeq: true; steps: string[]; success: boolean; raw: SequenceResult }
  | { isSeq: false; success: boolean; raw: RunResult };

/** Runs `snippet` (pure — no DOM) via IPC. `overridePayload` is the already placeholder-substituted command/steps for the root snippet only; every chain member below the root is guaranteed placeholder-free (checked before it's ever reached) and just uses its own stored command/steps. */
async function executeSnippet(snippet: Snippet, overridePayload: string | string[] | null = null): Promise<ExecResult> {
  const isSeq = Boolean(snippet.steps && snippet.steps.length);
  if (isSeq) {
    const steps = (overridePayload as string[] | null) || snippet.steps!;
    const result = await window.electronAPI.runSequence({
      steps,
      snippetId: snippet.id,
      snippetName: snippet.name,
      cwd: snippet.cwd,
      shell: snippet.shell,
      elevated: snippet.elevated,
      env: snippet.env,
      stopOnError: Boolean(snippet.stopOnStepError),
    });
    return { isSeq: true, steps, success: result.overallCode === 0, raw: result };
  }
  const command = (overridePayload as string | null) || snippet.command;
  const result = await window.electronAPI.runCommand({
    command,
    snippetId: snippet.id,
    snippetName: snippet.name,
    cwd: snippet.cwd,
    shell: snippet.shell,
    elevated: snippet.elevated,
    env: snippet.env,
    stdin: snippet.stdin,
    debug: useUiStore.getState().devModeEnabled,
  });
  return { isSeq: false, success: result.code === 0, raw: result };
}

/** True when running `snippet` would involve any before/after hop at all — decided once, up front, so the root's output panel picks a layout (plain vs. labeled sections) for the whole run instead of switching mid-way. */
function involvesChain(snippet: Snippet): boolean {
  return Boolean(snippet.runBefore || snippet.runAfterThis);
}

/** Builds one labeled section (status dot, optional before/after badge, snippet name, body) inside the root output panel. Returns null in "plain" (non-chain) mode, where the caller renders straight into the root body instead — see runChainMember. */
function buildChainSection(rootBody: HTMLElement, snippet: Snippet, role: 'before' | 'after' | null): { dot: HTMLElement; body: HTMLElement } {
  const section = document.createElement('div');
  section.className = 'chain-section';
  const header = document.createElement('div');
  header.className = 'chain-section-header';
  const dot = document.createElement('span');
  dot.className = 'status-dot running';
  header.appendChild(dot);
  if (role) {
    const badge = document.createElement('span');
    badge.className = `chain-role-badge chain-role-${role}`;
    badge.textContent = role;
    header.appendChild(badge);
  }
  const nameEl = document.createElement('span');
  nameEl.className = 'chain-section-name';
  nameEl.textContent = `${snippetIcon(snippet)} ${snippet.name}`;
  header.appendChild(nameEl);
  const body = document.createElement('div');
  body.className = 'chain-section-body';
  section.append(header, body);
  rootBody.appendChild(section);
  return { dot, body };
}

interface ChainContext {
  visited: Set<string>;
  hops: number;
  sectioned: boolean;
  rootBody: HTMLElement;
  combinedText: string[];
  setStatus(kind: string, text: string): void;
}

interface ChainMemberResult {
  success: boolean;
  result?: { code: number; stdout: string; stderr: string };
  isSeq?: boolean;
}

/**
 * Runs one snippet — the root the user clicked Run on, or a before/after
 * chain hop reached from it — into `ctx`'s root output panel. `visited`
 * (shared across the whole call tree via `ctx`) is the real guard against
 * a runBefore/runAfterThis pair pointing at each other and re-running
 * something already run in this chain; `ctx.hops` is only a hard backstop
 * in case that guard ever misses a case.
 */
async function runChainMember(snippet: Snippet, ctx: ChainContext, role: 'before' | 'after' | null, overridePayload: string | string[] | null = null): Promise<ChainMemberResult> {
  if (ctx.visited.has(snippet.id) || ctx.hops++ > MAX_CHAIN_HOPS) return { success: true };
  ctx.visited.add(snippet.id);

  // Resolve (and render) any "before" prelude FIRST, so its section lands
  // above this snippet's own in the output panel — sections always appear
  // in the order things actually ran, not the order runChainMember was
  // called in.
  ctx.setStatus('running', role ? `Running "${snippet.name}" (${role})…` : `Running "${snippet.name}"…`);

  const snippets = state.snippets as Snippet[];

  if (snippet.runBefore) {
    const before = snippets.find((s) => s.id === snippet.runBefore);
    if (before && !ctx.visited.has(before.id)) {
      if (extractPlaceholders(runnableTextOf(before)).length > 0) {
        showToast(`Skipped "Run before" of "${before.name}" (needs input) — running "${snippet.name}" anyway`, 'error');
      } else {
        showToast(`Running "${before.name}" first…`);
        const { success: beforeOk } = await runChainMember(before, ctx, 'before');
        if (!beforeOk) {
          showToast(`"${before.name}" failed — not running "${snippet.name}"`, 'error');
          const failedSec = ctx.sectioned ? buildChainSection(ctx.rootBody, snippet, role) : null;
          if (failedSec) {
            failedSec.dot.className = 'status-dot error';
            failedSec.body.textContent = 'Skipped — its "Run before" prerequisite failed.';
          } else {
            ctx.rootBody.textContent = 'Skipped — its "Run before" prerequisite failed.';
          }
          return { success: false };
        }
      }
    }
  }

  const sec = ctx.sectioned ? buildChainSection(ctx.rootBody, snippet, role) : null;
  const targetBody = sec ? sec.body : ctx.rootBody;

  const exec = await executeSnippet(snippet, overridePayload);
  const combinedText = exec.isSeq ? renderSequenceResult(targetBody, exec.raw, exec.steps.length) : renderCommandResult(targetBody, exec.raw);
  if (sec) sec.dot.className = `status-dot ${exec.success ? 'ok' : 'error'}`;

  if (!exec.isSeq && useUiStore.getState().devModeEnabled && exec.raw.debugInfo) {
    const dbg = document.createElement('div');
    dbg.className = 'debug-info';
    const info: DebugInfo = exec.raw.debugInfo;
    dbg.textContent = `→ ${info.file} ${(info.args || []).map((a) => JSON.stringify(a)).join(' ')}`;
    targetBody.appendChild(dbg);
  }

  const combinedResult = exec.isSeq
    ? { code: exec.raw.overallCode, stdout: exec.raw.steps.map((s) => s.stdout).join('\n'), stderr: exec.raw.steps.map((s) => s.stderr).filter(Boolean).join('\n') }
    : exec.raw;
  const assertion = checkExpectation(snippet, combinedResult);
  if (assertion) renderAssertion(targetBody, assertion);

  ctx.combinedText.push(`${role ? `[${role}] ` : ''}${snippet.name}:\n${combinedText}`);
  await recordRun(snippet, findCardEl(snippet.id));

  if (exec.success && snippet.runAfterThis) {
    const next = snippets.find((s) => s.id === snippet.runAfterThis);
    if (next && !ctx.visited.has(next.id)) {
      if (extractPlaceholders(runnableTextOf(next)).length > 0) {
        showToast(`Skipped "Run after" of "${next.name}" (needs input)`, 'error');
      } else {
        showToast(`Running "${next.name}" next…`);
        await runChainMember(next, ctx, 'after');
      }
    }
  }

  return { success: exec.success, result: combinedResult, isSeq: exec.isSeq };
}

async function appendDiffToggle(snippet: Snippet, outputEl: HTMLElement, currentStdout: string): Promise<void> {
  const history = await window.electronAPI.getHistory();
  const matching = history.filter((h) => h.snippetId === snippet.id);
  if (matching.length < 2) return; // need this run + at least one before it
  const previous = matching[1];

  const diffBtn = document.createElement('button');
  diffBtn.className = 'diff-toggle';
  diffBtn.innerHTML = `${iconSvg('diff')}<span>Diff vs last run</span>`;
  const diffBody = document.createElement('div');
  diffBody.className = 'diff-body';
  diffBody.hidden = true;
  diffBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    diffBody.hidden = !diffBody.hidden;
    if (!diffBody.hidden && !diffBody.dataset.rendered) {
      renderLineDiff(diffBody, previous.stdoutPreview || '', currentStdout || '');
      diffBody.dataset.rendered = '1';
    }
  });
  outputEl.appendChild(diffBtn);
  outputEl.appendChild(diffBody);
}

/** Naive multiset line diff — good enough for "did the status output change" checks. */
function renderLineDiff(container: HTMLElement, oldText: string, newText: string): void {
  container.innerHTML = '';
  const oldCounts = new Map<string, number>();
  oldText.split('\n').forEach((l) => oldCounts.set(l, (oldCounts.get(l) || 0) + 1));
  const newCounts = new Map<string, number>();
  newText.split('\n').forEach((l) => newCounts.set(l, (newCounts.get(l) || 0) + 1));

  const removed: string[] = [];
  oldCounts.forEach((count, line) => {
    const stillPresent = Math.min(count, newCounts.get(line) || 0);
    for (let i = stillPresent; i < count; i++) removed.push(line);
  });
  const added: string[] = [];
  newCounts.forEach((count, line) => {
    const wasPresent = Math.min(count, oldCounts.get(line) || 0);
    for (let i = wasPresent; i < count; i++) added.push(line);
  });

  if (added.length === 0 && removed.length === 0) {
    container.textContent = '(no differences)';
    return;
  }
  removed.forEach((l) => {
    const d = document.createElement('div');
    d.className = 'diff-line-removed';
    d.textContent = `- ${l}`;
    container.appendChild(d);
  });
  added.forEach((l) => {
    const d = document.createElement('div');
    d.className = 'diff-line-added';
    d.textContent = `+ ${l}`;
    container.appendChild(d);
  });
}

/** Shared root-level driver for both runSingleSnippet and runSequenceSnippet below — sets up the chain context, runs the root (and whatever before/after chain it pulls in) into the root card's own output panel, then applies the root-specific extras (sound, notification, diff toggle, copy-output text) based on the root's own result. */
async function runChainRoot(
  snippet: Snippet,
  cardEl: HTMLElement,
  overridePayload: string | string[] | null,
  output: HTMLElement,
  copyOutputBtn: HTMLElement,
  runBtn: HTMLElement
): Promise<{ success: boolean }> {
  const statusDot = output.querySelector<HTMLElement>('.status-dot')!;
  const statusText = output.querySelector<HTMLElement>('.status-text')!;
  const body = output.querySelector<HTMLElement>('.card-output-body')!;

  output.hidden = false;
  statusDot.className = 'status-dot running';
  statusText.textContent = 'Running…';
  body.innerHTML = '';
  runBtn.classList.add('running');

  const ctx: ChainContext = {
    visited: new Set(),
    hops: 0,
    sectioned: involvesChain(snippet),
    rootBody: body,
    combinedText: [],
    setStatus(kind, text) {
      statusDot.className = `status-dot ${kind}`;
      statusText.textContent = text;
    },
  };

  let success = false;
  try {
    const { success: rootSuccess, result, isSeq } = await runChainMember(snippet, ctx, null, overridePayload);
    success = rootSuccess;

    statusDot.className = `status-dot ${success ? 'ok' : 'error'}`;
    statusText.textContent = success ? (isSeq ? 'All steps succeeded' : 'Success') : isSeq ? 'One or more steps failed' : result ? `Exit code ${result.code}` : 'Failed';

    const lastOutputText = ctx.combinedText.join('\n\n');
    (cardEl as unknown as { _lastOutputText?: string })._lastOutputText = lastOutputText;
    copyOutputBtn.hidden = !lastOutputText;

    playTone(success);
    maybeNotify(snippet.name, success ? 'Finished successfully' : isSeq ? 'Finished with a failed step' : 'Finished with an error');

    if (result) appendDiffToggle(snippet, body, result.stdout || '').catch((err) => console.error(err));
  } catch (err) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Error';
    body.textContent = String(err && (err as Error).message ? (err as Error).message : err);
  } finally {
    runBtn.classList.remove('running');
  }
  return { success };
}

export async function runSingleSnippet(snippet: Snippet, cardEl: HTMLElement, finalCommand: string, output: HTMLElement, copyOutputBtn: HTMLElement, runBtn: HTMLElement) {
  return runChainRoot(snippet, cardEl, finalCommand, output, copyOutputBtn, runBtn);
}

export async function runSequenceSnippet(snippet: Snippet, cardEl: HTMLElement, finalSteps: string[], output: HTMLElement, copyOutputBtn: HTMLElement, runBtn: HTMLElement) {
  return runChainRoot(snippet, cardEl, finalSteps, output, copyOutputBtn, runBtn);
}
