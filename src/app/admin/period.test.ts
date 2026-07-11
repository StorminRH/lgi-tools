import { describe, expect, it } from 'vitest';
import {
  ALL_TIME_FROM,
  buildKpiCards,
  computeDelta,
  parseRange,
  previousRange,
  rangeFor,
} from './period';

const NOW = new Date('2026-06-09T12:00:00Z');

describe('parseRange', () => {
  it('defaults to 30d on missing or junk input', () => {
    expect(parseRange(undefined)).toBe('30d');
    expect(parseRange(['7d'])).toBe('30d');
    expect(parseRange('14d')).toBe('30d');
  });

  it('accepts every known key', () => {
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange('90d')).toBe('90d');
    expect(parseRange('all')).toBe('all');
  });
});

describe('rangeFor + previousRange', () => {
  it('7d window is exactly 7 days ending now', () => {
    const r = rangeFor('7d', NOW);
    expect(r.to).toEqual(NOW);
    expect(NOW.getTime() - r.from.getTime()).toBe(7 * 24 * 3_600_000);
  });

  it('previous window has the same length and ends where the current begins', () => {
    for (const key of ['7d', '30d', '90d'] as const) {
      const current = rangeFor(key, NOW);
      const prev = previousRange(key, current);
      expect(prev).not.toBeNull();
      expect(prev?.to).toEqual(current.from);
      expect(prev!.to.getTime() - prev!.from.getTime()).toBe(
        current.to.getTime() - current.from.getTime(),
      );
    }
  });

  it('all has a fixed floor and no previous window', () => {
    const r = rangeFor('all', NOW);
    expect(r.from).toEqual(ALL_TIME_FROM);
    expect(previousRange('all', r)).toBeNull();
  });
});

describe('computeDelta', () => {
  it('null when there is no previous window', () => {
    expect(computeDelta(100, null)).toBeNull();
  });

  it('previous of zero reads as "new" (no ratio), flat when both are zero', () => {
    expect(computeDelta(5, 0)).toEqual({ pct: null, direction: 'up' });
    expect(computeDelta(0, 0)).toEqual({ pct: null, direction: 'flat' });
  });

  it('up and down with rounded percentages', () => {
    expect(computeDelta(150, 100)).toEqual({ pct: 50, direction: 'up' });
    expect(computeDelta(75, 100)).toEqual({ pct: -25, direction: 'down' });
    expect(computeDelta(101, 300)).toEqual({ pct: -66, direction: 'down' });
  });

  it('changes inside the flat band read as flat', () => {
    expect(computeDelta(1002, 1000)).toEqual({ pct: 0, direction: 'flat' });
    expect(computeDelta(998, 1000)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('a drop to zero is -100%', () => {
    expect(computeDelta(0, 40)).toEqual({ pct: -100, direction: 'down' });
  });
});

describe('buildKpiCards', () => {
  const pageViews = { referred: 30, direct: 70 };
  const users = { newUsers: 4, returning: 6 };
  const gscTotals = { clicks: 200, impressions: 5000, ctr: 0.04, position: 12.3 };

  it('derives the page-view and user cards with deltas vs the previous window', () => {
    const cards = buildKpiCards({
      pageViews,
      users,
      gscTotals: null,
      prevPageViews: { referred: 10, direct: 40 },
      prevUsers: { newUsers: 2, returning: 3 },
      prevGscTotals: null,
    });
    expect(cards[0]).toEqual({
      label: 'Page views',
      value: '100',
      sub: '30% via external referrers',
      delta: { pct: 100, direction: 'up' },
    });
    expect(cards[1]!.value).toBe('10');
    expect(cards[1]!.sub).toBe('4 new · 6 returning');
  });

  it('shows the no-views placeholder when the page-view total is zero', () => {
    const cards = buildKpiCards({
      pageViews: { referred: 0, direct: 0 },
      users,
      gscTotals: null,
      prevPageViews: null,
      prevUsers: null,
      prevGscTotals: null,
    });
    expect(cards[0]!.sub).toBe('no page views this period');
    expect(cards[0]!.delta).toBeNull();
  });

  it('degrades the GSC cards to a not-connected placeholder when GSC is off', () => {
    const cards = buildKpiCards({
      pageViews,
      users,
      gscTotals: null,
      prevPageViews: null,
      prevUsers: null,
      prevGscTotals: null,
    });
    expect(cards[2]).toMatchObject({ value: '—', sub: 'GSC not connected', delta: null });
    expect(cards[3]).toMatchObject({ value: '—', sub: 'GSC not connected', delta: null });
  });

  it('renders the GSC cards with CTR/position subs when connected', () => {
    const cards = buildKpiCards({
      pageViews,
      users,
      gscTotals,
      prevPageViews: null,
      prevUsers: null,
      prevGscTotals: { clicks: 100, impressions: 2500 },
    });
    expect(cards[2]).toMatchObject({ value: '200', sub: '4.0% CTR' });
    expect(cards[3]).toMatchObject({ value: '5,000', sub: 'avg position 12.3' });
    expect(cards[2]!.delta).toEqual({ pct: 100, direction: 'up' });
  });
});
