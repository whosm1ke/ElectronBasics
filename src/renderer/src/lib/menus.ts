// menus.ts — floating, on-demand UI not present as static markup: the
// right-click context menu and the "Copy as" dropdown. Ported from
// modules/menus.js, kept as plain DOM-appended-to-body utilities (not
// componentized) — Card.tsx calls these imperatively from its onContextMenu/
// onClick handlers exactly as the original cards.js did; a "real" React
// portal-based FloatingMenu component is a nice-to-have consolidation (see
// the migration plan) left for a later pass, not required for correctness.
// Positioned via getBoundingClientRect() clamped to the viewport, so they
// always paint above every card regardless of DOM order.
import type { Snippet } from '@shared/types';
import { iconSvg } from './icons';
import { escapeHtml, runnableTextOf } from './utils';
import { showToast } from '../store/useToastStore';
import { duplicateSnippet, deleteSnippet, undoDelete, togglePin } from './snippetsStore';
import { openModal } from '../store/useEditorStore';

// --- Context menu ---------------------------------------------------------

export function removeContextMenu(): void {
  document.getElementById('activeContextMenu')?.remove();
}

export function isContextMenuOpen(): boolean {
  return Boolean(document.getElementById('activeContextMenu'));
}

interface MenuItem {
  label: string;
  icon?: string | null;
  danger?: boolean;
  action: () => void;
  sep?: false;
}
type MenuEntry = MenuItem | { sep: true };

export function showContextMenu(x: number, y: number, snippet: Snippet, cardEl: HTMLElement): void {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'activeContextMenu';

  const items: MenuEntry[] = [
    { label: 'Run', icon: 'play', action: () => (cardEl.querySelector('.btn-primary') as HTMLElement | null)?.click() },
    {
      label: 'Open in terminal',
      icon: 'terminal',
      action: () => window.electronAPI.openTerminal({ command: runnableTextOf(snippet), cwd: snippet.cwd ?? undefined, shell: snippet.shell }),
    },
    { label: 'Copy command', icon: 'copy', action: () => window.electronAPI.copyText(runnableTextOf(snippet)) },
    { label: 'Edit', icon: 'edit', action: () => openModal(snippet) },
    { label: 'Duplicate', icon: 'duplicate', action: () => duplicateSnippet(snippet.id).then((s: Snippet | null) => s && showToast(`Duplicated "${s.name}"`)) },
    { label: snippet.pinned ? 'Unpin' : 'Pin to top', icon: null, action: () => togglePin(snippet.id) },
    { sep: true },
    {
      label: 'Delete',
      icon: 'trash',
      danger: true,
      action: async () => {
        const result = await deleteSnippet(snippet.id);
        if (result) {
          showToast(`Deleted "${result.removed.name}"`, 'info', 'Undo', () => undoDelete(result.removed, result.index));
        }
      },
    },
  ];

  items.forEach((it) => {
    if ('sep' in it && it.sep) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      menu.appendChild(sep);
      return;
    }
    const item = it as MenuItem;
    const btn = document.createElement('button');
    btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    btn.innerHTML = `${item.icon ? iconSvg(item.icon) : ''}<span>${escapeHtml(item.label)}</span>`;
    btn.addEventListener('click', () => {
      removeContextMenu();
      item.action();
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

export function removeCopyDropdown(): void {
  document.getElementById('activeCopyDropdown')?.remove();
}

export function isCopyDropdownOpen(): boolean {
  return Boolean(document.getElementById('activeCopyDropdown'));
}

export function toggleCopyDropdown(caretBtn: HTMLElement, snippet: Snippet): void {
  const existing = document.getElementById('activeCopyDropdown') as (HTMLElement & { _forBtn?: HTMLElement }) | null;
  const reopening = existing && existing._forBtn === caretBtn;
  removeCopyDropdown();
  if (reopening) return;

  const dropdown = document.createElement('div') as HTMLElement & { _forBtn?: HTMLElement };
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
  const target = e.target as HTMLElement;
  if (!target.closest('.context-menu')) removeContextMenu();
  if (!target.closest('.copy-dropdown') && !target.closest('.copy-caret-btn')) removeCopyDropdown();
});
