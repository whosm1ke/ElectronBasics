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
import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import type { ShellType, ScheduleType, Snippet, EnvVar } from '@shared/types';
import { VALID_SHELLS, VALID_SCHEDULE_TYPES } from '@shared/types';
import { newId, findDependencyCycle, extractPlaceholders } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ThemedSelect } from '../shared/ThemedSelect';
import { ThemedCombobox } from '../shared/ThemedCombobox';
import { SnippetPickerField } from '../shared/SnippetPicker';
import { InfoHint } from '../shared/InfoHint';
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
  { value: 'ssh', label: 'SSH' },
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
    captures: z.array(z.object({ variable: z.string(), pattern: z.string() })),
    sshHost: z.string(),
    sshPort: z.string(),
    sshUsername: z.string(),
    sshIdentityFile: z.string(),
    expectExitCode: z.string(),
    expectOutput: z.string(),
    runAfterId: z.string(),
    runBeforeId: z.string(),
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

function emptyForm(): FormValues {
  return {
    icon: '', name: '', tag: '', cwd: '', shell: 'powershell', elevated: false, notes: '',
    multiStep: false, steps: [{ value: '' }, { value: '' }], stopOnStepError: false, command: '',
    background: false, autoRestart: false,
    stdinEnabled: false, stdin: '',
    env: [],
    captures: [],
    sshHost: '', sshPort: '22', sshUsername: '', sshIdentityFile: '',
    expectExitCode: '', expectOutput: '',
    runAfterId: '', runBeforeId: '',
    scheduleEnabled: false, scheduleType: 'interval', intervalMinutes: '60', dailyTime: '09:00', cronExpr: '*/15 * * * *',
  };
}

function formFromSnippet(snippet: Snippet, candidates: Snippet[]): FormValues {
  const hasSteps = Boolean(snippet.steps && snippet.steps.length);
  // Only keep the reference if its target still actually exists among the
  // candidates (self excluded) — a stale id from a deleted snippet should
  // show as "not set," not silently persist forward on the next save.
  const runAfterId = snippet.runAfterThis && candidates.some((s) => s.id === snippet.runAfterThis) ? snippet.runAfterThis : '';
  const runBeforeId = snippet.runBefore && candidates.some((s) => s.id === snippet.runBefore) ? snippet.runBefore : '';
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
    captures: snippet.captures || [],
    sshHost: snippet.ssh?.host || '',
    sshPort: String(snippet.ssh?.port || 22),
    sshUsername: snippet.ssh?.username || '',
    sshIdentityFile: snippet.ssh?.identityFile || '',
    expectExitCode: snippet.expect && snippet.expect.exitCode !== null ? String(snippet.expect.exitCode) : '',
    expectOutput: (snippet.expect && snippet.expect.outputContains) || '',
    runAfterId,
    runBeforeId,
    scheduleEnabled: Boolean(snippet.schedule && snippet.schedule.enabled),
    scheduleType: (snippet.schedule && snippet.schedule.type) || 'interval',
    intervalMinutes: String((snippet.schedule && snippet.schedule.intervalMinutes) || 60),
    dailyTime: (snippet.schedule && snippet.schedule.dailyTime) || '09:00',
    cronExpr: (snippet.schedule && snippet.schedule.cronExpr) || '*/15 * * * *',
  };
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
  const capturesArray = useFieldArray({ control, name: 'captures' });

  // Fixed {{placeholder}} -> value overrides for THIS snippet's own
  // schedule (see @shared/types/paramValues.ts) — not a react-hook-form
  // field since its row set tracks whatever placeholders are actually
  // typed into command/steps right now, not a fixed-shape array the way
  // env/captures are. Keyed by placeholder name; a name with no entry (or
  // a blank one) falls back to a matching saved global variable at run time.
  const [scheduleParamValues, setScheduleParamValues] = useState<Record<string, string>>({});

  const snippets = state.snippets as Snippet[];
  const editingSnippet = editingId ? snippets.find((s) => s.id === editingId) : null;
  const candidates = snippets.filter((s) => s.id !== editingId);

  useEffect(() => {
    if (!open) return;
    reset(editingSnippet ? formFromSnippet(editingSnippet, candidates) : emptyForm());
    setScheduleParamValues(editingSnippet?.schedule?.paramValues || {});
    setTimeout(() => document.getElementById('newName')?.focus(), 0);
    // Only reset when the modal transitions open/closed or which snippet is
    // being edited changes — not on every candidates/editingSnippet
    // recompute (those are derived fresh every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  if (!open) return null;

  const tags = Array.from(new Set(snippets.map((s) => s.tag))).sort();

  const multiStep = watch('multiStep');
  const shell = watch('shell');
  const background = watch('background');
  const stdinEnabled = watch('stdinEnabled');
  const scheduleEnabled = watch('scheduleEnabled');
  const scheduleType = watch('scheduleType');
  const watchedCommand = watch('command');
  const watchedSteps = watch('steps');
  // Union of both, regardless of the multiStep toggle's current position —
  // simpler than branching on `multiStep` here, and harmless: whichever
  // field isn't actually used at submit time just contributes no names.
  const schedulePlaceholderNames = extractPlaceholders([watchedCommand, ...watchedSteps.map((s) => s.value)].join('\n'));
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
    const captures = data.captures.map((c) => ({ variable: c.variable.trim(), pattern: c.pattern.trim() })).filter((c) => c.variable && c.pattern);
    const ssh = shell === 'ssh' && data.sshHost.trim()
      ? { host: data.sshHost.trim(), port: Number(data.sshPort) || 22, username: data.sshUsername.trim(), identityFile: data.sshIdentityFile.trim() || null }
      : null;

    const expectExitVal = data.expectExitCode.trim();
    const expectOutVal = data.expectOutput.trim();
    const expect = expectExitVal !== '' || expectOutVal ? { exitCode: expectExitVal !== '' ? Number(expectExitVal) : null, outputContains: expectOutVal || null } : null;

    const runAfterThis = data.runAfterId || null;
    const runBefore = data.runBeforeId || null;
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
    // Only keep an override for a placeholder this snippet's final command
    // actually uses, with a non-blank value — a blank row means "fall back
    // to a global variable," not "set it to the empty string."
    const finalPlaceholderNames = extractPlaceholders(command);
    const paramValuesEntries = Object.entries(scheduleParamValues).filter(([k, v]) => finalPlaceholderNames.includes(k) && v.trim() !== '');
    const schedule = data.scheduleEnabled
      ? {
          enabled: true,
          type: data.scheduleType,
          intervalMinutes: Number(data.intervalMinutes) || 60,
          dailyTime: data.dailyTime || '09:00',
          cronExpr: data.cronExpr.trim() || '*/15 * * * *',
          lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
          paramValues: paramValuesEntries.length > 0 ? Object.fromEntries(paramValuesEntries) : null,
        }
      : null;

    const backgroundFlag = data.background && !steps;
    const autoRestart = backgroundFlag && data.autoRestart;

    const fields = { name, tag, command, steps, cwd, shell, elevated, icon, notes, stdin, env, expect, runAfterThis, runBefore, stopOnStepError, schedule, background: backgroundFlag, autoRestart, captures: captures.length ? captures : null, ssh };

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
        <Controller
          name="tag"
          control={control}
          render={({ field }) => (
            <ThemedCombobox
              id="newTag"
              placeholder="e.g. network"
              value={field.value}
              onChange={field.onChange}
              options={tags.map((t) => ({ value: t, label: t }))}
              emptyLabel="No matching tags — type to create a new one"
            />
          )}
        />

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
          <span title="Runs each step in order, shows per-step results">Multi-step sequence</span>
        </label>

        {!multiStep ? (
          <div>
            <label className="field-label" htmlFor="newCommand" title="Use {{name}} for a value you'll fill in before each run">
              Command
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
            <label className="checkbox-row" htmlFor="stopOnStepErrorToggle" title="Otherwise every step runs regardless">
              <input type="checkbox" id="stopOnStepErrorToggle" {...register('stopOnStepError')} />
              <span>Stop if a step fails</span>
            </label>
          </div>
        )}

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="newCwd" title="Optional">
              Working directory
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

        <label className={'checkbox-row' + (shell !== 'powershell' ? ' disabled' : '')} htmlFor="newElevated" id="elevatedRow" title="PowerShell only — triggers a UAC prompt">
          <input type="checkbox" id="newElevated" disabled={shell !== 'powershell'} {...register('elevated')} />
          <span>Run as Administrator</span>
        </label>

        {shell === 'ssh' && (
          <div className="ssh-fields">
            <div className="field-row">
              <div className="field-col">
                <label className="field-label" htmlFor="sshHost">Host</label>
                <input type="text" id="sshHost" className="field-input" placeholder="example.com" autoComplete="off" {...register('sshHost')} />
              </div>
              <div className="field-col field-col-narrow">
                <label className="field-label" htmlFor="sshPort">Port</label>
                <input type="number" id="sshPort" className="field-input" placeholder="22" {...register('sshPort')} />
              </div>
            </div>
            <div className="field-row">
              <div className="field-col">
                <label className="field-label" htmlFor="sshUsername">Username</label>
                <input type="text" id="sshUsername" className="field-input" placeholder="deploy" autoComplete="off" {...register('sshUsername')} />
              </div>
              <div className="field-col">
                <label className="field-label" htmlFor="sshIdentityFile" title="Optional — falls back to ssh's own default/agent">
                  Identity file
                </label>
                <input type="text" id="sshIdentityFile" className="field-input" placeholder="C:\Users\me\.ssh\id_ed25519" autoComplete="off" {...register('sshIdentityFile')} />
              </div>
            </div>
          </div>
        )}

        {!multiStep && (
          <div>
            <label
              className="checkbox-row"
              htmlFor="backgroundToggle"
              title="Start/Stop a long-running process — dev server, docker compose up, tail -f — instead of run-once"
            >
              <input
                type="checkbox"
                id="backgroundToggle"
                {...register('background', { onChange: (e) => { if (!e.target.checked) setValue('autoRestart', false); } })}
              />
              <span>Run as a background process</span>
            </label>
            {background && (
              <label className="checkbox-row" htmlFor="autoRestartToggle" id="autoRestartRow" title="Gives up after 5 restarts in a row">
                <input type="checkbox" id="autoRestartToggle" {...register('autoRestart')} />
                <span>Restart automatically if it crashes</span>
              </label>
            )}
          </div>
        )}

        <label className="checkbox-row" htmlFor="stdinToggle" title="Piped into the command as it runs">
          <input type="checkbox" id="stdinToggle" {...register('stdinEnabled')} />
          <span>Provide stdin input</span>
        </label>
        {stdinEnabled && (
          <div>
            <textarea id="newStdin" className="field-textarea" rows={2} placeholder="Text piped to the command's stdin" {...register('stdin')} />
          </div>
        )}

        <label className="field-label" title="Optional, added on top of the normal environment">Environment variables</label>
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

        <label className="field-label" title="Optional — extracts a value into a global variable after each run">Capture from output</label>
        <div className="env-list">
          {capturesArray.fields.map((field, i) => (
            <div className="env-row" key={field.id}>
              <input type="text" className="field-input env-key-input" placeholder="variable name" {...register(`captures.${i}.variable` as const)} />
              <input type="text" className="field-input env-value-input" placeholder="regex, e.g. id: (\w+)" {...register(`captures.${i}.pattern` as const)} />
              <button type="button" className="step-remove-btn" title="Remove" onClick={() => capturesArray.remove(i)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => capturesArray.append({ variable: '', pattern: '' })}>
          + Add capture
        </button>

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="expectExitCode" title="Optional">
              Expect exit code
            </label>
            <input type="number" id="expectExitCode" className="field-input" placeholder="e.g. 0" {...register('expectExitCode')} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="expectOutput" title="Optional">
              Expect output contains
            </label>
            <input type="text" id="expectOutput" className="field-input" placeholder="e.g. OK" autoComplete="off" {...register('expectOutput')} />
          </div>
        </div>

        <label className="field-label" title="Auto-runs once this snippet succeeds">
          Run after this one
        </label>
        <Controller
          name="runAfterId"
          control={control}
          render={({ field }) => (
            <SnippetPickerField value={field.value} onChange={field.onChange} snippets={candidates} placeholder="Not set" emptyLabel="No other snippets yet" clearable />
          )}
        />

        <label className="field-label" title="Runs first, every time this snippet runs; skipped if it fails">
          Run before this one
        </label>
        <Controller
          name="runBeforeId"
          control={control}
          render={({ field }) => (
            <SnippetPickerField value={field.value} onChange={field.onChange} snippets={candidates} placeholder="Not set" emptyLabel="No other snippets yet" clearable />
          )}
        />

        <label className="checkbox-row" htmlFor="scheduleToggle" title="In the background, while the app is running">
          <input type="checkbox" id="scheduleToggle" {...register('scheduleEnabled')} />
          <span>Run on a schedule</span>
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
            {schedulePlaceholderNames.length > 0 && (
              <>
                <label className="field-label">
                  Fixed values for this schedule{' '}
                  <InfoHint text="Optional, per-placeholder — checked before falling back to a saved global variable. Leave a value blank to keep using the global variable of the same name." />
                </label>
                <div className="env-list">
                  {schedulePlaceholderNames.map((paramName) => (
                    <div className="env-row" key={paramName}>
                      <span className="schedule-param-name">{`{{${paramName}}}`}</span>
                      <input
                        type="text"
                        className="field-input env-value-input"
                        placeholder="uses a global variable if left blank"
                        value={scheduleParamValues[paramName] || ''}
                        onChange={(e) => setScheduleParamValues((prev) => ({ ...prev, [paramName]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <label className="field-label" htmlFor="newNotes" title="Optional — shown expandable on the card">
          Notes
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
