// Industry-jobs purge contributor (ACCOUNT.1) — cache tier. Two axes: the personal
// job board is character-keyed (purgeCharacter); the corp job board is per-(user,
// corp) and private to the user, so its teardown is user-keyed (purgeUser). Both
// are regenerable ESI mirrors.
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import {
  characterIndustryJobs,
  characterIndustryJobSyncs,
  corpIndustryJobs,
  corpIndustryJobSyncs,
} from './schema';

/**
 * Personal-data purge contributor for industry jobs purge contributor; this data slice owns
 * deleting its user and character keyed rows.
 */
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
