// pipeline-engine.js — executes a saved (or in-progress-editing) pipeline:
// walks its node graph from root nodes (no incoming edges), runs each
// resolved snippet, and after each finishes, follows any outgoing edge
// whose condition matches that result to reach the next node(s):
// 'success' (exit 0) | 'failure' (non-zero exit) | 'always' | 'exitCode'
// (exit code equals edge.value) | 'outputContains' (stdout+stderr includes
// edge.value). OR-semantics: a node runs the first time ANY satisfied
// incoming edge reaches it — there's no "wait for every incoming edge"
// join, which keeps this simple and avoids deadlock/starvation questions a
// real join would raise. Reuses batch-runner.js's results-modal
// (buildResultRow/setRow*/runOne, dom.batchResultsList) rather than
// building a second, near-identical live-results UI.
import { dom } from './dom.js';
import { state } from './state.js';
import { extractPlaceholders, runnableTextOf } from './utils.js';
import { showToast } from './toast.js';
import {
  openBatchResultsModal, buildResultRow, setRowRunning, setRowDone, setRowSkipped, runOne,
} from './batch-runner.js';

export function edgeSatisfied(edge, result) {
  switch (edge.condition) {
    case 'always': return true;
    case 'failure': return result.code !== 0;
    case 'exitCode': return result.code === edge.value;
    case 'outputContains': return `${result.stdout || ''}\n${result.stderr || ''}`.includes(edge.value || '');
    default: return result.code === 0; // 'success'
  }
}

/**
 * Runs `{nodes, edges}` (a pipeline, or the pipeline editor's in-progress
 * working copy — same shape either way). Resolves each node's snippetId
 * against the live state.snippets, silently dropping nodes whose snippet no
 * longer exists (same "a dangling pointer is just skipped" rule groups
 * already follow). Returns null (with a toast) if nothing's left to run.
 */
export async function runPipelineGraph(nodes, edges) {
  const resolved = nodes
    .map((n) => ({ id: n.id, snippet: state.snippets.find((s) => s.id === n.snippetId) }))
    .filter((n) => n.snippet);
  if (resolved.length === 0) {
    showToast('This pipeline has no valid steps left to run — edit it first', 'error');
    return null;
  }
  const nodeById = new Map(resolved.map((n) => [n.id, n]));
  const validEdges = edges.filter((e) => nodeById.has(e.from) && nodeById.has(e.to));
  const hasIncoming = new Set(validEdges.map((e) => e.to));
  const roots = resolved.filter((n) => !hasIncoming.has(n.id));

  openBatchResultsModal();
  dom.batchResultsList.innerHTML = '';
  dom.closeBatchResultsBtn.textContent = 'Running…';
  dom.closeBatchResultsBtn.disabled = true;

  const rowsByNodeId = new Map();
  const started = new Set();
  let ran = 0;
  let skipped = 0;

  async function runNode(node) {
    if (started.has(node.id)) return;
    started.add(node.id);

    const handles = buildResultRow(node.snippet);
    dom.batchResultsList.appendChild(handles.row);
    rowsByNodeId.set(node.id, handles);

    if (extractPlaceholders(runnableTextOf(node.snippet)).length > 0) {
      setRowSkipped(handles);
      skipped += 1;
      return;
    }

    setRowRunning(handles);
    const result = await runOne(node.snippet);
    setRowDone(handles, result);
    ran += 1;
    const target = state.snippets.find((s) => s.id === node.snippet.id);
    if (target) {
      target.runCount = (target.runCount || 0) + 1;
      target.lastRunAt = new Date().toISOString();
    }

    const nextNodes = validEdges
      .filter((e) => e.from === node.id && edgeSatisfied(e, result))
      .map((e) => nodeById.get(e.to))
      .filter(Boolean);
    await Promise.all(nextNodes.map(runNode));
  }

  await Promise.all(roots.map(runNode));

  dom.closeBatchResultsBtn.textContent = 'Close';
  dom.closeBatchResultsBtn.disabled = false;
  return { ran, skipped, total: resolved.length };
}
