// storage/variables.ts — reusable named placeholder values ({id,name,value,secret}).
// The schema itself (VariableSchema, @shared/types/variable.ts) is the
// single source of truth for both the Variable type and the
// backfill/coercion logic that runs on both read and write.
import fs from 'node:fs';
import { VARIABLES_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { Variable } from '@shared/types';
import { VariableSchema } from '@shared/types';

/** Thin, still-exported wrapper around VariableSchema.parse(). */
export function sanitizeVariable(v: unknown): Variable {
  return VariableSchema.parse(v);
}

export function readVariables(): Variable[] {
  if (!fs.existsSync(VARIABLES_FILE)) return [];
  const parsed = readJsonFileSafe<Variable[]>(VARIABLES_FILE, [], Array.isArray);
  return parsed.map(sanitizeVariable);
}

export function writeVariables(vars: unknown): Variable[] {
  const sanitized = Array.isArray(vars) ? vars.map(sanitizeVariable) : [];
  writeJsonFileAtomic(VARIABLES_FILE, sanitized);
  return sanitized;
}
