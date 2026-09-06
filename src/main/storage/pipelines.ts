// storage/pipelines.ts — saved visual pipelines: read/write. The schema
// itself (PipelineSchema, @shared/types/pipeline.ts) is the single source of
// truth for both the Pipeline type and the backfill/coercion logic that runs
// on both read and write — see that file's own header comment. A pipeline is
// a small graph of existing snippets (nodes, positioned on the editor
// canvas) connected by edges that each carry a condition ('success' |
// 'failure' | 'always' | 'exitCode' | 'outputContains'), letting a run
// branch instead of just chaining linearly like runBefore/runAfterThis does.
// Like groups.ts, a node is just a pointer (snippetId) — never a copy of the
// snippet — so a pipeline always reflects each member's current
// command/tag/etc., and a node whose snippet was deleted is simply skipped
// wherever the pipeline is resolved into something runnable (see
// pipeline-engine.ts on the renderer side).
import fs from 'node:fs';
import { PIPELINES_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { Pipeline } from '@shared/types';
import { PipelineSchema } from '@shared/types';

/** Thin, still-exported wrapper around PipelineSchema.parse(). */
export function sanitizePipeline(p: unknown): Pipeline {
  return PipelineSchema.parse(p);
}

export function readPipelines(): Pipeline[] {
  if (!fs.existsSync(PIPELINES_FILE)) return [];
  const parsed = readJsonFileSafe<Pipeline[]>(PIPELINES_FILE, [], Array.isArray);
  return parsed.map(sanitizePipeline);
}

export function writePipelines(pipelines: unknown): Pipeline[] {
  const sanitized = Array.isArray(pipelines) ? pipelines.map(sanitizePipeline) : [];
  writeJsonFileAtomic(PIPELINES_FILE, sanitized);
  return sanitized;
}
