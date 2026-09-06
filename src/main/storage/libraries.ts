// storage/libraries.ts — subscribed external snippet libraries: a saved
// list of URLs ({id, url, name, lastSyncedAt, lastSyncCount}) plus the sync
// itself, which fetches a URL, sanitizes what comes back through the exact
// same SnippetSchema every other snippet goes through, and merges it into
// the local library. The fetch happens here (main process) rather than the
// renderer specifically because production index.html's CSP has no
// `connect-src` override — it inherits `default-src 'self'`, which blocks
// a renderer-side fetch() to any external host outright.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { LIBRARIES_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import { readSnippets, writeSnippets, sanitizeSnippet } from './snippets';
import type { Library, Snippet } from '@shared/types';
import { LibrarySchema } from '@shared/types';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB — a snippet library is text, this is generous
const MAX_SNIPPETS_PER_LIBRARY = 200;
const FETCH_TIMEOUT_MS = 15000;

/** Thin, still-exported wrapper around LibrarySchema.parse(). */
export function sanitizeLibrary(l: unknown): Library {
  return LibrarySchema.parse(l);
}

export function readLibraries(): Library[] {
  if (!fs.existsSync(LIBRARIES_FILE)) return [];
  const parsed = readJsonFileSafe<Library[]>(LIBRARIES_FILE, [], Array.isArray);
  return parsed.map(sanitizeLibrary);
}

export function writeLibraries(libraries: unknown): Library[] {
  const sanitized = Array.isArray(libraries) ? libraries.map(sanitizeLibrary) : [];
  writeJsonFileAtomic(LIBRARIES_FILE, sanitized);
  return sanitized;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid URL'));
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('Only http:// and https:// URLs are supported'));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': 'SnippetRunner' } }, (res) => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`Server responded ${status}`));
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy();
          reject(new Error('Response too large (>2MB)'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

/**
 * Fetches `url`, validates the response is a JSON array, and merges it into
 * the local snippet library. Each remote entry is given a stable id derived
 * from the library's URL plus its own `id`/index in that response
 * (`ext-<urlHash>-<originalId>`), so re-syncing the same library updates the
 * same local rows in place rather than piling up duplicates on every sync;
 * a local snippet's own pin/run-stats are preserved across a re-sync by
 * copying them forward from whatever row previously had that id. Any
 * previously-synced row from this same library that's no longer present in
 * the response is dropped — this is meant to mirror the source, not
 * accumulate everything ever seen from it.
 */
export async function syncLibrary(library: Library): Promise<{ snippets: Snippet[]; count: number }> {
  const text = await fetchText(library.url);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Response was not valid JSON');
  }
  if (!Array.isArray(json)) throw new Error('Response must be a JSON array of snippets');

  const urlHash = crypto.createHash('sha1').update(library.url).digest('hex').slice(0, 10);
  const existing = readSnippets();
  const existingById = new Map(existing.map((s) => [s.id, s]));

  const incoming: Snippet[] = json.slice(0, MAX_SNIPPETS_PER_LIBRARY).map((raw, i) => {
    const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const stableId = `ext-${urlHash}-${String(rawObj.id ?? i)}`;
    const sanitized = sanitizeSnippet({ ...rawObj, id: stableId, externalSource: library.url });
    const previous = existingById.get(stableId);
    if (previous && previous.externalSource === library.url) {
      // Carry the user's own local state forward across a re-sync — the
      // library's own JSON has no business overriding whether the user
      // pinned it or how many times they've run it.
      sanitized.pinned = previous.pinned;
      sanitized.runCount = previous.runCount;
      sanitized.lastRunAt = previous.lastRunAt;
    }
    return sanitized;
  });

  const kept = existing.filter((s) => s.externalSource !== library.url);
  const merged = writeSnippets([...kept, ...incoming]);
  return { snippets: merged, count: incoming.length };
}

/** Removes every snippet this library previously synced in, then drops the subscription itself. */
export function removeLibraryAndSnippets(libraryId: string, libraries: Library[]): { libraries: Library[]; snippets: Snippet[] } {
  const target = libraries.find((l) => l.id === libraryId);
  const remainingLibraries = writeLibraries(libraries.filter((l) => l.id !== libraryId));
  if (!target) return { libraries: remainingLibraries, snippets: readSnippets() };
  const remainingSnippets = writeSnippets(readSnippets().filter((s) => s.externalSource !== target.url));
  return { libraries: remainingLibraries, snippets: remainingSnippets };
}
