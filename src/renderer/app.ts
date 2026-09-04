// app.ts — renderer entry point (loaded as a native ES module from
// index.html). Wires the header's search/sort/group controls, does the
// initial data load, and imports every other not-yet-React-mounted module
// so their self-registering event listeners attach.
import { dom } from './modules/dom';
import { state } from './modules/state';
import { applyAppearance } from './src/lib/appearance';
import { loadSnippets } from './src/lib/snippetsStore';
import { refresh } from './src/components/Card/SnippetList';
import { openHistory } from './src/store/useHistoryStore';
import { openModal } from './src/store/useEditorStore';
import { openGroups } from './src/store/useGroupsStore';
import { openSettings } from './src/store/useSettingsStore';
import { openPipelines } from './src/store/usePipelinesStore';
import { showToast } from './src/store/useToastStore';
import { emitGroupsChanged } from './src/lib/events';
import { bootstrapRunningProcesses } from './src/lib/processEngine';

// Safety net: an uncaught error or a rejected promise nobody .catch()'d
// would otherwise fail completely silently in here — no crash dialog, no
// visible symptom beyond "that button just didn't do anything," which is
// exactly the kind of bug that's painful to track down after the fact.
// Surface it as a toast (there's no third-party script in this app that
// could trip these benignly, so a hit here is always worth seeing) and log
// the real error/stack for whoever goes digging.
window.addEventListener('error', (e) => {
  console.error('Unhandled renderer error:', e.error || e.message);
  showToast('Something went wrong — see the console for details.', 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  showToast('Something went wrong — see the console for details.', 'error');
});

// Side-effect imports: each of these attaches its own event listeners at
// module-load time (buttons, self-registered event-bus handlers).
import './src/lib/menus';
import './modules/batch';
import './src/lib/keyboard';

dom.searchInput.addEventListener('input', refresh);
dom.historyBtn.addEventListener('click', openHistory);
dom.addBtn.addEventListener('click', () => openModal(null));
dom.groupsBtn.addEventListener('click', openGroups);
dom.settingsBtn.addEventListener('click', openSettings);
dom.pipelinesBtn.addEventListener('click', openPipelines);

dom.sortModeSelect.addEventListener('change', () => {
  state.sortMode = dom.sortModeSelect.value;
  localStorage.setItem('snippetRunner.sortMode', state.sortMode);
  refresh();
});

dom.groupViewBtn.addEventListener('click', () => {
  state.groupView = !state.groupView;
  localStorage.setItem('snippetRunner.groupView', state.groupView ? '1' : '0');
  dom.groupViewBtn.classList.toggle('active', state.groupView);
  refresh();
});

window.electronAPI.onWindowShown(() => {
  dom.searchInput.value = '';
  dom.searchInput.focus();
  refresh();
});

// A scheduled run's notification was clicked — surface what happened.
window.electronAPI.onOpenHistoryRequest(() => openHistory());

// --- Initial bootstrap ---
dom.sortModeSelect.value = state.sortMode;
dom.groupViewBtn.classList.toggle('active', state.groupView);
applyAppearance();

loadSnippets().then(() => {
  dom.searchInput.focus();
});
window.electronAPI.getVariables().then((vars) => { state.variables = vars; });
window.electronAPI.getGroups().then((groups) => {
  state.groups = groups;
  emitGroupsChanged(); // redraws cards so "in group" badges show up on first load, not just after opening Groups
});
bootstrapRunningProcesses().then(() => refresh()); // picks up anything still running from before a renderer reload/crash — see its own doc comment
