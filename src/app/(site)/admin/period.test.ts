import { describe, expect, it } from 'vitest';
import {
  ALL_TIME_FROM,
  computeDelta,
  lastNDaysRange,
  parseRange,
  previousRange,
  rangeFor,
} from './period';

const NOW = new Date('2026-06-09T12:00:00Z');

describe('admin period', () => {
  it('parses ranges, mirrors previous windows, and computes deltas', () => {
    expect(parseRange(undefined)).toBe('30d');
    expect(parseRange(['7d'])).toBe('7d');
    expect(parseRange(['90d', '7d'])).toBe('90d');
    expect(parseRange(['bogus', '7d'])).toBe('30d');
    expect(parseRange([])).toBe('30d');
    expect(parseRange('14d')).toBe('30d');
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange('90d')).toBe('90d');
    expect(parseRange('all')).toBe('all');

    for (const [key, days] of [['7d', 7], ['30d', 30], ['90d', 90]] as const) {
      const current = rangeFor(key, NOW);
      expect(current.to).toEqual(NOW);
      expect(NOW.getTime() - current.from.getTime()).toBe(days * 24 * 3_600_000);
      const prev = previousRange(key, current);
      expect(prev?.to).toEqual(current.from);
      expect(prev!.to.getTime() - prev!.from.getTime()).toBe(
        current.to.getTime() - current.from.getTime(),
      );
    }
    expect(rangeFor('all', NOW).from).toEqual(ALL_TIME_FROM);

    const midMinute = new Date('2026-06-09T12:00:30.250Z');
    expect(rangeFor('30d', midMinute)).toEqual(rangeFor('30d', new Date('2026-06-09T12:00:59.999Z')));
    expect(rangeFor('30d', midMinute).to).toEqual(new Date('2026-06-09T12:01:00Z'));
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

  it('reads the last N days up to the given instant, without rounding it', () => {
    const now = new Date('2026-05-25T12:00:30.250Z');
    expect(lastNDaysRange(7, now)).toEqual({
      from: new Date('2026-05-18T12:00:30.250Z'),
      to: new Date('2026-05-25T12:00:30.250Z'),
    });
    expect(lastNDaysRange(1, now).from).toEqual(new Date('2026-05-24T12:00:30.250Z'));
    expect(lastNDaysRange(30, now).from).toEqual(new Date('2026-04-25T12:00:30.250Z'));
  });
});
