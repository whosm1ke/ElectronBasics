// batch.js — select mode (multi-select across categories/filters), the
// batch bar, and the shared "Run" button in the batch modal (started via
// batch-runner.js's openBatchConfig, also used by cards.js's "Run all").
import { dom } from './dom.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { persistSnippets } from './snippets-store.js';
import { refresh } from './cards.js';
import { showResultsView, runBatchList, openBatchConfig } from './batch-runner.js';

function updateBatchBar() {
  dom.batchBar.hidden = !state.selectMode || state.selectedIds.size === 0;
  dom.batchCount.textContent = `${state.selectedIds.size} selected`;
}
document.addEventListener('batch-selection-changed', updateBatchBar);

dom.selectModeBtn.addEventListener('click', () => {
  state.selectMode = !state.selectMode;
  dom.selectModeBtn.classList.toggle('active', state.selectMode);
  if (!state.selectMode) state.selectedIds.clear();
  updateBatchBar();
  refresh();
});

dom.batchClearBtn.addEventListener('click', () => {
  state.selectedIds.clear();
  updateBatchBar();
  refresh();
});

dom.batchRunBtn.addEventListener('click', () => {
  const selected = state.snippets.filter((s) => state.selectedIds.has(s.id));
  if (selected.length === 0) return;
  openBatchConfig(selected);
});

dom.startBatchBtn.addEventListener('click', async () => {
  showResultsView();
  const { ran, skipped, notRun } = await runBatchList(state.batchOrder, state.batchModeValue, {
    stopOnError: state.batchStopOnError,
  });

  await persistSnippets();
  state.selectMode = false;
  state.selectedIds.clear();
  dom.selectModeBtn.classList.remove('active');
  updateBatchBar();
  refresh();

  const extras = [skipped && `${skipped} skipped`, notRun && `${notRun} not run`].filter(Boolean).join(', ');
  showToast(`Batch done: ${ran} ran${extras ? ` · ${extras}` : ''}`);
});
