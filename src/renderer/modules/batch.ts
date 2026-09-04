// batch.ts — select mode (multi-select across categories/filters) and the
// batch bar. The modal itself (order/mode config + live results) is
// src/renderer/src/components/Modals/BatchModal.tsx / store/useBatchStore.ts.
// This file wires the header's select-mode button and the batch bar the
// same direct-DOM-event way app.ts wires History/Add/Groups/Settings/
// Pipelines — not componentized, since it's the same category of static
// header control as those.
import { dom } from './dom';
import { state } from './state';
import { refresh } from '../src/components/Card/SnippetList';
import { openBatchConfig } from '../src/store/useBatchStore';

function updateBatchBar(): void {
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
