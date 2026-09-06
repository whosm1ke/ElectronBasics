// PipelinesModal.tsx — the Pipelines screen: a saved-list view (mirrors
// GroupsModal.tsx) plus a node-graph canvas editor with a selection-driven
// inspector side panel. Renders as a full-window "screen" (see style.css's
// `.screen` section) rather than a small centered `.modal` dialog — same
// pattern GroupsModal.tsx uses, replacing the snippet list for as long as
// it's open with its own header Back button. (A brief detour: this
// genuinely lived in its own separate BrowserWindow for a bit, since a
// graph editor benefits from more room than a modal gets — reverted back
// to the in-window screen model on request, since consistency with every
// other full-screen feature in this app mattered more here.)
//
// Ported from modules/pipeline-editor.js, then from a hand-rolled
// imperative canvas (mousedown/mousemove/mouseup dragging,
// getBoundingClientRect()-based edge-line recomputation — CLAUDE.md used to
// document this as the app's "one deliberately-not-fully-declarative piece
// of UI") onto @xyflow/react (see pipeline/PipelineCanvas.tsx) — real
// pan/zoom, multi-select, keyboard delete, a minimap, and dagre-based
// auto-layout (pipelineLayout.ts) replaced all of that by hand.
//
// EditorView still owns `nodes`/`edges` as this app's own persisted shape
// (PipelineNode[]/PipelineEdge[]) in local state — the working copy,
// discarded on Cancel, same contract as before — and hands them to
// PipelineCanvas as plain, controlled data; only PipelineCanvas.tsx and
// pipelineFlow.ts need to know React Flow's own Node/Edge shape exists.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Play, Pencil, Wand2, Copy, Share2 } from 'lucide-react';
import type { Pipeline, PipelineNode, PipelineEdge, EdgeCondition, Snippet } from '@shared/types';
import { snippetIcon, newId, SHELL_LABELS, pipelineConditionLabel, tryCreatePipelineEdge } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ThemedSelect } from '../shared/ThemedSelect';
import { PipelineCanvas, type Selection } from './pipeline/PipelineCanvas';
import { layoutPipelineNodes } from '../../lib/pipelineLayout';
import { usePipelinesStore, openPipelineEditor, showPipelinesListView, closePipelines, savePipelinesList } from '../../store/usePipelinesStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';
import { runPipelineGraph } from '../../lib/pipelineEngine';

/** Every saved snippet, formatted for the shared picker menu — used by both "+ Add step" and "Change step…", which both pick a snippet the same way. `tag`/`filterText` back that menu's own search box and category chips (see SnippetPickerMenu below). */
function snippetPickerItems(): PickerItem[] {
  return (state.snippets as Snippet[]).map((s) => ({
    id: s.id,
    label: (
      <>
        {snippetIcon(s)} {s.name}
      </>
    ),
    tag: s.tag,
    filterText: `${s.name} ${s.tag} ${s.command}`.toLowerCase(),
  }));
}

const CONDITION_OPTIONS: [EdgeCondition, string][] = [
  ['success', 'Succeeds (exit code 0)'],
  ['failure', 'Fails (non-zero exit code)'],
  ['always', 'Either way'],
  ['exitCode', 'Exits with a specific code'],
  ['outputContains', 'Output contains text'],
];

function ListView() {
  const { pipelines } = usePipelinesStore();

  // Closes this screen before running — same reasoning as GroupsModal.tsx's
  // runGroup(): the batch-results modal and this screen are both
  // full-window overlays, so leaving this open would just bury the results
  // underneath it (or vice versa, depending on DOM order) rather than
  // showing them.
  async function runSaved(pipeline: Pipeline) {
    closePipelines();
    await runPipelineGraph(pipeline.nodes, pipeline.edges);
    await persistSnippets({ silent: true }); // runCount/lastRunAt bumps — cards pick them up next real refresh
  }

  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closePipelines}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>Pipelines</h2>
          <span className="field-hint">Chain snippets with branching — run different steps depending on whether the previous one succeeded.</span>
        </div>
        <button type="button" className="btn btn-small" onClick={() => openPipelineEditor(null)}>
          + New pipeline
        </button>
      </div>
      <div className="screen-body no-scrollbar">
        {pipelines.length === 0 ? (
          <div className="variables-empty">No pipelines yet. Build a small graph of steps that branch on success/failure/output, then run it with one click.</div>
        ) : (
          <div className="groups-list">
            {pipelines.map((p) => (
              <div className="group-row" key={p.id}>
                <div className="group-row-info">
                  <div className="group-row-name">{p.name || '(untitled pipeline)'}</div>
                  <div className="group-row-count">
                    {p.nodes.length} step{p.nodes.length === 1 ? '' : 's'} · {p.edges.length} connection{p.edges.length === 1 ? '' : 's'}
                  </div>
                  {p.description && <div className="group-row-description">{p.description}</div>}
                </div>
                <button type="button" className="btn btn-small btn-primary" onClick={() => runSaved(p)}>
                  <Play size={13} fill="currentColor" stroke="none" />
                  <span>Run</span>
                </button>
                <button type="button" className="btn btn-small" onClick={() => openPipelineEditor(p)}>
                  <Pencil size={13} />
                  <span>Edit</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface PickerItem {
  id: string;
  label: ReactNode;
  /** The item's category/tag, when it has one — drives the filter-chip row below. Omitted for "Connect to…"'s targets (pipeline steps, not standalone snippets — a tag chip row over a handful of steps isn't worth the space). */
  tag?: string;
  /** Lowercased name+tag+command blob the search box matches against — same "search everything, cheaply" shape as the main list's own free-text search. */
  filterText: string;
}

// Generic enough to back every "pick one of these" floating menu in the
// editor: "+ Add step"/"Change step…" (items = every snippet) and the
// Inspector's "+ Connect to…" (items = every OTHER step in this pipeline) —
// same look, same positioning/dismiss logic, just a different item list and
// empty-state message per call site.
interface SnippetPickerState {
  anchor: DOMRect;
  items: PickerItem[];
  emptyLabel: string;
  onPick: (id: string) => void;
}

function SnippetPickerMenu({ picker, onClose }: { picker: SnippetPickerState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Reposition whenever the *content* height changes too (typing a query or
  // picking a tag can shrink the list a lot), not just on first mount —
  // otherwise a long "no matches" gap could open up below a short filtered
  // list, or the menu could clip past the viewport bottom on a big one.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const mRect = menu.getBoundingClientRect();
    setPos({
      left: Math.max(6, Math.min(picker.anchor.left, window.innerWidth - mRect.width - 6)),
      top: Math.min(picker.anchor.bottom + 4, window.innerHeight - mRect.height - 6),
    });
  }, [picker, query, activeTag]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('#pipelineSnippetPickerMenu')) onClose();
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [onClose]);

  // Every distinct tag among this picker's own items, alphabetical — not
  // the whole library's tag set, so "Connect to…" (whose items have no
  // `tag` at all) simply shows no chip row.
  const tags = Array.from(new Set(picker.items.map((i) => i.tag).filter((t): t is string => Boolean(t)))).sort((a, b) => a.localeCompare(b));

  const q = query.trim().toLowerCase();
  const visible = picker.items.filter((item) => (!activeTag || item.tag === activeTag) && (!q || item.filterText.includes(q)));

  function pick(id: string) {
    picker.onPick(id);
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className="context-menu pipeline-picker-menu"
      id="pipelineSnippetPickerMenu"
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'Enter' && visible.length > 0) { e.preventDefault(); pick(visible[0].id); }
      }}
    >
      {picker.items.length > 0 && (
        <input
          type="text"
          className="field-input pipeline-picker-search"
          placeholder="Search by name, tag, or command…"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {tags.length > 1 && (
        <div className="pipeline-picker-tags no-scrollbar">
          <button type="button" className={'pipeline-picker-tag-chip' + (activeTag === null ? ' active' : '')} onClick={() => setActiveTag(null)}>
            All
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={'pipeline-picker-tag-chip' + (activeTag === tag ? ' active' : '')}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="pipeline-picker-list no-scrollbar">
        {picker.items.length === 0 ? (
          <div className="context-menu-item">{picker.emptyLabel}</div>
        ) : visible.length === 0 ? (
          <div className="context-menu-item pipeline-picker-empty">No matches</div>
        ) : (
          visible.map((item) => (
            <button type="button" key={item.id} className="context-menu-item" onClick={() => pick(item.id)}>
              <span>{item.label}</span>
              {item.tag && <span className="pipeline-picker-item-tag">{item.tag}</span>}
            </button>
          ))
        )}
      </div>
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
  openPicker: (anchor: HTMLElement, items: PickerItem[], emptyLabel: string, onPick: (id: string) => void) => void;
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
  /** Copies a step's snippet reference (never its connections — a duplicate starts unconnected, same as adding a brand-new step) at a small offset so it doesn't sit exactly on top of the original. */
  function duplicateNode(node: PipelineNode) {
    const copy: PipelineNode = { id: newId('node'), snippetId: node.snippetId, x: node.x + 30, y: node.y + 30 };
    setNodes([...nodes, copy]);
    setSelection({ type: 'node', id: copy.id });
  }
  /** The explicit, precision-drag-free way to connect two steps — see tryCreatePipelineEdge's own header comment on why this exists alongside dragging a connection on the canvas. */
  function connectFrom(node: PipelineNode) {
    const targets: PickerItem[] = nodes
      .filter((n) => n.id !== node.id)
      .map((n) => {
        const s = snippets.find((sn) => sn.id === n.snippetId);
        return {
          id: n.id,
          label: s ? <>{snippetIcon(s)} {s.name}</> : <>⚠ (deleted snippet)</>,
          filterText: s ? `${s.name} ${s.tag} ${s.command}`.toLowerCase() : 'deleted snippet',
        };
      });
    return (anchor: HTMLElement) =>
      openPicker(anchor, targets, 'No other steps to connect to yet', (targetId) => {
        const result = tryCreatePipelineEdge(edges, node.id, targetId);
        if (!result.ok) {
          showToast(result.error, 'error');
          return;
        }
        setEdges([...edges, result.edge]);
        setSelection({ type: 'edge', id: result.edge.id });
      });
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
            openPicker(e.currentTarget, snippetPickerItems(), 'No snippets yet', (newSnippetId) => {
              setNodes(nodes.map((n) => (n.id === node.id ? { ...n, snippetId: newSnippetId } : n)));
            })
          }
        >
          Change step…
        </button>
        <button type="button" className="btn btn-small" onClick={() => duplicateNode(node)}>
          <Copy size={12} />
          <span>Duplicate step</span>
        </button>
        <button type="button" className="btn btn-small" onClick={(e) => connectFrom(node)(e.currentTarget)}>
          <Share2 size={12} />
          <span>Connect to…</span>
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
                  {pipelineConditionLabel(edge)} → {targetSnippet ? targetSnippet.name : '?'}
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
      <ThemedSelect
        value={edge.condition}
        options={CONDITION_OPTIONS.map(([value, label]) => ({ value, label }))}
        onChange={(condition) => {
          let value = edge.value;
          if (condition === 'exitCode' && typeof value !== 'number') value = 0;
          else if (condition === 'outputContains' && typeof value !== 'string') value = '';
          else if (condition !== 'exitCode' && condition !== 'outputContains') value = null;
          updateEdge({ condition, value });
        }}
      />
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
  // pipeline so mutating it here never touches the saved one. Handed to
  // PipelineCanvas as plain, controlled data — see this file's header
  // comment on why the React Flow shape itself never leaks up to here.
  const [nodes, setNodes] = useState<PipelineNode[]>(() => (editingPipeline ? editingPipeline.nodes.map((n) => ({ ...n })) : []));
  const [edges, setEdges] = useState<PipelineEdge[]>(() => (editingPipeline ? editingPipeline.edges.map((e) => ({ ...e })) : []));
  const [selection, setSelection] = useState<Selection>(null);
  const [picker, setPicker] = useState<SnippetPickerState | null>(null);
  const [fitViewSignal, setFitViewSignal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('pipelineNameInput')?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  /** Diagonal cascade so successive clicks of "+ Add step" don't all land in the same spot — offset by more than half NODE_WIDTH/NODE_HEIGHT so even the 2nd/3rd step is legible without immediately needing auto-arrange (dagre), which is the real layout tool once there's more than a handful of steps. */
  function nextNodePosition(): { x: number; y: number } {
    const n = nodes.length;
    return { x: 60 + (n % 5) * 110, y: 60 + (n % 5) * 70 };
  }

  function addNode(snippetId: string) {
    const pos = nextNodePosition();
    const node: PipelineNode = { id: newId('node'), snippetId, x: pos.x, y: pos.y };
    setNodes([...nodes, node]);
    setSelection({ type: 'node', id: node.id });
    // <ReactFlow fitView> only ever fires once, on this component's first
    // mount — which for a brand-new pipeline happens against zero nodes (a
    // no-op). Without re-fitting here too, a step (and its connection
    // handles) can land outside the visible, clipped canvas area and never
    // come back into view on their own.
    setFitViewSignal((v) => v + 1);
  }

  /** Lays every node out left-to-right via `dagre` (pipelineLayout.ts) — a one-click fix for a graph that's turned into a tangle after a lot of free-form dragging — then fits the viewport to the result. */
  function autoArrange() {
    if (nodes.length === 0) return;
    setNodes(layoutPipelineNodes(nodes, edges));
    setFitViewSignal((v) => v + 1);
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
    closePipelines();
    await runPipelineGraph(nodes, edges);
    await persistSnippets({ silent: true });
  }

  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back to pipelines" onClick={showPipelinesListView}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <input type="text" id="pipelineNameInput" className="field-input" placeholder="Pipeline name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <input type="text" className="field-input pipeline-description-input" placeholder="Description (optional)" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="pipeline-toolbar">
        <button
          type="button"
          className="btn btn-small"
          onClick={(e) => setPicker({ anchor: e.currentTarget.getBoundingClientRect(), items: snippetPickerItems(), emptyLabel: 'No snippets yet', onPick: addNode })}
        >
          + Add step
        </button>
        <button type="button" className="btn btn-small" onClick={autoArrange}>
          <Wand2 size={12} />
          <span>Auto-arrange</span>
        </button>
        <span className="hint-spacer" />
        <span className="field-hint pipeline-toolbar-hint">
          Drag a step to move it · drag its right dot onto another step to connect · click a step or connection to edit it · Delete key removes what's selected
        </span>
      </div>
      <div className="pipeline-editor-body">
        <div className={'pipeline-canvas-wrap' + (nodes.length === 0 ? ' pipeline-canvas-empty-hint' : '')}>
          <PipelineCanvas
            nodes={nodes}
            edges={edges}
            selection={selection}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onSelectionChange={setSelection}
            fitViewSignal={fitViewSignal}
          />
        </div>
        <Inspector
          selection={selection}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          setSelection={setSelection}
          openPicker={(anchor, items, emptyLabel, onPick) => setPicker({ anchor: anchor.getBoundingClientRect(), items, emptyLabel, onPick })}
        />
      </div>
      <div className="screen-footer screen-footer-left">
        {editingPipeline ? (
          <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
            Delete pipeline
          </button>
        ) : (
          <span />
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={runFromEditor}>
            Run
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save pipeline
          </button>
        </div>
      </div>
      {picker && <SnippetPickerMenu picker={picker} onClose={() => setPicker(null)} />}
    </>
  );
}

export function PipelinesModal() {
  const { open, view, editingId } = usePipelinesStore();
  if (!open) return null;

  return <div className="screen">{view === 'list' ? <ListView /> : <EditorView editingId={editingId} />}</div>;
}
