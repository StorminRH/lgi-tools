import { eq, sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { account, characters } from '@/db/auth-schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import {
  acknowledgeAuthorizationAccessChange,
  claimAuthorization,
  hasAuthorizationWork,
  listAuthorizationAccessChanges,
  listDueAuthorizations,
  suspendOverdueAuthorizations,
} from './authorization-store';

const harness = await createDbTestHarness({
  schema: 'test_authorization_store',
  tables: ['user', 'account', 'characters'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

test.skipIf(!harness.reachable)('leases microsecond due timestamps once and preserves newer access changes and disconnected data', async () => {
  await seedUser(harness.db, 'owner');
  await seedCharacter(harness.db, 42, { corporationId: 990, name: 'Alice' });
  await seedEveAccount(harness.db, { id: 'alice', characterId: 42, userId: 'owner' }, {
    refreshToken: 'retained-refresh',
    authorizationNextCheckAt: new Date('2026-01-01T00:00:00Z'),
    authorizationFailureFirstAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
  });
  // Postgres retains microseconds that a JS Date cannot represent. Claiming must
  // compare against the due deadline, not round-trip an exact timestamp match.
  await harness.db.update(account).set({
    authorizationNextCheckAt: sql`timestamp '2026-01-01 00:00:00.000123'`,
  }).where(eq(account.id, 'alice'));
  expect(await hasAuthorizationWork('owner')).toBe(true);
  const due = await listDueAuthorizations('owner');
  expect(due.map((row) => row.id)).toEqual(['alice']);
  const claims = await Promise.all([claimAuthorization('alice'), claimAuthorization('alice')]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await listDueAuthorizations('owner')).toEqual([]);

  await suspendOverdueAuthorizations('owner');
  const pending = await listAuthorizationAccessChanges('owner');
  expect(pending).toHaveLength(1);
  const firstChange = pending[0]!.changedAt!;
  const newerChange = new Date(firstChange.getTime() + 1000);
  await harness.db.update(account).set({ authorizationAccessChangedAt: newerChange })
    .where(eq(account.id, 'alice'));
  await acknowledgeAuthorizationAccessChange('alice', firstChange);
  expect(await listAuthorizationAccessChanges('owner')).toEqual([
    { id: 'alice', characterId: '42', changedAt: newerChange },
  ]);
  await acknowledgeAuthorizationAccessChange('alice', newerChange);
  expect(await listAuthorizationAccessChanges('owner')).toEqual([]);

  const [storedAccount] = await harness.db.select().from(account).where(eq(account.id, 'alice'));
  expect(storedAccount).toMatchObject({
    userId: 'owner', refreshToken: 'retained-refresh', authorizationSuspended: true,
  });
  const [storedCharacter] = await harness.db.select().from(characters).where(eq(characters.characterId, 42));
  expect(storedCharacter).toMatchObject({ name: 'Alice', corporationId: 990 });
  // A suspended row is no longer repeatedly scheduled as newly overdue.
  expect(await hasAuthorizationWork('owner')).toBe(false);
});
