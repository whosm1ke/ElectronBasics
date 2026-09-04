// storage/groups.ts — named, saved sets of snippets ({id, name, snippetIds})
// that can be run together on demand without reselecting them each time.
// Deliberately just a list of ids, not a copy of the snippets themselves —
// a group always reflects each member's current command/tag/etc., and a
// snippetId with nothing behind it any more (the snippet was deleted) is
// simply skipped wherever a group is resolved into runnable snippets.
import fs from 'node:fs';
import path from 'node:path';
import { GROUPS_FILE } from '../paths';
import { newId } from '../id';
import { readJsonFileSafe } from '../json-file';
import type { Group } from '@shared/types';

export function sanitizeGroup(g: Partial<Group>): Group {
  const rawIds = Array.isArray(g.snippetIds) ? g.snippetIds : [];
  const snippetIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))].slice(0, 200);
  return {
    id: String(g.id ?? newId('grp')),
    name: String(g.name ?? '').trim().slice(0, 100),
    description: String(g.description ?? '').trim().slice(0, 500),
    snippetIds,
  };
}

export function readGroups(): Group[] {
  if (!fs.existsSync(GROUPS_FILE)) return [];
  const parsed = readJsonFileSafe<Group[]>(GROUPS_FILE, [], Array.isArray);
  return parsed.map(sanitizeGroup);
}

export function writeGroups(groups: unknown): Group[] {
  const sanitized = Array.isArray(groups) ? groups.map(sanitizeGroup) : [];
  fs.mkdirSync(path.dirname(GROUPS_FILE), { recursive: true });
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}
