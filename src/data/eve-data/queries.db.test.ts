import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { getBlueprintActivities } from './queries';
import { industryBlueprints } from './schema';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

// Runs getBlueprintActivities against the local Docker Postgres so the parse is
// proven end-to-end against the REAL stored JSONB shape (round-tripped through
// the jsonb column), not just a hand-built object. Skips cleanly when no DB is
// reachable (CI has no Postgres). The throwaway schema is dropped in afterAll.

const harness = await createDbTestHarness({
  schema: 'test_eve_activities',
  tables: ['industry_blueprints'],
  steerDbProxy: true,
});

describe.skipIf(!harness.reachable)('getBlueprintActivities executes against Postgres', () => {
  beforeAll(async () => {
    await harness.db
      .insert(industryBlueprints)
      .values([
        { blueprintTypeId: 681, maxProductionLimit: 1, activities: MFG_681 },
        { blueprintTypeId: 683, maxProductionLimit: 1, activities: INV_683 },
        { blueprintTypeId: 46175, maxProductionLimit: 1, activities: RXN_46175 },
      ]);
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
