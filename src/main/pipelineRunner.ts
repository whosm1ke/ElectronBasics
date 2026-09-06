// pipelineRunner.ts — the main process's UNATTENDED (scheduled) pipeline
// runner: drives @shared/pipelineWalk.ts's pure graph-walking core with a
// `runNode` callback that executes each node directly (no IPC, no UI —
// there's no renderer surface driving this). This is
// lib/pipelineEngine.ts's twin for the process boundary: same shared walk
// logic, a different `runNode` because main can't render a live row or
// wait on a human's click. A 'gate' node here is auto-treated as "not
// approved" (skipped) — same "no prompting outside an attended context"
// rule as an unresolved `{{placeholder}}` in every other unattended path.
import { readPipelines } from './storage/pipelines';
import { readSnippets, writeSnippets } from './storage/snippets';
import { readVariables } from './storage/variables';
import { readGroups } from './storage/groups';
import { appendHistory } from './storage/history';
import { walkPipeline, withRetries, sleep, type NodeOutcome } from '@shared/pipelineWalk';
import { newId } from '@shared/id';
import { executeSnippetOnce, applyCaptures, hasUnresolvedPlaceholder, resolveSnippetForUnattended, runnableTextOfSnippet } from './unattendedRun';
import type { Pipeline, PipelineNode, PipelineEdge, Snippet, Variable, ParamValues, RunResult } from '@shared/types';

/**
 * Runs `{nodes, edges}` unattended — used both for a top-level scheduled
 * pipeline (scheduler.ts's tick) and recursively for a 'pipeline'-kind
 * node's sub-pipeline. `snippets`/`variables` are read once by the
 * top-level caller and threaded down so a deep recursion doesn't re-read
 * either file per node. `paramValues` is the top-level pipeline's own
 * `schedule.paramValues` (fixed overrides set once for this schedule, see
 * paramValues.ts) — threaded into every nested sub-pipeline call too, since
 * there's no separate per-sub-pipeline schedule to collect its own from.
 */
async function runPipelineUnattended(
  pipeline: Pick<Pipeline, 'nodes' | 'edges' | 'maxConcurrency'>,
  snippets: Snippet[],
  variables: Variable[],
  visitedPipelineIds: Set<string>,
  paramValues?: ParamValues
): Promise<{ ran: number; success: boolean }> {
  const usable = pipeline.nodes.filter((n) => n.kind !== 'step' || snippets.some((s) => s.id === n.snippetId));

  async function runNode(node: PipelineNode): Promise<NodeOutcome> {
    if (node.kind === 'delay') {
      await sleep(node.delaySeconds * 1000);
      return { kind: 'ran', result: { code: 0, stdout: '', stderr: '' } };
    }
    if (node.kind === 'gate') {
      // Nowhere to ask — a gate never fires unattended.
      return { kind: 'skipped' };
    }
    if (node.kind === 'pipeline') {
      const all = readPipelines();
      const sub = all.find((p) => p.id === node.subPipelineId);
      if (!sub || visitedPipelineIds.has(sub.id)) return { kind: 'skipped' };
      const nextVisited = new Set(visitedPipelineIds);
      nextVisited.add(sub.id);
      const subStats = await runPipelineUnattended(sub, snippets, variables, nextVisited, paramValues);
      return { kind: 'ran', result: { code: subStats.success ? 0 : 1, stdout: '', stderr: '' } };
    }

    if (node.kind === 'group') {
      const groups = readGroups();
      const group = groups.find((g) => g.id === node.groupId);
      if (!group) return { kind: 'skipped' };
      const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));
      if (members.length === 0) return { kind: 'skipped' };
      // Sequential, same as every other "run a group unattended" path in
      // this app (triggerServer.ts's /run-group, main/groupRunner.ts) —
      // and success iff every member that actually ran (not itself skipped
      // for a missing placeholder) succeeded, same "aggregate as one
      // RunResult" rule the 'pipeline' case above uses for its own sub-run.
      let anyRan = false;
      let allOk = true;
      for (const original of members) {
        const resolved = hasUnresolvedPlaceholder(original) ? resolveSnippetForUnattended(original, variables, paramValues) : { snippet: original, missing: [] };
        if (resolved.missing.length > 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const result = await executeSnippetOnce(resolved.snippet);
        if (original.captures) applyCaptures(original, `${result.stdout}\n${result.stderr}`);
        original.runCount = (original.runCount || 0) + 1;
        original.lastRunAt = new Date().toISOString();
        anyRan = true;
        if (result.code !== 0) allOk = false;
      }
      if (!anyRan) return { kind: 'skipped' };
      return { kind: 'ran', result: { code: allOk ? 0 : 1, stdout: '', stderr: '' } };
    }

    // 'step'
    const original = snippets.find((s) => s.id === node.snippetId)!;
    // A `{{placeholder}}` resolves against this pipeline's own schedule
    // overrides first, then a matching saved global variable (Settings →
    // Manage variables) — only a genuinely unresolvable name skips the
    // step, rather than every parameterized step being skipped outright
    // regardless of whether a value for it was already available.
    const snippet = hasUnresolvedPlaceholder(original) ? resolveSnippetForUnattended(original, variables, paramValues) : { snippet: original, missing: [] };
    if (snippet.missing.length > 0) return { kind: 'skipped' };
    const attempt = () => executeSnippetOnce(snippet.snippet);
    const result: RunResult =
      node.retries > 0 ? await withRetries(attempt, (r) => r.code === 0, node.retries, node.retryDelaySeconds) : await attempt();
    if (original.captures) applyCaptures(original, `${result.stdout}\n${result.stderr}`);
    original.runCount = (original.runCount || 0) + 1;
    original.lastRunAt = new Date().toISOString();
    return { kind: 'ran', result };
  }

  const stats = await walkPipeline(usable, pipeline.edges, { runNode, maxConcurrency: pipeline.maxConcurrency });
  return { ran: stats.ran, success: stats.success };
}

/** Runs a scheduled pipeline top-to-bottom, logs one aggregate history entry (not one per step — a pipeline run reads as a single unit, same spirit as a multi-step snippet's own sequence-level history entry), and persists any runCount/lastRunAt bumps its steps picked up. */
export async function runScheduledPipeline(pipeline: Pipeline): Promise<void> {
  const startedAt = Date.now();
  const snippets = readSnippets();
  const variables = readVariables();
  const { ran, success } = await runPipelineUnattended(pipeline, snippets, variables, new Set([pipeline.id]), pipeline.schedule?.paramValues);
  writeSnippets(snippets);

  appendHistory({
    id: newId('run'),
    snippetId: null,
    snippetName: `${pipeline.name || '(untitled pipeline)'} (scheduled pipeline)`,
    command: pipeline.nodes
      .map((n) => {
        if (n.kind !== 'step') return `[${n.kind}]`;
        const s = snippets.find((sn) => sn.id === n.snippetId);
        return s ? runnableTextOfSnippet(s) : '[deleted snippet]';
      })
      .join('\n---\n'),
    exitCode: success ? 0 : 1,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutPreview: `${ran} step(s) ran.`,
    stderrPreview: success ? '' : 'One or more steps failed.',
  });
}
