import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiRefreshJobs } from './schema';

/**
 * Personal-data purge contributor for esi refresh jobs purge contributor; this data slice owns
 * deleting its user and character keyed rows.
 */
export const esiRefreshJobsPurgeContributor: PurgeContributor = {
  name: 'esi-refresh-jobs',
  tier: 'cache',
  claims: [esiRefreshJobs],
  async purgeCharacter({ userId, characterId }) {
    await db
      .delete(esiRefreshJobs)
      .where(
        and(
          eq(esiRefreshJobs.userId, userId),
          eq(esiRefreshJobs.ownerType, 'character'),
          eq(esiRefreshJobs.ownerId, characterId),
        ),
      );
  },
  async purgeUser({ userId }) {
    await db.delete(esiRefreshJobs).where(eq(esiRefreshJobs.userId, userId));
  },
};
