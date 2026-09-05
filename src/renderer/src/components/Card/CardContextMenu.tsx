// CardContextMenu.tsx — the right-click context menu for a snippet card.
// Ported from lib/menus.ts's showContextMenu() (deleted — see menuState.ts's
// header comment on the one thing that module needed to keep working:
// keyboard.ts's Escape routing). Built on @radix-ui/react-context-menu
// instead of a document.body-appended <div>: real keyboard nav/typeahead,
// automatic viewport-collision positioning, and Escape/outside-click
// dismissal all come from the primitive instead of hand-rolled clamping math
// and a document-level click listener.
import type { ReactNode, RefObject } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Play, SquareTerminal, Copy, Pencil, CopyPlus, Trash2 } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { runnableTextOf } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { duplicateSnippet, togglePin } from '../../lib/snippetsStore';
import { openModal } from '../../store/useEditorStore';
import { setContextMenuOpen } from '../../lib/menuState';

interface CardContextMenuProps {
  snippet: Snippet;
  cardRef: RefObject<HTMLDivElement | null>;
  onDelete: () => void;
  children: ReactNode;
}

export function CardContextMenu({ snippet, cardRef, onDelete, children }: CardContextMenuProps) {
  return (
    <ContextMenu.Root onOpenChange={setContextMenuOpen}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu">
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={() => (cardRef.current?.querySelector('.btn-primary') as HTMLElement | null)?.click()}
          >
            <Play size={13} fill="currentColor" stroke="none" />
            <span>Run</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={async () => {
              const res = await window.electronAPI.openTerminal({ command: runnableTextOf(snippet), cwd: snippet.cwd ?? undefined, shell: snippet.shell });
              if (!res.ok) showToast(res.error || 'Could not open a terminal', 'error');
            }}
          >
            <SquareTerminal size={12} />
            <span>Open in terminal</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => window.electronAPI.copyText(runnableTextOf(snippet))}>
            <Copy size={13} />
            <span>Copy command</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => openModal(snippet)}>
            <Pencil size={13} />
            <span>Edit</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className="context-menu-item"
            onSelect={async () => {
              const source = await duplicateSnippet(snippet.id);
              if (source) showToast(`Duplicated "${source.name}"`);
            }}
          >
            <CopyPlus size={13} />
            <span>Duplicate</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => togglePin(snippet.id)}>
            <span>{snippet.pinned ? 'Unpin' : 'Pin to top'}</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-sep" />
          <ContextMenu.Item className="context-menu-item danger" onSelect={onDelete}>
            <Trash2 size={13} />
            <span>Delete</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
