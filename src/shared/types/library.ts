// The Library schema — a subscribed external, read-mostly snippet feed
// (storage/libraries.ts). Same zod transform+pipe shape as every other
// entity in this app (see snippet.ts's header comment for why).
import { z } from 'zod';
import { newId } from '../id';

const LibraryOutputSchema = z.object({
  id: z.string(),
  url: z.string(), // <=2000 chars
  name: z.string(), // trimmed, <=100 chars — defaults to the URL's host if never set
  lastSyncedAt: z.string().nullable(), // ISO timestamp
  lastSyncCount: z.number(), // how many snippets the last successful sync pulled in
});
export type Library = z.infer<typeof LibraryOutputSchema>;

export const LibrarySchema = z
  .unknown()
  .transform((raw) => {
    const l = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ id: unknown; url: unknown; name: unknown; lastSyncedAt: unknown; lastSyncCount: unknown }>;
    return {
      id: String(l.id ?? newId('lib')),
      url: String(l.url ?? '').trim().slice(0, 2000),
      name: String(l.name ?? '').trim().slice(0, 100),
      lastSyncedAt: l.lastSyncedAt ? String(l.lastSyncedAt) : null,
      lastSyncCount: Number.isFinite(l.lastSyncCount) ? (l.lastSyncCount as number) : 0,
    };
  })
  .pipe(LibraryOutputSchema);
