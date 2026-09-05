// PipelineCanvas.tsx — the actual graph canvas, built on @xyflow/react.
// Replaced the hand-rolled absolutely-positioned-<div>s-plus-overlaid-SVG
// canvas (raw mousedown/mousemove/mouseup dragging, getBoundingClientRect()
// edge-line recomputation) that CLAUDE.md used to document as this app's
// "one deliberately-not-fully-declarative piece of UI" — React Flow now
// owns dragging, connecting, pan/zoom, multi-select, and keyboard delete,
// so none of that imperative machinery is needed here.
//
// Fully "controlled": PipelinesModal.tsx's EditorView owns `nodes`/`edges`
// in this app's own persisted shape (PipelineNode[]/PipelineEdge[] — the
// working copy, discarded on Cancel, same as before) and re-derives React
// Flow's own Node[]/Edge[] shape from it every render via pipelineFlow.ts's
// converters; this component never keeps a second, parallel copy of the
// graph in React Flow's internal store. Simpler to reason about than a
// two-sources-of-truth split, and this app's pipelines are capped at 50
// nodes/200 edges (see the sanitizer), well within where the "recompute
// from props every change" pattern stays effortlessly fast.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
  type IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import type { PipelineNode, PipelineEdge } from '@shared/types';
import { tryCreatePipelineEdge } from '../../../lib/utils';
import { showToast } from '../../../lib/toast';
import { toFlowNode, fromFlowNode, toFlowEdge, fromFlowEdge, type StepNode, type ConditionEdge } from '../../../lib/pipelineFlow';
import { PipelineStepNode } from './PipelineStepNode';
import { PipelineConditionEdge } from './PipelineConditionEdge';

const nodeTypes = { step: PipelineStepNode };
const edgeTypes = { condition: PipelineConditionEdge };
// Hoisted to module scope, not created inline on <ReactFlow>'s props: a
// fresh object/array literal every render makes React Flow's own internal
// effects (which depend on these by reference) fire on every render —
// which, for fitViewOptions specifically, re-triggers fitView -> a store
// update -> a re-render -> a new object -> the effect again, forever
// ("Maximum update depth exceeded", React error #185, hit during this
// rewrite's own testing).
// Generous padding: fitView's own bounding-box math is based on each node's
// declared width/height, not the few extra pixels its connection handles
// protrude past that box — too little padding leaves a handle sitting right
// at (or just past) the edge of this app's own fairly narrow canvas area.
const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1 };
const PRO_OPTIONS = { hideAttribution: true };
const DELETE_KEYS = ['Delete', 'Backspace'];

export type Selection = { type: 'node' | 'edge'; id: string } | null;

interface PipelineCanvasProps {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  selection: Selection;
  onNodesChange: (nodes: PipelineNode[]) => void;
  onEdgesChange: (edges: PipelineEdge[]) => void;
  onSelectionChange: (selection: Selection) => void;
  /** Bump this (e.g. from a toolbar "Auto-arrange" click) to re-fit the whole graph in view — see FitViewOnSignal below. The *initial* fit (opening the editor) is the <ReactFlow fitView> prop instead, so this only reacts to signal increments after that (starts at 0, matching the prop's own one-shot initial fit). */
  fitViewSignal: number;
}

/** A child of <ReactFlow>, purely so useReactFlow() has the context it needs — re-fits the viewport whenever `signal` increments past its initial value. */
function FitViewOnSignal({ signal }: { signal: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (signal === 0) return; // the initial fit is <ReactFlow fitView>'s job, not this
    // Deferred a tick: fitView needs the just-changed node positions/sizes
    // already measured, which hasn't happened yet in the same render pass.
    const raf = requestAnimationFrame(() => fitView({ ...FIT_VIEW_OPTIONS, duration: 300 }));
    return () => cancelAnimationFrame(raf);
  }, [signal, fitView]);
  return null;
}

export function PipelineCanvas({ nodes, edges, selection, onNodesChange, onEdgesChange, onSelectionChange, fitViewSignal }: PipelineCanvasProps) {
  const selectedNodeId = selection?.type === 'node' ? selection.id : null;
  const selectedEdgeId = selection?.type === 'edge' ? selection.id : null;

  // Per-node cache, keyed by id: reuses the exact same StepNode object
  // across renders for any node whose own PipelineNode reference AND
  // `selected` flag haven't changed, instead of toFlowNode() building a
  // brand-new object for literally every node on every render (a plain
  // .map() would do exactly that, even for nodes nothing happened to).
  // React Flow's controlled-mode reconciliation (adoptUserNodes) treats a
  // new object reference for a node as "this node was reinitialized" and
  // resets its measured handleBounds — see toFlowNode()'s own `measured`
  // comment — so a fresh identity for every node on every render meant
  // handleBounds for the WHOLE graph never stayed measured for more than an
  // instant, which starved edges of a resolvable connection point (no path
  // ever painted) and, worse, fed a self-sustaining onNodesChange loop
  // during a real connection-drag gesture ("Maximum update depth exceeded",
  // React error #185) — both confirmed via this rewrite's own testing.
  const nodeCacheRef = useRef(new Map<string, { source: PipelineNode; selected: boolean; result: StepNode }>());
  const flowNodes: StepNode[] = useMemo(() => {
    const cache = nodeCacheRef.current;
    const next = new Map<string, { source: PipelineNode; selected: boolean; result: StepNode }>();
    const result = nodes.map((n) => {
      const selected = n.id === selectedNodeId;
      const cached = cache.get(n.id);
      const entry =
        cached && cached.source === n && cached.selected === selected
          ? cached
          : { source: n, selected, result: toFlowNode(n, selectedNodeId) };
      next.set(n.id, entry);
      return entry.result;
    });
    nodeCacheRef.current = next; // drop entries for any node that's been removed
    return result;
  }, [nodes, selectedNodeId]);
  const flowEdges: ConditionEdge[] = useMemo(
    () =>
      edges.map((e) =>
        toFlowEdge(
          e,
          selectedEdgeId,
          () => onSelectionChange({ type: 'edge', id: e.id }),
          () => {
            onEdgesChange(edges.filter((x) => x.id !== e.id));
            if (selectedEdgeId === e.id) onSelectionChange(null);
          }
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, selectedEdgeId]
  );

  // applyNodeChanges/applyEdgeChanges only clone the specific entries a
  // change actually touched — every OTHER item keeps the exact object
  // reference it already had in flowNodes/flowEdges. Reuse that signal on
  // the way back into this app's own PipelineNode[]/PipelineEdge[] shape:
  // an item whose StepNode/ConditionEdge comes back unchanged reuses its
  // ORIGINAL PipelineNode/PipelineEdge object instead of being rebuilt via
  // fromFlowNode()/fromFlowEdge(). Skipping this made a plain .map() rebuild
  // EVERY item's identity on ANY single change (one node dragged, one edge
  // selected, …) — which resets React Flow's own per-node handleBounds
  // measurement for the WHOLE graph on every tick (see toFlowNode()'s
  // `measured` comment for why that matters for edge rendering), and,
  // during an actual in-progress connection-drag gesture (which fires
  // onNodesChange/onEdgesChange repeatedly per animation frame), spiraled
  // into "Maximum update depth exceeded" (React error #185) — confirmed via
  // this rewrite's own testing.
  const handleNodesChange = useCallback(
    (changes: NodeChange<StepNode>[]) => {
      const prevById = new Map(flowNodes.map((n) => [n.id, n]));
      const sourceById = new Map(nodes.map((n) => [n.id, n]));
      const updated = applyNodeChanges<StepNode>(changes, flowNodes);
      onNodesChange(updated.map((n) => (n === prevById.get(n.id) ? sourceById.get(n.id)! : fromFlowNode(n))));
    },
    [flowNodes, nodes, onNodesChange]
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<ConditionEdge>[]) => {
      const prevById = new Map(flowEdges.map((e) => [e.id, e]));
      const sourceById = new Map(edges.map((e) => [e.id, e]));
      const updated = applyEdgeChanges<ConditionEdge>(changes, flowEdges);
      onEdgesChange(updated.map((e) => (e === prevById.get(e.id) ? sourceById.get(e.id)! : fromFlowEdge(e))));
    },
    [flowEdges, edges, onEdgesChange]
  );

  // Deleting a node (Delete key, or the toolbar/context-menu path) doesn't
  // automatically drop its edges in a *controlled* React Flow setup the way
  // it would with the internal useNodesState/useEdgesState convenience
  // hooks — onNodesDelete is the hook meant for exactly this cleanup.
  const handleNodesDelete = useCallback(
    (deleted: StepNode[]) => {
      const removedIds = new Set(deleted.map((n) => n.id));
      onEdgesChange(edges.filter((e) => !removedIds.has(e.from) && !removedIds.has(e.to)));
      if (selection?.type === 'node' && removedIds.has(selection.id)) onSelectionChange(null);
    },
    [edges, onEdgesChange, selection, onSelectionChange]
  );

  const isValidConnection: IsValidConnection = useCallback((conn) => conn.source !== conn.target, []);

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      const result = tryCreatePipelineEdge(edges, source, target);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      onEdgesChange([...edges, result.edge]);
      onSelectionChange({ type: 'edge', id: result.edge.id });
    },
    [edges, onEdgesChange, onSelectionChange]
  );

  // Dragging an existing edge's endpoint onto a different node rewires it
  // in place (keeping its condition/value) instead of forcing delete +
  // reconnect-from-scratch — the old hand-rolled canvas had no way to do
  // this at all, only full delete-and-redraw.
  const handleReconnect = useCallback(
    (oldEdge: ConditionEdge, newConnection: Connection) => {
      const { source, target } = newConnection;
      if (!source || !target) return;
      // Validate against every OTHER edge (excluding the one being rewired,
      // which would otherwise trip its own "already connected" check).
      const others = edges.filter((e) => e.id !== oldEdge.id);
      const result = tryCreatePipelineEdge(others, source, target);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      // Keep the edge's own id/condition/value — only from/to actually change.
      onEdgesChange(edges.map((e) => (e.id === oldEdge.id ? { ...e, from: source, to: target } : e)));
    },
    [edges, onEdgesChange]
  );

  // Every one of these MUST stay referentially stable across renders where
  // its own inputs haven't changed — React Flow's internal SelectionListener
  // re-runs an effect keyed on this exact prop's identity (among others),
  // so an inline arrow function here (a fresh reference every render) reruns
  // that effect every render too, which calls back into this component,
  // which renders again, forever ("Maximum update depth exceeded", React
  // error #185, hit while first building this — see also toFlowNode()'s
  // width/height comment for the other half of that same bug).
  const handleSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: StepNode[]; edges: ConditionEdge[] }) => {
      if (selNodes.length === 1 && selEdges.length === 0) onSelectionChange({ type: 'node', id: selNodes[0].id });
      else if (selEdges.length === 1 && selNodes.length === 0) onSelectionChange({ type: 'edge', id: selEdges[0].id });
      else onSelectionChange(null);
    },
    [onSelectionChange]
  );

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: StepNode) => {
      e.preventDefault();
      onNodesChange(nodes.filter((n) => n.id !== node.id));
      onEdgesChange(edges.filter((x) => x.from !== node.id && x.to !== node.id));
      if (selection?.id === node.id) onSelectionChange(null);
    },
    [nodes, edges, selection, onNodesChange, onEdgesChange, onSelectionChange]
  );

  return (
    <ReactFlowProvider>
      <ReactFlow<StepNode, ConditionEdge>
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodesDelete={handleNodesDelete}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        isValidConnection={isValidConnection}
        onSelectionChange={handleSelectionChange}
        onNodeContextMenu={handleNodeContextMenu}
        deleteKeyCode={DELETE_KEYS}
        // React Flow's default (true) re-centers the viewport the instant a
        // node/handle gains DOM focus — which a plain mousedown on a Handle
        // already does natively — yanking the pane out from under an
        // in-progress connection-drag gesture before it can complete. Found
        // by tracing this rewrite's own "dragging from a handle does
        // nothing, the pane pans instead" bug all the way into
        // @xyflow/react's own source.
        autoPanOnNodeFocus={false}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={2}
        proOptions={PRO_OPTIONS}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--border-strong)" />
        <Controls showInteractive={false} className="pipeline-flow-controls" />
        <MiniMap
          className="pipeline-flow-minimap"
          pannable
          zoomable
          nodeColor="var(--accent)"
          maskColor="rgba(0,0,0,0.35)"
          // React Flow's own default (200×150) eats a huge fraction of this
          // app's compact, fixed-size canvas — shrunk to something that
          // reads as a corner overview rather than a second, competing map.
          style={{ width: 120, height: 90 }}
        />
        <FitViewOnSignal signal={fitViewSignal} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
