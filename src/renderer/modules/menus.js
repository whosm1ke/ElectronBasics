// menus.js — floating, on-demand UI not present in index.html as static
// markup: the right-click context menu and the "Copy as" dropdown. Both are
// built when opened and appended to <body>, positioned via
// getBoundingClientRect() clamped to the viewport, so they always paint
// above every card regardless of DOM order (an absolutely-positioned
// dropdown nested inside a card used to get covered by a later sibling —
// see CLAUDE.md).
import { iconSvg } from './icons.js';
import { escapeHtml, runnableTextOf } from './utils.js';
import { duplicateSnippet, deleteSnippet, undoDelete, togglePin } from './snippets-store.js';
import { showToast } from './toast.js';
import { openModal } from './editor-modal.js';

// --- Context menu ---------------------------------------------------------

export function removeContextMenu() {
  document.getElementById('activeContextMenu')?.remove();
}

export function isContextMenuOpen() {
  return Boolean(document.getElementById('activeContextMenu'));
}

export function showContextMenu(x, y, snippet, cardEl) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'activeContextMenu';

  const items = [
    { label: 'Run', icon: 'play', action: () => cardEl.querySelector('.btn-primary')?.click() },
    { label: 'Open in terminal', icon: 'terminal', action: () => window.electronAPI.openTerminal({ command: runnableTextOf(snippet), cwd: snippet.cwd, shell: snippet.shell }) },
    { label: 'Copy command', icon: 'copy', action: () => window.electronAPI.copyText(runnableTextOf(snippet)) },
    { label: 'Edit', icon: 'edit', action: () => openModal(snippet) },
    { label: 'Duplicate', icon: 'duplicate', action: () => duplicateSnippet(snippet.id).then((s) => s && showToast(`Duplicated "${s.name}"`)) },
    { label: snippet.pinned ? 'Unpin' : 'Pin to top', icon: null, action: () => togglePin(snippet.id) },
    { sep: true },
    {
      label: 'Delete', icon: 'trash', danger: true,
      action: async () => {
        const result = await deleteSnippet(snippet.id);
        if (result) {
          showToast(`Deleted "${result.removed.name}"`, 'info', 'Undo', () => undoDelete(result.removed, result.index));
        }
      },
    },
  ];

  items.forEach((it) => {
    if (it.sep) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu-item' + (it.danger ? ' danger' : '');
    btn.innerHTML = `${it.icon ? iconSvg(it.icon) : ''}<span>${escapeHtml(it.label)}</span>`;
    btn.addEventListener('click', () => {
      removeContextMenu();
      it.action();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 6;
  const maxY = window.innerHeight - rect.height - 6;
  menu.style.left = `${Math.max(6, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, maxY))}px`;
}

// --- "Copy as" dropdown ---------------------------------------------------

export function removeCopyDropdown() {
  document.getElementById('activeCopyDropdown')?.remove();
}

export function isCopyDropdownOpen() {
  return Boolean(document.getElementById('activeCopyDropdown'));
}

export function toggleCopyDropdown(caretBtn, snippet) {
  const existing = document.getElementById('activeCopyDropdown');
  const reopening = existing && existing._forBtn === caretBtn;
  removeCopyDropdown();
  if (reopening) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'copy-dropdown';
  dropdown.id = 'activeCopyDropdown';
  dropdown._forBtn = caretBtn;

  const mdItem = document.createElement('button');
  mdItem.className = 'copy-dropdown-item';
  mdItem.textContent = 'Copy as Markdown';
  mdItem.addEventListener('click', async () => {
    removeCopyDropdown();
    const lang = snippet.shell === 'cmd' ? 'bat' : snippet.shell === 'powershell' ? 'powershell' : snippet.shell;
    await window.electronAPI.copyText('```' + lang + '\n' + runnableTextOf(snippet) + '\n```');
    showToast('Copied as Markdown code block');
  });

  const oneLinerItem = document.createElement('button');
  oneLinerItem.className = 'copy-dropdown-item';
  oneLinerItem.textContent = 'Copy as one-liner';
  oneLinerItem.addEventListener('click', async () => {
    removeCopyDropdown();
    const oneLiner = snippet.steps && snippet.steps.length ? snippet.steps.join(' ; ') : snippet.command;
    await window.electronAPI.copyText(oneLiner);
    showToast('Copied as one-liner');
  });

  dropdown.append(mdItem, oneLinerItem);
  document.body.appendChild(dropdown);
  const rect = caretBtn.getBoundingClientRect();
  const dRect = dropdown.getBoundingClientRect();
  const left = Math.max(6, Math.min(rect.left, window.innerWidth - dRect.width - 6));
  const top = Math.min(rect.bottom + 4, window.innerHeight - dRect.height - 6);
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.context-menu')) removeContextMenu();
  if (!e.target.closest('.copy-dropdown') && !e.target.closest('.copy-caret-btn')) removeCopyDropdown();
});
