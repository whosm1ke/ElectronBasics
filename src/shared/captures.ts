// captures.ts — pure regex-extraction logic for a snippet's `captures`
// field ({variable, pattern}[]): after a run, pull a value out of its
// combined output straight into a global variable. Shared because both the
// renderer (a manual run, runEngine.ts) and the main process (a scheduled/
// triggered run, unattendedRun.ts) need to apply the exact same rule to a
// run's output — this has no DOM/IPC/Node-API dependency, just string/regex
// work, so there's no reason to implement it twice.
import type { Capture } from './types';

export interface CapturedValue {
  name: string;
  value: string;
}

/**
 * Runs every one of `captures`'s patterns against `text` (a run's combined
 * stdout+stderr). A pattern with a capturing group uses group 1; with none,
 * the whole match. An invalid regex or a pattern that doesn't match is
 * silently skipped — a capture is a best-effort convenience, not something
 * that should ever fail a run or need its own error UI.
 */
export function extractCaptures(captures: Capture[] | null, text: string): CapturedValue[] {
  if (!captures || captures.length === 0) return [];
  const results: CapturedValue[] = [];
  for (const c of captures) {
    if (!c.variable || !c.pattern) continue;
    try {
      const re = new RegExp(c.pattern);
      const match = re.exec(text);
      if (!match) continue;
      results.push({ name: c.variable, value: match[1] !== undefined ? match[1] : match[0] });
    } catch {
      // Malformed regex — nothing to capture, not worth surfacing as an error.
    }
  }
  return results;
}
