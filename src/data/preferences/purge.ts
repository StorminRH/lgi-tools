import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { userPreferences } from './schema';

export const preferencesPurgeContributor: PurgeContributor = {
  name: 'preferences',
  tier: 'durable',
  claims: [userPreferences],
  async purgeUser({ userId }) {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  },
};
