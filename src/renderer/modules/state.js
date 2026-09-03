// state.js — the one shared mutable object every other module reads/writes.
// Exported as a single object (not individual `let` bindings) so that
// mutating a property from any module is instantly visible to every other
// module holding the same reference — no getters/setters needed.

export const state = {
  /** @type {Array<object>} */
  snippets: [],
  /** @type {Array<object>} */
  filtered: [],
  selectedIndex: -1,
  activeTag: null,
  editingId: null, // null = "add" mode in the editor, otherwise the id being edited
  dragSrcId: null, // manual-reorder drag-and-drop source id

  sortMode: localStorage.getItem('snippetRunner.sortMode') || 'manual',
  groupView: localStorage.getItem('snippetRunner.groupView') === '1',

  // Select mode / batch run
  selectMode: false,
  selectedIds: new Set(),
  batchOrder: [],
  batchModeValue: 'sequential',
  batchStopOnError: false,
  batchDragSrcId: null,

  // Snippet-editor transient UI state (schedule type tab)
  scheduleTypeValue: 'interval',

  /** @type {Array<{id:string,name:string,value:string,secret:boolean}>} */
  variables: [],

  /** @type {Array<{id:string,name:string,snippetIds:string[]}>} */
  groups: [],
  editingGroupId: null, // null = "new group" mode in the group editor, otherwise the id being edited

  /** @type {Array<{id:string,name:string,description:string,nodes:Array,edges:Array}>} */
  pipelines: [],
  editingPipelineId: null, // null = "new pipeline" mode, otherwise the id being edited
  // Working copy of the graph being edited — only written back to
  // state.pipelines on Save, so Cancel is a true discard. See
  // pipeline-editor.js.
  pipelineNodes: [], // [{id, snippetId, x, y}]
  pipelineEdges: [], // [{id, from, to, condition}]
  pipelineDragNodeId: null, // node being repositioned by mouse drag, if any
  pipelineConnectFromId: null, // node whose output port a new connection is being dragged from, if any
  pipelineSelection: null, // {type: 'node'|'edge', id} — drives the inspector side panel

  // Last-known update-check status ({status: 'idle'|'checking'|'available'|...}
  // plus whatever extra fields that status carries) — kept here (not just
  // local to settings-modal.js) so reopening Settings mid-download restores
  // the right UI instead of resetting to "Check for updates" every time.
  updateStatus: { status: 'idle' },

  // Live state for background-process snippets, keyed by snippetId:
  // {status, outputBuffer (a string, capped — see process-engine.js), pid}.
  // Lives here (not in any card's DOM) specifically because cards.js's
  // refresh() fully rebuilds card DOM on any snippets/groups change or
  // search/sort/filter edit — a background process can easily outlive many
  // of those. buildCard() reads this to decide Start-vs-Stop and to
  // pre-populate the output panel; process-engine.js's onProcessOutput/
  // onProcessStatus listeners update it and opportunistically patch the
  // *current* DOM if that card happens to be rendered right now.
  runningProcesses: {},

  // Appearance / behavior settings (all local to this device)
  theme: localStorage.getItem('snippetRunner.theme') || 'system',
  accentColor: localStorage.getItem('snippetRunner.accent') || null,
  density: localStorage.getItem('snippetRunner.density') || 'comfortable',
  blur: Number(localStorage.getItem('snippetRunner.blur') ?? 28),
  uiScale: Number(localStorage.getItem('snippetRunner.scale') ?? 100),
  soundEnabled: localStorage.getItem('snippetRunner.sound') === '1',
  notificationsEnabled: localStorage.getItem('snippetRunner.notifications') === '1',
  devModeEnabled: localStorage.getItem('snippetRunner.devMode') === '1',
};

export const ACCENT_PRESETS = ['#6e8bff', '#8a63f2', '#ff6bcb', '#ff6b6b', '#f5a623', '#e0c341', '#4bd08b', '#3fc7c7'];
export const ICON_PRESETS = ['⚡', '🚀', '🔧', '🌐', '🖥️', '💾', '🔩', '📦', '🛡️', '🐙', '📁', '🔥', '⭐', '🧪', '📊', '🧹'];
