import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { savedPlans } from './schema';

export const savedPlansPurgeContributor: PurgeContributor = {
  name: 'saved-plans',
  tier: 'durable',
  claims: [savedPlans],
  async purgeUser({ userId }) {
    await db.delete(savedPlans).where(eq(savedPlans.userId, userId));
  },
};
