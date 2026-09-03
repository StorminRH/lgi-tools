import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { ownedBlueprints, ownedBlueprintSyncs } from './schema';

export const ownedBlueprintsPurgeContributor: PurgeContributor = {
  name: 'owned-blueprints',
  tier: 'cache',
  claims: [ownedBlueprints, ownedBlueprintSyncs],
  async purgeCharacter({ characterId }) {
    await db
      .delete(ownedBlueprints)
      .where(
        and(eq(ownedBlueprints.ownerType, 'character'), eq(ownedBlueprints.ownerId, characterId)),
      );
    await db
      .delete(ownedBlueprintSyncs)
      .where(
        and(
          eq(ownedBlueprintSyncs.ownerType, 'character'),
          eq(ownedBlueprintSyncs.ownerId, characterId),
        ),
      );
  },
};
