import { expect, test } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { MAX_CUSTOM_STRUCTURES_PER_USER } from './api-contract';
import { createCustomStructure, deleteCustomStructure, listCustomStructures } from './queries';
import { customStructures } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_custom_structures_cap',
  tables: ['user', 'custom_structures'],
  foreignKeys: [
    { table: 'custom_structures', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const rigged = {
  id: 'rigged',
  name: 'Home Azbel',
  structureTypeId: 35826,
  rigTypeIds: [37170, 37171],
  systemId: null,
  taxPct: 1.25,
  bonuses: null,
};
const entered = {
  id: 'entered',
  name: 'Market Sotiyo',
  structureTypeId: 35827,
  rigTypeIds: [],
  systemId: 30000142,
  taxPct: null,
  bonuses: { manufacturing: { me: 3.38, te: 39.2, cost: 4 }, reactions: { me: 0, te: 0 } },
};

test.skipIf(!harness.reachable)(
  'a structure keeps every value it was saved with, and concurrent saves at one below the cap admit exactly one',
  async () => {
    await seedUser(harness.db, 'owner');
    expect(await createCustomStructure('owner', rigged)).toBe(true);
    expect(await createCustomStructure('owner', entered)).toBe(true);
    expect(await listCustomStructures('owner')).toEqual([rigged, entered]);
    // A missing bonus is SQL NULL, not a JSON null.
    expect(await harness.sql`select id from custom_structures where bonuses is null`).toEqual([{ id: 'rigged' }]);

    await harness.db.insert(customStructures).values(
      Array.from({ length: MAX_CUSTOM_STRUCTURES_PER_USER - 3 }, (_, i) => ({
        ...rigged,
        id: `filler-${i}`,
        userId: 'owner',
      })),
    );
    const attempts = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createCustomStructure('owner', { ...rigged, id: `contender-${i}` })),
    );
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(await listCustomStructures('owner')).toHaveLength(MAX_CUSTOM_STRUCTURES_PER_USER);

    await deleteCustomStructure('owner', 'filler-0');
    expect(await createCustomStructure('owner', { ...rigged, id: 'replacement' })).toBe(true);
    expect(await createCustomStructure('owner', { ...rigged, id: 'overflow' })).toBe(false);
  },
);
