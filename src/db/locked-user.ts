import { asc, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { AnyPgDb } from '@/lib/db-types';
import { user } from './auth-schema';
import { directClient, resolveLockConnectionUrl } from './index';

export async function withLockedUsers<T>(
  userIds: string[],
  change: (database: AnyPgDb) => Promise<T>,
): Promise<T> {
  resolveLockConnectionUrl();
  return drizzle(directClient).transaction(async (tx) => {
    // Account inserts take an FK key-share lock: lock first, then read a fresh snapshot.
    await tx.select({ id: user.id }).from(user).where(inArray(user.id, userIds))
      .orderBy(asc(user.id)).for('update');
    return change(tx);
  });
}
