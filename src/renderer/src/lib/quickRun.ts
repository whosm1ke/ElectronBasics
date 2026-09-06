// quickRun.ts — "run this snippet right now, with no card and no output
// panel to render into" — shared by ScheduleModal.tsx's "Run now" and
// CommandPaletteModal.tsx's Enter-to-run. A parameterized snippet has
// nowhere to collect its values here, so it opens the real editor instead
// of running blind (same "no prompting outside a real form" spirit as
// every unattended path in this app, just surfaced as a redirect here
// since this IS an attended context — the user just didn't click Run on
// the card itself).
import type { Snippet } from '@shared/types';
import { extractPlaceholders, runnableTextOf } from './utils';
import { showToast } from './toast';
import { openModal } from '../store/useEditorStore';

export async function quickRunSnippet(snippet: Snippet): Promise<void> {
  if (extractPlaceholders(runnableTextOf(snippet)).length > 0) {
    showToast('This snippet needs input — open it to fill in its parameters first', 'error');
    openModal(snippet);
    return;
  }
  showToast(`Running "${snippet.name}"…`);
  const result =
    snippet.steps && snippet.steps.length
      ? await window.electronAPI.runSequence({ steps: snippet.steps, snippetId: snippet.id, snippetName: snippet.name, cwd: snippet.cwd, shell: snippet.shell, env: snippet.env, ssh: snippet.ssh })
      : await window.electronAPI.runCommand({ command: snippet.command, snippetId: snippet.id, snippetName: snippet.name, cwd: snippet.cwd, shell: snippet.shell, elevated: snippet.elevated, env: snippet.env, ssh: snippet.ssh });
  const code = 'overallCode' in result ? result.overallCode : result.code;
  showToast(code === 0 ? `"${snippet.name}" finished successfully` : `"${snippet.name}" failed (exit code ${code})`, code === 0 ? 'info' : 'error');
}
