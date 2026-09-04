// PipelinesModal.tsx — the Pipelines screen: a saved-list view (mirrors
// GroupsModal.tsx) plus a node-graph canvas editor with a selection-driven
// inspector side panel. Ported from modules/pipeline-editor.js — the
// single riskiest module in this migration (per the migration plan) since
// its node-dragging and edge-line rendering are deliberately NOT rewritten
// into pure React state:
//
// - Dragging a node mutates its DOM position directly (ref + style.left/top)
//   during the gesture, exactly like the original, and only commits {x,y}
//   into React state (this component's own `nodes` useState — the "working
//   copy," discarded on Cancel) on mouseup. Doing this via setState per
//   mousemove frame would re-render the whole graph 60x/sec for no benefit.
// - Edge <line> positions are recomputed from the *actual rendered* port
//   DOM elements (getBoundingClientRect()) via imperative attribute writes,
//   not derived from node.x/y in JSX — so a line always lands exactly on
//   the visible port regardless of a node's content height, matching the
//   original's portPos()/renderEdges(). This recompute runs after every
//   render (nodes moved/added/removed) and, throttled via
//   requestAnimationFrame, on every drag frame.
//
// Everything else (list view, inspector, snippet picker, auto-arrange) is
// plain React state/JSX — no reason for those to be imperative.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Pipeline, PipelineNode, PipelineEdge, EdgeCondition, Snippet } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { snippetIcon, newId, pipelineEdgeCreatesCycle, SHELL_LABELS } from '../../lib/utils';
import { showToast } from '../../store/useToastStore';
import {
  usePipelinesStore,
  openPipelineEditor,
  showPipelinesListView,
  closePipelines,
  savePipelinesList,
  reopenAt,
} from '../../store/usePipelinesStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';
import { onBatchModalClosed } from '../../lib/events';
import { runPipelineGraph } from '../../lib/pipelineEngine';

const CONDITION_OPTIONS: [EdgeCondition, string][] = [
  ['success', 'Succeeds (exit code 0)'],
  ['failure', 'Fails (non-zero exit code)'],
  ['always', 'Either way'],
  ['exitCode', 'Exits with a specific code'],
  ['outputContains', 'Output contains text'],
];

function conditionLabel(edge: PipelineEdge): string {
  switch (edge.condition) {
    case 'success':
      return 'on success';
    case 'failure':
      return 'on failure';
    case 'always':
      return 'always';
    case 'exitCode':
      return `exit = ${edge.value ?? '?'}`;
    case 'outputContains':
      return `has "${edge.value ?? ''}"`;
    default:
      return edge.condition;
  }
}

type Selection = { type: 'node' | 'edge'; id: string } | null;

// --- Pending "reopen after a pipeline run's results modal closes" — same
// idea as the original's module-level pendingPipelineReturn, needed because
// running hides this modal (see the header comment in the original for
// why: two same-z-index modal-overlays, later-in-DOM wins the stack). ----
let pendingPipelineReturn: 'list' | 'editor' | null = null;
onBatchModalClosed(() => {
  if (!pendingPipelineReturn) return;
  const mode = pendingPipelineReturn;
  pendingPipelineReturn = null;
  reopenAt(mode);
});

function ListView() {
  const { pipelines } = usePipelinesStore();

  async function runSaved(pipeline: Pipeline) {
    pendingPipelineReturn = 'list';
    closePipelines();
    await runPipelineGraph(pipeline.nodes, pipeline.edges);
    await persistSnippets({ silent: true }); // runCount/lastRunAt bumps — cards pick them up next real refresh
  }

  return (
    <div>
      <h2>Pipelines</h2>
      <p className="field-hint">Chain snippets with branching — run different steps depending on whether the previous one succeeded.</p>
      <div className="groups-list no-scrollbar">
        {pipelines.length === 0 ? (
          <div className="variables-empty">No pipelines yet. Build a small graph of steps that branch on success/failure/output, then run it with one click.</div>
        ) : (
          pipelines.map((p) => (
            <div className="group-row" key={p.id}>
              <div className="group-row-info">
                <div className="group-row-name">{p.name || '(untitled pipeline)'}</div>
                <div className="group-row-count">
                  {p.nodes.length} step{p.nodes.length === 1 ? '' : 's'} · {p.edges.length} connection{p.edges.length === 1 ? '' : 's'}
                </div>
                {p.description && <div className="group-row-description">{p.description}</div>}
              </div>
              <button type="button" className="btn btn-small btn-primary" onClick={() => runSaved(p)} dangerouslySetInnerHTML={{ __html: `${iconSvg('play')}<span>Run</span>` }} />
              <button type="button" className="btn btn-small" onClick={() => openPipelineEditor(p)} dangerouslySetInnerHTML={{ __html: `${iconSvg('edit')}<span>Edit</span>` }} />
            </div>
          ))
        )}
      </div>
      <div className="modal-actions modal-actions-left">
        <button type="button" className="btn btn-small" onClick={() => openPipelineEditor(null)}>
          + New pipeline
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closePipelines}>
          Done
        </button>
      </div>
    </div>
  );
}

interface SnippetPickerState {
  anchor: DOMRect;
  onPick: (snippetId: string) => void;
}

function SnippetPickerMenu({ picker, onClose }: { picker: SnippetPickerState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const snippets = state.snippets as Snippet[];

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const mRect = menu.getBoundingClientRect();
    setPos({
      left: Math.max(6, Math.min(picker.anchor.left, window.innerWidth - mRect.width - 6)),
      top: Math.min(picker.anchor.bottom + 4, window.innerHeight - mRect.height - 6),
    });
  }, [picker]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#pipelineSnippetPickerMenu')) onClose();
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu pipeline-add-step-menu"
      id="pipelineSnippetPickerMenu"
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { visibility: 'hidden' }}
    >
      {snippets.length === 0 ? (
        <div className="context-menu-item">No snippets yet</div>
      ) : (
        snippets.map((s) => (
          <button
            type="button"
            key={s.id}
            className="context-menu-item"
            onClick={() => {
              picker.onPick(s.id);
              onClose();
            }}
          >
            <span>
              {snippetIcon(s)} {s.name}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function Inspector({
  selection,
  nodes,
  edges,
  setNodes,
  setEdges,
  setSelection,
  openPicker,
}: {
  selection: Selection;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  setNodes: (n: PipelineNode[]) => void;
  setEdges: (e: PipelineEdge[]) => void;
  setSelection: (s: Selection) => void;
  openPicker: (anchor: HTMLElement, onPick: (id: string) => void) => void;
}) {
  if (!selection) return null;
  const snippets = state.snippets as Snippet[];

  function removeNode(nodeId: string) {
    setNodes(nodes.filter((n) => n.id !== nodeId));
    setEdges(edges.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setSelection(null);
  }
  function removeEdge(edgeId: string) {
    setEdges(edges.filter((e) => e.id !== edgeId));
    setSelection(null);
  }

  if (selection.type === 'node') {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;
    const snippet = snippets.find((s) => s.id === node.snippetId);
    const outgoing = edges.filter((e) => e.from === node.id);
    return (
      <div className="pipeline-inspector no-scrollbar">
        <div className="pipeline-inspector-title">Step</div>
        <div className="pipeline-inspector-name">{snippet ? `${snippetIcon(snippet)} ${snippet.name}` : '⚠ (deleted snippet)'}</div>
        {snippet && (
          <div className="pipeline-inspector-meta">
            {SHELL_LABELS[snippet.shell] || snippet.shell} · {snippet.tag}
          </div>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={(e) =>
            openPicker(e.currentTarget, (newSnippetId) => {
              setNodes(nodes.map((n) => (n.id === node.id ? { ...n, snippetId: newSnippetId } : n)));
            })
          }
        >
          Change step…
        </button>
        <button type="button" className="btn btn-small btn-danger" onClick={() => removeNode(node.id)}>
          Delete step
        </button>
        {outgoing.length > 0 && (
          <>
            <div className="pipeline-inspector-subtitle">Connects to</div>
            {outgoing.map((edge) => {
              const targetNode = nodes.find((n) => n.id === edge.to);
              const targetSnippet = targetNode && snippets.find((s) => s.id === targetNode.snippetId);
              return (
                <button type="button" key={edge.id} className="pipeline-inspector-edge-row" onClick={() => setSelection({ type: 'edge', id: edge.id })}>
                  {conditionLabel(edge)} → {targetSnippet ? targetSnippet.name : '?'}
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  }

  const edge = edges.find((e) => e.id === selection.id);
  if (!edge) return null;
  const fromNode = nodes.find((n) => n.id === edge.from);
  const toNode = nodes.find((n) => n.id === edge.to);
  const fromSnippet = fromNode && snippets.find((s) => s.id === fromNode.snippetId);
  const toSnippet = toNode && snippets.find((s) => s.id === toNode.snippetId);
  const needsValue = edge.condition === 'exitCode' || edge.condition === 'outputContains';

  function updateEdge(patch: Partial<PipelineEdge>) {
    setEdges(edges.map((e) => (e.id === edge!.id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="pipeline-inspector no-scrollbar">
      <div className="pipeline-inspector-title">Connection</div>
      <div className="pipeline-inspector-meta">
        {fromSnippet ? fromSnippet.name : '?'} → {toSnippet ? toSnippet.name : '?'}
      </div>
      <label className="field-label">Run the next step when this one…</label>
      <div className="select-wrap">
        <select
          className="field-input"
          value={edge.condition}
          onChange={(e) => {
            const condition = e.target.value as EdgeCondition;
            let value = edge.value;
            if (condition === 'exitCode' && typeof value !== 'number') value = 0;
            else if (condition === 'outputContains' && typeof value !== 'string') value = '';
            else if (condition !== 'exitCode' && condition !== 'outputContains') value = null;
            updateEdge({ condition, value });
          }}
        >
          {CONDITION_OPTIONS.map(([value, text]) => (
            <option value={value} key={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      {needsValue && (
        <input
          type={edge.condition === 'exitCode' ? 'number' : 'text'}
          className="field-input"
          placeholder={edge.condition === 'exitCode' ? 'e.g. 2' : 'e.g. ERROR'}
          value={edge.value ?? ''}
          onChange={(e) => updateEdge({ value: edge.condition === 'exitCode' ? Number(e.target.value) || 0 : e.target.value })}
        />
      )}
      <button type="button" className="btn btn-small btn-danger" onClick={() => removeEdge(edge.id)}>
        Delete connection
      </button>
    </div>
  );
}

function EditorView({ editingId }: { editingId: string | null }) {
  const { pipelines } = usePipelinesStore();
  const editingPipeline = editingId ? pipelines.find((p) => p.id === editingId) : null;

  const [name, setName] = useState(editingPipeline?.name || '');
  const [description, setDescription] = useState(editingPipeline?.description || '');
  // The working copy — only written back to the saved list on Save; Cancel
  // (or just navigating away) discards it. Deep-copied from the saved
  // pipeline so mutating it here never touches the saved one.
  const [nodes, setNodes] = useState<PipelineNode[]>(() => (editingPipeline ? editingPipeline.nodes.map((n) => ({ ...n })) : []));
  const [edges, setEdges] = useState<PipelineEdge[]>(() => (editingPipeline ? editingPipeline.edges.map((e) => ({ ...e })) : []));
  const [selection, setSelection] = useState<Selection>(null);
  const [picker, setPicker] = useState<SnippetPickerState | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeElRefs = useRef(new Map<string, HTMLDivElement>());
  const lineElRefs = useRef(new Map<string, SVGLineElement>());
  const labelElRefs = useRef(new Map<string, HTMLButtonElement>());

  function portPos(nodeId: string, side: 'in' | 'out'): { x: number; y: number } | null {
    const nodeEl = nodeElRefs.current.get(nodeId);
    const canvasEl = canvasRef.current;
    if (!nodeEl || !canvasEl) return null;
    const portEl = nodeEl.querySelector(`.pipeline-port-${side}`);
    if (!portEl) return null;
    const canvasRect = canvasEl.getBoundingClientRect();
    const portRect = portEl.getBoundingClientRect();
    return { x: portRect.left + portRect.width / 2 - canvasRect.left, y: portRect.top + portRect.height / 2 - canvasRect.top };
  }

  function recomputeEdges() {
    edges.forEach((edge) => {
      const from = portPos(edge.from, 'out');
      const to = portPos(edge.to, 'in');
      const line = lineElRefs.current.get(edge.id);
      const label = labelElRefs.current.get(edge.id);
      if (!from || !to) return;
      if (line) {
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
      }
      if (label) {
        label.style.left = `${(from.x + to.x) / 2}px`;
        label.style.top = `${(from.y + to.y) / 2}px`;
      }
    });
  }

  // Recompute edge lines after every render that could move a port (nodes
  // added/removed/reordered, edges added/removed) — a drag's own rAF loop
  // (see wireNodeDrag below) handles the moving-target case without
  // waiting for a React render.
  useLayoutEffect(() => {
    recomputeEdges();
  });

  useEffect(() => {
    if (canvasRef.current) canvasRef.current.parentElement?.scrollTo(0, 0);
    const t = setTimeout(() => document.getElementById('pipelineNameInput')?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addEdge(fromId: string, toId: string) {
    if (fromId === toId) return;
    if (edges.some((e) => e.from === fromId && e.to === toId)) {
      showToast('These two steps are already connected', 'error');
      return;
    }
    if (pipelineEdgeCreatesCycle(edges, fromId, toId)) {
      showToast("Can't connect — that would create a loop", 'error');
      return;
    }
    const edge: PipelineEdge = { id: newId('edge'), from: fromId, to: toId, condition: 'success', value: null };
    setEdges([...edges, edge]);
    setSelection({ type: 'edge', id: edge.id });
  }

  /** Mousedown-drag on a node body (not its ports) repositions it; a mousedown+mouseup with no real movement is treated as a click (selects it) instead. Position is mutated directly on the DOM during the drag (same reasoning as the original — see this file's header comment) and only committed to React state on mouseup. */
  function onNodeMouseDown(e: React.MouseEvent, node: PipelineNode) {
    if ((e.target as HTMLElement).closest('.pipeline-port')) return; // that's a connection drag
    e.preventDefault();
    const el = nodeElRefs.current.get(node.id);
    const canvasEl = canvasRef.current;
    if (!el || !canvasEl) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    const offsetX = e.clientX - canvasRect.left - node.x;
    const offsetY = e.clientY - canvasRect.top - node.y;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let x = node.x;
    let y = node.y;
    let rafPending = false;

    function onMove(ev: MouseEvent) {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
      const rect = canvasEl!.getBoundingClientRect();
      x = Math.max(0, ev.clientX - rect.left - offsetX);
      y = Math.max(0, ev.clientY - rect.top - offsetY);
      el!.style.left = `${x}px`;
      el!.style.top = `${y}px`;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          recomputeEdgesLive();
        });
      }
    }
    function recomputeEdgesLive() {
      edges.forEach((edge) => {
        if (edge.from !== node.id && edge.to !== node.id) return;
        const from = portPos(edge.from, 'out');
        const to = portPos(edge.to, 'in');
        const line = lineElRefs.current.get(edge.id);
        const label = labelElRefs.current.get(edge.id);
        if (!from || !to) return;
        if (line) {
          line.setAttribute('x1', String(from.x));
          line.setAttribute('y1', String(from.y));
          line.setAttribute('x2', String(to.x));
          line.setAttribute('y2', String(to.y));
        }
        if (label) {
          label.style.left = `${(from.x + to.x) / 2}px`;
          label.style.top = `${(from.y + to.y) / 2}px`;
        }
      });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) {
        setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, x, y } : n)));
      } else {
        setSelection({ type: 'node', id: node.id });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /** Mousedown-drag starting on the output port draws a temporary dashed line to the cursor (an ephemeral SVG element appended directly, never part of React state); releasing over another node creates the edge. */
  function onOutPortMouseDown(e: React.MouseEvent, node: PipelineNode) {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const start = portPos(node.id, 'out');
    if (!start) return;
    const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempLine.classList.add('pipeline-edge-dragging');
    svg.appendChild(tempLine);

    function clearConnectTargetHighlight() {
      nodeElRefs.current.forEach((el) => el.classList.remove('pipeline-node-connect-target'));
    }
    function onMove(ev: MouseEvent) {
      const rect = canvasRef.current!.getBoundingClientRect();
      tempLine.setAttribute('x1', String(start!.x));
      tempLine.setAttribute('y1', String(start!.y));
      tempLine.setAttribute('x2', String(ev.clientX - rect.left));
      tempLine.setAttribute('y2', String(ev.clientY - rect.top));
      clearConnectTargetHighlight();
      const targetEl = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('.pipeline-node') as HTMLElement | null;
      if (targetEl && targetEl.dataset.nodeId !== node.id) targetEl.classList.add('pipeline-node-connect-target');
    }
    function onUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      tempLine.remove();
      clearConnectTargetHighlight();
      const targetEl = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('.pipeline-node') as HTMLElement | null;
      const targetId = targetEl?.dataset.nodeId;
      if (targetEl && targetId && targetId !== node.id) addEdge(node.id, targetId);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function nextNodePosition(): { x: number; y: number } {
    const n = nodes.length;
    return { x: 30 + (n % 8) * 40, y: 30 + (n % 8) * 40 };
  }

  function addNode(snippetId: string) {
    const pos = nextNodePosition();
    const node: PipelineNode = { id: newId('node'), snippetId, x: pos.x, y: pos.y };
    setNodes([...nodes, node]);
    setSelection({ type: 'node', id: node.id });
  }

  /** Lays every node out left-to-right in topological layers (Kahn's algorithm) — a one-click fix for a graph that's turned into a tangle after a lot of free-form dragging. */
  function autoArrange() {
    const ids = nodes.map((n) => n.id);
    if (ids.length === 0) return;
    const remaining = new Map(ids.map((id) => [id, 0]));
    edges.forEach((e) => remaining.set(e.to, (remaining.get(e.to) || 0) + 1));

    const layerOf = new Map<string, number>();
    const done = new Set<string>();
    let frontier = ids.filter((id) => remaining.get(id) === 0);
    let layer = 0;
    while (frontier.length > 0) {
      frontier.forEach((id) => {
        layerOf.set(id, layer);
        done.add(id);
      });
      const next = new Set<string>();
      edges.forEach((e) => {
        if (done.has(e.from) && !done.has(e.to)) {
          remaining.set(e.to, (remaining.get(e.to) || 0) - 1);
          if ((remaining.get(e.to) || 0) <= 0) next.add(e.to);
        }
      });
      frontier = [...next];
      layer += 1;
    }
    ids.forEach((id) => {
      if (!layerOf.has(id)) layerOf.set(id, layer);
    });

    const byLayer = new Map<number, string[]>();
    ids.forEach((id) => {
      const l = layerOf.get(id)!;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(id);
    });
    const COL_W = 220;
    const ROW_H = 100;
    const positioned = new Map<string, { x: number; y: number }>();
    [...byLayer.keys()].sort((a, b) => a - b).forEach((l) => {
      byLayer.get(l)!.forEach((id, row) => {
        positioned.set(id, { x: 30 + l * COL_W, y: 30 + row * ROW_H });
      });
    });
    setNodes(nodes.map((n) => ({ ...n, ...(positioned.get(n.id) || {}) })));
  }

  async function save() {
    const finalName = name.trim() || 'Untitled pipeline';
    const finalDescription = description.trim();
    if (nodes.length === 0) {
      showToast('Add at least one step before saving', 'error');
      return;
    }
    const id = editingId || newId('pipe');
    const pipeline: Pipeline = { id, name: finalName, description: finalDescription, nodes, edges };
    const idx = pipelines.findIndex((p) => p.id === id);
    const nextList = idx >= 0 ? pipelines.map((p, i) => (i === idx ? pipeline : p)) : [...pipelines, pipeline];
    await savePipelinesList(nextList);
    showToast(`Saved pipeline "${finalName}"`);
    showPipelinesListView();
  }

  async function remove() {
    const idx = pipelines.findIndex((p) => p.id === editingId);
    if (idx < 0) return;
    const removed = pipelines[idx];
    await savePipelinesList(pipelines.filter((_, i) => i !== idx));
    showToast(`Deleted pipeline "${removed.name || '(untitled pipeline)'}"`);
    showPipelinesListView();
  }

  async function runFromEditor() {
    pendingPipelineReturn = 'editor';
    closePipelines();
    await runPipelineGraph(nodes, edges);
    await persistSnippets({ silent: true });
  }

  return (
    <div>
      <div className="pipeline-editor-header">
        <input type="text" id="pipelineNameInput" className="field-input" placeholder="Pipeline name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" className="field-input" placeholder="Description (optional)" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="pipeline-toolbar">
        <button
          type="button"
          className="btn btn-small"
          onClick={(e) => setPicker({ anchor: e.currentTarget.getBoundingClientRect(), onPick: addNode })}
        >
          + Add step
        </button>
        <button type="button" className="btn btn-small" onClick={autoArrange}>
          Auto-arrange
        </button>
        <span className="hint-spacer" />
        <span className="field-hint pipeline-toolbar-hint">Drag a step to move it · drag its right dot onto another step to connect · click a step or connection to edit it</span>
      </div>
      <div className="pipeline-editor-body">
        <div className="pipeline-canvas-wrap">
          <div
            className={'pipeline-canvas' + (nodes.length === 0 ? ' pipeline-canvas-empty-hint' : '')}
            ref={canvasRef}
            onMouseDown={(e) => {
              if (e.target === canvasRef.current) setSelection(null);
            }}
          >
            <svg className="pipeline-edges-svg" ref={svgRef}>
              {edges.map((edge) => (
                <line
                  key={edge.id}
                  data-edge-id={edge.id}
                  className={selection?.type === 'edge' && selection.id === edge.id ? 'pipeline-edge-selected' : ''}
                  ref={(el) => {
                    if (el) lineElRefs.current.set(edge.id, el);
                    else lineElRefs.current.delete(edge.id);
                  }}
                />
              ))}
            </svg>
            <div className="pipeline-edge-labels">
              {edges.map((edge) => (
                <button
                  type="button"
                  key={edge.id}
                  ref={(el) => {
                    if (el) labelElRefs.current.set(edge.id, el);
                    else labelElRefs.current.delete(edge.id);
                  }}
                  className={`pipeline-edge-label condition-${edge.condition}` + (selection?.type === 'edge' && selection.id === edge.id ? ' selected' : '')}
                  data-edge-id={edge.id}
                  title="Click to edit · right-click to remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelection({ type: 'edge', id: edge.id });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setEdges(edges.filter((x) => x.id !== edge.id));
                    if (selection?.type === 'edge' && selection.id === edge.id) setSelection(null);
                  }}
                >
                  {conditionLabel(edge)}
                </button>
              ))}
            </div>
            <div className="pipeline-nodes-layer">
              {nodes.map((node) => {
                const snippet = (state.snippets as Snippet[]).find((s) => s.id === node.snippetId);
                return (
                  <div
                    key={node.id}
                    ref={(el) => {
                      if (el) nodeElRefs.current.set(node.id, el);
                      else nodeElRefs.current.delete(node.id);
                    }}
                    className={'pipeline-node' + (selection?.type === 'node' && selection.id === node.id ? ' selected' : '')}
                    data-node-id={node.id}
                    style={{ left: node.x, top: node.y }}
                    onMouseDown={(e) => onNodeMouseDown(e, node)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setNodes(nodes.filter((n) => n.id !== node.id));
                      setEdges(edges.filter((x) => x.from !== node.id && x.to !== node.id));
                      if (selection?.id === node.id) setSelection(null);
                    }}
                  >
                    <div className="pipeline-port pipeline-port-in" title="Drop a connection here" />
                    <div className="pipeline-node-name">{snippet ? `${snippetIcon(snippet)} ${snippet.name}` : '⚠ (deleted snippet)'}</div>
                    <div className="pipeline-node-tag">{snippet ? snippet.tag : ''}</div>
                    <div className="pipeline-port pipeline-port-out" title="Drag to connect to another step" onMouseDown={(e) => onOutPortMouseDown(e, node)} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <Inspector selection={selection} nodes={nodes} edges={edges} setNodes={setNodes} setEdges={setEdges} setSelection={setSelection} openPicker={(anchor, onPick) => setPicker({ anchor: anchor.getBoundingClientRect(), onPick })} />
      </div>
      <div className="modal-actions modal-actions-left">
        {editingPipeline && (
          <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
            Delete pipeline
          </button>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={showPipelinesListView}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={runFromEditor}>
          Run
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save pipeline
        </button>
      </div>
      {picker && <SnippetPickerMenu picker={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

export function PipelinesModal() {
  const { open, view, editingId } = usePipelinesStore();
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && view === 'list') closePipelines(); }}>
      <div className="modal modal-pipeline">{view === 'list' ? <ListView /> : <EditorView editingId={editingId} />}</div>
    </div>
  );
}
