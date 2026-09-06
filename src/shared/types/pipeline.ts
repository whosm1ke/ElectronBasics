// The Pipeline schema — the runtime AND compile-time source of truth (every
// exported type below is z.infer'd from a schema) for
// src/main/storage/pipelines.ts's read/write path. See snippet.ts's header
// comment for why this is a zod schema (transform + .pipe(OutputSchema))
// rather than a hand-interface + a separate sanitizer function — same
// reasoning applies here. Like Group, a 'step' node is a pointer
// (snippetId), never a snippet copy — a node whose snippet was deleted is
// skipped wherever the pipeline is resolved into something runnable (see
// lib/pipelineEngine.ts on the renderer side, main/pipelineRunner.ts for
// scheduled runs, and @shared/pipelineWalk.ts for the graph-walking logic
// both of those share).
import { z } from 'zod';
import { newId } from '../id';
import { ScheduleSchema, ScheduleConfigSchema } from './snippet';

export const VALID_EDGE_CONDITIONS = ['success', 'failure', 'always', 'exitCode', 'outputContains'] as const;
export type EdgeCondition = (typeof VALID_EDGE_CONDITIONS)[number];

// A pipeline is capped at 50 nodes / 200 edges (MAX_NODES * 4) — small
// enough that this app's "recompute from props every render" React Flow
// canvas (PipelineCanvas.tsx) stays effortlessly fast without needing
// virtualization.
const MAX_NODES = 50;

// ---------- PipelineNode ----------

// 'step' (the original, only kind before this): points at a snippet.
// 'delay' (`delaySeconds`): a pure wait, no snippet involved.
// 'gate': pauses an INTERACTIVE run for manual Continue/Abort — auto-treated
// as "not satisfied" (skipped) in an unattended (scheduled) run, same "no
// prompting outside an attended context" rule as a parameterized snippet.
// 'pipeline' (`subPipelineId`): runs another saved pipeline inline and
// treats it as a single node whose result reflects that sub-run as a whole.
export const VALID_NODE_KINDS = ['step', 'delay', 'gate', 'pipeline'] as const;
export type NodeKind = (typeof VALID_NODE_KINDS)[number];

export const VALID_JOIN_MODES = ['any', 'all'] as const;
export type JoinMode = (typeof VALID_JOIN_MODES)[number];

const PipelineNodeOutputSchema = z.object({
  id: z.string(),
  kind: z.enum(VALID_NODE_KINDS),
  snippetId: z.string(), // 'step' only
  subPipelineId: z.string(), // 'pipeline' only
  delaySeconds: z.number(), // 'delay' only, >=1
  label: z.string(), // 'delay'/'gate'/'pipeline' only — a short caption ("Wait 30s", "Approve deploy?")
  retries: z.number(), // 'step' only, 0-10 extra attempts after the first
  retryDelaySeconds: z.number(), // 'step' only, >=0
  // 'any' (default): fires the first time ANY satisfied incoming edge
  // reaches it (this pipeline's original OR-semantics). 'all': a real
  // AND-join — fires only once EVERY incoming edge's source has finished
  // AND every one of those edges is satisfied — see pipelineWalk.ts.
  joinMode: z.enum(VALID_JOIN_MODES),
  x: z.number(),
  y: z.number(),
});
export type PipelineNode = z.infer<typeof PipelineNodeOutputSchema>;

const PipelineNodeSchema = z
  .unknown()
  .transform((raw) => {
    const n = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind: NodeKind = (VALID_NODE_KINDS as readonly string[]).includes(n.kind as string) ? (n.kind as NodeKind) : 'step';
    return {
      id: String(n.id ?? newId('node')),
      kind,
      snippetId: String(n.snippetId ?? ''),
      subPipelineId: String(n.subPipelineId ?? ''),
      delaySeconds: Number.isFinite(n.delaySeconds) ? Math.min(3600, Math.max(1, Math.round(n.delaySeconds as number))) : 5,
      label: String(n.label ?? '').slice(0, 200),
      retries: Number.isFinite(n.retries) ? Math.min(10, Math.max(0, Math.round(n.retries as number))) : 0,
      retryDelaySeconds: Number.isFinite(n.retryDelaySeconds) ? Math.max(0, Math.round(n.retryDelaySeconds as number)) : 5,
      joinMode: (VALID_JOIN_MODES as readonly string[]).includes(n.joinMode as string) ? (n.joinMode as JoinMode) : 'any',
      x: typeof n.x === 'number' && Number.isFinite(n.x) ? Math.round(n.x) : 40,
      y: typeof n.y === 'number' && Number.isFinite(n.y) ? Math.round(n.y) : 40,
    };
  })
  .pipe(PipelineNodeOutputSchema);

// ---------- PipelineEdge ----------

const PipelineEdgeOutputSchema = z.object({
  id: z.string(),
  from: z.string(), // a PipelineNode id
  to: z.string(), // a PipelineNode id
  condition: z.enum(VALID_EDGE_CONDITIONS),
  // Only 'exitCode' (a number) and 'outputContains' (a string, <=500 chars)
  // use `value` — forced to null for the other three conditions, which
  // don't evaluate anything beyond the finished node's exit code.
  value: z.union([z.number(), z.string(), z.null()]),
});
export type PipelineEdge = z.infer<typeof PipelineEdgeOutputSchema>;

const PipelineEdgeSchema = z
  .unknown()
  .transform((raw) => {
    const e = (raw && typeof raw === 'object' ? raw : {}) as Partial<PipelineEdge>;
    const condition: EdgeCondition = (VALID_EDGE_CONDITIONS as readonly string[]).includes(e.condition as string)
      ? (e.condition as EdgeCondition)
      : 'success';
    let value: number | string | null = null;
    if (condition === 'exitCode') value = Number.isFinite(e.value) ? Math.trunc(e.value as number) : 0;
    else if (condition === 'outputContains') value = String(e.value ?? '').slice(0, 500);
    return {
      id: String(e.id ?? newId('edge')),
      from: String(e.from ?? ''),
      to: String(e.to ?? ''),
      condition,
      value,
    };
  })
  .pipe(PipelineEdgeOutputSchema);

// ---------- Pipeline ----------

const PipelineOutputSchema = z.object({
  id: z.string(),
  name: z.string(), // trimmed, <=100 chars
  description: z.string(), // trimmed, <=500 chars
  nodes: z.array(PipelineNodeOutputSchema), // max 50
  edges: z.array(PipelineEdgeOutputSchema), // max 200 (MAX_NODES * 4)
  // Runs the whole graph on a schedule, same shape/semantics a snippet's own
  // `schedule` uses — see main/pipelineRunner.ts + scheduler.ts's tick.
  schedule: ScheduleConfigSchema.nullable(),
  // Caps how many nodes this pipeline runs concurrently across the whole
  // walk (0 = unlimited) — see pipelineWalk.ts's semaphore.
  maxConcurrency: z.number(),
});
export type Pipeline = z.infer<typeof PipelineOutputSchema>;

export const PipelineSchema = z
  .unknown()
  .transform((raw) => {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<{
      id: unknown; name: unknown; description: unknown; nodes: unknown; edges: unknown; schedule: unknown; maxConcurrency: unknown;
    }>;

    const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
    const nodes = rawNodes
      .map((n) => PipelineNodeSchema.parse(n))
      // A 'step' node with nothing to run is dead weight (same rule as
      // before this schema grew other kinds) — every other kind is
      // self-contained (a delay/gate needs no external pointer, and a
      // dangling `subPipelineId` is caught at resolve-time, not here, the
      // same way a step's dangling snippetId is skipped at resolve-time
      // too, not filtered out at the schema level).
      .filter((n) => n.kind !== 'step' || n.snippetId)
      .slice(0, MAX_NODES);
    const nodeIds = new Set(nodes.map((n) => n.id));

    const rawEdges = Array.isArray(p.edges) ? p.edges : [];
    const edges = rawEdges
      .map((e) => PipelineEdgeSchema.parse(e))
      // An edge pointing at a node id that no longer exists (the node was
      // removed above, e.g. its snippet got sanitized away) would be dead
      // weight the editor could never render meaningfully — drop it rather
      // than carry it forward.
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
      .slice(0, MAX_NODES * 4);

    return {
      id: String(p.id ?? newId('pipe')),
      name: String(p.name ?? '').trim().slice(0, 100),
      description: String(p.description ?? '').trim().slice(0, 500),
      nodes,
      edges,
      schedule: ScheduleSchema.parse(p.schedule),
      maxConcurrency: Number.isFinite(p.maxConcurrency) ? Math.max(0, Math.round(p.maxConcurrency as number)) : 0,
    };
  })
  .pipe(PipelineOutputSchema);
