import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userPreferences } from './schema';

export async function getPreferencesForUser(
  userId: string,
): Promise<{ key: string; value: unknown }[]> {
  return db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
}

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
