// Mirrors sanitizePipeline()/sanitizeNode() in src/main/storage/pipelines.js.
// Like Group, a node is a pointer (snippetId), never a snippet copy — a node
// whose snippet was deleted is skipped wherever the pipeline is resolved
// into something runnable (see pipeline-engine.js on the renderer side).
export const VALID_EDGE_CONDITIONS = ['success', 'failure', 'always', 'exitCode', 'outputContains'] as const;

export type EdgeCondition = (typeof VALID_EDGE_CONDITIONS)[number];

export interface PipelineNode {
  id: string;
  snippetId: string;
  x: number;
  y: number;
}

export interface PipelineEdge {
  id: string;
  from: string; // a PipelineNode id
  to: string; // a PipelineNode id
  condition: EdgeCondition;
  // Only 'exitCode' (a number) and 'outputContains' (a string, <=500 chars)
  // use `value` — the sanitizer forces it to null for the other three
  // conditions, which don't evaluate anything beyond the finished node's
  // exit code.
  value: number | string | null;
}

export interface Pipeline {
  id: string;
  name: string; // trimmed, <=100 chars
  description: string; // trimmed, <=500 chars
  nodes: PipelineNode[]; // max 50
  edges: PipelineEdge[]; // max 200 (MAX_NODES * 4)
}
