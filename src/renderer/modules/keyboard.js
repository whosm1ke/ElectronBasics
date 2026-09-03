// keyboard.js — the one global keydown listener: Escape routing between
// every modal/drawer/menu, arrow-key selection, and the run/copy/duplicate/
// pin/quick-run shortcuts.
import { dom } from './dom.js';
import { state } from './state.js';
import { runnableTextOf } from './utils.js';
import { updateSelectionStyles } from './cards.js';
import { closeModal, openModal, isEditorOpen } from './editor-modal.js';
import { closeDetails, isDetailsOpen } from './details-modal.js';
import { openHistory, closeHistory, isHistoryOpen } from './history-drawer.js';
import { closeSettings, isSettingsOpen } from './settings-modal.js';
import { closeVariables, isVariablesOpen } from './variables-modal.js';
import { closeGroups, isGroupsOpen } from './groups-modal.js';
import { isBatchModalOpen, closeBatchModal } from './batch-runner.js';
import { removeContextMenu, isContextMenuOpen, removeCopyDropdown, isCopyDropdownOpen } from './menus.js';
import { duplicateSnippet, togglePin } from './snippets-store.js';

function moveSelection(delta) {
  if (state.filtered.length === 0) return;
  state.selectedIndex = (state.selectedIndex + delta + state.filtered.length) % state.filtered.length;
  updateSelectionStyles();
  const card = dom.snippetList.querySelector(`.card[data-index="${state.selectedIndex}"]`);
  if (card) card.scrollIntoView({ block: 'nearest' });
}

function runCardAt(index) {
  const card = dom.snippetList.querySelector(`.card[data-index="${index}"]`);
  card?.querySelector('.btn-primary')?.click();
}

document.addEventListener('keydown', (e) => {
  const anySurfaceOpen = isEditorOpen() || isDetailsOpen() || isHistoryOpen() || isSettingsOpen() || isVariablesOpen() || isGroupsOpen() || isBatchModalOpen();

  if (e.key === 'Escape') {
    if (isEditorOpen()) closeModal();
    else if (isDetailsOpen()) closeDetails();
    else if (isBatchModalOpen()) closeBatchModal();
    else if (isVariablesOpen()) closeVariables();
    else if (isGroupsOpen()) closeGroups();
    else if (isHistoryOpen()) closeHistory();
    else if (isSettingsOpen()) closeSettings();
    else if (isContextMenuOpen()) removeContextMenu();
    else if (isCopyDropdownOpen()) removeCopyDropdown();
    else window.electronAPI.hideWindow();
    return;
  }

  if (anySurfaceOpen) return; // let that surface own the keyboard

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === 'Enter') {
    if (state.selectedIndex >= 0 && state.filtered[state.selectedIndex]) runCardAt(state.selectedIndex);
  } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && document.activeElement !== dom.searchInput) {
    if (state.selectedIndex >= 0 && state.filtered[state.selectedIndex]) {
      e.preventDefault();
      window.electronAPI.copyText(runnableTextOf(state.filtered[state.selectedIndex]));
    }
  } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && document.activeElement !== dom.searchInput) {
    if (state.selectedIndex >= 0 && state.filtered[state.selectedIndex]) {
      e.preventDefault();
      duplicateSnippet(state.filtered[state.selectedIndex].id);
    }
  } else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    openModal(null);
  } else if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    openHistory();
  } else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
    if (state.selectedIndex >= 0 && state.filtered[state.selectedIndex]) {
      e.preventDefault();
      togglePin(state.filtered[state.selectedIndex].id);
    }
  } else if (/^[1-9]$/.test(e.key) && document.activeElement !== dom.searchInput) {
    const idx = Number(e.key) - 1;
    if (state.filtered[idx]) {
      e.preventDefault();
      runCardAt(idx);
    }
  }
});
