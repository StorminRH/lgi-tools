import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { esiResponses } from './schema';

/**
 * Character rows leave with the character and `user_id` rows (the per-user
 * corp jobs keys, and a member's own refusal of a corporation's shared
 * answer) with the user. Corporation rows carry no user, like the corp sync
 * tables today, and stay for the next member who holds the role. On a merge
 * the source's `user_id` rows are dropped rather than rekeyed: the corp jobs
 * pair keeps the survivor's snapshot and drops the source's, and an ETag
 * moved onto the survivor would vouch for rows it never kept. The cost is
 * one 200 per corporation at the survivor's next view, and one more ask for
 * each refusal the source held.
 */
export const esiStorePurgeContributor: PurgeContributor = {
  name: 'esi-store',
  tier: 'cache',
  claims: [esiResponses],
  merge: [
    {
      table: esiResponses,
      rule: 'discard',
      reason: 'a stored answer must stay paired with the rows it vouches for, and the corp jobs pair drops the source\'s',
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
