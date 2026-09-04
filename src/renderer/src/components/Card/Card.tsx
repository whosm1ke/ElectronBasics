// Card.tsx — one snippet card: header badges, command/steps body, actions,
// output panel. Ported from modules/cards.js's buildCard() + its
// buildXxx() helpers. Still calls straight into several lib/store modules
// for anything that isn't "build this card's own DOM" — runEngine
// (actually running it), processEngine (background start/stop/status),
// menus (context menu / copy-as dropdown), useEditorStore, useDetailsStore,
// snippetsStore (pin/duplicate/delete) — exactly the same functions the
// old buildCard() called, just from JSX handlers instead of
// addEventListener. Those modules manipulate real DOM nodes (querySelector
// against class names, direct property/className writes) which works
// identically whether React or vanilla JS created the node — see the
// migration plan's Phase 7 notes.
import { useEffect, useRef, useState } from 'react';
import type { Snippet, Group } from '@shared/types';
import { iconSvg, starIconSvg } from '../../lib/icons';
import { tagIcon, snippetIcon, tagColors, buildCardMetaText, extractPlaceholders, substituteAll, runnableTextOf } from '../../lib/utils';
import { showToast } from '../../store/useToastStore';
import { ParamForm } from './ParamForm';
import { state } from '../../../modules/state';
import { persistSnippets, togglePin, duplicateSnippet, deleteSnippet, undoDelete } from '../../lib/snippetsStore';
import { runSingleSnippet, runSequenceSnippet } from '../../lib/runEngine';
import { syncVariablesFromValues } from '../../lib/variables';
import { showContextMenu, toggleCopyDropdown } from '../../lib/menus';
import { openModal } from '../../store/useEditorStore';
import { openDetails } from '../../store/useDetailsStore';
import { groupsForSnippet } from '../../store/useGroupsStore';
import {
  startBackground,
  startBackgroundWithValues,
  stopBackground,
  restartBackground,
  syncCardBackgroundUI,
  isRunningStatus,
} from '../../lib/processEngine';

interface CardProps {
  snippet: Snippet;
  index: number;
  reorderable: boolean;
  selected: boolean;
  selectMode: boolean;
  selectedForBatch: boolean;
  onSelectForBatch: (id: string, selected: boolean) => void;
  onSelectCard: (index: number) => void;
}

export function Card({ snippet, index, reorderable, selected, selectMode, selectedForBatch, onSelectForBatch, onSelectCard }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const runBtnRef = useRef<HTMLButtonElement>(null);
  const startStopBtnRef = useRef<HTMLButtonElement>(null);
  const restartBtnRef = useRef<HTMLButtonElement>(null);
  const copyOutputBtnRef = useRef<HTMLButtonElement>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const copyCaretBtnRef = useRef<HTMLButtonElement>(null);
  const [paramNames, setParamNames] = useState<string[] | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState(false);

  const colors = tagColors(snippet.tag);
  const memberGroups: Group[] = groupsForSnippet(snippet.id);
  const metaText = buildCardMetaText(snippet);

  // Mirrors buildCard()'s post-construction call: patch Start/Stop label,
  // Restart's disabled state, and the output panel to match whatever's
  // already known about this snippet's background process (state lives in
  // process-engine.js's state.runningProcesses, not this component).
  useEffect(() => {
    if (snippet.background) syncCardBackgroundUI(cardRef.current, snippet.id);
  });

  function proceedRun(values: Record<string, string> | null) {
    if (!cardRef.current || !outputRef.current || !copyOutputBtnRef.current || !runBtnRef.current) return;
    if (snippet.steps && snippet.steps.length) {
      const steps = snippet.steps.map((s) => substituteAll(s, values));
      runSequenceSnippet(snippet, cardRef.current, steps, outputRef.current, copyOutputBtnRef.current, runBtnRef.current);
    } else {
      const command = substituteAll(snippet.command, values);
      runSingleSnippet(snippet, cardRef.current, command, outputRef.current, copyOutputBtnRef.current, runBtnRef.current);
    }
  }

  function handleRunClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (paramNames) return; // form already open — use its own Run button
    const names = extractPlaceholders(runnableTextOf(snippet));
    if (names.length > 0) {
      setParamNames(names);
      return;
    }
    proceedRun(null);
  }

  function handleStartStopClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isRunningStatus(state.runningProcesses[snippet.id]?.status)) {
      stopBackground(snippet);
      return;
    }
    if (paramNames) return;
    const names = startBackground(snippet);
    if (names.length > 0) setParamNames(names);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    void (async () => {
      // A background snippet's still-live process has no card left to
      // control once the card itself is gone — stop it first so deleting
      // the snippet can never leave an orphaned, now-uncontrollable process
      // running behind the scenes.
      if (snippet.background && isRunningStatus(state.runningProcesses[snippet.id]?.status)) {
        await stopBackground(snippet);
      }
      const result = await deleteSnippet(snippet.id);
      if (result) {
        showToast(`Deleted "${result.removed.name}"`, 'info', 'Undo', () => undoDelete(result.removed, result.index));
      }
    })();
  }

  // --- drag-to-reorder (native HTML5 DnD, same pattern as the original) ---
  function handleDragStart(e: React.DragEvent) {
    state.dragSrcId = snippet.id;
    cardRef.current?.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', snippet.id);
  }
  function handleDragEnd() {
    cardRef.current?.classList.remove('dragging');
    clearDragOverStyles();
    state.dragSrcId = null;
  }
  function clearDragOverStyles() {
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }
  function handleDragOver(e: React.DragEvent) {
    if (!state.dragSrcId || state.dragSrcId === snippet.id) return;
    e.preventDefault();
    const rect = cardRef.current!.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    clearDragOverStyles();
    cardRef.current?.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
  }
  function handleDragLeave() {
    cardRef.current?.classList.remove('drag-over-top', 'drag-over-bottom');
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    clearDragOverStyles();
    if (!state.dragSrcId || state.dragSrcId === snippet.id) return;
    const snippets = state.snippets as Snippet[];
    const fromIdx = snippets.findIndex((s) => s.id === state.dragSrcId);
    if (fromIdx < 0) return;
    const rect = cardRef.current!.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    const [moved] = snippets.splice(fromIdx, 1);
    let insertAt = snippets.findIndex((s) => s.id === snippet.id);
    if (!before) insertAt += 1;
    snippets.splice(insertAt, 0, moved);
    state.dragSrcId = null;
    await persistSnippets();
  }

  return (
    <div
      ref={cardRef}
      className={'card' + (selected ? ' selected' : '')}
      data-index={index}
      data-snippet-id={snippet.id}
      onClick={() => onSelectCard(index)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelectCard(index);
        if (cardRef.current) showContextMenu(e.clientX, e.clientY, snippet, cardRef.current);
      }}
      onDragOver={reorderable ? handleDragOver : undefined}
      onDragLeave={reorderable ? handleDragLeave : undefined}
      onDrop={reorderable ? handleDrop : undefined}
    >
      <div className="card-header">
        {selectMode ? (
          <input
            type="checkbox"
            className="card-select-checkbox"
            checked={selectedForBatch}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelectForBatch(snippet.id, e.target.checked)}
          />
        ) : reorderable ? (
          <span
            className="drag-handle"
            title="Drag to reorder"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            dangerouslySetInnerHTML={{
              __html:
                '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>',
            }}
          />
        ) : index < 9 ? (
          <div className="card-quick-num">{index + 1}</div>
        ) : null}

        <div className="card-avatar" style={{ background: colors.bg }}>
          {snippetIcon(snippet)}
        </div>

        <div className="card-title-group">
          <div className="card-title-row">
            <div className="card-title">{snippet.name}</div>
            {snippet.elevated && (
              <span className="admin-badge" title="Runs as Administrator (UAC prompt)" dangerouslySetInnerHTML={{ __html: iconSvg('admin') }} />
            )}
            {snippet.schedule?.enabled && (
              <span className="schedule-badge" title="Runs automatically on a schedule" dangerouslySetInnerHTML={{ __html: iconSvg('clock') }} />
            )}
            {snippet.background && (
              <span
                className="background-badge"
                title={
                  snippet.autoRestart
                    ? 'Background process (Start/Stop) — restarts automatically if it crashes'
                    : 'Background process (Start/Stop instead of run-once)'
                }
                dangerouslySetInnerHTML={{ __html: iconSvg('terminal') }}
              />
            )}
            {memberGroups.length > 0 && (
              <span
                className="groups-badge"
                title={
                  memberGroups.length === 1
                    ? `In group: ${memberGroups[0].name || '(untitled group)'}${memberGroups[0].description ? ` — ${memberGroups[0].description}` : ''}`
                    : `In groups: ${memberGroups.map((g) => g.name || '(untitled group)').join(', ')}`
                }
                dangerouslySetInnerHTML={{ __html: iconSvg('layers') }}
              />
            )}
          </div>
          {metaText && <div className="card-meta">{metaText}</div>}
        </div>

        <div className="card-tag" style={{ background: colors.bg, color: colors.fg }}>
          {snippet.tag}
        </div>

        {snippet.cwd && (
          <button
            type="button"
            className="open-folder-btn"
            title={`Open ${snippet.cwd} in File Explorer`}
            dangerouslySetInnerHTML={{ __html: iconSvg('folder') }}
            onClick={async (e) => {
              e.stopPropagation();
              const res = await window.electronAPI.openPath(snippet.cwd!);
              if (!res.ok) showToast(res.error || 'Could not open that folder', 'error');
            }}
          />
        )}
        <button
          type="button"
          className="terminal-btn"
          title="Open in a real, interactive terminal window"
          dangerouslySetInnerHTML={{ __html: iconSvg('terminal') }}
          onClick={async (e) => {
            e.stopPropagation();
            const res = await window.electronAPI.openTerminal({ command: runnableTextOf(snippet), cwd: snippet.cwd ?? undefined, shell: snippet.shell });
            if (!res.ok) showToast(res.error || 'Could not open a terminal', 'error');
          }}
        />
        <button
          type="button"
          className="details-btn"
          title="Details (dependencies, schedule, stats)"
          dangerouslySetInnerHTML={{ __html: iconSvg('info') }}
          onClick={(e) => {
            e.stopPropagation();
            openDetails(snippet);
          }}
        />
        <button
          type="button"
          className={'pin-btn' + (snippet.pinned ? ' pinned' : '')}
          title={snippet.pinned ? 'Unpin' : 'Pin to top'}
          dangerouslySetInnerHTML={{ __html: starIconSvg(snippet.pinned) }}
          onClick={async (e) => {
            e.stopPropagation();
            await togglePin(snippet.id);
          }}
        />
      </div>

      {snippet.steps && snippet.steps.length ? (
        <div className="card-steps">
          {snippet.steps.map((step, i) => (
            <div className="card-step" key={i}>
              <span className="card-step-num">{i + 1}.</span>
              <span className="card-step-text">{step}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-command">{snippet.command}</div>
      )}

      {snippet.notes && (
        <>
          <button
            type="button"
            className="notes-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen((v) => !v);
            }}
            dangerouslySetInnerHTML={{ __html: `${iconSvg('info')}<span>Notes</span>` }}
          />
          <div className="card-notes" hidden={!notesOpen}>
            {snippet.notes}
          </div>
        </>
      )}

      <div className="card-actions">
        {snippet.background ? (
          <>
            <button ref={startStopBtnRef} type="button" className="btn btn-small btn-primary bg-startstop-btn" onClick={handleStartStopClick}>
              {iconSvg('play')}
              <span>Start</span>
            </button>
            <button
              ref={restartBtnRef}
              type="button"
              className="btn btn-small bg-restart-btn"
              title="Restart"
              disabled
              dangerouslySetInnerHTML={{ __html: iconSvg('rerun') }}
              onClick={(e) => {
                e.stopPropagation();
                restartBackground(snippet);
              }}
            />
          </>
        ) : (
          <button ref={runBtnRef} type="button" className="btn btn-primary" onClick={handleRunClick} dangerouslySetInnerHTML={{ __html: `${iconSvg('play')}<span>Run</span>` }} />
        )}

        <div className="copy-split">
          <button
            ref={copyBtnRef}
            type="button"
            className="btn"
            onClick={async (e) => {
              e.stopPropagation();
              await window.electronAPI.copyText(runnableTextOf(snippet));
              setCopyLabel(true);
              setTimeout(() => setCopyLabel(false), 1200);
            }}
            dangerouslySetInnerHTML={{ __html: copyLabel ? `${iconSvg('check')}<span>Copied!</span>` : `${iconSvg('copy')}<span>Copy</span>` }}
          />
          <button
            ref={copyCaretBtnRef}
            type="button"
            className="copy-caret-btn"
            title="Copy as…"
            dangerouslySetInnerHTML={{ __html: iconSvg('chevronDown') }}
            onClick={(e) => {
              e.stopPropagation();
              if (copyCaretBtnRef.current) toggleCopyDropdown(copyCaretBtnRef.current, snippet);
            }}
          />
        </div>

        <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); openModal(snippet); }} dangerouslySetInnerHTML={{ __html: `${iconSvg('edit')}<span>Edit</span>` }} />
        <button
          type="button"
          className="btn"
          onClick={async (e) => {
            e.stopPropagation();
            const source = await duplicateSnippet(snippet.id);
            if (source) showToast(`Duplicated "${source.name}"`);
          }}
          dangerouslySetInnerHTML={{ __html: `${iconSvg('duplicate')}<span>Duplicate</span>` }}
        />
        <div className="btn-spacer" />
        <button type="button" className="btn btn-danger" onClick={handleDelete} dangerouslySetInnerHTML={{ __html: `${iconSvg('trash')}<span>Delete</span>` }} />
      </div>

      {/* Inserted before the output panel — matches the original's
          card.insertBefore(paramFormEl, output). */}
      {paramNames &&
        (snippet.background ? (
          <ParamForm
            names={paramNames}
            onCancel={() => setParamNames(null)}
            onRun={(values) => {
              setParamNames(null);
              startBackgroundWithValues(snippet, values);
            }}
          />
        ) : (
          <ParamForm
            names={paramNames}
            onCancel={() => setParamNames(null)}
            onRun={(values) => {
              setParamNames(null);
              syncVariablesFromValues(values);
              proceedRun(values);
            }}
          />
        ))}

      <div className="card-output" ref={outputRef} hidden>
        <div className="card-output-header">
          <span>
            <span className="status-dot" />
            <span className="status-text">Idle</span>
          </span>
          <div className="card-output-header-actions">
            <button
              ref={copyOutputBtnRef}
              type="button"
              className="copy-output-btn"
              title="Copy output"
              hidden
              dangerouslySetInnerHTML={{ __html: iconSvg('copy') }}
              onClick={async (e) => {
                e.stopPropagation();
                const text = (cardRef.current as unknown as { _lastOutputText?: string } | null)?._lastOutputText || '';
                await window.electronAPI.copyText(text);
                if (copyOutputBtnRef.current) {
                  const original = copyOutputBtnRef.current.innerHTML;
                  copyOutputBtnRef.current.innerHTML = iconSvg('check');
                  setTimeout(() => {
                    if (copyOutputBtnRef.current) copyOutputBtnRef.current.innerHTML = original;
                  }, 1000);
                }
              }}
            />
            <button
              type="button"
              className="close-output-btn"
              title="Close output"
              dangerouslySetInnerHTML={{ __html: iconSvg('close') }}
              onClick={(e) => {
                e.stopPropagation();
                if (outputRef.current) outputRef.current.hidden = true;
              }}
            />
          </div>
        </div>
        <div className="card-output-body" />
      </div>
    </div>
  );
}
