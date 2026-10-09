import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../deploy-markers', () => ({ loadDeployMarkers: async () => [] }));

import { loadTrafficActivity, loadTrafficRankings, loadVisitors, VisitorsBody } from './TrafficCards';

const range: DateRange = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-03T00:00:00Z') };
const previous: DateRange = { from: new Date('2026-09-29T00:00:00Z'), to: range.from };

function days(...rows: [string, number, number, number][]) {
  return rows.map(([day, views, entries, referrals]) => ({ day, views, entries, referrals }));
}

beforeEach(() => {
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
});

describe('traffic loads', () => {
  it('ranks each list against the total its shares are of', async () => {
    const { lists, totals } = await loadTrafficRankings(range, previous);

    expect(lists.topPages).toEqual([{ key: '/sites', label: '/sites', count: 7 }]);
    expect(lists.topReferrers).toEqual([{ key: 'google.com', label: 'google.com', count: 1 }]);
    expect(totals).toEqual({ views: 10, entries: 3, referrals: 1 });
    expect(mocks.stats).toHaveBeenCalledWith(range, previous);
  });

  it('builds the activity chart from the same page-view read', async () => {
    const activity = await loadTrafficActivity(range, previous);

    expect(activity.hasData).toBe(true);
    expect(activity.totalValue).toBe(10);
  });

  it('splits visitors by source, novelty and sign-in count', async () => {
    const visitors = await loadVisitors(range, previous);

    expect(visitors.sources).toEqual({ referred: 1, direct: 9 });
    expect(visitors.returningVsNew).toEqual({ newUsers: 1, returning: 3 });
    expect(visitors.signedIn).toBe(2);
    expect(visitors.buckets.reduce((sum, bucket) => sum + bucket.users, 0)).toBe(2);
  });
});

describe('VisitorsBody', () => {
  it('draws both share bars and counts users per sign-in bucket', async () => {
    const html = renderToStaticMarkup(createElement(VisitorsBody, { visitors: await loadVisitors(range, previous) }));

    expect(html).toContain('aria-label="Referred versus unattributed page views: Referred 1, Unattributed 9"');
    expect(html).toContain('aria-label="New versus returning active users: New 1, Returning 3"');
    expect(html).toContain('1 user ·');
    expect(html).not.toContain('No sign-ins');
  });

  it('says there is nothing to split rather than leaving the sub-headings bare', () => {
    const html = renderToStaticMarkup(
      createElement(VisitorsBody, {
        visitors: {
          sources: { referred: 0, direct: 0 },
          returningVsNew: { newUsers: 0, returning: 0 },
          signedIn: 0,
          buckets: [],
        },
      }),
    );

    expect(html).toContain('Page-view sources');
    expect(html).toContain('No page views in this range.');
    expect(html).toContain('New vs returning users');
    expect(html).toContain('No active users in this range.');
    expect(html).toContain('No sign-ins in this range.');
    expect(html).not.toContain('role="img"');
  });
});
