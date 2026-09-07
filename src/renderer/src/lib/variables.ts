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

/**
 * Refreshes every COMPUTED variable among `names` right now — called just
 * before a run gates behind ParamForm.tsx (Card.tsx's own inline form, a
 * batch/group's shared gate, a pipeline's own) so its prefill reflects a
 * live value instead of whatever manual/interval refresh last cached (the
 * whole point of using a computed variable in something you're about to run
 * is that "now" is what you want substituted, not a stale snapshot from
 * whenever it was last refreshed). Names with no matching variable, or a
 * matching variable that isn't computed, are left untouched.
 *
 * Refreshed one at a time, not in parallel: `refreshComputedVariable`
 * (main/computedVariables.ts) reads the WHOLE saved variables list, updates
 * one entry, and writes the whole list back — two of these racing on the
 * same file would let the second write clobber the first's freshly-computed
 * value. Sequential avoids that at the cost of running each source snippet
 * one after another rather than concurrently, an acceptable trade-off since
 * a snippet typically references at most one or two computed variables.
 */
export async function refreshComputedVariablesFor(names: string[]): Promise<void> {
  const toRefresh = names
    .map((name) => (state.variables as Variable[]).find((v) => v.name === name))
    .filter((v): v is Variable => Boolean(v && v.computed));
  for (const v of toRefresh) {
    // eslint-disable-next-line no-await-in-loop
    state.variables = await window.electronAPI.refreshComputedVariable(v.id);
  }
}
