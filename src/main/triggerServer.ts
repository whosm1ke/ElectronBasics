// triggerServer.ts — the optional external-trigger HTTP server: lets a
// local script, a CI job, or a scheduled task on this same machine kick off
// a snippet with `POST http://127.0.0.1:<port>/run/<snippetId>`, or a whole
// saved Group with `POST .../run-group/<groupId>` (token in either the
// `X-Trigger-Token` header or a `?token=` query param). Off by default
// (Settings → Triggers); start()/stop() are the only two entry points
// `ipc.ts` needs.
//
// Deliberately plain `node:http`, not Express or anything from npm — two
// routes, one auth check, no reason to add a dependency for it. Bound to
// 127.0.0.1 explicitly (never '0.0.0.0') so this is reachable only from the
// same machine, never the network — the token is the only gate beyond that,
// and there is no "is this command dangerous" check on what a trigger runs,
// same as every other unattended path in this app (scheduler, run-after,
// batch/group/pipeline runs) — see CLAUDE.md.
import http from 'node:http';
import { Notification } from 'electron';
import { readAppSettings } from './storage/app-settings';
import { readSnippets, writeSnippets } from './storage/snippets';
import { readGroups, writeGroups } from './storage/groups';
import { runUnattended } from './unattendedRun';
import { sanitizeParamValues } from '@shared/types';
import type { ParamValues, Snippet } from '@shared/types';

let server: http.Server | null = null;

function tokenFromRequest(req: http.IncomingMessage): string | null {
  const header = req.headers['x-trigger-token'];
  if (typeof header === 'string' && header) return header;
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  return url.searchParams.get('token');
}

/** Every non-`token` query param becomes a `{{name}}` override — the simplest "set this before execution" path for a caller that can't easily send a JSON body (a scheduled task's plain URL, a one-line curl). */
function paramValuesFromQuery(url: URL): ParamValues {
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'token') continue;
    raw[k] = v;
  }
  return sanitizeParamValues(raw);
}

/** A group-run request's JSON body values, keyed one level deeper than a single-snippet run's: `{ "<snippetId>": { "<placeholder>": "<value>" }, ... }` — each snippet's own values sanitized the same way a single snippet's own `values` object is. */
function sanitizeGroupValuesBody(raw: unknown): Record<string, ParamValues> {
  const out: Record<string, ParamValues> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [snippetId, perSnippetValues] of Object.entries(raw as Record<string, unknown>)) {
    const sanitized = sanitizeParamValues(perSnippetValues);
    if (sanitized) out[snippetId] = sanitized;
  }
  return out;
}

const MAX_BODY_BYTES = 65536;

/** Reads and JSON-parses the request body, capped well above any real values payload — `null` for an empty body, throws for anything oversized or malformed so the caller can turn that into a clear 400. */
function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

/**
 * Runs every snippet in `group` (skipping any dangling id, same as every
 * other place a group is resolved into a runnable list), resolving each
 * one's own `{{placeholder}}`s against, in order: that snippet's own entry
 * in `perSnippetOverrides` (the JSON body's per-snippet dictionary), then
 * `sharedOverrides` (query params — apply to whichever snippet in the group
 * actually has a matching name, so one `?environment=prod` can cover
 * several snippets at once), then a saved global variable. Individual
 * per-snippet notifications are suppressed (`runUnattended(..., false, ...)`)
 * in favor of one aggregate notification for the whole group run, same
 * spirit as the group's own runCount/lastRunAt being bumped once here
 * rather than the caller doing it — see GroupsModal.tsx's own runGroup().
 */
async function handleGroupRun(rawGroupId: string, req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const groupId = decodeURIComponent(rawGroupId);
  const groups = readGroups();
  const groupIdx = groups.findIndex((g) => g.id === groupId);
  if (groupIdx < 0) {
    sendJson(res, 404, { ok: false, error: `No group with id "${groupId}"` });
    return;
  }
  const group = groups[groupIdx];

  const sharedOverrides = paramValuesFromQuery(url);
  let perSnippetOverrides: Record<string, ParamValues> = {};
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: `Invalid request body: ${(err as Error).message}` });
      return;
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const valuesSource = 'values' in body ? (body as { values: unknown }).values : body;
      perSnippetOverrides = sanitizeGroupValuesBody(valuesSource);
    }
  }

  const snippets = readSnippets();
  const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
  if (members.length === 0) {
    sendJson(res, 422, { ok: false, error: 'This group has no snippets left to run.' });
    return;
  }

  const results: { snippetId: string; ok: boolean; exitCode?: number; skipped?: boolean; missing?: string[] }[] = [];
  for (const snippet of members) {
    const merged = { ...(sharedOverrides || {}), ...(perSnippetOverrides[snippet.id] || {}) };
    const overrides = Object.keys(merged).length > 0 ? merged : undefined;
    // eslint-disable-next-line no-await-in-loop
    const outcome = await runUnattended(snippet, 'triggered', false, overrides);
    if (outcome.skipped) {
      results.push({ snippetId: snippet.id, ok: false, skipped: true, missing: outcome.missingVariables });
      continue;
    }
    snippet.lastRunAt = new Date().toISOString();
    snippet.runCount = (snippet.runCount || 0) + 1;
    results.push({ snippetId: snippet.id, ok: outcome.exitCode === 0, exitCode: outcome.exitCode });
  }
  writeSnippets(snippets);

  groups[groupIdx] = { ...group, runCount: group.runCount + 1, lastRunAt: new Date().toISOString() };
  writeGroups(groups);

  try {
    if (Notification.isSupported()) {
      const okCount = results.filter((r) => r.ok).length;
      const skippedCount = results.filter((r) => r.skipped).length;
      const failCount = results.length - okCount - skippedCount;
      const parts = [`${okCount} ok`, failCount ? `${failCount} failed` : null, skippedCount ? `${skippedCount} skipped` : null].filter(Boolean);
      new Notification({ title: `Triggered group: ${group.name || '(untitled group)'}`, body: parts.join(', ') + '.' }).show();
    }
  } catch (err) {
    console.error('Failed to show triggered-group notification:', err);
  }

  const anyIncomplete = results.some((r) => r.skipped || !r.ok);
  sendJson(res, anyIncomplete ? 207 : 200, { ok: !anyIncomplete, groupId, results });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const groupMatch = /^\/run-group\/([^/]+)$/.exec(url.pathname);
  const match = /^\/run\/([^/]+)$/.exec(url.pathname);

  if (req.method !== 'POST' || (!match && !groupMatch)) {
    sendJson(res, 404, { ok: false, error: 'Not found. POST /run/:snippetId or /run-group/:groupId' });
    return;
  }

  const { trigger } = readAppSettings();
  const provided = tokenFromRequest(req);
  if (!trigger.enabled || !provided || provided !== trigger.token) {
    sendJson(res, 401, { ok: false, error: 'Missing or invalid trigger token' });
    return;
  }

  if (groupMatch) {
    await handleGroupRun(groupMatch[1], req, res, url);
    return;
  }

  const snippetId = decodeURIComponent(match![1]);
  const snippets = readSnippets();
  const snippet = snippets.find((s) => s.id === snippetId);
  if (!snippet) {
    sendJson(res, 404, { ok: false, error: `No snippet with id "${snippetId}"` });
    return;
  }

  // Values for this call specifically — set at the call site, not saved
  // anywhere. Query params first, then a JSON body's own `values` (or the
  // whole body, if it's a plain object) layered on top of those.
  let overrides = paramValuesFromQuery(url);
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: `Invalid request body: ${(err as Error).message}` });
      return;
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const valuesSource = 'values' in body ? (body as { values: unknown }).values : body;
      const bodyOverrides = sanitizeParamValues(valuesSource);
      if (bodyOverrides) overrides = { ...(overrides || {}), ...bodyOverrides };
    }
  }

  try {
    // Same rule as every other unattended path in this app — there's
    // nowhere to interactively prompt for a placeholder value from an HTTP
    // request, but a `{{name}}` resolves automatically against `overrides`
    // above (this call's own query params / JSON body) or a matching saved
    // global variable (Settings → Manage variables), in that order.
    const outcome = await runUnattended(snippet, 'triggered', true, overrides);
    if (outcome.skipped) {
      sendJson(res, 422, {
        ok: false,
        error: `Missing value(s) for: ${outcome.missingVariables.join(', ')} — pass them as query params or a JSON body ({"values": {...}}), or set a global variable with that name.`,
      });
      return;
    }
    snippet.lastRunAt = new Date().toISOString();
    snippet.runCount = (snippet.runCount || 0) + 1;
    writeSnippets(snippets);
    sendJson(res, 200, { ok: true, snippetId, exitCode: outcome.exitCode });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String((err as Error).message || err) });
  }
}

export function startTriggerServer(port: number): void {
  stopTriggerServer();
  server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('Trigger server request failed:', err);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal error' });
    });
  });
  server.on('error', (err) => {
    console.error(`Trigger server failed to start on port ${port}:`, err);
    server = null;
  });
  server.listen(port, '127.0.0.1');
}

export function stopTriggerServer(): void {
  if (!server) return;
  server.close();
  server = null;
}

export function isTriggerServerRunning(): boolean {
  return server !== null;
}

/** Called once at app startup — starts the server immediately if it was left enabled from a previous session. */
export function initTriggerServer(): void {
  const { trigger } = readAppSettings();
  if (trigger.enabled) startTriggerServer(trigger.port);
}
