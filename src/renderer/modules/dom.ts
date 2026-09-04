// dom.ts — every element reference the renderer needs, gathered once. No
// other module calls document.getElementById directly; they import `dom`.
// Elements are cast to their real type up front (not `HTMLElement | null`)
// since every consumer already treats them as always-present, static
// markup — same trust level the original plain-JS version had, just typed.
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export const dom = {
  // Search bar / header
  searchInput: byId<HTMLInputElement>('searchInput'),
  selectModeBtn: byId('selectModeBtn'),
  groupViewBtn: byId('groupViewBtn'),
  groupsBtn: byId('groupsBtn'),
  pipelinesBtn: byId('pipelinesBtn'),
  historyBtn: byId('historyBtn'),
  settingsBtn: byId('settingsBtn'),
  addBtn: byId('addBtn'),

  // Favorites bar's *content* is React-mounted (see
  // src/renderer/src/legacyMounts.tsx) — this ref is still needed to toggle
  // the container's own `hidden` attribute, which a root mounted inside it
  // doesn't control. Batch bar.
  favoritesBar: byId('favoritesBar'),
  appShell: byId('appShell'),
  batchBar: byId('batchBar'),
  batchCount: byId('batchCount'),
  batchClearBtn: byId('batchClearBtn'),
  batchRunBtn: byId('batchRunBtn'),

  // Tag filters (React-mounted) container's parent still owns sort
  sortModeSelect: byId<HTMLSelectElement>('sortModeSelect'),

  // Snippet list
  snippetList: byId('snippetList'),
  emptyState: byId('emptyState'),
  snippetCount: byId('snippetCount'),

  // Batch run modal is now fully React-rendered (BatchModal.tsx) — no
  // internal refs needed here any more.

  // Add/Edit snippet modal is now fully React-rendered (EditorModal.tsx) —
  // no internal refs needed here any more.
  // Run history drawer, Details modal, and Variables modal are now fully
  // React-rendered (HistoryDrawer.tsx/DetailsModal.tsx/VariablesModal.tsx) —
  // no internal refs needed here any more.

  // Groups modal is now fully React-rendered (GroupsModal.tsx) — no
  // internal refs needed here any more.

  // Pipelines modal is now fully React-rendered (PipelinesModal.tsx) — no
  // internal refs needed here any more.

  // Settings modal is now fully React-rendered (SettingsModal.tsx) — no
  // internal refs needed here any more.
};
