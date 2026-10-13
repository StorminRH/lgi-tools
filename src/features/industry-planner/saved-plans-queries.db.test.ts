import { expect, test } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { MAX_SAVED_PLANS_PER_USER } from './api-contract';
import { createSavedPlan, deleteSavedPlan, listSavedPlans } from './saved-plans-queries';
import { savedPlans } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_saved_plans_cap',
  tables: ['user', 'saved_plans'],
  foreignKeys: [
    { table: 'saved_plans', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const hulk = { v: 1 as const, blueprintTypeId: 22548, runs: 4 };
const plan = (id: string) => ({
  id,
  name: `Plan ${id}`,
  blueprintTypeId: 22548,
  productTypeId: 22544,
  productName: 'Hulk',
  snapshot: hulk,
});

test.skipIf(!harness.reachable)(
  'concurrent saves at one below the cap admit exactly one plan per account, and a delete frees the slot again',
  async () => {
    await seedUser(harness.db, 'owner');
    await seedUser(harness.db, 'other');
    await harness.db.insert(savedPlans).values(
      ['owner', 'other'].flatMap((userId) =>
        Array.from({ length: MAX_SAVED_PLANS_PER_USER - 1 }, (_, i) => ({ ...plan(`${userId}-${i}`), userId })),
      ),
    );

    const results = await Promise.all(['owner', 'other'].map(async (userId) => ({
      userId,
      attempts: await Promise.all(
        Array.from({ length: 4 }, (_, i) => createSavedPlan(userId, plan(`${userId}-contender-${i}`))),
      ),
    })));

    for (const { userId, attempts } of results) {
      expect(attempts.filter(Boolean)).toHaveLength(1);
      const plans = await listSavedPlans(userId);
      expect(plans).toHaveLength(MAX_SAVED_PLANS_PER_USER);
      const [admitted] = plans.filter((p) => p.id.startsWith(`${userId}-contender-`));
      // The admitted row keeps every value it was given and takes the column defaults.
      expect(admitted).toMatchObject({
        name: expect.stringMatching(/^Plan /),
        favorite: false,
        blueprintTypeId: 22548,
        productTypeId: 22544,
        productName: 'Hulk',
        snapshot: hulk,
      });
    }

    expect(await createSavedPlan('owner', plan('overflow'))).toBe(false);
    await deleteSavedPlan('owner', 'owner-0');
    expect(await createSavedPlan('owner', plan('replacement'))).toBe(true);
    expect(await harness.db.select().from(savedPlans)).toHaveLength(2 * MAX_SAVED_PLANS_PER_USER);
  },
);
