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
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lock, Clock, SquareTerminal, Layers, Folder, Info, Star, Play, RotateCcw, Check, Copy, ChevronDown, Pencil, CopyPlus, Trash2, X, BookMarked } from 'lucide-react';
import type { Snippet, Group } from '@shared/types';
import { tagIcon, snippetIcon, tagColors, buildCardMetaText, extractPlaceholders, substituteAll, runnableTextOf } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ParamForm } from './ParamForm';
import { state } from '../../../modules/state';
import { togglePin, duplicateSnippet, deleteSnippet, undoDelete } from '../../lib/snippetsStore';
import { runSingleSnippet, runSequenceSnippet } from '../../lib/runEngine';
import { syncVariablesFromValues, refreshComputedVariablesFor } from '../../lib/variables';
import { CardContextMenu } from './CardContextMenu';
import { CopyAsDropdown } from './CopyAsDropdown';
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
  /** Which edge (if any) should show the drag-and-drop insertion line — see SnippetList.tsx's own comment on how this is derived. */
  dropIndicator: 'before' | 'after' | null;
  onSelectForBatch: (id: string, selected: boolean) => void;
  onSelectCard: (index: number) => void;
}

export function Card({ snippet, index, reorderable, selected, selectMode, selectedForBatch, dropIndicator, onSelectForBatch, onSelectCard }: CardProps) {
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
  const [copyOutputCopied, setCopyOutputCopied] = useState(false);

  const colors = tagColors(snippet.tag);
  const memberGroups: Group[] = groupsForSnippet(snippet.id);
  const metaText = buildCardMetaText(snippet);

  // Manual-reorder drag (@dnd-kit/sortable) — `disabled` rather than not
  // calling the hook at all, since hooks can't be called conditionally;
  // disabled just makes `listeners` inert and `isDragging` permanently
  // false. `setNodeRef` measures/positions the row itself; `listeners` are
  // spread only onto the small drag-handle span below (not the whole card),
  // matching the original's handle-only drag source.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: snippet.id,
    disabled: !reorderable,
  });

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

  async function handleRunClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (paramNames) return; // form already open — use its own Run button
    const names = extractPlaceholders(runnableTextOf(snippet));
    if (names.length > 0) {
      // Refresh any COMPUTED variable among these names first, so the form
      // ParamForm is about to prefill shows a live value instead of
      // whatever manual/interval refresh last cached — see
      // lib/variables.ts's own comment on why this matters.
      await refreshComputedVariablesFor(names);
      setParamNames(names);
      return;
    }
    proceedRun(null);
  }

  async function handleStartStopClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isRunningStatus(state.runningProcesses[snippet.id]?.status)) {
      stopBackground(snippet);
      return;
    }
    if (paramNames) return;
    const names = startBackground(snippet);
    if (names.length > 0) {
      await refreshComputedVariablesFor(names);
      setParamNames(names);
    }
  }

  // Shared by the Delete button and the context menu's Delete item — kept
  // event-argument-free so both call sites (a click handler and Radix's
  // onSelect) can pass it directly.
  async function doDelete() {
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
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    void doDelete();
  }

  return (
    <CardContextMenu snippet={snippet} cardRef={cardRef} onDelete={doDelete}>
    <div
      ref={(el) => { cardRef.current = el; setNodeRef(el); }}
      className={
        'card' +
        (selected ? ' selected' : '') +
        (isDragging ? ' dragging' : '') +
        (dropIndicator === 'before' ? ' drag-over-top' : dropIndicator === 'after' ? ' drag-over-bottom' : '')
      }
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-index={index}
      data-snippet-id={snippet.id}
      onClick={() => onSelectCard(index)}
      onContextMenu={() => onSelectCard(index)}
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
            {...attributes}
            {...listeners}
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
              <span className="admin-badge" title="Runs as Administrator (UAC prompt)"><Lock size={12} /></span>
            )}
            {snippet.schedule?.enabled && (
              <span className="schedule-badge" title="Runs automatically on a schedule"><Clock size={11} /></span>
            )}
            {snippet.background && (
              <span
                className="background-badge"
                title={
                  snippet.autoRestart
                    ? 'Background process (Start/Stop) — restarts automatically if it crashes'
                    : 'Background process (Start/Stop instead of run-once)'
                }
              >
                <SquareTerminal size={12} />
              </span>
            )}
            {snippet.externalSource && (
              <span className="library-badge" title={`From a subscribed library: ${snippet.externalSource}`}>
                <BookMarked size={12} />
              </span>
            )}
            {memberGroups.length > 0 && (
              <span
                className="groups-badge"
                title={
                  memberGroups.length === 1
                    ? `In group: ${memberGroups[0].name || '(untitled group)'}${memberGroups[0].description ? ` — ${memberGroups[0].description}` : ''}`
                    : `In groups: ${memberGroups.map((g) => g.name || '(untitled group)').join(', ')}`
                }
              >
                <Layers size={12} />
              </span>
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
            onClick={async (e) => {
              e.stopPropagation();
              const res = await window.electronAPI.openPath(snippet.cwd!);
              if (!res.ok) showToast(res.error || 'Could not open that folder', 'error');
            }}
          >
            <Folder size={12} />
          </button>
        )}
        <button
          type="button"
          className="terminal-btn"
          title="Open in a real, interactive terminal window"
          onClick={async (e) => {
            e.stopPropagation();
            const res = await window.electronAPI.openTerminal({ command: runnableTextOf(snippet), cwd: snippet.cwd ?? undefined, shell: snippet.shell });
            if (!res.ok) showToast(res.error || 'Could not open a terminal', 'error');
          }}
        >
          <SquareTerminal size={12} />
        </button>
        <button
          type="button"
          className="details-btn"
          title="Details (dependencies, schedule, stats)"
          onClick={(e) => {
            e.stopPropagation();
            openDetails(snippet);
          }}
        >
          <Info size={11} />
        </button>
        <button
          type="button"
          className={'pin-btn' + (snippet.pinned ? ' pinned' : '')}
          title={snippet.pinned ? 'Unpin' : 'Pin to top'}
          onClick={async (e) => {
            e.stopPropagation();
            await togglePin(snippet.id);
          }}
        >
          <Star size={15} fill={snippet.pinned ? 'currentColor' : 'none'} />
        </button>
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
          >
            <Info size={11} />
            <span>Notes</span>
          </button>
          <div className="card-notes" hidden={!notesOpen}>
            {snippet.notes}
          </div>
        </>
      )}

      <div className="card-actions">
        {snippet.background ? (
          <>
            <button ref={startStopBtnRef} type="button" className="btn btn-small btn-primary bg-startstop-btn" onClick={handleStartStopClick}>
              {/* Overwritten imperatively by processEngine.ts's syncCardBackgroundUI as soon as this snippet's live status is known (see the useEffect above) — this is just the pre-sync initial paint. */}
              <Play size={13} fill="currentColor" stroke="none" />
              <span>Start</span>
            </button>
            <button
              ref={restartBtnRef}
              type="button"
              className="btn btn-small bg-restart-btn"
              title="Restart"
              disabled
              onClick={(e) => {
                e.stopPropagation();
                restartBackground(snippet);
              }}
            >
              <RotateCcw size={12} />
            </button>
          </>
        ) : (
          <button ref={runBtnRef} type="button" className="btn btn-primary" onClick={handleRunClick}>
            <Play size={13} fill="currentColor" stroke="none" />
            <span>Run</span>
          </button>
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
          >
            {copyLabel ? (
              <>
                <Check size={13} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy</span>
              </>
            )}
          </button>
          <CopyAsDropdown snippet={snippet}>
            <button
              ref={copyCaretBtnRef}
              type="button"
              className="copy-caret-btn"
              title="Copy as…"
              onClick={(e) => e.stopPropagation()}
            >
              <ChevronDown size={11} />
            </button>
          </CopyAsDropdown>
        </div>

        <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); openModal(snippet); }}>
          <Pencil size={13} />
          <span>Edit</span>
        </button>
        <button
          type="button"
          className="btn"
          onClick={async (e) => {
            e.stopPropagation();
            const source = await duplicateSnippet(snippet.id);
            if (source) showToast(`Duplicated "${source.name}"`);
          }}
        >
          <CopyPlus size={13} />
          <span>Duplicate</span>
        </button>
        <div className="btn-spacer" />
        <button type="button" className="btn btn-danger" onClick={handleDelete}>
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
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
              onClick={async (e) => {
                e.stopPropagation();
                const text = (cardRef.current as unknown as { _lastOutputText?: string } | null)?._lastOutputText || '';
                await window.electronAPI.copyText(text);
                setCopyOutputCopied(true);
                setTimeout(() => setCopyOutputCopied(false), 1000);
              }}
            >
              {copyOutputCopied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              className="close-output-btn"
              title="Close output"
              onClick={(e) => {
                e.stopPropagation();
                if (outputRef.current) outputRef.current.hidden = true;
              }}
            >
              <X size={11} />
            </button>
          </div>
        </div>
        <div className="card-output-body" />
      </div>
    </div>
    </CardContextMenu>
  );
}
