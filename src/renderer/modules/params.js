// params.js — the inline "fill in {{placeholder}} values" form that appears
// on a card before a parameterized snippet runs.
import { state } from './state.js';
import { iconSvg } from './icons.js';

/** Keeps a global variable's stored value fresh whenever a matching placeholder is filled in. */
export async function syncVariablesFromValues(values) {
  if (!values) return;
  let changed = false;
  Object.keys(values).forEach((name) => {
    const existing = state.variables.find((v) => v.name === name);
    if (existing && existing.value !== values[name]) {
      existing.value = values[name];
      changed = true;
    }
  });
  if (changed) state.variables = await window.electronAPI.saveVariables(state.variables);
}

export function buildParamForm(names, onRun, onCancel) {
  const form = document.createElement('div');
  form.className = 'param-form';
  form.addEventListener('click', (e) => e.stopPropagation());

  const inputs = {};
  names.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'param-row';
    const label = document.createElement('label');
    label.textContent = name;
    const known = state.variables.find((v) => v.name === name);
    const input = document.createElement('input');
    input.type = known && known.secret ? 'password' : 'text';
    input.className = 'param-input';
    input.placeholder = `Value for ${name}`;
    if (known) input.value = known.value;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // never leak into global shortcuts (digits, Ctrl+…)
      if (e.key === 'Enter') { e.preventDefault(); runBtn2.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    });
    inputs[name] = input;
    row.append(label, input);
    form.appendChild(row);
  });

  const actionsRow = document.createElement('div');
  actionsRow.className = 'param-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost btn-small';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); onCancel(); });
  const runBtn2 = document.createElement('button');
  runBtn2.className = 'btn btn-primary btn-small';
  runBtn2.innerHTML = `${iconSvg('play')}<span>Run</span>`;
  runBtn2.addEventListener('click', (e) => {
    e.stopPropagation();
    const values = {};
    names.forEach((n) => { values[n] = inputs[n].value; });
    onRun(values);
  });
  actionsRow.append(cancelBtn, runBtn2);
  form.appendChild(actionsRow);

  setTimeout(() => { const first = inputs[names[0]]; if (first) first.focus(); }, 0);
  return form;
}
