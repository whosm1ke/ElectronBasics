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

  // Last-known update-check status ({status: 'idle'|'checking'|'available'|...}
  // plus whatever extra fields that status carries) — kept here (not just
  // local to settings-modal.js) so reopening Settings mid-download restores
  // the right UI instead of resetting to "Check for updates" every time.
  updateStatus: { status: 'idle' },

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
