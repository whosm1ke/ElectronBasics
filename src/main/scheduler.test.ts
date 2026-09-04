// Covers the hand-rolled cron matcher and the interval/daily/cron
// due-check logic (CLAUDE.md: "a minimal hand-rolled 5-field matcher...
// supports *, */n, ranges, comma lists, no seconds/years/named months").
import { describe, it, expect } from 'vitest';
import { cronMatches, isScheduleDue } from './scheduler';
import type { ScheduleConfig } from '@shared/types';

describe('cronMatches', () => {
  it('matches a bare wildcard expression against any time', () => {
    expect(cronMatches('* * * * *', new Date(2026, 0, 1, 13, 37))).toBe(true);
  });

  it('matches an exact field value', () => {
    expect(cronMatches('30 14 * * *', new Date(2026, 0, 1, 14, 30))).toBe(true);
    expect(cronMatches('30 14 * * *', new Date(2026, 0, 1, 14, 31))).toBe(false);
  });

  it('matches a step expression (*/n)', () => {
    expect(cronMatches('*/15 * * * *', new Date(2026, 0, 1, 0, 0))).toBe(true);
    expect(cronMatches('*/15 * * * *', new Date(2026, 0, 1, 0, 15))).toBe(true);
    expect(cronMatches('*/15 * * * *', new Date(2026, 0, 1, 0, 10))).toBe(false);
  });

  it('matches a range expression', () => {
    expect(cronMatches('* 9-17 * * *', new Date(2026, 0, 1, 12, 0))).toBe(true);
    expect(cronMatches('* 9-17 * * *', new Date(2026, 0, 1, 20, 0))).toBe(false);
  });

  it('matches a comma list', () => {
    expect(cronMatches('0,30 * * * *', new Date(2026, 0, 1, 5, 30))).toBe(true);
    expect(cronMatches('0,30 * * * *', new Date(2026, 0, 1, 5, 15))).toBe(false);
  });

  it('rejects a malformed expression instead of throwing', () => {
    expect(cronMatches('not a cron expr', new Date())).toBe(false);
    expect(cronMatches('* * * *', new Date())).toBe(false); // only 4 fields
  });
});

describe('isScheduleDue', () => {
  const base: ScheduleConfig = {
    enabled: true,
    type: 'interval',
    intervalMinutes: 60,
    dailyTime: '09:00',
    cronExpr: '*/15 * * * *',
    lastRunAt: null,
  };

  it('is never due when disabled', () => {
    expect(isScheduleDue({ ...base, enabled: false }, new Date())).toBe(false);
  });

  it('is never due for a null schedule', () => {
    expect(isScheduleDue(null, new Date())).toBe(false);
  });

  describe('interval', () => {
    it('is due immediately if it has never run', () => {
      expect(isScheduleDue({ ...base, lastRunAt: null }, new Date())).toBe(true);
    });

    it('is due once intervalMinutes has elapsed, not before', () => {
      const now = new Date(2026, 0, 1, 12, 0, 0);
      const justUnder = new Date(now.getTime() - 59 * 60000).toISOString();
      const justOver = new Date(now.getTime() - 61 * 60000).toISOString();
      expect(isScheduleDue({ ...base, lastRunAt: justUnder }, now)).toBe(false);
      expect(isScheduleDue({ ...base, lastRunAt: justOver }, now)).toBe(true);
    });
  });

  describe('daily', () => {
    it('is not due before today\'s slot', () => {
      const now = new Date(2026, 0, 1, 8, 59);
      expect(isScheduleDue({ ...base, type: 'daily', dailyTime: '09:00', lastRunAt: null }, now)).toBe(false);
    });

    it('is due once today\'s slot has passed and it has not already run since', () => {
      const now = new Date(2026, 0, 1, 9, 1);
      expect(isScheduleDue({ ...base, type: 'daily', dailyTime: '09:00', lastRunAt: null }, now)).toBe(true);
    });

    it('fires only once per day, not on every tick after the slot passes', () => {
      const now = new Date(2026, 0, 1, 9, 5);
      const alreadyRanToday = new Date(2026, 0, 1, 9, 1).toISOString();
      expect(isScheduleDue({ ...base, type: 'daily', dailyTime: '09:00', lastRunAt: alreadyRanToday }, now)).toBe(false);
    });
  });

  describe('cron', () => {
    it('debounces within 55 seconds of the last run even if the expression matches', () => {
      const now = new Date(2026, 0, 1, 12, 0, 0);
      const justRan = new Date(now.getTime() - 30_000).toISOString();
      expect(isScheduleDue({ ...base, type: 'cron', cronExpr: '* * * * *', lastRunAt: justRan }, now)).toBe(false);
    });

    it('is due when the expression matches and the debounce window has passed', () => {
      const now = new Date(2026, 0, 1, 12, 0, 0);
      const longAgo = new Date(now.getTime() - 120_000).toISOString();
      expect(isScheduleDue({ ...base, type: 'cron', cronExpr: '* * * * *', lastRunAt: longAgo }, now)).toBe(true);
    });
  });
});
