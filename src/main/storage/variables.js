// storage/variables.js — reusable named placeholder values ({id,name,value,secret}).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { VARIABLES_FILE } = require('../paths');
const { newId } = require('../id');
const { readJsonFileSafe } = require('../json-file');

function sanitizeVariable(v) {
  return {
    id: String(v.id ?? newId('var')),
    name: String(v.name ?? '').trim().slice(0, 100),
    value: String(v.value ?? '').slice(0, 2000),
    secret: Boolean(v.secret),
  };
}

function readVariables() {
  if (!fs.existsSync(VARIABLES_FILE)) return [];
  const parsed = readJsonFileSafe(VARIABLES_FILE, [], Array.isArray);
  return parsed.map(sanitizeVariable);
}

function writeVariables(vars) {
  const sanitized = Array.isArray(vars) ? vars.map(sanitizeVariable) : [];
  fs.mkdirSync(path.dirname(VARIABLES_FILE), { recursive: true });
  fs.writeFileSync(VARIABLES_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

module.exports = { readVariables, writeVariables, sanitizeVariable };
