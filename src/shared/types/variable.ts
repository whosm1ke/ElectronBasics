// The Variable schema — the runtime AND compile-time source of truth (the
// Variable type is z.infer'd from it) for src/main/storage/variables.ts's
// read/write path. See snippet.ts's header comment for why this is a zod
// schema (transform + .pipe(OutputSchema)) rather than a hand-interface + a
// separate sanitizer function.
import { z } from 'zod';
import { newId } from '../id';

const VariableOutputSchema = z.object({
  id: z.string(),
  name: z.string(), // trimmed, <=100 chars
  value: z.string(), // <=2000 chars
  secret: z.boolean(),
});
export type Variable = z.infer<typeof VariableOutputSchema>;

export const VariableSchema = z
  .unknown()
  .transform((raw) => {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ id: unknown; name: unknown; value: unknown; secret: unknown }>;
    return {
      id: String(v.id ?? newId('var')),
      name: String(v.name ?? '').trim().slice(0, 100),
      value: String(v.value ?? '').slice(0, 2000),
      secret: Boolean(v.secret),
    };
  })
  .pipe(VariableOutputSchema);
