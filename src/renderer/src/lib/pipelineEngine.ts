// pipelineEngine.ts — the renderer's INTERACTIVE pipeline runner: drives
// @shared/pipelineWalk.ts's pure graph-walking core with a `runNode`
// callback that actually executes each kind of node — a 'step' via IPC +
// a live useBatchStore row (same one batch/group runs use), 'delay' via a
// plain wait, 'gate' via a row with real Continue/Abort buttons the user
// clicks, and 'pipeline' by recursively re-entering this same walker on
// the referenced pipeline. main/pipelineRunner.ts is this file's
// unattended (scheduled) twin — same shared walker, a different `runNode`
// (no UI, no gate wait) since main can't drive React state or prompt a
// human. Live progress is painted directly onto the already-rendered React
// Flow DOM nodes/edges (see setNodeRunClass/setEdgeWalkedClass) rather than
// threading a `runStatus` prop through pipelineFlow.ts/every node
// component — the same "imperative DOM escape hatch for fast-changing live
// status" this app already uses for background-process output
// (processEngine.ts) and a card's own run output (runEngine.ts).
import type { PipelineNode, PipelineEdge, Snippet, Group, RunResult } from '@shared/types';
import { walkPipeline, withRetries, sleep, type NodeOutcome } from '@shared/pipelineWalk';
import { extractPlaceholders, runnableTextOf, substituteAll } from './utils';
import { showToast } from './toast';
import {
  openBatchResultsModal,
  resetRows,
  finishRun,
  addRow,
  addLabelRow,
  addGateRow,
  waitForGate,
  setRowRunning,
  setRowDone,
  setRowSkipped,
  runOne,
} from '../store/useBatchStore';
import { state } from '../../modules/state';

function nodeEl(nodeId: string): HTMLElement | null {
  // React Flow stamps `data-id` on each node's rendered wrapper element.
  return document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
}
function setNodeRunClass(nodeId: string, cls: 'pf-run-active' | 'pf-run-ok' | 'pf-run-error' | 'pf-run-skipped' | null): void {
  const el = nodeEl(nodeId);
  if (!el) return;
  el.classList.remove('pf-run-active', 'pf-run-ok', 'pf-run-error', 'pf-run-skipped');
  if (cls) el.classList.add(cls);
}
function markEdgeWalked(edgeId: string, satisfied: boolean): void {
  const el = document.querySelector(`.react-flow__edge[data-id="${edgeId}"]`);
  el?.classList.add(satisfied ? 'pf-edge-walked-yes' : 'pf-edge-walked-no');
}
/** Clears every leftover run-status class from a previous run before a new one starts painting fresh ones. */
function clearRunClasses(): void {
  document.querySelectorAll('.react-flow__node.pf-run-active, .react-flow__node.pf-run-ok, .react-flow__node.pf-run-error, .react-flow__node.pf-run-skipped')
    .forEach((el) => el.classList.remove('pf-run-active', 'pf-run-ok', 'pf-run-error', 'pf-run-skipped'));
  document.querySelectorAll('.react-flow__edge.pf-edge-walked-yes, .react-flow__edge.pf-edge-walked-no')
    .forEach((el) => el.classList.remove('pf-edge-walked-yes', 'pf-edge-walked-no'));
}

interface RunOptions {
  maxConcurrency?: number;
  /** Pipeline ids already on the current call stack — guards a 'pipeline' node against a reference cycle at RUN time too, as defense in depth alongside the save-time check (PipelinesModal.tsx's save()). */
  visitedPipelineIds?: Set<string>;
  /** True for a recursive sub-pipeline call — suppresses opening/resetting the shared results modal (the top-level call already owns it) and the "nothing to run" toast (the parent row already shows the sub-pipeline failed to produce anything). */
  isSubRun?: boolean;
  /** Values collected once up front (PipelinesModal.tsx's param-gate, via lib/utils.ts's collectPipelinePlaceholders) for every `{{placeholder}}` used anywhere in this pipeline — substituted into a 'step' node's command/steps instead of skipping it outright. A name with no matching value still skips that one step. */
  values?: Record<string, string> | null;
}

/**
 * Runs `{nodes, edges}` (a saved pipeline, or the pipeline editor's
 * in-progress working copy — same shape either way) interactively, with
 * live per-node rows in the shared batch-results modal. Returns null (with
 * a toast) if there's nothing left to run.
 */
export async function runPipelineGraph(nodes: PipelineNode[], edges: PipelineEdge[], opts: RunOptions = {}): Promise<{ ran: number; skipped: number; total: number; success: boolean } | null> {
  const snippets = state.snippets as Snippet[];
  // A 'step' node whose snippet was deleted is dead weight — same
  // dangling-pointer rule groups/pipelines already follow elsewhere. Every
  // other kind is self-contained enough to at least attempt (a broken
  // sub-pipeline reference is caught per-node, below, as a skip).
  const usable = nodes.filter((n) => n.kind !== 'step' || snippets.some((s) => s.id === n.snippetId));
  if (usable.length === 0) {
    if (!opts.isSubRun) showToast('This pipeline has no valid steps left to run — edit it first', 'error');
    return null;
  }

  if (!opts.isSubRun) {
    openBatchResultsModal();
    resetRows();
    clearRunClasses();
  }

  async function runNode(node: PipelineNode): Promise<NodeOutcome> {
    setNodeRunClass(node.id, 'pf-run-active');
    const outcome = await runOneNode(node);
    setNodeRunClass(node.id, outcome.kind === 'skipped' ? 'pf-run-skipped' : outcome.result.code === 0 ? 'pf-run-ok' : 'pf-run-error');
    return outcome;
  }

  async function runOneNode(node: PipelineNode): Promise<NodeOutcome> {
    if (node.kind === 'delay') {
      const rowId = addLabelRow(node.label || `Waiting ${node.delaySeconds}s…`);
      setRowRunning(rowId);
      await sleep(node.delaySeconds * 1000);
      const result: RunResult = { code: 0, stdout: '', stderr: '' };
      setRowDone(rowId, result);
      return { kind: 'ran', result };
    }

    if (node.kind === 'gate') {
      const rowId = addGateRow(node.label || 'Approval gate');
      const approved = await waitForGate(rowId);
      return { kind: 'ran', result: { code: approved ? 0 : 1, stdout: '', stderr: approved ? '' : 'Aborted by user.' } };
    }

    if (node.kind === 'pipeline') {
      const allPipelines = await window.electronAPI.getPipelines();
      const sub = allPipelines.find((p) => p.id === node.subPipelineId);
      if (!sub) {
        const rowId = addLabelRow(node.label || '⚠ Sub-pipeline not found');
        setRowSkipped(rowId);
        return { kind: 'skipped' };
      }
      const visited = new Set(opts.visitedPipelineIds);
      if (visited.has(sub.id)) {
        const rowId = addLabelRow(`⚠ "${sub.name}" — skipped (would create a cyclic reference)`);
        setRowSkipped(rowId);
        return { kind: 'skipped' };
      }
      visited.add(sub.id);
      const rowId = addLabelRow(`▸ ${sub.name || '(untitled pipeline)'}`);
      setRowRunning(rowId);
      const subStats = await runPipelineGraph(sub.nodes, sub.edges, { maxConcurrency: sub.maxConcurrency, visitedPipelineIds: visited, isSubRun: true, values: opts.values });
      const result: RunResult = { code: subStats && subStats.success ? 0 : 1, stdout: '', stderr: '' };
      setRowDone(rowId, result);
      return { kind: 'ran', result };
    }

    if (node.kind === 'group') {
      const group = (state.groups as Group[]).find((g) => g.id === node.groupId);
      if (!group) {
        const rowId = addLabelRow(node.label || '⚠ Group not found');
        setRowSkipped(rowId);
        return { kind: 'skipped' };
      }
      const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
      if (members.length === 0) {
        const rowId = addLabelRow(`⚠ "${group.name || '(untitled group)'}" — no snippets left to run`);
        setRowSkipped(rowId);
        return { kind: 'skipped' };
      }
      // Each member gets its own row (unlike 'pipeline', which collapses to
      // one label row since a sub-pipeline's own nodes already get their
      // own rows recursively) — a Group is a flat list, not a graph, so
      // there's nothing more granular for a member to recurse into. Run
      // sequentially, same as every other "run a group unattended" path in
      // this app (triggerServer.ts's /run-group, main/groupRunner.ts) —
      // consistent behavior across all three, rather than a fourth variant
      // that happens to run in parallel just because it's interactive here.
      const labelRowId = addLabelRow(`▸ ${group.name || '(untitled group)'}`);
      setRowRunning(labelRowId);
      let anyRan = false;
      let allOk = true;
      for (const member of members) {
        const rowId = addRow(member);
        const placeholderNames = extractPlaceholders(runnableTextOf(member));
        const hasAllValues = placeholderNames.every((n) => opts.values && n in opts.values);
        if (placeholderNames.length > 0 && !hasAllValues) {
          setRowSkipped(rowId);
          continue;
        }
        const runnable: Snippet = placeholderNames.length > 0
          ? { ...member, command: substituteAll(member.command, opts.values), steps: member.steps ? member.steps.map((s) => substituteAll(s, opts.values)) : null }
          : member;
        setRowRunning(rowId);
        // eslint-disable-next-line no-await-in-loop
        const result = await runOne(runnable);
        setRowDone(rowId, result);
        anyRan = true;
        if (result.code !== 0) allOk = false;
        const target = snippets.find((s) => s.id === member.id);
        if (target) {
          target.runCount = (target.runCount || 0) + 1;
          target.lastRunAt = new Date().toISOString();
        }
      }
      // Success iff every member that actually ran (not itself skipped for
      // a missing placeholder) succeeded — same "success iff everything
      // that ran inside succeeded" rule 'pipeline' nodes use for their own
      // sub-run. A group node where every member was skipped never ran
      // anything real, so it's reported as skipped too, not a vacuous success.
      if (!anyRan) {
        setRowSkipped(labelRowId);
        return { kind: 'skipped' };
      }
      const groupResult: RunResult = { code: allOk ? 0 : 1, stdout: '', stderr: '' };
      setRowDone(labelRowId, groupResult);
      return { kind: 'ran', result: groupResult };
    }

    // 'step'
    const snippet = snippets.find((s) => s.id === node.snippetId)!;
    const rowId = addRow(snippet);
    const placeholderNames = extractPlaceholders(runnableTextOf(snippet));
    const hasAllValues = placeholderNames.every((n) => opts.values && n in opts.values);
    if (placeholderNames.length > 0 && !hasAllValues) {
      setRowSkipped(rowId);
      return { kind: 'skipped' };
    }
    const runnable: Snippet = placeholderNames.length > 0
      ? { ...snippet, command: substituteAll(snippet.command, opts.values), steps: snippet.steps ? snippet.steps.map((s) => substituteAll(s, opts.values)) : null }
      : snippet;
    setRowRunning(rowId);
    const attempt = () => runOne(runnable);
    const result = node.retries > 0 ? await withRetries(attempt, (r) => r.code === 0, node.retries, node.retryDelaySeconds) : await attempt();
    setRowDone(rowId, result);
    const target = snippets.find((s) => s.id === snippet.id);
    if (target) {
      target.runCount = (target.runCount || 0) + 1;
      target.lastRunAt = new Date().toISOString();
    }
    return { kind: 'ran', result };
  }

  const stats = await walkPipeline(usable, edges, {
    runNode,
    maxConcurrency: opts.maxConcurrency,
    onEdgeWalked: markEdgeWalked,
  });

  if (!opts.isSubRun) finishRun();
  return stats;
}
