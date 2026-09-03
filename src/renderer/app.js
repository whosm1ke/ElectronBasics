// app.js — renderer entry point (loaded as a native ES module from
// index.html). Wires the header's search/sort/group controls, does the
// initial data load, and imports every other module so their self-
// registering event listeners (see events.js) attach.
import { dom } from './modules/dom.js';
import { state } from './modules/state.js';
import { applyAppearance } from './modules/appearance.js';
import { loadSnippets } from './modules/snippets-store.js';
import { refresh } from './modules/cards.js';
import { openHistory } from './modules/history-drawer.js';
import { showToast } from './modules/toast.js';
import { emitGroupsChanged } from './modules/events.js';

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
// module-load time (buttons, self-registered 'snippets-changed' handlers).
import './modules/tags.js';
import './modules/favorites.js';
import './modules/menus.js';
import './modules/params.js';
import './modules/run-engine.js';
import './modules/editor-modal.js';
import './modules/details-modal.js';
import './modules/variables-modal.js';
import './modules/groups-modal.js';
import './modules/settings-modal.js';
import './modules/batch.js';
import './modules/keyboard.js';

dom.searchInput.addEventListener('input', refresh);

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
