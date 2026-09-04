// EditorModal.tsx — the Add/Edit snippet modal: every field, every
// sub-widget (steps list, env list, schedule type tabs, icon picker), and
// saving. Ported from modules/editor-modal.js — intentionally the biggest
// single component in the renderer, same reasoning the original gave: one
// cohesive form, splitting it further would just scatter one concern
// across files. Field state is local (useState), reset from the target
// snippet each time the modal opens (see the useEffect below) — this is
// the React-idiomatic replacement for the original's "populate every dom.*
// field on open" imperative reset.
import { useEffect, useState } from 'react';
import type { ShellType, ScheduleType, Snippet, EnvVar } from '@shared/types';
import { iconSvg } from '../../lib/icons';
import { newId, findDependencyCycle } from '../../lib/utils';
import { showToast } from '../../store/useToastStore';
import { useEditorStore, closeModal } from '../../store/useEditorStore';
import { state, ICON_PRESETS } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';

const SHELL_OPTIONS: { value: ShellType; label: string }[] = [
  { value: 'powershell', label: 'PowerShell' },
  { value: 'cmd', label: 'CMD' },
  { value: 'gitbash', label: 'Git Bash' },
  { value: 'wsl', label: 'WSL' },
  { value: 'node', label: 'Node.js' },
  { value: 'python', label: 'Python' },
];

interface FormState {
  icon: string;
  name: string;
  tag: string;
  cwd: string;
  shell: ShellType;
  elevated: boolean;
  notes: string;
  multiStep: boolean;
  steps: string[];
  stopOnStepError: boolean;
  command: string;
  background: boolean;
  autoRestart: boolean;
  stdinEnabled: boolean;
  stdin: string;
  env: EnvVar[];
  expectExitCode: string;
  expectOutput: string;
  runAfterInput: string;
  runBeforeInput: string;
  scheduleEnabled: boolean;
  scheduleType: ScheduleType;
  intervalMinutes: string;
  dailyTime: string;
  cronExpr: string;
}

/** Two snippets can share a name (nothing enforces uniqueness) — disambiguated with its tag when that happens, same as the original. */
function displayTextFor(snippet: Snippet, candidates: Snippet[]): string {
  const isAmbiguous = candidates.filter((s) => s.name === snippet.name).length > 1;
  return isAmbiguous ? `${snippet.name} (${snippet.tag})` : snippet.name;
}

function emptyForm(): FormState {
  return {
    icon: '', name: '', tag: '', cwd: '', shell: 'powershell', elevated: false, notes: '',
    multiStep: false, steps: ['', ''], stopOnStepError: false, command: '',
    background: false, autoRestart: false,
    stdinEnabled: false, stdin: '',
    env: [],
    expectExitCode: '', expectOutput: '',
    runAfterInput: '', runBeforeInput: '',
    scheduleEnabled: false, scheduleType: 'interval', intervalMinutes: '60', dailyTime: '09:00', cronExpr: '*/15 * * * *',
  };
}

function formFromSnippet(snippet: Snippet, candidates: Snippet[]): FormState {
  const hasSteps = Boolean(snippet.steps && snippet.steps.length);
  const afterTarget = snippet.runAfterThis ? candidates.find((s) => s.id === snippet.runAfterThis) : null;
  const beforeTarget = snippet.runBefore ? candidates.find((s) => s.id === snippet.runBefore) : null;
  return {
    icon: snippet.icon || '',
    name: snippet.name,
    tag: snippet.tag,
    cwd: snippet.cwd || '',
    shell: snippet.shell,
    elevated: Boolean(snippet.elevated) && snippet.shell === 'powershell',
    notes: snippet.notes || '',
    multiStep: hasSteps,
    steps: hasSteps ? snippet.steps! : ['', ''],
    stopOnStepError: Boolean(snippet.stopOnStepError),
    command: hasSteps ? '' : snippet.command,
    background: Boolean(snippet.background) && !hasSteps,
    autoRestart: Boolean(snippet.autoRestart),
    stdinEnabled: Boolean(snippet.stdin),
    stdin: snippet.stdin || '',
    env: snippet.env || [],
    expectExitCode: snippet.expect && snippet.expect.exitCode !== null ? String(snippet.expect.exitCode) : '',
    expectOutput: (snippet.expect && snippet.expect.outputContains) || '',
    runAfterInput: afterTarget ? displayTextFor(afterTarget, candidates) : '',
    runBeforeInput: beforeTarget ? displayTextFor(beforeTarget, candidates) : '',
    scheduleEnabled: Boolean(snippet.schedule && snippet.schedule.enabled),
    scheduleType: (snippet.schedule && snippet.schedule.type) || 'interval',
    intervalMinutes: String((snippet.schedule && snippet.schedule.intervalMinutes) || 60),
    dailyTime: (snippet.schedule && snippet.schedule.dailyTime) || '09:00',
    cronExpr: (snippet.schedule && snippet.schedule.cronExpr) || '*/15 * * * *',
  };
}

/** Resolves a Run before/after input's typed text back to a snippet id, tolerating a case mismatch (hand-typed rather than picked from the datalist); toasts and returns null for unrecognized text. */
function resolveSnippetRef(typed: string, nameToId: Map<string, string>, fieldLabel: string): string | null {
  const trimmed = typed.trim();
  if (!trimmed) return null;
  if (nameToId.has(trimmed)) return nameToId.get(trimmed)!;
  const lower = trimmed.toLowerCase();
  for (const [text, id] of nameToId) {
    if (text.toLowerCase() === lower) return id;
  }
  showToast(`"${trimmed}" doesn't match any snippet — ${fieldLabel} left empty`, 'error');
  return null;
}

export function EditorModal() {
  const { open, editingId } = useEditorStore();
  const [form, setForm] = useState<FormState>(emptyForm);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const snippets = state.snippets as Snippet[];
  const editingSnippet = editingId ? snippets.find((s) => s.id === editingId) : null;
  const candidates = snippets.filter((s) => s.id !== editingId);

  useEffect(() => {
    if (!open) return;
    setForm(editingSnippet ? formFromSnippet(editingSnippet, candidates) : emptyForm());
    setTimeout(() => document.getElementById('newName')?.focus(), 0);
    // Only reset when the modal transitions open/closed or which snippet is
    // being edited changes — not on every candidates/editingSnippet
    // recompute (those are derived fresh every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  if (!open) return null;

  const tags = Array.from(new Set(snippets.map((s) => s.tag))).sort();
  const runAfterNameToId = new Map(candidates.map((s) => [displayTextFor(s, candidates), s.id]));
  const runBeforeNameToId = runAfterNameToId; // same candidate set, same display text

  function save() {
    const name = form.name.trim();
    const tag = form.tag.trim() || 'misc';
    const cwd = form.cwd.trim() || null;
    const shell = form.shell;
    const elevated = form.elevated && shell === 'powershell';
    const icon = form.icon.trim() || null;
    const notes = form.notes.trim() || null;
    const stdin = form.stdinEnabled ? form.stdin || null : null;

    if (!name) {
      document.getElementById('newName')?.focus();
      return;
    }

    let command = '';
    let steps: string[] | null = null;
    if (form.multiStep) {
      steps = form.steps.map((s) => s.trim()).filter(Boolean);
      if (steps.length === 0) {
        document.querySelector<HTMLInputElement>('.step-row-input')?.focus();
        return;
      }
      command = steps.join('\n');
    } else {
      command = form.command.trim();
      if (!command) {
        document.getElementById('newCommand')?.focus();
        return;
      }
    }

    const env = form.env.map((e) => ({ key: e.key.trim(), value: e.value })).filter((e) => e.key);

    const expectExitVal = form.expectExitCode.trim();
    const expectOutVal = form.expectOutput.trim();
    const expect = expectExitVal !== '' || expectOutVal ? { exitCode: expectExitVal !== '' ? Number(expectExitVal) : null, outputContains: expectOutVal || null } : null;

    const runAfterThis = resolveSnippetRef(form.runAfterInput, runAfterNameToId, '"Run after this one"');
    const runBefore = resolveSnippetRef(form.runBeforeInput, runBeforeNameToId, '"Run before this one"');
    const stopOnStepError = form.stopOnStepError;

    // A brand-new snippet can never be part of a cycle (nothing existing can
    // point at an id that doesn't exist yet) — only check when editing.
    if (editingId) {
      const scratch = snippets.map((s) => (s.id === editingId ? { id: s.id, runAfterThis, runBefore } : { id: s.id, runAfterThis: s.runAfterThis, runBefore: s.runBefore }));
      const cycle = findDependencyCycle(scratch);
      if (cycle) {
        const names = cycle.map((id) => (id === editingId ? name : snippets.find((s) => s.id === id)?.name || id));
        showToast(`Can't save — "Run before"/"Run after this one" would create a loop: ${names.join(' → ')}`, 'error');
        return;
      }
    }

    const existingSchedule = editingId ? snippets.find((s) => s.id === editingId)?.schedule : null;
    const schedule = form.scheduleEnabled
      ? {
          enabled: true,
          type: form.scheduleType,
          intervalMinutes: Number(form.intervalMinutes) || 60,
          dailyTime: form.dailyTime || '09:00',
          cronExpr: form.cronExpr.trim() || '*/15 * * * *',
          lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
        }
      : null;

    const background = form.background && !steps;
    const autoRestart = background && form.autoRestart;

    const fields = { name, tag, command, steps, cwd, shell, elevated, icon, notes, stdin, env, expect, runAfterThis, runBefore, stopOnStepError, schedule, background, autoRestart };

    if (editingId) {
      const target = snippets.find((s) => s.id === editingId);
      if (target) Object.assign(target, fields);
    } else {
      snippets.push({ id: newId('snip'), ...fields, pinned: false, runCount: 0, lastRunAt: null } as Snippet);
    }

    persistSnippets().then(() => closeModal()); // emits 'snippets-changed' — cards/tags/favorites redraw themselves
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">{editingId ? 'Edit snippet' : 'New snippet'}</h2>

        <div className="field-row">
          <div className="field-col field-col-narrow">
            <label className="field-label" htmlFor="newIcon">Icon</label>
            <input type="text" id="newIcon" className="field-input icon-input" placeholder="Auto" maxLength={4} value={form.icon} onChange={(e) => set('icon', e.target.value)} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="newName">Name</label>
            <input type="text" id="newName" className="field-input" placeholder="e.g. Check listening ports" autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
        </div>
        <div className="icon-picker">
          {ICON_PRESETS.map((emoji: string) => (
            <button type="button" key={emoji} className="icon-picker-btn" onClick={() => set('icon', emoji)}>
              {emoji}
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="newTag">Tag / category</label>
        <input type="text" id="newTag" className="field-input" placeholder="e.g. network" autoComplete="off" list="tagDatalist" value={form.tag} onChange={(e) => set('tag', e.target.value)} />
        <datalist id="tagDatalist">
          {tags.map((t) => (
            <option value={t} key={t} />
          ))}
        </datalist>

        <label className="checkbox-row" htmlFor="multiStepToggle">
          <input
            type="checkbox"
            id="multiStepToggle"
            checked={form.multiStep}
            onChange={(e) => {
              const checked = e.target.checked;
              setForm((f) => ({ ...f, multiStep: checked, steps: checked && f.steps.length === 0 ? ['', ''] : f.steps, background: checked ? false : f.background }));
            }}
          />
          <span>
            Multi-step sequence <span className="field-hint">(runs each step in order, shows per-step results)</span>
          </span>
        </label>

        {!form.multiStep ? (
          <div>
            <label className="field-label" htmlFor="newCommand">
              Command
              <span className="field-hint">
                {' '}
                — use <code>{'{{name}}'}</code> for a value you'll fill in before each run
              </span>
            </label>
            <textarea id="newCommand" className="field-textarea" rows={4} placeholder="Test-NetConnection {{host}}" value={form.command} onChange={(e) => set('command', e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="field-label">Steps</label>
            <div className="steps-list">
              {form.steps.map((step, i) => (
                <div className="step-row" key={i}>
                  <span className="step-row-num">{i + 1}.</span>
                  <input
                    type="text"
                    className="step-row-input"
                    placeholder="Get-Process {{name}}"
                    value={step}
                    onChange={(e) => {
                      const steps = [...form.steps];
                      steps[i] = e.target.value;
                      set('steps', steps);
                    }}
                  />
                  <button
                    type="button"
                    className="step-remove-btn"
                    title="Remove step"
                    dangerouslySetInnerHTML={{ __html: iconSvg('trash') }}
                    onClick={() => set('steps', form.steps.filter((_, idx) => idx !== i))}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => set('steps', [...form.steps, ''])}>
              + Add step
            </button>
            <label className="checkbox-row" htmlFor="stopOnStepErrorToggle">
              <input type="checkbox" id="stopOnStepErrorToggle" checked={form.stopOnStepError} onChange={(e) => set('stopOnStepError', e.target.checked)} />
              <span>
                Stop if a step fails <span className="field-hint">(otherwise every step runs regardless)</span>
              </span>
            </label>
          </div>
        )}

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="newCwd">
              Working directory <span className="field-hint">(optional)</span>
            </label>
            <input type="text" id="newCwd" className="field-input" placeholder="C:\Projects\my-app" autoComplete="off" value={form.cwd} onChange={(e) => set('cwd', e.target.value)} />
          </div>
          <div className="field-col field-col-narrow">
            <label className="field-label" htmlFor="newShell">Shell</label>
            <div className="select-wrap">
              <select
                id="newShell"
                className="field-input"
                value={form.shell}
                onChange={(e) => {
                  const shell = e.target.value as ShellType;
                  setForm((f) => ({ ...f, shell, elevated: shell === 'powershell' ? f.elevated : false }));
                }}
              >
                {SHELL_OPTIONS.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <svg className="select-chevron" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        <label className={'checkbox-row' + (form.shell !== 'powershell' ? ' disabled' : '')} htmlFor="newElevated" id="elevatedRow">
          <input type="checkbox" id="newElevated" checked={form.elevated} disabled={form.shell !== 'powershell'} onChange={(e) => set('elevated', e.target.checked)} />
          <span>
            Run as Administrator <span className="field-hint">(PowerShell only — triggers a UAC prompt)</span>
          </span>
        </label>

        {!form.multiStep && (
          <div>
            <label className="checkbox-row" htmlFor="backgroundToggle">
              <input
                type="checkbox"
                id="backgroundToggle"
                checked={form.background}
                onChange={(e) => setForm((f) => ({ ...f, background: e.target.checked, autoRestart: e.target.checked ? f.autoRestart : false }))}
              />
              <span>
                Run as a background process{' '}
                <span className="field-hint">(Start/Stop a long-running process — dev server, docker compose up, tail -f — instead of run-once)</span>
              </span>
            </label>
            {form.background && (
              <label className="checkbox-row" htmlFor="autoRestartToggle" id="autoRestartRow">
                <input type="checkbox" id="autoRestartToggle" checked={form.autoRestart} onChange={(e) => set('autoRestart', e.target.checked)} />
                <span>
                  Restart automatically if it crashes <span className="field-hint">(gives up after 5 restarts in a row)</span>
                </span>
              </label>
            )}
          </div>
        )}

        <label className="checkbox-row" htmlFor="stdinToggle">
          <input type="checkbox" id="stdinToggle" checked={form.stdinEnabled} onChange={(e) => set('stdinEnabled', e.target.checked)} />
          <span>
            Provide stdin input <span className="field-hint">(piped into the command as it runs)</span>
          </span>
        </label>
        {form.stdinEnabled && (
          <div>
            <textarea id="newStdin" className="field-textarea" rows={2} placeholder="Text piped to the command's stdin" value={form.stdin} onChange={(e) => set('stdin', e.target.value)} />
          </div>
        )}

        <label className="field-label">
          Environment variables <span className="field-hint">(optional, added on top of the normal environment)</span>
        </label>
        <div className="env-list">
          {form.env.map((row, i) => (
            <div className="env-row" key={i}>
              <input
                type="text"
                className="field-input env-key-input"
                placeholder="KEY"
                value={row.key}
                onChange={(e) => {
                  const env = [...form.env];
                  env[i] = { ...env[i], key: e.target.value };
                  set('env', env);
                }}
              />
              <input
                type="text"
                className="field-input env-value-input"
                placeholder="value"
                value={row.value}
                onChange={(e) => {
                  const env = [...form.env];
                  env[i] = { ...env[i], value: e.target.value };
                  set('env', env);
                }}
              />
              <button type="button" className="step-remove-btn" title="Remove" dangerouslySetInnerHTML={{ __html: iconSvg('trash') }} onClick={() => set('env', form.env.filter((_, idx) => idx !== i))} />
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => set('env', [...form.env, { key: '', value: '' }])}>
          + Add variable
        </button>

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="expectExitCode">
              Expect exit code <span className="field-hint">(optional)</span>
            </label>
            <input type="number" id="expectExitCode" className="field-input" placeholder="e.g. 0" value={form.expectExitCode} onChange={(e) => set('expectExitCode', e.target.value)} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="expectOutput">
              Expect output contains <span className="field-hint">(optional)</span>
            </label>
            <input type="text" id="expectOutput" className="field-input" placeholder="e.g. OK" autoComplete="off" value={form.expectOutput} onChange={(e) => set('expectOutput', e.target.value)} />
          </div>
        </div>

        <label className="field-label" htmlFor="runAfterInput">
          Run after this one <span className="field-hint">(auto-runs once this snippet succeeds — type a snippet name)</span>
        </label>
        <input
          type="text"
          id="runAfterInput"
          className="field-input"
          placeholder="Start typing a snippet name…"
          autoComplete="off"
          list="runAfterDatalist"
          value={form.runAfterInput}
          onChange={(e) => set('runAfterInput', e.target.value)}
        />
        <datalist id="runAfterDatalist">
          {candidates.map((s) => (
            <option value={displayTextFor(s, candidates)} key={s.id} />
          ))}
        </datalist>

        <label className="field-label" htmlFor="runBeforeInput">
          Run before this one <span className="field-hint">(runs first, every time this snippet runs; skipped if it fails — type a snippet name)</span>
        </label>
        <input
          type="text"
          id="runBeforeInput"
          className="field-input"
          placeholder="Start typing a snippet name…"
          autoComplete="off"
          list="runBeforeDatalist"
          value={form.runBeforeInput}
          onChange={(e) => set('runBeforeInput', e.target.value)}
        />
        <datalist id="runBeforeDatalist">
          {candidates.map((s) => (
            <option value={displayTextFor(s, candidates)} key={s.id} />
          ))}
        </datalist>

        <label className="checkbox-row" htmlFor="scheduleToggle">
          <input type="checkbox" id="scheduleToggle" checked={form.scheduleEnabled} onChange={(e) => set('scheduleEnabled', e.target.checked)} />
          <span>
            Run on a schedule <span className="field-hint">(in the background, while the app is running)</span>
          </span>
        </label>
        {form.scheduleEnabled && (
          <div>
            <div className="segmented" id="scheduleTypeSegmented">
              {(['interval', 'daily', 'cron'] as ScheduleType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={'segmented-btn' + (form.scheduleType === t ? ' active' : '')}
                  onClick={() => set('scheduleType', t)}
                >
                  {t === 'interval' ? 'Every N minutes' : t === 'daily' ? 'Daily at' : 'Cron'}
                </button>
              ))}
            </div>
            {form.scheduleType === 'interval' && (
              <div className="schedule-field-row">
                <input type="number" className="field-input" min={1} placeholder="60" value={form.intervalMinutes} onChange={(e) => set('intervalMinutes', e.target.value)} />
                <span className="field-hint">minutes</span>
              </div>
            )}
            {form.scheduleType === 'daily' && (
              <div className="schedule-field-row">
                <input type="time" className="field-input" value={form.dailyTime} onChange={(e) => set('dailyTime', e.target.value)} />
              </div>
            )}
            {form.scheduleType === 'cron' && (
              <div className="schedule-field-row">
                <input type="text" className="field-input" placeholder="*/15 * * * *" value={form.cronExpr} onChange={(e) => set('cronExpr', e.target.value)} />
                <p className="field-hint">5 fields: minute hour day-of-month month day-of-week — <code>*</code>, <code>*/n</code>, ranges and lists supported.</p>
              </div>
            )}
          </div>
        )}

        <label className="field-label" htmlFor="newNotes">
          Notes <span className="field-hint">(optional — shown expandable on the card)</span>
        </label>
        <textarea id="newNotes" className="field-textarea notes-textarea" rows={2} placeholder="Why this snippet exists, gotchas, links…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

        <div className="modal-actions">
          <button type="button" id="cancelAddBtn" className="btn btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button type="button" id="saveAddBtn" className="btn btn-primary" onClick={save}>
            {editingId ? 'Save changes' : 'Save snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}
