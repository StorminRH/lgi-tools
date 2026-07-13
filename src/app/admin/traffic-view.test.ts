import { describe, expect, it } from 'vitest';
import { deriveGscPerformanceView, deriveTrafficView, formatSyncedAt } from './traffic-view';

describe('deriveTrafficView', () => {
  it('reshapes each list into keyed distribution rows', () => {
    const view = deriveTrafficView({
      topPages: [
        { path: '/a', count: 10 },
        { path: '/b', count: 4 },
      ],
      topReferrers: [{ host: 'g.com', count: 5 }],
      topEntryPages: [{ path: '/land', count: 2 }],
      topSearches: [{ query: 'ore', count: 9 }],
    });
    expect(view.topPages).toEqual([
      { key: '/a', label: '/a', count: 10 },
      { key: '/b', label: '/b', count: 4 },
    ]);
    expect(view.topReferrers[0]).toEqual({ key: 'g.com', label: 'g.com', count: 5 });
    expect(view.topSearches).toEqual([{ key: 'ore', label: 'ore', count: 9 }]);
  });

  it('maps an empty list to an empty array', () => {
    const view = deriveTrafficView({
      topPages: [],
      topReferrers: [],
      topEntryPages: [],
      topSearches: [],
    });
    expect(view.topPages).toEqual([]);
  });
});

describe('formatSyncedAt', () => {
  it('formats a UTC timestamp to the minute, or "never"', () => {
    expect(formatSyncedAt(new Date('2026-07-11T08:42:19.000Z'))).toBe('2026-07-11 08:42 UTC');
    expect(formatSyncedAt(null)).toBe('never');
  });
});

describe('deriveGscPerformanceView', () => {
  it('builds the three trends, the top-pages max, and the sync stamp', () => {
    const view = deriveGscPerformanceView({
      lastSyncedAt: new Date('2026-07-11T08:42:19.000Z'),
      trend: [
        { day: '2026-07-10', clicks: 5, impressions: 100, position: 4.27 },
        { day: '2026-07-11', clicks: 8, impressions: 120, position: 3.81 },
      ],
      topPages: [{ clicks: 6 }, { clicks: 2 }],
    });
    expect(view.hasTrend).toBe(true);
    expect(view.clicksTrend.points).toEqual([
      { x: 0, y: 5 },
      { x: 1, y: 8 },
    ]);
    expect(view.positionTrend.points).toEqual([
      { x: 0, y: 4.3 },
      { x: 1, y: 3.8 },
    ]);
    expect(view.topPagesMax).toBe(6);
    expect(view.asOf).toBe('2026-07-11 08:42 UTC');
  });

  it('reports no trend for an empty range', () => {
    expect(
      deriveGscPerformanceView({ lastSyncedAt: null, trend: [], topPages: [] }).hasTrend,
    ).toBe(false);
  });
});
