// CopyAsDropdown.tsx — the "Copy as…" dropdown opened from a card's copy-
// caret button. Ported from lib/menus.ts's toggleCopyDropdown() (deleted —
// see menuState.ts) onto @radix-ui/react-dropdown-menu: open/close-on-
// retrigger, outside-click, and Escape dismissal all come from the
// primitive now instead of hand-rolled viewport-clamping math and a
// document-level click listener.
import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Snippet } from '@shared/types';
import { runnableTextOf } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { setCopyDropdownOpen } from '../../lib/menuState';

export function CopyAsDropdown({ snippet, children }: { snippet: Snippet; children: ReactNode }) {
  return (
    <DropdownMenu.Root onOpenChange={setCopyDropdownOpen}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="copy-dropdown" align="start" sideOffset={4} onEscapeKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu.Item
            className="copy-dropdown-item"
            onSelect={async () => {
              const lang = snippet.shell === 'cmd' ? 'bat' : snippet.shell === 'powershell' ? 'powershell' : snippet.shell;
              await window.electronAPI.copyText('```' + lang + '\n' + runnableTextOf(snippet) + '\n```');
              showToast('Copied as Markdown code block');
            }}
          >
            Copy as Markdown
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="copy-dropdown-item"
            onSelect={async () => {
              const oneLiner = snippet.steps && snippet.steps.length ? snippet.steps.join(' ; ') : snippet.command;
              await window.electronAPI.copyText(oneLiner);
              showToast('Copied as one-liner');
            }}
          >
            Copy as one-liner
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
