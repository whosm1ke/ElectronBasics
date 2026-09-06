// PipelinesModal.tsx — the Pipelines screen: a saved-list view (mirrors
// GroupsModal.tsx) plus a node-graph canvas editor with a selection-driven
// inspector side panel. Renders as a full-window "screen" (see style.css's
// `.screen` section) rather than a small centered `.modal` dialog — same
// pattern GroupsModal.tsx uses, replacing the snippet list for as long as
// it's open with its own header Back button.
//
// Ported from modules/pipeline-editor.js, then from a hand-rolled
// imperative canvas onto @xyflow/react (see pipeline/PipelineCanvas.tsx),
// then extended with four node kinds (step/delay/gate/pipeline — see
// @shared/types/pipeline.ts), AND/OR join modes, per-step retries, a
// pipeline-level schedule + concurrency cap, and live run-status painted
// onto the canvas (see lib/pipelineEngine.ts's header comment).
//
// EditorView still owns `nodes`/`edges` as this app's own persisted shape
// (PipelineNode[]/PipelineEdge[]) in local state — the working copy,
// discarded on Cancel, same contract as before — and hands them to
// PipelineCanvas as plain, controlled data; only PipelineCanvas.tsx and
// pipelineFlow.ts need to know React Flow's own Node/Edge shape exists.
import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Pencil, Wand2, Copy, Share2, Clock, ShieldQuestion, Waypoints, PlusCircle, SlidersHorizontal, Layers } from 'lucide-react';
import { InfoHint } from '../shared/InfoHint';
import type { Pipeline, PipelineNode, PipelineEdge, EdgeCondition, JoinMode, NodeKind, ScheduleType, Snippet, Group } from '@shared/types';
import { VALID_SCHEDULE_TYPES } from '@shared/types';
import { snippetIcon, newId, SHELL_LABELS, pipelineConditionLabel, pipelineNodeDisplayName, pipelineReferenceCreatesCycle, collectPipelinePlaceholders, collectPipelinePlaceholdersUsedBy, tryCreatePipelineEdge } from '../../lib/utils';
import { ParamForm } from '../Card/ParamForm';
import { showToast } from '../../lib/toast';
import { ThemedSelect } from '../shared/ThemedSelect';
import { SnippetPickerMenu, snippetPickerItems, type PickerItem, type SnippetPickerState } from '../shared/SnippetPicker';
import { PipelineCanvas, type Selection } from './pipeline/PipelineCanvas';
import { layoutPipelineNodes } from '../../lib/pipelineLayout';
import { usePipelinesStore, openPipelineEditor, closePipelines, closePipelinesForRun, consumePendingReopen, backFromPipelineEditor, savePipelinesList } from '../../store/usePipelinesStore';
import { onBatchModalClosed } from '../../lib/events';
import { openModal } from '../../store/useEditorStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';
import { runPipelineGraph } from '../../lib/pipelineEngine';
import { useScreenOpenAnimation } from '../../lib/screenAnimation';
import { openGroupEditor } from '../../store/useGroupsStore';

const JOIN_MODE_OPTIONS: [JoinMode, string][] = [
  ['any', 'Any incoming link (OR)'],
  ['all', 'Every incoming link (AND)'],
];

function blankNode(kind: NodeKind, x: number, y: number): PipelineNode {
  return {
    id: newId('node'), kind, snippetId: '', subPipelineId: '', groupId: '', delaySeconds: 5, label: '',
    retries: 0, retryDelaySeconds: 5, joinMode: 'any', x, y,
  };
}

/** Every saved snippet, formatted for the shared picker menu — used by "+ Snippet"/"Change step…", which both pick a snippet the same way. */
function allSnippetPickerItems(): PickerItem[] {
  return snippetPickerItems(state.snippets as Snippet[]);
}

const CONDITION_OPTIONS: [EdgeCondition, string][] = [
  ['success', 'Succeeds (exit code 0)'],
  ['failure', 'Fails (non-zero exit code)'],
  ['always', 'Either way'],
  ['exitCode', 'Exits with a specific code'],
  ['outputContains', 'Output contains text'],
];

/**
 * Every `{{placeholder}}` used anywhere in this pipeline is collected and
 * prompted for ONCE, up front, rather than skipping every parameterized
 * step — a small modal (reusing Card.tsx's own ParamForm) gates the actual
 * run behind it when there's at least one name to collect. Shared by both
 * ListView's "Run" and EditorView's "Run", which otherwise duplicate this
 * exact gate/run/persist sequence.
 *
 * `closeScreenFirst` used to always be true — this screen and the results
 * modal were both full-window overlays at the SAME z-index, so leaving the
 * screen open would bury the results underneath it. Now that `.modal-overlay`
 * renders above `.screen` (see style.css), EditorView passes `false`
 * instead: leaving the canvas mounted during a run is what lets
 * lib/pipelineEngine.ts's live run-status classes (pf-run-active/ok/error/
 * skipped) actually paint onto something — closing the screen first would
 * unmount the canvas before the run even starts, silently making that live
 * visualization a no-op (exactly what happened before this fix). ListView
 * has no canvas open to visualize onto in the first place, so it keeps
 * closing first, same as GroupsModal.tsx's own runGroup().
 */
function usePipelineParamGate() {
  const [gate, setGate] = useState<{
    nodes: PipelineNode[];
    edges: PipelineEdge[];
    maxConcurrency: number;
    names: string[];
    usedBy: Record<string, string[]>;
    closeScreenFirst: boolean;
  } | null>(null);

  async function runWithGate(pipeline: Pick<Pipeline, 'nodes' | 'edges' | 'maxConcurrency'>, closeScreenFirst = true) {
    const names = collectPipelinePlaceholders(pipeline.nodes, state.snippets as Snippet[]);
    if (names.length === 0) {
      if (closeScreenFirst) closePipelinesForRun();
      await runPipelineGraph(pipeline.nodes, pipeline.edges, { maxConcurrency: pipeline.maxConcurrency });
      await persistSnippets({ silent: true });
      return;
    }
    const usedBy = collectPipelinePlaceholdersUsedBy(pipeline.nodes, state.snippets as Snippet[]);
    setGate({ nodes: pipeline.nodes, edges: pipeline.edges, maxConcurrency: pipeline.maxConcurrency, names, usedBy, closeScreenFirst });
  }

  const gateModal = gate && (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setGate(null); }}>
      <div className="modal">
        <h2>Values for this run</h2>
        <p className="field-hint">Collected once for every parameterized step in this pipeline — see which step each value is for under its name.</p>
        <ParamForm
          names={gate.names}
          usedBy={gate.usedBy}
          onCancel={() => setGate(null)}
          onRun={async (values) => {
            const { nodes, edges, maxConcurrency, closeScreenFirst } = gate;
            setGate(null);
            if (closeScreenFirst) closePipelinesForRun();
            await runPipelineGraph(nodes, edges, { maxConcurrency, values });
            await persistSnippets({ silent: true });
          }}
        />
      </div>
    </div>
  );

  return { runWithGate, gateModal };
}

function ListView() {
  const { pipelines } = usePipelinesStore();
  const { runWithGate, gateModal } = usePipelineParamGate();

  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closePipelines}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>
            Pipelines <InfoHint text="Chain snippets with branching — run different steps depending on whether the previous one succeeded." />
          </h2>
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
                  <div className="group-row-name">
                    {p.name || '(untitled pipeline)'}
                    {p.schedule?.enabled && (
                      <span className="schedule-badge" title="Runs automatically on a schedule">
                        <Clock size={11} />
                      </span>
                    )}
                  </div>
                  <div className="group-row-count">
                    {p.nodes.length} step{p.nodes.length === 1 ? '' : 's'} · {p.edges.length} connection{p.edges.length === 1 ? '' : 's'}
                  </div>
                  {p.description && <div className="group-row-description">{p.description}</div>}
                </div>
                <button type="button" className="btn btn-small btn-primary" onClick={() => runWithGate(p)}>
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
      {gateModal}
    </>
  );
}

function Inspector({
  selection,
  nodes,
  edges,
  pipelines,
  editingId,
  setNodes,
  setEdges,
  setSelection,
  openPicker,
}: {
  selection: Selection;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  pipelines: Pipeline[];
  editingId: string | null;
  setNodes: (n: PipelineNode[]) => void;
  setEdges: (e: PipelineEdge[]) => void;
  setSelection: (s: Selection) => void;
  openPicker: (anchor: HTMLElement, items: PickerItem[], emptyLabel: string, onPick: (id: string) => void) => void;
}) {
  if (!selection) return null;
  const snippets = state.snippets as Snippet[];
  const groups = state.groups as Group[];

  function removeNode(nodeId: string) {
    setNodes(nodes.filter((n) => n.id !== nodeId));
    setEdges(edges.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setSelection(null);
  }
  function removeEdge(edgeId: string) {
    setEdges(edges.filter((e) => e.id !== edgeId));
    setSelection(null);
  }
  function updateNode(nodeId: string, patch: Partial<PipelineNode>) {
    setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
  }
  /** Copies a step's own config (never its connections — a duplicate starts unconnected, same as adding a brand-new step) at a small offset so it doesn't sit exactly on top of the original. */
  function duplicateNode(node: PipelineNode) {
    const copy: PipelineNode = { ...node, id: newId('node'), x: node.x + 30, y: node.y + 30 };
    setNodes([...nodes, copy]);
    setSelection({ type: 'node', id: copy.id });
  }
  /** The explicit, precision-drag-free way to connect two steps — see tryCreatePipelineEdge's own header comment on why this exists alongside dragging a connection on the canvas. */
  function connectFrom(node: PipelineNode) {
    const targets: PickerItem[] = nodes
      .filter((n) => n.id !== node.id)
      .map((n) => ({ id: n.id, label: <>{pipelineNodeDisplayName(n, snippets, pipelines, groups)}</>, filterText: pipelineNodeDisplayName(n, snippets, pipelines, groups).toLowerCase() }));
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
    const outgoing = edges.filter((e) => e.from === node.id);
    const hasIncoming = edges.some((e) => e.to === node.id);

    const commonFooter = (
      <>
        {hasIncoming && (
          <>
            <label className="field-label">When more than one link points here</label>
            <ThemedSelect value={node.joinMode} options={JOIN_MODE_OPTIONS.map(([value, label]) => ({ value, label }))} onChange={(joinMode) => updateNode(node.id, { joinMode })} />
          </>
        )}
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
              return (
                <button type="button" key={edge.id} className="pipeline-inspector-edge-row" onClick={() => setSelection({ type: 'edge', id: edge.id })}>
                  {pipelineConditionLabel(edge)} → {targetNode ? pipelineNodeDisplayName(targetNode, snippets, pipelines, groups) : '?'}
                </button>
              );
            })}
          </>
        )}
      </>
    );

    if (node.kind === 'step') {
      const snippet = snippets.find((s) => s.id === node.snippetId);
      return (
        <div className="pipeline-inspector no-scrollbar">
          <div className="pipeline-inspector-title">Step</div>
          <div className="pipeline-inspector-name" title={snippet?.name}>{snippet ? `${snippetIcon(snippet)} ${snippet.name}` : '⚠ (deleted snippet)'}</div>
          {snippet && (
            <div className="pipeline-inspector-meta">
              {SHELL_LABELS[snippet.shell] || snippet.shell} · {snippet.tag}
            </div>
          )}
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) =>
              openPicker(e.currentTarget, allSnippetPickerItems(), 'No snippets yet', (newSnippetId) => updateNode(node.id, { snippetId: newSnippetId }))
            }
          >
            Change step…
          </button>
          {snippet && (
            <button type="button" className="btn btn-small" onClick={() => openModal(snippet)}>
              <Pencil size={12} />
              <span>Edit snippet…</span>
            </button>
          )}
          <button type="button" className="btn btn-small" onClick={() => duplicateNode(node)}>
            <Copy size={12} />
            <span>Duplicate step</span>
          </button>
          <label className="field-label">Retries on failure</label>
          <div className="schedule-field-row">
            <input type="number" className="field-input" min={0} max={10} value={node.retries} onChange={(e) => updateNode(node.id, { retries: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
            <span className="field-hint">extra attempts</span>
          </div>
          {node.retries > 0 && (
            <div className="schedule-field-row">
              <input type="number" className="field-input" min={0} value={node.retryDelaySeconds} onChange={(e) => updateNode(node.id, { retryDelaySeconds: Math.max(0, Number(e.target.value) || 0) })} />
              <span className="field-hint">seconds between attempts</span>
            </div>
          )}
          {commonFooter}
        </div>
      );
    }

    if (node.kind === 'delay') {
      return (
        <div className="pipeline-inspector no-scrollbar">
          <div className="pipeline-inspector-title">Delay</div>
          <label className="field-label">Caption (optional)</label>
          <input type="text" className="field-input" placeholder={`Wait ${node.delaySeconds}s`} value={node.label} onChange={(e) => updateNode(node.id, { label: e.target.value })} />
          <label className="field-label">Wait</label>
          <div className="schedule-field-row">
            <input type="number" className="field-input" min={1} value={node.delaySeconds} onChange={(e) => updateNode(node.id, { delaySeconds: Math.max(1, Number(e.target.value) || 1) })} />
            <span className="field-hint">seconds</span>
          </div>
          {commonFooter}
        </div>
      );
    }

    if (node.kind === 'gate') {
      return (
        <div className="pipeline-inspector no-scrollbar">
          <div className="pipeline-inspector-title">Approval gate</div>
          <p className="field-hint">Pauses an interactive run for a manual Continue/Abort. Auto-skipped (treated as not approved) on a scheduled run — there's nowhere to ask.</p>
          <label className="field-label">Prompt</label>
          <input type="text" className="field-input" placeholder="Approve deploy?" value={node.label} onChange={(e) => updateNode(node.id, { label: e.target.value })} />
          {commonFooter}
        </div>
      );
    }

    if (node.kind === 'pipeline') {
      const target = pipelines.find((p) => p.id === node.subPipelineId);
      const candidateIds = pipelines.filter((p) => p.id !== editingId && !pipelineReferenceCreatesCycle(pipelines, editingId, [p.id])).map((p) => p.id);
      return (
        <div className="pipeline-inspector no-scrollbar">
          <div className="pipeline-inspector-title">Sub-pipeline</div>
          <div className="pipeline-inspector-name">{target ? target.name || '(untitled pipeline)' : '⚠ Not set'}</div>
          <button
            type="button"
            className="btn btn-small"
            onClick={(e) =>
              openPicker(
                e.currentTarget,
                pipelines.filter((p) => candidateIds.includes(p.id)).map((p) => ({ id: p.id, label: <>{p.name || '(untitled pipeline)'}</>, filterText: (p.name || '').toLowerCase() })),
                'No other pipelines available (would create a cycle, or none exist yet)',
                (subPipelineId) => updateNode(node.id, { subPipelineId })
              )
            }
          >
            Change target…
          </button>
          {commonFooter}
        </div>
      );
    }

    // 'group' — unlike a sub-pipeline, a Group can never create a reference
    // cycle (it only ever points at snippets), so every saved group is
    // always a valid target — no pipelineReferenceCreatesCycle-style filter
    // needed here.
    const targetGroup = groups.find((g) => g.id === node.groupId);
    return (
      <div className="pipeline-inspector no-scrollbar">
        <div className="pipeline-inspector-title">Group</div>
        <div className="pipeline-inspector-name">{targetGroup ? targetGroup.name || '(untitled group)' : '⚠ Not set'}</div>
        {targetGroup && <div className="pipeline-inspector-meta">{targetGroup.snippetIds.length} snippet(s)</div>}
        <button
          type="button"
          className="btn btn-small"
          onClick={(e) =>
            openPicker(
              e.currentTarget,
              groups.map((g) => ({ id: g.id, label: <>{g.name || '(untitled group)'}</>, filterText: (g.name || '').toLowerCase() })),
              'No groups yet',
              (groupId) => updateNode(node.id, { groupId })
            )
          }
        >
          Change group…
        </button>
        {targetGroup && (
          // The group editor is a `.modal` now (GroupEditorModal.tsx) — it
          // layers above this Pipelines screen without closing it first, so
          // the working-copy graph here is never at risk of being discarded
          // just to edit the group a node points at.
          <button type="button" className="btn btn-small" onClick={() => openGroupEditor(targetGroup)}>
            <Pencil size={12} />
            <span>Edit group…</span>
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={() => duplicateNode(node)}>
          <Copy size={12} />
          <span>Duplicate step</span>
        </button>
        {commonFooter}
      </div>
    );
  }

  const edge = edges.find((e) => e.id === selection.id);
  if (!edge) return null;
  const fromNode = nodes.find((n) => n.id === edge.from);
  const toNode = nodes.find((n) => n.id === edge.to);
  const needsValue = edge.condition === 'exitCode' || edge.condition === 'outputContains';

  function updateEdge(patch: Partial<PipelineEdge>) {
    setEdges(edges.map((e) => (e.id === edge!.id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="pipeline-inspector no-scrollbar">
      <div className="pipeline-inspector-title">Connection</div>
      <div className="pipeline-inspector-meta">
        {fromNode ? pipelineNodeDisplayName(fromNode, snippets, pipelines, groups) : '?'} → {toNode ? pipelineNodeDisplayName(toNode, snippets, pipelines, groups) : '?'}
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
  const { runWithGate, gateModal } = usePipelineParamGate();

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(editingPipeline?.schedule?.enabled));
  const [scheduleType, setScheduleType] = useState<ScheduleType>(editingPipeline?.schedule?.type || 'interval');
  const [intervalMinutes, setIntervalMinutes] = useState(String(editingPipeline?.schedule?.intervalMinutes || 60));
  const [dailyTime, setDailyTime] = useState(editingPipeline?.schedule?.dailyTime || '09:00');
  const [cronExpr, setCronExpr] = useState(editingPipeline?.schedule?.cronExpr || '*/15 * * * *');
  const [maxConcurrency, setMaxConcurrency] = useState(String(editingPipeline?.maxConcurrency || 0));

  useEffect(() => {
    const t = setTimeout(() => document.getElementById('pipelineNameInput')?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  /** Diagonal cascade so successive clicks of "+ Snippet"/"+ Delay"/etc. don't all land in the same spot. */
  function nextNodePosition(): { x: number; y: number } {
    const n = nodes.length;
    return { x: 60 + (n % 5) * 110, y: 60 + (n % 5) * 70 };
  }

  function placeAndSelect(node: PipelineNode) {
    setNodes([...nodes, node]);
    setSelection({ type: 'node', id: node.id });
    // <ReactFlow fitView> only ever fires once, on this component's first
    // mount — which for a brand-new pipeline happens against zero nodes (a
    // no-op). Without re-fitting here too, a step (and its connection
    // handles) can land outside the visible, clipped canvas area and never
    // come back into view on their own.
    setFitViewSignal((v) => v + 1);
  }

  function addSnippetStep(snippetId: string) {
    const pos = nextNodePosition();
    placeAndSelect({ ...blankNode('step', pos.x, pos.y), snippetId });
  }
  function addDelay() {
    const pos = nextNodePosition();
    placeAndSelect(blankNode('delay', pos.x, pos.y));
  }
  function addGate() {
    const pos = nextNodePosition();
    placeAndSelect(blankNode('gate', pos.x, pos.y));
  }
  function addSubPipeline(subPipelineId: string) {
    const pos = nextNodePosition();
    placeAndSelect({ ...blankNode('pipeline', pos.x, pos.y), subPipelineId });
  }
  function addGroupNode(groupId: string) {
    const pos = nextNodePosition();
    placeAndSelect({ ...blankNode('group', pos.x, pos.y), groupId });
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
    const subPipelineIds = nodes.filter((n) => n.kind === 'pipeline' && n.subPipelineId).map((n) => n.subPipelineId);
    if (pipelineReferenceCreatesCycle(pipelines, id, subPipelineIds)) {
      showToast("Can't save — one of these sub-pipelines eventually points back to this one", 'error');
      return;
    }
    const existingSchedule = editingPipeline?.schedule;
    const schedule = scheduleEnabled
      ? {
          enabled: true,
          type: scheduleType,
          intervalMinutes: Number(intervalMinutes) || 60,
          dailyTime: dailyTime || '09:00',
          cronExpr: cronExpr.trim() || '*/15 * * * *',
          lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
          paramValues: existingSchedule ? existingSchedule.paramValues : null,
        }
      : null;
    const pipeline: Pipeline = { id, name: finalName, description: finalDescription, nodes, edges, schedule, maxConcurrency: Math.max(0, Number(maxConcurrency) || 0) };
    const idx = pipelines.findIndex((p) => p.id === id);
    const nextList = idx >= 0 ? pipelines.map((p, i) => (i === idx ? pipeline : p)) : [...pipelines, pipeline];
    await savePipelinesList(nextList);
    showToast(`Saved pipeline "${finalName}"`);
    backFromPipelineEditor();
  }

  async function remove() {
    const idx = pipelines.findIndex((p) => p.id === editingId);
    if (idx < 0) return;
    const removed = pipelines[idx];
    await savePipelinesList(pipelines.filter((_, i) => i !== idx));
    showToast(`Deleted pipeline "${removed.name || '(untitled pipeline)'}"`);
    backFromPipelineEditor();
  }

  async function runFromEditor() {
    // false: keep the canvas mounted so the run actually paints onto it —
    // see usePipelineParamGate()'s header comment.
    await runWithGate({ nodes, edges, maxConcurrency: Math.max(0, Number(maxConcurrency) || 0) }, false);
  }

  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back to pipelines" onClick={backFromPipelineEditor}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <input type="text" id="pipelineNameInput" className="field-input" placeholder="Pipeline name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <input type="text" className="field-input pipeline-description-input" placeholder="Description (optional)" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="pipeline-toolbar">
        <div className="pipeline-toolbar-group" title="Add to this pipeline">
          <button type="button" className="btn btn-small" onClick={(e) => setPicker({ anchor: e.currentTarget.getBoundingClientRect(), items: allSnippetPickerItems(), emptyLabel: 'No snippets yet', onPick: addSnippetStep })}>
            <PlusCircle size={12} />
            <span>Snippet</span>
          </button>
          <button type="button" className="btn btn-small" title="Add a pure wait — no snippet involved" onClick={addDelay}>
            <Clock size={12} />
            <span>Delay</span>
          </button>
          <button type="button" className="btn btn-small" title="Pause an interactive run for manual approval" onClick={addGate}>
            <ShieldQuestion size={12} />
            <span>Gate</span>
          </button>
          <button
            type="button"
            className="btn btn-small"
            title="Run another saved pipeline inline"
            onClick={(e) => {
              const items: PickerItem[] = pipelines
                .filter((p) => p.id !== editingId && !pipelineReferenceCreatesCycle(pipelines, editingId, [p.id]))
                .map((p) => ({ id: p.id, label: <>{p.name || '(untitled pipeline)'}</>, filterText: (p.name || '').toLowerCase() }));
              setPicker({ anchor: e.currentTarget.getBoundingClientRect(), items, emptyLabel: 'No other pipelines available yet', onPick: addSubPipeline });
            }}
          >
            <Waypoints size={12} />
            <span>Sub-pipeline</span>
          </button>
          <button
            type="button"
            className="btn btn-small"
            title="Run every snippet in a saved Group inline"
            onClick={(e) => {
              const items: PickerItem[] = (state.groups as Group[]).map((g) => ({ id: g.id, label: <>{g.name || '(untitled group)'}</>, filterText: (g.name || '').toLowerCase() }));
              setPicker({ anchor: e.currentTarget.getBoundingClientRect(), items, emptyLabel: 'No groups yet', onPick: addGroupNode });
            }}
          >
            <Layers size={12} />
            <span>Group</span>
          </button>
        </div>
        <span className="pipeline-toolbar-divider" />
        <div className="pipeline-toolbar-group" title="Layout & configuration">
          <button type="button" className="btn btn-small" title="Lay every step out automatically" onClick={autoArrange}>
            <Wand2 size={12} />
            <span>Auto-arrange</span>
          </button>
          <button type="button" className={'btn btn-small' + (scheduleEnabled ? ' active' : '')} title="Schedule & concurrency" onClick={() => setSettingsOpen((v) => !v)}>
            <SlidersHorizontal size={12} />
            <span>Settings</span>
          </button>
        </div>
        <span className="hint-spacer" />
        <InfoHint text="Drag a step to move it · drag its right dot onto another to connect · click a step or connection to edit it · Delete removes what's selected" />
      </div>
      {settingsOpen && (
        <div className="schedule-settings-panel">
          <label className="checkbox-row" htmlFor="pipelineScheduleToggle">
            <input type="checkbox" id="pipelineScheduleToggle" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
            <span>Run this whole pipeline on a schedule</span>
          </label>
          {scheduleEnabled && (
            <div>
              <div className="segmented">
                {(['interval', 'daily', 'cron'] as ScheduleType[]).filter((t) => (VALID_SCHEDULE_TYPES as readonly string[]).includes(t)).map((t) => (
                  <button type="button" key={t} className={'segmented-btn' + (scheduleType === t ? ' active' : '')} onClick={() => setScheduleType(t)}>
                    {t === 'interval' ? 'Every N minutes' : t === 'daily' ? 'Daily at' : 'Cron'}
                  </button>
                ))}
              </div>
              {scheduleType === 'interval' && (
                <div className="schedule-field-row">
                  <input type="number" className="field-input" min={1} value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} />
                  <span className="field-hint">minutes</span>
                </div>
              )}
              {scheduleType === 'daily' && (
                <div className="schedule-field-row">
                  <input type="time" className="field-input" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
                </div>
              )}
              {scheduleType === 'cron' && (
                <div className="schedule-field-row">
                  <input type="text" className="field-input" placeholder="*/15 * * * *" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <label className="field-label">Max steps running at once</label>
          <div className="schedule-field-row">
            <input type="number" className="field-input" min={0} value={maxConcurrency} onChange={(e) => setMaxConcurrency(e.target.value)} />
            <span className="field-hint">0 = unlimited</span>
          </div>
        </div>
      )}
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
          pipelines={pipelines}
          editingId={editingId}
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
      {gateModal}
    </>
  );
}

export function PipelinesModal() {
  const { open, view, editingId } = usePipelinesStore();
  // Subscribed once for the life of the app (this component is always
  // mounted by App.tsx, `open` just toggles what it renders) — reopens this
  // screen once the results modal a run handed off to (closePipelinesForRun)
  // is dismissed. A no-op for every other batch/group/tag-run's own results
  // modal closing, via pendingReopen's own guard.
  useEffect(() => onBatchModalClosed(consumePendingReopen), []);
  const skipAnim = useScreenOpenAnimation(open);
  if (!open) return null;

  return <div className={'screen' + (skipAnim ? ' screen-no-anim' : '')}>{view === 'list' ? <ListView /> : <EditorView editingId={editingId} />}</div>;
}
