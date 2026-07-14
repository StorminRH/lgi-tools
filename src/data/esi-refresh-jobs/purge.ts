import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
import { esiRefreshJobs } from './schema';

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
