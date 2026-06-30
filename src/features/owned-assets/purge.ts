// Owned-assets purge contributor (ACCOUNT.1) — cache tier. The owner_id column is
// polymorphic (character | corporation), so a PERSONAL purge deletes ONLY the
// owner_type='character' rows for this character — the same column also holds
// corp-shared rows a personal purge must never touch. Regenerable ESI mirror.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import type { PurgeContributor } from '@/purge/types';
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
