// EditorModal.tsx — the Add/Edit snippet modal: every field, every
// sub-widget (steps list, env list, schedule type tabs, icon picker), and
// saving. Ported from modules/editor-modal.js — intentionally the biggest
// single component in the renderer, same reasoning the original gave: one
// cohesive form, splitting it further would just scatter one concern
// across files.
//
// Built on react-hook-form + zodResolver rather than the original
// useState<FormState> + a set(key, value) helper that spread the whole
// object on every keystroke — RHF's fields are uncontrolled by default
// (register() wires a plain DOM ref, no per-keystroke re-render of the
// whole form), and FormSchema below gives the three fields that used to
// return-early-and-focus on failure (name, command-or-steps) a real
// per-field error shown inline instead of nothing (there was no message at
// all before, just a silent focus() — see the old save()). Everything else
// this form does (env/expect/schedule construction, the run-after/run-before
// text-to-id resolution, the runBefore/runAfterThis cycle check) stays
// exactly as it was, just reading from RHF's validated `data` instead of
// local `form` state — those depend on the *other* snippets in the library
// at save time, which isn't something a static per-field schema can check,
// and turning them into zod rules would be new scope beyond porting the
// form's own state management.
import { useEffect } from 'react';
import { useForm, useFieldArray, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import type { ShellType, ScheduleType, Snippet, EnvVar } from '@shared/types';
import { VALID_SHELLS, VALID_SCHEDULE_TYPES } from '@shared/types';
import { newId, findDependencyCycle } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ThemedSelect } from '../shared/ThemedSelect';
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

// The form's own working shape — deliberately not the same as the persisted
// Snippet shape (numeric/JSON fields stay strings here, e.g. `expectExitCode`,
// `intervalMinutes`; `steps`/`env` are useFieldArray-shaped row objects
// rather than a plain string[]) — mapped onto real Snippet fields in
// onValid() below, the same way the original save() mapped its own
// FormState. `steps` rows wrap a bare string in `{ value }` only because
// useFieldArray requires array items to be objects (a plain string[] can't
// carry the stable per-row `id` key it needs).
const FormSchema = z
  .object({
    icon: z.string(),
    name: z.string(),
    tag: z.string(),
    cwd: z.string(),
    shell: z.enum(VALID_SHELLS),
    elevated: z.boolean(),
    notes: z.string(),
    multiStep: z.boolean(),
    steps: z.array(z.object({ value: z.string() })),
    stopOnStepError: z.boolean(),
    command: z.string(),
    background: z.boolean(),
    autoRestart: z.boolean(),
    stdinEnabled: z.boolean(),
    stdin: z.string(),
    env: z.array(z.object({ key: z.string(), value: z.string() })),
    expectExitCode: z.string(),
    expectOutput: z.string(),
    runAfterInput: z.string(),
    runBeforeInput: z.string(),
    scheduleEnabled: z.boolean(),
    scheduleType: z.enum(VALID_SCHEDULE_TYPES),
    intervalMinutes: z.string(),
    dailyTime: z.string(),
    cronExpr: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.name.trim()) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name is required' });
    }
    if (data.multiStep) {
      if (!data.steps.some((s) => s.value.trim())) {
        ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Add at least one step' });
      }
    } else if (!data.command.trim()) {
      ctx.addIssue({ code: 'custom', path: ['command'], message: 'Command is required' });
    }
  });

type FormValues = z.infer<typeof FormSchema>;

/** Two snippets can share a name (nothing enforces uniqueness) — disambiguated with its tag when that happens, same as the original. */
function displayTextFor(snippet: Snippet, candidates: Snippet[]): string {
  const isAmbiguous = candidates.filter((s) => s.name === snippet.name).length > 1;
  return isAmbiguous ? `${snippet.name} (${snippet.tag})` : snippet.name;
}

function emptyForm(): FormValues {
  return {
    icon: '', name: '', tag: '', cwd: '', shell: 'powershell', elevated: false, notes: '',
    multiStep: false, steps: [{ value: '' }, { value: '' }], stopOnStepError: false, command: '',
    background: false, autoRestart: false,
    stdinEnabled: false, stdin: '',
    env: [],
    expectExitCode: '', expectOutput: '',
    runAfterInput: '', runBeforeInput: '',
    scheduleEnabled: false, scheduleType: 'interval', intervalMinutes: '60', dailyTime: '09:00', cronExpr: '*/15 * * * *',
  };
}

function formFromSnippet(snippet: Snippet, candidates: Snippet[]): FormValues {
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
    steps: hasSteps ? snippet.steps!.map((value) => ({ value })) : [{ value: '' }, { value: '' }],
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
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: emptyForm() });
  const stepsArray = useFieldArray({ control, name: 'steps' });
  const envArray = useFieldArray({ control, name: 'env' });

  const snippets = state.snippets as Snippet[];
  const editingSnippet = editingId ? snippets.find((s) => s.id === editingId) : null;
  const candidates = snippets.filter((s) => s.id !== editingId);

  useEffect(() => {
    if (!open) return;
    reset(editingSnippet ? formFromSnippet(editingSnippet, candidates) : emptyForm());
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

  const multiStep = watch('multiStep');
  const shell = watch('shell');
  const background = watch('background');
  const stdinEnabled = watch('stdinEnabled');
  const scheduleEnabled = watch('scheduleEnabled');
  const scheduleType = watch('scheduleType');
  // A superRefine issue on the whole `steps` array (path: ['steps'], not
  // ['steps', i, ...]) lands at errors.steps.root, not errors.steps.message
  // directly — RHF's FieldErrors shape for a useFieldArray'd field reserves
  // the plain key for per-row errors and puts whole-array-level ones here.
  const stepsError = (errors.steps as { root?: { message?: string } } | undefined)?.root?.message;

  const onValid: SubmitHandler<FormValues> = (data) => {
    const name = data.name.trim();
    const tag = data.tag.trim() || 'misc';
    const cwd = data.cwd.trim() || null;
    const shell = data.shell;
    const elevated = data.elevated && shell === 'powershell';
    const icon = data.icon.trim() || null;
    const notes = data.notes.trim() || null;
    const stdin = data.stdinEnabled ? data.stdin || null : null;

    let command = '';
    let steps: string[] | null = null;
    if (data.multiStep) {
      steps = data.steps.map((s) => s.value.trim()).filter(Boolean);
      command = steps.join('\n');
    } else {
      command = data.command.trim();
    }

    const env = data.env.map((e) => ({ key: e.key.trim(), value: e.value })).filter((e) => e.key);

    const expectExitVal = data.expectExitCode.trim();
    const expectOutVal = data.expectOutput.trim();
    const expect = expectExitVal !== '' || expectOutVal ? { exitCode: expectExitVal !== '' ? Number(expectExitVal) : null, outputContains: expectOutVal || null } : null;

    const runAfterThis = resolveSnippetRef(data.runAfterInput, runAfterNameToId, '"Run after this one"');
    const runBefore = resolveSnippetRef(data.runBeforeInput, runBeforeNameToId, '"Run before this one"');
    const stopOnStepError = data.stopOnStepError;

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
    const schedule = data.scheduleEnabled
      ? {
          enabled: true,
          type: data.scheduleType,
          intervalMinutes: Number(data.intervalMinutes) || 60,
          dailyTime: data.dailyTime || '09:00',
          cronExpr: data.cronExpr.trim() || '*/15 * * * *',
          lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
        }
      : null;

    const backgroundFlag = data.background && !steps;
    const autoRestart = backgroundFlag && data.autoRestart;

    const fields = { name, tag, command, steps, cwd, shell, elevated, icon, notes, stdin, env, expect, runAfterThis, runBefore, stopOnStepError, schedule, background: backgroundFlag, autoRestart };

    if (editingId) {
      const target = snippets.find((s) => s.id === editingId);
      if (target) Object.assign(target, fields);
    } else {
      snippets.push({ id: newId('snip'), ...fields, pinned: false, runCount: 0, lastRunAt: null } as Snippet);
    }

    persistSnippets().then(() => closeModal()); // emits 'snippets-changed' — cards/tags/favorites redraw themselves
  };

  /** Focuses the first invalid field on a failed submit — RHF does this automatically for plain register()'d inputs (name, command), but `steps` errors attach to the array itself, not one row's input, so that case needs a manual focus. */
  function onInvalid(formErrors: typeof errors) {
    if (formErrors.steps) document.querySelector<HTMLInputElement>('.step-row-input')?.focus();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">{editingId ? 'Edit snippet' : 'New snippet'}</h2>

        <div className="field-row">
          <div className="field-col field-col-narrow">
            <label className="field-label" htmlFor="newIcon">Icon</label>
            <input type="text" id="newIcon" className="field-input icon-input" placeholder="Auto" maxLength={4} {...register('icon')} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="newName">Name</label>
            <input type="text" id="newName" className={'field-input' + (errors.name ? ' field-invalid' : '')} placeholder="e.g. Check listening ports" autoComplete="off" {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>
        </div>
        <div className="icon-picker">
          {ICON_PRESETS.map((emoji: string) => (
            <button type="button" key={emoji} className="icon-picker-btn" onClick={() => setValue('icon', emoji)}>
              {emoji}
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="newTag">Tag / category</label>
        <input type="text" id="newTag" className="field-input" placeholder="e.g. network" autoComplete="off" list="tagDatalist" {...register('tag')} />
        <datalist id="tagDatalist">
          {tags.map((t) => (
            <option value={t} key={t} />
          ))}
        </datalist>

        <label className="checkbox-row" htmlFor="multiStepToggle">
          <input
            type="checkbox"
            id="multiStepToggle"
            {...register('multiStep', {
              onChange: (e) => {
                const checked = e.target.checked;
                if (checked && stepsArray.fields.length === 0) stepsArray.replace([{ value: '' }, { value: '' }]);
                if (checked) setValue('background', false);
              },
            })}
          />
          <span>
            Multi-step sequence <span className="field-hint">(runs each step in order, shows per-step results)</span>
          </span>
        </label>

        {!multiStep ? (
          <div>
            <label className="field-label" htmlFor="newCommand">
              Command
              <span className="field-hint">
                {' '}
                — use <code>{'{{name}}'}</code> for a value you'll fill in before each run
              </span>
            </label>
            <textarea id="newCommand" className={'field-textarea' + (errors.command ? ' field-invalid' : '')} rows={4} placeholder="Test-NetConnection {{host}}" {...register('command')} />
            {errors.command && <span className="field-error">{errors.command.message}</span>}
          </div>
        ) : (
          <div>
            <label className="field-label">Steps</label>
            <div className="steps-list">
              {stepsArray.fields.map((field, i) => (
                <div className="step-row" key={field.id}>
                  <span className="step-row-num">{i + 1}.</span>
                  <input
                    type="text"
                    className="step-row-input"
                    placeholder="Get-Process {{name}}"
                    {...register(`steps.${i}.value` as const)}
                  />
                  <button type="button" className="step-remove-btn" title="Remove step" onClick={() => stepsArray.remove(i)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            {/* A superRefine issue on the whole `steps` array (not one row) lands under .root, not .message directly — RHF's FieldErrors shape for a useFieldArray'd field reserves the plain key for per-row errors. */}
            {stepsError && <span className="field-error">{stepsError}</span>}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => stepsArray.append({ value: '' })}>
              + Add step
            </button>
            <label className="checkbox-row" htmlFor="stopOnStepErrorToggle">
              <input type="checkbox" id="stopOnStepErrorToggle" {...register('stopOnStepError')} />
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
            <input type="text" id="newCwd" className="field-input" placeholder="C:\Projects\my-app" autoComplete="off" {...register('cwd')} />
          </div>
          <div className="field-col field-col-narrow">
            <label className="field-label" htmlFor="newShell">Shell</label>
            <Controller
              name="shell"
              control={control}
              render={({ field }) => (
                <ThemedSelect
                  id="newShell"
                  value={field.value}
                  options={SHELL_OPTIONS}
                  onChange={(value) => {
                    field.onChange(value);
                    if (value !== 'powershell') setValue('elevated', false);
                  }}
                />
              )}
            />
          </div>
        </div>

        <label className={'checkbox-row' + (shell !== 'powershell' ? ' disabled' : '')} htmlFor="newElevated" id="elevatedRow">
          <input type="checkbox" id="newElevated" disabled={shell !== 'powershell'} {...register('elevated')} />
          <span>
            Run as Administrator <span className="field-hint">(PowerShell only — triggers a UAC prompt)</span>
          </span>
        </label>

        {!multiStep && (
          <div>
            <label className="checkbox-row" htmlFor="backgroundToggle">
              <input
                type="checkbox"
                id="backgroundToggle"
                {...register('background', { onChange: (e) => { if (!e.target.checked) setValue('autoRestart', false); } })}
              />
              <span>
                Run as a background process{' '}
                <span className="field-hint">(Start/Stop a long-running process — dev server, docker compose up, tail -f — instead of run-once)</span>
              </span>
            </label>
            {background && (
              <label className="checkbox-row" htmlFor="autoRestartToggle" id="autoRestartRow">
                <input type="checkbox" id="autoRestartToggle" {...register('autoRestart')} />
                <span>
                  Restart automatically if it crashes <span className="field-hint">(gives up after 5 restarts in a row)</span>
                </span>
              </label>
            )}
          </div>
        )}

        <label className="checkbox-row" htmlFor="stdinToggle">
          <input type="checkbox" id="stdinToggle" {...register('stdinEnabled')} />
          <span>
            Provide stdin input <span className="field-hint">(piped into the command as it runs)</span>
          </span>
        </label>
        {stdinEnabled && (
          <div>
            <textarea id="newStdin" className="field-textarea" rows={2} placeholder="Text piped to the command's stdin" {...register('stdin')} />
          </div>
        )}

        <label className="field-label">
          Environment variables <span className="field-hint">(optional, added on top of the normal environment)</span>
        </label>
        <div className="env-list">
          {envArray.fields.map((field, i) => (
            <div className="env-row" key={field.id}>
              <input type="text" className="field-input env-key-input" placeholder="KEY" {...register(`env.${i}.key` as const)} />
              <input type="text" className="field-input env-value-input" placeholder="value" {...register(`env.${i}.value` as const)} />
              <button type="button" className="step-remove-btn" title="Remove" onClick={() => envArray.remove(i)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => envArray.append({ key: '', value: '' })}>
          + Add variable
        </button>

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="expectExitCode">
              Expect exit code <span className="field-hint">(optional)</span>
            </label>
            <input type="number" id="expectExitCode" className="field-input" placeholder="e.g. 0" {...register('expectExitCode')} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="expectOutput">
              Expect output contains <span className="field-hint">(optional)</span>
            </label>
            <input type="text" id="expectOutput" className="field-input" placeholder="e.g. OK" autoComplete="off" {...register('expectOutput')} />
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
          {...register('runAfterInput')}
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
          {...register('runBeforeInput')}
        />
        <datalist id="runBeforeDatalist">
          {candidates.map((s) => (
            <option value={displayTextFor(s, candidates)} key={s.id} />
          ))}
        </datalist>

        <label className="checkbox-row" htmlFor="scheduleToggle">
          <input type="checkbox" id="scheduleToggle" {...register('scheduleEnabled')} />
          <span>
            Run on a schedule <span className="field-hint">(in the background, while the app is running)</span>
          </span>
        </label>
        {scheduleEnabled && (
          <div>
            <div className="segmented" id="scheduleTypeSegmented">
              {(['interval', 'daily', 'cron'] as ScheduleType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={'segmented-btn' + (scheduleType === t ? ' active' : '')}
                  onClick={() => setValue('scheduleType', t)}
                >
                  {t === 'interval' ? 'Every N minutes' : t === 'daily' ? 'Daily at' : 'Cron'}
                </button>
              ))}
            </div>
            {scheduleType === 'interval' && (
              <div className="schedule-field-row">
                <input type="number" className="field-input" min={1} placeholder="60" {...register('intervalMinutes')} />
                <span className="field-hint">minutes</span>
              </div>
            )}
            {scheduleType === 'daily' && (
              <div className="schedule-field-row">
                <input type="time" className="field-input" {...register('dailyTime')} />
              </div>
            )}
            {scheduleType === 'cron' && (
              <div className="schedule-field-row">
                <input type="text" className="field-input" placeholder="*/15 * * * *" {...register('cronExpr')} />
                <p className="field-hint">5 fields: minute hour day-of-month month day-of-week — <code>*</code>, <code>*/n</code>, ranges and lists supported.</p>
              </div>
            )}
          </div>
        )}

        <label className="field-label" htmlFor="newNotes">
          Notes <span className="field-hint">(optional — shown expandable on the card)</span>
        </label>
        <textarea id="newNotes" className="field-textarea notes-textarea" rows={2} placeholder="Why this snippet exists, gotchas, links…" {...register('notes')} />

        <div className="modal-actions">
          <button type="button" id="cancelAddBtn" className="btn btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button type="button" id="saveAddBtn" className="btn btn-primary" onClick={handleSubmit(onValid, onInvalid)}>
            {editingId ? 'Save changes' : 'Save snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}
