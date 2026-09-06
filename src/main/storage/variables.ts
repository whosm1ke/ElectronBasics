// storage/variables.ts — reusable named placeholder values ({id,name,value,secret}).
// The schema itself (VariableSchema, @shared/types/variable.ts) is the
// single source of truth for both the Variable type and the
// backfill/coercion logic that runs on both read and write.
//
// A variable marked `secret` is encrypted at rest via Electron's
// `safeStorage` (DPAPI-backed on Windows, tied to the current Windows user
// account) — encrypted AFTER sanitizeVariable() on write (so the 2000-char
// cap applies to the plaintext, not the inflated ciphertext) and decrypted
// BEFORE being handed back on read. A non-secret variable's value is never
// touched. This replaced the earlier "secret just means masked in the UI,
// still plain JSON on disk" behavior — see the README's Global variables
// section for the user-facing caveat that remains (no cross-machine sync,
// since a DPAPI blob only decrypts on the machine/account that wrote it).
import fs from 'node:fs';
import { safeStorage } from 'electron';
import { VARIABLES_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { Variable } from '@shared/types';
import { VariableSchema } from '@shared/types';

const ENC_PREFIX = 'enc:'; // keep in sync with variable.ts's looser length cap for this prefix

/** Thin, still-exported wrapper around VariableSchema.parse(). */
export function sanitizeVariable(v: unknown): Variable {
  return VariableSchema.parse(v);
}

function encryptSecret(value: string): string {
  if (!value) return value;
  if (!safeStorage.isEncryptionAvailable()) return value; // no OS keychain available — falls back to plain storage rather than throwing
  return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value; // plaintext from before encryption existed, or written while unavailable
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return ''; // corrupted, or encrypted under a different Windows user/machine — fail closed rather than throw
  }
}

export function readVariables(): Variable[] {
  if (!fs.existsSync(VARIABLES_FILE)) return [];
  const parsed = readJsonFileSafe<Variable[]>(VARIABLES_FILE, [], Array.isArray);
  return parsed.map(sanitizeVariable).map((v) => (v.secret ? { ...v, value: decryptSecret(v.value) } : v));
}

export function writeVariables(vars: unknown): Variable[] {
  const sanitized = Array.isArray(vars) ? vars.map(sanitizeVariable) : [];
  const toDisk = sanitized.map((v) => (v.secret ? { ...v, value: encryptSecret(v.value) } : v));
  writeJsonFileAtomic(VARIABLES_FILE, toDisk);
  return sanitized; // callers always get plaintext back, never the on-disk ciphertext
}

/** Whether this machine can actually encrypt secrets — surfaced to the renderer so it can warn rather than silently storing plaintext. */
export function isSecretEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
