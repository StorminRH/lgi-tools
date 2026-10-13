import { expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { raceCappedCreates } from '@/db/__tests__/support/serializable-overlap';
import { MAX_SAVED_PLANS_PER_USER } from './api-contract';
import { emptyProfileDocument, MAX_PROFILES_PER_USER } from './profiles/profile-document';
import { createIndustryProfile } from './profiles/queries';
import { createSavedPlan } from './saved-plans-queries';
import { industryProfiles, savedPlans } from './schema';

vi.mock('@/db', async (importOriginal) => {
  const { routeRunSerializable } = await import('@/db/__tests__/support/serializable-overlap');
  return routeRunSerializable(await importOriginal<typeof import('@/db')>());
});

const harness = await createDbTestHarness({
  schema: 'test_industry_planner_cap_index',
  tables: ['saved_plans', 'industry_profiles'],
  steerDbProxy: true,
});

const plan = {
  name: 'Hulk',
  blueprintTypeId: 22548,
  productTypeId: 22544,
  productName: 'Hulk',
  snapshot: { v: 1 as const, blueprintTypeId: 22548, runs: 4 },
};
const profile = { name: 'Capitals', document: emptyProfileDocument() };
const landed = { status: 'fulfilled', value: true };
const rejectedForRetry = { status: 'rejected', reason: expect.objectContaining({ code: '40001' }) };

test.skipIf(!harness.reachable)(
  'once the planner counts saved plans through the user index, two accounts saving at once both land first time',
  async () => {
    const race = await raceCappedCreates(harness.sql, {
      table: 'saved_plans',
      cap: MAX_SAVED_PLANS_PER_USER,
      seed: (rows) => harness.db.insert(savedPlans).values(rows.map((row) => ({ ...plan, ...row }))).then(() => {}),
      create: (userId, id) => createSavedPlan(userId, { ...plan, id }),
    });

    expect(race.plan).toMatch(/Index (Only )?Scan using saved_plans_user_id_idx on saved_plans/);
    expect(race.plan).not.toContain('Seq Scan');
    expect(race.twoAccounts).toEqual([landed, landed]);
    expect(race.lastSlot).toEqual([landed, rejectedForRetry]);
    expect(race.lastSlotRows).toBe(MAX_SAVED_PLANS_PER_USER);
    expect(race.withoutIndex).toEqual([landed, rejectedForRetry]);
  },
);

test.skipIf(!harness.reachable)(
  'the live-profile index serves the profile cap, which counts only live rows, so two accounts creating at once both land first time',
  async () => {
    const race = await raceCappedCreates(harness.sql, {
      table: 'industry_profiles',
      cap: MAX_PROFILES_PER_USER,
      seed: (rows) =>
        harness.db.insert(industryProfiles).values(rows.map((row) => ({ ...profile, ...row }))).then(() => {}),
      create: (userId, id) => createIndustryProfile(userId, { ...profile, id }),
    });

    expect(race.plan).toMatch(/Index (Only )?Scan using industry_profiles_user_id_idx on industry_profiles/);
    expect(race.plan).not.toContain('Seq Scan');
    expect(race.twoAccounts).toEqual([landed, landed]);
    expect(race.lastSlot).toEqual([landed, rejectedForRetry]);
    expect(race.lastSlotRows).toBe(MAX_PROFILES_PER_USER);
    expect(race.withoutIndex).toEqual([landed, rejectedForRetry]);
  },
);
