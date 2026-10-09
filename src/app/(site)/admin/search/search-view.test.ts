import { describe, expect, it } from 'vitest';
import { deriveGscPerformanceView, gscTermBars, searchSpan, sitemapNote, splitSearchPeriods } from './search-view';
import { searchPeriods } from './search-period';

const point = (day: string, clicks: number, impressions: number, position: number) => ({
  day,
  clicks,
  impressions,
  position,
});

describe('searchSpan', () => {
  it('reaches back to the previous period when there is one', () => {
    const { range, previous } = searchPeriods('7d', '2026-07-14');
    expect(searchSpan(range, previous)).toEqual({ from: previous!.from, to: range.to });
    expect(searchSpan(range, previous).from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('is the current range alone for all time', () => {
    const { range, previous } = searchPeriods('all', '2026-07-14');
    expect(searchSpan(range, previous)).toEqual(range);
  });
});

describe('splitSearchPeriods', () => {
  const { range, previous } = searchPeriods('7d', '2026-07-14');
  const points = [
    point('2026-07-01', 1, 10, 4),
    point('2026-07-07', 3, 30, 2),
    point('2026-07-08', 5, 100, 6),
    point('2026-07-10', 0, 0, 0),
    point('2026-07-14', 15, 300, 3),
  ];

  it('gives each inclusive window its own days and impression-weighted totals', () => {
    const split = splitSearchPeriods(points, range, previous);

    expect(split.trend.map((p) => p.day)).toEqual(['2026-07-08', '2026-07-10', '2026-07-14']);
    expect(split.totals).toEqual({ clicks: 20, impressions: 400, ctr: 0.05, position: (600 + 900) / 400 });
    expect(split.prevTotals).toEqual({ clicks: 4, impressions: 40, ctr: 0.1, position: (40 + 60) / 40 });
  });

  it('has no previous totals for all time, and zero totals for an empty window', () => {
    const all = searchPeriods('all', '2026-07-14');
    expect(splitSearchPeriods(points, all.range, all.previous).prevTotals).toBeNull();
    expect(splitSearchPeriods([], range, previous)).toEqual({
      trend: [],
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      prevTotals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    });
  });
});

describe('deriveGscPerformanceView', () => {
  it('builds the three trends with positions rounded to one decimal', () => {
    const view = deriveGscPerformanceView([
      point('2026-07-10', 5, 100, 4.27),
      point('2026-07-11', 8, 120, 3.81),
    ]);
    expect(view.hasTrend).toBe(true);
    expect(view.clicksTrend.points).toEqual([
      { x: 0, y: 5 },
      { x: 1, y: 8 },
    ]);
    expect(view.impressionsTrend.labels).toEqual(['2026-07-10', '2026-07-11']);
    expect(view.positionTrend.points).toEqual([
      { x: 0, y: 4.3 },
      { x: 1, y: 3.8 },
    ]);
  });

  it('reports no trend for an empty range', () => {
    expect(deriveGscPerformanceView([]).hasTrend).toBe(false);
  });
});

describe('gscTermBars', () => {
  it('ranks by clicks and keeps impressions, CTR and position for the line under the bar', () => {
    expect(gscTermBars([{ key: 'wormhole statics', clicks: 12, impressions: 3456, ctr: 0.0347, position: 4.26 }])).toEqual([
      {
        key: 'wormhole statics',
        label: 'wormhole statics',
        count: 12,
        sub: '3,456 impr · 3.5% CTR · pos 4.3',
      },
    ]);
  });
});

describe('sitemapNote', () => {
  it('pluralises its counts and adds the download day and pending state when known', () => {
    expect(
      sitemapNote({
        path: '/sitemap.xml',
        submitted: 120,
        errors: 1,
        warnings: 2,
        lastDownloaded: new Date('2026-10-08T05:00:00Z'),
        isPending: true,
      }),
    ).toBe('1 error · 2 warnings · downloaded 2026-10-08 · pending');
    expect(
      sitemapNote({ path: '/sitemap.xml', submitted: 0, errors: 0, warnings: 1, lastDownloaded: null, isPending: false }),
    ).toBe('0 errors · 1 warning');
  });
});
