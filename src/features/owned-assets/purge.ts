import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/platform/purge/types';
import { ownedAssets, ownedAssetSyncs } from './schema';

export const ownedAssetsPurgeContributor: PurgeContributor = {
  name: 'owned-assets',
  tier: 'cache',
  claims: [ownedAssets, ownedAssetSyncs],
  async purgeCharacter({ characterId }) {
    await db
      .delete(ownedAssets)
      .where(and(eq(ownedAssets.ownerType, 'character'), eq(ownedAssets.ownerId, characterId)));
    await db
      .delete(ownedAssetSyncs)
      .where(
        and(eq(ownedAssetSyncs.ownerType, 'character'), eq(ownedAssetSyncs.ownerId, characterId)),
      );
  },
};
