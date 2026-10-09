import { describe, expect, it } from 'vitest';
import {
  pageViewSources,
  pageViewTotals,
  readWindow,
  splitAudience,
  splitPageViewPeriods,
  splitRankings,
  type PageViewPeriodRow,
} from './page-view-stats';

const RANGE = { from: new Date('2026-07-08T09:00:00Z'), to: new Date('2026-07-15T09:00:00Z') };
const PREVIOUS = { from: new Date('2026-07-01T09:00:00Z'), to: RANGE.from };

describe('readWindow', () => {
  it('reads the range alone, or from the previous start to the range end', () => {
    expect(readWindow(RANGE, null)).toBe(RANGE);
    expect(readWindow(RANGE, PREVIOUS)).toEqual({ from: PREVIOUS.from, to: RANGE.to });
  });

  it('refuses a previous period with a gap or overlap', () => {
    for (const to of [new Date('2026-07-08T08:00:00Z'), new Date('2026-07-08T10:00:00Z')]) {
      expect(() => readWindow(RANGE, { from: PREVIOUS.from, to })).toThrow(
        'The previous period must end where the range starts.',
      );
    }
  });
});

describe('splitPageViewPeriods', () => {
  // Raw counts arrive as strings from some drivers.
  const row = (current: boolean, day: string, views: number | string, entries = 0, referrals = 0) =>
    ({ current, day, views, entries, referrals }) as PageViewPeriodRow;

  it('splits days by period, in day order, with numeric counts', () => {
    const rows = [
      row(true, '2026-07-09', '4', 1, 2),
      row(false, '2026-07-08', 3),
      row(true, '2026-07-08', 5),
      row(false, '2026-07-02', 1),
    ];
    expect(splitPageViewPeriods(rows, true)).toEqual({
      current: [
        { day: '2026-07-08', views: 5, entries: 0, referrals: 0 },
        { day: '2026-07-09', views: 4, entries: 1, referrals: 2 },
      ],
      previous: [
        { day: '2026-07-02', views: 1, entries: 0, referrals: 0 },
        { day: '2026-07-08', views: 3, entries: 0, referrals: 0 },
      ],
    });
  });

  it('reports no previous period when none was asked for', () => {
    expect(splitPageViewPeriods([row(true, '2026-07-09', 2)], false)).toEqual({
      current: [{ day: '2026-07-09', views: 2, entries: 0, referrals: 0 }],
      previous: null,
    });
    expect(splitPageViewPeriods([], true)).toEqual({ current: [], previous: [] });
  });
});

describe('page-view totals and sources', () => {
  const days = [
    { day: '2026-07-08', views: 10, entries: 4, referrals: 3 },
    { day: '2026-07-09', views: 6, entries: 1, referrals: 0 },
  ];

  it('sums the days', () => {
    expect(pageViewTotals(days)).toEqual({ views: 16, entries: 5, referrals: 3 });
    expect(pageViewTotals([])).toEqual({ views: 0, entries: 0, referrals: 0 });
  });

  it('counts every view without a referral as direct', () => {
    expect(pageViewSources(days)).toEqual({ referred: 3, direct: 13 });
    expect(pageViewSources([])).toEqual({ referred: 0, direct: 0 });
  });
});

describe('splitAudience', () => {
  const row = { newUsers: 2, returning: 5, previousNew: 1, previousReturning: 4 };

  it('splits the counts into the range and the previous period', () => {
    expect(splitAudience(row, true)).toEqual({
      current: { newUsers: 2, returning: 5 },
      previous: { newUsers: 1, returning: 4 },
    });
    expect(splitAudience(row, false)).toEqual({ current: { newUsers: 2, returning: 5 }, previous: null });
  });

  it('reads a missing row as no users', () => {
    expect(splitAudience(undefined, true)).toEqual({
      current: { newUsers: 0, returning: 0 },
      previous: { newUsers: 0, returning: 0 },
    });
  });
});

describe('splitRankings', () => {
  it('splits ranked rows into the three lists, keeping their order', () => {
    expect(
      splitRankings([
        { list: 'pages', value: '/sites', count: 9 },
        { list: 'entries', value: '/', count: '4' as unknown as number },
        { list: 'pages', value: '/', count: 7 },
        { list: 'referrers', value: 'google.com', count: 2 },
      ]),
    ).toEqual({
      topPages: [
        { path: '/sites', count: 9 },
        { path: '/', count: 7 },
      ],
      topEntryPages: [{ path: '/', count: 4 }],
      topReferrers: [{ host: 'google.com', count: 2 }],
    });
    expect(splitRankings([])).toEqual({ topPages: [], topEntryPages: [], topReferrers: [] });
  });
});
