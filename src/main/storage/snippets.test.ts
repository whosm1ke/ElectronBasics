// Covers sanitizeSnippet()'s backfill/type-coercion behavior — the schema's
// single source of truth (CLAUDE.md). Pins down exact defaults and edge
// cases so a future refactor can't silently change what a hand-edited or
// older-schema snippets.json gets normalized into.
import { describe, it, expect } from 'vitest';
import { sanitizeSnippet, VALID_SHELLS } from './snippets';

describe('sanitizeSnippet', () => {
  it('backfills every field with documented defaults for a minimal input', () => {
    const s = sanitizeSnippet({ name: 'Test' });
    expect(s.name).toBe('Test');
    expect(s.tag).toBe('misc');
    expect(s.command).toBe('');
    expect(s.pinned).toBe(false);
    expect(s.runCount).toBe(0);
    expect(s.lastRunAt).toBeNull();
    expect(s.cwd).toBeNull();
    expect(s.shell).toBe('powershell');
    expect(s.elevated).toBe(false);
    expect(s.steps).toBeNull();
    expect(s.env).toBeNull();
    expect(s.expect).toBeNull();
    expect(s.schedule).toBeNull();
    expect(s.background).toBe(false);
    expect(s.autoRestart).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
  });

  it('falls back to powershell for an invalid/unknown shell', () => {
    expect(sanitizeSnippet({ shell: 'bogus-shell' }).shell).toBe('powershell');
    for (const shell of VALID_SHELLS) {
      expect(sanitizeSnippet({ shell }).shell).toBe(shell);
    }
  });

  it('forces background false whenever steps is non-empty, even if background:true was requested', () => {
    const s = sanitizeSnippet({ steps: ['echo a', 'echo b'], background: true });
    expect(s.background).toBe(false);
    expect(s.steps).toEqual(['echo a', 'echo b']);
  });

  it('allows background:true for a single-command (no steps) snippet', () => {
    expect(sanitizeSnippet({ background: true }).background).toBe(true);
  });

  it('caps steps at 20 entries and 5000 chars each, drops empty ones', () => {
    const steps = Array.from({ length: 25 }, (_, i) => `step ${i}`);
    steps.push(''); // should be filtered
    const s = sanitizeSnippet({ steps });
    expect(s.steps).not.toBeNull();
    expect(s.steps!.length).toBe(20);
    expect(sanitizeSnippet({ steps: ['x'.repeat(6000)] }).steps![0].length).toBe(5000);
  });

  it('treats an empty steps array as null, not []', () => {
    expect(sanitizeSnippet({ steps: [] }).steps).toBeNull();
  });

  it('sanitizes env: trims/caps keys, caps values, drops empty-key entries, caps at 20', () => {
    const env = Array.from({ length: 25 }, (_, i) => ({ key: `K${i}`, value: `v${i}` }));
    env.push({ key: '', value: 'dropped' });
    const s = sanitizeSnippet({ env });
    expect(s.env).not.toBeNull();
    expect(s.env!.length).toBe(20);
    expect(s.env!.every((e) => e.key)).toBe(true);
  });

  it('returns null env for a non-array or all-empty-key input', () => {
    expect(sanitizeSnippet({ env: 'not-an-array' }).env).toBeNull();
    expect(sanitizeSnippet({ env: [{ key: '', value: 'x' }] }).env).toBeNull();
  });

  it('sanitizes expect: null unless exitCode or outputContains is meaningfully set', () => {
    expect(sanitizeSnippet({ expect: {} }).expect).toBeNull();
    expect(sanitizeSnippet({ expect: { exitCode: 0 } }).expect).toEqual({ exitCode: 0, outputContains: null });
    expect(sanitizeSnippet({ expect: { outputContains: 'OK' } }).expect).toEqual({ exitCode: null, outputContains: 'OK' });
  });

  it('sanitizes schedule: unknown type falls back to interval, dailyTime validated by regex, cron defaults applied', () => {
    expect(sanitizeSnippet({ schedule: { enabled: true, type: 'bogus' } }).schedule?.type).toBe('interval');
    expect(sanitizeSnippet({ schedule: { enabled: true, type: 'daily', dailyTime: 'not-a-time' } }).schedule?.dailyTime).toBe(
      '09:00'
    );
    expect(sanitizeSnippet({ schedule: { enabled: true, type: 'daily', dailyTime: '14:30' } }).schedule?.dailyTime).toBe(
      '14:30'
    );
    expect(sanitizeSnippet({ schedule: { enabled: true, type: 'cron' } }).schedule?.cronExpr).toBe('*/15 * * * *');
  });

  it('re-sanitizing an already-sanitized snippet is idempotent', () => {
    const once = sanitizeSnippet({ name: 'Idempotent', shell: 'cmd', steps: ['a', 'b'], env: [{ key: 'K', value: 'v' }] });
    const twice = sanitizeSnippet(once as unknown as Record<string, unknown>);
    expect(twice).toEqual(once);
  });
});
