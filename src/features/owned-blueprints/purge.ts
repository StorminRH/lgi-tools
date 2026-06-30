// Owned-blueprints purge contributor (ACCOUNT.1) — cache tier. Same polymorphic
// owner_id as owned-assets: a PERSONAL purge deletes ONLY the owner_type='character'
// rows for this character, never the corp-shared rows. Regenerable ESI mirror.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
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
