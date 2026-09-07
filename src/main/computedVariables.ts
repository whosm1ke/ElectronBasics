// computedVariables.ts — a "computed" global variable (Variable.computed)
// is refreshed by running a snippet and capturing its trimmed stdout as
// the variable's value, either on demand (refresh-computed-variable IPC)
// or on its own interval (this file's own 30s tick, mirroring
// scheduler.ts's cadence but kept as its own small concern rather than
// bolted onto that file — a computed-variable refresh isn't a scheduled
// snippet run: it's silent (no history entry, no notification), since it's
// meant to feel like reading a live value, not "running a command").
import { readVariables, writeVariables } from './storage/variables';
import { readSnippets } from './storage/snippets';
import { executeSnippetOnce } from './unattendedRun';
import { getMainWindow } from './window';
import type { Variable } from '@shared/types';

const CHECK_INTERVAL_MS = 30 * 1000;

async function refreshOne(variable: Variable): Promise<Variable> {
  if (!variable.computed) return variable;
  const snippet = readSnippets().find((s) => s.id === variable.computed!.snippetId);
  if (!snippet) return variable; // its source snippet was deleted — leave the last-known value alone
  const result = await executeSnippetOnce(snippet);
  return { ...variable, value: result.stdout.trim().slice(0, 2000), computed: { ...variable.computed, lastRefreshedAt: new Date().toISOString() } };
}

/** Manually refreshes one variable right now — returns the full updated list (same shape every other variables IPC handler returns). */
export async function refreshComputedVariable(variableId: string): Promise<Variable[]> {
  const variables = readVariables();
  const idx = variables.findIndex((v) => v.id === variableId);
  if (idx < 0) return variables;
  variables[idx] = await refreshOne(variables[idx]);
  return writeVariables(variables);
}

async function tickComputedVariables(): Promise<void> {
  const variables = readVariables();
  const now = Date.now();
  let changed = false;
  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    if (!v.computed || v.computed.refreshMode !== 'interval') continue;
    const last = v.computed.lastRefreshedAt ? new Date(v.computed.lastRefreshedAt).getTime() : 0;
    if (now - last < v.computed.intervalMinutes * 60000) continue;
    // eslint-disable-next-line no-await-in-loop
    variables[i] = await refreshOne(v);
    changed = true;
  }
  if (changed) {
    const saved = writeVariables(variables);
    // Unlike refreshComputedVariable() (an IPC call the renderer already
    // gets the fresh list back from directly), nothing is waiting on this
    // tick — without pushing it, the renderer's own state.variables would
    // sit stale (still whatever it last fetched via getVariables()) until
    // something else happened to reopen the Variables modal and re-fetch.
    // A window can be legitimately absent (hidden at startup, or briefly
    // during a hide/show cycle) — silently skip the push, not an error.
    getMainWindow()?.webContents.send('variables-refreshed', saved);
  }
}

export function startComputedVariablesTicker(): void {
  setInterval(() => {
    tickComputedVariables().catch((err) => console.error('Computed-variable tick failed:', err));
  }, CHECK_INTERVAL_MS);
}
