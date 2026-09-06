// paramValues.ts — a small set of fixed {{placeholder}} -> value overrides,
// attached to a schedule or a file-watch trigger. Lets an unattended run be
// parameterized once, at configuration time, without requiring a saved
// GLOBAL variable for every value — the two aren't mutually exclusive:
// unattendedRun.ts's substituteWithVariables() checks a context's own
// paramValues first and only falls back to a matching global variable for
// whatever name isn't set here. Kept as its own tiny file (not folded into
// snippet.ts or watchTrigger.ts) since both of those, plus Pipeline's own
// schedule (pipeline.ts, via ScheduleConfigSchema), need the identical
// shape/sanitizer.
import { z } from 'zod';

export const ParamValuesSchema = z.record(z.string(), z.string()).nullable();
export type ParamValues = z.infer<typeof ParamValuesSchema>;

const MAX_ENTRIES = 20;
const MAX_KEY_LEN = 100;
const MAX_VALUE_LEN = 2000;

/** Backfill/coercion for an untrusted `paramValues` field — same "never reject, always coerce" contract as every other schema in this app. Empty/invalid input becomes `null`, not `{}` — so "no overrides set" is a single, cheap-to-check falsy value everywhere this is read. */
export function sanitizeParamValues(raw: unknown): ParamValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.trim() || typeof v !== 'string') continue;
    entries.push([k.trim().slice(0, MAX_KEY_LEN), v.slice(0, MAX_VALUE_LEN)]);
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
