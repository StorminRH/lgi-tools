import { asc, inArray } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import { user } from './auth-schema';
import { directDatabase } from './direct-database';

/**
 * Lock user rows FOR UPDATE on the caller's transaction before identity moves.
 * Take it first: account inserts take an FK key-share lock, so lock, then read
 * a fresh snapshot. Rows lock in id order so concurrent multi-user locks cannot
 * deadlock. Ids with no user row are absent from the result.
 */
export async function lockUserRows(
  tx: AnyPgDb,
  userIds: readonly string[],
): Promise<Pick<typeof user.$inferSelect, 'id' | 'createdAt' | 'role'>[]> {
  return tx.select({ id: user.id, createdAt: user.createdAt, role: user.role })
    .from(user).where(inArray(user.id, userIds))
    .orderBy(asc(user.id)).for('update');
}

export async function withLockedUsers<T>(
  userIds: string[],
  change: (database: AnyPgDb) => Promise<T>,
): Promise<T> {
  return directDatabase().transaction(async (tx) => {
    await lockUserRows(tx, userIds);
    return change(tx);
  });
}
