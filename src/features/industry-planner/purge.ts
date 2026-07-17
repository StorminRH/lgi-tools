// Saved-plans purge contributor (3.7.23.1) — durable tier. App-authored,
// non-regenerable per-user build templates; torn down with the user.
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { savedPlans } from './schema';

/**
 * Personal-data purge contributor for saved plans purge contributor; this data slice owns deleting
 * its user and character keyed rows.
 */
export const savedPlansPurgeContributor: PurgeContributor = {
  name: 'saved-plans',
  tier: 'durable',
  claims: [savedPlans],
  async purgeUser({ userId }) {
    await db.delete(savedPlans).where(eq(savedPlans.userId, userId));
  },
};
