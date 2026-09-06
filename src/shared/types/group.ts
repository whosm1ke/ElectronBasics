// The Group schema — the runtime AND compile-time source of truth (the
// Group type is z.infer'd from it) for src/main/storage/groups.ts's
// read/write path. See snippet.ts's header comment for why this is a zod
// schema (transform + .pipe(OutputSchema)) rather than a hand-interface + a
// separate sanitizer function. `snippetIds` is deliberately just pointers,
// never a copy of the snippets — a dangling id (its snippet was deleted) is
// silently skipped wherever a group is resolved into runnable snippets, not
// treated as an error.
import { z } from 'zod';
import { newId } from '../id';

const GroupOutputSchema = z.object({
  id: z.string(),
  name: z.string(), // trimmed, <=100 chars
  description: z.string(), // trimmed, <=500 chars
  snippetIds: z.array(z.string()), // deduped, max 200
  runCount: z.number(), // bumped by GroupsModal.tsx's runGroup() — mirrors a snippet's own runCount, gives a group the same "used" signal
  lastRunAt: z.string().nullable(), // ISO timestamp, same convention as Snippet.lastRunAt
});
export type Group = z.infer<typeof GroupOutputSchema>;

export const GroupSchema = z
  .unknown()
  .transform((raw) => {
    const g = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ id: unknown; name: unknown; description: unknown; snippetIds: unknown; runCount: unknown; lastRunAt: unknown }>;
    const rawIds = Array.isArray(g.snippetIds) ? g.snippetIds : [];
    const snippetIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))].slice(0, 200);
    return {
      id: String(g.id ?? newId('grp')),
      name: String(g.name ?? '').trim().slice(0, 100),
      description: String(g.description ?? '').trim().slice(0, 500),
      snippetIds,
      runCount: typeof g.runCount === 'number' && g.runCount >= 0 ? g.runCount : 0,
      lastRunAt: g.lastRunAt ? String(g.lastRunAt) : null,
    };
  })
  .pipe(GroupOutputSchema);
