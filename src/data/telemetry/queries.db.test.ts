import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { account, characters, user } from '@/db/auth-schema';
import {
  claimPublicEsiBudgetAlert,
  completePublicEsiBudgetAlertClaim,
  countPublicEsiBudgetExhaustionsInWindow,
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
  getTrafficTotals,
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
  hasPublicEsiBudgetAlertForWindow,
} from './queries';
import { usageLogs } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_cov',
  tables: ['usage_logs', 'characters', 'user', 'account'],
  steerDbProxy: true,
});

const RANGE = {
  from: new Date('2020-01-01T00:00:00Z'),
  to: new Date('2020-01-08T00:00:00Z'),
};
const IN_RANGE = new Date('2020-01-03T12:00:00Z');

const CHAR_OLD = 91_000_001;
const CHAR_NEW = 91_000_002;

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

const cases: QueryCase[] = [
  { name: 'getDailyCounts', run: () => getDailyCounts(RANGE), check: expectNonEmptyArray },
  { name: 'getTopPages', run: () => getTopPages(RANGE), check: expectNonEmptyArray },
  { name: 'getTopReferrers', run: () => getTopReferrers(RANGE), check: expectNonEmptyArray },
  { name: 'getTopEntryPages', run: () => getTopEntryPages(RANGE), check: expectNonEmptyArray },
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
  {
    name: 'getPriceSourceSplit',
    run: () => getPriceSourceSplit(RANGE),
    check: (r) => expect((r as { requested: number }).requested).toBeGreaterThan(0),
  },
  {
    name: 'getHistorySourceSplit',
    run: () => getHistorySourceSplit(RANGE),
    check: (r) => expect((r as { staleStored: number }).staleStored).toBeGreaterThan(0),
  },
  {
    name: 'getWriteBehindOutcomes',
    run: () => getWriteBehindOutcomes(RANGE),
    check: expectNonEmptyArray,
  },
  {
    name: 'getTopCostlyEndpoints',
    run: () => getTopCostlyEndpoints(RANGE, 5),
    check: expectNonEmptyArray,
  },
];

describe.skipIf(!harness.reachable)('admin telemetry analytics queries execute against Postgres', () => {
  beforeAll(async () => {
    const seedDb = harness.db;
    await seedDb.insert(characters).values([
      {
        characterId: CHAR_OLD,
        name: 'Old Pilot',
        portraitUrl: 'https://images.evetech.net/characters/91000001/portrait',
        createdAt: new Date('2019-01-01T00:00:00Z'),
      },
      {
        characterId: CHAR_NEW,
        name: 'New Pilot',
        portraitUrl: 'https://images.evetech.net/characters/91000002/portrait',
        createdAt: new Date('2020-01-03T00:00:00Z'),
      },
    ]);
    await seedDb.insert(user).values([
      { id: 'telemetry-old', name: 'Old', email: 'telemetry-old@example.test', createdAt: new Date('2019-01-01') },
      { id: 'telemetry-new', name: 'New', email: 'telemetry-new@example.test', createdAt: IN_RANGE },
    ]);
    await seedDb.insert(account).values([
      { id: 'telemetry-old-account', accountId: String(CHAR_OLD), providerId: 'eve', userId: 'telemetry-old' },
      { id: 'telemetry-new-account', accountId: String(CHAR_NEW), providerId: 'eve', userId: 'telemetry-new' },
    ]);
    await seedDb.insert(usageLogs).values([
      { action: 'page_view', characterId: CHAR_NEW, timestamp: IN_RANGE, metadata: { path: '/' } },
      {
        action: 'page_view',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { path: '/sites', referrer: 'google.com', is_entry: 'true' },
      },
      { action: 'page_view', characterId: null, timestamp: IN_RANGE, metadata: { path: '/planner' } },
      {
        action: 'role_change',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { actorCharacterId: CHAR_OLD, targetCharacterId: CHAR_NEW, from: 'USER', to: 'ADMIN' },
      },
      {
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
        action: 'price_source_degraded',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { caller: 'cron', budgetExhausted: true },
      },
      {
        action: 'cron_sde',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'refreshed', durationMs: 3000 },
      },
      {
        action: 'cron_gsc',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'synced', durationMs: 800 },
      },
      { action: 'auth_login', characterId: CHAR_OLD, timestamp: IN_RANGE, metadata: {} },
      {
        action: 'price_source_degraded',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { caller: 'on-demand', budgetExhausted: true },
      },
      {
        action: 'market_history_refresh',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { budgetExhausted: true },
      },
      {
        action: 'public_esi_budget_alerted',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: {
          count: 3,
          windowMinutes: 15,
          windowStartedAt: '2020-01-03T12:00:00.000Z',
        },
      },
      {
        action: 'market_price_refresh',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { requested: 10, returned: 9, cacheHits: 2, esiCount: 6, fuzzworkFallbackCount: 1 },
      },
      {
        action: 'market_history_refresh',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { requested: 10, freshEsi: 2, warmStored: 6, staleStored: 1, missing: 1 },
      },
      {
        action: 'market_price_write_behind',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'failed', attempted: 2, written: 0, durationMs: 25 },
      },
      {
        action: 'market_history_write_behind',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { outcome: 'partial', attempted: 2, written: 1, durationMs: 30 },
      },
      {
        action: 'owned_data_read',
        characterId: CHAR_OLD,
        timestamp: IN_RANGE,
        metadata: { endpoint: '/api/account/skills', returned: 4, outcome: 'succeeded', durationMs: 40 },
      },
    ]);
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
    await expect(
      countPublicEsiBudgetExhaustionsInWindow(since, new Date('2020-01-04T00:00:00Z')),
    ).resolves.toBe(2);
    await expect(
      hasPublicEsiBudgetAlertForWindow('2020-01-03T12:00:00.000Z'),
    ).resolves.toBe(true);
  });

  it('keeps only active claims and promotes a delivered claim', async () => {
    const windowStartedAt = new Date().toISOString();
    const claimId = await claimPublicEsiBudgetAlert({
      count: 3,
      windowMinutes: 15,
      windowStartedAt,
    });

    await expect(hasPublicEsiBudgetAlertForWindow(windowStartedAt)).resolves.toBe(true);
    await expect(hasPublicEsiBudgetAlertForWindow('another-window')).resolves.toBe(false);
    await completePublicEsiBudgetAlertClaim(claimId);
    await expect(hasPublicEsiBudgetAlertForWindow(windowStartedAt)).resolves.toBe(true);
  });
});

describe.skipIf(!harness.reachable)('traffic-panel neutrality against capability rows', () => {
  const NEUTRALITY_RANGE = {
    from: new Date('2021-05-01T00:00:00Z'),
    to: new Date('2021-05-08T00:00:00Z'),
  };
  const AT = new Date('2021-05-03T09:00:00Z');

  it('returns byte-identical counts with and without capability rows present', async () => {
    await harness.db.insert(usageLogs).values([
      { timestamp: AT, action: 'page_view', characterId: CHAR_OLD, metadata: { path: '/' } },
      { timestamp: AT, action: 'page_view', characterId: null, metadata: { path: '/sites' } },
      { timestamp: AT, action: 'page_view', characterId: CHAR_NEW, metadata: { path: '/planner' } },
    ]);

    const before = await getDailyCounts(NEUTRALITY_RANGE);

    await harness.db.insert(usageLogs).values(
      Array.from({ length: 25 }, () => ({
        timestamp: AT,
        action: 'capability_outcome',
        characterId: null,
        metadata: {
          feature: 'planner',
          operation: 'create-saved-plan',
          outcome: 'succeeded',
          code: 'ok',
          durationMs: 12,
          dependencies: {},
          retry: null,
          correlationId: 'neutrality',
          appVersion: 'test',
        },
      })),
    );

    const after = await getDailyCounts(NEUTRALITY_RANGE);

    expect(after).toEqual(before);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      totalEvents: 3,
      uniqueCharacters: 2,
      anonymousEvents: 1,
    });
  });
});


describe.skipIf(!harness.reachable)('human audience and activity boundaries', () => {
  it('deduplicates linked characters and includes returning persistent sessions', async () => {
    const second = 91_000_003;
    await harness.db.insert(characters).values({ characterId: second, name: 'Alt', portraitUrl: '' });
    await harness.db.insert(account).values({ id: 'telemetry-alt', accountId: String(second), providerId: 'eve', userId: 'telemetry-old' });
    const range = { from: new Date('2022-01-01'), to: new Date('2022-01-02') };
    await harness.db.insert(usageLogs).values([
      { timestamp: range.from, action: 'page_view', characterId: CHAR_OLD },
      { timestamp: range.from, action: 'page_view', characterId: second },
      { timestamp: range.from, action: 'cron_prices', metadata: { outcome: 'refreshed' } },
      { timestamp: range.to, action: 'page_view', characterId: CHAR_NEW },
    ]);
    expect(await getReturningVsNew(range)).toEqual({ newUsers: 0, returning: 1 });
    expect((await getDailyCounts(range)).map((row) => row.totalEvents)).toEqual([2]);
  });
});


describe.skipIf(!harness.reachable)('SSO bounce attribution', () => {
  it('excludes EVE login bounces from referrals consistently', async () => {
    const range = { from: new Date('2023-01-01'), to: new Date('2023-01-02') };
    await harness.db.insert(usageLogs).values([
      { timestamp: range.from, action: 'page_view', metadata: { referrer: 'login.eveonline.com' } },
      { timestamp: range.from, action: 'page_view', metadata: { referrer: 'google.com' } },
      { timestamp: range.from, action: 'page_view', metadata: {} },
    ]);
    expect(await getTopReferrers(range)).toEqual([{ host: 'google.com', count: 1 }]);
    expect(await getSearchVsDirect(range)).toEqual({ referred: 1, direct: 2 });
    expect(await getTrafficTotals(range)).toEqual({ pageViews: 3, referrals: 1, entries: 0 });
  });
});
