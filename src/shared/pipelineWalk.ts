// pipelineWalk.ts — the pure graph-walking core shared by BOTH the
// renderer's interactive pipeline runner (lib/pipelineEngine.ts, live UI
// rows) and the main process's unattended one (main/pipelineRunner.ts, for
// scheduled pipelines). Neither environment's own "how do I actually run
// one node" concern belongs here — that's injected via `runNode` — this
// file only decides WHICH node runs next, given the graph and each
// finished node's outcome. Kept here (not duplicated per process) because
// the decision logic is identical either way and only needs
// PipelineNode/PipelineEdge/RunResult, all of which are plain shared types
// with no DOM/IPC/Node-API dependency.
import type { PipelineNode, PipelineEdge, RunResult } from './types';

export function edgeSatisfied(edge: PipelineEdge, result: RunResult): boolean {
  switch (edge.condition) {
    case 'always':
      return true;
    case 'failure':
      return result.code !== 0;
    case 'exitCode':
      return result.code === edge.value;
    case 'outputContains':
      return `${result.stdout || ''}\n${result.stderr || ''}`.includes(String(edge.value || ''));
    default:
      return result.code === 0; // 'success'
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries `fn` until `isSuccess` accepts its result or `retries` extra attempts are exhausted — shared by both environments' own step-node handling (each still owns its own "how to run one attempt"). */
export async function withRetries<T>(fn: () => Promise<T>, isSuccess: (result: T) => boolean, retries: number, retryDelaySeconds: number): Promise<T> {
  let result = await fn();
  let attempt = 0;
  while (!isSuccess(result) && attempt < retries) {
    attempt++;
    if (retryDelaySeconds > 0) await sleep(retryDelaySeconds * 1000);
    result = await fn();
  }
  return result;
}

// A node either produced a real, edge-evaluable RunResult, or was skipped
// outright (a parameterized step with nowhere to prompt for a value, or —
// per environment — a gate that couldn't be shown) — a skipped node is a
// dead end: no outgoing edge is evaluated from it, matching how a skipped
// batch-run row already behaves elsewhere in this app.
export type NodeOutcome = { kind: 'ran'; result: RunResult } | { kind: 'skipped' };

export interface WalkOptions {
  /** Actually executes `node` and reports what happened — this is where all environment-specific behavior (IPC + UI rows in the renderer, direct exec in main; retries; what a delay/gate/sub-pipeline node even means) lives. */
  runNode: (node: PipelineNode) => Promise<NodeOutcome>;
  /** 0/undefined = unlimited concurrent in-flight nodes. */
  maxConcurrency?: number;
  onNodeStart?: (nodeId: string) => void;
  onNodeDone?: (nodeId: string, outcome: NodeOutcome) => void;
  onEdgeWalked?: (edgeId: string, satisfied: boolean) => void;
}

export interface WalkStats {
  ran: number;
  skipped: number;
  total: number;
  // True unless at least one node that actually ran came back non-zero —
  // vacuously true if nothing ran at all (everything skipped, or an empty
  // graph). Lets a 'pipeline'-kind node (a sub-pipeline run inline as a
  // single node — see main/pipelineRunner.ts and lib/pipelineEngine.ts)
  // turn a whole sub-run into one RunResult-shaped outcome for its own
  // outgoing edges to evaluate.
  success: boolean;
}

/**
 * Walks `{nodes, edges}` from every root (no incoming edge) forward,
 * following each finished node's outgoing edges whose condition the result
 * satisfies. `joinMode: 'all'` on a node means it only fires once EVERY one
 * of its incoming edges' source nodes has finished AND every one of those
 * edges is satisfied — a real AND-join, unlike the default `'any'` (OR:
 * fires the first time any satisfied incoming edge reaches it). Concurrency
 * across the whole walk is capped by `maxConcurrency` via a small semaphore
 * around the `runNode` call itself, not around graph traversal.
 */
export async function walkPipeline(nodes: PipelineNode[], edges: PipelineEdge[], opts: WalkOptions): Promise<WalkStats> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const validEdges = edges.filter((e) => nodeById.has(e.from) && nodeById.has(e.to));
  const incoming = new Map<string, PipelineEdge[]>();
  for (const e of validEdges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e);
  }
  const roots = nodes.filter((n) => !incoming.has(n.id));

  const started = new Set<string>();
  const completed = new Map<string, NodeOutcome>();
  let ran = 0;
  let skipped = 0;
  let success = true;

  const maxConc = opts.maxConcurrency && opts.maxConcurrency > 0 ? opts.maxConcurrency : Infinity;
  let active = 0;
  const waiters: (() => void)[] = [];
  async function acquire(): Promise<void> {
    if (active < maxConc) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
  }
  function release(): void {
    active--;
    waiters.shift()?.();
  }

  async function tryRunNode(node: PipelineNode): Promise<void> {
    if (started.has(node.id)) return;

    if (node.joinMode === 'all') {
      const incomingEdges = incoming.get(node.id) || [];
      const allDone = incomingEdges.every((e) => completed.has(e.from));
      if (!allDone) return; // some predecessor hasn't finished — whichever finishes last re-checks this
      const allSatisfied = incomingEdges.every((e) => {
        const outcome = completed.get(e.from)!;
        return outcome.kind === 'ran' && edgeSatisfied(e, outcome.result);
      });
      if (!allSatisfied) {
        started.add(node.id); // decided, permanently — this join never fires
        return;
      }
    }
    // Nothing above this line awaits, so two predecessors finishing "at the
    // same time" can't both slip past the `started` guard for the same node.
    started.add(node.id);

    await acquire();
    opts.onNodeStart?.(node.id);
    let outcome: NodeOutcome;
    try {
      outcome = await opts.runNode(node);
    } finally {
      release();
    }
    completed.set(node.id, outcome);
    opts.onNodeDone?.(node.id, outcome);

    if (outcome.kind === 'skipped') {
      skipped++;
      return;
    }
    ran++;
    if (outcome.result.code !== 0) success = false;

    const outgoing = validEdges.filter((e) => e.from === node.id);
    await Promise.all(
      outgoing.map(async (e) => {
        const satisfied = edgeSatisfied(e, outcome.result);
        opts.onEdgeWalked?.(e.id, satisfied);
        const target = nodeById.get(e.to)!;
        // An 'all'-join target re-checks on every predecessor's completion
        // regardless of whether THIS edge was satisfied — the join itself
        // decides using every incoming edge, not just this one.
        if (target.joinMode === 'all' || satisfied) await tryRunNode(target);
      })
    );
  }

  await Promise.all(roots.map(tryRunNode));
  return { ran, skipped, total: nodes.length, success };
}
