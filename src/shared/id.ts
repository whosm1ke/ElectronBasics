// id.ts — one shared id generator so every store's ids look/sort
// consistently, on both sides of the process split. Used to live as two
// near-identical copies (src/main/id.ts and the renderer's lib/utils.ts) —
// consolidated here once the zod schemas in shared/types/ (which run in the
// main process but are defined in shared code) needed the same generator.
export function newId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
