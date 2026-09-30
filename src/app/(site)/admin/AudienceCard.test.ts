import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { DateRange } from '@/data/telemetry/types';

const q = vi.hoisted(() => ({
  getLatestReportDate: vi.fn(),
  getSearchTotals: vi.fn(),
  getSearchVsDirect: vi.fn(),
  getReturningVsNew: vi.fn(),
  getDailyCounts: vi.fn(),
}));

vi.mock('@/data/gsc/queries', () => ({
  getLatestReportDate: q.getLatestReportDate,
  getSearchTotals: q.getSearchTotals,
}));
vi.mock('@/data/telemetry/queries', () => ({
  getSearchVsDirect: q.getSearchVsDirect,
  getReturningVsNew: q.getReturningVsNew,
  getDailyCounts: q.getDailyCounts,
}));
vi.mock('./deploy-markers', () => ({ loadDeployMarkers: async () => [] }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { AudienceCard } from './AudienceCard';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WEEK: DateRange = { from: day('2026-09-20'), to: day('2026-09-27') };

function stubTelemetry() {
  for (const fn of Object.values(q)) fn.mockReset();
  q.getSearchVsDirect.mockImplementation(async (range: DateRange) =>
    range.from.getTime() === WEEK.from.getTime() ? { referred: 60, direct: 40 } : { referred: 30, direct: 20 },
  );
  q.getReturningVsNew.mockResolvedValue({ newUsers: 3, returning: 4 });
  q.getDailyCounts.mockResolvedValue([]);
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const ranges = (fn: typeof q.getSearchTotals) =>
  fn.mock.calls.map(([range]) => [isoDay((range as DateRange).from), isoDay((range as DateRange).to)]);

async function render(rangeKey: '7d' | 'all', range: DateRange): Promise<string> {
  return renderToStaticMarkup(await AudienceCard({ rangeKey, range }));
}

test('compares a week of traffic and search against the week before, on Google’s own report days', async () => {
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
  vi.stubEnv('GSC_SITE_URL', 'sc-domain:lgi.tools');
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
  expect(ranges(q.getSearchVsDirect)).toEqual([
    ['2026-09-20', '2026-09-27'],
    ['2026-09-13', '2026-09-20'],
  ]);
  expect(q.getDailyCounts).toHaveBeenCalledTimes(2);
  expect(html).toContain('data-admin-audience');
  expect(html).toContain('1,400');
  expect(html).toContain('200 / day');
  expect(html).toContain('70,000');
});

test('skips search and prior-period queries it cannot answer', async () => {
  vi.stubEnv('GSC_SITE_URL', '');
  stubTelemetry();
  const allTime = await render('all', WEEK);
  expect(q.getLatestReportDate).not.toHaveBeenCalled();
  expect(q.getSearchTotals).not.toHaveBeenCalled();
  expect(q.getSearchVsDirect).toHaveBeenCalledTimes(1);
  expect(q.getReturningVsNew).toHaveBeenCalledTimes(1);
  expect(q.getDailyCounts).toHaveBeenCalledTimes(1);
  expect(allTime).toContain('—');
  expect(allTime).toContain('No page views in this range.');

  // Configured but Google has not reported a day yet.
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
  vi.stubEnv('GSC_SITE_URL', 'sc-domain:lgi.tools');
  stubTelemetry();
  q.getLatestReportDate.mockResolvedValue(null);
  await render('7d', WEEK);
  expect(q.getLatestReportDate).toHaveBeenCalledTimes(1);
  expect(q.getSearchTotals).not.toHaveBeenCalled();
  expect(q.getSearchVsDirect).toHaveBeenCalledTimes(2);
});

test('shows the section as unavailable when a query fails', async () => {
  stubTelemetry();
  q.getReturningVsNew.mockRejectedValue(new Error('db down'));
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const html = await render('7d', WEEK);
  expect(html).toContain('Unable to load this section.');
  expect(html).not.toContain('data-admin-audience');
  expect(error).toHaveBeenCalledWith('[admin] audience section unavailable', expect.any(Error));
});
