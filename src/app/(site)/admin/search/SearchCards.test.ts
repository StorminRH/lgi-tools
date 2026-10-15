import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latestDay: vi.fn(),
  trend: vi.fn(),
  queries: vi.fn(),
  pages: vi.fn(),
  sitemapEntries: vi.fn(),
  latestCoverage: vi.fn(),
  coverageTrend: vi.fn(),
}));

vi.mock('../shared-reads', () => ({
  getLatestReportDateShared: mocks.latestDay,
  getSearchTrendShared: mocks.trend,
}));
vi.mock('@/data/gsc/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/gsc/queries')>()),
  getTopQueries: mocks.queries,
  getTopGscPages: mocks.pages,
  getLatestUrlCoverage: mocks.latestCoverage,
  getCoverageTrend: mocks.coverageTrend,
}));
vi.mock('@/composition/sitemap', () => ({ getSitemapEntries: mocks.sitemapEntries }));

import { deriveGscCoverageView } from '../gsc-coverage-view';
import { IndexCoverageBody, loadIndexCoverage } from './IndexCoverageCard';
import { loadSearchPerformance, loadSearchTerms, PerformanceBody, SitemapList } from './SearchCards';

const point = (day: string, clicks: number) => ({ day, clicks, impressions: clicks * 10, position: 3 });

function stubSearchReads() {
  vi.clearAllMocks();
  mocks.latestDay.mockResolvedValue('2026-07-14');
  mocks.trend.mockResolvedValue([point('2026-07-01', 4), point('2026-07-10', 6), point('2026-07-14', 14)]);
  mocks.queries.mockResolvedValue([{ key: 'statics', clicks: 5, impressions: 50, ctr: 0.1, position: 2 }]);
  mocks.pages.mockResolvedValue([]);
  mocks.sitemapEntries.mockResolvedValue([{ url: 'https://lgi.tools/' }, { url: 'https://lgi.tools/sites' }]);
  mocks.latestCoverage.mockResolvedValue([
    { inspectionDate: '2026-07-12', url: 'https://lgi.tools/', verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: null },
    { inspectionDate: null, url: 'https://lgi.tools/sites', verdict: null, coverageState: null, lastCrawlTime: null },
  ]);
  mocks.coverageTrend.mockResolvedValue([{ day: '2026-07-12', indexed: 1, notIndexed: 0 }]);
}

test('counts the performance window back from the newest reported day and draws its tiles, or says nothing is synced', async () => {
  stubSearchReads();

  const performance = await loadSearchPerformance('7d');

  expect(performance.trend.map((day) => day.day)).toEqual(['2026-07-10', '2026-07-14']);
  expect(performance.totals.clicks).toBe(20);
  expect(performance.prevTotals?.clicks).toBe(4);
  const html = renderToStaticMarkup(createElement(PerformanceBody, { performance }));
  expect(html).toContain('Clicks');
  expect(html).toContain('Avg position');
  expect(html).not.toContain('No Search Console data');

  const empty = renderToStaticMarkup(
    createElement(PerformanceBody, {
      performance: { trend: [], totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, prevTotals: null },
    }),
  );
  expect(empty).toContain('No Search Console data synced yet for this range.');
});

test('pairs each term list with the clicks its shares are of', async () => {
  stubSearchReads();

  const queries = await loadSearchTerms('queries', '7d');
  const pages = await loadSearchTerms('pages', '7d');

  expect(queries).toEqual({ terms: [expect.objectContaining({ key: 'statics' })], clicks: 20 });
  expect(pages).toEqual({ terms: [], clicks: 20 });
  expect(mocks.queries.mock.calls[0]?.[1]).toBe(10);
});

test('fails only the dated cards when the reporting day cannot be read', async () => {
  stubSearchReads();
  mocks.latestDay.mockRejectedValue(new Error('offline'));

  await expect(loadSearchPerformance('30d')).rejects.toThrow('offline');
  await expect(loadSearchTerms('queries', '30d')).rejects.toThrow('offline');
  await expect(loadIndexCoverage({ from: new Date('2026-06-14'), to: new Date('2026-07-14') })).resolves.toMatchObject({
    total: 2,
    indexed: 1,
    unknown: 1,
  });
  expect(mocks.latestCoverage).toHaveBeenCalledWith(['https://lgi.tools/', 'https://lgi.tools/sites']);
});

test('counts back from today before any day is reported', async () => {
  stubSearchReads();
  mocks.latestDay.mockResolvedValue(null);
  mocks.trend.mockResolvedValue([]);

  await expect(loadSearchPerformance('7d')).resolves.toMatchObject({ trend: [] });
});

test('reads each sitemap as its submitted URLs with errors and warnings beneath, or says none is synced', () => {
  const html = renderToStaticMarkup(
    createElement(SitemapList, {
      sitemaps: [
        { path: '/sitemap.xml', submitted: 1234, errors: 1, warnings: 0, lastDownloaded: null, isPending: false },
      ],
    }),
  );

  expect(html).toContain('/sitemap.xml');
  expect(html).toContain('1,234 submitted');
  expect(html).toContain('1 error · 0 warnings');
  expect(renderToStaticMarkup(createElement(SitemapList, { sitemaps: [] }))).toContain('No sitemap data synced yet.');
});

test('notes unclassified URLs under the coverage readout, or says nothing is inspected yet', async () => {
  stubSearchReads();

  const view = await loadIndexCoverage({ from: new Date('2026-06-14'), to: new Date('2026-07-14') });
  const html = renderToStaticMarkup(createElement(IndexCoverageBody, { view }));

  expect(html).toContain('1 URL unclassified');
  expect(html).toContain('Latest coverage reasons');
  expect(html).not.toContain('No URL inspection history synced yet.');
  expect(
    renderToStaticMarkup(createElement(IndexCoverageBody, { view: deriveGscCoverageView({ latest: [], trend: [] }) })),
  ).toContain('No URL inspection history synced yet.');
});
