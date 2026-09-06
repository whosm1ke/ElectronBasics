// The Pipeline schema — the runtime AND compile-time source of truth (every
// exported type below is z.infer'd from a schema) for
// src/main/storage/pipelines.ts's read/write path. See snippet.ts's header
// comment for why this is a zod schema (transform + .pipe(OutputSchema))
// rather than a hand-interface + a separate sanitizer function — same
// reasoning applies here. Like Group, a node is a pointer (snippetId), never
// a snippet copy — a node whose snippet was deleted is skipped wherever the
// pipeline is resolved into something runnable (see pipeline-engine.ts on
// the renderer side).
import { z } from 'zod';
import { newId } from '../id';

export const VALID_EDGE_CONDITIONS = ['success', 'failure', 'always', 'exitCode', 'outputContains'] as const;
export type EdgeCondition = (typeof VALID_EDGE_CONDITIONS)[number];

// A pipeline is capped at 50 nodes / 200 edges (MAX_NODES * 4) — small
// enough that this app's "recompute from props every render" React Flow
// canvas (PipelineCanvas.tsx) stays effortlessly fast without needing
// virtualization.
const MAX_NODES = 50;

// ---------- PipelineNode ----------

const PipelineNodeOutputSchema = z.object({
  id: z.string(),
  snippetId: z.string(),
  x: z.number(),
  y: z.number(),
});
export type PipelineNode = z.infer<typeof PipelineNodeOutputSchema>;

const PipelineNodeSchema = z
  .unknown()
  .transform((raw) => {
    const n = (raw && typeof raw === 'object' ? raw : {}) as Partial<PipelineNode>;
    return {
      id: String(n.id ?? newId('node')),
      snippetId: String(n.snippetId ?? ''),
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
});
export type Pipeline = z.infer<typeof PipelineOutputSchema>;

export const PipelineSchema = z
  .unknown()
  .transform((raw) => {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ id: unknown; name: unknown; description: unknown; nodes: unknown; edges: unknown }>;

    const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
    const nodes = rawNodes
      .map((n) => PipelineNodeSchema.parse(n))
      .filter((n) => n.snippetId)
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
    };
  })
  .pipe(PipelineOutputSchema);
