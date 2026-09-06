// The Variable schema — the runtime AND compile-time source of truth (the
// Variable type is z.infer'd from it) for src/main/storage/variables.ts's
// read/write path. See snippet.ts's header comment for why this is a zod
// schema (transform + .pipe(OutputSchema)) rather than a hand-interface + a
// separate sanitizer function.
import { z } from 'zod';
import { newId } from '../id';

export const VALID_COMPUTED_REFRESH_MODES = ['manual', 'interval'] as const;
export type ComputedRefreshMode = (typeof VALID_COMPUTED_REFRESH_MODES)[number];

const ComputedConfigOutputSchema = z.object({
  snippetId: z.string(),
  refreshMode: z.enum(VALID_COMPUTED_REFRESH_MODES),
  intervalMinutes: z.number(), // 'interval' only, >=1
  lastRefreshedAt: z.string().nullable(),
});
export type ComputedConfig = z.infer<typeof ComputedConfigOutputSchema>;

const ComputedConfigSchema = z
  .unknown()
  .transform((raw): ComputedConfig | null => {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    const snippetId = String(c.snippetId ?? '');
    if (!snippetId) return null; // a computed config with nothing to run is meaningless — treat it as absent
    return {
      snippetId,
      refreshMode: (VALID_COMPUTED_REFRESH_MODES as readonly string[]).includes(c.refreshMode as string) ? (c.refreshMode as ComputedRefreshMode) : 'manual',
      intervalMinutes: Number.isFinite(c.intervalMinutes) ? Math.max(1, Math.round(c.intervalMinutes as number)) : 60,
      lastRefreshedAt: c.lastRefreshedAt ? String(c.lastRefreshedAt) : null,
    };
  })
  .pipe(ComputedConfigOutputSchema.nullable());

const VariableOutputSchema = z.object({
  id: z.string(),
  name: z.string(), // trimmed, <=100 chars
  value: z.string(), // <=2000 chars
  secret: z.boolean(),
  // Non-null makes this a "derived" variable: its value is refreshed by
  // running `computed.snippetId` and capturing its trimmed stdout — see
  // main/computedVariables.ts. Independent of `secret`: a computed value
  // can still be masked/encrypted like any other.
  computed: ComputedConfigOutputSchema.nullable(),
});
export type Variable = z.infer<typeof VariableOutputSchema>;

export const VariableSchema = z
  .unknown()
  .transform((raw) => {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ id: unknown; name: unknown; value: unknown; secret: unknown; computed: unknown }>;
    return {
      id: String(v.id ?? newId('var')),
      name: String(v.name ?? '').trim().slice(0, 100),
      // A secret's on-disk value is safeStorage-encrypted (storage/variables.ts)
      // — base64 + AES-GCM overhead inflates a 2000-char plaintext to
      // meaningfully more bytes, so an "enc:"-prefixed value gets a looser cap
      // here rather than being truncated (which would corrupt the ciphertext).
      // The 2000-char cap still applies to the plaintext itself, before it's
      // ever encrypted.
      value: (() => {
        const raw = String(v.value ?? '');
        return raw.startsWith('enc:') ? raw.slice(0, 4000) : raw.slice(0, 2000);
      })(),
      secret: Boolean(v.secret),
      computed: ComputedConfigSchema.parse(v.computed),
    };
  })
  .pipe(VariableOutputSchema);
