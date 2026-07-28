import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { mapAccess, maps } from './schema';

/**
 * Credential-tier teardown for durable map access. Character transfer destroys direct grants
 * before the character can resolve under a new human; whole-user purge deletes owned maps and
 * their cascading grants.
 */
export const mapsPurgeContributor: PurgeContributor = {
  name: 'maps',
  tier: 'credential',
  claims: [maps, mapAccess],
  async purgeCharacter({ characterId }) {
    await db
      .delete(mapAccess)
      .where(
        and(
          eq(mapAccess.ownerType, 'character'),
          eq(mapAccess.ownerId, characterId),
        ),
      );
  },
  async purgeUser({ userId }) {
    await db.delete(maps).where(eq(maps.userId, userId));
  },
};
