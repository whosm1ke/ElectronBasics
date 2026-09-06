// The Snippet schema — the runtime AND compile-time source of truth (every
// exported type below is z.infer'd from a schema, never hand-declared) for
// src/main/storage/snippets.ts's read/write path. Used to be two
// hand-kept-in-sync definitions (this file's interfaces + sanitizeSnippet()'s
// separate backfill logic in snippets.ts) — collapsing them into one schema
// per entity is exactly what closes that gap: each entity is
// `z.unknown().transform(normalize).pipe(OutputSchema)` — the transform is
// deliberately still the exact same coercion/backfill body the old
// hand-written sanitizer had (String(x ?? '').slice(0, N), Number.isFinite
// checks, etc.), not rewritten into zod's native validators — this codebase
// tolerates genuinely malformed/hand-edited JSON by *coercing and
// defaulting*, never by rejecting it outright, and zod's own built-in
// validators (`.max()`, `.min()`, …) fail/reject rather than truncate or
// substitute a default, which is the wrong shape for that contract. The
// `.pipe(OutputSchema)` half is what makes this a *real* schema-first type
// rather than a hand-interface the transform merely promises to match: the
// output schema is the actual source `z.infer` derives the exported type
// from, and zod validates the transform's result against it at runtime too
// — a field the transform body gets wrong or forgets is a validation
// failure, not just a silent type-checker gap.
import { z } from 'zod';
import { newId } from '../id';
import { VALID_SHELLS, type ShellType } from './shell';

// ---------- EnvVar ----------

export const EnvVarSchema = z.object({
  key: z.string(), // trimmed, <=100 chars, non-empty (EnvVarListSchema drops empty-key entries)
  value: z.string(), // <=2000 chars
});
export type EnvVar = z.infer<typeof EnvVarSchema>;

const EnvVarListOutputSchema = z.array(EnvVarSchema).nullable();

/** A snippet's `env` field: null unless there's at least one entry with a non-empty key, capped at 20. */
export const EnvVarListSchema = z
  .unknown()
  .transform((env): EnvVar[] | null => {
    if (!Array.isArray(env)) return null;
    const cleaned = env
      .map((e) => ({
        key: String((e && (e as Record<string, unknown>).key) ?? '').trim().slice(0, 100),
        value: String((e && (e as Record<string, unknown>).value) ?? '').slice(0, 2000),
      }))
      .filter((e) => e.key)
      .slice(0, 20);
    return cleaned.length ? cleaned : null;
  })
  .pipe(EnvVarListOutputSchema);

// ---------- ExpectConfig ----------

export const ExpectConfigSchema = z.object({
  exitCode: z.number().nullable(),
  outputContains: z.string().nullable(), // <=500 chars
});
export type ExpectConfig = z.infer<typeof ExpectConfigSchema>;

const ExpectOutputSchema = ExpectConfigSchema.nullable();

/** A snippet's `expect` field: null unless exitCode or outputContains is meaningfully set. */
export const ExpectSchema = z
  .unknown()
  .transform((exp): ExpectConfig | null => {
    if (!exp || typeof exp !== 'object') return null;
    const e = exp as { exitCode?: unknown; outputContains?: unknown };
    const exitCode = Number.isFinite(e.exitCode) ? (e.exitCode as number) : null;
    const outputContains = typeof e.outputContains === 'string' && e.outputContains.trim() ? e.outputContains.slice(0, 500) : null;
    if (exitCode === null && !outputContains) return null;
    return { exitCode, outputContains };
  })
  .pipe(ExpectOutputSchema);

// ---------- ScheduleConfig ----------

export const VALID_SCHEDULE_TYPES = ['interval', 'daily', 'cron'] as const;
export type ScheduleType = (typeof VALID_SCHEDULE_TYPES)[number];

export const ScheduleConfigSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(VALID_SCHEDULE_TYPES),
  intervalMinutes: z.number(), // >=1
  dailyTime: z.string(), // "HH:MM", validated by /^\d{2}:\d{2}$/
  cronExpr: z.string(), // 5-field cron, <=100 chars
  lastRunAt: z.string().nullable(), // ISO timestamp
});
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

const ScheduleOutputSchema = ScheduleConfigSchema.nullable();

/** A snippet's `schedule` field: null unless the raw value is a real object; otherwise every sub-field gets its own documented default. */
export const ScheduleSchema = z
  .unknown()
  .transform((sch): ScheduleConfig | null => {
    if (!sch || typeof sch !== 'object') return null;
    const s = sch as Record<string, unknown>;
    const type = (VALID_SCHEDULE_TYPES as readonly string[]).includes(s.type as string) ? (s.type as ScheduleType) : 'interval';
    return {
      enabled: Boolean(s.enabled),
      type,
      intervalMinutes: Number.isFinite(s.intervalMinutes) ? Math.max(1, Math.round(s.intervalMinutes as number)) : 60,
      dailyTime: /^\d{2}:\d{2}$/.test((s.dailyTime as string) || '') ? (s.dailyTime as string) : '09:00',
      cronExpr: typeof s.cronExpr === 'string' && s.cronExpr.trim() ? s.cronExpr.trim().slice(0, 100) : '*/15 * * * *',
      lastRunAt: s.lastRunAt ? String(s.lastRunAt) : null,
    };
  })
  .pipe(ScheduleOutputSchema);

// ---------- Snippet ----------

const SnippetOutputSchema = z.object({
  id: z.string(),
  name: z.string(), // <=200 chars
  tag: z.string(), // <=50 chars, default 'misc'
  command: z.string(), // <=5000 chars — for multi-step snippets, steps joined for searchability
  pinned: z.boolean(),
  runCount: z.number(),
  lastRunAt: z.string().nullable(), // ISO timestamp
  cwd: z.string().nullable(), // <=1000 chars
  shell: z.enum(VALID_SHELLS),
  elevated: z.boolean(), // PowerShell only — runShellCommand errors for every other shell
  steps: z.array(z.string()).nullable(), // each <=5000 chars, max 20 steps; null (not []) when empty
  stdin: z.string().nullable(), // <=5000 chars — single-command only, sequences don't support stdin
  icon: z.string().nullable(), // <=8 chars
  notes: z.string().nullable(), // <=2000 chars
  env: EnvVarListOutputSchema, // max 20 entries
  expect: ExpectOutputSchema,
  runAfterThis: z.string().nullable(), // id of the snippet THIS one runs after (chained snippet stores the pointer)
  runBefore: z.string().nullable(), // id of a snippet to run first, every time this one runs
  stopOnStepError: z.boolean(),
  schedule: ScheduleOutputSchema,
  // `background` is forced false whenever `steps` is non-empty — a
  // long-running process is single-command only (see process-manager.ts).
  background: z.boolean(),
  autoRestart: z.boolean(), // only meaningful when background is true
});
export type Snippet = z.infer<typeof SnippetOutputSchema>;

export const SnippetSchema = z
  .unknown()
  .transform((raw) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const steps = Array.isArray(s.steps)
      ? (s.steps as unknown[]).map((step) => String(step).slice(0, 5000)).slice(0, 20).filter(Boolean)
      : null;
    return {
      id: String(s.id ?? newId('snip')),
      name: String(s.name ?? '').slice(0, 200),
      tag: String(s.tag ?? 'misc').slice(0, 50),
      command: String(s.command ?? '').slice(0, 5000),
      pinned: Boolean(s.pinned),
      runCount: Number.isFinite(s.runCount) ? (s.runCount as number) : 0,
      lastRunAt: s.lastRunAt ? String(s.lastRunAt) : null,
      cwd: s.cwd ? String(s.cwd).slice(0, 1000) : null,
      shell: (VALID_SHELLS as readonly string[]).includes(s.shell as string) ? (s.shell as ShellType) : 'powershell',
      elevated: Boolean(s.elevated),
      steps: steps && steps.length > 0 ? steps : null,
      stdin: s.stdin ? String(s.stdin).slice(0, 5000) : null,
      icon: s.icon ? String(s.icon).slice(0, 8) : null,
      notes: s.notes ? String(s.notes).slice(0, 2000) : null,
      env: EnvVarListSchema.parse(s.env),
      expect: ExpectSchema.parse(s.expect),
      runAfterThis: s.runAfterThis ? String(s.runAfterThis) : null,
      runBefore: s.runBefore ? String(s.runBefore) : null,
      stopOnStepError: Boolean(s.stopOnStepError),
      schedule: ScheduleSchema.parse(s.schedule),
      // `background`: run as a long-lived process (Start/Stop instead of a
      // one-shot Run) — only meaningful for a single-command snippet, never
      // a multi-step sequence (see process-manager.ts). `autoRestart` only
      // matters when `background` is also true.
      background: Boolean(s.background) && !(steps && steps.length > 0),
      autoRestart: Boolean(s.autoRestart),
    };
  })
  .pipe(SnippetOutputSchema);
