// BatchModal.tsx — the shared "configure order/mode, then run with live
// per-row output" modal. Ported from modules/batch-runner.js's DOM half
// (its row-management/run-engine half is useBatchStore.ts, reused as-is by
// modules/pipeline-engine.js, not yet ported). Two views (config/results)
// in one modal, same pattern GroupsModal.tsx uses. The actual "start the
// run" logic — previously modules/batch.js's dom.startBatchBtn handler —
// lives here now since that button is part of this modal.
import { useState } from 'react';
import type { Snippet } from '@shared/types';
import { snippetIcon } from '../../lib/utils';
import { showToast } from '../../store/useToastStore';
import {
  useBatchStore,
  closeBatchModal,
  showResultsView,
  setBatchMode,
  setBatchStopOnError,
  setBatchOrder,
  runBatchList,
  type BatchRow,
  toggleRowBody,
} from '../../store/useBatchStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';
import { refresh } from '../Card/SnippetList';
import { dom } from '../../../modules/dom';

function OrderRow({ snippet, index, order }: { snippet: Snippet; index: number; order: Snippet[] }) {
  const [dragOver, setDragOver] = useState<'top' | 'bottom' | null>(null);

  return (
    <div
      className={'batch-order-row' + (dragOver === 'top' ? ' drag-over-top' : dragOver === 'bottom' ? ' drag-over-bottom' : '')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', snippet.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setDragOver(e.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom');
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const before = dragOver === 'top';
        setDragOver(null);
        const fromId = e.dataTransfer.getData('text/plain');
        if (!fromId || fromId === snippet.id) return;
        const fromIdx = order.findIndex((s) => s.id === fromId);
        if (fromIdx < 0) return;
        const next = order.slice();
        const [moved] = next.splice(fromIdx, 1);
        let insertAt = next.findIndex((s) => s.id === snippet.id);
        if (!before) insertAt += 1;
        next.splice(insertAt, 0, moved);
        setBatchOrder(next);
      }}
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

  async function start() {
    showResultsView();
    const { ran, skipped, notRun } = await runBatchList(order, mode, { stopOnError });
    await persistSnippets();
    state.selectMode = false;
    (state.selectedIds as Set<string>).clear();
    dom.selectModeBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('batch-selection-changed'));
    refresh();
    const extras = [skipped && `${skipped} skipped`, notRun && `${notRun} not run`].filter(Boolean).join(', ');
    showToast(`Batch done: ${ran} ran${extras ? ` · ${extras}` : ''}`);
  }

  return (
    <div>
      <h2>Configure batch run</h2>
      <p className="field-hint">Drag to set the run order. Parameterized snippets are skipped (they need input).</p>

      <label className="field-label">Mode</label>
      <div className="segmented">
        <button type="button" className={'segmented-btn' + (mode === 'sequential' ? ' active' : '')} onClick={() => setBatchMode('sequential')}>
          Sequential (in order)
        </button>
        <button type="button" className={'segmented-btn' + (mode === 'parallel' ? ' active' : '')} onClick={() => setBatchMode('parallel')}>
          Parallel (all at once)
        </button>
      </div>

      <label className="checkbox-row" htmlFor="batchStopOnErrorToggle">
        <input type="checkbox" id="batchStopOnErrorToggle" checked={stopOnError} disabled={mode !== 'sequential'} onChange={(e) => setBatchStopOnError(e.target.checked)} />
        <span>
          Stop if a snippet fails <span className="field-hint">(sequential mode only)</span>
        </span>
      </label>

      <label className="field-label">Order</label>
      <div className="batch-order-list no-scrollbar">
        {order.map((s, i) => (
          <OrderRow key={s.id} snippet={s} index={i} order={order} />
        ))}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={closeBatchModal}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={start}>
          Run
        </button>
      </div>
    </div>
  );
}

function ResultRow({ row }: { row: BatchRow }) {
  const dotClass = row.status === 'running' ? 'running' : row.status === 'ok' ? 'ok' : row.status === 'error' ? 'error' : '';
  return (
    <div className="batch-result-row">
      <div className="batch-result-header" onClick={() => toggleRowBody(row.id)}>
        <span className={`status-dot ${dotClass}`} />
        <span className="batch-result-name">
          {snippetIcon(row.snippet)} {row.snippet.name}
        </span>
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
