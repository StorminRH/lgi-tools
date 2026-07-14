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
import { characters } from '@/features/auth/schema';
import {
  claimPublicEsiBudgetAlert,
  completePublicEsiBudgetAlertClaim,
  countPublicEsiBudgetExhaustionsSince,
  getBudgetExhaustionCount,
  getDailyCounts,
  getDegradationByCaller,
  getFallbackRate,
  getGscCronOutcomes,
  getLastCronRuns,
  getLoginCountsPerUser,
  getPriceCronOutcomes,
  getRefreshVolume,
  getReturningVsNew,
  getRoleChangeAudit,
  getSdeCronOutcomes,
  getSearchVsDirect,
  getTopEntryPages,
  getTopPages,
  getTopReferrers,
  getTopSearches,
  hasPublicEsiBudgetAlertSince,
} from './queries';
import { usageLogs } from './schema';

// Executes every admin-consumed telemetry query against the local Docker Postgres
// (postgres-js) and asserts none throws — the coverage that would have caught the
// OOB.1 GROUP BY 42803 at test time. Skips cleanly when no DB is reachable, so a
// DB-less `pnpm verify` / CI run stays green (see the harness `canReachDb`).
//
// The request-path `db` proxy is steered onto postgres-js and into a throwaway
// schema purely through env + a `search_path` connection param — no query, schema,
// or app code is touched. The schema is dropped in afterAll, so nothing is left
// behind in the dev database.

const SCHEMA = 'test_telemetry_cov';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

// A fixed historical week, far from any real data and from defaultNow(); every
// seeded row sits inside it so the range-scoped queries return rows.
const RANGE = {
  from: new Date('2020-01-01T00:00:00Z'),
  to: new Date('2020-01-08T00:00:00Z'),
};
const IN_RANGE = new Date('2020-01-03T12:00:00Z');

const CHAR_OLD = 91_000_001; // created before the range — the "returning" user
const CHAR_NEW = 91_000_002; // created in-range — the "new" user

interface QueryCase {
  name: string;
  run: () => Promise<unknown>;
  check: (result: unknown) => void;
}

function expectNonEmptyArray(result: unknown): void {
  expect(Array.isArray(result)).toBe(true);
  expect((result as unknown[]).length).toBeGreaterThan(0);
}

function expectPositiveNumber(result: unknown): void {
  expect(typeof result).toBe('number');
  expect(result as number).toBeGreaterThan(0);
}

// Each case runs one query and asserts it resolved (no throw) with a plausible
// shape. it.each names the failing query, so a query OTHER than OOB.1's throwing
// surfaces as a named, isolated failure (which is a STOP-and-report finding).
const cases: QueryCase[] = [
  { name: 'getDailyCounts', run: () => getDailyCounts(RANGE), check: expectNonEmptyArray },
  { name: 'getTopPages', run: () => getTopPages(RANGE), check: expectNonEmptyArray },
  { name: 'getTopReferrers', run: () => getTopReferrers(RANGE), check: expectNonEmptyArray },
  { name: 'getTopEntryPages', run: () => getTopEntryPages(RANGE), check: expectNonEmptyArray },
  { name: 'getTopSearches', run: () => getTopSearches(RANGE), check: expectNonEmptyArray },
  { name: 'getRoleChangeAudit', run: () => getRoleChangeAudit(RANGE), check: expectNonEmptyArray },
  {
    name: 'getFallbackRate',
    run: () => getFallbackRate(RANGE),
    check: (r) => {
      const d = r as { esi: number; fallback: number; perDay: unknown[] };
      expect(typeof d.esi).toBe('number');
      expect(typeof d.fallback).toBe('number');
      expect(Array.isArray(d.perDay)).toBe(true);
    },
  },
  {
    name: 'getBudgetExhaustionCount',
    run: () => getBudgetExhaustionCount(RANGE),
    check: expectPositiveNumber,
  },
  {
    name: 'getDegradationByCaller',
    run: () => getDegradationByCaller(RANGE),
    check: expectNonEmptyArray,
  },
  { name: 'getPriceCronOutcomes', run: () => getPriceCronOutcomes(RANGE), check: expectNonEmptyArray },
  { name: 'getSdeCronOutcomes', run: () => getSdeCronOutcomes(RANGE), check: expectNonEmptyArray },
  { name: 'getGscCronOutcomes', run: () => getGscCronOutcomes(RANGE), check: expectNonEmptyArray },
  { name: 'getLastCronRuns', run: () => getLastCronRuns(), check: expectNonEmptyArray },
  { name: 'getRefreshVolume', run: () => getRefreshVolume(RANGE), check: expectNonEmptyArray },
  {
    name: 'getReturningVsNew',
    run: () => getReturningVsNew(RANGE),
    check: (r) => {
      const d = r as { newUsers: number; returning: number };
      expect(d.newUsers).toBeGreaterThan(0);
      expect(d.returning).toBeGreaterThan(0);
    },
  },
  { name: 'getLoginCountsPerUser', run: () => getLoginCountsPerUser(RANGE), check: expectNonEmptyArray },
  {
    name: 'getSearchVsDirect',
    run: () => getSearchVsDirect(RANGE),
    check: (r) => {
      const d = r as { referred: number; direct: number };
      expect(d.referred).toBeGreaterThan(0);
      expect(d.direct).toBeGreaterThan(0);
    },
  },
];

describe.skipIf(!reachable)('admin telemetry analytics queries execute against Postgres', () => {
  let adminClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    // Flip the request `db` proxy onto postgres-js (LOCAL_DB_DRIVER) pointed at the
    // throwaway schema (search_path) before any query runs.
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 1, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, ['usage_logs', 'characters']);

    const seedDb = drizzlePg(adminClient);
    await seedDb.insert(characters).values([
      {
        characterId: CHAR_OLD,
        name: 'Old Pilot',
        portraitUrl: 'https://images.evetech.net/characters/91000001/portrait',
        role: 'USER',
        createdAt: new Date('2019-01-01T00:00:00Z'),
      },
      {
        characterId: CHAR_NEW,
        name: 'New Pilot',
        portraitUrl: 'https://images.evetech.net/characters/91000002/portrait',
        role: 'USER',
        createdAt: new Date('2020-01-03T00:00:00Z'),
      },
    ]);
    await seedDb.insert(usageLogs).values([
      {
        id: 1,
        action: 'page_view',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { path: '/sites', referrer: 'google.com', is_entry: 'true' },
      },
      { id: 2, action: 'page_view', characterId: null, timestamp: IN_RANGE, metadata: { path: '/planner' } },
      {
        id: 3,
        action: 'terminal_search',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { query: 'tritanium' },
      },
      {
        id: 4,
        action: 'role_change',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { actorCharacterId: CHAR_OLD, targetCharacterId: CHAR_NEW, from: 'USER', to: 'ADMIN' },
      },
      {
        id: 5,
        action: 'cron_prices',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: {
          outcome: 'refreshed',
          esiCount: 100,
          fuzzworkFallbackCount: 5,
          budgetExhausted: true,
          fetched: 200,
          written: 180,
          durationMs: 1500,
        },
      },
      {
        id: 6,
        action: 'price_source_degraded',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { caller: 'cron', budgetExhausted: true },
      },
      {
        id: 7,
        action: 'cron_sde',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'refreshed', durationMs: 3000 },
      },
      {
        id: 8,
        action: 'cron_gsc',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'synced', durationMs: 800 },
      },
      { id: 9, action: 'auth_login', characterId: CHAR_OLD, timestamp: IN_RANGE, metadata: {} },
      {
        id: 10,
        action: 'price_source_degraded',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { caller: 'on-demand', budgetExhausted: true },
      },
      {
        id: 11,
        action: 'market_history_refresh',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { budgetExhausted: true },
      },
      {
        id: 12,
        action: 'public_esi_budget_alerted',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { count: 3, windowMinutes: 15 },
      },
    ]);
  });

  afterAll(async () => {
    // Close the proxy's pool (built lazily on the first query through `db`), drop
    // the throwaway schema, then close the admin connection. `.catch` on each
    // `end` so a connection blip never skips `dropDisposableSchema` and leaves the
    // schema behind (which would make the next run's `beforeAll` fail at CREATE TABLE).
    const proxyClient = (db as unknown as { $client: ReturnType<typeof postgres> }).$client;
    await proxyClient.end({ timeout: 5 }).catch(() => {});
    await dropDisposableSchema(adminClient, SCHEMA);
    await adminClient.end({ timeout: 5 }).catch(() => {});
    vi.unstubAllEnvs();
  });

  it.each(cases)('$name executes and returns a plausible shape', async ({ run, check }) => {
    check(await run());
  });

  it('uses the cron outcome for fallback volume and one degradation row per budget incident', async () => {
    await expect(getFallbackRate(RANGE)).resolves.toMatchObject({ esi: 100, fallback: 5 });
    await expect(getBudgetExhaustionCount(RANGE)).resolves.toBe(2);
  });

  it('counts only public on-demand exhaustion events and finds the alert marker', async () => {
    const since = new Date('2020-01-03T00:00:00Z');
    await expect(countPublicEsiBudgetExhaustionsSince(since)).resolves.toBe(2);
    await expect(hasPublicEsiBudgetAlertSince(since)).resolves.toBe(true);
  });

  it('keeps only active claims and promotes a delivered claim', async () => {
    const since = new Date(Date.now() - 60_000);
    const claimId = await claimPublicEsiBudgetAlert({ count: 3, windowMinutes: 15 });

    await expect(hasPublicEsiBudgetAlertSince(since)).resolves.toBe(true);
    await expect(hasPublicEsiBudgetAlertSince(new Date())).resolves.toBe(false);
    await completePublicEsiBudgetAlertClaim(claimId);
    await expect(hasPublicEsiBudgetAlertSince(since)).resolves.toBe(true);
  });
});
