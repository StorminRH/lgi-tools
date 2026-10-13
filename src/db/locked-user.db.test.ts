import { expect, test } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { lockUserRows } from './locked-user';

const harness = await createDbTestHarness({ schema: 'test_locked_user', tables: ['user'] });

const LOCK_NOT_AVAILABLE = '55P03';

/** Another connection's attempt to lock one user row without waiting. */
const tryLock = (id: string) => harness.sql`SELECT id FROM "user" WHERE id = ${id} FOR UPDATE NOWAIT`;

test.skipIf(!harness.reachable)('lockUserRows holds the existing users in id order until the transaction ends', async () => {
  const adminSince = new Date('2026-01-01T00:00:00Z');
  const userSince = new Date('2026-05-01T00:00:00Z');
  // Inserted out of id order so the result order comes from the lock query, not the heap.
  await seedUser(harness.db, 'user-c', { createdAt: adminSince, role: 'ADMIN' });
  await seedUser(harness.db, 'user-a', { createdAt: userSince });
  await seedUser(harness.db, 'user-b');

  await harness.db.transaction(async (tx) => {
    const locked = await lockUserRows(tx, ['user-c', 'missing', 'user-a']);
    expect(locked).toEqual([
      { id: 'user-a', createdAt: userSince, role: 'USER' },
      { id: 'user-c', createdAt: adminSince, role: 'ADMIN' },
    ]);
    await expect(tryLock('user-a')).rejects.toMatchObject({ code: LOCK_NOT_AVAILABLE });
    await expect(tryLock('user-c')).rejects.toMatchObject({ code: LOCK_NOT_AVAILABLE });
    await expect(tryLock('user-b')).resolves.toEqual([{ id: 'user-b' }]);
  });

  await expect(tryLock('user-a')).resolves.toEqual([{ id: 'user-a' }]);
});
