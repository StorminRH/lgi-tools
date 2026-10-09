import { describe, expect, it } from 'vitest';
import { createDbTestHarness, seedEveAccount, seedUser } from '@/db/__tests__/support/db-test-harness';
import { pendingDeletions } from './deletion-schema';
import { readRequestedDeletions } from './purge';

const harness = await createDbTestHarness({
  schema: 'test_auth_purge_requests',
  tables: ['user', 'account', 'pending_deletions'],
  steerDbProxy: true,
});

describe.skipIf(!harness.reachable)('requested deletion discovery (real Postgres)', () => {
  it('lists unqueued account deletions oldest first, then character deletions outside them', async () => {
    const oldest = new Date('2026-01-01T00:00:00.000Z');
    const older = new Date('2026-01-02T00:00:00.000Z');
    const newer = new Date('2026-01-03T00:00:00.000Z');

    await seedUser(harness.db, 'leaving-newer', { deletionRequestedAt: newer });
    await seedUser(harness.db, 'leaving-older', { deletionRequestedAt: older });
    await seedEveAccount(harness.db, { id: 'inside-link', characterId: 90000032, userId: 'leaving-older' }, { deletionRequestedAt: oldest });
    await seedUser(harness.db, 'staying');
    await seedEveAccount(harness.db, { id: 'unlinking', characterId: 90000031, userId: 'staying' }, { deletionRequestedAt: oldest });
    await seedEveAccount(harness.db, { id: 'kept-link', characterId: 90000033, userId: 'staying' });
    await seedUser(harness.db, 'leaving-enqueued', { deletionRequestedAt: oldest });
    await seedUser(harness.db, 'unlinking-enqueued');
    await seedEveAccount(harness.db, { id: 'enqueued-link', characterId: 90000034, userId: 'unlinking-enqueued' }, { deletionRequestedAt: oldest });
    await harness.db.insert(pendingDeletions).values([
      { userId: 'leaving-enqueued', scope: 'user', characterIds: [], requestedAt: oldest },
      { userId: 'unlinking-enqueued', scope: 'character', accountRowId: 'enqueued-link', characterId: 90000034, characterIds: [90000034], requestedAt: oldest },
    ]);

    await expect(readRequestedDeletions(20)).resolves.toEqual([
      { scope: 'user', userId: 'leaving-older', requestedAt: older },
      { scope: 'user', userId: 'leaving-newer', requestedAt: newer },
      { scope: 'character', userId: 'staying', characterId: 90000031, accountRowId: 'unlinking', requestedAt: oldest },
    ]);
    await expect(readRequestedDeletions(1)).resolves.toEqual([
      { scope: 'user', userId: 'leaving-older', requestedAt: older },
      { scope: 'character', userId: 'staying', characterId: 90000031, accountRowId: 'unlinking', requestedAt: oldest },
    ]);
  });
});
