// Preferences purge contributor (ACCOUNT.1) — durable tier. user_preferences is
// app-authored, non-regenerable per-user data, so it's torn down last (after the
// regenerable caches), keyed by user.
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { userPreferences } from './schema';

export const preferencesPurgeContributor: PurgeContributor = {
  name: 'preferences',
  tier: 'durable',
  claims: [userPreferences],
  async purgeUser({ userId }) {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  },
};
