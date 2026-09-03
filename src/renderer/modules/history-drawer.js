// history-drawer.js — the run-history side panel: list, search, re-run, copy, clear.
import { dom } from './dom.js';
import { iconSvg } from './icons.js';
import { escapeHtml, timeAgo } from './utils.js';

let lastLoadedHistory = [];

export async function openHistory() {
  dom.historyOverlay.hidden = false;
  dom.historySearchInput.value = '';
  lastLoadedHistory = await window.electronAPI.getHistory();
  renderHistory(lastLoadedHistory);
}

export function closeHistory() {
  dom.historyOverlay.hidden = true;
  dom.searchInput.focus();
}

export function isHistoryOpen() {
  return !dom.historyOverlay.hidden;
}

function flashLabel(button, html) {
  const original = button.innerHTML;
  button.innerHTML = html;
  setTimeout(() => { button.innerHTML = original; }, 1200);
}

function renderHistory(history) {
  dom.historyList.innerHTML = '';
  if (!history || history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No matching commands.';
    dom.historyList.appendChild(empty);
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-item-header';
    header.innerHTML = `
      <span class="status-dot ${entry.exitCode === 0 ? 'ok' : 'error'}"></span>
      <span class="history-item-name">${escapeHtml(entry.snippetName || 'Untitled')}</span>
      <span class="history-item-time">${escapeHtml(timeAgo(entry.startedAt))}</span>
    `;

    const commandEl = document.createElement('div');
    commandEl.className = 'history-item-command';
    commandEl.textContent = entry.command;

    const actions = document.createElement('div');
    actions.className = 'history-item-actions';

    const rerunBtn = document.createElement('button');
    rerunBtn.className = 'btn';
    rerunBtn.innerHTML = `${iconSvg('rerun')}<span>Re-run</span>`;
    rerunBtn.addEventListener('click', async () => {
      closeHistory();
      await window.electronAPI.runCommand({
        command: entry.command,
        snippetId: entry.snippetId,
        snippetName: entry.snippetName,
      });
      openHistory();
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.innerHTML = `${iconSvg('copy')}<span>Copy</span>`;
    copyBtn.addEventListener('click', async () => {
      await window.electronAPI.copyText(entry.command);
      flashLabel(copyBtn, `${iconSvg('check')}<span>Copied!</span>`);
    });

    actions.append(rerunBtn, copyBtn);
    item.append(header, commandEl, actions);
    dom.historyList.appendChild(item);
  });
}

dom.historySearchInput.addEventListener('input', () => {
  const q = dom.historySearchInput.value.trim().toLowerCase();
  const list = q
    ? lastLoadedHistory.filter((e) => `${e.snippetName || ''} ${e.command || ''}`.toLowerCase().includes(q))
    : lastLoadedHistory;
  renderHistory(list);
});

dom.historyBtn.addEventListener('click', openHistory);
dom.closeHistoryBtn.addEventListener('click', closeHistory);
dom.clearHistoryBtn.addEventListener('click', async () => {
  lastLoadedHistory = await window.electronAPI.clearHistory();
  dom.historySearchInput.value = '';
  renderHistory(lastLoadedHistory);
});
dom.historyOverlay.addEventListener('click', (e) => {
  if (e.target === dom.historyOverlay) closeHistory();
});
