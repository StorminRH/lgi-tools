import { desc, eq, inArray, max } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  getCoverageTrend,
  getLastSyncedAt,
  getLatestReportDate,
  getLatestUrlCoverage,
  getSearchTotals,
  getSearchTrend,
  getSitemapStatus,
  searchTotalsFromTrend,
  getTopGscPages,
  getTopQueries,
} from './queries';
import { indexStatusToRecord, upsertUrlInspectionRecords } from './ingest';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_gsc_cov',
  tables: ['gsc_search_analytics', 'gsc_sitemaps', 'gsc_url_inspection'],
  steerDbProxy: true,
});

const RANGE = {
  from: new Date('2020-01-01T00:00:00Z'),
  to: new Date('2020-01-08T00:00:00Z'),
};
const CURRENT_SITEMAP_URLS = [
  'https://lgi.tools/',
  'https://lgi.tools/sites',
  'https://lgi.tools/new',
];
const SYNCED_AT = new Date('2020-01-02T06:00:00Z');

interface QueryCase {
  name: string;
  run: () => Promise<unknown>;
  check: (result: unknown) => void;
}

function expectNonEmptyArray(result: unknown): void {
  expect(Array.isArray(result)).toBe(true);
  expect((result as unknown[]).length).toBeGreaterThan(0);
}

const cases: QueryCase[] = [
  { name: 'getLatestReportDate', run: () => getLatestReportDate(), check: (day) => expect(day).toBe('2020-01-02') },
  { name: 'getSearchTrend', run: () => getSearchTrend(RANGE), check: expectNonEmptyArray },
  {
    name: 'getSearchTotals',
    run: () => getSearchTotals(RANGE),
    check: (r) => {
      const d = r as { clicks: number; impressions: number; ctr: number; position: number };
      expect(d.clicks).toBeGreaterThan(0);
      expect(d.impressions).toBeGreaterThan(0);
      expect(typeof d.ctr).toBe('number');
      expect(typeof d.position).toBe('number');
    },
  },
  { name: 'getTopQueries', run: () => getTopQueries(RANGE), check: expectNonEmptyArray },
  { name: 'getTopGscPages', run: () => getTopGscPages(RANGE), check: expectNonEmptyArray },
  { name: 'getSitemapStatus', run: () => getSitemapStatus(), check: expectNonEmptyArray },
  {
    name: 'getLatestUrlCoverage',
    run: () => getLatestUrlCoverage(CURRENT_SITEMAP_URLS),
    check: (result) => {
      expect(result).toEqual([
        expect.objectContaining({
          inspectionDate: '2020-01-04',
          url: 'https://lgi.tools/',
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
        }),
        expect.objectContaining({
          inspectionDate: '2020-01-03',
          url: 'https://lgi.tools/sites',
          verdict: 'NEUTRAL',
          coverageState: 'Crawled - currently not indexed',
        }),
        {
          inspectionDate: null,
          url: 'https://lgi.tools/new',
          verdict: null,
          coverageState: null,
          lastCrawlTime: null,
        },
      ]);
    },
  },
  {
    name: 'getCoverageTrend',
    run: () => getCoverageTrend(RANGE),
    check: (result) => {
      expect(result).toEqual([
        { day: '2020-01-01', indexed: 0, notIndexed: 2 },
        { day: '2020-01-02', indexed: 0, notIndexed: 2 },
        { day: '2020-01-03', indexed: 1, notIndexed: 1 },
        { day: '2020-01-05', indexed: 0, notIndexed: 1 },
        { day: '2020-01-07', indexed: 0, notIndexed: 0 },
      ]);
    },
  },
  {
    name: 'getLastSyncedAt',
    run: () => getLastSyncedAt(),
    check: (r) => {
      expect(r).toBeInstanceOf(Date);
      expect((r as Date).getTime()).toBe(SYNCED_AT.getTime());
    },
  },
];

describe.skipIf(!harness.reachable)('admin GSC analytics queries execute against Postgres', () => {
  beforeAll(async () => {
    const seedDb = harness.db;
    await seedDb.insert(gscSearchAnalytics).values([
      { date: '2020-01-02', dimension: 'total', key: '', clicks: 10, impressions: 100, position: 5, syncedAt: SYNCED_AT },
      { date: '2020-01-02', dimension: 'query', key: 'wormhole', clicks: 5, impressions: 50, position: 3, syncedAt: SYNCED_AT },
      { date: '2020-01-02', dimension: 'page', key: '/sites', clicks: 4, impressions: 40, position: 2, syncedAt: SYNCED_AT },
    ]);
    await seedDb.insert(gscSitemaps).values([
      { path: '/sitemap.xml', submitted: 100, indexed: 90, syncedAt: SYNCED_AT },
    ]);
    await seedDb.insert(gscUrlInspection).values([
      { inspectionDate: '2020-01-07', url: 'https://lgi.tools/unknown', sitemapUrlCount: 1, verdict: null, syncedAt: SYNCED_AT },
      {
        inspectionDate: '2020-01-01',
        url: 'https://lgi.tools/',
        sitemapUrlCount: 2,
        verdict: 'FAIL',
        coverageState: 'Blocked by robots.txt',
        syncedAt: new Date('2020-01-01T06:00:00Z'),
      },
      {
        inspectionDate: '2020-01-01',
        url: 'https://lgi.tools/sites',
        sitemapUrlCount: 2,
        verdict: 'NEUTRAL',
        coverageState: 'Discovered - currently not indexed',
        syncedAt: new Date('2020-01-01T06:00:00Z'),
      },
      {
        inspectionDate: '2020-01-02',
        url: 'https://lgi.tools/',
        sitemapUrlCount: 2,
        verdict: 'FAIL',
        coverageState: 'Blocked by robots.txt',
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-03',
        url: 'https://lgi.tools/',
        sitemapUrlCount: 2,
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        lastCrawlTime: new Date('2020-01-02T03:00:00Z'),
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-02',
        url: 'https://lgi.tools/sites',
        sitemapUrlCount: 2,
        verdict: 'NEUTRAL',
        coverageState: 'Crawled - currently not indexed',
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-03',
        url: 'https://lgi.tools/sites',
        sitemapUrlCount: 2,
        verdict: 'NEUTRAL',
        coverageState: 'Crawled - currently not indexed',
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-04',
        url: 'https://lgi.tools/',
        sitemapUrlCount: 2,
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-05',
        url: 'https://lgi.tools/retired',
        sitemapUrlCount: 1,
        verdict: 'FAIL',
        coverageState: 'Not found (404)',
        syncedAt: SYNCED_AT,
      },
      {
        inspectionDate: '2020-01-06',
        url: 'https://lgi.tools/legacy',
        sitemapUrlCount: null,
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        syncedAt: SYNCED_AT,
      },
    ]);
  });

  it.each(cases)('$name executes and returns a plausible shape', async ({ run, check }) => {
    check(await run());
  });

  it('upserts on the inspection-date and URL composite key', async () => {
    const seedDb = harness.db;
    const before = await seedDb.select().from(gscUrlInspection);
    await upsertUrlInspectionRecords(seedDb, [
      indexStatusToRecord(
        'https://lgi.tools/',
        { verdict: 'FAIL', coverageState: 'Re-evaluating' },
        new Date('2020-01-03T12:00:00Z'),
        2,
      ),
    ]);

    const rows = await seedDb.select().from(gscUrlInspection);
    expect(rows).toHaveLength(before.length);
    expect(
      rows.find(
        (row) =>
          row.inspectionDate === '2020-01-03' && row.url === 'https://lgi.tools/',
      ),
    ).toMatchObject({ verdict: 'FAIL', coverageState: 'Re-evaluating' });
  });

  it('getLastSyncedAt returns null when nothing has synced', async () => {
    await harness.db.delete(gscSearchAnalytics);
    expect(await getLastSyncedAt()).toBeNull();
    expect(await getLatestReportDate()).toBeNull();
  });
});

const DAY_MS = 86_400_000;

function day(offset: number): string {
  return new Date(Date.UTC(2021, 2, 1) + offset * DAY_MS).toISOString().slice(0, 10);
}

function utcDay(offset: number): Date {
  return new Date(`${day(offset)}T00:00:00Z`);
}

/** Deterministic spread of values, so seeds vary without randomness. */
function spread(i: number, mod: number): number {
  return (i * 7919 + 13) % mod;
}

// Three syncs over overlapping windows. Each writes its total rows first and
// stamps every row with its own time, so the newest stamp lives on totals.
const SYNCS = [
  { at: new Date('2021-03-20T04:00:00Z'), from: 0, to: 20 },
  { at: new Date('2021-04-05T04:00:00Z'), from: 10, to: 36 },
  { at: new Date('2021-04-16T04:00:00Z'), from: 20, to: 46 },
] as const;

type SearchRow = typeof gscSearchAnalytics.$inferInsert;

// Some days carry no impressions at all; days 40-42 have no rows.
function dayRows(i: number, syncedAt: Date): SearchRow[] {
  if (i >= 40 && i <= 42) return [];
  const date = day(i);
  const impressions = i % 9 === 4 ? 0 : 20 + spread(i, 900);
  const clicks = impressions === 0 ? 0 : spread(i, Math.max(1, Math.floor(impressions / 5)));
  const position = 1 + spread(i, 4000) / 97;
  const queries = ['wormhole', 'j-space statics'].map((key) => ({
    date, dimension: 'query', key, clicks: Math.floor(clicks / 3), impressions: Math.floor(impressions / 2),
    position: position + 0.5, syncedAt,
  }));
  return [
    { date, dimension: 'total', key: '', clicks, impressions, position, syncedAt },
    ...queries,
    { date, dimension: 'page', key: '/sites', clicks: Math.floor(clicks / 2), impressions, position, syncedAt },
  ];
}

function searchRows(): SearchRow[] {
  // A later sync overwrites the days it shares with an earlier one.
  const rows = new Map<string, SearchRow>();
  for (const sync of SYNCS) {
    for (let i = sync.from; i <= sync.to; i += 1) {
      for (const row of dayRows(i, sync.at)) rows.set(`${row.date}|${row.dimension}|${row.key}`, row);
    }
  }
  // Insert out of date order so a scan in physical order differs from date order.
  return [...rows.values()].sort((a, b) => spread(Number(a.date.slice(8)), 31) - spread(Number(b.date.slice(8)), 31));
}

const URLS = Array.from({ length: 12 }, (_, i) => `https://lgi.tools/page-${i}`);

function inspectionRows() {
  const rows: (typeof gscUrlInspection.$inferInsert)[] = [];
  URLS.forEach((url, u) => {
    // URL 0 was never inspected; the rest have 1 to 30 inspections each.
    const count = u === 0 ? 0 : 1 + spread(u, 30);
    for (let n = 0; n < count; n += 1) {
      const offset = (u * 5 + n * 3) % 90;
      rows.push({
        inspectionDate: day(offset),
        url,
        sitemapUrlCount: URLS.length,
        verdict: ['PASS', 'FAIL', 'NEUTRAL', null][spread(u + n, 4)] ?? null,
        coverageState: `state ${spread(u * 31 + n, 7)}`,
        lastCrawlTime: n % 4 === 0 ? null : new Date(utcDay(offset).getTime() - spread(n, 48) * 3_600_000),
        syncedAt: utcDay(offset),
      });
    }
  });
  return rows.filter(
    (row, index) => rows.findIndex((other) => other.url === row.url && other.inspectionDate === row.inspectionDate) === index,
  );
}

describe.skipIf(!harness.reachable)('rewritten GSC reads match the queries they replace', () => {
  beforeAll(async () => {
    await harness.db.delete(gscSearchAnalytics);
    await harness.db.delete(gscUrlInspection);
    await harness.db.insert(gscSearchAnalytics).values(searchRows());
    await harness.db.insert(gscUrlInspection).values(inspectionRows());
  });

  it('reads the last sync time from total rows as the whole-table maximum', async () => {
    const [whole] = await harness.db.select({ at: max(gscSearchAnalytics.syncedAt) }).from(gscSearchAnalytics);

    const lastSyncedAt = await getLastSyncedAt();

    expect(lastSyncedAt).toBeInstanceOf(Date);
    expect(lastSyncedAt).toEqual(whole?.at);
    expect(lastSyncedAt).toEqual(SYNCS[2].at);
  });

  it('sums daily total rows to the SQL totals for every window', async () => {
    const windows = [
      { from: utcDay(0), to: utcDay(46) },
      { from: utcDay(20), to: utcDay(26) },
      { from: utcDay(4), to: utcDay(4) },
      { from: utcDay(39), to: utcDay(45) },
      { from: utcDay(40), to: utcDay(42) },
      { from: utcDay(-30), to: utcDay(-1) },
      { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2026-01-01T00:00:00Z') },
    ];
    for (const range of windows) {
      const sql = await getSearchTotals(range);
      const summed = searchTotalsFromTrend(await getSearchTrend(range));
      expect(summed.clicks).toBe(sql.clicks);
      expect(summed.impressions).toBe(sql.impressions);
      expect(summed.ctr).toBe(sql.ctr);
      // Float sums can differ in the last bit with summation order.
      expect(summed.position).toBeCloseTo(sql.position, 9);
    }
    await expect(getSearchTotals({ from: utcDay(40), to: utcDay(42) })).resolves.toEqual({
      clicks: 0, impressions: 0, ctr: 0, position: 0,
    });
    expect(searchTotalsFromTrend([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it('splits one spanning trend read into both periods', async () => {
    const previous = { from: utcDay(10), to: utcDay(19) };
    const range = { from: utcDay(20), to: utcDay(29) };
    const span = await getSearchTrend({ from: previous.from, to: range.to });
    const within = (from: string, to: string) => span.filter((point) => point.day >= from && point.day <= to);

    await expect(getSearchTrend(range)).resolves.toEqual(within(day(20), day(29)));
    await expect(getSearchTrend(previous)).resolves.toEqual(within(day(10), day(19)));
  });

  it('returns the newest inspection per sitemap URL as DISTINCT ON did', async () => {
    const requested = [...URLS, 'https://lgi.tools/never-seen', URLS[3]!];
    const reference = await harness.db
      .selectDistinctOn([gscUrlInspection.url], {
        inspectionDate: gscUrlInspection.inspectionDate,
        url: gscUrlInspection.url,
        verdict: gscUrlInspection.verdict,
        coverageState: gscUrlInspection.coverageState,
        lastCrawlTime: gscUrlInspection.lastCrawlTime,
      })
      .from(gscUrlInspection)
      .where(inArray(gscUrlInspection.url, requested))
      .orderBy(gscUrlInspection.url, desc(gscUrlInspection.inspectionDate));
    const byUrl = new Map(reference.map((row) => [row.url, row]));

    const latest = await getLatestUrlCoverage(requested);

    expect(latest.map((row) => row.url)).toEqual(requested);
    expect(latest).toEqual(requested.map((url) => byUrl.get(url) ?? {
      inspectionDate: null, url, verdict: null, coverageState: null, lastCrawlTime: null,
    }));
    const [newest] = await harness.db
      .select({ inspectionDate: gscUrlInspection.inspectionDate })
      .from(gscUrlInspection)
      .where(eq(gscUrlInspection.url, URLS[5]!))
      .orderBy(desc(gscUrlInspection.inspectionDate))
      .limit(1);
    expect(latest[5]?.inspectionDate).toBe(newest?.inspectionDate);
    expect(latest.filter((row) => row.inspectionDate === null).map((row) => row.url)).toEqual([
      URLS[0], 'https://lgi.tools/never-seen',
    ]);
  });
});
