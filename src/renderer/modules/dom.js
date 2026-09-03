// dom.js — every element reference the renderer needs, gathered once. No
// other module calls document.getElementById directly; they import `dom`.
const byId = (id) => document.getElementById(id);

export const dom = {
  // Search bar / header
  searchInput: byId('searchInput'),
  selectModeBtn: byId('selectModeBtn'),
  groupViewBtn: byId('groupViewBtn'),
  groupsBtn: byId('groupsBtn'),
  historyBtn: byId('historyBtn'),
  settingsBtn: byId('settingsBtn'),
  addBtn: byId('addBtn'),

  // Favorites / batch bars
  favoritesBar: byId('favoritesBar'),
  appShell: byId('appShell'),
  batchBar: byId('batchBar'),
  batchCount: byId('batchCount'),
  batchClearBtn: byId('batchClearBtn'),
  batchRunBtn: byId('batchRunBtn'),

  // Tag filters + sort
  tagFilters: byId('tagFilters'),
  sortModeSelect: byId('sortModeSelect'),

  // Snippet list
  snippetList: byId('snippetList'),
  emptyState: byId('emptyState'),
  snippetCount: byId('snippetCount'),

  // Batch run modal
  batchModalOverlay: byId('batchModalOverlay'),
  batchConfigView: byId('batchConfigView'),
  batchModeSegmented: byId('batchModeSegmented'),
  batchStopOnErrorToggle: byId('batchStopOnErrorToggle'),
  batchOrderList: byId('batchOrderList'),
  cancelBatchBtn: byId('cancelBatchBtn'),
  startBatchBtn: byId('startBatchBtn'),
  batchResultsView: byId('batchResultsView'),
  batchResultsList: byId('batchResultsList'),
  closeBatchResultsBtn: byId('closeBatchResultsBtn'),

  // Add / Edit snippet modal
  modalOverlay: byId('modalOverlay'),
  modalTitle: byId('modalTitle'),
  newIcon: byId('newIcon'),
  iconPicker: byId('iconPicker'),
  newName: byId('newName'),
  newTag: byId('newTag'),
  tagDatalist: byId('tagDatalist'),
  newCommand: byId('newCommand'),
  newCwd: byId('newCwd'),
  newShell: byId('newShell'),
  newElevated: byId('newElevated'),
  elevatedRow: byId('elevatedRow'),
  newNotes: byId('newNotes'),
  multiStepToggle: byId('multiStepToggle'),
  singleCommandGroup: byId('singleCommandGroup'),
  stepsGroup: byId('stepsGroup'),
  stepsList: byId('stepsList'),
  addStepBtn: byId('addStepBtn'),
  stopOnStepErrorToggle: byId('stopOnStepErrorToggle'),
  stdinToggle: byId('stdinToggle'),
  stdinGroup: byId('stdinGroup'),
  newStdin: byId('newStdin'),
  envList: byId('envList'),
  addEnvBtn: byId('addEnvBtn'),
  expectExitCode: byId('expectExitCode'),
  expectOutput: byId('expectOutput'),
  runAfterInput: byId('runAfterInput'),
  runAfterDatalist: byId('runAfterDatalist'),
  runBeforeInput: byId('runBeforeInput'),
  runBeforeDatalist: byId('runBeforeDatalist'),
  scheduleToggle: byId('scheduleToggle'),
  scheduleGroup: byId('scheduleGroup'),
  scheduleTypeSegmented: byId('scheduleTypeSegmented'),
  scheduleIntervalRow: byId('scheduleIntervalRow'),
  scheduleIntervalMinutes: byId('scheduleIntervalMinutes'),
  scheduleDailyRow: byId('scheduleDailyRow'),
  scheduleDailyTime: byId('scheduleDailyTime'),
  scheduleCronRow: byId('scheduleCronRow'),
  scheduleCronExpr: byId('scheduleCronExpr'),
  saveAddBtn: byId('saveAddBtn'),
  cancelAddBtn: byId('cancelAddBtn'),

  // Run history drawer
  historyOverlay: byId('historyOverlay'),
  historyList: byId('historyList'),
  historySearchInput: byId('historySearchInput'),
  closeHistoryBtn: byId('closeHistoryBtn'),
  clearHistoryBtn: byId('clearHistoryBtn'),

  // Snippet details modal
  detailsOverlay: byId('detailsOverlay'),
  detailsTitle: byId('detailsTitle'),
  detailsBody: byId('detailsBody'),
  closeDetailsBtn: byId('closeDetailsBtn'),

  // Global variables modal
  variablesOverlay: byId('variablesOverlay'),
  variablesList: byId('variablesList'),
  addVariableBtn: byId('addVariableBtn'),
  closeVariablesBtn: byId('closeVariablesBtn'),

  // Snippet groups modal (saved sets of snippets, run together on demand)
  groupsOverlay: byId('groupsOverlay'),
  groupsListView: byId('groupsListView'),
  groupsList: byId('groupsList'),
  addGroupBtn: byId('addGroupBtn'),
  closeGroupsBtn: byId('closeGroupsBtn'),
  groupEditorView: byId('groupEditorView'),
  groupEditorTitle: byId('groupEditorTitle'),
  groupNameInput: byId('groupNameInput'),
  groupDescriptionInput: byId('groupDescriptionInput'),
  groupSnippetChecklist: byId('groupSnippetChecklist'),
  deleteGroupBtn: byId('deleteGroupBtn'),
  cancelGroupEditBtn: byId('cancelGroupEditBtn'),
  saveGroupBtn: byId('saveGroupBtn'),

  // Settings modal
  settingsOverlay: byId('settingsOverlay'),
  closeSettingsBtn: byId('closeSettingsBtn'),
  launchOnStartupToggle: byId('launchOnStartupToggle'),
  manageVariablesBtn: byId('manageVariablesBtn'),
  exportBtn: byId('exportBtn'),
  importBtn: byId('importBtn'),
  backupsList: byId('backupsList'),
  themeSegmented: byId('themeSegmented'),
  densitySegmented: byId('densitySegmented'),
  accentSwatches: byId('accentSwatches'),
  accentColorInput: byId('accentColorInput'),
  resetAccentBtn: byId('resetAccentBtn'),
  blurSlider: byId('blurSlider'),
  blurValueLabel: byId('blurValueLabel'),
  scaleSlider: byId('scaleSlider'),
  scaleValueLabel: byId('scaleValueLabel'),
  hotkeyInput: byId('hotkeyInput'),
  saveHotkeyBtn: byId('saveHotkeyBtn'),
  hotkeyStatus: byId('hotkeyStatus'),
  soundToggle: byId('soundToggle'),
  notificationsToggle: byId('notificationsToggle'),
  devModeToggle: byId('devModeToggle'),

  // Updates
  appVersionLabel: byId('appVersionLabel'),
  checkUpdateBtn: byId('checkUpdateBtn'),
  updateStatusText: byId('updateStatusText'),
  updateProgressRow: byId('updateProgressRow'),
  updateProgressFill: byId('updateProgressFill'),
  downloadUpdateBtn: byId('downloadUpdateBtn'),
  restartUpdateBtn: byId('restartUpdateBtn'),

  // Toast
  toast: byId('toast'),
};
