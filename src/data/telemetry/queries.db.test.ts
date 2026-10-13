import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { account, characters, user } from '@/db/auth-schema';
import {
  getLoginCountsPerUser,
  getRoleChangeAudit,
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
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

const cases: QueryCase[] = [
  { name: 'getLoginCountsPerUser', run: () => getLoginCountsPerUser(RANGE), check: expectNonEmptyArray },
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
      { action: 'auth_login', characterId: CHAR_OLD, timestamp: IN_RANGE, metadata: {} },
      {
        action: 'market_price_refresh',
        characterId: null,
        timestamp: IN_RANGE,
        metadata: { requested: 10, returned: 9, esiCount: 6, fuzzworkFallbackCount: 1 },
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
});

describe.skipIf(!harness.reachable)('role change audit', () => {
  it('lists the newest changes first, up to the limit, naming the actor and the target', async () => {
    // Its own pilots, so the read does not depend on the seed above having run first.
    const ACTOR = 91_000_011;
    const TARGET = 91_000_012;
    await harness.db.insert(characters).values([
      { characterId: ACTOR, name: 'Audit Actor', portraitUrl: '' },
      { characterId: TARGET, name: 'Audit Target', portraitUrl: '' },
    ]);
    const range = { from: new Date('2024-03-01T00:00:00Z'), to: new Date('2024-03-08T00:00:00Z') };
    const days = ['2024-03-02', '2024-03-06', '2024-03-04', '2024-03-08', '2024-02-29'];
    await harness.db.insert(usageLogs).values(
      days.map((day, i) => ({
        action: 'role_change',
        characterId: ACTOR,
        timestamp: new Date(`${day}T12:00:00Z`),
        metadata: { actorCharacterId: ACTOR, targetCharacterId: TARGET, from: 'USER', to: i % 2 === 0 ? 'ADMIN' : 'USER' },
      })),
    );
    const audit = await getRoleChangeAudit(range, 2);
    expect(audit.map((row) => row.timestamp.toISOString())).toEqual([
      '2024-03-06T12:00:00.000Z',
      '2024-03-04T12:00:00.000Z',
    ]);
    expect(audit[0]).toMatchObject({ actorName: 'Audit Actor', targetName: 'Audit Target', from: 'USER', to: 'USER' });
  });
});
