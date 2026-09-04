// Mirrors sanitizeGroup() in src/main/storage/groups.js. `snippetIds` is
// deliberately just pointers, never a copy of the snippets — a dangling id
// (its snippet was deleted) is silently skipped wherever a group is resolved
// into runnable snippets, not treated as an error.
export interface Group {
  id: string;
  name: string; // trimmed, <=100 chars
  description: string; // trimmed, <=500 chars
  snippetIds: string[]; // deduped, max 200
}
