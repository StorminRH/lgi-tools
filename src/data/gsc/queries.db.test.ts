import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from '@/db/test-support/db-coverage-harness';
import {
  getLastSyncedAt,
  getSearchTotals,
  getSearchTrend,
  getSitemapStatus,
  getTopGscPages,
  getTopQueries,
  getUrlInspection,
} from './queries';
import { gscSearchAnalytics, gscSitemaps, gscUrlInspection } from './schema';

// Executes every admin-consumed GSC query against the local Docker Postgres
// (postgres-js) and asserts none throws — the same OOB.1-class coverage as the
// telemetry suite, for the SEO dashboard's read path. Skips cleanly when no DB is
// reachable. The throwaway schema is dropped in afterAll, leaving nothing behind.

const SCHEMA = 'test_gsc_cov';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

const RANGE = {
  from: new Date('2020-01-01T00:00:00Z'),
  to: new Date('2020-01-08T00:00:00Z'),
};
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
  { name: 'getUrlInspection', run: () => getUrlInspection(), check: expectNonEmptyArray },
  {
    name: 'getLastSyncedAt',
    run: () => getLastSyncedAt(),
    check: (r) => {
      // Coerced to a real Date at the query (bare sql<> aggregates return raw
      // timestamp strings under both drivers — strings lack .toISOString(), the
      // latent /admin 500). The populated case must be an actual Date equal to the
      // seeded syncedAt, not merely a timestamp-coercible string.
      expect(r).toBeInstanceOf(Date);
      expect((r as Date).getTime()).toBe(SYNCED_AT.getTime());
    },
  },
];

describe.skipIf(!reachable)('admin GSC analytics queries execute against Postgres', () => {
  let adminClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 1, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, [
      'gsc_search_analytics',
      'gsc_sitemaps',
      'gsc_url_inspection',
    ]);

    const seedDb = drizzlePg(adminClient);
    await seedDb.insert(gscSearchAnalytics).values([
      { date: '2020-01-02', dimension: 'total', key: '', clicks: 10, impressions: 100, position: 5, syncedAt: SYNCED_AT },
      { date: '2020-01-02', dimension: 'query', key: 'wormhole', clicks: 5, impressions: 50, position: 3, syncedAt: SYNCED_AT },
      { date: '2020-01-02', dimension: 'page', key: '/sites', clicks: 4, impressions: 40, position: 2, syncedAt: SYNCED_AT },
    ]);
    await seedDb.insert(gscSitemaps).values([
      { path: '/sitemap.xml', submitted: 100, indexed: 90, syncedAt: SYNCED_AT },
    ]);
    await seedDb.insert(gscUrlInspection).values([
      {
        url: 'https://lgi.tools/',
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        lastCrawlTime: new Date('2020-01-02T03:00:00Z'),
        syncedAt: SYNCED_AT,
      },
    ]);
  });

  afterAll(async () => {
    // `.catch` on each `end` so a connection blip never skips `dropDisposableSchema`
    // and leaves the schema behind (which would wedge the next run's `beforeAll`).
    const proxyClient = (db as unknown as { $client: ReturnType<typeof postgres> }).$client;
    await proxyClient.end({ timeout: 5 }).catch(() => {});
    await dropDisposableSchema(adminClient, SCHEMA);
    await adminClient.end({ timeout: 5 }).catch(() => {});
    vi.unstubAllEnvs();
  });

  it.each(cases)('$name executes and returns a plausible shape', async ({ run, check }) => {
    check(await run());
  });

  it('getLastSyncedAt returns null when nothing has synced', async () => {
    // Runs after the seeded it.each cases; clear the analytics rows so max() over
    // an empty set is null — the contract's no-sync branch, which must stay null and
    // never coerce to the epoch (new Date(null)).
    await drizzlePg(adminClient).delete(gscSearchAnalytics);
    expect(await getLastSyncedAt()).toBeNull();
  });
});
