// TerminalHistoryModal.tsx — "Import from terminal history": lists real
// commands already typed into PowerShell/Git Bash on this machine (see
// src/main/shell/history-import.ts) and lets you check off a few and turn
// them straight into a new multi-step (or single-command) snippet, instead
// of retyping something you already know you ran. Renders as a `.screen`,
// same pattern as Groups/Pipelines/Health/Schedule.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Terminal, Pencil } from 'lucide-react';
import type { HistorySource, Snippet } from '@shared/types';
import { newId } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { closeTerminalHistory, useTerminalHistoryStore } from '../../store/useTerminalHistoryStore';
import { persistSnippets } from '../../lib/snippetsStore';
import { openModal } from '../../store/useEditorStore';
import { state } from '../../../modules/state';
import { InfoHint } from '../shared/InfoHint';

interface Line {
  key: string;
  shell: HistorySource['shell'];
  label: string;
  text: string;
}

function blankSnippet(name: string, shell: HistorySource['shell'], lines: string[]): Snippet {
  return {
    id: newId('snip'),
    name,
    tag: 'imported',
    command: lines.join('\n'),
    pinned: false,
    runCount: 0,
    lastRunAt: null,
    cwd: null,
    shell,
    elevated: false,
    steps: lines.length > 1 ? lines : null,
    stdin: null,
    icon: null,
    notes: 'Created from terminal history.',
    env: null,
    expect: null,
    runAfterThis: null,
    runBefore: null,
    stopOnStepError: false,
    schedule: null,
    background: false,
    autoRestart: false,
    externalSource: null,
    captures: null,
    ssh: null,
  };
}

export function TerminalHistoryModal() {
  const { open } = useTerminalHistoryStore();
  const [sources, setSources] = useState<HistorySource[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery('');
    setName('');
    window.electronAPI.getShellHistory().then(setSources);
  }, [open]);

  const allLines: Line[] = useMemo(() => {
    if (!sources) return [];
    const lines: Line[] = [];
    for (const src of sources) {
      src.lines.forEach((text, i) => lines.push({ key: `${src.shell}:${i}:${text}`, shell: src.shell, label: src.label, text }));
    }
    return lines;
  }, [sources]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const visible = q ? allLines.filter((l) => l.text.toLowerCase().includes(q)) : allLines;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function createSnippet(openInEditor: boolean) {
    const chosen = allLines.filter((l) => selected.has(l.key));
    if (chosen.length === 0) {
      showToast('Check at least one command first', 'error');
      return;
    }
    // History is stored/rendered newest-first, but a snippet's steps should
    // read (and run) in the order they were originally typed.
    const orderedLines = [...chosen].reverse().map((l) => l.text);
    const shell = chosen[0].shell;
    const finalName = name.trim() || (orderedLines.length === 1 ? orderedLines[0].slice(0, 60) : `Imported (${orderedLines.length} steps)`);
    const snippet = blankSnippet(finalName, shell, orderedLines);
    (state.snippets as Snippet[]).push(snippet);
    await persistSnippets();
    showToast(`Created "${finalName}"`);
    closeTerminalHistory();
    if (openInEditor) openModal(snippet);
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeTerminalHistory}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>
            Import from terminal history <InfoHint text="Commands you've already typed into PowerShell or Git Bash on this machine." />
          </h2>
        </div>
      </div>
      <div className="screen-body no-scrollbar">
        {sources === null ? (
          <div className="variables-empty">Reading shell history…</div>
        ) : allLines.length === 0 ? (
          <div className="variables-empty">No shell history found on this machine (PowerShell's PSReadLine log and Git Bash's .bash_history were both empty or missing).</div>
        ) : (
          <>
            <input
              type="text"
              className="field-input"
              placeholder="Filter…"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <div className="group-snippet-checklist no-scrollbar" style={{ maxHeight: 'none', flex: 1 }}>
              {visible.map((l) => (
                <label className="group-checklist-row" key={l.key}>
                  <input type="checkbox" checked={selected.has(l.key)} onChange={() => toggle(l.key)} />
                  <span className="group-checklist-label terminal-history-line">{l.text}</span>
                  <span className="group-checklist-tag">{l.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      {allLines.length > 0 && (
        <div className="screen-footer">
          <input
            type="text"
            className="field-input"
            placeholder={`Snippet name (optional) — ${selected.size} step${selected.size === 1 ? '' : 's'} selected`}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, marginRight: 8 }}
          />
          <button type="button" className="btn btn-small" onClick={() => createSnippet(true)} disabled={selected.size === 0}>
            <Pencil size={13} />
            <span>Create &amp; edit…</span>
          </button>
          <button type="button" className="btn btn-small btn-primary" onClick={() => createSnippet(false)} disabled={selected.size === 0}>
            <Terminal size={13} />
            <span>Create snippet</span>
          </button>
        </div>
      )}
    </div>
  );
}

