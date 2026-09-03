// storage/pipelines.js — saved visual pipelines: a small graph of existing
// snippets (nodes, positioned on the editor canvas) connected by edges that
// each carry a condition ('success' | 'failure' | 'always'), letting a run
// branch instead of just chaining linearly like runBefore/runAfterThis
// does. Like groups.js, a node is just a pointer (snippetId) — never a copy
// of the snippet — so a pipeline always reflects each member's current
// command/tag/etc., and a node whose snippet was deleted is simply skipped
// wherever the pipeline is resolved into something runnable (see
// pipeline-engine.js on the renderer side).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PIPELINES_FILE } = require('../paths');
const { newId } = require('../id');
const { readJsonFileSafe } = require('../json-file');

// 'exitCode' and 'outputContains' both carry a `value` (a number / a
// substring respectively) evaluated against the just-finished node's
// result — see pipeline-engine.js's edgeSatisfied(). The other three
// conditions ignore `value` entirely.
const VALID_CONDITIONS = ['success', 'failure', 'always', 'exitCode', 'outputContains'];
const MAX_NODES = 50;

function sanitizeNode(n) {
  return {
    id: String((n && n.id) ?? newId('node')),
    snippetId: String((n && n.snippetId) ?? ''),
    x: Number.isFinite(n && n.x) ? Math.round(n.x) : 40,
    y: Number.isFinite(n && n.y) ? Math.round(n.y) : 40,
  };
}

function sanitizePipeline(p) {
  const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
  const nodes = rawNodes.map(sanitizeNode).filter((n) => n.snippetId).slice(0, MAX_NODES);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const rawEdges = Array.isArray(p.edges) ? p.edges : [];
  const edges = rawEdges
    .map((e) => {
      const condition = VALID_CONDITIONS.includes(e && e.condition) ? e.condition : 'success';
      let value = null;
      if (condition === 'exitCode') value = Number.isFinite(e && e.value) ? Math.trunc(e.value) : 0;
      else if (condition === 'outputContains') value = String((e && e.value) ?? '').slice(0, 500);
      return {
        id: String((e && e.id) ?? newId('edge')),
        from: String((e && e.from) ?? ''),
        to: String((e && e.to) ?? ''),
        condition,
        value,
      };
    })
    // An edge pointing at a node id that no longer exists (the node was
    // removed from `nodes` above, e.g. its snippet got sanitized away)
    // would be dead weight the editor could never render meaningfully —
    // drop it rather than carry it forward.
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
    .slice(0, MAX_NODES * 4);

  return {
    id: String(p.id ?? newId('pipe')),
    name: String(p.name ?? '').trim().slice(0, 100),
    description: String(p.description ?? '').trim().slice(0, 500),
    nodes,
    edges,
  };
}

function readPipelines() {
  if (!fs.existsSync(PIPELINES_FILE)) return [];
  const parsed = readJsonFileSafe(PIPELINES_FILE, [], Array.isArray);
  return parsed.map(sanitizePipeline);
}

function writePipelines(pipelines) {
  const sanitized = Array.isArray(pipelines) ? pipelines.map(sanitizePipeline) : [];
  fs.mkdirSync(path.dirname(PIPELINES_FILE), { recursive: true });
  fs.writeFileSync(PIPELINES_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

module.exports = { readPipelines, writePipelines, sanitizePipeline, VALID_CONDITIONS };
