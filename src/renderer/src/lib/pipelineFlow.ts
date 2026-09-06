// pipelineFlow.ts — the translation layer between this app's own persisted
// pipeline shape (PipelineNode/PipelineEdge, @shared/types — what gets
// saved to disk and what pipelineEngine.ts runs) and @xyflow/react's own
// Node/Edge shape (what the canvas actually renders/drags). Keeping this
// conversion in one small pure-function file — rather than scattering
// .map()s through PipelineCanvas.tsx — means the working-copy state
// PipelinesModal.tsx's EditorView owns (and discards on Cancel) never has
// to know React Flow's shape at all.
import type { Node, Edge } from '@xyflow/react';
import type { PipelineNode, PipelineEdge, EdgeCondition, NodeKind } from '@shared/types';

// One data shape per node kind — only what each kind's own component
// (PipelineStepNode.tsx and its delay/gate/sub-pipeline siblings) actually
// needs to render. Inspector edits (retries, joinMode, …) go straight
// through PipelinesModal's own `setNodes` on the PipelineNode[] working
// copy, not through this round-trip, so they don't need to live in `data`.
export type StepNodeData = { kind: 'step'; snippetId: string };
export type DelayNodeData = { kind: 'delay'; delaySeconds: number; label: string };
export type GateNodeData = { kind: 'gate'; label: string };
export type SubPipelineNodeData = { kind: 'pipeline'; subPipelineId: string; label: string };
export type GroupNodeData = { kind: 'group'; groupId: string; label: string };
export type PipelineFlowNodeData = StepNodeData | DelayNodeData | GateNodeData | SubPipelineNodeData | GroupNodeData;

export type StepNode = Node<StepNodeData, 'step'>;
export type DelayNode = Node<DelayNodeData, 'delay'>;
export type GateNode = Node<GateNodeData, 'gate'>;
export type SubPipelineFlowNode = Node<SubPipelineNodeData, 'pipeline'>;
// React Flow's own `type` here — NOT the same thing as PipelineNode.kind
// above, which stays 'group' — has to avoid the literal string 'group':
// @xyflow/react reserves that exact type name for its own built-in
// parent/container node feature and ships default CSS for it (a visible
// border), which silently applied itself on top of .pipeline-mini-node's
// own styling the moment this node type was named 'group' too. 'groupRun'
// sidesteps the collision; nothing else about this node kind's own
// vocabulary (PipelineNode.kind, GroupNodeData.kind, groupId, …) needed to
// change, since only the flow-node type string was ever ambiguous with it.
export type GroupFlowNode = Node<GroupNodeData, 'groupRun'>;
export type FlowNode = StepNode | DelayNode | GateNode | SubPipelineFlowNode | GroupFlowNode;

// onSelect/onRemove ride along on the edge's own data rather than being
// wired up separately: PipelineConditionEdge.tsx's label renders through
// EdgeLabelRenderer, a plain HTML overlay *outside* the SVG canvas layer —
// clicking it doesn't reach React Flow's own edge-click hit-testing (that
// only fires for the rendered path/its interactionWidth), so the label
// needs its own explicit hookup to select or remove the edge.
export type ConditionEdgeData = {
  condition: EdgeCondition;
  value: number | string | null;
  onSelect: () => void;
  onRemove: () => void;
};
export type ConditionEdge = Edge<ConditionEdgeData, 'condition'>;

// Matches every node component's rendered footprint closely enough for
// dagre's box-packing math and for centering a newly-dropped/duplicated node.
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 76;
// Delay/gate nodes render noticeably shorter (one line, no avatar+meta) —
// dagre and the initial-drop centering use this instead for those kinds.
export const SMALL_NODE_HEIGHT = 52;

function heightFor(kind: NodeKind): number {
  // 'group' renders as a .pipeline-mini-node (PipelineGroupNode.tsx) — the
  // exact same short, one-line box delay/gate/pipeline already use, NOT the
  // taller avatar-style .pipeline-step-node — so it needs SMALL_NODE_HEIGHT
  // like they get, not NODE_HEIGHT. Declaring the wrong (taller) height here
  // left an empty rectangle below the actual pill (the declared box is what
  // React Flow sizes the node wrapper AND positions its connection handles
  // against — see toFlowNode()'s own `measured` comment on why this value
  // has to be exactly right, not just close), and put the handles below the
  // pill's real vertical center instead of centered on it.
  return kind === 'step' || kind === 'pipeline' ? NODE_HEIGHT : SMALL_NODE_HEIGHT;
}

export function toFlowNode(n: PipelineNode, selectedId: string | null): FlowNode {
  const base = {
    id: n.id,
    position: { x: n.x, y: n.y },
    selected: n.id === selectedId,
    // Declaring a fixed size up front lets React Flow skip its own
    // ResizeObserver-based auto-measurement pass for this node — see
    // `measured`'s own comment below for why that matters. Must match
    // .pipeline-step-node/.pipeline-mini-node's own CSS height exactly.
    width: NODE_WIDTH,
    height: heightFor(n.kind),
    // `measured` must match width/height from the very first render, not
    // just eventually: React Flow diffs its OWN ResizeObserver measurement
    // against node.measured (not node.width/height) to decide whether a
    // node's size "changed". Leaving `measured` unset reads as undefined
    // !== N, so the very first real measurement always looks like a
    // change, firing an onNodesChange 'dimensions' event that flows back
    // through fromFlowNode()/setNodes() as a brand-new PipelineNode[]
    // array — which rebuilds this exact node object again (fresh identity,
        // since this app keeps recomputing flowNodes from its own state every
    // render) before React Flow's internal handleBounds measurement for it
    // can ever settle. That loop silently starved every edge's connected
    // handles of a measured position forever. Declaring `measured` up
    // front short-circuits that first "change" entirely.
    measured: { width: NODE_WIDTH, height: heightFor(n.kind) },
  };
  switch (n.kind) {
    case 'delay':
      return { ...base, type: 'delay', data: { kind: 'delay', delaySeconds: n.delaySeconds, label: n.label } };
    case 'gate':
      return { ...base, type: 'gate', data: { kind: 'gate', label: n.label } };
    case 'pipeline':
      return { ...base, type: 'pipeline', data: { kind: 'pipeline', subPipelineId: n.subPipelineId, label: n.label } };
    case 'group':
      return { ...base, type: 'groupRun', data: { kind: 'group', groupId: n.groupId, label: n.label } };
    default:
      return { ...base, type: 'step', data: { kind: 'step', snippetId: n.snippetId } };
  }
}

/**
 * Rebuilds a PipelineNode from its React Flow counterpart. `existing` (the
 * same-id node from the current working copy, when it's still there) fills
 * in every field this flow node's own `data` doesn't carry — retries,
 * joinMode, etc., which the Inspector edits directly on the working copy
 * and never routes through `data` — so a plain drag (which only changes
 * `position`, never `data`) doesn't silently reset them to defaults.
 */
export function fromFlowNode(n: FlowNode, existing: PipelineNode | undefined): PipelineNode {
  const fallback: PipelineNode = {
    id: n.id, kind: n.data.kind, snippetId: '', subPipelineId: '', groupId: '', delaySeconds: 5, label: '',
    retries: 0, retryDelaySeconds: 5, joinMode: 'any', x: n.position.x, y: n.position.y,
  };
  const merged = existing ? { ...existing } : fallback;
  merged.x = n.position.x;
  merged.y = n.position.y;
  merged.kind = n.data.kind;
  if (n.data.kind === 'step') merged.snippetId = n.data.snippetId;
  else if (n.data.kind === 'delay') { merged.delaySeconds = n.data.delaySeconds; merged.label = n.data.label; }
  else if (n.data.kind === 'gate') merged.label = n.data.label;
  else if (n.data.kind === 'pipeline') { merged.subPipelineId = n.data.subPipelineId; merged.label = n.data.label; }
  else if (n.data.kind === 'group') { merged.groupId = n.data.groupId; merged.label = n.data.label; }
  return merged;
}

export function toFlowEdge(e: PipelineEdge, selectedId: string | null, onSelect: () => void, onRemove: () => void): ConditionEdge {
  return {
    id: e.id,
    type: 'condition',
    source: e.from,
    target: e.to,
    // Explicit even though each step only has one of each: every node
    // component gives its Handles real ids ("in"/"out"), and without
    // matching sourceHandle/targetHandle here React Flow can't always
    // resolve which handle an edge attaches to, silently rendering nothing.
    sourceHandle: 'out',
    targetHandle: 'in',
    data: { condition: e.condition, value: e.value, onSelect, onRemove },
    selected: e.id === selectedId,
  };
}

export function fromFlowEdge(e: ConditionEdge): PipelineEdge {
  return { id: e.id, from: e.source, to: e.target, condition: e.data!.condition, value: e.data!.value };
}
