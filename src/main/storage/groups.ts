// storage/groups.ts — named, saved sets of snippets ({id, name, snippetIds})
// that can be run together on demand without reselecting them each time.
// The schema itself (GroupSchema, @shared/types/group.ts) is the single
// source of truth for both the Group type and the backfill/coercion logic
// that runs on both read and write. Deliberately just a list of ids, not a
// copy of the snippets themselves — a group always reflects each member's
// current command/tag/etc., and a snippetId with nothing behind it any more
// (the snippet was deleted) is simply skipped wherever a group is resolved
// into runnable snippets.
import fs from 'node:fs';
import { GROUPS_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { Group } from '@shared/types';
import { GroupSchema } from '@shared/types';

/** Thin, still-exported wrapper around GroupSchema.parse(). */
export function sanitizeGroup(g: unknown): Group {
  return GroupSchema.parse(g);
}

export function readGroups(): Group[] {
  if (!fs.existsSync(GROUPS_FILE)) return [];
  const parsed = readJsonFileSafe<Group[]>(GROUPS_FILE, [], Array.isArray);
  return parsed.map(sanitizeGroup);
}

export function writeGroups(groups: unknown): Group[] {
  const sanitized = Array.isArray(groups) ? groups.map(sanitizeGroup) : [];
  writeJsonFileAtomic(GROUPS_FILE, sanitized);
  return sanitized;
}
