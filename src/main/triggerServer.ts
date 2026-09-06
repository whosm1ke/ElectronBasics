// triggerServer.ts — the optional external-trigger HTTP server: lets a
// local script, a CI job, or a scheduled task on this same machine kick off
// a snippet with `POST http://127.0.0.1:<port>/run/<snippetId>` (token in
// either the `X-Trigger-Token` header or a `?token=` query param). Off by
// default (Settings → Triggers); start()/stop() are the only two entry
// points `ipc.ts` needs.
//
// Deliberately plain `node:http`, not Express or anything from npm — one
// route, one auth check, no reason to add a dependency for it. Bound to
// 127.0.0.1 explicitly (never '0.0.0.0') so this is reachable only from the
// same machine, never the network — the token is the only gate beyond that,
// and there is no "is this command dangerous" check on what a trigger runs,
// same as every other unattended path in this app (scheduler, run-after,
// batch/group/pipeline runs) — see CLAUDE.md.
import http from 'node:http';
import { readAppSettings } from './storage/app-settings';
import { readSnippets, writeSnippets } from './storage/snippets';
import { runUnattended } from './unattendedRun';
import { sanitizeParamValues } from '@shared/types';
import type { ParamValues } from '@shared/types';

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

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const match = /^\/run\/([^/]+)$/.exec(url.pathname);

  if (req.method !== 'POST' || !match) {
    sendJson(res, 404, { ok: false, error: 'Not found. POST /run/:snippetId' });
    return;
  }

  const { trigger } = readAppSettings();
  const provided = tokenFromRequest(req);
  if (!trigger.enabled || !provided || provided !== trigger.token) {
    sendJson(res, 401, { ok: false, error: 'Missing or invalid trigger token' });
    return;
  }

  const snippetId = decodeURIComponent(match[1]);
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
