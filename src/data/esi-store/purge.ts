import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiResponses } from './schema';

/**
 * Character rows leave with the character and `user_id` rows (the per-user
 * corp jobs keys) with the user. Corporation rows carry no user, like the
 * corp sync tables today, and stay for the next member who holds the role.
 * On a merge the survivor's rows win and the rest are rekeyed.
 */
export const esiStorePurgeContributor: PurgeContributor = {
  name: 'esi-store',
  tier: 'cache',
  claims: [esiResponses],
  merge: [
    {
      table: esiResponses,
      rule: 'survivor-wins',
      key: [esiResponses.route, esiResponses.holderType, esiResponses.holderId, esiResponses.params],
    },
  ],
  async purgeCharacter({ characterId }) {
    await db
      .delete(esiResponses)
      .where(and(eq(esiResponses.holderType, 'character'), eq(esiResponses.holderId, characterId)));
  },
  async purgeUser({ userId }) {
    await db.delete(esiResponses).where(eq(esiResponses.userId, userId));
  },
};
