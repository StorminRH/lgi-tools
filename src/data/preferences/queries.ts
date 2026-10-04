import { eq, sql } from 'drizzle-orm';
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
  // A cleared preference is stored as JSON null; Drizzle would bind a bare null
  // as SQL NULL, which the NOT NULL column rejects.
  const stored = value === null ? sql`'null'::jsonb` : value;
  await db
    .insert(userPreferences)
    .values({ userId, key, value: stored, updatedAt: now })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value: stored, updatedAt: now },
    });
}
