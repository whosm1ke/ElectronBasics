// VariablesModal.tsx — the global variables manager (name/value pairs that
// pre-fill matching {{placeholder}} forms across every snippet). Ported
// from modules/variables-modal.js. Own full overlay (see HistoryDrawer.tsx's
// header comment on why). Still reads/writes modules/state.js's
// state.variables directly — see useVariablesStore.ts's header comment.
import { useEffect, useRef, useState } from 'react';
import { Eye, Trash2, Link2, RefreshCw } from 'lucide-react';
import type { Variable, Snippet, ComputedRefreshMode } from '@shared/types';
import { newId } from '../../lib/utils';
import { useVariablesOpen, closeVariables } from '../../store/useVariablesStore';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { state } from '../../../modules/state';
import { ThemedSelect } from '../shared/ThemedSelect';
import { SnippetPickerField } from '../shared/SnippetPicker';
import { InfoHint } from '../shared/InfoHint';

async function persistVariables() {
  state.variables = await window.electronAPI.saveVariables(state.variables as Variable[]);
  bumpSnippetsVersion();
}

const REFRESH_MODE_OPTIONS: [ComputedRefreshMode, string][] = [
  ['manual', 'Manual — click Refresh'],
  ['interval', 'Automatically, every…'],
];

function ComputedPanel({ variable, index }: { variable: Variable; index: number }) {
  const snippets = state.snippets as Snippet[];
  const [refreshing, setRefreshing] = useState(false);
  const computed = variable.computed;

  function update(patch: Partial<NonNullable<Variable['computed']>>) {
    const v = (state.variables as Variable[])[index];
    v.computed = { snippetId: '', refreshMode: 'manual', intervalMinutes: 60, lastRefreshedAt: null, ...v.computed, ...patch };
    persistVariables();
  }

  return (
    <div className="variable-computed-panel">
      <label className="field-label">Source snippet</label>
      <SnippetPickerField value={computed?.snippetId || ''} onChange={(snippetId) => update({ snippetId })} snippets={snippets} />
      {computed?.snippetId && (
        <>
          <label className="field-label">Refresh</label>
          <ThemedSelect value={computed.refreshMode} options={REFRESH_MODE_OPTIONS.map(([value, label]) => ({ value, label }))} onChange={(refreshMode) => update({ refreshMode })} />
          {computed.refreshMode === 'interval' && (
            <div className="schedule-field-row">
              <input type="number" className="field-input" min={1} value={computed.intervalMinutes} onChange={(e) => update({ intervalMinutes: Math.max(1, Number(e.target.value) || 1) })} />
              <span className="field-hint">minutes</span>
            </div>
          )}
          <div className="variable-computed-actions">
            <button
              type="button"
              className="btn btn-small"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                state.variables = await window.electronAPI.refreshComputedVariable(variable.id);
                bumpSnippetsVersion();
                setRefreshing(false);
              }}
            >
              <RefreshCw size={12} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh now'}</span>
            </button>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                (state.variables as Variable[])[index].computed = null;
                persistVariables();
              }}
            >
              Remove link
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function VariableRow({ variable, index }: { variable: Variable; index: number }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const [computedOpen, setComputedOpen] = useState(Boolean(variable.computed));

  // The value input below is deliberately uncontrolled (defaultValue, not
  // value) — same reasoning as the name input right above it, avoiding a
  // full re-render (and the resulting cursor-position reset) on every
  // keystroke. That's fine while this input's own onChange is the only
  // thing changing `variable.value`, but it means a change from OUTSIDE
  // this input — a computed variable's manual/interval refresh replacing
  // `state.variables` wholesale — never reaches the already-mounted DOM
  // node, since React only reads `defaultValue` once, on first mount. This
  // is exactly why "Refresh now" looked like it did nothing: the value WAS
  // refreshed on disk, the input just never displayed it. Re-synced here
  // instead, imperatively, only when `variable.value` actually changes —
  // harmless during normal typing too, since by the time this re-renders
  // (on blur) the DOM node's own .value already equals what's being set.
  useEffect(() => {
    if (valueRef.current && valueRef.current.value !== variable.value) valueRef.current.value = variable.value;
  }, [variable.value]);

  return (
    <div className="variable-row-wrap">
      <div className="variable-row">
        <input
          ref={nameRef}
          type="text"
          className="variable-name-input"
          placeholder="name"
          defaultValue={variable.name}
          onChange={() => {
            (state.variables as Variable[])[index].name = nameRef.current!.value.trim();
          }}
          onBlur={() => persistVariables()}
        />
        <input
          ref={valueRef}
          type={variable.secret ? 'password' : 'text'}
          className="variable-value-input"
          placeholder="value"
          defaultValue={variable.value}
          title={variable.computed ? "Refreshed automatically — hand-edits last until the next refresh" : undefined}
          onChange={() => {
            (state.variables as Variable[])[index].value = valueRef.current!.value;
          }}
          onBlur={() => persistVariables()}
        />
        <button
          type="button"
          className={'variable-secret-btn' + (variable.secret ? ' active' : '')}
          title="Hide value in the UI and encrypt it at rest (Windows DPAPI, tied to this device/account)"
          onClick={async () => {
            (state.variables as Variable[])[index].secret = !variable.secret;
            await persistVariables();
          }}
        >
          <Eye size={12} />
        </button>
        <button
          type="button"
          className={'variable-secret-btn' + (variable.computed ? ' active' : '')}
          title="Compute this value by running a snippet, instead of typing it in by hand"
          onClick={() => setComputedOpen((v) => !v)}
        >
          <Link2 size={12} />
        </button>
        <button
          type="button"
          className="variable-remove-btn"
          title="Remove variable"
          onClick={async () => {
            (state.variables as Variable[]).splice(index, 1);
            await persistVariables();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {computedOpen && <ComputedPanel variable={variable} index={index} />}
    </div>
  );
}

export function VariablesModal() {
  useSnippetsVersion();
  const open = useVariablesOpen();
  if (!open) return null;

  const variables = state.variables as Variable[];

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeVariables(); }}>
      <div className="modal modal-wide">
        <h2>
          Global variables{' '}
          <InfoHint text="Give a value a name once, and it pre-fills any {{name}} placeholder that matches — across every snippet." />
        </h2>
        <div className="variables-list no-scrollbar">
          {variables.length === 0 ? (
            <div className="variables-empty">
              No variables yet. Add one below — its value will auto-fill any matching {'{{placeholder}}'} across every snippet.
            </div>
          ) : (
            variables.map((v, i) => <VariableRow key={v.id} variable={v} index={i} />)
          )}
        </div>
        <div className="modal-actions modal-actions-left">
          <button
            type="button"
            className="btn btn-small"
            onClick={async () => {
              (state.variables as Variable[]).push({ id: newId('var'), name: '', value: '', secret: false, computed: null });
              bumpSnippetsVersion();
              await persistVariables();
            }}
          >
            + Add variable
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={closeVariables}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
