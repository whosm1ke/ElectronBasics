// pipelineFlow.ts — the translation layer between this app's own persisted
// pipeline shape (PipelineNode/PipelineEdge, @shared/types — what gets
// saved to disk and what pipelineEngine.ts runs) and @xyflow/react's own
// Node/Edge shape (what the canvas actually renders/drags). Keeping this
// conversion in one small pure-function file — rather than scattering
// .map()s through PipelineCanvas.tsx — means the working-copy state
// PipelinesModal.tsx's EditorView owns (and discards on Cancel) never has
// to know React Flow's shape at all.
import type { Node, Edge } from '@xyflow/react';
import type { PipelineNode, PipelineEdge, EdgeCondition } from '@shared/types';

export type StepNodeData = { snippetId: string };
export type StepNode = Node<StepNodeData, 'step'>;

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

// Matches PipelineStepNode.tsx's rendered footprint closely enough for
// dagre's box-packing math and for centering a newly-dropped/duplicated node.
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 76;

export function toFlowNode(n: PipelineNode, selectedId: string | null): StepNode {
  return {
    id: n.id,
    type: 'step',
    position: { x: n.x, y: n.y },
    data: { snippetId: n.snippetId },
    selected: n.id === selectedId,
    // Declaring a fixed size up front (matches .pipeline-step-node's own
    // width/height exactly) lets React Flow skip its own ResizeObserver-
    // based auto-measurement pass for this node. Without it, every render
    // rebuilds a brand-new node object (this app keeps the working-copy
    // PipelineNode[]/PipelineEdge[] as the single source of truth — see
    // PipelineCanvas.tsx's header comment), which erases whatever React
    // Flow measured last time and makes it measure again — a sustained
    // re-render churn (confirmed via this rewrite's own testing: hundreds
    // of renders/sec, `ResizeObserver loop completed` warnings, and mouse
    // gestures landing on the wrong, already-replaced element) closely
    // related to the outright "Maximum update depth exceeded" (React error
    // #185) this rewrite hit before handleSelectionChange/
    // handleNodeContextMenu in PipelineCanvas.tsx were memoized.
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    // `measured` must match width/height from the very first render, not
    // just eventually: React Flow diffs its OWN ResizeObserver measurement
    // against node.measured (not node.width/height) to decide whether a
    // node's size "changed". Leaving `measured` unset reads as undefined
    // !== 200, so the very first real measurement always looks like a
    // change, firing an onNodesChange 'dimensions' event that flows back
    // through fromFlowNode()/setNodes() as a brand-new PipelineNode[]
    // array — which rebuilds this exact node object again (fresh identity,
    // since this app keeps recomputing flowNodes from its own state every
    // render) before React Flow's internal handleBounds measurement for it
    // can ever settle. That loop silently starved every edge's connected
    // handles of a measured position forever (confirmed via this rewrite's
    // own testing: sourceX/targetY stayed null, so React Flow's EdgeWrapper
    // rendered nothing — no <path>, not even a call into the custom edge
    // component — while the edge existed correctly in this app's own state
    // the whole time). Declaring `measured` up front short-circuits that
    // first "change" entirely.
    measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
  };
}

export function fromFlowNode(n: StepNode): PipelineNode {
  return { id: n.id, snippetId: n.data.snippetId, x: n.position.x, y: n.position.y };
}

export function toFlowEdge(e: PipelineEdge, selectedId: string | null, onSelect: () => void, onRemove: () => void): ConditionEdge {
  return {
    id: e.id,
    type: 'condition',
    source: e.from,
    target: e.to,
    // Explicit even though each step only has one of each: PipelineStepNode
    // gives its Handles real ids ("in"/"out"), and without matching
    // sourceHandle/targetHandle here React Flow can't always resolve which
    // handle an edge attaches to, silently rendering nothing (confirmed via
    // this rewrite's own testing — the edge existed in state, selectable
    // and shown in the Inspector, but no path/line ever painted).
    sourceHandle: 'out',
    targetHandle: 'in',
    data: { condition: e.condition, value: e.value, onSelect, onRemove },
    selected: e.id === selectedId,
  };
}

export function fromFlowEdge(e: ConditionEdge): PipelineEdge {
  return { id: e.id, from: e.source, to: e.target, condition: e.data!.condition, value: e.data!.value };
}
