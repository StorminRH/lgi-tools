import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { industryProfiles, savedPlans } from './schema';

export const savedPlansPurgeContributor: PurgeContributor = {
  name: 'saved-plans',
  tier: 'durable',
  claims: [savedPlans],
  merge: [{ table: savedPlans, rule: 'rekey' }],
  async purgeUser({ userId }) {
    await db.delete(savedPlans).where(eq(savedPlans.userId, userId));
  },
};

// Members that are unlinked stay on the profile as unresolved references, the
// same way a saved plan keeps its build character, so no purgeCharacter hook.
export const industryProfilesPurgeContributor: PurgeContributor = {
  name: 'industry-profiles',
  tier: 'durable',
  claims: [industryProfiles],
  merge: [{ table: industryProfiles, rule: 'rekey' }],
  async purgeUser({ userId }) {
    await db.delete(industryProfiles).where(eq(industryProfiles.userId, userId));
  },
};
