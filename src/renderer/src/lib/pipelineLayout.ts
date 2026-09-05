// pipelineLayout.ts — auto-arranges a pipeline's nodes left-to-right via
// `dagre`, replacing the previous hand-rolled Kahn's-algorithm layered
// layout. Same one-click "fix a graph that's turned into a tangle" purpose
// (see PipelinesModal.tsx's toolbar), but dagre's layout accounts for real
// edge routing/crossing-minimization instead of just bucketing nodes into
// topological layers on a fixed grid — a real graph-layout library instead
// of a from-scratch approximation of one.
import dagre from 'dagre';
import type { PipelineNode, PipelineEdge } from '@shared/types';
import { NODE_WIDTH, NODE_HEIGHT } from './pipelineFlow';

export function layoutPipelineNodes(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineNode[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(nodes.map((n) => n.id));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  // Only edges between nodes that actually exist in this working copy —
  // dagre throws on an edge referencing an unregistered node.
  edges.forEach((e) => {
    if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to);
  });

  dagre.layout(g);

  // dagre reports each node's *center*; PipelineNode.x/y (like React Flow's
  // own Node.position) is top-left, so shift by half the box size back.
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return pos ? { ...n, x: Math.round(pos.x - NODE_WIDTH / 2), y: Math.round(pos.y - NODE_HEIGHT / 2) } : n;
  });
}
