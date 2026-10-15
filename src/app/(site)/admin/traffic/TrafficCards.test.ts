import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { DateRange } from '@/data/telemetry/types';

const mocks = vi.hoisted(() => ({
  stats: vi.fn(),
  rankings: vi.fn(),
  logins: vi.fn(),
  audience: vi.fn(),
}));

vi.mock('../shared-reads', () => ({
  getPageViewStatsShared: mocks.stats,
  getPageViewRankingsShared: mocks.rankings,
}));
vi.mock('@/data/telemetry/queries', () => ({
  getLoginCountsPerUser: mocks.logins,
  getReturningVsNew: mocks.audience,
}));

import { loadTrafficRankings, loadVisitors, VisitorsBody } from './TrafficCards';

const range: DateRange = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-03T00:00:00Z') };
const previous: DateRange = { from: new Date('2026-09-29T00:00:00Z'), to: range.from };

function days(...rows: [string, number, number, number][]) {
  return rows.map(([day, views, entries, referrals]) => ({ day, views, entries, referrals }));
}

function stubTrafficReads() {
  vi.clearAllMocks();
  mocks.stats.mockResolvedValue({
    current: days(['2026-10-01', 6, 2, 1], ['2026-10-02', 4, 1, 0]),
    previous: days(['2026-09-30', 3, 1, 0]),
  });
  mocks.rankings.mockResolvedValue({
    topPages: [{ path: '/sites', count: 7 }],
    topEntryPages: [{ path: '/', count: 3 }],
    topReferrers: [{ host: 'google.com', count: 1 }],
  });
  mocks.logins.mockResolvedValue([1, 4]);
  mocks.audience.mockResolvedValue({ current: { newUsers: 1, returning: 3 }, previous: null });
}

test('ranks each list against the total its shares are of', async () => {
  stubTrafficReads();

  const { lists, totals } = await loadTrafficRankings(range, previous);

  expect(lists.topPages).toEqual([{ key: '/sites', label: '/sites', count: 7 }]);
  expect(lists.topReferrers).toEqual([{ key: 'google.com', label: 'google.com', count: 1 }]);
  expect(totals).toEqual({ views: 10, entries: 3, referrals: 1 });
  expect(mocks.stats).toHaveBeenCalledWith(range, previous);
});

test('splits visitors by source, novelty and sign-in count, and says so when there is nothing to split', async () => {
  stubTrafficReads();

  const visitors = await loadVisitors(range, previous);

  expect(visitors.sources).toEqual({ referred: 1, direct: 9 });
  expect(visitors.returningVsNew).toEqual({ newUsers: 1, returning: 3 });
  expect(visitors.signedIn).toBe(2);
  expect(visitors.buckets.reduce((sum, bucket) => sum + bucket.users, 0)).toBe(2);
  const html = renderToStaticMarkup(createElement(VisitorsBody, { visitors }));
  expect(html).toContain('aria-label="Referred versus unattributed page views: Referred 1, Unattributed 9"');
  expect(html).toContain('aria-label="New versus returning active users: New 1, Returning 3"');
  expect(html).toContain('1 user ·');
  expect(html).not.toContain('No page views in this range.');
  expect(html).not.toContain('No sign-ins');

  const empty = renderToStaticMarkup(
    createElement(VisitorsBody, {
      visitors: {
        sources: { referred: 0, direct: 0 },
        returningVsNew: { newUsers: 0, returning: 0 },
        signedIn: 0,
        buckets: [],
      },
    }),
  );
  expect(empty).toContain('No page views in this range.');
  expect(empty).toContain('No active users in this range.');
  expect(empty).toContain('No sign-ins in this range.');
  expect(empty).not.toContain('role="img"');
});
