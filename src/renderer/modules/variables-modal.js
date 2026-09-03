// variables-modal.js — the global variables manager (name/value pairs that
// pre-fill matching {{placeholder}} forms across every snippet).
import { dom } from './dom.js';
import { state } from './state.js';
import { iconSvg } from './icons.js';
import { newId } from './utils.js';

export async function openVariables() {
  dom.settingsOverlay.hidden = true;
  dom.variablesOverlay.hidden = false;
  state.variables = await window.electronAPI.getVariables();
  renderVariablesList();
}

export function closeVariables() {
  dom.variablesOverlay.hidden = true;
  dom.settingsOverlay.hidden = false;
}

export function isVariablesOpen() {
  return !dom.variablesOverlay.hidden;
}

function renderVariablesList() {
  dom.variablesList.innerHTML = '';
  if (state.variables.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'variables-empty';
    empty.textContent = 'No variables yet. Add one below — its value will auto-fill any matching {{placeholder}} across every snippet.';
    dom.variablesList.appendChild(empty);
    return;
  }
  state.variables.forEach((v, i) => dom.variablesList.appendChild(buildVariableRow(v, i)));
}

function buildVariableRow(variable, index) {
  const row = document.createElement('div');
  row.className = 'variable-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'variable-name-input';
  nameInput.placeholder = 'name';
  nameInput.value = variable.name;
  nameInput.addEventListener('change', async () => {
    state.variables[index].name = nameInput.value.trim();
    state.variables = await window.electronAPI.saveVariables(state.variables);
  });

  const valueInput = document.createElement('input');
  valueInput.type = variable.secret ? 'password' : 'text';
  valueInput.className = 'variable-value-input';
  valueInput.placeholder = 'value';
  valueInput.value = variable.value;
  valueInput.addEventListener('change', async () => {
    state.variables[index].value = valueInput.value;
    state.variables = await window.electronAPI.saveVariables(state.variables);
  });

  const secretBtn = document.createElement('button');
  secretBtn.className = 'variable-secret-btn' + (variable.secret ? ' active' : '');
  secretBtn.title = 'Hide value in the UI (stored locally, not encrypted)';
  secretBtn.innerHTML = iconSvg('eye');
  secretBtn.addEventListener('click', async () => {
    state.variables[index].secret = !state.variables[index].secret;
    state.variables = await window.electronAPI.saveVariables(state.variables);
    renderVariablesList();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'variable-remove-btn';
  removeBtn.title = 'Remove variable';
  removeBtn.innerHTML = iconSvg('trash');
  removeBtn.addEventListener('click', async () => {
    state.variables.splice(index, 1);
    state.variables = await window.electronAPI.saveVariables(state.variables);
    renderVariablesList();
  });

  row.append(nameInput, valueInput, secretBtn, removeBtn);
  return row;
}

dom.addVariableBtn.addEventListener('click', async () => {
  state.variables.push({ id: newId('var'), name: '', value: '', secret: false });
  renderVariablesList();
  state.variables = await window.electronAPI.saveVariables(state.variables);
  const lastNameInput = dom.variablesList.querySelector('.variable-row:last-child .variable-name-input');
  lastNameInput?.focus();
});
dom.closeVariablesBtn.addEventListener('click', closeVariables);
dom.variablesOverlay.addEventListener('click', (e) => {
  if (e.target === dom.variablesOverlay) closeVariables();
});
dom.manageVariablesBtn.addEventListener('click', openVariables);
