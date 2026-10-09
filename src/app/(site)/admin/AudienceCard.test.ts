import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { DateRange } from '@/data/telemetry/types';

const q = vi.hoisted(() => ({
  getLatestReportDate: vi.fn(),
  getSearchTotals: vi.fn(),
  getPageViewStats: vi.fn(),
  getReturningVsNew: vi.fn(),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));
vi.mock('@/data/gsc/queries', () => ({
  getLatestReportDate: q.getLatestReportDate,
  getSearchTotals: q.getSearchTotals,
}));
vi.mock('@/data/telemetry/queries', () => ({
  getReturningVsNew: q.getReturningVsNew,
}));
vi.mock('./shared-reads', () => ({
  getPageViewStatsShared: q.getPageViewStats,
}));
vi.mock('./deploy-markers', () => ({ loadDeployMarkers: async () => [] }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { AudienceBody, AudienceLinks, loadAudience } from './AudienceCard';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WEEK: DateRange = { from: day('2026-09-20'), to: day('2026-09-27') };

function stubTelemetry() {
  for (const fn of Object.values(q)) fn.mockReset();
  q.getPageViewStats.mockImplementation(async (_range: DateRange, previous: DateRange | null) => ({
    current: [],
    previous: previous === null ? null : [],
  }));
  q.getReturningVsNew.mockImplementation(async (_range: DateRange, previous: DateRange | null) => ({
    current: { newUsers: 3, returning: 4 },
    previous: previous === null ? null : { newUsers: 1, returning: 1 },
  }));
}

function connectSearchConsole() {
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
  vi.stubEnv('GSC_SITE_URL', 'sc-domain:lgi.tools');
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const ranges = (fn: typeof q.getSearchTotals) =>
  fn.mock.calls.map(([range]) => [isoDay((range as DateRange).from), isoDay((range as DateRange).to)]);
const periods = (fn: typeof q.getPageViewStats) =>
  fn.mock.calls.map(([range, previous]) =>
    [range, previous].map((period) => period && [isoDay((period as DateRange).from), isoDay((period as DateRange).to)]),
  );

async function render(rangeKey: '7d' | 'all', range: DateRange): Promise<string> {
  return renderToStaticMarkup(createElement(AudienceBody, { audience: await loadAudience(rangeKey, range) }));
}

test('compares a week of traffic and search against the week before, on Google’s own report days', async () => {
  connectSearchConsole();
  stubTelemetry();
  q.getLatestReportDate.mockResolvedValue('2026-09-25');
  q.getSearchTotals.mockImplementation(async (range: DateRange) =>
    range.to.getTime() === day('2026-09-25').getTime()
      ? { clicks: 1_400, impressions: 70_000 }
      : { clicks: 700, impressions: 70_000 },
  );

  const html = await render('7d', WEEK);

  expect(ranges(q.getSearchTotals)).toEqual([
    ['2026-09-19', '2026-09-25'],
    ['2026-09-12', '2026-09-18'],
  ]);
  const weekAndBefore = [
    ['2026-09-20', '2026-09-27'],
    ['2026-09-13', '2026-09-20'],
  ];
  expect(periods(q.getPageViewStats)).toEqual([weekAndBefore]);
  expect(periods(q.getReturningVsNew)).toEqual([weekAndBefore]);
  expect(html).toContain('1,400');
  expect(html).toContain('200 / day');
  expect(html).toContain('70,000');
});

test('starts the usage reads without waiting for Google’s latest report day', async () => {
  connectSearchConsole();
  stubTelemetry();
  let reportDay: (day: string | null) => void = () => undefined;
  q.getLatestReportDate.mockReturnValue(new Promise((resolve) => { reportDay = resolve; }));

  const loading = loadAudience('7d', WEEK);
  await Promise.resolve();

  expect(q.getPageViewStats).toHaveBeenCalledTimes(1);
  expect(q.getReturningVsNew).toHaveBeenCalledTimes(1);
  expect(q.getSearchTotals).not.toHaveBeenCalled();
  reportDay(null);
  await loading;
  expect(q.getSearchTotals).not.toHaveBeenCalled();
});

test('skips search and prior-period queries it cannot answer', async () => {
  vi.stubEnv('GSC_SITE_URL', '');
  stubTelemetry();
  const allTime = await render('all', WEEK);
  expect(q.getLatestReportDate).not.toHaveBeenCalled();
  expect(q.getSearchTotals).not.toHaveBeenCalled();
  expect(periods(q.getPageViewStats)).toEqual([[['2026-09-20', '2026-09-27'], null]]);
  expect(periods(q.getReturningVsNew)).toEqual([[['2026-09-20', '2026-09-27'], null]]);
  expect(allTime).toContain('—');
  expect(allTime).toContain('No page views in this range.');

  // Configured but Google has not reported a day yet.
  connectSearchConsole();
  stubTelemetry();
  q.getLatestReportDate.mockResolvedValue(null);
  await render('7d', WEEK);
  expect(q.getLatestReportDate).toHaveBeenCalledTimes(1);
  expect(q.getSearchTotals).not.toHaveBeenCalled();
  expect(q.getPageViewStats).toHaveBeenCalledTimes(1);
});

test('marks only the search figures when Search Console cannot be read', async () => {
  connectSearchConsole();
  stubTelemetry();
  q.getLatestReportDate.mockRejectedValue(new Error('gsc down'));
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const audience = await loadAudience('7d', WEEK);

  expect(audience.rows.map((row) => [row.label, row.value, row.note])).toEqual([
    ['Page views', '0', '0.0 / day'],
    ['Active users', '7', undefined],
    ['Search clicks', '—', 'unavailable'],
    ['Search impressions', '—', 'unavailable'],
  ]);
  expect(error).toHaveBeenCalledWith('[admin] audience.search section unavailable', expect.any(Error));
});

test('fails as a whole when a usage read fails, for its section to catch', async () => {
  stubTelemetry();
  q.getReturningVsNew.mockRejectedValue(new Error('db down'));
  await expect(loadAudience('7d', WEEK)).rejects.toThrow('db down');
});

test('renders the tiles without empty chart slots, and links to the detail pages', async () => {
  stubTelemetry();
  const html = await render('7d', WEEK);
  expect(html).not.toContain('<dd class="mt-1"></dd>');
  expect(html.match(/<dt /g)).toHaveLength(4);

  const links = renderToStaticMarkup(createElement(AudienceLinks));
  expect(links).toContain('href="/admin/traffic"');
  expect(links).toContain('href="/admin/search"');
});

test('labels the activity total like the tiles above it', async () => {
  stubTelemetry();
  q.getPageViewStats.mockResolvedValue({
    current: [{ day: '2026-09-21', views: 1_250, entries: 0, referrals: 0 }],
    previous: [{ day: '2026-09-14', views: 1_000, entries: 0, referrals: 0 }],
  });

  const html = await render('7d', WEEK);

  expect(html).toContain('tabular-nums">1,250</span><span class="font-ui uppercase text-label text-muted font-medium tracking-eyebrow">page views</span>');
  expect(html).toContain('<span class="sr-only">up 25%</span>');
});
