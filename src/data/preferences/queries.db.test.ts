import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { getPreferencesForUser, upsertPreference } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_preferences_queries',
  tables: ['user_preferences'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('upsertPreference executes against Postgres', () => {
  it('stores a cleared preference as JSON null, on insert and on update', async () => {
    await upsertPreference('user-1', 'planner.buildLocation', { systemId: 30000142 });
    await upsertPreference('user-1', 'planner.buildLocation', null);
    await upsertPreference('user-1', 'planner.other', null);

    const rows = await getPreferencesForUser('user-1');
    expect(rows.sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'planner.buildLocation', value: null },
      { key: 'planner.other', value: null },
    ]);
  });
});
