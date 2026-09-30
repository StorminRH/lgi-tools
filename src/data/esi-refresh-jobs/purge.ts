import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiRefreshJobs } from './schema';

export const esiRefreshJobsPurgeContributor: PurgeContributor = {
  name: 'esi-refresh-jobs',
  tier: 'cache',
  claims: [esiRefreshJobs],
  merge: [
    {
      table: esiRefreshJobs,
      rule: 'discard',
      reason:
        'a regenerable retry queue whose live-status idempotency key embeds the user id; the survivor re-enqueues on its next budget miss',
    },
  ],
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
