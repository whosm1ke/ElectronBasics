// keyboard.ts — the one global keydown listener: Escape routing between
// every modal/drawer/menu, arrow-key selection, and the run/copy/duplicate/
// pin/quick-run shortcuts. Ported from modules/keyboard.js — still queries
// each ported surface's isXOpen()/closeX() (now resolving through their
// store shims) exactly as the original did; consolidating these into one
// real modal-stack is a nice-to-have left for a later pass, not required
// for correctness (every surface already closes correctly on Escape,
// confirmed during this migration's testing).
import type { Snippet } from '@shared/types';
import { dom } from '../../modules/dom';
import { state } from '../../modules/state';
import { runnableTextOf } from './utils';
import { updateSelectionStyles } from '../components/Card/SnippetList';
import { closeModal, openModal, isEditorOpen } from '../store/useEditorStore';
import { closeDetails, isDetailsOpen } from '../store/useDetailsStore';
import { openHistory, closeHistory, isHistoryOpen } from '../store/useHistoryStore';
import { closeSettings, isSettingsOpen } from '../store/useSettingsStore';
import { closeVariables, isVariablesOpen } from '../store/useVariablesStore';
import { closeGroups, isGroupsOpen } from '../store/useGroupsStore';
import { closePipelines, isPipelinesOpen } from '../store/usePipelinesStore';
import { isBatchModalOpen, closeBatchModal } from '../store/useBatchStore';
import { removeContextMenu, isContextMenuOpen, removeCopyDropdown, isCopyDropdownOpen } from './menus';
import { duplicateSnippet, togglePin } from './snippetsStore';

function moveSelection(delta: number): void {
  const filtered = state.filtered as Snippet[];
  if (filtered.length === 0) return;
  state.selectedIndex = (state.selectedIndex + delta + filtered.length) % filtered.length;
  updateSelectionStyles();
  const card = dom.snippetList?.querySelector(`.card[data-index="${state.selectedIndex}"]`);
  card?.scrollIntoView({ block: 'nearest' });
}

function runCardAt(index: number): void {
  const card = dom.snippetList?.querySelector(`.card[data-index="${index}"]`);
  (card?.querySelector('.btn-primary') as HTMLElement | null)?.click();
}

document.addEventListener('keydown', (e) => {
  const anySurfaceOpen =
    isEditorOpen() || isDetailsOpen() || isHistoryOpen() || isSettingsOpen() || isVariablesOpen() || isGroupsOpen() || isPipelinesOpen() || isBatchModalOpen();

  if (e.key === 'Escape') {
    if (isEditorOpen()) closeModal();
    else if (isDetailsOpen()) closeDetails();
    else if (isBatchModalOpen()) closeBatchModal();
    else if (isVariablesOpen()) closeVariables();
    else if (isGroupsOpen()) closeGroups();
    else if (isPipelinesOpen()) closePipelines();
    else if (isHistoryOpen()) closeHistory();
    else if (isSettingsOpen()) closeSettings();
    else if (isContextMenuOpen()) removeContextMenu();
    else if (isCopyDropdownOpen()) removeCopyDropdown();
    else window.electronAPI.hideWindow();
    return;
  }

  if (anySurfaceOpen) return; // let that surface own the keyboard

  const filtered = state.filtered as Snippet[];
  const searchInput = dom.searchInput as HTMLInputElement;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === 'Enter') {
    if (state.selectedIndex >= 0 && filtered[state.selectedIndex]) runCardAt(state.selectedIndex);
  } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && document.activeElement !== searchInput) {
    if (state.selectedIndex >= 0 && filtered[state.selectedIndex]) {
      e.preventDefault();
      window.electronAPI.copyText(runnableTextOf(filtered[state.selectedIndex]));
    }
  } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && document.activeElement !== searchInput) {
    if (state.selectedIndex >= 0 && filtered[state.selectedIndex]) {
      e.preventDefault();
      duplicateSnippet(filtered[state.selectedIndex].id);
    }
  } else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    openModal(null);
  } else if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    openHistory();
  } else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
    if (state.selectedIndex >= 0 && filtered[state.selectedIndex]) {
      e.preventDefault();
      togglePin(filtered[state.selectedIndex].id);
    }
  } else if (/^[1-9]$/.test(e.key) && document.activeElement !== searchInput) {
    const idx = Number(e.key) - 1;
    if (filtered[idx]) {
      e.preventDefault();
      runCardAt(idx);
    }
  }
});
