import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';

export const industryJobsPurgeContributor: PurgeContributor = {
  name: 'industry-jobs',
  tier: 'cache',
  claims: [
    characterIndustryJobs,
    characterIndustryJobSyncs,
    corpIndustryJobs,
    corpIndustryJobSyncs,
  ],
  async purgeCharacter({ characterId }) {
    await db
      .delete(characterIndustryJobs)
      .where(eq(characterIndustryJobs.characterId, characterId));
    await db
      .delete(characterIndustryJobSyncs)
      .where(eq(characterIndustryJobSyncs.characterId, characterId));
  },
  async purgeUser({ userId }) {
    await db.delete(corpIndustryJobs).where(eq(corpIndustryJobs.userId, userId));
    await db.delete(corpIndustryJobSyncs).where(eq(corpIndustryJobSyncs.userId, userId));
  },
};
