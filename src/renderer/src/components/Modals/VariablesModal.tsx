// VariablesModal.tsx — the global variables manager (name/value pairs that
// pre-fill matching {{placeholder}} forms across every snippet). Ported
// from modules/variables-modal.js. Own full overlay (see HistoryDrawer.tsx's
// header comment on why). Still reads/writes modules/state.js's
// state.variables directly — see useVariablesStore.ts's header comment.
import { useRef } from 'react';
import type { Variable } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { newId } from '../../lib/utils';
import { useVariablesOpen, closeVariables } from '../../store/useVariablesStore';
import { useSnippetsVersion, bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { state } from '../../../modules/state';

async function persistVariables() {
  state.variables = await window.electronAPI.saveVariables(state.variables as Variable[]);
  bumpSnippetsVersion();
}

function VariableRow({ variable, index }: { variable: Variable; index: number }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  return (
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
        onChange={() => {
          (state.variables as Variable[])[index].value = valueRef.current!.value;
        }}
        onBlur={() => persistVariables()}
      />
      <button
        type="button"
        className={'variable-secret-btn' + (variable.secret ? ' active' : '')}
        title="Hide value in the UI (stored locally, not encrypted)"
        dangerouslySetInnerHTML={{ __html: iconSvg('eye') }}
        onClick={async () => {
          (state.variables as Variable[])[index].secret = !variable.secret;
          await persistVariables();
        }}
      />
      <button
        type="button"
        className="variable-remove-btn"
        title="Remove variable"
        dangerouslySetInnerHTML={{ __html: iconSvg('trash') }}
        onClick={async () => {
          (state.variables as Variable[]).splice(index, 1);
          await persistVariables();
        }}
      />
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
        <h2>Global variables</h2>
        <p className="field-hint">
          Give a value a name once, and it pre-fills any <code>{'{{name}}'}</code> placeholder that matches — across every snippet.
        </p>
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
              (state.variables as Variable[]).push({ id: newId('var'), name: '', value: '', secret: false });
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
