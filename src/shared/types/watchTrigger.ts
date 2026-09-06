// The WatchTrigger schema — a saved "run this snippet whenever this file/
// folder changes" rule (storage/watchTriggers.ts + main/fileWatcher.ts).
// Same zod transform+pipe shape as every other entity in this app.
import { z } from 'zod';
import { newId } from '../id';
import { ParamValuesSchema, sanitizeParamValues } from './paramValues';

const WatchTriggerOutputSchema = z.object({
  id: z.string(),
  path: z.string(), // <=1000 chars — a file or directory, watched recursively if a directory
  snippetId: z.string(),
  debounceMs: z.number(), // >=100 — coalesces a burst of change events (e.g. a save-triggered rebuild touching many files) into one run
  enabled: z.boolean(),
  // Fixed {{placeholder}} -> value overrides for this trigger specifically —
  // see paramValues.ts's header comment. Checked before falling back to a
  // saved global variable.
  paramValues: ParamValuesSchema,
});
export type WatchTrigger = z.infer<typeof WatchTriggerOutputSchema>;

export const WatchTriggerSchema = z
  .unknown()
  .transform((raw) => {
    const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      id: String(w.id ?? newId('watch')),
      path: String(w.path ?? '').slice(0, 1000),
      snippetId: String(w.snippetId ?? ''),
      debounceMs: Number.isFinite(w.debounceMs) ? Math.max(100, Math.round(w.debounceMs as number)) : 800,
      enabled: Boolean(w.enabled),
      paramValues: sanitizeParamValues(w.paramValues),
    };
  })
  .pipe(WatchTriggerOutputSchema);
