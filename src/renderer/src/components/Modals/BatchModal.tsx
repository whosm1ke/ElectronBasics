// BatchModal.tsx — the shared "configure order/mode, then run with live
// per-row output" modal. Ported from modules/batch-runner.js's DOM half
// (its row-management/run-engine half is useBatchStore.ts, reused as-is by
// modules/pipeline-engine.js, not yet ported). Two views (config/results)
// in one modal, same pattern GroupsModal.tsx uses. The actual "start the
// run" logic — previously modules/batch.js's dom.startBatchBtn handler —
// lives here now since that button is part of this modal.
import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ShieldQuestion, Check, X } from 'lucide-react';
import type { Snippet } from '@shared/types';
import { snippetIcon, collectPlaceholders, collectPlaceholdersUsedBy } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ParamForm } from '../Card/ParamForm';
import {
  useBatchStore,
  closeBatchModal,
  showResultsView,
  setBatchMode,
  setBatchStopOnError,
  setBatchOrder,
  runBatchList,
  resolveGate,
  type BatchRow,
  toggleRowBody,
} from '../../store/useBatchStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';
import { refresh } from '../Card/SnippetList';
import { dom } from '../../../modules/dom';

function OrderRow({ snippet, index, dropIndicator }: { snippet: Snippet; index: number; dropIndicator: 'before' | 'after' | null }) {
  // Unlike Card.tsx's handle-only drag, the whole row is the drag source
  // here (matches the original's draggable on the row itself) — attributes/
  // listeners go straight on the root div rather than a separate handle.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: snippet.id });

  return (
    <div
      ref={setNodeRef}
      className={
        'batch-order-row' +
        (isDragging ? ' dragging' : '') +
        (dropIndicator === 'before' ? ' drag-over-top' : dropIndicator === 'after' ? ' drag-over-bottom' : '')
      }
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className="batch-order-num">{index + 1}</span>
      <span className="batch-order-name">
        {snippetIcon(snippet)} {snippet.name}
      </span>
    </div>
  );
}

function ConfigView() {
  const { order, mode, stopOnError } = useBatchStore();
  // Every {{placeholder}} name used across the whole batch, collected once
  // up front — see PipelinesModal.tsx's own param-gate (usePipelineParamGate)
  // for the identical shape of this pattern. `null` = not gating right now.
  const [gateNames, setGateNames] = useState<string[] | null>(null);

  async function runNow(values?: Record<string, string>) {
    showResultsView();
    const { ran, skipped, notRun } = await runBatchList(order, mode, { stopOnError, values });
    await persistSnippets();
    state.selectMode = false;
    (state.selectedIds as Set<string>).clear();
    dom.selectModeBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('batch-selection-changed'));
    refresh();
    const extras = [skipped && `${skipped} skipped`, notRun && `${notRun} not run`].filter(Boolean).join(', ');
    showToast(`Batch done: ${ran} ran${extras ? ` · ${extras}` : ''}`);
  }

  function start() {
    const names = collectPlaceholders(order);
    if (names.length > 0) {
      setGateNames(names);
      return;
    }
    void runNow();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }
  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;
    const fromIdx = order.findIndex((s) => s.id === active.id);
    const toIdx = order.findIndex((s) => s.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    setBatchOrder(arrayMove(order, fromIdx, toIdx));
  }

  return (
    <div>
      <h2>Configure batch run</h2>
      <p className="field-hint">Drag to set the run order. A parameterized snippet prompts for its values once, up front.</p>

      <label className="field-label">Mode</label>
      <div className="segmented">
        <button type="button" className={'segmented-btn' + (mode === 'sequential' ? ' active' : '')} onClick={() => setBatchMode('sequential')}>
          Sequential (in order)
        </button>
        <button type="button" className={'segmented-btn' + (mode === 'parallel' ? ' active' : '')} onClick={() => setBatchMode('parallel')}>
          Parallel (all at once)
        </button>
      </div>

      <label className="checkbox-row" htmlFor="batchStopOnErrorToggle" title="Sequential mode only">
        <input type="checkbox" id="batchStopOnErrorToggle" checked={stopOnError} disabled={mode !== 'sequential'} onChange={(e) => setBatchStopOnError(e.target.checked)} />
        <span>Stop if a snippet fails</span>
      </label>

      <label className="field-label">Order</label>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="batch-order-list no-scrollbar">
            {order.map((s, i) => {
              let dropIndicator: 'before' | 'after' | null = null;
              if (overId === s.id && activeId && activeId !== s.id) {
                const activeIdx = order.findIndex((o) => o.id === activeId);
                const overIdx = order.findIndex((o) => o.id === overId);
                dropIndicator = activeIdx < overIdx ? 'after' : 'before';
              }
              return <OrderRow key={s.id} snippet={s} index={i} dropIndicator={dropIndicator} />;
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={closeBatchModal}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={start}>
          Run
        </button>
      </div>

      {gateNames && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setGateNames(null); }}>
          <div className="modal">
            <h2>Values for this run</h2>
            <p className="field-hint">Collected once for every parameterized snippet in this batch — see which snippet each value is for under its name.</p>
            <ParamForm
              names={gateNames}
              usedBy={collectPlaceholdersUsedBy(order)}
              onCancel={() => setGateNames(null)}
              onRun={(values) => {
                setGateNames(null);
                void runNow(values);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ row }: { row: BatchRow }) {
  const dotClass = row.status === 'running' ? 'running' : row.status === 'ok' ? 'ok' : row.status === 'error' ? 'error' : '';
  const isPendingGate = row.status === 'gate';
  return (
    <div className="batch-result-row">
      <div className="batch-result-header" onClick={() => !isPendingGate && toggleRowBody(row.id)}>
        {isPendingGate ? <ShieldQuestion size={14} className="batch-gate-icon" /> : <span className={`status-dot ${dotClass}`} />}
        <span className="batch-result-name">
          {row.snippet ? (
            <>
              {snippetIcon(row.snippet)} {row.snippet.name}
            </>
          ) : (
            row.label
          )}
        </span>
        {isPendingGate && (
          <span className="batch-gate-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-small btn-primary" onClick={() => resolveGate(row.id, true)}>
              <Check size={12} />
              <span>Continue</span>
            </button>
            <button type="button" className="btn btn-small btn-danger" onClick={() => resolveGate(row.id, false)}>
              <X size={12} />
              <span>Abort</span>
            </button>
          </span>
        )}
      </div>
      <div className="batch-result-body" hidden={!row.bodyVisible}>
        {row.output}
      </div>
    </div>
  );
}

function ResultsView() {
  const { rows, running } = useBatchStore();
  return (
    <div>
      <h2>Batch results</h2>
      <div className="batch-results-list no-scrollbar">
        {rows.map((r) => (
          <ResultRow key={r.id} row={r} />
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" disabled={running} onClick={closeBatchModal}>
          {running ? 'Running…' : 'Close'}
        </button>
      </div>
    </div>
  );
}

export function BatchModal() {
  const { open, view } = useBatchStore();
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && view === 'config') closeBatchModal(); }}>
      <div className="modal modal-wide">{view === 'config' ? <ConfigView /> : <ResultsView />}</div>
    </div>
  );
}
