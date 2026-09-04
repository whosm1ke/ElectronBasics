// storage/pipelines.ts — saved visual pipelines: a small graph of existing
// snippets (nodes, positioned on the editor canvas) connected by edges that
// each carry a condition ('success' | 'failure' | 'always'), letting a run
// branch instead of just chaining linearly like runBefore/runAfterThis
// does. Like groups.ts, a node is just a pointer (snippetId) — never a copy
// of the snippet — so a pipeline always reflects each member's current
// command/tag/etc., and a node whose snippet was deleted is simply skipped
// wherever the pipeline is resolved into something runnable (see
// pipeline-engine.js on the renderer side).
import fs from 'node:fs';
import path from 'node:path';
import { PIPELINES_FILE } from '../paths';
import { newId } from '../id';
import { readJsonFileSafe } from '../json-file';
import type { Pipeline, PipelineNode, PipelineEdge, EdgeCondition } from '@shared/types';
import { VALID_EDGE_CONDITIONS } from '@shared/types';

// 'exitCode' and 'outputContains' both carry a `value` (a number / a
// substring respectively) evaluated against the just-finished node's
// result — see pipeline-engine.js's edgeSatisfied(). The other three
// conditions ignore `value` entirely.
const MAX_NODES = 50;

function sanitizeNode(n: Partial<PipelineNode> | null | undefined): PipelineNode {
  return {
    id: String(n?.id ?? newId('node')),
    snippetId: String(n?.snippetId ?? ''),
    x: typeof n?.x === 'number' && Number.isFinite(n.x) ? Math.round(n.x) : 40,
    y: typeof n?.y === 'number' && Number.isFinite(n.y) ? Math.round(n.y) : 40,
  };
}

export function sanitizePipeline(p: Partial<Pipeline>): Pipeline {
  const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
  const nodes = rawNodes.map(sanitizeNode).filter((n) => n.snippetId).slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const rawEdges = Array.isArray(p.edges) ? p.edges : [];
  const edges: PipelineEdge[] = rawEdges
    .map((e: Partial<PipelineEdge> | null | undefined): PipelineEdge => {
      const condition: EdgeCondition = VALID_EDGE_CONDITIONS.includes(e?.condition as EdgeCondition)
        ? (e!.condition as EdgeCondition)
        : 'success';
      let value: number | string | null = null;
      if (condition === 'exitCode') value = Number.isFinite(e?.value) ? Math.trunc(e!.value as number) : 0;
      else if (condition === 'outputContains') value = String(e?.value ?? '').slice(0, 500);
      return {
        id: String(e?.id ?? newId('edge')),
        from: String(e?.from ?? ''),
        to: String(e?.to ?? ''),
        condition,
        value,
      };
    })
    // An edge pointing at a node id that no longer exists (the node was
    // removed from `nodes` above, e.g. its snippet got sanitized away)
    // would be dead weight the editor could never render meaningfully —
    // drop it rather than carry it forward.
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
    .slice(0, MAX_NODES * 4);

  return {
    id: String(p.id ?? newId('pipe')),
    name: String(p.name ?? '').trim().slice(0, 100),
    description: String(p.description ?? '').trim().slice(0, 500),
    nodes,
    edges,
  };
}

export function readPipelines(): Pipeline[] {
  if (!fs.existsSync(PIPELINES_FILE)) return [];
  const parsed = readJsonFileSafe<Pipeline[]>(PIPELINES_FILE, [], Array.isArray);
  return parsed.map(sanitizePipeline);
}

export function writePipelines(pipelines: unknown): Pipeline[] {
  const sanitized = Array.isArray(pipelines) ? pipelines.map(sanitizePipeline) : [];
  fs.mkdirSync(path.dirname(PIPELINES_FILE), { recursive: true });
  fs.writeFileSync(PIPELINES_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}
