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
import { runUnattended, hasUnresolvedPlaceholder } from './unattendedRun';

let server: http.Server | null = null;

function tokenFromRequest(req: http.IncomingMessage): string | null {
  const header = req.headers['x-trigger-token'];
  if (typeof header === 'string' && header) return header;
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  return url.searchParams.get('token');
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
  // Same rule as every other unattended path in this app — there's nowhere
  // to prompt for a placeholder value from an HTTP request.
  if (hasUnresolvedPlaceholder(snippet)) {
    sendJson(res, 422, { ok: false, error: 'Snippet has unresolved {{placeholder}} tokens — triggers can only run fully-resolved commands' });
    return;
  }

  try {
    const exitCode = await runUnattended(snippet, 'triggered');
    snippet.lastRunAt = new Date().toISOString();
    snippet.runCount = (snippet.runCount || 0) + 1;
    writeSnippets(snippets);
    sendJson(res, 200, { ok: true, snippetId, exitCode });
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
