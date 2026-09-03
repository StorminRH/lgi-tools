import { describe, expect, it } from 'vitest';
import {
  ALL_TIME_FROM,
  computeDelta,
  parseRange,
  previousRange,
  rangeFor,
} from '@/composition/admin-period';

const NOW = new Date('2026-06-09T12:00:00Z');

describe('admin period', () => {
  it('parses ranges, mirrors previous windows, and computes deltas', () => {
    expect(parseRange(undefined)).toBe('30d');
    expect(parseRange(['7d'])).toBe('30d');
    expect(parseRange('14d')).toBe('30d');
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange('90d')).toBe('90d');
    expect(parseRange('all')).toBe('all');

    const week = rangeFor('7d', NOW);
    expect(week.to).toEqual(NOW);
    expect(NOW.getTime() - week.from.getTime()).toBe(7 * 24 * 3_600_000);
    for (const key of ['7d', '30d', '90d'] as const) {
      const current = rangeFor(key, NOW);
      const prev = previousRange(key, current);
      expect(prev?.to).toEqual(current.from);
      expect(prev!.to.getTime() - prev!.from.getTime()).toBe(
        current.to.getTime() - current.from.getTime(),
      );
    }
    expect(rangeFor('all', NOW).from).toEqual(ALL_TIME_FROM);
    expect(previousRange('all', rangeFor('all', NOW))).toBeNull();

    expect(computeDelta(100, null)).toBeNull();
    expect(computeDelta(5, 0)).toEqual({ pct: null, direction: 'up' });
    expect(computeDelta(0, 0)).toEqual({ pct: null, direction: 'flat' });
    expect(computeDelta(150, 100)).toEqual({ pct: 50, direction: 'up' });
    expect(computeDelta(75, 100)).toEqual({ pct: -25, direction: 'down' });
    expect(computeDelta(101, 300)).toEqual({ pct: -66, direction: 'down' });
    expect(computeDelta(1002, 1000)).toEqual({ pct: 0, direction: 'flat' });
    expect(computeDelta(998, 1000)).toEqual({ pct: 0, direction: 'flat' });
    expect(computeDelta(0, 40)).toEqual({ pct: -100, direction: 'down' });
  });
});
