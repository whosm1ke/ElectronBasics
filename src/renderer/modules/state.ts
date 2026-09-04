// state.ts — the one shared mutable object every other module reads/writes.
// Exported as a single object (not individual `let` bindings) so that
// mutating a property from any module is instantly visible to every other
// module holding the same reference — no getters/setters needed.
import type { Snippet, Variable, Group, ProcessStatusValue } from '@shared/types';

export interface RunningProcessEntry {
  status: ProcessStatusValue;
  outputBuffer: string;
  pid: number | null;
  _restarting?: boolean;
}

export const state = {
  snippets: [] as Snippet[],
  filtered: [] as Snippet[],
  selectedIndex: -1,
  activeTag: null as string | null,
  editingId: null as string | null, // null = "add" mode in the editor, otherwise the id being edited
  dragSrcId: null as string | null, // manual-reorder drag-and-drop source id

  sortMode: localStorage.getItem('snippetRunner.sortMode') || 'manual',
  groupView: localStorage.getItem('snippetRunner.groupView') === '1',

  // Select mode / batch run
  selectMode: false,
  selectedIds: new Set<string>(),
  batchOrder: [] as Snippet[],
  batchModeValue: 'sequential',
  batchStopOnError: false,
  batchDragSrcId: null as string | null,

  // Snippet-editor transient UI state (schedule type tab)
  scheduleTypeValue: 'interval',

  variables: [] as Variable[],

  groups: [] as Group[],
  editingGroupId: null as string | null, // null = "new group" mode in the group editor, otherwise the id being edited

  // Pipelines (saved list + the working copy being edited) moved to
  // src/renderer/src/store/usePipelinesStore.ts and PipelinesModal.tsx's
  // own local component state (Phase 10) — nothing else in the app ever
  // read state.pipelines*, so it's fully local there now, not split
  // against this object the way groups/variables still are.

  // update-status moved to src/renderer/src/store/useSettingsStore.ts
  // (Phase 8) — same "kept fresh even while Settings is closed" reasoning
  // as before, just in a real store now.

  // Live state for background-process snippets, keyed by snippetId:
  // {status, outputBuffer (a string, capped — see processEngine.ts), pid}.
  // Lives here (not in any card's DOM) specifically because SnippetList.tsx's
  // full-list re-render can happen (search, sort, an edit elsewhere, groups
  // changing…) faster than a long-lived background process's output.
  // Card.tsx reads this to decide Start-vs-Stop and to pre-populate the
  // output panel; processEngine.ts's onProcessOutput/onProcessStatus
  // listeners update it and opportunistically patch the *current* DOM if
  // that card happens to be rendered right now.
  runningProcesses: {} as Record<string, RunningProcessEntry>,

  // Appearance/behavior settings (theme, accent, density, blur, uiScale,
  // sound, notifications, devMode) moved to src/renderer/src/store/useUiStore.ts
  // (Phase 8) — a real Zustand store, not a plain object, since Settings
  // (their one and only writer) is itself React now. That store's
  // localStorage keys are the exact same ones this object used to read
  // (snippetRunner.theme, snippetRunner.accent, …), so an existing
  // install's saved preferences carry over untouched.
};

export const ICON_PRESETS = ['⚡', '🚀', '🔧', '🌐', '🖥️', '💾', '🔩', '📦', '🛡️', '🐙', '📁', '🔥', '⭐', '🧪', '📊', '🧹'];
