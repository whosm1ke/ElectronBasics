// id.ts — one shared id generator so every store's ids look/sort consistently.
export function newId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
