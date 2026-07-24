import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userPreferences } from './schema';

// Per-user preference reads/writes. Values are already validated by the route
// (validatePreferenceValue against the owning key's schema), so these accept
// already-typed inputs — the validation-in-route invariant.

/**
 * Every saved preference for a user. The provider reconciles these against the
 * browser's localStorage on login (server wins; see reconcilePreferences).
 */
export async function getPreferencesForUser(
  userId: string,
): Promise<{ key: string; value: unknown }[]> {
  return db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
}

/**
 * Insert on first write, overwrite on every subsequent one (last-write-wins
 * across the user's devices). A null value (e.g. a cleared build location) is
 * stored as JSON null rather than deleting the row — the key's schema accepts it.
 */
export async function upsertPreference(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const now = new Date();
  await db
    .insert(userPreferences)
    .values({ userId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt: now },
    });
}
