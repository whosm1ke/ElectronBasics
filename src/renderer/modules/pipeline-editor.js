// pipeline-editor.js — the Pipelines screen: a saved-list view (mirrors
// groups-modal.js) plus a node-graph canvas editor with a selection-driven
// inspector side panel. A node is a positioned pointer to an existing
// snippet; an edge carries a condition ('success' | 'failure' | 'always' |
// 'exitCode' | 'outputContains', the last two also carrying a `value`) that
// decides whether a run continues down that branch — see
// pipeline-engine.js for how that graph actually executes.
//
// Editing works on a *working copy* (state.pipelineNodes/pipelineEdges),
// only written back into state.pipelines on Save — Cancel is a true
// discard. Structural changes (add/remove node or edge, auto-arrange)
// rebuild the graph DOM via renderGraph(); a node drag only updates that
// one node's inline position plus re-running renderEdges() (cheap — a
// handful of <line>s) rather than the whole graph.
//
// Clicking a step or connection (as opposed to dragging one) selects it
// into state.pipelineSelection, which the inspector panel on the right
// renders from — that's the one, discoverable place to change a
// condition's type/value, swap which snippet a step points to, or delete
// something, rather than relying only on a tiny canvas label or a
// right-click a first-time user has no reason to try. Right-click still
// works too, as a fast path once you know it's there.
//
// Edge coordinates are read back from the *actual rendered* port elements
// via getBoundingClientRect() rather than computed from node.x/y and an
// assumed node height, so a line always lands exactly on the visible dot
// regardless of how tall a node's content makes it.
import { dom } from './dom.js';
import { state } from './state.js';
import { iconSvg } from './icons.js';
import { snippetIcon, newId, pipelineEdgeCreatesCycle, SHELL_LABELS } from './utils.js';
import { showToast } from './toast.js';
import { persistSnippets } from './snippets-store.js';
import { onBatchModalClosed } from './events.js';
import { runPipelineGraph } from './pipeline-engine.js';

const CONDITION_OPTIONS = [
  ['success', 'Succeeds (exit code 0)'],
  ['failure', 'Fails (non-zero exit code)'],
  ['always', 'Either way'],
  ['exitCode', 'Exits with a specific code'],
  ['outputContains', 'Output contains text'],
];

function conditionLabel(edge) {
  switch (edge.condition) {
    case 'success': return 'on success';
    case 'failure': return 'on failure';
    case 'always': return 'always';
    case 'exitCode': return `exit = ${edge.value ?? '?'}`;
    case 'outputContains': return `has "${edge.value ?? ''}"`;
    default: return edge.condition;
  }
}

function showPipelinesListView() {
  dom.pipelineEditorView.hidden = true;
  dom.pipelinesListView.hidden = false;
  state.editingPipelineId = null;
  renderPipelinesList();
}

export async function openPipelines() {
  dom.pipelinesOverlay.hidden = false;
  state.pipelines = await window.electronAPI.getPipelines();
  showPipelinesListView();
}

export function closePipelines() {
  dom.pipelinesOverlay.hidden = true;
}

export function isPipelinesOpen() {
  return !dom.pipelinesOverlay.hidden;
}

// --- Running — hides this modal instead of leaving it stacked underneath
// the (same z-index, later-in-DOM) batch results modal, which used to mean
// you had to close the Pipelines modal to even see the results appear.
// Reopens (to whichever view it was showing) once results close. ----------

let pendingPipelineReturn = null; // 'list' | 'editor' | null

onBatchModalClosed(() => {
  if (!pendingPipelineReturn) return;
  const mode = pendingPipelineReturn;
  pendingPipelineReturn = null;
  dom.pipelinesOverlay.hidden = false;
  if (mode === 'list') showPipelinesListView();
  // 'editor': the editor DOM was only hidden, never torn down or rebuilt —
  // node positions/edges are exactly as left, nothing to re-render.
});

async function runSavedPipeline(pipeline) {
  pendingPipelineReturn = 'list';
  dom.pipelinesOverlay.hidden = true;
  await runPipelineGraph(pipeline.nodes, pipeline.edges);
  await persistSnippets({ silent: true }); // runCount/lastRunAt bumps — cards.js picks them up next real refresh
}

function buildPipelineRow(pipeline) {
  const row = document.createElement('div');
  row.className = 'group-row';

  const info = document.createElement('div');
  info.className = 'group-row-info';
  const name = document.createElement('div');
  name.className = 'group-row-name';
  name.textContent = pipeline.name || '(untitled pipeline)';
  const count = document.createElement('div');
  count.className = 'group-row-count';
  count.textContent = `${pipeline.nodes.length} step${pipeline.nodes.length === 1 ? '' : 's'} · ${pipeline.edges.length} connection${pipeline.edges.length === 1 ? '' : 's'}`;
  info.append(name, count);
  if (pipeline.description) {
    const desc = document.createElement('div');
    desc.className = 'group-row-description';
    desc.textContent = pipeline.description;
    info.appendChild(desc);
  }

  const runBtn = document.createElement('button');
  runBtn.className = 'btn btn-small btn-primary';
  runBtn.innerHTML = `${iconSvg('play')}<span>Run</span>`;
  runBtn.addEventListener('click', () => runSavedPipeline(pipeline));

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-small';
  editBtn.innerHTML = `${iconSvg('edit')}<span>Edit</span>`;
  editBtn.addEventListener('click', () => openPipelineEditor(pipeline));

  row.append(info, runBtn, editBtn);
  return row;
}

function renderPipelinesList() {
  dom.pipelinesList.innerHTML = '';
  if (state.pipelines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'variables-empty';
    empty.textContent = 'No pipelines yet. Build a small graph of steps that branch on success/failure/output, then run it with one click.';
    dom.pipelinesList.appendChild(empty);
    return;
  }
  state.pipelines.forEach((p) => dom.pipelinesList.appendChild(buildPipelineRow(p)));
}

// --- Canvas editor ---------------------------------------------------------

/** Reads a port's actual on-screen center, in pipelineCanvas-local coordinates (stable across scroll — see this file's header comment). Null if the node isn't currently rendered. */
function portPos(nodeId, side) {
  const portEl = dom.pipelineNodesLayer.querySelector(`.pipeline-node[data-node-id="${nodeId}"] .pipeline-port-${side}`);
  if (!portEl) return null;
  const canvasRect = dom.pipelineCanvas.getBoundingClientRect();
  const portRect = portEl.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width / 2 - canvasRect.left,
    y: portRect.top + portRect.height / 2 - canvasRect.top,
  };
}

function selectNode(nodeId) {
  state.pipelineSelection = { type: 'node', id: nodeId };
  updateSelectionHighlight();
  renderInspector();
}
function selectEdge(edgeId) {
  state.pipelineSelection = { type: 'edge', id: edgeId };
  updateSelectionHighlight();
  renderInspector();
}
function clearSelection() {
  state.pipelineSelection = null;
  updateSelectionHighlight();
  renderInspector();
}
function updateSelectionHighlight() {
  const sel = state.pipelineSelection;
  dom.pipelineNodesLayer.querySelectorAll('.pipeline-node').forEach((el) => {
    el.classList.toggle('selected', sel?.type === 'node' && sel.id === el.dataset.nodeId);
  });
  dom.pipelineEdgeLabels.querySelectorAll('.pipeline-edge-label').forEach((el) => {
    el.classList.toggle('selected', sel?.type === 'edge' && sel.id === el.dataset.edgeId);
  });
  dom.pipelineEdgesSvg.querySelectorAll('line[data-edge-id]').forEach((el) => {
    el.classList.toggle('pipeline-edge-selected', sel?.type === 'edge' && sel.id === el.dataset.edgeId);
  });
}

function addEdge(fromId, toId) {
  if (fromId === toId) return;
  if (state.pipelineEdges.some((e) => e.from === fromId && e.to === toId)) {
    showToast('These two steps are already connected', 'error');
    return;
  }
  if (pipelineEdgeCreatesCycle(state.pipelineEdges, fromId, toId)) {
    showToast("Can't connect — that would create a loop", 'error');
    return;
  }
  const edge = { id: newId('edge'), from: fromId, to: toId, condition: 'success', value: null };
  state.pipelineEdges.push(edge);
  renderEdges();
  selectEdge(edge.id);
}

function removeEdge(edgeId) {
  state.pipelineEdges = state.pipelineEdges.filter((e) => e.id !== edgeId);
  if (state.pipelineSelection?.type === 'edge' && state.pipelineSelection.id === edgeId) clearSelection();
  renderEdges();
}

function removeNode(nodeId) {
  state.pipelineNodes = state.pipelineNodes.filter((n) => n.id !== nodeId);
  state.pipelineEdges = state.pipelineEdges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  if (state.pipelineSelection?.id === nodeId) state.pipelineSelection = null;
  renderGraph();
  renderInspector();
}

function clearConnectTargetHighlight() {
  dom.pipelineNodesLayer.querySelectorAll('.pipeline-node-connect-target').forEach((n) => n.classList.remove('pipeline-node-connect-target'));
}

/** Mousedown-drag on a node body (not its ports) repositions it; a mousedown+mouseup with no real movement is treated as a click (selects it) instead. */
function wireNodeDrag(el, node) {
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pipeline-port')) return; // that's a connection drag, handled separately
    e.preventDefault();
    const canvasRect = dom.pipelineCanvas.getBoundingClientRect();
    const offsetX = e.clientX - canvasRect.left - node.x;
    const offsetY = e.clientY - canvasRect.top - node.y;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    function onMove(ev) {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
      const rect = dom.pipelineCanvas.getBoundingClientRect();
      node.x = Math.max(0, ev.clientX - rect.left - offsetX);
      node.y = Math.max(0, ev.clientY - rect.top - offsetY);
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      renderEdges();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) selectNode(node.id);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/** Mousedown-drag starting on the output port draws a temporary dashed line to the cursor; releasing over another node creates the edge (see addEdge — rejects a self-loop, a duplicate, or anything that would create a cycle). */
function wireNodePortDrag(el, node) {
  const outPort = el.querySelector('.pipeline-port-out');
  outPort.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const start = portPos(node.id, 'out');
    const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempLine.classList.add('pipeline-edge-dragging');
    dom.pipelineEdgesSvg.appendChild(tempLine);

    function onMove(ev) {
      const rect = dom.pipelineCanvas.getBoundingClientRect();
      tempLine.setAttribute('x1', start.x);
      tempLine.setAttribute('y1', start.y);
      tempLine.setAttribute('x2', ev.clientX - rect.left);
      tempLine.setAttribute('y2', ev.clientY - rect.top);
      clearConnectTargetHighlight();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pipeline-node');
      if (target && target.dataset.nodeId !== node.id) target.classList.add('pipeline-node-connect-target');
    }
    function onUp(ev) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      tempLine.remove();
      clearConnectTargetHighlight();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pipeline-node');
      if (target && target.dataset.nodeId !== node.id) addEdge(node.id, target.dataset.nodeId);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function renderNodes() {
  dom.pipelineNodesLayer.innerHTML = '';
  state.pipelineNodes.forEach((node) => {
    const snippet = state.snippets.find((s) => s.id === node.snippetId);
    const el = document.createElement('div');
    el.className = 'pipeline-node';
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.innerHTML = `
      <div class="pipeline-port pipeline-port-in" title="Drop a connection here"></div>
      <div class="pipeline-node-name"></div>
      <div class="pipeline-node-tag"></div>
      <div class="pipeline-port pipeline-port-out" title="Drag to connect to another step"></div>
    `;
    el.querySelector('.pipeline-node-name').textContent = snippet ? `${snippetIcon(snippet)} ${snippet.name}` : '⚠ (deleted snippet)';
    el.querySelector('.pipeline-node-tag').textContent = snippet ? snippet.tag : '';
    wireNodeDrag(el, node);
    wireNodePortDrag(el, node);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeNode(node.id);
    });
    dom.pipelineNodesLayer.appendChild(el);
  });
  updateSelectionHighlight();
}

function renderEdges() {
  dom.pipelineEdgesSvg.innerHTML = '';
  dom.pipelineEdgeLabels.innerHTML = '';
  state.pipelineEdges.forEach((edge) => {
    const from = portPos(edge.from, 'out');
    const to = portPos(edge.to, 'in');
    if (!from || !to) return; // the node it points at isn't currently rendered

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.dataset.edgeId = edge.id;
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    dom.pipelineEdgesSvg.appendChild(line);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = `pipeline-edge-label condition-${edge.condition}`;
    label.dataset.edgeId = edge.id;
    label.textContent = conditionLabel(edge);
    label.style.left = `${(from.x + to.x) / 2}px`;
    label.style.top = `${(from.y + to.y) / 2}px`;
    label.title = 'Click to edit · right-click to remove';
    label.addEventListener('click', (e) => { e.stopPropagation(); selectEdge(edge.id); });
    label.addEventListener('contextmenu', (e) => { e.preventDefault(); removeEdge(edge.id); });
    dom.pipelineEdgeLabels.appendChild(label);
  });
  updateSelectionHighlight();
}

function renderGraph() {
  dom.pipelineCanvas.classList.toggle('pipeline-canvas-empty-hint', state.pipelineNodes.length === 0);
  renderNodes();
  renderEdges(); // after nodes, so portPos() can read their actual rendered position
}

function nextNodePosition() {
  // Cascade new steps diagonally so they don't stack exactly on top of each
  // other — good enough for "just added a step," the user drags from there
  // (or hits Auto-arrange).
  const n = state.pipelineNodes.length;
  return { x: 30 + (n % 8) * 40, y: 30 + (n % 8) * 40 };
}

function addNode(snippetId) {
  const pos = nextNodePosition();
  const node = { id: newId('node'), snippetId, x: pos.x, y: pos.y };
  state.pipelineNodes.push(node);
  renderGraph();
  selectNode(node.id);
}

/** Lays every node out left-to-right in topological layers (Kahn's algorithm) — a one-click fix for a graph that's turned into a tangle after a lot of free-form dragging. Any node not reachable via edges (shouldn't happen — cycles are rejected at connect time) still gets *a* position, appended past the last real layer, so this never leaves a node stranded off in a corner. */
function autoArrangePipeline() {
  const ids = state.pipelineNodes.map((n) => n.id);
  if (ids.length === 0) return;
  const remaining = new Map(ids.map((id) => [id, 0]));
  state.pipelineEdges.forEach((e) => remaining.set(e.to, (remaining.get(e.to) || 0) + 1));

  const layerOf = new Map();
  const done = new Set();
  let frontier = ids.filter((id) => remaining.get(id) === 0);
  let layer = 0;
  while (frontier.length > 0) {
    frontier.forEach((id) => { layerOf.set(id, layer); done.add(id); });
    const next = new Set();
    state.pipelineEdges.forEach((e) => {
      if (done.has(e.from) && !done.has(e.to)) {
        remaining.set(e.to, remaining.get(e.to) - 1);
        if (remaining.get(e.to) <= 0) next.add(e.to);
      }
    });
    frontier = [...next];
    layer += 1;
  }
  ids.forEach((id) => { if (!layerOf.has(id)) layerOf.set(id, layer); });

  const byLayer = new Map();
  ids.forEach((id) => {
    const l = layerOf.get(id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  });
  const nodeById = new Map(state.pipelineNodes.map((n) => [n.id, n]));
  const COL_W = 220;
  const ROW_H = 100;
  [...byLayer.keys()].sort((a, b) => a - b).forEach((l) => {
    byLayer.get(l).forEach((id, row) => {
      const node = nodeById.get(id);
      node.x = 30 + l * COL_W;
      node.y = 30 + row * ROW_H;
    });
  });
  renderGraph();
}

// --- Inspector side panel ---------------------------------------------------

function renderInspector() {
  dom.pipelineInspector.innerHTML = '';
  const sel = state.pipelineSelection;
  if (!sel) {
    dom.pipelineInspector.hidden = true;
    return;
  }

  if (sel.type === 'node') {
    const node = state.pipelineNodes.find((n) => n.id === sel.id);
    if (!node) { state.pipelineSelection = null; dom.pipelineInspector.hidden = true; return; }
    dom.pipelineInspector.hidden = false;
    const snippet = state.snippets.find((s) => s.id === node.snippetId);

    appendInspectorTitle('Step');
    const nameEl = document.createElement('div');
    nameEl.className = 'pipeline-inspector-name';
    nameEl.textContent = snippet ? `${snippetIcon(snippet)} ${snippet.name}` : '⚠ (deleted snippet)';
    dom.pipelineInspector.appendChild(nameEl);
    if (snippet) {
      const meta = document.createElement('div');
      meta.className = 'pipeline-inspector-meta';
      meta.textContent = `${SHELL_LABELS[snippet.shell] || snippet.shell} · ${snippet.tag}`;
      dom.pipelineInspector.appendChild(meta);
    }

    const changeBtn = document.createElement('button');
    changeBtn.className = 'btn btn-small';
    changeBtn.textContent = 'Change step…';
    changeBtn.addEventListener('click', () => openSnippetPicker(changeBtn, (newSnippetId) => {
      node.snippetId = newSnippetId;
      renderGraph();
      renderInspector();
    }));
    dom.pipelineInspector.appendChild(changeBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = 'Delete step';
    deleteBtn.addEventListener('click', () => removeNode(node.id));
    dom.pipelineInspector.appendChild(deleteBtn);

    const outgoing = state.pipelineEdges.filter((e) => e.from === node.id);
    if (outgoing.length > 0) {
      appendInspectorTitle('Connects to', true);
      outgoing.forEach((edge) => {
        const targetNode = state.pipelineNodes.find((n) => n.id === edge.to);
        const targetSnippet = targetNode && state.snippets.find((s) => s.id === targetNode.snippetId);
        const row = document.createElement('button');
        row.className = 'pipeline-inspector-edge-row';
        row.textContent = `${conditionLabel(edge)} → ${targetSnippet ? targetSnippet.name : '?'}`;
        row.addEventListener('click', () => selectEdge(edge.id));
        dom.pipelineInspector.appendChild(row);
      });
    }
  } else if (sel.type === 'edge') {
    const edge = state.pipelineEdges.find((e) => e.id === sel.id);
    if (!edge) { state.pipelineSelection = null; dom.pipelineInspector.hidden = true; return; }
    dom.pipelineInspector.hidden = false;

    const fromNode = state.pipelineNodes.find((n) => n.id === edge.from);
    const toNode = state.pipelineNodes.find((n) => n.id === edge.to);
    const fromSnippet = fromNode && state.snippets.find((s) => s.id === fromNode.snippetId);
    const toSnippet = toNode && state.snippets.find((s) => s.id === toNode.snippetId);

    appendInspectorTitle('Connection');
    const summary = document.createElement('div');
    summary.className = 'pipeline-inspector-meta';
    summary.textContent = `${fromSnippet ? fromSnippet.name : '?'} → ${toSnippet ? toSnippet.name : '?'}`;
    dom.pipelineInspector.appendChild(summary);

    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Run the next step when this one…';
    dom.pipelineInspector.appendChild(label);

    const selectWrap = document.createElement('div');
    selectWrap.className = 'select-wrap';
    const select = document.createElement('select');
    select.className = 'field-input';
    CONDITION_OPTIONS.forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (value === edge.condition) opt.selected = true;
      select.appendChild(opt);
    });
    selectWrap.appendChild(select);
    dom.pipelineInspector.appendChild(selectWrap);

    const needsValue = ['exitCode', 'outputContains'].includes(edge.condition);
    const valueInput = document.createElement('input');
    valueInput.type = edge.condition === 'exitCode' ? 'number' : 'text';
    valueInput.className = 'field-input';
    valueInput.placeholder = edge.condition === 'exitCode' ? 'e.g. 2' : 'e.g. ERROR';
    valueInput.value = edge.value ?? '';
    valueInput.hidden = !needsValue;
    dom.pipelineInspector.appendChild(valueInput);

    select.addEventListener('change', () => {
      edge.condition = select.value;
      if (edge.condition === 'exitCode' && !Number.isFinite(edge.value)) edge.value = 0;
      else if (edge.condition === 'outputContains' && typeof edge.value !== 'string') edge.value = '';
      renderEdges();
      renderInspector(); // condition changed which fields show — simplest to just rebuild
    });
    valueInput.addEventListener('input', () => {
      edge.value = edge.condition === 'exitCode' ? (valueInput.value === '' ? 0 : Number(valueInput.value)) : valueInput.value;
      renderEdges();
      const current = dom.pipelineInspector.querySelector('select')?.value;
      if (current === edge.condition) {
        const labelBtn = dom.pipelineEdgeLabels.querySelector(`[data-edge-id="${edge.id}"]`);
        if (labelBtn) labelBtn.textContent = conditionLabel(edge);
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = 'Delete connection';
    deleteBtn.addEventListener('click', () => removeEdge(edge.id));
    dom.pipelineInspector.appendChild(deleteBtn);
  }
}

function appendInspectorTitle(text, subtitle = false) {
  const el = document.createElement('div');
  el.className = subtitle ? 'pipeline-inspector-subtitle' : 'pipeline-inspector-title';
  el.textContent = text;
  dom.pipelineInspector.appendChild(el);
}

// --- Snippet picker (shared by "+ Add step" and "Change step…") -----------

function closeSnippetPickerMenu() {
  document.getElementById('pipelineSnippetPickerMenu')?.remove();
  document.removeEventListener('mousedown', onDocMouseDownForSnippetPicker, true);
}
function onDocMouseDownForSnippetPicker(e) {
  if (!e.target.closest('#pipelineSnippetPickerMenu')) closeSnippetPickerMenu();
}
function openSnippetPicker(anchorEl, onPick) {
  const already = document.getElementById('pipelineSnippetPickerMenu');
  closeSnippetPickerMenu();
  if (already) return; // click toggled it closed

  const menu = document.createElement('div');
  menu.className = 'context-menu pipeline-add-step-menu';
  menu.id = 'pipelineSnippetPickerMenu';
  if (state.snippets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'context-menu-item';
    empty.textContent = 'No snippets yet';
    menu.appendChild(empty);
  }
  state.snippets.forEach((s) => {
    const item = document.createElement('button');
    item.className = 'context-menu-item';
    item.innerHTML = `<span>${snippetIcon(s)} ${s.name}</span>`;
    item.addEventListener('click', () => {
      onPick(s.id);
      closeSnippetPickerMenu();
    });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  const mRect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(rect.left, window.innerWidth - mRect.width - 6))}px`;
  menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - mRect.height - 6)}px`;
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDownForSnippetPicker, true), 0);
}

dom.addPipelineStepBtn.addEventListener('click', () => openSnippetPicker(dom.addPipelineStepBtn, (id) => addNode(id)));
dom.autoArrangePipelineBtn.addEventListener('click', autoArrangePipeline);

dom.pipelineCanvas.addEventListener('mousedown', (e) => {
  if (e.target === dom.pipelineCanvas) clearSelection(); // clicked empty canvas space
});

// --- Open/save/cancel/delete ------------------------------------------------

export function openPipelineEditor(pipeline) {
  dom.pipelinesOverlay.hidden = false;
  state.editingPipelineId = pipeline ? pipeline.id : null;
  dom.pipelineNameInput.value = pipeline ? pipeline.name : '';
  dom.pipelineDescriptionInput.value = pipeline ? pipeline.description : '';
  // Deep-copy into the working set so Cancel never mutates the saved pipeline.
  state.pipelineNodes = pipeline ? pipeline.nodes.map((n) => ({ ...n })) : [];
  state.pipelineEdges = pipeline ? pipeline.edges.map((e) => ({ ...e })) : [];
  state.pipelineSelection = null;
  dom.deletePipelineBtn.hidden = !pipeline;
  dom.pipelinesListView.hidden = true;
  dom.pipelineEditorView.hidden = false;
  renderGraph();
  renderInspector();
  dom.pipelineCanvasWrap.scrollTo(0, 0);
  setTimeout(() => dom.pipelineNameInput.focus(), 0);
}

dom.pipelinesBtn.addEventListener('click', openPipelines);
dom.closePipelinesBtn.addEventListener('click', closePipelines);
dom.pipelinesOverlay.addEventListener('click', (e) => {
  if (e.target === dom.pipelinesOverlay) closePipelines();
});
dom.addPipelineBtn.addEventListener('click', () => openPipelineEditor(null));
dom.cancelPipelineEditBtn.addEventListener('click', showPipelinesListView);

dom.runPipelineFromEditorBtn.addEventListener('click', async () => {
  pendingPipelineReturn = 'editor';
  dom.pipelinesOverlay.hidden = true;
  await runPipelineGraph(state.pipelineNodes, state.pipelineEdges);
  await persistSnippets({ silent: true });
});

dom.savePipelineBtn.addEventListener('click', async () => {
  const name = dom.pipelineNameInput.value.trim() || 'Untitled pipeline';
  const description = dom.pipelineDescriptionInput.value.trim();
  if (state.pipelineNodes.length === 0) {
    showToast('Add at least one step before saving', 'error');
    return;
  }
  const id = state.editingPipelineId || newId('pipe');
  const pipeline = { id, name, description, nodes: state.pipelineNodes, edges: state.pipelineEdges };
  const idx = state.pipelines.findIndex((p) => p.id === id);
  if (idx >= 0) state.pipelines[idx] = pipeline;
  else state.pipelines.push(pipeline);
  state.pipelines = await window.electronAPI.savePipelines(state.pipelines);
  showToast(`Saved pipeline "${name}"`);
  showPipelinesListView();
});

dom.deletePipelineBtn.addEventListener('click', async () => {
  const idx = state.pipelines.findIndex((p) => p.id === state.editingPipelineId);
  if (idx < 0) return;
  const [removed] = state.pipelines.splice(idx, 1);
  state.pipelines = await window.electronAPI.savePipelines(state.pipelines);
  showToast(`Deleted pipeline "${removed.name || '(untitled pipeline)'}"`);
  showPipelinesListView();
});
