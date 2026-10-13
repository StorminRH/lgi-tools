import { expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { raceCappedCreates } from '@/db/__tests__/support/serializable-overlap';
import { MAX_CUSTOM_STRUCTURES_PER_USER } from './api-contract';
import { createCustomStructure } from './queries';
import { customStructures } from './schema';

vi.mock('@/db', async (importOriginal) => {
  const { routeRunSerializable } = await import('@/db/__tests__/support/serializable-overlap');
  return routeRunSerializable(await importOriginal<typeof import('@/db')>());
});

const harness = await createDbTestHarness({
  schema: 'test_custom_structures_cap_index',
  tables: ['custom_structures'],
  steerDbProxy: true,
});

const structure = { name: 'Azbel', structureTypeId: 35826, rigTypeIds: [], systemId: null, taxPct: null, bonuses: null };
const landed = { status: 'fulfilled', value: true };
const rejectedForRetry = { status: 'rejected', reason: expect.objectContaining({ code: '40001' }) };

test.skipIf(!harness.reachable)(
  'once the planner counts through the user index, two accounts saving at once both land first time and one account still gets one last slot',
  async () => {
    const race = await raceCappedCreates(harness.sql, {
      table: 'custom_structures',
      cap: MAX_CUSTOM_STRUCTURES_PER_USER,
      seed: (rows) => harness.db.insert(customStructures).values(rows.map((row) => ({ ...structure, ...row }))).then(() => {}),
      create: (userId, id) => createCustomStructure(userId, { ...structure, id }),
    });

    expect(race.plan).toMatch(/Index (Only )?Scan using custom_structures_user_id_idx on custom_structures/);
    expect(race.plan).not.toContain('Seq Scan');
    expect(race.twoAccounts).toEqual([landed, landed]);
    // Racing for its own last slot, one save lands and the other is rejected, for its retry to find the account full.
    expect(race.lastSlot).toEqual([landed, rejectedForRetry]);
    expect(race.lastSlotRows).toBe(MAX_CUSTOM_STRUCTURES_PER_USER);
    // Without the index the count reads the whole table, and the second account's save is rejected.
    expect(race.withoutIndex).toEqual([landed, rejectedForRetry]);
  },
);
