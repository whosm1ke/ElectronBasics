// storage/variables.ts — reusable named placeholder values ({id,name,value,secret}).
import fs from 'node:fs';
import path from 'node:path';
import { VARIABLES_FILE } from '../paths';
import { newId } from '../id';
import { readJsonFileSafe } from '../json-file';
import type { Variable } from '@shared/types';

export function sanitizeVariable(v: Partial<Variable>): Variable {
  return {
    id: String(v.id ?? newId('var')),
    name: String(v.name ?? '').trim().slice(0, 100),
    value: String(v.value ?? '').slice(0, 2000),
    secret: Boolean(v.secret),
  };
}

export function readVariables(): Variable[] {
  if (!fs.existsSync(VARIABLES_FILE)) return [];
  const parsed = readJsonFileSafe<Variable[]>(VARIABLES_FILE, [], Array.isArray);
  return parsed.map(sanitizeVariable);
}

export function writeVariables(vars: unknown): Variable[] {
  const sanitized = Array.isArray(vars) ? vars.map(sanitizeVariable) : [];
  fs.mkdirSync(path.dirname(VARIABLES_FILE), { recursive: true });
  fs.writeFileSync(VARIABLES_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}
