// variables.ts — ported from modules/params.js's syncVariablesFromValues
// (that module's buildParamForm() half became components/Card/ParamForm.tsx
// instead — a real React component, not a port of the DOM-building
// function). Keeps a global variable's stored value fresh whenever a
// matching placeholder is filled in during a run.
import type { Variable } from '@shared/types';
import { state } from '../../modules/state';

export async function syncVariablesFromValues(values: Record<string, string> | null): Promise<void> {
  if (!values) return;
  const variables = state.variables as Variable[];
  let changed = false;
  Object.keys(values).forEach((name) => {
    const existing = variables.find((v) => v.name === name);
    if (existing && existing.value !== values[name]) {
      existing.value = values[name];
      changed = true;
    }
  });
  if (changed) state.variables = await window.electronAPI.saveVariables(variables);
}
