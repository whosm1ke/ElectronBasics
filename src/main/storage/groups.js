// storage/groups.js — named, saved sets of snippets ({id, name, snippetIds})
// that can be run together on demand without reselecting them each time.
// Deliberately just a list of ids, not a copy of the snippets themselves —
// a group always reflects each member's current command/tag/etc., and a
// snippetId with nothing behind it any more (the snippet was deleted) is
// simply skipped wherever a group is resolved into runnable snippets.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GROUPS_FILE } = require('../paths');
const { newId } = require('../id');
const { readJsonFileSafe } = require('../json-file');

function sanitizeGroup(g) {
  const rawIds = Array.isArray(g.snippetIds) ? g.snippetIds : [];
  const snippetIds = [...new Set(rawIds.filter((id) => typeof id === 'string' && id))].slice(0, 200);
  return {
    id: String(g.id ?? newId('grp')),
    name: String(g.name ?? '').trim().slice(0, 100),
    description: String(g.description ?? '').trim().slice(0, 500),
    snippetIds,
  };
}

function readGroups() {
  if (!fs.existsSync(GROUPS_FILE)) return [];
  const parsed = readJsonFileSafe(GROUPS_FILE, [], Array.isArray);
  return parsed.map(sanitizeGroup);
}

function writeGroups(groups) {
  const sanitized = Array.isArray(groups) ? groups.map(sanitizeGroup) : [];
  fs.mkdirSync(path.dirname(GROUPS_FILE), { recursive: true });
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

module.exports = { readGroups, writeGroups, sanitizeGroup };
