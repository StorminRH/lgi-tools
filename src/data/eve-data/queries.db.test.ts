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
import { getBlueprintActivities } from './queries';
import { industryBlueprints } from './schema';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

// Runs getBlueprintActivities against the local Docker Postgres so the parse is
// proven end-to-end against the REAL stored JSONB shape (round-tripped through
// the jsonb column), not just a hand-built object. Skips cleanly when no DB is
// reachable (CI has no Postgres). The throwaway schema is dropped in afterAll.

const SCHEMA = 'test_eve_activities';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

describe.skipIf(!reachable)('getBlueprintActivities executes against Postgres', () => {
  let adminClient: ReturnType<typeof postgres>;

  beforeAll(async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 1, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, ['industry_blueprints']);

    await drizzlePg(adminClient)
      .insert(industryBlueprints)
      .values([
        { blueprintTypeId: 681, maxProductionLimit: 1, activities: MFG_681 },
        { blueprintTypeId: 683, maxProductionLimit: 1, activities: INV_683 },
        { blueprintTypeId: 46175, maxProductionLimit: 1, activities: RXN_46175 },
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

  it('reads invention probability, datacores, and skills from the stored blob', async () => {
    const map = await getBlueprintActivities([681, 683, 46175]);
    expect(map.size).toBe(3);

    const inv = map.get(683)?.find((a) => a.name === 'invention');
    expect(inv?.activityId).toBe(8);
    expect(inv?.time).toBe(63900);
    expect(inv?.products).toEqual([{ typeId: 39581, quantity: 1, probability: 0.3 }]);
    expect(inv?.materials).toEqual([
      { typeId: 20416, quantity: 2 },
      { typeId: 25887, quantity: 2 },
    ]);
    expect(inv?.skills).toEqual([
      { typeId: 11442, level: 1 },
      { typeId: 11454, level: 1 },
      { typeId: 21790, level: 1 },
    ]);
  });

  it('leaves probability absent on non-invention products', async () => {
    const map = await getBlueprintActivities([681, 683, 46175]);

    const rxn = map.get(46175)?.find((a) => a.name === 'reaction');
    expect(rxn?.activityId).toBe(11);
    expect(rxn?.products[0]?.probability).toBeUndefined();

    const mfg681 = map.get(681)?.find((a) => a.name === 'manufacturing');
    expect(mfg681?.products[0]?.probability).toBeUndefined();
    expect(map.get(681)?.find((a) => a.name === 'invention')).toBeUndefined();
  });

  it('returns an empty map for no ids', async () => {
    expect((await getBlueprintActivities([])).size).toBe(0);
  });
});
